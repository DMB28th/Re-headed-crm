/**
 * Cardstack MCP App server (M1 tool surface, read paths).
 * SEP-1865 mechanics via @modelcontextprotocol/ext-apps — resource mimeType and
 * _meta shapes come from the shipped SDK, per CLAUDE.md rule 7.
 */
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
  type CrmFieldValue,
  type FieldFilter,
  type FieldWriteResult,
  type LayoutConfig,
  type SearchQuery,
  type WriteReceiptPayload,
} from "@cardstack/core";
import { CrmValidationError, type CrmAdapter } from "@cardstack/crm-adapters";
import { getWidgetHtml, type WidgetName } from "@cardstack/widgets";
import { DEMO_TENANT_ID, InMemoryConfigStore, type ConfigStore } from "./config/store.js";
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
}

const RECORD_CARD_URI = "ui://cardstack/record-card";
const RESULTS_TABLE_URI = "ui://cardstack/results-table";
const HOME_CARD_URI = "ui://cardstack/home-card";

const OPEN_STAGE_EXCLUSIONS = ["Closed won", "Closed lost"];

/**
 * Async because tool descriptions are tenant-specific: the exposed views'
 * names + aliases are baked into crm_list_view's description so model routing
 * works ("show me my deals" → the view, not ad-hoc search).
 */
