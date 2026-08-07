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
  HomeCardPayload,
  LayoutSection,
  RecordCardPayload,
  RecordPage,
  RelatedListConfig,
  UpdatePreviewPayload,
  WriteReceiptPayload,
} from "@cardstack/core";
import { selectRenderableActions } from "@cardstack/core";
import {
  AsOfChip,
  FieldInfo,
  LayoutChip,
  MakerChip,
  MessageCard,
  NullValue,
  StagePill,
} from "../shared/components.tsx";
import { formatRelative, formatValue, initials, stageTone } from "../shared/format.ts";
import { HomeCard } from "../home-card/card.tsx";
import "../home-card/home-card.css";
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
  /** Open an external URL via the host (flow HANDOFF). No-op in previews. */
  openLink?(url: string): void;
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
  // Lookup picks store an ID in the draft but the rep chose a NAME — keep the
  // names so the editor, diff, and confirm views never show a raw id.
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
  // Drill-through: a clicked reference field or related row opens ITS card in
  // place of this one (recursive RecordCard = unlimited depth, one screen).
  const [drill, setDrill] = useState<RecordCardPayload | null>(null);
  const [drillLoading, setDrillLoading] = useState<string | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  // "Your lists" — the home card rendered in place (one screen, no chat turn).
  const [homeView, setHomeView] = useState<HomeCardPayload | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  // Field-name filter for big/generated all-fields cards.
  const [fieldQuery, setFieldQuery] = useState("");
  useEffect(() => {
    setDrill(null);
    setDrillError(null);
    setHomeView(null);
    setFieldQuery("");
    setDraftLabels({});
  }, [payload]);

  const { layout, meta, record, provenance, capabilities } = payload;
  const { header, sections, relatedLists } = layout.recordCard;
  const objectLabel = layout.object.charAt(0).toUpperCase() + layout.object.slice(1);

  const openDrill = async (object: string, id: string) => {
    if (!host || drillLoading) return;
    setDrillLoading(id);
    setDrillError(null);
    try {
      // Through the host as a tool call — the server decides layout vs
      // generated all-fields fallback; the widget never fetches directly.
      const result = await host.callTool("crm_get_record", { object, id });
      const data = result.structuredContent as RecordCardPayload | undefined;
      if (!result.isError && data?.kind === "record-card") {
        setDrill(data);
      } else {
        const text = result.content?.find((c) => c.type === "text")?.text;
        setDrillError(text ?? `Couldn't open that ${object} record.`);
      }
    } catch (error) {
      // Transport-level failure — surface it; never an unhandled rejection.
      setDrillError(error instanceof Error ? error.message : String(error));
    } finally {
      setDrillLoading(null);
    }
  };
  // A reference field is drillable when we have the target record's id and a
  // concrete target object — either resolved per record by the adapter
  // (refObjects covers polymorphic refs like Owner/What) or unambiguous from
  // describe metadata.
  const drillTargetFor = (api: string): { object: string; id: string } | null => {
    const id = record.refs?.[api];
    if (!id) return null;
    const targets = meta[api]?.referenceTo;
    const object = record.refObjects?.[api] ?? (targets?.length === 1 ? targets[0] : undefined);
    return object ? { object, id } : null;
  };

  const openHome = async () => {
    if (!host || homeLoading) return;
    setHomeLoading(true);
    setDrillError(null);
    try {
      const result = await host.callTool("crm_home", {});
      const data = result.structuredContent as HomeCardPayload | undefined;
      if (!result.isError && data?.kind === "home-card") {
        setHomeView(data);
      } else {
        const text = result.content?.find((c) => c.type === "text")?.text;
        setDrillError(text ?? "Couldn't open your lists.");
      }
    } catch (error) {
      setDrillError(error instanceof Error ? error.message : String(error));
    } finally {
      setHomeLoading(false);
    }
  };

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

  const setDraftValue = (api: string, value: CrmFieldValue, label?: string) => {
    if (mode.kind !== "editing") return;
    const draft = { ...mode.draft };
    const original = record.fields[api] ?? null;
    // A lookup's original "value" displays as a NAME while the draft carries
    // an ID — re-picking the same record (id === refs[api]) is not a change.
    const originalRefId = record.refs?.[api];
    if (value === original || (originalRefId !== undefined && value === originalRefId)) {
      delete draft[api];
    } else {
      draft[api] = value;
    }
    if (label !== undefined) setDraftLabels((prev) => ({ ...prev, [api]: label }));
    setMode({ kind: "editing", draft });
  };

  // editing → confirming goes through the SERVER: it re-reads the current values,
  // applies the same write gauntlet, and returns the diff plus a token bound to
  // it. A diff computed here in the browser could never be proven to the audit
  // log, so the rep confirms what the server will actually write, not what the
  // card happens to be holding.
  const reviewChanges = async (draft: Draft) => {
    if (!host) return;
    setMode({ kind: "reviewing", draft });
    try {
      const result = await host.callTool("crm_preview_update", {
        object: layout.object,
        id: record.id,
        patch: draft,
      });
      if (result.isError) {
        const text = result.content?.find((c) => c.type === "text");
        setMode({
          kind: "editing",
          draft,
          previewError: text?.text ?? "Couldn't prepare these changes for review.",
        });
        return;
      }
      setMode({
        kind: "confirming",
        draft,
        preview: result.structuredContent as UpdatePreviewPayload,
      });
    } catch (error) {
      setMode({ kind: "editing", draft, previewError: String(error) });
    }
  };

  const confirmWrite = async (draft: Draft, preview: UpdatePreviewPayload) => {
    if (!host) return;
    setMode({ kind: "writing", draft, preview });
    setLastDraft(draft);
    try {
      // The write goes through the HOST as a tool call — auditable, never direct.
      // The token is what makes the audit entry say "rep confirmed this diff".
      const result = await host.callTool("crm_update_record", {
        object: layout.object,
        id: record.id,
        patch: draft,
        confirmToken: preview.confirmToken,
      });
      if (result.isError) {
        const text = result.content?.find((c) => c.type === "text");
        setMode({
          kind: "confirming",
          draft,
          preview,
          writeError: text?.text ?? "The write failed. Nothing was saved.",
        });
        return;
      }
      const receipt = result.structuredContent as WriteReceiptPayload;
      // Fresh values into the card; the model gets the same summary the receipt
      // shows. refs merge alongside fields so drill targets track the write.
      setPayload({
        ...payload,
        record: {
          ...record,
          fields: { ...record.fields, ...receipt.record.fields },
          ...(record.refs || receipt.record.refs
            ? { refs: { ...record.refs, ...receipt.record.refs } }
            : {}),
          ...(record.refObjects || receipt.record.refObjects
            ? { refObjects: { ...record.refObjects, ...receipt.record.refObjects } }
            : {}),
        },
      });
      const summary = result.content?.find((c) => c.type === "text");
      if (summary?.text) host.updateModelContext(summary.text);
      setMode(
        receipt.failedCount > 0 ? { kind: "partial", receipt } : { kind: "receipt", receipt },
      );
    } catch (error) {
      setMode({ kind: "confirming", draft, preview, writeError: String(error) });
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

  // Configured layout actions (design 1a/3a). Order is the admin's control over
  // which action is primary; `selectRenderableActions` drops disabled ones and
  // skips update_record when nothing is editable. Flow and quick actions hand
  // off to the host so the model starts them and flow-run renders the screens.
  const actions = layout.recordCard.actions;
  const titleText = title ?? record.id;
  const runCreateRelated = (action: Extract<CardAction, { type: "create_related" }>) =>
    host?.sendFollowup?.(
      `Create a new ${action.object} related to "${titleText}" (id ${record.id})`,
    );
  const runFlowAction = (action: Extract<CardAction, { type: "screen_flow" }>) =>
    host?.sendFollowup?.(`Run the "${action.label}" flow on "${titleText}" (id ${record.id})`);

  const runQuickAction = (action: Extract<CardAction, { type: "quick_action" }>) =>
    host?.sendFollowup?.(`Run the "${action.label}" action on "${titleText}" (id ${record.id})`);

  // "Your lists" replaces the card with the real home card until Back.
  if (homeView) {
    return (
      <div className="rc-drill">
        <button type="button" className="rc-back" onClick={() => setHomeView(null)}>
          ← Back to {titleText}
        </button>
        <HomeCard payload={homeView} locale={locale} host={host} />
      </div>
    );
  }

  // Drill-through view replaces this card until "Back" (recursive: the nested
  // card has its own drill, related lists, even edit flow if its layout allows).
  if (drill) {
    return (
      <div className="rc-drill">
        <button type="button" className="rc-back" onClick={() => setDrill(null)}>
          ← Back to {titleText}
        </button>
        <RecordCard payload={drill} setPayload={(p) => setDrill(p)} locale={locale} host={host} />
      </div>
    );
  }

  const totalFieldCount = sections.reduce((n, s) => n + s.fields.length, 0);
  // Ready mode only: while EDITING, every field stays visible — a filter that
  // hides a dirty field mid-edit would still write it, invisibly.
  const showFieldFilter =
    (layout.generatedFallback || totalFieldCount > 12) && mode.kind === "ready";
  const fieldMatches = (api: string): boolean => {
    if (mode.kind !== "ready" || !fieldQuery.trim()) return true;
    const q = fieldQuery.trim().toLowerCase();
    return (
      api.toLowerCase().includes(q) || (meta[api]?.label ?? "").toLowerCase().includes(q)
    );
  };

  const collapsed = mode.kind === "receipt" || mode.kind === "partial";
  // The rows come from the SERVER's preview — same values the confirm token is
  // bound to, so what the rep reads and what gets written cannot drift apart.
  // Lookup writes carry an ID, so the picked record's name (which only the
  // browser knows) still supplies the display label.
  const diffRows =
    mode.kind === "confirming" || mode.kind === "writing"
      ? mode.preview.changes.map(({ field, label, before, after }) => ({
          label,
          before: fmt(field, before),
          after:
            after !== null && draftLabels[field] !== undefined && meta[field]?.type === "reference"
              ? draftLabels[field]!
              : fmt(field, after),
        }))
      : [];

  return (
    <div className="cs-card">
      {host && mode.kind === "ready" && (
        <nav className="rc-nav" aria-label="Card navigation">
          <button
            type="button"
            className="rc-nav-link"
            onClick={() => void openHome()}
            disabled={homeLoading}
          >
            {homeLoading ? "Opening…" : "⌂ Your lists"}
          </button>
          {payload.crmUrl && host.openLink && (
            <button
              type="button"
              className="rc-nav-link"
              onClick={() => host.openLink!(payload.crmUrl!)}
            >
              View in {provenance.crmLabel} ↗
            </button>
          )}
        </nav>
      )}
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

      {drillError && (
        <div className="wd-write-error" role="alert">
          {drillError}
        </div>
      )}

      {showFieldFilter && (
        <div className="rc-field-filter">
          <input
            type="search"
            className="rc-field-filter-input"
            placeholder={`Filter ${totalFieldCount} fields…`}
            value={fieldQuery}
            onChange={(e) => setFieldQuery(e.target.value)}
            aria-label="Filter fields by name"
          />
        </div>
      )}

      {mode.kind === "editing" && mode.previewError && (
        <div className="wd-write-error" role="alert">
          {mode.previewError} <span className="cs-muted">Nothing was written.</span>
        </div>
      )}

      {(mode.kind === "ready" || mode.kind === "editing" || mode.kind === "reviewing") &&
        sections
          .map((section) => ({
            ...section,
            fields: section.fields.filter((f) => fieldMatches(f.api)),
          }))
          .filter((section) => section.fields.length > 0)
          .map((section) => (
            <Section
              key={section.label}
              section={section}
              payload={payload}
              locale={locale}
              editing={mode.kind === "editing" || mode.kind === "reviewing"}
              draft={
                mode.kind === "editing" || mode.kind === "reviewing" ? mode.draft : undefined
              }
              draftLabels={draftLabels}
              editableSet={editableSet}
              host={host}
              onChange={setDraftValue}
              drillTargetFor={drillTargetFor}
              onOpenRef={(object, id) => void openDrill(object, id)}
              drillLoadingId={drillLoading}
            />
          ))}
      {showFieldFilter &&
        fieldQuery.trim() !== "" &&
        sections.every((s) => s.fields.every((f) => !fieldMatches(f.api))) && (
          <div className="cs-muted rc-filter-empty">No fields match “{fieldQuery.trim()}”.</div>
        )}

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
                {...(host ? { onOpenRow: (object: string, id: string) => void openDrill(object, id) } : {})}
                drillLoadingId={drillLoading}
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
          onFlowAction={runFlowAction}
          onQuickAction={runQuickAction}
          onDiscard={() => setMode({ kind: "ready" })}
          onReview={() => mode.kind === "editing" && void reviewChanges(mode.draft)}
          onBack={() =>
            mode.kind === "confirming" && setMode({ kind: "editing", draft: mode.draft })
          }
          onConfirm={() =>
            mode.kind === "confirming" && void confirmWrite(mode.draft, mode.preview)
          }
        />
        <span className="rc-footer-right">
          {/* Right-aligned trust line (design 1a) — wherever writes are possible. */}
          {mode.kind === "ready" && canEdit && (
            <span className="cs-muted rc-trust">Writes require confirmation</span>
          )}
          <AsOfChip provenance={provenance} locale={locale} />
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
  onFlowAction,
  onQuickAction,
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
  onFlowAction: (action: Extract<CardAction, { type: "screen_flow" }>) => void;
  onQuickAction: (action: Extract<CardAction, { type: "quick_action" }>) => void;
  onDiscard: () => void;
  onReview: () => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  switch (mode.kind) {
    case "ready": {
      const rendered = selectRenderableActions(actions, { canEdit });
      // An empty CONFIGURATION keeps the legacy button — every layout predating
      // the actions editor has `actions: []` and must not silently lose its edit
      // affordance. An empty RESULT (everything disabled) correctly renders none.
      if (actions.length === 0) {
        return (
          <span className="rc-footer-left">
            {canEdit && (
              <button type="button" className="cs-btn cs-btn--primary" onClick={onEdit}>
                Edit fields
              </button>
            )}
          </span>
        );
      }
      return (
        <span className="rc-footer-left">
          {rendered.map((action, i) => {
            const className = i === 0 ? "cs-btn cs-btn--primary" : "cs-btn";
            switch (action.type) {
              case "update_record":
                return (
                  <button key="update_record" type="button" className={className} onClick={onEdit}>
                    {action.label}
                  </button>
                );
              case "create_related":
                return (
                  <button
                    key={`create_related:${action.object}`}
                    type="button"
                    className={className}
                    onClick={() => onCreateRelated(action)}
                  >
                    {action.label}
                  </button>
                );
              case "quick_action":
                return (
                  <button
                    key={`quick_action:${action.actionApiName}`}
                    type="button"
                    className={className}
                    onClick={() => onQuickAction(action)}
                  >
                    {action.label}
                  </button>
                );
              case "screen_flow":
                return (
                  <button
                    key={`screen_flow:${action.flowApiName}`}
                    type="button"
                    className={className}
                    onClick={() => onFlowAction(action)}
                  >
                    {action.label}
                  </button>
                );
            }
          })}
        </span>
      );
    }
    case "editing":
    case "reviewing": {
      const reviewing = mode.kind === "reviewing";
      const count = dirtyCount(mode.draft);
      return (
        <span className="rc-footer-left">
          <span className={`rc-dirty-count${count > 0 ? " rc-dirty-count--active" : ""}`}>
            {count} unsaved {count === 1 ? "change" : "changes"}
          </span>
          <button
            type="button"
            className="cs-btn cs-btn--ghost"
            onClick={onDiscard}
            disabled={reviewing}
          >
            Discard
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={onReview}
            disabled={count === 0 || reviewing}
          >
            {reviewing ? "Preparing…" : "Review & save…"}
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
  draftLabels,
  editableSet,
  host,
  onChange,
  drillTargetFor,
  onOpenRef,
  drillLoadingId,
}: {
  section: LayoutSection;
  payload: RecordCardPayload;
  locale: string;
  editing: boolean;
  draft: Draft | undefined;
  /** Field api → human label for lookup drafts (the draft value is an id). */
  draftLabels?: Record<string, string>;
  editableSet: Set<string>;
  host?: WidgetHost | null;
  onChange: (api: string, value: CrmFieldValue, displayLabel?: string) => void;
  /** Unambiguous drill target for a reference field, or null. */
  drillTargetFor?: (api: string) => { object: string; id: string } | null;
  onOpenRef?: (object: string, id: string) => void;
  drillLoadingId?: string | null;
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
          // Lookup fields: the input shows the record's NAME — the picked
          // option's label when dirty, else the original resolved name.
          const lookupLabel =
            fieldMeta?.type === "reference"
              ? isDirty
                ? currentValue === null
                  ? ""
                  : (draftLabels?.[field.api] ?? String(currentValue))
                : (formatValue(original, fieldMeta, locale) ?? "")
              : undefined;
          return (
            <div key={field.api} className="rc-field">
              <div className="rc-field-label">
                {isDirty && <span className="wd-dirty-dot" aria-label="unsaved change" />}
                {fieldMeta?.label ?? field.api}
                {/* At-rest affordance: a rep can glance and know what they can
                    act on — without it, editable and read-only fields look
                    identical until they hit "Edit fields" (design 1b). */}
                {!editing && editableSet.has(field.api) && (
                  <span className="rc-editable-mark" title="Editable from chat" aria-label="Editable from chat">
                    ✎
                  </span>
                )}
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
                  displayLabel={lookupLabel}
                  host={host}
                  onChange={(value, label) => onChange(field.api, value, label)}
                />
              ) : (
                <div className="rc-field-value">
                  {formatted === null ? (
                    <NullValue />
                  ) : fieldMeta?.type === "textarea" ? (
                    <ClampedText text={formatted} />
                  ) : fieldMeta?.type === "reference" &&
                    !editing &&
                    drillTargetFor?.(field.api) &&
                    onOpenRef ? (
                    // Drill-through: open the referenced record's card in place.
                    (() => {
                      const target = drillTargetFor(field.api)!;
                      return (
                        <button
                          type="button"
                          className="rc-ref-link"
                          onClick={() => onOpenRef(target.object, target.id)}
                          disabled={drillLoadingId != null}
                        >
                          {formatted}
                          <span aria-hidden="true">
                            {drillLoadingId === target.id ? " …" : " ↗"}
                          </span>
                        </button>
                      );
                    })()
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
  onOpenRow,
  drillLoadingId,
}: {
  rel: RelatedListConfig;
  page: RecordPage;
  payload: RecordCardPayload;
  host: WidgetHost | null;
  /** Drill-through: open a related record's card in place of this one. */
  onOpenRow?: (object: string, id: string) => void;
  drillLoadingId?: string | null;
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
      {/* "OpportunityLineItems" / "deal_contacts" → "Opportunity Line Items" / "deal contacts" */}
      <h2 className="rc-section-label">
        {rel.relationship.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")}
      </h2>
      {rows.length === 0 && (
        <div className="cs-muted" style={{ fontSize: 12.5 }}>
          <NullValue /> none linked
        </div>
      )}
      {rows.map((row) => {
        const name = String(row.fields[rel.columns[0] ?? "name"] ?? "");
        const detailCols = rel.columns.slice(1);
        const body = (
          <>
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
          </>
        );
        // Clickable when the host can drill; static in hostless previews.
        return onOpenRow ? (
          <button
            key={row.id}
            type="button"
            className="rc-contact rc-contact--clickable"
            onClick={() => onOpenRow(rel.object, row.id)}
            disabled={drillLoadingId != null}
          >
            {body}
            <span className="rc-contact-open" aria-hidden="true">
              {drillLoadingId === row.id ? "Opening…" : "Open ↗"}
            </span>
          </button>
        ) : (
          <div key={row.id} className="rc-contact">
            {body}
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
    task: "☑",
    update: "Δ",
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
