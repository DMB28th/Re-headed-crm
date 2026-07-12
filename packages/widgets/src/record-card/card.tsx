/**
 * The record-card component — THE render codepath. The MCP widget shell
 * (mcp-app.tsx) mounts it against the live host bridge; Cardstack Studio
 * imports it directly for the builder's live preview. One component,
 * guaranteed fidelity (PLAN.md: "do not build a separate preview renderer").
 *
 * Host access is abstracted behind WidgetHost so the component never knows
 * whether it's talking to a real MCP host or Studio's simulator.
 */
import { useEffect, useRef, useState } from "react";
import type {
  ActivityEntry,
  CardAction,
  CrmFieldValue,
  FieldWriteResult,
  LayoutSection,
  RecordCardPayload,
  RecordPage,
  RelatedListConfig,
  WriteReceiptPayload,
} from "@cardstack/core";
import {
  FieldInfo,
  LayoutChip,
  MakerChip,
  MessageCard,
  NullValue,
  StagePill,
} from "../shared/components.tsx";
import { formatRelative, formatValue, initials, stageTone } from "../shared/format.ts";
import { dirtyCount, type CardMode, type Draft } from "./edit-machine.ts";
import { FieldInput } from "./editors.tsx";
import { DiffTable, PartialFailureView, ReceiptView } from "./write-states.tsx";

/** Structural host surface — real MCP App bridge or Studio preview simulator. */
export interface WidgetHostResult {
  isError?: boolean | undefined;
  content?: { type: string; text?: string | undefined }[] | undefined;
  structuredContent?: unknown;
}

export interface WidgetHost {
  callTool(name: string, args: Record<string, unknown>): Promise<WidgetHostResult>;
  updateModelContext(text: string): void;
  /** Post a user-turn followup into the chat (host sendMessage). No-op in previews. */
  sendFollowup?(text: string): void;
}

