/**
 * Flow-run card (design 10a, HANDOFF rung) — shared by the MCP widget shell and
 * Studio's preview. The flow runs in the CRM; this card resolves/collects inputs
 * and hands off via the host's openLink. It never drives interview screens.
 */
import { useState } from "react";
import type { FlowRunPayload } from "@cardstack/core";
import { MakerChip } from "../shared/components.tsx";
import type { WidgetHost } from "../record-card/card.tsx";

function displayValue(value: FlowRunPayload["resolvedInputs"][number]["value"]): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function FlowRunCard({
  payload,
  host,
}: {
  payload: FlowRunPayload;
  host: WidgetHost | null;
}) {
  const [launched, setLaunched] = useState(false);
  const crmLabel = payload.provenance?.crmLabel ?? "the CRM";

  if (payload.status === "cancelled") {
    return (
      <div className="cs-card fr">
        <header className="fr-header">
          <h1 className="fr-title">{payload.flowLabel || payload.flowApiName}</h1>
          <span className="cs-muted fr-sub">Cancelled — nothing was run.</span>
        </header>
      </div>
    );
  }

  const needsInput = payload.status === "needs-input";
  const canLaunch = payload.status === "ready" && !!payload.launchUrl;
  // Embedded rung: render the CRM's own flow page inline (opt-in per flow). It
  // only loads if the org allows this origin in its CSP/Trusted Sites and the
  // rep has a live CRM session — the open-in-CRM fallback always works.
  const embedded = payload.renderMode === "embedded" && canLaunch;

  const launch = () => {
    if (!payload.launchUrl) return;
    host?.openLink?.(payload.launchUrl);
    host?.updateModelContext?.(
      `Opened flow "${payload.flowLabel}" in ${crmLabel}. The rep completes it there; ${crmLabel} owns the write.`,
    );
    setLaunched(true);
  };

  return (
    <div className="cs-card fr">
      <header className="fr-header">
        <div className="fr-headrow">
          <h1 className="fr-title">{payload.flowLabel || payload.flowApiName}</h1>
          <span className="fr-chip">Runs in {crmLabel}</span>
        </div>
        <span className="cs-muted fr-sub">
          {payload.screens > 0 ? `${payload.screens} screens · ` : ""}
          {payload.writesSummary}
        </span>
      </header>

      {payload.resolvedInputs.length > 0 && (
        <section className="fr-section">
          <h2 className="fr-label">Inputs</h2>
          <dl className="fr-inputs">
            {payload.resolvedInputs.map((input) => (
              <div className="fr-input" key={input.name}>
                <dt className="fr-input-name">{input.name}</dt>
                <dd className="fr-input-value">{displayValue(input.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {needsInput && payload.pendingInputs.length > 0 && (
        <section className="fr-section">
          <h2 className="fr-label">Chat will collect</h2>
          <ul className="fr-pending">
            {payload.pendingInputs.map((p) => (
              <li className="fr-pending-item" key={p.name}>
                {p.prompt}
                {p.required ? <span className="fr-req"> *</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {embedded && (
        <section className="fr-section">
          <div className="fr-embed">
            <iframe
              src={payload.launchUrl ?? ""}
              title={payload.flowLabel || payload.flowApiName}
              className="fr-embed-frame"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            />
          </div>
        </section>
      )}

      <footer className="fr-footer">
        {embedded ? (
          <span className="cs-muted fr-note">
            Embedded from {crmLabel}. If it doesn&apos;t load, allow this app&apos;s origin in{" "}
            {crmLabel} (CSP / Trusted Sites) or{" "}
            <button type="button" className="fr-inline-link" onClick={launch}>
              open in {crmLabel} ↗
            </button>
            .
          </span>
        ) : canLaunch ? (
          <>
            <button type="button" className="fr-launch" onClick={launch}>
              {launched ? `Opened in ${crmLabel} ↗` : `Open in ${crmLabel} ↗`}
            </button>
            <span className="cs-muted fr-note">
              {launched
                ? `Complete the flow in ${crmLabel}; the write happens there.`
                : `${crmLabel} owns the screens and the write.`}
            </span>
          </>
        ) : (
          <span className="cs-muted fr-note">
            {needsInput
              ? "Provide the inputs above in chat to enable launch."
              : `No launch link is available — connect ${crmLabel} to run this flow.`}
          </span>
        )}
        <MakerChip provenance={payload.provenance} />
      </footer>
    </div>
  );
}