export async function createCardstackServer(deps: ServerDeps): Promise<McpServer> {
  const server = new McpServer({ name: "Cardstack CRM", version: "0.0.1" });
  const { adapter, configStore, auditLog, preferences, tenantId } = deps;

  const exposedViewsFor = async (object: string): Promise<ExposedView[]> => {
    const exposures = await configStore.getViewExposures(tenantId, object);
    const savedViews = await adapter.listSavedViews(object);
    const byId = new Map(savedViews.map((v) => [v.id, v]));
    return exposures.flatMap((exposure) => {
      const view = byId.get(exposure.viewId);
      // Drift (view deleted CRM-side) falls out here; Studio surfaces it in M3.
      return view ? [{ exposure, view }] : [];
    });
  };

  const allExposedViews: ExposedView[] = (
    await Promise.all(
      (await configStore.listConfiguredObjects(tenantId)).map((o) => exposedViewsFor(o)),
    )
  ).flat();

  const requireLayout = async (object: string): Promise<LayoutConfig> => {
    const config = await configStore.getLayout(tenantId, object);
    if (!config) {
      const configured = await configStore.listConfiguredObjects(tenantId);
      throw new Error(
        `No layout is configured for "${object}". Configured objects: ${configured.join(", ")}`,
      );
    }
    return config;
  };

  const asToolError = (error: unknown): CallToolResult => ({
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  });

  // --- Widget resources (one self-contained HTML bundle each) ---
  for (const [uri, widget] of [
    [RECORD_CARD_URI, "record-card"],
    [RESULTS_TABLE_URI, "results-table"],
    [HOME_CARD_URI, "home-card"],
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
        stage: z.string().optional().describe("Exact stage/pipeline-step filter"),
        openOnly: z.boolean().optional().describe("Only records not closed (won or lost)"),
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
        const config = await requireLayout(args.object);
        const filters: FieldFilter[] = [];
        if (args.stage) filters.push({ field: "dealstage", op: "eq", value: args.stage });
        if (args.openOnly) {
          for (const stage of OPEN_STAGE_EXCLUSIONS) {
            filters.push({ field: "dealstage", op: "neq", value: stage });
          }
        }
        if (args.minAmount !== undefined) {
          filters.push({ field: "amount", op: "gt", value: args.minAmount });
        }
        if (args.maxAmount !== undefined) {
          filters.push({ field: "amount", op: "lt", value: args.maxAmount });
        }
        const query: SearchQuery = {
          ...(args.query ? { text: args.query } : {}),
          ...(filters.length > 0 ? { filters } : {}),
          ...(config.listView.defaultSort ? { sort: config.listView.defaultSort } : {}),
          limit: args.limit ?? 10,
          ...(args.cursor ? { cursor: args.cursor } : {}),
        };

        const page = await adapter.search(config.object, query);
        const title = searchTitle(args, page.total ?? page.rows.length, config.object);
        const payload = await buildResultsTablePayload({ source: adapter, config, page, title });

        const top = page.rows[0];
        const topLine = top
          ? ` Largest/first: ${describeRow(top.fields)}.`
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
        return asToolError(error);
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

        return {
          content: [
            {
              type: "text",
              text: summarizeRecord(config, payload.record.fields) + disambiguation + fieldNotes(payload.meta, 4),
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error);
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
        return asToolError(error);
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
            await preferences.rememberViewChoice(tenantId, args.query, match.view.id);
          }
        } else if (args.query) {
          const rememberedId = await preferences.recallViewChoice(tenantId, args.query);
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
        const page = await adapter.getViewRows(match.view.id, args.cursor);
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
        return {
          content: [
            {
              type: "text",
              text:
                `Rendered saved view "${match.view.name}" (${page.total ?? page.rows.length} ${config.object}; ` +
                `filters from ${payload.provenance.crmLabel}: ${match.view.filterSummary}).` +
                (top ? ` First: ${describeRow(top.fields)}.` : ""),
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error);
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
        const homeCard = await configStore.getHomeCard(tenantId);
        if (!homeCard) throw new Error("No home card is configured for this workspace.");

        const listsBlock = homeCard.blocks.find((b) => b.type === "lists");
        const lists = [];
        if (listsBlock) {
          const wanted =
            listsBlock.source === "curated"
              ? allExposedViews.filter((e) => listsBlock.viewIds.includes(e.view.id))
              : allExposedViews;
          for (const entry of wanted.slice(0, listsBlock.maxTiles)) {
            const page = await adapter.getViewRows(entry.view.id);
            lists.push({
              viewId: entry.view.id,
              name: entry.view.name,
              filterSummary: entry.view.filterSummary,
              count: page.total ?? page.rows.length,
            });
          }
        }

        const recentBlock = homeCard.blocks.find((b) => b.type === "recent");
        const recent = recentBlock
          ? await adapter.listRecentRecords("me", recentBlock.limit)
          : [];
        const followupsBlock = homeCard.blocks.find((b) => b.type === "followups");
        const tasks = followupsBlock ? (await adapter.listTasks("me")).rows : [];

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
                  .map((l) => `${l.name}: ${l.count}`)
                  .join(", ")}), ${recent.length} recent records, ${tasks.length} open follow-ups` +
                (overdue > 0 ? ` (${overdue} overdue)` : "") +
                ".",
            },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return asToolError(error);
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
        const task = await adapter.completeTask(args.id);
        const writtenAs = await adapter.getConnectedUser();
        await auditLog.append({
          tenantId,
          user: writtenAs,
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
        return asToolError(error);
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

        return {
          content: [{ type: "text", text: receiptText(payload) }],
          structuredContent: payload as unknown as Record<string, unknown>,
          isError: false,
        };
      } catch (error) {
        return asToolError(error);
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
        return asToolError(error);
      }
    },
  );

  return server;
}

/** Model-facing mirror of the write receipt — same content the card collapses to (4c). */
function receiptText(payload: WriteReceiptPayload): string {
  const saved = payload.results.filter((r) => r.ok);
  const failed = payload.results.filter((r) => !r.ok);
  const changes = saved
    .map((r) => `${r.label} ${formatPlain(r.before)}→${formatPlain(r.after)}`)
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

function formatPlain(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function searchTitle(
  args: { openOnly?: boolean; minAmount?: number; maxAmount?: number; stage?: string; query?: string },
  total: number,
  object: string,
): string {
  const usd = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  const parts: string[] = [String(total)];
  if (args.openOnly) parts.push("open");
  parts.push(object);
  const qualifiers: string[] = [];
  if (args.minAmount !== undefined) qualifiers.push(`over ${usd(args.minAmount)}`);
  if (args.maxAmount !== undefined) qualifiers.push(`under ${usd(args.maxAmount)}`);
  if (args.stage) qualifiers.push(`in ${args.stage}`);
  if (args.query) qualifiers.push(`matching "${args.query}"`);
  return [parts.join(" "), ...qualifiers].join(" ");
}

function describeRow(fields: Record<string, unknown>): string {
  const name = fields.dealname ?? fields.name ?? "unnamed";
  const amount =
    typeof fields.amount === "number"
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(fields.amount)
      : undefined;
  const stage = fields.dealstage;
  return [name, amount, stage ? `(${stage})` : undefined].filter(Boolean).join(" ");
}

function summarizeRecord(
  config: LayoutConfig,
  fields: Record<string, unknown>,
): string {
  const title = fields[config.recordCard.header.title] ?? "record";
  const badge = config.recordCard.header.badge
    ? fields[config.recordCard.header.badge]
    : undefined;
  const detail = describeRow(fields);
  return `Rendered ${config.object} card for "${title}"${badge ? `, stage ${badge}` : ""}. ${detail}.`;
}