export function RecordCard({
  payload,
  setPayload,
  locale,
  host,
}: {
  payload: RecordCardPayload;
  setPayload: (payload: RecordCardPayload) => void;
  locale: string;
  host: WidgetHost | null;
}) {
  const [mode, setMode] = useState<CardMode>({ kind: "ready" });
  // Attempted values survive a partial failure so "Edit & retry" can restore them.
  const [lastDraft, setLastDraft] = useState<Draft>({});

  const { layout, meta, record, provenance, capabilities } = payload;
  const { header, sections, relatedLists } = layout.recordCard;
  const objectLabel = layout.object.charAt(0).toUpperCase() + layout.object.slice(1);

  if (sections.length === 0) {
    return (
      <MessageCard
        title={`No fields configured for ${objectLabel}`}
        body="Ask your admin to add fields to this layout in Cardstack Studio."
        action={<CopyRequestButton objectLabel={objectLabel} />}
        provenance={provenance}
      />
    );
  }

  const fmt = (api: string, value: CrmFieldValue | undefined) =>
    formatValue(value, meta[api], locale);
  const fmtResult = (result: FieldWriteResult, value: FieldWriteResult["before"]) =>
    fmt(result.field, value) ?? "—";
  const editableSet = new Set(capabilities.editableFields);
  const canEdit = capabilities.writeEnabled && editableSet.size > 0;

  const setDraftValue = (api: string, value: CrmFieldValue) => {
    if (mode.kind !== "editing") return;
    const draft = { ...mode.draft };
    const original = record.fields[api] ?? null;
    if (value === original) delete draft[api];
    else draft[api] = value;
    setMode({ kind: "editing", draft });
  };

  const confirmWrite = async (draft: Draft) => {
    if (!host) return;
    setMode({ kind: "writing", draft });
    setLastDraft(draft);
    try {
      // The write goes through the HOST as a tool call — auditable, never direct.
      const result = await host.callTool("crm_update_record", {
        object: layout.object,
        id: record.id,
        patch: draft,
      });
      if (result.isError) {
        const text = result.content?.find((c) => c.type === "text");
        setMode({
          kind: "confirming",
          draft,
          writeError: text?.text ?? "The write failed. Nothing was saved.",
        });
        return;
      }
      const receipt = result.structuredContent as WriteReceiptPayload;
      // Fresh values into the card; the model gets the same summary the receipt shows.
      setPayload({
        ...payload,
        record: { ...record, fields: { ...record.fields, ...receipt.record.fields } },
      });
      const summary = result.content?.find((c) => c.type === "text");
      if (summary?.text) host.updateModelContext(summary.text);
      setMode(
        receipt.failedCount > 0 ? { kind: "partial", receipt } : { kind: "receipt", receipt },
      );
    } catch (error) {
      setMode({ kind: "confirming", draft, writeError: String(error) });
    }
  };

  const openCurrentCard = async () => {
    if (!host || mode.kind !== "receipt") return;
    setMode({ ...mode, opening: true });
    try {
      const result = await host.callTool("crm_get_record", {
        object: layout.object,
        id: record.id,
      });
      if (!result.isError && result.structuredContent) {
        setPayload(result.structuredContent as RecordCardPayload);
      }
    } finally {
      setMode({ kind: "ready" });
    }
  };

  const editRetry = () => {
    if (mode.kind !== "partial") return;
    const failed: Draft = {};
    for (const r of mode.receipt.results) {
      if (!r.ok && lastDraft[r.field] !== undefined) failed[r.field] = lastDraft[r.field]!;
    }
    setMode({ kind: "editing", draft: failed });
  };

  // Header slots go through the SAME formatting pipeline as every field —
  // valueLabels turn internal ids (dealstage, owner) into human labels, and
  // stageTone only ever fires on the label, never the raw id.
  const title = fmt(header.title, record.fields[header.title]);
  const subtitle = header.subtitle ? fmt(header.subtitle, record.fields[header.subtitle]) : null;
  const badgeLabel = header.badge ? fmt(header.badge, record.fields[header.badge]) : null;

  // Configured layout actions (design 1a/3a): update_record names the primary
  // edit button; create_related actions post a followup so the model drives
  // crm_create_record (upgrades to the inline create form when 10b lands).
  const actions = layout.recordCard.actions;
  const titleText = title ?? record.id;
  const runCreateRelated = (action: Extract<CardAction, { type: "create_related" }>) =>
    host?.sendFollowup?.(
      `Create a new ${action.object} related to "${titleText}" (id ${record.id})`,
    );
  const logNote = () =>
    host?.sendFollowup?.(`Log a note on the ${layout.object} "${titleText}" (id ${record.id})`);

  const collapsed = mode.kind === "receipt" || mode.kind === "partial";
  const diffRows =
    mode.kind === "confirming" || mode.kind === "writing"
      ? Object.entries(mode.draft).map(([api, value]) => ({
          label: meta[api]?.label ?? api,
          before: fmt(api, record.fields[api] ?? null),
          after: fmt(api, value),
        }))
      : [];

  return (
    <div className="cs-card">
      <header className="rc-header">
        <div className="rc-header-main">
          <h1 className="rc-title">{title ?? <NullValue />}</h1>
          <div className="rc-subtitle cs-muted">{[subtitle].filter(Boolean).join(" · ") || " "}</div>
        </div>
        {badgeLabel != null && <StagePill value={badgeLabel} tone={stageTone(badgeLabel)} />}
      </header>

      {mode.kind === "receipt" && (
        <ReceiptView
          receipt={mode.receipt}
          formatFieldValue={fmtResult}
          onOpenCurrent={openCurrentCard}
          opening={mode.opening}
        />
      )}
      {mode.kind === "partial" && (
        <PartialFailureView
          receipt={mode.receipt}
          formatFieldValue={fmtResult}
          onEditRetry={editRetry}
        />
      )}

      {(mode.kind === "confirming" || mode.kind === "writing") && (
        <section className="rc-section">
          <h2 className="rc-section-label">Review changes</h2>
          <DiffTable rows={diffRows} />
          {mode.kind === "confirming" && mode.writeError && (
            <div className="wd-write-error">
              {mode.writeError} <span className="cs-muted">Nothing was written.</span>
            </div>
          )}
        </section>
      )}

      {(mode.kind === "ready" || mode.kind === "editing") &&
        sections.map((section) => (
          <Section
            key={section.label}
            section={section}
            payload={payload}
            locale={locale}
            editing={mode.kind === "editing"}
            draft={mode.kind === "editing" ? mode.draft : undefined}
            editableSet={editableSet}
            onChange={setDraftValue}
          />
        ))}

      {!collapsed &&
        mode.kind === "ready" &&
        (relatedLists.length > 0 || payload.activity.length > 0) && (
          <div className="rc-lists">
            {relatedLists.map((rel) => (
              <RelatedList
                key={rel.relationship}
                rel={rel}
                page={payload.related[rel.relationship] ?? { rows: [], hasMore: false }}
                payload={payload}
                host={host}
              />
            ))}
            {payload.activity.length > 0 && (
              <ActivityTimeline entries={payload.activity} locale={locale} />
            )}
          </div>
        )}

      <footer className="rc-footer">
        <FooterControls
          mode={mode}
          canEdit={canEdit}
          actions={actions}
          crmLabel={provenance.crmLabel}
          connectedUser={provenance.connectedUser}
          onEdit={() => setMode({ kind: "editing", draft: {} })}
          onCreateRelated={runCreateRelated}
          onLogNote={logNote}
          onDiscard={() => setMode({ kind: "ready" })}
          onReview={() =>
            mode.kind === "editing" && setMode({ kind: "confirming", draft: mode.draft })
          }
          onBack={() =>
            mode.kind === "confirming" && setMode({ kind: "editing", draft: mode.draft })
          }
          onConfirm={() =>
            (mode.kind === "confirming" || mode.kind === "writing") && confirmWrite(mode.draft)
          }
        />
        <span className="rc-footer-right">
          {/* Right-aligned trust line (design 1a) — wherever writes are possible. */}
          {mode.kind === "ready" && canEdit && (
            <span className="cs-muted rc-trust">Writes require confirmation</span>
          )}
          <LayoutChip provenance={provenance} />
          <MakerChip provenance={provenance} />
        </span>
      </footer>
    </div>
  );
}

