/**
 * Cardstack MCP App server (M1 tool surface, read paths).
 * SEP-1865 mechanics via @modelcontextprotocol/ext-apps — resource mimeType and
 * _meta shapes come from the shipped SDK, per CLAUDE.md rule 7.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {
  applyDenylist,
  buildCapabilities,
  genericLayoutConfig,
  primaryNameField,
  recordCardFieldPaths,
  filterRecord,
  isDenied,
  summarizeCustomFilters,
  defaultUserContext,
  resolveActionInputs,
  startFlowInterview,
  continueFlowInterview,
  encodeInterviewState,
  analyzeFlowSupport,
  decodeQuickActionState,
  encodeQuickActionState,
  quickActionLayoutFields,
  quickActionMissingRequired,
  quickActionPendingWrite,
  quickActionScreen,
  type QuickActionState,
  type FlowAnswerValue,
  type FlowDefResolver,
  type FlowRuntimeEffects,
  type FlowStepResult,
  type ActionInvocationContext,
  type CardAction,
  type CrmFieldValue,
  type ErrorPayload,
  type FieldFilter,
  type FieldWriteResult,
  type HomeListTile,
  type LayoutConfig,
  type LookupOptionsPayload,
  type RecordPage,
  type SearchQuery,
  type UpdatePreviewPayload,
  type UserContext,
  type WriteConfirmation,
  type WriteReceiptPayload,
} from "@cardstack/core";
import { scopeViewExposuresForUser } from "@cardstack/config-store";
import {
  CrmAuthError,
  CrmRateLimitError,
  CrmRecordNotFoundError,
  CrmValidationError,
  type CrmAdapter,
} from "@cardstack/crm-adapters";
import { getWidgetHtml, type WidgetName } from "@cardstack/widgets";
import type { ConfigStore } from "./config/store.js";
import type { PreferenceStore } from "./config/preferences.js";
import type { AuditLog } from "./audit.js";
import { mintConfirmToken, signState, verifyConfirmToken, verifyState } from "./confirm-token.js";
import {
  describeExposedViews,
  resolveViewAsk,
  OBJECT_SYNONYMS,
  type ExposedView,
} from "./views.js";
import {
  buildRecordCardPayload,
  buildResultsTablePayload,
  buildFlowRunPayload,
  fieldNotes,
  provenanceFor,
} from "./payloads.js";

export interface ServerDeps {
  adapter: CrmAdapter;
  configStore: ConfigStore;
  /** Shared across requests (durable state); the MCP server itself stays stateless. */
  auditLog: AuditLog;
  /** Remembered ambiguous-ask choices (design 5b). Shared like the audit log. */
  preferences: PreferenceStore;
  /** M1: single-tenant. OAuth 2.1 token → tenant resolution lands in M7. */
  tenantId: string;
  /** Authenticated app user. Defaults to the demo rep for scripts/tests. */
  userContext?: UserContext;
  /** Runtime auth gate for CRMs that need the product user's own OAuth token. */
  runtimeAuth?: {
    missingUserAuth?: boolean;
    crmLabel: string;
    connectUrl?: string;
  };
}

const RECORD_CARD_URI = "ui://cardstack/record-card";
const RESULTS_TABLE_URI = "ui://cardstack/results-table";
const HOME_CARD_URI = "ui://cardstack/home-card";
const FLOW_RUN_URI = "ui://cardstack/flow-run";

/**
 * Async because the exposed-view list is resolved up front (home card tiles).
 * Tool descriptions stay STATIC — clients cache them at load, so anything
 * dynamic (which views exist) belongs in responses/errors, never descriptions.
 */
