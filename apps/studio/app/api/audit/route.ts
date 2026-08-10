import { NextResponse } from "next/server";
import { getAuditLog } from "../../../lib/backend";
import { getUserContextFromRequest } from "../../../lib/auth";

/** GET /api/audit — recent chat writes. ?format=csv flattens to one row per
 *  field change (timestamp,actor,writtenAs,object,recordId,field,before,after). */
export async function GET(req: Request) {
  try {
    const { tenantId } = await getUserContextFromRequest(req);
    const entries = await (await getAuditLog()).list(tenantId);
    const url = new URL(req.url);
    if (url.searchParams.get("format") === "csv") {
      const rows = [
        [
          "timestamp",
          "actor",
          "actorEmail",
          "writtenAs",
          "object",
          "recordId",
          "field",
          "before",
          "after",
          // Blank for entries logged before provenance was recorded — an empty
          // cell, never a guessed one, since this is the compliance export.
          "confirmedVia",
          "confirmationId",
        ],
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
            e.confirmation?.via ?? "",
            e.confirmation?.confirmationId ?? "",
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
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