function FooterControls({
  mode,
  canEdit,
  actions,
  crmLabel,
  connectedUser,
  onEdit,
  onCreateRelated,
  onLogNote,
  onDiscard,
  onReview,
  onBack,
  onConfirm,
}: {
  mode: CardMode;
  canEdit: boolean;
  actions: CardAction[];
  crmLabel: string;
  connectedUser?: string | undefined;
  onEdit: () => void;
  onCreateRelated: (action: Extract<CardAction, { type: "create_related" }>) => void;
  onLogNote: () => void;
  onDiscard: () => void;
  onReview: () => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  switch (mode.kind) {
    case "ready": {
      const editLabel =
        actions.find((a): a is Extract<CardAction, { type: "update_record" }> => a.type === "update_record")
          ?.label ?? "Edit fields";
      const createActions = actions.filter(
        (a): a is Extract<CardAction, { type: "create_related" }> => a.type === "create_related",
      );
      return (
        <span className="rc-footer-left">
          {canEdit && (
            <button type="button" className="cs-btn cs-btn--primary" onClick={onEdit}>
              {editLabel}
            </button>
          )}
          {createActions.map((action) => (
            <button
              key={`${action.object}:${action.label}`}
              type="button"
              className="cs-btn"
              onClick={() => onCreateRelated(action)}
            >
              {action.label}
            </button>
          ))}
          <button type="button" className="cs-btn" onClick={onLogNote}>
            Log a note
          </button>
        </span>
      );
    }
    case "editing": {
      const count = dirtyCount(mode.draft);
      return (
        <span className="rc-footer-left">
          <span className={`rc-dirty-count${count > 0 ? " rc-dirty-count--active" : ""}`}>
            {count} unsaved {count === 1 ? "change" : "changes"}
          </span>
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onDiscard}>
            Discard
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={onReview}
            disabled={count === 0}
          >
            Review &amp; save…
          </button>
        </span>
      );
    }
    case "confirming":
    case "writing": {
      const writing = mode.kind === "writing";
      return (
        <span className="rc-footer-left rc-footer-left--column">
          <span>
            <button
              type="button"
              className="cs-btn cs-btn--ghost"
              onClick={onBack}
              disabled={writing}
            >
              Back
            </button>{" "}
            <button
              type="button"
              className="cs-btn cs-btn--primary"
              onClick={onConfirm}
              disabled={writing}
            >
              {writing ? "Writing…" : `✎ Confirm & write to ${crmLabel}`}
            </button>
          </span>
          <span className="cs-muted rc-trust">
            Written as {connectedUser ?? "you"} · logged in {crmLabel} history
          </span>
        </span>
      );
    }
    default:
      return <span className="rc-footer-left" />;
  }
}

