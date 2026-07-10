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
import type { FieldFilter, LayoutConfig, SearchQuery } from "@cardstack/core";
import type { CrmAdapter } from "@cardstack/crm-adapters";
import { getWidgetHtml, type WidgetName } from "@cardstack/widgets";
import { DEMO_TENANT_ID, InMemoryConfigStore, type ConfigStore } from "./config/store.js";
import {
  buildRecordCardPayload,
  buildResultsTablePayload,
  fieldNotes,
} from "./payloads.js";

export interface ServerDeps {
  adapter: CrmAdapter;
  configStore: ConfigStore;
  /** M1: single-tenant. OAuth 2.1 token → tenant resolution lands in M7. */
  tenantId: string;
}

const RECORD_CARD_URI = "ui://cardstack/record-card";
const RESULTS_TABLE_URI = "ui://cardstack/results-table";

const OPEN_STAGE_EXCLUSIONS = ["Closed won", "Closed lost"];

export function createCardstackServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: "Cardstack CRM", version: "0.0.1" });
  const { adapter, configStore, tenantId } = deps;

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
        "Search CRM records and render an interactive results table. " +
        "Use openOnly to exclude closed/won/lost records; minAmount/maxAmount filter on the amount field.",
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
        const payload = await buildResultsTablePayload({ adapter, config, page, title });

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
        const payload = await buildRecordCardPayload({ adapter, config, record });

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

  return server;
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
