/**
 * Honesty banner for authoring surfaces whose chat runtime hasn't shipped yet.
 *
 * The flows + custom-screen editors let an admin configure and publish durable
 * config, but the MCP server does not yet render/execute it (the M5 flow runtime
 * and M6 custom-screen executor are still open). Without this notice an admin
 * could publish a flow action that silently no-ops for reps. Remove the banner
 * from a surface once its runtime lands.
 */
export function RuntimePendingBanner({
  feature,
  milestone = "a later milestone",
}: {
  feature: string;
  milestone?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] border border-line-soft bg-paper px-4 py-3">
      <span className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn-dot" />
      <div className="text-[12px] leading-snug text-ink-55">
        <span className="font-semibold text-ink-55">Preview — not yet live.</span>{" "}
        {feature} can be configured and published here, but the chat runtime that renders and
        executes it ships in {milestone}. Publishing stores the durable config; a rep won&apos;t
        see it act yet.
      </div>
    </div>
  );
}
