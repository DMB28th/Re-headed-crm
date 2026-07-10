import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ActivityEntry,
  CrmRecord,
  LayoutSection,
  RecordCardPayload,
  RecordPage,
  RelatedListConfig,
} from "@cardstack/core";
import { useWidget } from "../shared/use-widget.js";
import {
  FieldInfo,
  LayoutChip,
  LoadingCard,
  MakerChip,
  MessageCard,
  NullValue,
  StagePill,
} from "../shared/components.tsx";
import { formatRelative, formatValue, initials, stageTone } from "../shared/format.ts";
import "../shared/theme.css";
import "./record-card.css";

function RecordCardApp() {
  const { app, payload, toolError, connectionError, locale } = useWidget<RecordCardPayload>(
    "Record Card",
  );

  if (connectionError) {
    return <MessageCard title="Couldn't connect to the chat host" body={connectionError.message} />;
  }
  if (toolError) {
    return (
      <MessageCard
        title={toolError}
        body="Nothing was written."
      />
    );
  }
  if (!payload) {
    return <LoadingCard label="Loading record…" />;
  }
  return <RecordCard payload={payload} locale={locale} app={app} />;
}

function RecordCard({
  payload,
  locale,
  app,
}: {
  payload: RecordCardPayload;
  locale: string;
  app: ReturnType<typeof useWidget>["app"];
}) {
  const { layout, meta, record, provenance, capabilities } = payload;
  const { header, sections, relatedLists } = layout.recordCard;

  if (sections.length === 0) {
    return (
      <MessageCard
        title={`No fields configured for ${layout.object}`}
        body="Ask your admin to add fields to this layout in Cardstack Studio."
      />
    );
  }

  const title = record.fields[header.title];
  const subtitle = header.subtitle ? record.fields[header.subtitle] : null;
  const badge = header.badge ? record.fields[header.badge] : null;
  const pipeline = record.fields.pipeline;

  return (
    <div className="cs-card">
      <header className="rc-header">
        <div className="rc-header-main">
          <h1 className="rc-title">{title ?? <NullValue />}</h1>
          <div className="rc-subtitle cs-muted">
            {[subtitle, pipeline].filter(Boolean).join(" · ") || " "}
          </div>
        </div>
        {badge != null && <StagePill value={String(badge)} tone={stageTone(String(badge))} />}
      </header>

      {sections.map((section) => (
        <Section
          key={section.label}
          section={section}
          record={record}
          payload={payload}
          locale={locale}
        />
      ))}

      {(relatedLists.length > 0 || payload.activity.length > 0) && (
        <div className="rc-lists">
          {relatedLists.map((rel) => (
            <RelatedList
              key={rel.relationship}
              rel={rel}
              page={payload.related[rel.relationship] ?? { rows: [], hasMore: false }}
              payload={payload}
              app={app}
            />
          ))}
          {payload.activity.length > 0 && <ActivityTimeline entries={payload.activity} locale={locale} />}
        </div>
      )}

      <footer className="rc-footer">
        <span className="rc-footer-left">
          <LayoutChip provenance={provenance} />
          {capabilities.writeEnabled && (
            <span className="cs-muted rc-trust">🔒 Writes require confirmation</span>
          )}
        </span>
        <MakerChip provenance={provenance} />
      </footer>
    </div>
  );
}

function Section({
  section,
  record,
  payload,
  locale,
}: {
  section: LayoutSection;
  record: CrmRecord;
  payload: RecordCardPayload;
  locale: string;
}) {
  return (
    <section className="rc-section">
      <h2 className="rc-section-label">{section.label}</h2>
      <div className={`rc-field-grid rc-cols-${section.columns}`}>
        {section.fields.map((field) => {
          const fieldMeta = payload.meta[field.api];
          const formatted = formatValue(record.fields[field.api], fieldMeta, locale);
          return (
            <div key={field.api} className="rc-field">
              <div className="rc-field-label">
                {fieldMeta?.label ?? field.api}
                {fieldMeta?.description && (
                  <FieldInfo
                    description={fieldMeta.description}
                    crmLabel={payload.provenance.crmLabel}
                  />
                )}
              </div>
              <div className="rc-field-value">{formatted ?? <NullValue />}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RelatedList({
  rel,
  page,
  payload,
  app,
}: {
  rel: RelatedListConfig;
  page: RecordPage;
  payload: RecordCardPayload;
  app: ReturnType<typeof useWidget>["app"];
}) {
  const [rows, setRows] = useState(page.rows);
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const remaining = (page.total ?? rows.length) - rows.length;

  const showMore = async () => {
    if (!app) return;
    setLoadingMore(true);
    try {
      // Pagination goes back through the host as a tool call — never a direct API hit.
      const result = await app.callServerTool({
        name: "crm_get_related",
        arguments: {
          object: payload.layout.object,
          recordId: payload.record.id,
          relationship: rel.relationship,
          limit: rows.length + 20,
        },
      });
      const data = result.structuredContent as { page?: RecordPage } | undefined;
      if (!result.isError && data?.page) {
        setRows(data.page.rows);
        setHasMore(data.page.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="rc-related">
      <h2 className="rc-section-label">{rel.relationship.replace(/_/g, " ")}</h2>
      {rows.length === 0 && (
        <div className="cs-muted" style={{ fontSize: 12.5 }}>
          <NullValue /> none linked
        </div>
      )}
      {rows.map((row) => {
        const name = String(row.fields[rel.columns[0] ?? "name"] ?? "");
        const detailCols = rel.columns.slice(1);
        return (
          <div key={row.id} className="rc-contact">
            <span className="rc-avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="rc-contact-body">
              <span className="rc-contact-name">{name || <NullValue />}</span>
              <span className="cs-muted rc-contact-detail">
                {detailCols
                  .map((col) => row.fields[col])
                  .filter((v) => v != null && v !== "")
                  .join(" · ") || " "}
              </span>
            </span>
          </div>
        );
      })}
      {hasMore && remaining > 0 && (
        <button type="button" className="cs-link-btn" onClick={showMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : `Show ${remaining} more`}
        </button>
      )}
    </section>
  );
}

function ActivityTimeline({ entries, locale }: { entries: ActivityEntry[]; locale: string }) {
  const icons: Record<ActivityEntry["kind"], string> = {
    email: "✉",
    call: "☎",
    note: "✎",
    meeting: "◷",
  };
  return (
    <section className="rc-related">
      <h2 className="rc-section-label">Activity timeline</h2>
      {entries.map((entry) => (
        <div key={entry.id} className="rc-activity">
          <span className="rc-activity-dot" aria-hidden="true" />
          <span className="rc-activity-summary">
            <span aria-hidden="true">{icons[entry.kind]} </span>
            {entry.summary}
          </span>
          <span className="cs-muted rc-activity-time">{formatRelative(entry.timestamp, locale)}</span>
        </div>
      ))}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RecordCardApp />
  </StrictMode>,
);
