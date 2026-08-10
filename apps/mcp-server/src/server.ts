/**
 * Cardstack MCP App server (M1 tool surface, read paths).
 * SEP-1865 mechanics via @modelcontextprotocol/ext-apps — resource mimeType and
 * _meta shapes come from the shipped SDK, per CLAUDE.md rule 7.
 */
import { randomUUID } from "node:crypto";
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
  recordCardFieldPaths,
  filterRecord,
  summarizeCustomFilters,
  defaultUserContext,
  resolveActionInputs,
  type ActionInvocationContext,
  type CardAction,
  type CrmFieldValue,
  type ErrorPayload,
  type FieldFilter,
  type FieldWriteResult,
  type HomeListTile,
  type LayoutConfig,
  type RecordPage,
  type SearchQuery,
  type UserContext,
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
import {
  describeExposedViews,
  resolveViewAsk,
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
 * Async because tool descriptions are tenant-specific: the exposed views'
 * names + aliases are baked into crm_list_view's description so model routing
 * works ("show me my deals" → the view, not ad-hoc search).
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

  /** Rows for an exposed view — CRM views via the adapter's saved-view API, custom lists via search. */
  const rowsForView = async (entry: ExposedView, cursor?: string): Promise<RecordPage> => {
    if (entry.custom) {
      return adapter.search(entry.view.object, {
        ...(entry.custom.filters.length > 0 ? { filters: entry.custom.filters } : {}),
        ...(entry.custom.sort ? { sort: entry.custom.sort } : {}),
        ...(cursor ? { cursor } : {}),
      });
    }
    return adapter.getViewRows(entry.view.id, cursor);
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

  const requireLayout = async (object: string): Promise<LayoutConfig> => {
    const config = await configStore.getLayout(tenantId, object, userContext.audience);
    if (!config) {
      const configured = await configStore.listConfiguredObjects(tenantId);
      throw new Error(
        `No layout is configured for "${object}". Configured objects: ${configured.join(", ")}`,
      );
    }
    return config;
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
        "When the ask names a saved view (or is a broad ask like \"my deals\"), prefer crm_list_view.",
      inputSchema: {
        object: z.string().default("deals").describe("Object API name, e.g. \"deals\""),
        query: z.string().optional().describe("Free-text search on record names"),
        stage: z.string().optional().describe("Stage filter — a stage LABEL or internal value; resolved either way"),
        openOnly: z.boolean().optional().describe("Only records not closed (won or lost)"),
        owner: z.string().optional().describe("Owner name or id, to scope to a person's records"),
        closingAfter: z.string().optional().describe("ISO date — only records with a close date on/after this"),
        closingBefore: z.string().optional().describe("ISO date — only records with a close date on/before this"),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
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
        // Resolve filter fields from the describe's semantic hints, never
        // hardcoded HubSpot names — so the same tool works on Salesforce.
        const stageField = describe.stageField;
        const amountField = describe.amountField;
        const ownerField = describe.ownerField;
        const closeDateField = describe.closeDateField;
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
        const query: SearchQuery = {
          ...(args.query ? { text: args.query } : {}),
          ...(filters.length > 0 ? { filters } : {}),
          ...(config.listView.defaultSort ? { sort: config.listView.defaultSort } : {}),
          limit: args.limit ?? 10,
          ...(args.cursor ? { cursor: args.cursor } : {}),
        };

        const page = await adapter.search(config.object, query);
        const currency = amountField ? byApi.get(amountField)?.currencyCode : undefined;
        const title = searchTitle(args, page.total ?? page.rows.length, config.object, currency);
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

  // --- crm_get_record → record-card widget (the flagship) ---
  registerAppTool(
    server,
    "crm_get_record",
    {
      title: "Show a CRM record card",
      description:
        "Render the configured record card for a single CRM record, with related lists and activity. " +
        "Pass id when known, otherwise a name query.",
      inputSchema: {
        object: z.string().default("deals"),
        id: z.string().optional().describe("Record id, when known"),
        query: z.string().optional().describe("Name text to resolve when id is unknown"),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: RECORD_CARD_URI } },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const config = await requireLayout(args.object);
        let id = args.id;
        let disambiguation = "";
        if (!id) {
          if (!args.query) throw new Error("Provide id or query.");
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

        const record = await adapter.getRecord(config.object, id, []);
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
        object: z.string().default("deals"),
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
            `Relationship "${args.relationship}" is not configured on the ${args.object} layout.`,
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

  // --- crm_list_view → results-table widget (or ambiguous-ask picker, 5b) ---
  registerAppTool(
    server,
    "crm_list_view",
    {
      title: "Open a saved CRM view",
      description:
        "Render a saved CRM view as an interactive table. PREFER this over crm_search when the ask " +
        "names a saved view or is a broad possessive ask like \"my deals\"; use crm_search only for " +
        "ad-hoc filters. Pass the user's phrasing as `query` — if it matches several views the widget " +
        "shows a picker and the choice is remembered. Exposed views: " +
        describeExposedViews(allExposedViews),
      inputSchema: {
        object: z.string().default("deals"),
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
        const page = await rowsForView(match, args.cursor);
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
        if (!homeCard) throw new Error("No home card is configured for this workspace.");

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
              const page = await rowsForView(entry);
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

  // --- crm_complete_task (widget-invoked after inline confirm, or model-invoked) ---
  server.registerTool(
    "crm_complete_task",
    {
      title: "Complete a CRM task",
      description: "Mark a CRM follow-up task as completed. This is a write and is logged.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
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

  // --- crm_update_record (widget-invoked after the confirmation diff, or model-invoked) ---
  server.registerTool(
    "crm_update_record",
    {
      title: "Update a CRM record",
      description:
        "Write field changes to a CRM record. Only fields the layout marks editable are writable. " +
        "Returns per-field outcomes — a validation failure on one field does not block the others.",
      inputSchema: {
        object: z.string().default("deals"),
        id: z.string(),
        patch: z
          .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .describe("Field API name → new value"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args): Promise<CallToolResult> => {
      try {
        await requireConnection();
        const config = await requireLayout(args.object);
        if (!config.permissions.writeEnabled) {
          throw new Error(`Writes are disabled for ${args.object}.`);
        }
        const describe = await adapter.describeObject(config.object);
        const describeByApi = new Map(describe.fields.map((f) => [f.api, f]));
        const caps = buildCapabilities(config, describeByApi);
        const patch = args.patch as Record<string, CrmFieldValue>;
        const disallowed = Object.keys(patch).filter(
          (field) => !caps.editableFields.includes(field),
        );
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

        const fields = Object.keys(patch);
        const before = await adapter.getRecord(config.object, args.id, fields);
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
          });
        }

        const sanitized = applyDenylist(config);
        const fresh = filterRecord(
          await adapter.getRecord(config.object, args.id, []),
          new Set(recordCardFieldPaths(sanitized)),
        );
        const recordName = String(fresh.fields[config.recordCard.header.title] ?? args.id);
        const payload: WriteReceiptPayload = {
          kind: "write-receipt",
          object: config.object,
          recordId: args.id,
          recordName,
          results,
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
        object: z.string().default("deals"),
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
          throw new Error(`Writes are disabled for ${args.object}.`);
        }
        const describe = await adapter.describeObject(config.object);
        const describeByApi = new Map(describe.fields.map((f) => [f.api, f]));
        const deny = config.permissions.fieldDenylist;
        for (const field of Object.keys(args.fields)) {
          const meta = describeByApi.get(field);
          if (!meta || meta.readOnly || deny.some((d) => field === d || field.startsWith(`${d}.`))) {
            throw new Error(`Field "${field}" is not writable for ${args.object}.`);
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
  const runFlow = async (
    args: { object: string; recordId: string; flowApiName: string },
    answers: Record<string, CrmFieldValue>,
    actionSessionId: string,
    tool: "crm_flow_start" | "crm_flow_continue",
  ): Promise<CallToolResult> => {
    try {
      await requireConnection();
      const config = await requireLayout(args.object);
      const action = config.recordCard.actions.find(
        (a): a is Extract<CardAction, { type: "screen_flow" }> =>
          a.type === "screen_flow" && a.flowApiName === args.flowApiName,
      );
      if (!action) {
        throw new Error(
          `Flow "${args.flowApiName}" is not configured on the ${args.object} card.`,
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
      const { resolved, pending, missing } = resolveActionInputs({ inputs, context, answers });
      const launchUrl = adapter.getFlowLaunchUrl?.(args.flowApiName) ?? null;

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

      const text =
        payload.status === "needs-input"
          ? `Flow "${flow.label}" needs input before it can run: ` +
            `${pending.filter((p) => p.required).map((p) => p.prompt).join("; ")}. ` +
            `Ask the rep, then call crm_flow_continue with { actionSessionId: "${actionSessionId}", answers }.`
          : `Flow "${flow.label}" is ready to run. It opens in ${payload.provenance.crmLabel}` +
            (flow.writesSummary ? ` — ${flow.writesSummary}` : "") +
            (payload.launchUrl
              ? ". The rep confirms and launches it from the card."
              : `. No launch URL is available yet — the rep may need to connect ${payload.provenance.crmLabel}.`);
      void tool;
      return {
        content: [{ type: "text", text }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return asToolError(error, { tool });
    }
  };

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
        object: z.string().default("deals"),
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
        object: z.string().default("deals"),
        recordId: z.string(),
        flowApiName: z.string(),
        actionSessionId: z.string(),
        answers: z
          .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .default({})
          .describe("Flow input name → value collected from the rep"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: FLOW_RUN_URI } },
    },
    async (args): Promise<CallToolResult> =>
      runFlow(
        { object: args.object, recordId: args.recordId, flowApiName: args.flowApiName },
        args.answers as Record<string, CrmFieldValue>,
        args.actionSessionId,
        "crm_flow_continue",
      ),
  );

  server.registerTool(
    "crm_flow_cancel",
    {
      title: "Cancel a CRM screen flow",
      description:
        "Abandon a flow the rep decided not to run. The server holds no interview state, so this just " +
        "acknowledges the cancellation for the conversation.",
      inputSchema: { flowApiName: z.string(), actionSessionId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async (args): Promise<CallToolResult> => ({
      content: [{ type: "text", text: `Cancelled flow "${args.flowApiName}". Nothing was run.` }],
      structuredContent: {
        kind: "flow-run",
        actionSessionId: args.actionSessionId,
        flowApiName: args.flowApiName,
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
