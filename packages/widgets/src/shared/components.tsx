import { useState, type ReactNode } from "react";
import type { WidgetProvenance } from "@cardstack/core";

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
}: {
  title: string;
  body?: string;
  action?: ReactNode;
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
    </div>
  );
}
