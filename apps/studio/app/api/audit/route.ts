import { NextResponse } from "next/server";
import { getAuditLog, requireTenantId } from "../../../lib/backend";

/** GET /api/audit — recent chat writes. ?format=csv flattens to one row per
 *  field change (timestamp,user,object,recordId,field,before,after). */
export async function GET(req: Request) {
  const TENANT_ID = await requireTenantId();
  try {
    const entries = await (await getAuditLog()).list(TENANT_ID);
    const url = new URL(req.url);
    if (url.searchParams.get("format") === "csv") {
      const rows = [["timestamp", "user", "object", "recordId", "field", "before", "after"]];
      for (const e of entries) {
        for (const c of e.changes) {
          rows.push([
            e.timestamp,
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
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
