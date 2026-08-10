import { NextResponse } from "next/server";
import type { AuditQuery } from "@cardstack/config-store";
import { getAuditLog, getStore } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

/**
 * GET /api/audit — confirmed chat writes, filtered and paged.
 *
 * Filters: object, actor, q (record id or field), from, to, limit, offset.
 * `?format=csv` flattens to one row per field change and applies THE SAME
 * filters — an export you can't scope to what you're looking at isn't much use
 * to whoever asked for it.
 */
function queryFromUrl(url: URL): AuditQuery {
  const get = (key: string) => url.searchParams.get(key)?.trim() || undefined;
  const to = get("to");
  return {
    ...(get("object") ? { object: get("object")! } : {}),
    ...(get("actor") ? { actor: get("actor")! } : {}),
    ...(get("q") ? { q: get("q")! } : {}),
    ...(get("from") ? { from: get("from")! } : {}),
    // A bare date means "through the end of that day", not midnight.
    ...(to ? { to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to } : {}),
  };
}

export async function GET(req: Request) {
  try {
    const { tenantId } = getUserContextFromRequest(req);
    const url = new URL(req.url);
    const log = await getAuditLog();
    const filters = queryFromUrl(url);

    if (url.searchParams.get("format") === "csv") {
      // Export every matching row, not just the page on screen.
      const { entries } = await log.query(tenantId, { ...filters, limit: 10_000, offset: 0 });
      const rows = [
        ["timestamp", "actor", "actorEmail", "writtenAs", "object", "recordId", "field", "before", "after"],
      ];
      for (const e of entries) {
        for (const c of e.changes) {
          rows.push([
            e.timestamp,
            e.actor?.name ?? "",
            e.actor?.email ?? "",
            e.user,
            e.object,
            e.recordId,
            c.field,
            String(c.before ?? ""),
            String(c.after ?? ""),
          ]);
        }
      }
      const csv = rows
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="cardstack-audit.csv"',
        },
      });
    }

    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
    const page = await log.query(tenantId, { ...filters, limit, offset });
    // Object filter options come from what's configured, not from scanning the
    // log, so the dropdown is stable even when a period has no writes.
    const objects = await (await getStore()).listConfiguredObjects(tenantId).catch(() => []);
    return NextResponse.json({ ...page, limit, offset, objects });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
