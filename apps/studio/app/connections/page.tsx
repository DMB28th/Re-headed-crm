/** Connections (design 2c) — mock portal while adapters are mock-only. */
export default function ConnectionsPage() {
  return (
    <div className="max-w-[620px]">
      <h1 className="text-[16px] font-semibold">Connections</h1>
      <p className="mt-1 text-[12.5px] text-ink-55">
        One CRM per workspace — switching disconnects and archives your layouts.
      </p>

      <div className="st-card mt-5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-success-dot" />
            <span className="text-[13.5px] font-semibold">HubSpot</span>
            <span className="st-chip-mono bg-published text-published-ink">connected</span>
          </div>
          <span className="st-chip-mono bg-crmmeta text-crmmeta-ink">mock portal</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
          <dt className="text-ink-55">Connected as</dt>
          <dd>Dan K.</dd>
          <dt className="text-ink-55">Token</dt>
          <dd>healthy · auto-refresh on</dd>
          <dt className="text-ink-55">Metadata sync</dt>
          <dd>60 fields · 4 saved views · just now</dd>
        </dl>
      </div>

      <div className="st-card mt-4 p-4 opacity-60">
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-semibold">Salesforce</span>
          <span className="text-[11.5px] text-ink-45">Production / Sandbox · OAuth lands with the live adapters</span>
        </div>
      </div>
    </div>
  );
}
