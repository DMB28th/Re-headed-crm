import { useState, type ReactNode } from "react";
import type { ErrorPayload, WidgetProvenance } from "@cardstack/core";

export function MakerChip({ provenance }: { provenance: WidgetProvenance }) {
  return (
    <span className="cs-maker-chip">
      <span className="cs-maker-glyph" aria-hidden="true" />
      {provenance.crmLabel} · via Cardstack
    </span>
  );
}

export function LayoutChip({ provenance }: { provenance: WidgetProvenance }) {
  return <span className="cs-mono-chip">layout v{provenance.layoutRevision}</span>;
}

export function StagePill({ value, tone }: { value: string; tone: string }) {
  const toneClass = tone === "neutral" ? "" : ` cs-pill--${tone}`;
  return <span className={`cs-pill${toneClass}`}>{value}</span>;
}

/** Muted "—" for nulls — always rendered, never hidden (design rule). */
export function NullValue() {
  return (
    <span className="cs-null" aria-label="No value">
      —
    </span>
  );
}

/**
 * ⓘ popover (design 1a): the CRM's own field description plus the field facts
 * a rep asks about — type and whether it's editable from chat.
 */
export function FieldInfo({
  description,
  detail,
  crmLabel,
}: {
  description?: string;
  /** e.g. "currency · editable from chat" or "picklist · read-only in HubSpot". */
  detail: string;
  crmLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="cs-info"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="note"
      aria-label={description ?? detail}
    >
      <i className="cs-info-icon">i</i>
      {open && (
        <span className="cs-tooltip" role="tooltip">
          {description && <span className="cs-tooltip-description">{description}</span>}
          <span className="cs-tooltip-detail">{detail}</span>
          {description && (
            <span className="cs-tooltip-attribution">Field description from {crmLabel}</span>
          )}
        </span>
      )}
    </span>
  );
}

export function Skeleton({ width, height = 12 }: { width: string; height?: number }) {
  return <div className="cs-skeleton" style={{ width, height }} />;
}

export function LoadingCard({ label }: { label: string }) {
  return (
    <div className="cs-card" style={{ padding: 20 }} aria-busy="true">
      <Skeleton width="45%" height={17} />
      <div style={{ height: 10 }} />
      <Skeleton width="30%" />
      <div style={{ height: 22 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Skeleton width="80%" />
        <Skeleton width="70%" />
        <Skeleton width="75%" />
        <Skeleton width="60%" />
      </div>
      <div style={{ height: 18 }} />
      <span className="cs-muted" style={{ fontSize: 12 }}>
        {label}
      </span>
    </div>
  );
}

export function MessageCard({
  title,
  body,
  action,
  provenance,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  /** When available, the maker chip renders bottom-right — every widget carries it. */
  provenance?: WidgetProvenance;
}) {
  return (
    <div className="cs-card" style={{ padding: 24, textAlign: "center" }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      {body && (
        <div className="cs-muted" style={{ fontSize: 12.5, marginTop: 6 }}>
          {body}
        </div>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
      {provenance && (
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <MakerChip provenance={provenance} />
        </div>
      )}
    </div>
  );
}

/** Structural slice of WidgetHost — shared/ must not import from record-card/. */
interface ErrorCardHost {
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ isError?: boolean | undefined; structuredContent?: unknown }>;
  sendFollowup?(text: string): void;
}

/**
 * Typed tool-failure card (design 1e). "unauthorized" gets the re-auth
 * treatment ("{CRM} connection expired" + "Reconnect {CRM}"); everything else
 * gets the error message + Retry re-invoking the original call. Never says
 * "Nothing was written." — that copy is reserved for write failures.
 */
export function ErrorCard<P>({
  payload,
  host,
  onPayload,
}: {
  payload: ErrorPayload;
  host: ErrorCardHost | null;
  /** Successful retry swaps in the fresh payload (typed by the consuming shell). */
  onPayload: (payload: P) => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const crm = payload.crmLabel ?? "Your CRM";

  const retry = async () => {
    if (!host || !payload.retry) return;
    setRetrying(true);
    try {
      const result = await host.callTool(payload.retry.tool, payload.retry.args);
      if (result.structuredContent) onPayload(result.structuredContent as P);
    } finally {
      setRetrying(false);
    }
  };

  if (payload.reason === "unauthorized") {
    return (
      <MessageCard
        title={`${crm} connection expired`}
        body={payload.message}
        action={
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={() =>
              host?.sendFollowup?.(
                `My ${crm} connection expired — please ask the admin to reconnect ${crm} in Cardstack Studio.`,
              )
            }
          >
            Reconnect {crm}
          </button>
        }
      />
    );
  }

  const title =
    payload.reason === "crm-unavailable"
      ? `${crm} didn't respond`
      : payload.reason === "not-found"
        ? `${crm} couldn't find that record`
        : "Something went wrong";
  return (
    <MessageCard
      title={title}
      body={payload.message}
      action={
        payload.retry ? (
          <button type="button" className="cs-btn" onClick={retry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry"}
          </button>
        ) : undefined
      }
    />
  );
}
