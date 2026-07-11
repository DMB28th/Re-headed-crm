/** Empty canvas — shown on every config surface while no CRM is connected. */
import Link from "next/link";

export function NoConnection() {
  return (
    <div className="mx-auto mt-16 max-w-[440px] rounded-[13px] border border-dashed border-line p-8 text-center">
      <span className="relative mx-auto inline-block h-6 w-6">
        <span className="absolute left-0 top-0 h-4 w-4 rounded-[4px] border-[1.6px] border-ink opacity-40" />
        <span className="absolute bottom-0 right-0 h-4 w-4 rounded-[4px] border-[1.6px] border-ink opacity-70" />
      </span>
      <h2 className="mt-3 text-[14px] font-semibold">No CRM connected</h2>
      <p className="mx-auto mt-1.5 max-w-[340px] text-[12.5px] text-ink-55">
        Studio is an empty canvas until you connect a CRM. Your layouts, lists and
        permissions are kept and come back when you reconnect.
      </p>
      <Link href="/connections" className="st-btn st-btn--primary mt-4 inline-block">
        Connect a CRM
      </Link>
    </div>
  );
}
