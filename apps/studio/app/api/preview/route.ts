import { NextResponse } from "next/server";
import {
  buildRecordCardPayload,
  buildResultsTablePayload,
  genericLayoutConfig,
  parseLayoutConfig,
  primaryNameField,
  summarizeCustomFilters,
  type CrmFieldValue,
  type CustomList,
  type FieldWriteResult,
  type HomeCardConfig,
  type HomeCardPayload,
  type LayoutConfig,
  type LookupOptionsPayload,
  type UpdatePreviewPayload,
  type WriteReceiptPayload,
} from "@cardstack/core";
import { HomeCardConfig as HomeCardConfigSchema } from "@cardstack/core";
import { CrmValidationError } from "@cardstack/crm-adapters";
import { scopeViewExposuresForUser } from "@cardstack/config-store";
import { getAdapter, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

/**
 * Server-side preview assembly — the builders render EXACTLY what the MCP
 * server would serve, against the tenant's REAL connection (mock portal or a
 * live CRM). Safety: on a live connection every write path here is disabled
 * (capabilities.writeEnabled=false + write kinds refuse) — builder previews
 * must never mutate a production CRM.
 */

interface PreviewBody {
  kind:
    | "record"
    | "view"
    | "home"
    | "related"
    | "lookup"
    | "preview-write"
    | "write"
    | "complete-task";
  object?: string;
  config?: unknown;
  recordId?: string;
  viewId?: string;
  relationship?: string;
  patch?: Record<string, CrmFieldValue>;
  id?: string;
  limit?: number;
  /** kind "lookup": typeahead text for the reference-field editor. */
  query?: string;
}

async function layoutFor(tenantId: string, object: string, posted?: unknown): Promise<LayoutConfig> {
  if (posted) return parseLayoutConfig(posted);
  const record = await (await getStore()).getLayoutRecord(tenantId, object);
  const config = record.published ?? record.draft;
  if (!config) throw new Error(`No layout configured for ${object}.`);
  return config;
}

export async function POST(req: Request) {
  try {
    const user = await getUserContextFromRequest(req);
    const { tenantId } = user;
    const body = (await req.json()) as PreviewBody;
    const store = await getStore();
    const adapter = await getAdapter(tenantId);
    const connection = await store.getConnection(tenantId);
    const live = !!connection.credentials && Object.keys(connection.credentials).length > 0;

    if (body.kind === "record") {
      if (!body.object) throw new Error("object required");
      // Drill-through in a preview can target an object other than the layout
      // under edit (a related row, a reference field). Use the posted config
      // only when it matches; otherwise the stored layout; otherwise the same
      // generated read-only all-fields fallback the MCP server serves.
      const posted = body.config ? parseLayoutConfig(body.config) : undefined;
      let config: LayoutConfig;
      if (posted && posted.object === body.object) {
        config = posted;
      } else {
        const stored = await store.getLayoutRecord(tenantId, body.object);
        const storedConfig = stored.published ?? stored.draft;
        config =
          storedConfig ??
          genericLayoutConfig({
            tenantId,
            crm: connection.crm,
            object: body.object,
            describe: await adapter.describeObject(body.object),
          });
      }
      const record = body.recordId
        ? await adapter.getRecord(config.object, body.recordId, [])
        : (await adapter.search(config.object, { limit: 1 })).rows[0];
      if (!record) throw new Error(`No ${config.object} records to preview against.`);
      const full = await adapter.getRecord(config.object, record.id, []);
      const payload = await buildRecordCardPayload({ source: adapter, config, record: full });
      if (live) payload.capabilities = { ...payload.capabilities, writeEnabled: false };
      return NextResponse.json({ payload, live });
    }

    if (body.kind === "view") {
      if (!body.object || !body.viewId) throw new Error("object and viewId required");
      const config = await layoutFor(tenantId, body.object, body.config);
      const fullExposures = await store.getViewExposuresConfig(tenantId, body.object);
      const custom = (fullExposures ? scopeViewExposuresForUser(fullExposures, user).customLists : []).find(
        (c) => c.id === body.viewId,
      );
      let page;
      let name = body.viewId;
      let filterSummary = "";
      if (custom) {
        page = await adapter.search(body.object, {
          ...(custom.filters.length > 0 ? { filters: custom.filters } : {}),
          ...(custom.sort ? { sort: custom.sort } : {}),
        });
        name = custom.name;
        filterSummary = summarizeCustomFilters(custom);
      } else {
        const views = await adapter.listSavedViews(body.object);
        const view = views.find((v) => v.id === body.viewId);
        page = await adapter.getViewRows(body.viewId);
        name = view?.name ?? body.viewId;
        filterSummary = view?.filterSummary ?? "";
      }
      const payload = await buildResultsTablePayload({
        source: adapter,
        config,
        page,
        title: name,
        savedViewName: name,
        savedViewId: body.viewId,
        savedViewFilterSummary: filterSummary,
      });
      return NextResponse.json({ payload, live });
    }

    if (body.kind === "home") {
      const config: HomeCardConfig = HomeCardConfigSchema.parse(body.config);
      const objects = await store.listConfiguredObjects(tenantId);
      const listsBlock = config.blocks.find((b) => b.type === "lists");
      const lists = [];
      if (listsBlock) {
        interface Entry {
          viewId: string;
          object: string;
          name: string;
          filterSummary: string;
          custom?: CustomList;
        }
        const entries: Entry[] = [];
        for (const object of objects) {
          const fullExposures = await store.getViewExposuresConfig(tenantId, object);
          const scopedExposures = fullExposures
            ? scopeViewExposuresForUser(fullExposures, user)
            : null;
          const exposures = scopedExposures?.views.filter((view) => view.exposed) ?? [];
          const customs = new Map(
            (scopedExposures?.customLists ?? []).map((c) => [c.id, c]),
          );
          const savedViews = await adapter.listSavedViews(object).catch(() => []);
          for (const exposure of exposures) {
            const custom = customs.get(exposure.viewId);
            if (custom) {
              entries.push({
                viewId: custom.id,
                object,
                name: custom.name,
                filterSummary: summarizeCustomFilters(custom),
                custom,
              });
              continue;
            }
            const view = savedViews.find((v) => v.id === exposure.viewId);
            if (view) {
              entries.push({
                viewId: view.id,
                object,
                name: view.name,
                filterSummary: view.filterSummary,
              });
            }
          }
        }
        const wanted =
          listsBlock.source === "curated"
            ? entries.filter((e) => listsBlock.viewIds.includes(e.viewId))
            : entries;
        for (const entry of wanted.slice(0, listsBlock.maxTiles)) {
          const page = entry.custom
            ? await adapter.search(entry.object, {
                ...(entry.custom.filters.length > 0 ? { filters: entry.custom.filters } : {}),
                ...(entry.custom.sort ? { sort: entry.custom.sort } : {}),
              })
            : await adapter
                .getViewRows(entry.viewId)
                .catch(() => ({ rows: [], hasMore: false, total: 0 }));
          lists.push({
            viewId: entry.viewId,
            name: entry.name,
            filterSummary: entry.filterSummary,
            count: page.total ?? page.rows.length,
          });
        }
      }
      const recentBlock = config.blocks.find((b) => b.type === "recent");
      const followupsBlock = config.blocks.find((b) => b.type === "followups");
      // A missing tasks/recents scope must not kill the whole preview.
      const payload: HomeCardPayload = {
        kind: "home-card",
        blocks: config.blocks,
        lists,
        recent: recentBlock
          ? await adapter.listRecentRecords("me", recentBlock.limit).catch(() => [])
          : [],
        tasks: followupsBlock
          ? (await adapter.listTasks("me").catch(() => ({ rows: [], hasMore: false }))).rows
          : [],
        capabilities: { writeEnabled: !live },
        provenance: {
          crm: connection.crm,
          crmLabel: connection.crm === "salesforce" ? "Salesforce" : "HubSpot",
          layoutRevision: config.revision,
          connectedUser: await adapter.getConnectedUser().catch(() => "—"),
          fetchedAt: new Date().toISOString(),
        },
      };
      return NextResponse.json({ payload, live });
    }

    if (body.kind === "related") {
      if (!body.object || !body.recordId || !body.relationship) {
        throw new Error("object, recordId and relationship required");
      }
      const config = await layoutFor(tenantId, body.object, body.config);
      const rel = config.recordCard.relatedLists.find((r) => r.relationship === body.relationship);
      if (!rel) throw new Error(`Relationship "${body.relationship}" not configured.`);
      const page = await adapter.getRelated(body.recordId, {
        ...rel,
        limit: body.limit ?? rel.limit,
      });
      return NextResponse.json({ payload: { page }, live });
    }

    if (body.kind === "lookup") {
      if (!body.object || body.query === undefined) throw new Error("object and query required");
      // Same shape crm_lookup_search serves — the lookup editor in the REAL
      // widget works identically in the builder preview.
      const describe = await adapter.describeObject(body.object);
      const nameField = primaryNameField(describe);
      const page = await adapter.search(body.object, {
        text: body.query,
        columns: [nameField],
        limit: Math.min(body.limit ?? 7, 10),
      });
      const payload: LookupOptionsPayload = {
        kind: "lookup-options",
        object: body.object,
        options: page.rows.map((r) => ({
          id: r.id,
          label: String(r.fields[nameField] ?? r.id),
        })),
      };
      return NextResponse.json({ payload, live });
    }

    // --- Write simulation: MOCK PORTAL ONLY ---
    if (live) {
      return NextResponse.json(
        { error: "Preview writes are disabled on a live CRM connection — test writes from chat instead." },
        { status: 403 },
      );
    }

    if (body.kind === "complete-task") {
      if (!body.id) throw new Error("id required");
      const task = await adapter.completeTask(body.id);
      return NextResponse.json({
        payload: { task },
        text: `Preview: completed "${task.subject}" (simulated — mock portal only).`,
        live,
      });
    }

    // The confirmation diff the card shows before a write. In chat this is
    // crm_preview_update, which mints a signed token the audit log verifies;
    // here there is nothing to attest — builder writes hit the mock portal and
    // are never audited — so the token is a visible placeholder rather than
    // something that could be mistaken for a real confirmation.
    if (body.kind === "preview-write") {
      if (!body.object || !body.recordId || !body.patch) {
        throw new Error("object, recordId and patch required");
      }
      const config = await layoutFor(tenantId, body.object, body.config);
      const patch = body.patch;
      const before = await adapter.getRecord(config.object, body.recordId, Object.keys(patch));
      const describe = await adapter.describeObject(config.object);
      const changes = Object.entries(patch)
        .filter(([field, value]) => (before.fields[field] ?? null) !== (value ?? null))
        .map(([field, value]) => ({
          field,
          label: describe.fields.find((f) => f.api === field)?.label ?? field,
          before: before.fields[field] ?? null,
          after: value ?? null,
        }));
      if (changes.length === 0) {
        return NextResponse.json(
          { error: "Nothing to change — every value matches what's already in the mock portal." },
          { status: 400 },
        );
      }
      const named = await adapter.getRecord(config.object, body.recordId, [
        config.recordCard.header.title,
      ]);
      const payload: UpdatePreviewPayload = {
        kind: "update-preview",
        object: config.object,
        recordId: body.recordId,
        recordName: String(named.fields[config.recordCard.header.title] ?? body.recordId),
        changes,
        confirmToken: "preview-not-a-real-confirmation",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        provenance: {
          crm: config.crm,
          crmLabel: config.crm === "hubspot" ? "HubSpot" : "Salesforce",
          layoutRevision: config.revision,
        },
      };
      return NextResponse.json({ payload, live });
    }

    if (body.kind === "write") {
      if (!body.object || !body.recordId || !body.patch) {
        throw new Error("object, recordId and patch required");
      }
      const config = await layoutFor(tenantId, body.object, body.config);
      const patch = body.patch;
      const before = await adapter.getRecord(config.object, body.recordId, Object.keys(patch));
      const describe = await adapter.describeObject(config.object);
      const results: FieldWriteResult[] = [];
      for (const [field, value] of Object.entries(patch)) {
        const label = describe.fields.find((f) => f.api === field)?.label ?? field;
        try {
          await adapter.updateRecord(config.object, body.recordId, { [field]: value });
          results.push({ field, label, before: before.fields[field] ?? null, after: value, ok: true });
        } catch (error) {
          results.push({
            field,
            label,
            before: before.fields[field] ?? null,
            after: before.fields[field] ?? null,
            ok: false,
            ...(error instanceof CrmValidationError
              ? { error: error.message }
              : { error: String(error) }),
          });
        }
      }
      const saved = results.filter((r) => r.ok);
      const fresh = await adapter.getRecord(config.object, body.recordId, []);
      // Saved lookup fields display the referenced record's NAME, not the id
      // the patch carried — same as the MCP server's receipt.
      for (const r of results) {
        if (r.ok && fresh.fields[r.field] !== undefined) r.after = fresh.fields[r.field]!;
      }
      const receipt: WriteReceiptPayload = {
        kind: "write-receipt",
        object: config.object,
        recordId: body.recordId,
        recordName: String(fresh.fields[config.recordCard.header.title] ?? body.recordId),
        results,
        savedCount: saved.length,
        failedCount: results.length - saved.length,
        writtenAs: `${await adapter.getConnectedUser()} (preview)`,
        timestamp: new Date().toISOString(),
        record: fresh,
        provenance: {
          crm: config.crm,
          crmLabel: config.crm === "hubspot" ? "HubSpot" : "Salesforce",
          layoutRevision: config.revision,
        },
      };
      return NextResponse.json({
        payload: receipt,
        text: `Preview write: ${saved.length}/${results.length} fields saved (simulated — mock portal only).`,
        live,
      });
    }

    throw new Error(`unknown preview kind`);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
