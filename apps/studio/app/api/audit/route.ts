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
 * to whoever asked for it. It is also COMPLETE: the export streams page by
 * page until the query is exhausted rather than taking the newest N. A
 * compliance export that silently drops the oldest rows is worse than one that
 * refuses, because it looks finished.
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
      const header = [
        "timestamp", "actor", "actorEmail", "writtenAs", "object", "recordId", "field", "before", "after",
      ];
      const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const PAGE = 1000;

      // Streamed and paged: memory stays bounded by one page, and there is no
      // cap to silently hit. The client sees rows as they're produced.
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`${header.map(cell).join(",")}\n`));
          for (let offset = 0; ; offset += PAGE) {
            const page = await log.query(tenantId, { ...filters, limit: PAGE, offset });
            for (const entry of page.entries) {
              for (const change of entry.changes) {
                controller.enqueue(
                  encoder.encode(
                    [
                      entry.timestamp,
                      entry.actor?.name ?? "",
                      entry.actor?.email ?? "",
                      entry.user,
                      entry.object,
                      entry.recordId,
                      change.field,
                      change.before,
                      change.after,
                    ]
                      .map(cell)
                      .join(",") + "\n",
                  ),
                );
              }
            }
            // Stop when the page came back short — the query is exhausted.
            if (page.entries.length < PAGE) break;
          }
          controller.close();
        },
      });

      return new NextResponse(stream, {
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