function Section({
  section,
  payload,
  locale,
  editing,
  draft,
  editableSet,
  onChange,
}: {
  section: LayoutSection;
  payload: RecordCardPayload;
  locale: string;
  editing: boolean;
  draft: Draft | undefined;
  editableSet: Set<string>;
  onChange: (api: string, value: CrmFieldValue) => void;
}) {
  const { record } = payload;
  return (
    <section className="rc-section">
      <h2 className="rc-section-label">{section.label}</h2>
      <div className={`rc-field-grid rc-cols-${section.columns}`}>
        {section.fields.map((field) => {
          const fieldMeta = payload.meta[field.api];
          const original = record.fields[field.api] ?? null;
          const isDirty = draft ? field.api in draft : false;
          const currentValue = isDirty ? (draft![field.api] ?? null) : original;
          const editableHere = editing && editableSet.has(field.api);
          const flsBlocked = editing && field.editable && !editableSet.has(field.api);
          const formatted = formatValue(currentValue, fieldMeta, locale);
          return (
            <div key={field.api} className="rc-field">
              <div className="rc-field-label">
                {isDirty && <span className="wd-dirty-dot" aria-label="unsaved change" />}
                {fieldMeta?.label ?? field.api}
                {fieldMeta && (
                  <FieldInfo
                    {...(fieldMeta.description ? { description: fieldMeta.description } : {})}
                    detail={`${fieldMeta.type[0]!.toUpperCase()}${fieldMeta.type.slice(1)} · ${
                      payload.capabilities.editableFields.includes(field.api)
                        ? "editable from chat"
                        : fieldMeta.readOnly
                          ? `read-only in ${payload.provenance.crmLabel}`
                          : "read-only on this card"
                    }`}
                    crmLabel={payload.provenance.crmLabel}
                  />
                )}
              </div>
              {editableHere ? (
                <FieldInput
                  field={field}
                  meta={fieldMeta}
                  value={currentValue}
                  dirty={isDirty}
                  onChange={(value) => onChange(field.api, value)}
                />
              ) : (
                <div className="rc-field-value">
                  {formatted === null ? (
                    <NullValue />
                  ) : fieldMeta?.type === "textarea" ? (
                    <ClampedText text={formatted} />
                  ) : (
                    formatted
                  )}
                  {flsBlocked && (
                    <span className="cs-pill wd-fls-pill">
                      Read-only · {payload.provenance.crmLabel} field security
                    </span>
                  )}
                </div>
              )}
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
  host,
}: {
  rel: RelatedListConfig;
  page: RecordPage;
  payload: RecordCardPayload;
  host: WidgetHost | null;
}) {
  const [rows, setRows] = useState(page.rows);
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const remaining = (page.total ?? rows.length) - rows.length;

  const showMore = async () => {
    if (!host) return;
    setLoadingMore(true);
    try {
      // Pagination goes back through the host as a tool call — never a direct API hit.
      const result = await host.callTool("crm_get_related", {
        object: payload.layout.object,
        recordId: payload.record.id,
        relationship: rel.relationship,
        limit: rows.length + 20,
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
                  .join(" · ") || " "}
              </span>
            </span>
          </div>
        );
      })}
      {hasMore && remaining > 0 && (
        <button type="button" className="cs-link-btn" onClick={showMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : `Show ${remaining} more ${rel.object}`}
        </button>
      )}
    </section>
  );
}

/**
 * Long text values (design 1h): 4-line clamp with a "Show full note" toggle —
 * the toggle only appears when the content actually overflows the clamp.
 */
function ClampedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <>
      <div ref={ref} className={expanded ? undefined : "rc-clamp"}>
        {text}
      </div>
      {(overflowing || expanded) && (
        <button type="button" className="cs-link-btn" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : "Show full note"}
        </button>
      )}
    </>
  );
}

/** Empty-state action (design 1e): a prewritten ask for the admin, one click to copy. */
function CopyRequestButton({ objectLabel }: { objectLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Could you add fields to the ${objectLabel} card layout in Cardstack Studio? I got an empty card in chat.`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied by the host — the button quietly does nothing.
    }
  };
  return (
    <button type="button" className="cs-btn" onClick={copy}>
      {copied ? "Copied" : "Copy request for your admin"}
    </button>
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
