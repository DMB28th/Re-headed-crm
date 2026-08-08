import { useState, type ReactNode } from "react";
import type { ErrorPayload, WidgetProvenance } from "@cardstack/core";
import { formatAsOf } from "./format.ts";

/**
 * "as of 2:32 PM" — a card in a chat scrollback is a snapshot, and an old one
 * looks identical to a live one without this (design 1e's stale strip is the
 * full treatment; this is the down-payment). Renders nothing when the payload
 * carries no fetchedAt.
 */
export function AsOfChip({
  provenance,
  locale,
}: {
  provenance: WidgetProvenance;
  locale: string;
}) {
  if (!provenance.fetchedAt) return null;
  return (
    <span className="cs-muted cs-as-of" title={provenance.fetchedAt}>
      as of {formatAsOf(provenance.fetchedAt, locale)}
    </span>
  );
}

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
 * treatment; everything else gets the error message + Retry re-invoking the
 * original call. Never says "Nothing was written." — that copy is reserved for
 * write failures.
 *
 * The two unauthorized cases are NOT the same (finding C1), and the server
 * decides which this is — the widget never guesses:
 *
 * - `user` — the reader's own CRM authorization ended. Only they can fix it,
 *   by reconnecting Cardstack in their chat app. The old card sent them to
 *   Studio to "ask the admin", which fails twice: an admin cannot reconnect
 *   someone else's per-user token, and Studio refuses non-admins a session, so
 *   the link dead-ends after four redirects.
 * - `admin` — the workspace's shared connection is broken. Naming the admin is
 *   the point; the reader may well not be one.
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
    // Default to the rep's own case: it is by far the common one, and it is the
    // one where sending them to an admin wastes their time.
    const kind = payload.reauth?.kind ?? "user";
    const who = payload.reauth?.adminName;

    if (kind === "admin") {
      return (
        <MessageCard
          title={`${crm} isn't connected`}
          body={
            who
              ? `${payload.message} ${who} can reconnect it in Cardstack Studio.`
              : `${payload.message} A workspace admin can reconnect it in Cardstack Studio.`
          }
          action={
            <button
              type="button"
              className="cs-btn cs-btn--primary"
              onClick={() =>
                host?.sendFollowup?.(
                  who
                    ? `Cardstack's ${crm} connection needs reconnecting — ask ${who} to do it in Cardstack Studio.`
                    : `Cardstack's ${crm} connection needs reconnecting — a workspace admin can do it in Cardstack Studio.`,
                )
              }
            >
              Tell me who to ask
            </button>
          }
        />
      );
    }

    const url = payload.reauth?.url;
    return (
      <MessageCard
        title={`Reconnect your ${crm} account`}
        body={`${payload.message} Nobody else can do this for you — it authorizes Cardstack as you.`}
        action={
          url ? (
            <a
              className="cs-btn cs-btn--primary"
              href={url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Reconnect {crm}
            </a>
          ) : (
            <button
              type="button"
              className="cs-btn cs-btn--primary"
              onClick={() =>
                host?.sendFollowup?.(
                  `My ${crm} authorization expired. How do I reconnect the Cardstack connector in this app?`,
                )
              }
            >
              How do I reconnect?
            </button>
          )
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