export async function createCardstackServer(deps: ServerDeps): Promise<McpServer> {
  const server = new McpServer({ name: "Cardstack CRM", version: "0.0.1" });
  const { adapter, configStore, auditLog, preferences, tenantId } = deps;
  const userContext = deps.userContext ?? defaultUserContext(tenantId);

  // Connection gate: a disconnected tenant is an empty canvas — every tool
  // refuses until an admin reconnects in Studio (feedback 2026-07-11).
  const requireConnection = async (): Promise<void> => {
    const connection = await configStore.getConnection(tenantId);
    if (connection.status !== "connected") {
      throw new Error(
        "No CRM is connected for this workspace. An admin can connect one in Cardstack Studio → Connections.",
      );
    }
    if (deps.runtimeAuth?.missingUserAuth) {
      throw new CrmAuthError(
        deps.runtimeAuth.crmLabel,
        `Connect your ${deps.runtimeAuth.crmLabel} account to use Cardstack with your own records and list views.` +
          (deps.runtimeAuth.connectUrl ? ` Open ${deps.runtimeAuth.connectUrl}` : ""),
      );
    }
  };

  const exposedViewsFor = async (object: string): Promise<ExposedView[]> => {
    const fullConfig = await configStore.getViewExposuresConfig(tenantId, object);
    const scopedConfig = fullConfig ? scopeViewExposuresForUser(fullConfig, userContext) : null;
    const exposures = scopedConfig?.views.filter((view) => view.exposed) ?? [];
    const savedViews = await adapter.listSavedViews(object);
    const byId = new Map(savedViews.map((v) => [v.id, v]));
    const customs = new Map((scopedConfig?.customLists ?? []).map((c) => [c.id, c]));
    return exposures.flatMap((exposure) => {
      const custom = customs.get(exposure.viewId);
      if (custom) {
        // Cardstack custom list: filters live in the config, not the CRM.
        return [
          {
            exposure,
            custom,
            view: {
              id: custom.id,
              object,
              name: custom.name,
              filterSummary: summarizeCustomFilters(custom),
              visibility: "shared" as const,
            },
          },
        ];
      }
      const view = byId.get(exposure.viewId);
      // Drift (view deleted CRM-side) falls out here; Studio surfaces it in M3.
      return view ? [{ exposure, view }] : [];
    });
  };

  /** Rows for an exposed view — CRM views via the adapter's saved-view API, custom lists via search.
   *  `columns` (the layout's list columns) restricts the fetch to what renders. */
  const rowsForView = async (
    entry: ExposedView,
    cursor?: string,
    columns?: string[],
  ): Promise<RecordPage> => {
    if (entry.custom) {
      return adapter.search(entry.view.object, {
        ...(entry.custom.filters.length > 0 ? { filters: entry.custom.filters } : {}),
        ...(entry.custom.sort ? { sort: entry.custom.sort } : {}),
        ...(columns?.length ? { columns } : {}),
        ...(cursor ? { cursor } : {}),
      });
    }
    return adapter.getViewRows(entry.view.id, cursor, columns);
  };

  // Resilience: one object's unreadable exposures (e.g. a config written by a
  // newer schema than this process knows) must degrade THAT object's views, not
  // 502 every tool by throwing out of server creation.
  const allExposedViews: ExposedView[] = deps.runtimeAuth?.missingUserAuth
    ? []
    : (
        await Promise.all(
          (await configStore.listConfiguredObjects(tenantId)).map((o) =>
            exposedViewsFor(o).catch((error) => {
              console.error(`exposedViewsFor(${o}) failed; skipping its views:`, error);
              return [] as ExposedView[];
            }),
          ),
        )
      ).flat();

  // Chat-language object resolution: a model asking for "deals" in a
  // Salesforce workspace (or "opportunities" in a HubSpot one) resolves to
  // whatever IS configured instead of erroring. Matching is against
  // configured objects only — never invents an object.
  const resolveObjectName = (requested: string | undefined, configured: string[]): string | undefined => {
    if (!requested) return configured[0]; // omitted → workspace default
    const lower = requested.toLowerCase();
    const ci = configured.find((o) => o.toLowerCase() === lower);
    if (ci) return ci;
    const group = OBJECT_SYNONYMS.find((g) => g.includes(lower));
    return group && configured.find((o) => group.includes(o.toLowerCase()));
  };

  /**
   * Concept args → concrete FieldFilters via the describe's semantic hints
   * (never hardcoded field names) — shared by crm_search and crm_aggregate.
   */
  const semanticFilters = (
    describe: Awaited<ReturnType<CrmAdapter["describeObject"]>>,
    args: {
      stage?: string;
      openOnly?: boolean;
      owner?: string;
      minAmount?: number;
      maxAmount?: number;
      closingAfter?: string;
      closingBefore?: string;
    },
  ): FieldFilter[] => {
    const byApi = new Map(describe.fields.map((f) => [f.api, f]));
    const { stageField, amountField, ownerField, closeDateField } = describe;
    const stageMeta = stageField ? byApi.get(stageField) : undefined;
    // Map a stage label to its internal value (case-insensitive), so a model
    // passing "Discovery" or "Closed won · EU" matches real ids.
    const resolveStageValue = (input: string): string => {
      const labels = stageMeta?.valueLabels ?? {};
      const hit = Object.entries(labels).find(
        ([, label]) => label.toLowerCase() === input.toLowerCase(),
      );
      return hit ? hit[0] : input;
    };
    // Reverse an owner name to an owner id via the owner field's valueLabels.
    const resolveOwnerValue = (input: string): string => {
      const labels = (ownerField ? byApi.get(ownerField)?.valueLabels : undefined) ?? {};
      const hit = Object.entries(labels).find(
        ([, label]) => label.toLowerCase() === input.toLowerCase(),
      );
      return hit ? hit[0] : input;
    };

    const filters: FieldFilter[] = [];
    if (args.stage && stageField) {
      filters.push({ field: stageField, op: "eq", value: resolveStageValue(args.stage) });
    }
    if (args.openOnly && stageField) {
      // Exclude the actual closed stage ids (from describe), not label guesses.
      const closed = stageMeta?.closedValues ?? [];
      if (closed.length > 0) {
        filters.push({ field: stageField, op: "not_in", values: closed });
      }
    }
    if (args.owner && ownerField) {
      filters.push({ field: ownerField, op: "eq", value: resolveOwnerValue(args.owner) });
    }
    if (args.minAmount !== undefined && amountField) {
      filters.push({ field: amountField, op: "gte", value: args.minAmount });
    }
    if (args.maxAmount !== undefined && amountField) {
      filters.push({ field: amountField, op: "lte", value: args.maxAmount });
    }
    if (args.closingAfter && closeDateField) {
      filters.push({ field: closeDateField, op: "gte", value: args.closingAfter });
    }
    if (args.closingBefore && closeDateField) {
      filters.push({ field: closeDateField, op: "lte", value: args.closingBefore });
    }
    return filters;
  };

  const requireLayout = async (requested?: string): Promise<LayoutConfig> => {
    const configured = await configStore.listConfiguredObjects(tenantId);
    const object = resolveObjectName(requested, configured);
    const config = object
      ? await configStore.getLayout(tenantId, object, userContext.audience)
      : undefined;
    if (!config) {
      throw new Error(
        `No layout is configured for "${requested ?? "(default)"}". Configured objects: ${configured.join(", ")}`,
      );
    }
    return config;
  };

  /**
   * Objects reachable by drilling FROM a configured layout: its related-list
   * objects plus the reference targets of fields the layout shows. This is the
   * governance boundary for the generic all-fields fallback — without it,
   * crm_get_record would silently invert the configured-objects allowlist
   * into "any object the credential can describe" (review finding, R7).
   */
  const reachableObjects = async (): Promise<Set<string>> => {
    const reachable = new Set<string>();
    const configured = await configStore.listConfiguredObjects(tenantId);
    for (const obj of configured) {
      const config = await configStore.getLayout(tenantId, obj, userContext.audience);
      if (!config) continue;
      for (const rel of config.recordCard.relatedLists) reachable.add(rel.object.toLowerCase());
      const describe = await adapter.describeObject(config.object).catch(() => null);
      if (!describe) continue;
      const shown = new Set([...recordCardFieldPaths(config), ...config.listView.columns]);
      for (const f of describe.fields) {
        if (f.type !== "reference" || !shown.has(f.api)) continue;
        // ALL declared targets, including polymorphic ones (Owner, Who/What):
        // the adapter resolves the concrete target per record, so a drill or
        // lookup search can land on any of them.
        for (const target of f.referenceTo ?? []) reachable.add(target.toLowerCase());
      }
    }
    return reachable;
  };

  /** Layout for a record GET: the configured one, else the generic read-only
   *  fallback — but ONLY for objects reachable from a configured layout. */
  const layoutForRecordGet = async (requested?: string): Promise<LayoutConfig> => {
    const configured = await configStore.listConfiguredObjects(tenantId);
    if (resolveObjectName(requested, configured) || !requested) {
      return requireLayout(requested);
    }
    const reachable = await reachableObjects();
    if (!reachable.has(requested.toLowerCase())) {
      throw new Error(
        `"${requested}" has no configured layout and isn't referenced by any configured card. ` +
          `Configured objects: ${configured.join(", ")}`,
      );
    }
    const connection = await configStore.getConnection(tenantId);
    const describe = await adapter.describeObject(requested);
    return genericLayoutConfig({ tenantId, crm: connection.crm, object: requested, describe });
  };

  /**
   * Typed tool failure (design 1e): isError text for the model PLUS an
   * ErrorPayload in structuredContent so the widget renders an actionable
   * card — re-auth for "unauthorized", a Retry button (the embedded original
   * call) for read-only tools.
   */
  const asToolError = async (
    error: unknown,
    call?: { tool: string; args?: Record<string, unknown>; readOnly?: boolean },
  ): Promise<CallToolResult> => {
    const message = error instanceof Error ? error.message : String(error);
    const reason: ErrorPayload["reason"] =
      error instanceof CrmAuthError
        ? "unauthorized"
        : error instanceof CrmRecordNotFoundError
          ? "not-found"
          : error instanceof CrmRateLimitError || /missing a scope|rate limit/i.test(message)
            ? "crm-unavailable"
            : "unknown";
    const connection = await configStore.getConnection(tenantId).catch(() => null);
    const payload: ErrorPayload = {
      kind: "error",
      reason,
      message,
      crmLabel: connection?.crm === "salesforce" ? "Salesforce" : "HubSpot",
      // Retry only re-invokes reads; failed writes go back through the diff.
      ...(call?.readOnly ? { retry: { tool: call.tool, args: call.args ?? {} } } : {}),
    };
    return {
      content: [{ type: "text", text: message }],
      isError: true,
      structuredContent: payload as unknown as Record<string, unknown>,
    };
  };

  // --- Widget resources (one self-contained HTML bundle each) ---
  for (const [uri, widget] of [
    [RECORD_CARD_URI, "record-card"],
    [RESULTS_TABLE_URI, "results-table"],
    [HOME_CARD_URI, "home-card"],
    [FLOW_RUN_URI, "flow-run"],
  ] as [string, WidgetName][]) {
    registerAppResource(
      server,
      `Cardstack ${widget}`,
      uri,
      { mimeType: RESOURCE_MIME_TYPE, _meta: { ui: { prefersBorder: true } } },
      async () => ({
        contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await getWidgetHtml(widget) }],
      }),
    );
  }

  // --- crm_list_objects (model-facing discovery, no UI) ---
  server.registerTool(
    "crm_list_objects",
    {
      title: "List CRM objects",
      description:
        "List the CRM objects this workspace has configured for use in chat, with their fields.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        await requireConnection();
        const objects = await configStore.listConfiguredObjects(tenantId);
        const summaries = await Promise.all(
          objects.map(async (object) => {
            const config = await requireLayout(object);
            const describe = await adapter.describeObject(object);
            return {
              object,
              label: describe.labelPlural,
              layout: config.name ?? "default",
              searchableColumns: config.listView.columns,
            };
          }),
        );
        return {
          content: [
            {
              type: "text",
              text: `Configured objects: ${summaries
                .map((s) => `${s.object} (${s.label}, layout "${s.layout}")`)
                .join("; ")}`,
            },
          ],
          structuredContent: { objects: summaries },
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_list_objects", readOnly: true });
      }
    },
  );

  // --- crm_search → results-table widget ---
  registerAppTool(
    server,
    "crm_search",
    {
      title: "Search CRM records",
      description:
        "Search CRM records with ad-hoc filters and render an interactive results table. " +
        "Use openOnly to exclude closed/won/lost records; minAmount/maxAmount filter on the amount field. " +
        "sortBy/sortDir order results server-side (\"biggest deals\" → sortBy the amount field, desc). " +
        "When the ask names a saved view (or is a broad ask like \"my deals\"), prefer crm_list_view.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        query: z.string().optional().describe("Free-text search on record names"),
        stage: z.string().optional().describe("Stage filter — a stage LABEL or internal value; resolved either way"),
        openOnly: z.boolean().optional().describe("Only records not closed (won or lost)"),
        owner: z.string().optional().describe("Owner name or id, to scope to a person's records"),
        closingAfter: z.string().optional().describe("ISO date — only records with a close date on/after this"),
        closingBefore: z.string().optional().describe("ISO date — only records with a close date on/before this"),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        sortBy: z.string().optional().describe("Field API name to sort by, e.g. the amount or close-date field"),
        sortDir: z.enum(["asc", "desc"]).optional().describe("Sort direction; defaults to desc"),
        limit: z.number().int().positive().max(50).optional(),
        cursor: z.string().optional().describe("Opaque cursor from a previous page"),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: RESULTS_TABLE_URI } },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const config = await requireLayout(args.object);
        const describe = await adapter.describeObject(config.object);
        const byApi = new Map(describe.fields.map((f) => [f.api, f]));
        const amountField = describe.amountField;
        const filters = semanticFilters(describe, args);
        const query: SearchQuery = {
          ...(args.query ? { text: args.query } : {}),
          ...(filters.length > 0 ? { filters } : {}),
          // Explicit ask beats the layout's default ordering.
          ...(args.sortBy
            ? { sort: { field: args.sortBy, dir: args.sortDir ?? "desc" } }
            : config.listView.defaultSort
              ? { sort: config.listView.defaultSort }
              : {}),
          // Fetch only what the table renders.
          columns: config.listView.columns,
          limit: args.limit ?? 10,
          ...(args.cursor ? { cursor: args.cursor } : {}),
        };

        const page = await adapter.search(config.object, query);
        const currency = amountField ? byApi.get(amountField)?.currencyCode : undefined;
        const total = page.total ?? page.rows.length;
        // "31 Opportunities", not "31 Opportunity".
        const objectLabel = total === 1 ? describe.label : describe.labelPlural;
        const title = searchTitle(args, total, objectLabel || config.object, currency);
        const payload = await buildResultsTablePayload({ source: adapter, config, page, title });

        const top = page.rows[0];
        const topLine = top
          ? ` Largest/first: ${describeRow(top.fields, byApi, currency)}.`
          : " No matches.";
        return {
          content: [
            {
              type: "text",
              text:
                `${title} (rendered as an interactive table; rows open record cards).` +
                topLine +
                fieldNotes(payload.meta, 2),
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_search", args, readOnly: true });
      }
    },
  );

  // --- crm_aggregate → server-side totals (no widget; numbers for the model) ---
  server.registerTool(
    "crm_aggregate",
    {
      title: "Aggregate CRM records",
      description:
        "Server-side count — and sum of a numeric field — across ALL matching records, optionally " +
        "grouped by a field. Use for questions like \"total pipeline\", \"deals by stage\", " +
        "\"count by owner\": totals computed here are exact even when a row listing would paginate. " +
        "Accepts the same filters as crm_search (openOnly, stage, owner, amount and close-date bounds).",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        groupBy: z.string().optional().describe("Field API name to group by, e.g. the stage field"),
        sum: z
          .string()
          .optional()
          .describe("Numeric field API name to sum; defaults to the object's amount field"),
        stage: z.string().optional(),
        openOnly: z.boolean().optional(),
        owner: z.string().optional(),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        closingAfter: z.string().optional(),
        closingBefore: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const config = await requireLayout(args.object);
        if (!adapter.aggregate) {
          throw new Error(
            `Aggregation isn't supported for ${config.crm} yet. Use crm_search and page through rows.`,
          );
        }
        const describe = await adapter.describeObject(config.object);
        const sumField = args.sum ?? describe.amountField;
        // Denylist applies to aggregation inputs too — a hidden field must not
        // leak through group keys or sums (hard rule 2).
        const denied = new Set(config.permissions.fieldDenylist);
        for (const api of [args.groupBy, sumField]) {
          if (api && denied.has(api)) {
            throw new Error(`Field "${api}" is not available on this layout.`);
          }
        }
        const filters = semanticFilters(describe, args);
        const buckets = await adapter.aggregate(config.object, {
          ...(args.groupBy ? { groupBy: args.groupBy } : {}),
          ...(sumField ? { sumField } : {}),
          ...(filters.length > 0 ? { filters } : {}),
        });
        const currency = sumField
          ? describe.fields.find((f) => f.api === sumField)?.currencyCode
          : undefined;
        const lines = buckets.map((b) => {
          const sumPart =
            b.sum === undefined ? "" : ` · sum ${b.sum === null ? "—" : `${b.sum}${currency ? ` ${currency}` : ""}`}`;
          return `${b.group ?? (args.groupBy ? "(none)" : "all")}: ${b.count}${sumPart}`;
        });
        return {
          content: [
            {
              type: "text",
              text:
                `${describe.labelPlural || config.object}${args.groupBy ? ` by ${args.groupBy}` : ""}` +
                ` — ${lines.join("; ") || "no matching records"}`,
            },
          ],
          structuredContent: {
            kind: "aggregate",
            object: config.object,
            ...(args.groupBy ? { groupBy: args.groupBy } : {}),
            ...(sumField ? { sumField, ...(currency ? { currencyCode: currency } : {}) } : {}),
            buckets,
          } as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_aggregate", args, readOnly: true });
      }
    },
  );

  // --- crm_get_record → record-card widget (the flagship) ---
  registerAppTool(
    server,
    "crm_get_record",
    {
      title: "Show a CRM record card",
      description:
        "Render the record card for a single CRM record, with related lists and activity. " +
        "Pass id when known, otherwise a name query. Objects without a configured layout " +
        "(related records, reference targets) render a read-only all-fields card.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        id: z.string().optional().describe("Record id, when known"),
        query: z.string().optional().describe("Name text to resolve when id is unknown"),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: RECORD_CARD_URI } },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        // Drill-through: unconfigured objects get a generated read-only
        // all-fields card instead of an error.
        const config = await layoutForRecordGet(args.object);
        let id = args.id;
        let disambiguation = "";
        if (!id) {
          if (!args.query) throw new Error("Provide id or query.");
          // Fallback layouts serve drill-through only (the widget always has
          // the id) — no name search, or the generic path becomes an
          // enumeration surface over unconfigured objects.
          if (config.generatedFallback) {
            throw new Error(
              `Name search isn't available for "${config.object}" (no configured layout). Pass a record id.`,
            );
          }
          const matches = await adapter.search(config.object, { text: args.query, limit: 3 });
          const first = matches.rows[0];
          if (!first) throw new Error(`No ${config.object} record matches "${args.query}".`);
          id = first.id;
          if ((matches.total ?? matches.rows.length) > 1) {
            disambiguation = ` (${matches.total} records matched "${args.query}"; showing the closest — others: ${matches.rows
              .slice(1)
              .map((r) => String(r.fields[config.listView.columns[0] ?? "name"]))
              .join(", ")})`;
          }
        }

        // Pass the layout's field paths explicitly: the adapters' no-fields
        // default excludes reference fields, which silently blanked the
        // header subtitle (AccountId) and any reference section field
        // (OwnerId) on the live card.
        const record = await adapter.getRecord(
          config.object,
          id,
          recordCardFieldPaths(applyDenylist(config)),
        );
        const payload = await buildRecordCardPayload({ source: adapter, config, record });
        const recDescribe = await adapter.describeObject(config.object);
        const recByApi = new Map(recDescribe.fields.map((f) => [f.api, f]));

        return {
          content: [
            {
              type: "text",
              text:
                summarizeRecord(config, payload.record.fields, recByApi) +
                disambiguation +
                fieldNotes(payload.meta, 4),
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_get_record", args, readOnly: true });
      }
    },
  );

  // --- crm_get_related (pagination for related lists; widget-invoked or model-invoked) ---
  server.registerTool(
    "crm_get_related",
    {
      title: "Get related CRM records",
      description:
        "Fetch related records for a parent record (pagination for record-card related lists).",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        recordId: z.string(),
        relationship: z.string().describe("Relationship API name, e.g. \"deal_contacts\""),
        limit: z.number().int().positive().max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const config = await requireLayout(args.object);
        const rel = config.recordCard.relatedLists.find(
          (r) => r.relationship === args.relationship,
        );
        if (!rel) {
          throw new Error(
            `Relationship "${args.relationship}" is not configured on the ${config.object} layout.`,
          );
        }
        const page = await adapter.getRelated(args.recordId, {
          ...rel,
          limit: args.limit ?? rel.limit,
        });
        const allowed = new Set(rel.columns);
        const filtered = {
          ...page,
          rows: page.rows.map((row) => ({
            id: row.id,
            fields: Object.fromEntries(
              Object.entries(row.fields).filter(([key]) => allowed.has(key)),
            ),
          })),
        };
        return {
          content: [
            {
              type: "text",
              text: `${filtered.rows.length} related ${rel.object} for ${args.recordId} via ${rel.relationship}.`,
            },
          ],
          structuredContent: { page: filtered },
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_get_related", args, readOnly: true });
      }
    },
  );

  // --- crm_lookup_search (typeahead for reference-field lookup editors) ---
  server.registerTool(
    "crm_lookup_search",
    {
      title: "Search lookup targets",
      description:
        "Typeahead search for reference (lookup) fields: find records of a target object by name " +
        "and return id + label options. Used by the record card's lookup editor; also useful to " +
        "resolve \"set the account to Acme\" to a record id before crm_update_record.",
      inputSchema: {
        object: z.string().describe("TARGET object API name (e.g. Account, User)"),
        query: z.string().describe("Name text to match"),
        limit: z.number().int().positive().max(10).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        // Same governance boundary as drill-through: only objects reachable
        // from a configured layout are searchable — never "any object the
        // credential can describe".
        const configured = await configStore.listConfiguredObjects(tenantId);
        const configuredMatch = resolveObjectName(args.object, configured);
        if (!configuredMatch) {
          const reachable = await reachableObjects();
          if (!reachable.has(args.object.toLowerCase())) {
            throw new Error(
              `"${args.object}" isn't referenced by any configured card, so it can't be searched.`,
            );
          }
        }
        const object = configuredMatch ?? args.object;
        const describe = await adapter.describeObject(object);
        const nameField = primaryNameField(describe);
        // Rule 2: a denylisted name field on a configured layout stays hidden.
        const layout = configuredMatch
          ? await configStore.getLayout(tenantId, configuredMatch, userContext.audience)
          : undefined;
        if (layout && isDenied(nameField, layout.permissions.fieldDenylist)) {
          throw new Error(`Lookups on ${object} aren't available on this layout.`);
        }
        const page = await adapter.search(object, {
          text: args.query,
          columns: [nameField],
          limit: Math.min(args.limit ?? 7, 10),
        });
        const payload: LookupOptionsPayload = {
          kind: "lookup-options",
          object,
          options: page.rows.map((r) => ({
            id: r.id,
            label: String(r.fields[nameField] ?? r.id),
          })),
        };
        return {
          content: [
            {
              type: "text",
              text:
                payload.options.length === 0
                  ? `No ${describe.label} records match "${args.query}".`
                  : `${describe.label} matches for "${args.query}": ${payload.options
                      .map((o) => `${o.label} (${o.id})`)
                      .join(", ")}.`,
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_lookup_search", args, readOnly: true });
      }
    },
  );

  // --- crm_list_view → results-table widget (or ambiguous-ask picker, 5b) ---
  registerAppTool(
    server,
    "crm_list_view",
    {
      title: "Open a saved CRM view",
      description:
        // NOTE: keep this description static — clients cache tool descriptions
        // at load, so dynamic state (which views exist) baked in here goes
        // stale. The live view list is returned in responses and errors.
        "Render a saved CRM view as an interactive table. PREFER this over crm_search when the ask " +
        "names a saved view or is a broad possessive ask like \"my deals\" / \"my opportunities\"; use " +
        "crm_search only for ad-hoc filters. Pass the user's phrasing as `query` — if it matches several " +
        "views the widget shows a picker and the choice is remembered; responses list the exposed views.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        view: z.string().optional().describe("Saved view id or exact name, when known"),
        query: z.string().optional().describe("The user's phrasing, for resolution + remembering"),
        cursor: z.string().optional().describe("Opaque cursor from a previous page"),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: RESULTS_TABLE_URI } },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const config = await requireLayout(args.object);
        const exposed = await exposedViewsFor(config.object);
        if (exposed.length === 0) {
          throw new Error(`No saved views are exposed for ${config.object}. Use crm_search instead.`);
        }

        let match: ExposedView | undefined;
        if (args.view) {
          const needle = args.view.toLowerCase();
          match = exposed.find(
            (e) => e.view.id === args.view || e.view.name.toLowerCase() === needle,
          );
          if (!match) {
            throw new Error(
              `No exposed view "${args.view}". Exposed: ${describeExposedViews(exposed)}`,
            );
          }
          // An explicit pick after an ambiguous ask sticks for that phrasing.
          if (args.query) {
            await preferences.rememberViewChoice(tenantId, args.query, match.view.id, userContext.userId);
          }
        } else if (args.query) {
          const rememberedId = await preferences.recallViewChoice(
            tenantId,
            args.query,
            userContext.userId,
          );
          match = exposed.find((e) => e.view.id === rememberedId);
          if (!match) {
            const resolution = resolveViewAsk(args.query, exposed);
            if (resolution.kind === "hit") {
              match = resolution.match;
            } else if (resolution.kind === "ambiguous") {
              const payload = {
                kind: "view-picker",
                object: config.object,
                query: args.query,
                options: resolution.candidates.map((c) => ({
                  viewId: c.view.id,
                  name: c.view.name,
                  filterSummary: c.view.filterSummary,
                })),
                provenance: {
                  ...provenanceFor(applyDenylist(config)),
                  connectedUser: await adapter.getConnectedUser(),
                },
              };
              return {
                content: [
                  {
                    type: "text",
                    text:
                      `"${args.query}" matches ${resolution.candidates.length} saved views (` +
                      resolution.candidates.map((c) => c.view.name).join(", ") +
                      "). Rendered a picker; the user's choice will be remembered.",
                  },
                ],
                structuredContent: payload as unknown as Record<string, unknown>,
              };
            } else {
              throw new Error(
                `No exposed view matches "${args.query}". Exposed: ${describeExposedViews(exposed)}. ` +
                  "Use crm_search for ad-hoc filters.",
              );
            }
          }
        } else {
          match = exposed.find((e) => e.exposure.isDefault) ?? exposed[0];
        }

        if (!match) throw new Error("Could not resolve a saved view.");
        const page = await rowsForView(match, args.cursor, config.listView.columns);
        const payload = await buildResultsTablePayload({
          source: adapter,
          config,
          page,
          title: match.view.name,
          savedViewName: match.view.name,
          savedViewId: match.view.id,
          savedViewFilterSummary: match.view.filterSummary,
        });
        const top = page.rows[0];
        const viewByApi = new Map(
          (await adapter.describeObject(config.object)).fields.map((f) => [f.api, f]),
        );
        const viewCurrency = viewByApi.get("amount")?.currencyCode;
        return {
          content: [
            {
              type: "text",
              text:
                `Rendered ${match.custom ? "Cardstack list" : "saved view"} "${match.view.name}" (${page.total ?? page.rows.length} ${config.object}; ` +
                `filters ${match.custom ? "defined in Cardstack" : `from ${payload.provenance.crmLabel}`}: ${match.view.filterSummary}).` +
                (top ? ` First: ${describeRow(top.fields, viewByApi, viewCurrency)}.` : ""),
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_list_view", args, readOnly: true });
      }
    },
  );

  // --- crm_home → home-card widget ("open my CRM", 7a) ---
  registerAppTool(
    server,
    "crm_home",
    {
      title: "Open the CRM home card",
      description:
        "Render the rep's CRM launcher: their saved-view tiles, recently touched records, and " +
        "open follow-up tasks. Use when the user asks to open/see their CRM, their day, their " +
        "tasks or follow-ups — without naming a specific record or view.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: HOME_CARD_URI } },
    },
    async (): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const homeCard = await configStore.getHomeCard(tenantId);
        if (!homeCard) {
          throw new Error(
            "No home card is configured for this workspace. An admin can enable one in " +
              "Cardstack Studio → Home card. Meanwhile, use crm_list_view for saved views " +
              "or crm_search for ad-hoc asks.",
          );
        }

        const listsBlock = homeCard.blocks.find((b) => b.type === "lists");
        const lists: HomeListTile[] = [];
        if (listsBlock) {
          const wanted =
            listsBlock.source === "curated"
              ? allExposedViews.filter((e) => listsBlock.viewIds.includes(e.view.id))
              : allExposedViews;
          const entries = wanted.slice(0, listsBlock.maxTiles);
          const tileFor = async (entry: ExposedView): Promise<HomeListTile> => {
            const base = {
              viewId: entry.view.id,
              name: entry.view.name,
              filterSummary: entry.view.filterSummary,
            };
            try {
              // Tiles only render a count — fetch the minimum column set.
              const page = await rowsForView(entry, undefined, ["Id"]);
              return { ...base, count: page.total ?? page.rows.length };
            } catch {
              // One broken view/list degrades its tile, not the whole card —
              // and it degrades to "—", never a fake 0.
              return { ...base, count: null, error: true };
            }
          };
          // Concurrency 3: parallel enough to be fast, gentle on CRM rate limits.
          for (let i = 0; i < entries.length; i += 3) {
            lists.push(...(await Promise.all(entries.slice(i, i + 3).map(tileFor))));
          }
        }

        const recentBlock = homeCard.blocks.find((b) => b.type === "recent");
        // Missing tasks/recents scopes degrade those blocks, not the whole card.
        const recent = recentBlock
          ? await adapter.listRecentRecords("me", recentBlock.limit).catch(() => [])
          : [];
        const followupsBlock = homeCard.blocks.find((b) => b.type === "followups");
        const allTasks = followupsBlock
          ? (await adapter.listTasks("me").catch(() => ({ rows: [], hasMore: false }))).rows
          : [];
        // Slice to the block's limit BEFORE building payload and summary, so the
        // model never narrates "20 follow-ups" over a card showing 5.
        const tasks =
          followupsBlock && "limit" in followupsBlock
            ? allTasks.slice(0, (followupsBlock as { limit: number }).limit)
            : allTasks;

        // writeEnabled: task check-off is a write; mirror the deals-layout policy.
        const anyLayout = await configStore.getLayout(
          tenantId,
          (await configStore.listConfiguredObjects(tenantId))[0] ?? "deals",
        );
        const payload = {
          kind: "home-card",
          blocks: homeCard.blocks,
          lists,
          recent,
          tasks,
          capabilities: { writeEnabled: anyLayout?.permissions.writeEnabled ?? false },
          provenance: {
            crm: anyLayout?.crm ?? "hubspot",
            crmLabel: anyLayout?.crm === "salesforce" ? "Salesforce" : "HubSpot",
            layoutRevision: homeCard.revision,
            connectedUser: await adapter.getConnectedUser(),
            fetchedAt: new Date().toISOString(),
          },
        };
        const overdue = tasks.filter((t) => t.dueDate !== null && t.dueDate < today()).length;
        return {
          content: [
            {
              type: "text",
              text:
                `Rendered the CRM home card: ${lists.length} list tiles (${lists
                  .map((l) => `${l.name}: ${l.count ?? "unavailable"}`)
                  .join(", ")}), ${recent.length} recent records, ${tasks.length} open follow-ups` +
                (overdue > 0 ? ` (${overdue} overdue)` : "") +
                ".",
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_home", readOnly: true });
      }
    },
  );

  // A task check-off is a one-value diff (open → completed), so its confirm
  // step needs no diff payload — just the same signed, bound token every other
  // write path uses, so the home card's inline confirm is provable too.
  const TASK_COMPLETION_PATCH = { status: "completed" };
  const taskTokenSubject = (id: string) => ({
    tenantId,
    object: "tasks",
    recordId: id,
    patch: TASK_COMPLETION_PATCH,
    actorUserId: userContext.userId,
  });

  server.registerTool(
    "crm_preview_complete_task",
    {
      title: "Preview completing a CRM task",
      description:
        "Mint a confirmation token for checking off a follow-up task. Writes nothing. The home " +
        "card calls this when the rep clicks the checkbox; passing the token to crm_complete_task " +
        "is what lets the audit log record it as rep-confirmed rather than model-initiated.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const minted = mintConfirmToken(taskTokenSubject(args.id));
        return {
          content: [
            { type: "text", text: `Ready to mark task ${args.id} complete — nothing written yet.` },
          ],
          structuredContent: {
            taskId: args.id,
            confirmToken: minted.token,
            expiresAt: minted.expiresAt,
          },
          isError: false,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_preview_complete_task" });
      }
    },
  );

  // --- crm_complete_task (widget-invoked after inline confirm, or model-invoked) ---
  server.registerTool(
    "crm_complete_task",
    {
      title: "Complete a CRM task",
      description:
        "Mark a CRM follow-up task as completed. This is a write and is logged. Pass the " +
        "confirmToken from crm_preview_complete_task when the rep checked it off; without one " +
        "the write is logged as model-initiated.",
      inputSchema: {
        id: z.string(),
        confirmToken: z
          .string()
          .optional()
          .describe(
            "Token from crm_preview_complete_task, proving the rep checked this task off. Do not invent one.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        // Verified BEFORE the write, and a bad token aborts rather than
        // downgrading — same rule as crm_update_record.
        const confirmation: WriteConfirmation = args.confirmToken
          ? { via: "widget", ...verifyConfirmToken(args.confirmToken, taskTokenSubject(args.id)) }
          : { via: "model" };
        const task = await adapter.completeTask(args.id);
        const writtenAs = await adapter.getConnectedUser();
        await auditLog.append({
          tenantId,
          user: writtenAs,
          actor: auditActor(userContext),
          object: "tasks",
          recordId: task.id,
          changes: [{ field: "status", before: "open", after: "completed" }],
          timestamp: new Date().toISOString(),
          confirmation,
        });
        return {
          content: [
            {
              type: "text",
              text: `Completed task "${task.subject}"${task.relatedRecordName ? ` (${task.relatedRecordName})` : ""}. Written as ${writtenAs}; logged.`,
            },
          ],
          structuredContent: { task } as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_complete_task" });
      }
    },
  );

  // --- Shared update gauntlet (crm_preview_update + crm_update_record) ---
  // Both tools MUST apply the same rules: a diff the rep confirms is only
  // meaningful if the write path enforces exactly what the preview validated.
  // Returns the normalized patch — the values the confirm token is bound to.
  const prepareUpdate = async (
    object: string | undefined,
    id: string,
    rawPatch: Record<string, CrmFieldValue>,
  ) => {
    await requireConnection();
    const config = await requireLayout(object);
    if (!config.permissions.writeEnabled) {
      throw new Error(`Writes are disabled for ${config.object}.`);
    }
    const describe = await adapter.describeObject(config.object);
    const describeByApi = new Map(describe.fields.map((f) => [f.api, f]));
    const caps = buildCapabilities(config, describeByApi);
    const patch = { ...rawPatch };
    const disallowed = Object.keys(patch).filter((field) => !caps.editableFields.includes(field));
    if (disallowed.length > 0) {
      // Config violation, not a CRM rejection: refuse the whole call.
      throw new Error(
        `Not editable on this layout: ${disallowed.join(", ")}. Editable fields: ${caps.editableFields.join(", ")}.`,
      );
    }

    // Required fields (design 2a) can't be cleared from chat — enforcement,
    // not just a badge. A null/"" on a required field refuses the whole call.
    // Both admin-marked (layout) and CRM-required (describe) count.
    const requiredApis = new Set([
      ...config.recordCard.sections
        .flatMap((s) => s.fields)
        .filter((f) => f.required)
        .map((f) => f.api),
      ...describe.fields.filter((f) => f.required).map((f) => f.api),
    ]);
    const cleared = Object.keys(patch).filter(
      (field) => requiredApis.has(field) && (patch[field] === null || patch[field] === ""),
    );
    if (cleared.length > 0) {
      const names = cleared.map((f) => describeByApi.get(f)?.label ?? f).join(", ");
      throw new Error(
        `${names} ${cleared.length > 1 ? "are" : "is"} required on this card and can't be cleared from chat.`,
      );
    }

    // Normalize model-supplied picklist LABELS to internal values (the model
    // sees labels in every text response, so it will write them). A label
    // that matches valueLabels case-insensitively is swapped for its value.
    // Normalizing BEFORE the token is minted means preview and write hash the
    // same patch even when one of them was handed a label.
    for (const field of Object.keys(patch)) {
      const raw = patch[field];
      const labels = describeByApi.get(field)?.valueLabels;
      const values = describeByApi.get(field)?.values;
      if (typeof raw !== "string" || !labels || !values) continue;
      if (values.includes(raw)) continue; // already an internal value
      const match = Object.entries(labels).find(
        ([, label]) => label.toLowerCase() === raw.toLowerCase(),
      );
      if (match) patch[field] = match[0];
    }

    const before = await adapter.getRecord(config.object, id, Object.keys(patch));
    return { config, describeByApi, patch, before };
  };

  // --- crm_preview_update (mints the confirmation the audit log can verify) ---
  server.registerTool(
    "crm_preview_update",
    {
      title: "Preview a CRM record update",
      description:
        "Compute the before/after diff for a proposed update WITHOUT writing, and mint a " +
        "confirmation token. Writes nothing. The record card calls this to render the " +
        "confirmation diff; passing the returned confirmToken to crm_update_record is what " +
        "lets the audit log record the write as rep-confirmed rather than model-initiated.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        id: z.string(),
        patch: z
          .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .describe("Field API name → proposed new value"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const { config, describeByApi, patch, before } = await prepareUpdate(
          args.object,
          args.id,
          args.patch as Record<string, CrmFieldValue>,
        );
        // Only fields that actually change belong in a diff — and the token is
        // bound to those, so a no-op field can't ride along into the write.
        const changed = Object.keys(patch).filter(
          (field) => (before.fields[field] ?? null) !== (patch[field] ?? null),
        );
        if (changed.length === 0) {
          throw new Error("Nothing to change — every value matches what's already in the CRM.");
        }
        const boundPatch = Object.fromEntries(changed.map((f) => [f, patch[f] ?? null]));
        const minted = mintConfirmToken({
          tenantId,
          object: config.object,
          recordId: args.id,
          patch: boundPatch,
          actorUserId: userContext.userId,
        });

        const sanitized = applyDenylist(config);
        const named = await adapter.getRecord(config.object, args.id, [
          config.recordCard.header.title,
        ]);
        const payload: UpdatePreviewPayload = {
          kind: "update-preview",
          object: config.object,
          recordId: args.id,
          recordName: String(named.fields[config.recordCard.header.title] ?? args.id),
          changes: changed.map((field) => ({
            field,
            label: describeByApi.get(field)?.label ?? field,
            before: before.fields[field] ?? null,
            after: patch[field] ?? null,
          })),
          confirmToken: minted.token,
          expiresAt: minted.expiresAt,
          provenance: provenanceFor(sanitized),
        };
        const lines = payload.changes.map(
          (c) => `- ${c.label}: ${String(c.before ?? "—")} → ${String(c.after ?? "—")}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `Proposed changes to ${payload.recordName} — nothing written yet:\n${lines.join("\n")}`,
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
          isError: false,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_preview_update" });
      }
    },
  );

  // --- crm_update_record (widget-invoked after the confirmation diff, or model-invoked) ---
  server.registerTool(
    "crm_update_record",
    {
      title: "Update a CRM record",
      description:
        "Write field changes to a CRM record. Only fields the layout marks editable are writable. " +
        "Returns per-field outcomes — a validation failure on one field does not block the others. " +
        "Pass the confirmToken from crm_preview_update when the change was confirmed by the rep; " +
        "without one the write is logged as model-initiated.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        id: z.string(),
        patch: z
          .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .describe("Field API name → new value"),
        confirmToken: z
          .string()
          .optional()
          .describe(
            "Token from crm_preview_update, proving a rep confirmed this exact diff. Do not invent one.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const { config, describeByApi, patch, before } = await prepareUpdate(
          args.object,
          args.id,
          args.patch as Record<string, CrmFieldValue>,
        );

        // Provenance is decided BEFORE anything is written: a token that doesn't
        // verify aborts the write rather than silently downgrading to "model",
        // because a caller presenting a bad token is a bug or an attack, not a
        // model write. No token at all is the legitimate model path.
        const confirmation: WriteConfirmation = args.confirmToken
          ? {
              via: "widget",
              ...verifyConfirmToken(args.confirmToken, {
                tenantId,
                object: config.object,
                recordId: args.id,
                // The token binds only the fields that actually changed, so a
                // no-op field in the patch can't ride along unconfirmed.
                patch: Object.fromEntries(
                  Object.keys(patch)
                    .filter((f) => (before.fields[f] ?? null) !== (patch[f] ?? null))
                    .map((f) => [f, patch[f] ?? null]),
                ),
                actorUserId: userContext.userId,
              }),
            }
          : { via: "model" };

        const fields = Object.keys(patch);
        const results: FieldWriteResult[] = [];
        const resultFor = (field: string, ok: boolean, error?: string): FieldWriteResult => ({
          field,
          label: describeByApi.get(field)?.label ?? field,
          before: before.fields[field] ?? null,
          after: ok ? (patch[field] ?? null) : (before.fields[field] ?? null),
          ok,
          ...(error ? { error } : {}),
        });

        try {
          await adapter.updateRecord(config.object, args.id, patch);
          for (const field of fields) results.push(resultFor(field, true));
        } catch (error) {
          if (!(error instanceof CrmValidationError)) throw error;
          // Batch rejected — salvage per field so one bad value doesn't sink the rest.
          for (const field of fields) {
            try {
              await adapter.updateRecord(config.object, args.id, { [field]: patch[field]! });
              results.push(resultFor(field, true));
            } catch (fieldError) {
              if (!(fieldError instanceof CrmValidationError)) throw fieldError;
              results.push(resultFor(field, false, fieldError.message));
            }
          }
        }

        const saved = results.filter((r) => r.ok);
        const writtenAs = await adapter.getConnectedUser();
        const timestamp = new Date().toISOString();
        if (saved.length > 0) {
          await auditLog.append({
            tenantId,
            user: writtenAs,
            actor: auditActor(userContext),
            object: config.object,
            recordId: args.id,
            changes: saved.map(({ field, before, after }) => ({ field, before, after })),
            timestamp,
            confirmation,
          });
        }

        const sanitized = applyDenylist(config);
        const fresh = filterRecord(
          await adapter.getRecord(config.object, args.id, recordCardFieldPaths(sanitized)),
          new Set(recordCardFieldPaths(sanitized)),
        );
        const recordName = String(fresh.fields[config.recordCard.header.title] ?? args.id);
        // Receipt display: for saved fields, show the re-fetched value — for a
        // lookup write that's the referenced record's NAME, not the raw id the
        // patch carried. (The audit log above keeps the raw written values.)
        const displayResults = results.map((r) =>
          r.ok && fresh.fields[r.field] !== undefined ? { ...r, after: fresh.fields[r.field]! } : r,
        );
        const payload: WriteReceiptPayload = {
          kind: "write-receipt",
          object: config.object,
          recordId: args.id,
          recordName,
          results: displayResults,
          savedCount: saved.length,
          failedCount: results.length - saved.length,
          writtenAs,
          timestamp,
          record: fresh,
          provenance: { ...provenanceFor(sanitized), connectedUser: writtenAs },
        };

        const valueLabels = new Map(
          [...describeByApi].map(([api, f]) => [api, f.valueLabels ?? {}]),
        );
        return {
          content: [{ type: "text", text: receiptText(payload, valueLabels) }],
          structuredContent: payload as unknown as Record<string, unknown>,
          isError: false,
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_update_record" });
      }
    },
  );

  // --- crm_create_record ---
  server.registerTool(
    "crm_create_record",
    {
      title: "Create a CRM record",
      description:
        "Create a new CRM record. Denylisted and CRM read-only fields are not accepted.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        fields: z
          .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .describe("Field API name → value"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const config = await requireLayout(args.object);
        if (!config.permissions.writeEnabled) {
          throw new Error(`Writes are disabled for ${config.object}.`);
        }
        const describe = await adapter.describeObject(config.object);
        const describeByApi = new Map(describe.fields.map((f) => [f.api, f]));
        const deny = config.permissions.fieldDenylist;
        for (const field of Object.keys(args.fields)) {
          const meta = describeByApi.get(field);
          if (!meta || meta.readOnly || deny.some((d) => field === d || field.startsWith(`${d}.`))) {
            throw new Error(`Field "${field}" is not writable for ${config.object}.`);
          }
        }
        const created = await adapter.createRecord(
          config.object,
          args.fields as Record<string, CrmFieldValue>,
        );
        const writtenAs = await adapter.getConnectedUser();
        await auditLog.append({
          tenantId,
          user: writtenAs,
          actor: auditActor(userContext),
          object: config.object,
          recordId: created.id,
          changes: Object.entries(args.fields).map(([field, after]) => ({
            field,
            before: null,
            after,
          })),
          timestamp: new Date().toISOString(),
          // Creation has no confirmation diff to mint a token against: the card
          // posts a chat followup and the model calls this tool (10b, the
          // in-widget create form, is still open). Model-initiated is the truth.
          confirmation: { via: "model" },
        });
        const sanitized = applyDenylist(config);
        const fresh = filterRecord(created, new Set(recordCardFieldPaths(sanitized)));
        const name = fresh.fields[config.recordCard.header.title] ?? created.id;
        return {
          content: [
            {
              type: "text",
              text: `Created ${config.object} "${name}" (id ${created.id}), written as ${writtenAs} and logged.`,
            },
          ],
          structuredContent: { record: fresh },
        };
      } catch (error) {
        return asToolError(error, { tool: "crm_create_record" });
      }
    },
  );

  // --- Flow runtime (design 10a, HANDOFF rung) ---
  // The server is stateless: crm_flow_continue re-resolves from the answers the
  // model passes, so no interview session is persisted (PLAN spike #2). Only the
  // HANDOFF rung is wired — the flow opens in the CRM, which owns the screens and
  // the write. Native/Embedded rungs are gated behind their spikes.
  // Interview state round-trips through the model and the widget, and it is not
  // just a cursor: it carries `pendingWrite` and the answers the write executes
  // with, so a forged one is a forged write authorization. It shares the confirm
  // token's signer (confirm-token.ts) so both write paths have ONE security
  // floor — in particular neither ever degrades to unsigned when no
  // CARDSTACK_ENCRYPTION_KEY is configured.
  const signInterviewState = (token: string): string => signState(token);
  const verifyInterviewState = (state: string): string =>
    verifyState(state, "Interview state token failed verification — restart the flow.");

  const runFlow = async (
    args: { object?: string; recordId: string; flowApiName: string },
    answers: Record<string, FlowAnswerValue>,
    actionSessionId: string,
    tool: "crm_flow_start" | "crm_flow_continue",
    nativeOpts?: { interviewState?: string; confirmWrite?: boolean; back?: boolean },
  ): Promise<CallToolResult> => {
    try {
      await requireConnection();
      const config = await requireLayout(args.object);
      const action = config.recordCard.actions.find(
        (a): a is Extract<CardAction, { type: "screen_flow" }> =>
          a.type === "screen_flow" &&
          a.flowApiName === args.flowApiName &&
          a.enabled !== false,
      );
      if (!action) {
        throw new Error(
          `Flow "${args.flowApiName}" is not configured on the ${config.object} card.`,
        );
      }
      const inputs = action.inputs ?? {};

      const flows = await adapter.listFlows().catch(() => []);
      const summary = flows.find((f) => f.api === args.flowApiName);
      const flow = summary ?? {
        api: args.flowApiName,
        label: action.label || args.flowApiName,
        screens: 0,
        writesSummary: "Runs in the CRM.",
      };

      // Fetch only the fields that `field`-source inputs reference.
      const fieldApis = Object.values(inputs)
        .filter((m): m is Extract<typeof m, { source: "field" }> => m.source === "field")
        .map((m) => m.field);
      let recordFields: Record<string, CrmFieldValue> = {};
      if (fieldApis.length > 0) {
        const record = await adapter
          .getRecord(config.object, args.recordId, fieldApis)
          .catch(() => null);
        if (record) recordFields = record.fields;
      }

      // A flow must be switched ON in Studio before reps can run it. A flow
      // synced from the CRM is a candidate, not an offering — and with no
      // stored policy at all, the answer is no (2026-08-10c). This is the
      // server-side half of Studio's Active toggle; without it the toggle
      // would be decoration.
      const policy = (await configStore.getFlowRenderModes(tenantId)).find(
        (m) => m.flowApiName === args.flowApiName,
      );
      if (!policy?.active) {
        throw new Error(
          `Flow "${flow.label}" isn't switched on for chat. An admin turns it on in Studio → Flows.`,
        );
      }
      const renderMode = policy.mode;

      const context: ActionInvocationContext = {
        tenantId,
        crm: config.crm,
        objectApiName: config.object,
        recordId: args.recordId,
        userId: userContext.userId,
        ...(userContext.email ? { userEmail: userContext.email } : {}),
        audience: userContext.audience,
        actionSessionId,
        recordFields,
        selections: {},
      };
      // Action-input resolution only understands scalars; array answers (multi-
      // selects, table selections) belong to the native interview alone.
      const scalarAnswers: Record<string, CrmFieldValue> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (!Array.isArray(v)) scalarAnswers[k] = v;
      }
      const { resolved, pending, missing } = resolveActionInputs({
        inputs,
        context,
        answers: scalarAnswers,
      });
      // Pass the record id + resolved scalar inputs so the flow opens with context
      // (embedded or handoff). Salesforce maps matching names to flow variables.
      const launchParams: Record<string, string> = { recordId: args.recordId };
      for (const r of resolved) {
        if (!Array.isArray(r.value) && r.value != null && r.value !== "") {
          launchParams[r.name] = String(r.value);
        }
      }
      const launchUrl = adapter.getFlowLaunchUrl?.(args.flowApiName, launchParams) ?? null;

      // NATIVE rung: interpret the flow definition and render the interview
      // in-chat. Renderability is decided by static analysis; any mid-run
      // unsupported element degrades to the handoff card with a reason.
      let degradeReason: string | null = null;
      let supportLevel: "full" | "partial" | "handoff" | null = null;
      const wantNative =
        (renderMode === "auto" || renderMode === "native") &&
        typeof adapter.getFlowDefinition === "function";
      if (wantNative) {
        const def = await adapter.getFlowDefinition!(args.flowApiName).catch(() => null);
        const report = def ? analyzeFlowSupport(def) : null;
        supportLevel = report?.level ?? null;
        if (def && report && report.level !== "handoff") {
          const resolver: FlowDefResolver = (name) =>
            name === args.flowApiName
              ? Promise.resolve(def)
              : adapter.getFlowDefinition!(name).catch(() => null);
          const audit = async (
            object: string,
            recordId: string,
            changes: { field: string; before: null; after: CrmFieldValue }[],
          ) => {
            await auditLog.append({
              tenantId,
              user: await adapter.getConnectedUser(),
              actor: auditActor(userContext),
              object,
              recordId,
              changes,
              timestamp: new Date().toISOString(),
              // Reaching an interpreter write PROVES a rep confirmed it, by the
              // same standard crm_update_record's token proves it: executeWrite
              // has one call site, gated behind a `pendingWrite` frame that only
              // the server mints (at a confirm-write pause) inside a SIGNED
              // interview state, plus an explicit confirmWrite: true. The write
              // uses the state's own answers — values passed on the confirming
              // call are ignored — so it is bound to the diff the rep saw.
              // No confirmationId: the gate is the signed state, not a minted
              // token, and inventing an id would imply a receipt we don't hold.
              confirmation: { via: "widget" },
            });
          };
          const effects: FlowRuntimeEffects = {
            queryRecords: (object, fields, queryOpts) =>
              adapter.queryRows ? adapter.queryRows(object, fields, queryOpts) : Promise.resolve([]),
            choiceOptions: async (object, valueField, displayField) => {
              if (!adapter.queryRows) return [];
              const rows = await adapter.queryRows(object, [valueField, displayField], {
                sortField: displayField,
                limit: 100,
              });
              return rows.map((r) => ({
                value: String(valueField === "Id" ? r.id : (r.cells[valueField] ?? r.id)),
                label: String(r.cells[displayField] ?? r.id),
              }));
            },
            createRecord: async (object, fields) => {
              const created = await adapter.createRecord(object, fields);
              await audit(
                object,
                created.id,
                Object.entries(fields).map(([field, after]) => ({ field, before: null, after })),
              );
              return created.id;
            },
            updateRecord: async (object, id, fields) => {
              await adapter.updateRecord(object, id, fields);
              await audit(
                object,
                id,
                Object.entries(fields).map(([field, after]) => ({ field, before: null, after })),
              );
            },
            // deleteRecord intentionally unwired: CrmAdapter has no delete
            // surface yet, so recordDeletes degrade to handoff (visible in
            // the analysis report) instead of executing.
          };
          try {
            let step: FlowStepResult;
            if (nativeOpts?.interviewState) {
              step = await continueFlowInterview(
                resolver,
                verifyInterviewState(nativeOpts.interviewState),
                answers,
                {
                  confirmWrite: nativeOpts.confirmWrite ?? false,
                  back: nativeOpts.back ?? false,
                },
                effects,
              );
            } else {
              // Seed the interview with the record context + resolved inputs so
              // merge fields and decisions can reference them.
              const initial: Record<string, FlowAnswerValue> = { recordId: args.recordId };
              for (const r of resolved) initial[r.name] = r.value as FlowAnswerValue;
              step = await startFlowInterview(args.flowApiName, resolver, effects, initial);
            }
            if (step.type === "degrade") {
              degradeReason = `${step.element}: ${step.reason}`;
            } else {
              const base = buildFlowRunPayload({
                actionSessionId,
                flow: {
                  api: flow.api,
                  label: def.label ?? flow.label,
                  screens: report.screenCount,
                  writesSummary: flow.writesSummary,
                },
                renderMode: "native",
                launchUrl,
                resolved: resolved.map((r) => ({ name: r.name, value: r.value, source: r.source })),
                pending: [],
                missing: [],
                provenance: {
                  ...provenanceFor(config),
                  connectedUser: await adapter.getConnectedUser(),
                },
              });
              const payload = {
                ...base,
                object: config.object,
                recordId: args.recordId,
                supportLevel,
                status:
                  step.type === "screen"
                    ? ("in-progress" as const)
                    : step.type === "confirm-write"
                      ? ("confirm-write" as const)
                      : ("finished" as const),
                screen: step.type === "screen" ? step.screen : null,
                pendingWrite: step.type === "confirm-write" ? step.write : null,
                finishedSummary: step.type === "finished" ? step.summary : null,
                finishedFailed: step.type === "finished" ? (step.failed ?? false) : false,
                interviewState:
                  step.type === "finished"
                    ? null
                    : signInterviewState(encodeInterviewState(step.session)),
              };
              const text =
                step.type === "screen"
                  ? `Flow "${payload.flowLabel}" — screen ${step.screen.stepIndex} ` +
                    `("${step.screen.label}") is rendered in the card. The rep fills it there; ` +
                    `the card advances itself via crm_flow_continue. You don't need to collect ` +
                    `these values in chat unless the rep asks.`
                  : step.type === "confirm-write"
                    ? `Flow "${payload.flowLabel}" wants to ${step.write.description.toLowerCase()} ` +
                      `(${step.write.assignments.map((a) => `${a.field}: ${a.value ?? "—"}`).join(", ") || "no field changes"}). ` +
                      `The rep confirms in the card before anything is written.`
                    : `${step.summary}${step.failed ? "" : " Nothing further to collect."}`;
              return {
                content: [{ type: "text", text }],
                structuredContent: payload as unknown as Record<string, unknown>,
              };
            }
          } catch (error) {
            // Unexpected interpreter failure — fall back to handoff, noting why.
            degradeReason = error instanceof Error ? error.message : "interview failed";
          }
        }
      }

      const payload = buildFlowRunPayload({
        actionSessionId,
        flow: {
          api: flow.api,
          label: flow.label,
          screens: flow.screens,
          writesSummary: flow.writesSummary,
        },
        renderMode,
        launchUrl,
        resolved: resolved.map((r) => ({ name: r.name, value: r.value, source: r.source })),
        pending: pending.map((p) => ({ name: p.name, prompt: p.prompt, required: p.required })),
        missing,
        provenance: { ...provenanceFor(config), connectedUser: await adapter.getConnectedUser() },
      });
      const handoffPayload = {
        ...payload,
        ...(supportLevel !== null ? { supportLevel } : {}),
        ...(degradeReason !== null ? { degradeReason } : {}),
      };

      const text =
        (degradeReason
          ? `The in-chat interview stopped at a part this rung can't run (${degradeReason}). ` +
            `The rep finishes the flow in ${payload.provenance.crmLabel} instead. `
          : "") +
        (payload.status === "needs-input"
          ? `Flow "${flow.label}" needs input before it can run: ` +
            `${pending.filter((p) => p.required).map((p) => p.prompt).join("; ")}. ` +
            `Ask the rep, then call crm_flow_continue with { actionSessionId: "${actionSessionId}", answers }.`
          : `Flow "${flow.label}" is ready to run. It opens in ${payload.provenance.crmLabel}` +
            (flow.writesSummary ? ` — ${flow.writesSummary}` : "") +
            (payload.launchUrl
              ? ". The rep confirms and launches it from the card."
              : `. No launch URL is available yet — the rep may need to connect ${payload.provenance.crmLabel}.`));
      void tool;
      return {
        content: [{ type: "text", text }],
        structuredContent: handoffPayload as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return asToolError(error, { tool });
    }
  };

  // Quick actions (v1): a single-screen sibling of the flow rung. The chat
  // form renders the action's mini-layout; the CRM executes (its validations,
  // predefined values, triggers). Same widget, same confirm gate, same signed
  // token pattern — the token SHAPE routes crm_flow_continue between the two.
  const runQuickAction = async (
    args: { object?: string; recordId: string; actionApiName: string },
    state: QuickActionState | null,
    answers: Record<string, FlowAnswerValue>,
    opts: { confirmWrite?: boolean; back?: boolean },
    actionSessionId: string,
    tool: string,
  ): Promise<CallToolResult> => {
    try {
      await requireConnection();
      const config = await requireLayout(args.object);
      const action = config.recordCard.actions.find(
        (a): a is Extract<CardAction, { type: "quick_action" }> =>
          a.type === "quick_action" &&
          a.actionApiName === args.actionApiName &&
          a.enabled !== false,
      );
      if (!action) {
        throw new Error(
          `Quick action "${args.actionApiName}" is not configured on the ${config.object} card.`,
        );
      }
      if (!adapter.describeQuickAction || !adapter.executeQuickAction) {
        throw new Error("Quick actions aren't available for this CRM connection.");
      }
      const describe = await adapter.describeQuickAction(args.actionApiName);
      if (!describe) {
        throw new Error(`Quick action "${args.actionApiName}" couldn't be described.`);
      }
      const defaults = adapter.getQuickActionDefaults
        ? await adapter.getQuickActionDefaults(args.actionApiName, args.recordId)
        : {};

      const session: QuickActionState = state ?? {
        v: 1,
        kind: "quick-action",
        action: args.actionApiName,
        object: config.object,
        recordId: args.recordId,
        answers: {},
        confirming: false,
      };
      for (const [name, value] of Object.entries(answers)) {
        if (!Array.isArray(value)) session.answers[name] = value;
      }

      const provenance = {
        ...provenanceFor(config),
        connectedUser: await adapter.getConnectedUser(),
      };
      const label = describe.label ?? action.label;
      const target = describe.targetSobjectType ?? "record";
      const base = buildFlowRunPayload({
        actionSessionId,
        flow: {
          api: args.actionApiName,
          label,
          screens: 1,
          writesSummary: `${describe.type === "Update" ? "Updates" : "Creates"} a ${target} — ${provenance.crmLabel} executes.`,
        },
        renderMode: "native",
        launchUrl: null,
        resolved: [],
        pending: [],
        missing: [],
        provenance,
      });
      const respond = (
        extra: Record<string, unknown>,
        text: string,
      ): CallToolResult => ({
        content: [{ type: "text", text }],
        structuredContent: {
          ...base,
          object: config.object,
          recordId: args.recordId,
          supportLevel: "full",
          ...extra,
        } as unknown as Record<string, unknown>,
      });

      // Confirmed → the CRM executes. Only fields on the action's own layout
      // are sent — Salesforce rejects strays, and nothing outside the rendered
      // form should reach the write anyway (rule 2's server-side gate).
      if (state?.confirming && opts.confirmWrite === true) {
        const layoutFields = new Set(quickActionLayoutFields(describe).map((f) => f.api));
        const fields: Record<string, CrmFieldValue> = {};
        for (const [name, value] of Object.entries(session.answers)) {
          if (layoutFields.has(name) && value !== null && value !== "") fields[name] = value;
        }
        const result = await adapter.executeQuickAction(
          args.actionApiName,
          args.recordId,
          fields,
        );
        if (!result.success) {
          // CRM validation failed — re-render the form with the verbatim errors.
          session.confirming = false;
          const screen = quickActionScreen(describe, defaults, session.answers);
          screen.fields.unshift({
            kind: "display",
            name: "__qa_errors",
            html: `<p>⚠️ ${result.errors.join(" · ") || "The CRM rejected the action."}</p>`,
          });
          return respond(
            {
              status: "in-progress",
              screen,
              interviewState: signInterviewState(encodeQuickActionState(session)),
            },
            `${provenance.crmLabel} rejected "${label}": ${result.errors.join("; ") || "validation failed"}. The form is showing again with the errors.`,
          );
        }
        await auditLog.append({
          tenantId,
          user: provenance.connectedUser ?? "",
          actor: auditActor(userContext),
          object: target,
          recordId: result.createdId ?? args.recordId,
          changes: Object.entries(fields).map(([field, after]) => ({
            field,
            before: null,
            after,
          })),
          timestamp: new Date().toISOString(),
          // Same standard as the interpreter: this branch requires a SIGNED
          // quick-action state already in `confirming` plus an explicit
          // confirmWrite: true, and the fields come from that state's answers.
          confirmation: { via: "widget" },
        });
        const summary = `${label} done — ${describe.type === "Update" ? `${target} updated` : `${target} created${result.createdId ? ` (${result.createdId})` : ""}`}.`;
        return respond(
          { status: "finished", finishedSummary: summary, interviewState: null },
          summary,
        );
      }

      // Declined at the confirm card.
      if (state?.confirming && opts.confirmWrite === false) {
        return respond(
          { status: "finished", finishedSummary: `${label} cancelled — nothing was written.`, interviewState: null },
          `Quick action "${label}" cancelled — nothing was written.`,
        );
      }

      // Back from the confirm card, or first render, or missing required →
      // show the form.
      const missing = quickActionMissingRequired(describe, session.answers, defaults);
      const showForm = !state || opts.back || missing.length > 0;
      if (showForm) {
        session.confirming = false;
        const screen = quickActionScreen(describe, defaults, session.answers);
        return respond(
          {
            status: "in-progress",
            screen,
            interviewState: signInterviewState(encodeQuickActionState(session)),
          },
          `Quick action "${label}" is rendered in the card (${describe.type} → ${target}). ` +
            `The rep fills it there; the card advances itself via crm_flow_continue.`,
        );
      }

      // Answers in → confirm before the CRM executes (rule 8).
      session.confirming = true;
      const write = quickActionPendingWrite(describe, session.answers);
      return respond(
        {
          status: "confirm-write",
          pendingWrite: write,
          interviewState: signInterviewState(encodeQuickActionState(session)),
        },
        `Quick action "${label}" wants to ${write.description.toLowerCase()} ` +
          `(${write.assignments.map((a) => `${a.field}: ${a.value ?? "—"}`).join(", ") || "no fields"}). ` +
          `The rep confirms in the card before ${provenance.crmLabel} executes.`,
      );
    } catch (error) {
      return asToolError(error, { tool });
    }
  };

  registerAppTool(
    server,
    "crm_quick_action_start",
    {
      title: "Start a CRM quick action",
      description:
        "Begin a configured quick action for a record (New Task, Log a Call, …). Renders the " +
        "action's fields in the card with record-context defaults; the rep fills, confirms, and " +
        "the CRM executes with its own validation. Use when the user asks to run a named quick " +
        "action on a record.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        recordId: z.string(),
        actionApiName: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: FLOW_RUN_URI } },
    },
    async (args): Promise<CallToolResult> =>
      runQuickAction(
        { object: args.object, recordId: args.recordId, actionApiName: args.actionApiName },
        null,
        {},
        {},
        randomUUID(),
        "crm_quick_action_start",
      ),
  );

  registerAppTool(
    server,
    "crm_flow_start",
    {
      title: "Start a CRM screen flow",
      description:
        "Begin a configured screen-flow action for a record. Resolves the flow's inputs from the " +
        "record and context; if any inputs must be asked, they come back as pending — collect them in " +
        "chat, then call crm_flow_continue. When ready, the rep opens the flow in the CRM from the card. " +
        "Use when the user asks to run/start a named flow on a record.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        recordId: z.string(),
        flowApiName: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: FLOW_RUN_URI } },
    },
    async (args): Promise<CallToolResult> =>
      runFlow(
        { object: args.object, recordId: args.recordId, flowApiName: args.flowApiName },
        {},
        randomUUID(),
        "crm_flow_start",
      ),
  );

  registerAppTool(
    server,
    "crm_flow_continue",
    {
      title: "Continue a CRM screen flow with collected inputs",
      description:
        "Supply the answers a flow asked for (from crm_flow_start's pending inputs) and re-render the " +
        "flow-run card. Pass the actionSessionId from crm_flow_start and an answers map of input name → value.",
      inputSchema: {
        object: z.string().optional().describe("Object API name; omit for the workspace default"),
        recordId: z.string(),
        flowApiName: z.string(),
        actionSessionId: z.string(),
        answers: z
          .record(
            z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
          )
          .default({})
          .describe("Flow input name → value collected from the rep"),
        interviewState: z
          .string()
          .optional()
          .describe("Opaque interview token from the previous flow payload (native rung)"),
        confirmWrite: z
          .boolean()
          .optional()
          .describe("True to execute the pending write the rep confirmed in the card"),
        back: z.boolean().optional().describe("True to re-render the previous screen"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: FLOW_RUN_URI } },
    },
    async (args): Promise<CallToolResult> => {
      // The token's SHAPE routes: quick-action states continue through the
      // quick-action runner; everything else is a flow interview.
      if (args.interviewState) {
        let quickState: QuickActionState | null = null;
        try {
          quickState = decodeQuickActionState(verifyInterviewState(args.interviewState));
        } catch {
          quickState = null; // signature failure surfaces via the flow path's error
        }
        if (quickState) {
          return runQuickAction(
            { object: args.object, recordId: args.recordId, actionApiName: quickState.action },
            quickState,
            args.answers as Record<string, FlowAnswerValue>,
            {
              ...(args.confirmWrite !== undefined ? { confirmWrite: args.confirmWrite } : {}),
              ...(args.back !== undefined ? { back: args.back } : {}),
            },
            args.actionSessionId,
            "crm_flow_continue",
          );
        }
      }
      return runFlow(
        { object: args.object, recordId: args.recordId, flowApiName: args.flowApiName },
        args.answers as Record<string, FlowAnswerValue>,
        args.actionSessionId,
        "crm_flow_continue",
        {
          ...(args.interviewState ? { interviewState: args.interviewState } : {}),
          ...(args.confirmWrite !== undefined ? { confirmWrite: args.confirmWrite } : {}),
          ...(args.back !== undefined ? { back: args.back } : {}),
        },
      );
    },
  );

  server.registerTool(
    "crm_flow_cancel",
    {
      title: "Cancel a CRM screen flow",
      description:
        "Abandon a flow the rep decided not to run. The server holds no interview state, so this just " +
        "acknowledges the cancellation for the conversation.",
      // The session id alone identifies the interview — requiring the flow api
      // name too was just one more thing for the host/model to fumble on a
      // cancel (UX review 2026-07-26 P2-18). Optional, echoed back when given.
      inputSchema: { flowApiName: z.string().optional(), actionSessionId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async (args): Promise<CallToolResult> => ({
      content: [
        {
          type: "text",
          text: `Cancelled ${args.flowApiName ? `flow "${args.flowApiName}"` : "the flow"}. Nothing was run.`,
        },
      ],
      structuredContent: {
        kind: "flow-run",
        actionSessionId: args.actionSessionId,
        ...(args.flowApiName ? { flowApiName: args.flowApiName } : {}),
        status: "cancelled",
      } as unknown as Record<string, unknown>,
    }),
  );

  return server;
}

/** Model-facing mirror of the write receipt — same content the card collapses to (4c). */
function receiptText(
  payload: WriteReceiptPayload,
  valueLabels?: Map<string, Record<string, string>>,
): string {
  const saved = payload.results.filter((r) => r.ok);
  const failed = payload.results.filter((r) => !r.ok);
  // Narrate labels, not internal ids ("Closed won", not "2540864").
  const display = (field: string, value: unknown): string => {
    const labels = valueLabels?.get(field);
    if (value !== null && value !== undefined && labels?.[String(value)]) {
      return labels[String(value)]!;
    }
    return formatPlain(value);
  };
  const changes = saved
    .map((r) => `${r.label} ${display(r.field, r.before)}→${display(r.field, r.after)}`)
    .join(", ");
  let text =
    failed.length === 0
      ? `Updated ${payload.object} "${payload.recordName}": ${changes}.`
      : saved.length === 0
        ? `No changes were written to "${payload.recordName}".`
        : `Saved ${saved.length} of ${payload.results.length} changes to "${payload.recordName}": ${changes}.`;
  for (const f of failed) {
    text += ` ${f.label} was rejected by ${payload.provenance.crmLabel}: ${f.error}`;
  }
  text += ` Written as ${payload.writtenAs}; logged in ${payload.provenance.crmLabel} history.`;
  return text;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function auditActor(user: UserContext): { userId: string; name: string; email?: string } {
  return {
    userId: user.userId,
    name: user.name,
    ...(user.email ? { email: user.email } : {}),
  };
}

function formatPlain(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function money(n: number, currency?: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function searchTitle(
  args: {
    openOnly?: boolean;
    minAmount?: number;
    maxAmount?: number;
    stage?: string;
    query?: string;
    owner?: string;
    closingAfter?: string;
    closingBefore?: string;
  },
  total: number,
  object: string,
  currency?: string,
): string {
  const parts: string[] = [String(total)];
  if (args.openOnly) parts.push("open");
  parts.push(object);
  const qualifiers: string[] = [];
  if (args.minAmount !== undefined) qualifiers.push(`over ${money(args.minAmount, currency)}`);
  if (args.maxAmount !== undefined) qualifiers.push(`under ${money(args.maxAmount, currency)}`);
  if (args.stage) qualifiers.push(`in ${args.stage}`);
  if (args.owner) qualifiers.push(`owned by ${args.owner}`);
  if (args.closingAfter) qualifiers.push(`closing on/after ${args.closingAfter}`);
  if (args.closingBefore) qualifiers.push(`closing on/before ${args.closingBefore}`);
  if (args.query) qualifiers.push(`matching "${args.query}"`);
  return [parts.join(" "), ...qualifiers].join(" ");
}

/** Resolve a raw field value to its human label via describe.valueLabels. */
function labelFor(
  fields: Record<string, unknown>,
  api: string | undefined,
  byApi?: Map<string, { valueLabels?: Record<string, string> }>,
): string | undefined {
  if (!api) return undefined;
  const raw = fields[api];
  if (raw === null || raw === undefined || raw === "") return undefined;
  const labels = byApi?.get(api)?.valueLabels;
  return labels?.[String(raw)] ?? String(raw);
}

function describeRow(
  fields: Record<string, unknown>,
  byApi?: Map<string, { valueLabels?: Record<string, string>; currencyCode?: string }>,
  currency?: string,
): string {
  const name = fields.dealname ?? fields.name ?? fields.__display_name ?? "unnamed";
  const amount =
    typeof fields.amount === "number" ? money(fields.amount, currency) : undefined;
  // Prefer the stage LABEL over its internal id in everything the model narrates.
  const stage = labelFor(fields, "dealstage", byApi) ?? fields.dealstage;
  return [name, amount, stage ? `(${stage})` : undefined].filter(Boolean).join(" ");
}

function summarizeRecord(
  config: LayoutConfig,
  fields: Record<string, unknown>,
  byApi?: Map<string, { valueLabels?: Record<string, string>; currencyCode?: string }>,
): string {
  const title = fields[config.recordCard.header.title] ?? "record";
  const badge = labelFor(fields, config.recordCard.header.badge, byApi);
  const currency = config.recordCard && byApi?.get("amount")?.currencyCode;
  const detail = describeRow(fields, byApi, currency);
  return `Rendered ${config.object} card for "${title}"${badge ? `, stage ${badge}` : ""}. ${detail}.`;
}
