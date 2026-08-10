/**
 * Empty canvas — shown on every config surface while no CRM is connected.
 *
 * A workspace exists the moment someone signs in; the CRM connection is a
 * separate record and starts absent. So "unconnected" is not an error state,
 * it is the first screen of onboarding — and for a brand-new workspace the copy
 * must not promise that layouts "come back when you reconnect", because there
 * are none to come back.
 */
import Link from "next/link";

export function NoConnection({
  everConnected = true,
  otherWorkspaces = 0,
  workspaceName,
}: {
  everConnected?: boolean;
  /** Other Cardstack workspaces this account belongs to. */
  otherWorkspaces?: number;
  workspaceName?: string;
} = {}) {
  return (
    <div className="mx-auto mt-16 max-w-[440px] rounded-[13px] border border-dashed border-line p-8 text-center">
      <span className="relative mx-auto inline-block h-6 w-6">
        <span className="absolute left-0 top-0 h-4 w-4 rounded-[4px] border-[1.6px] border-ink opacity-40" />
        <span className="absolute bottom-0 right-0 h-4 w-4 rounded-[4px] border-[1.6px] border-ink opacity-70" />
      </span>
      <h2 className="mt-3 text-[14px] font-semibold">
        {everConnected ? "No CRM connected" : "Connect your CRM to begin"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[340px] text-[12.5px] text-ink-55">
        {everConnected
          ? "Studio is an empty canvas until you connect a CRM. Your layouts, lists and permissions are kept and come back when you reconnect."
          : "Cardstack reads your objects and fields from your CRM, then you design the cards your reps see in chat. Connecting takes about a minute."}
      </p>
      <Link href="/connections" className="st-btn st-btn--primary mt-4 inline-block">
        {everConnected ? "Connect a CRM" : "Get started"}
      </Link>
      {!everConnected && otherWorkspaces > 0 && (
        // The "where did my cards go?" moment. A sandbox is a different
        // Salesforce org, so it is a different workspace — and someone who set
        // cards up in one and signed in to the other sees an empty Studio with
        // no explanation, which looks exactly like data loss.
        <p className="mx-auto mt-4 max-w-[340px] text-[12px] text-ink-45">
          {workspaceName ? <>You&rsquo;re in <strong>{workspaceName}</strong>. </> : null}
          You belong to {otherWorkspaces} other Cardstack workspace
          {otherWorkspaces === 1 ? "" : "s"}. Each Salesforce org gets its own — including sandboxes
          — so cards and lists don&rsquo;t carry across.
        </p>
      )}
    </div>
  );
}
