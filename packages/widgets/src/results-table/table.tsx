/**
 * The results-table component — shared by the MCP widget shell and Studio's
 * home-card drill-in preview (one render codepath, like the record card).
 */
import { useEffect, useState } from "react";
import type { CrmRecord, ResultsTablePayload } from "@cardstack/core";
import { LayoutChip, MakerChip, MessageCard, NullValue, StagePill } from "../shared/components.tsx";
import { formatValue, stageTone } from "../shared/format.ts";
import type { WidgetHost } from "../record-card/card.tsx";

export function ResultsTable({
  payload,
  locale,
  host,
}: {
  payload: ResultsTablePayload;
  locale: string;
  host: WidgetHost | null;
}) {
  const [rows, setRows] = useState(payload.page.rows);
  const [cursor, setCursor] = useState(payload.page.cursor);
  const [hasMore, setHasMore] = useState(payload.page.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  // A fresh tool result (host re-render) replaces any locally-paginated rows.
  useEffect(() => {
    setRows(payload.page.rows);
    setCursor(payload.page.cursor);
    setHasMore(payload.page.hasMore);
  }, [payload]);

  const columns = payload.listView.columns;
  const total = payload.page.total ?? rows.length;
  const nameCol = columns[0] ?? "name";

  const openRecord = (row: CrmRecord) => {
    const name = String(row.fields[nameCol] ?? row.id);
    // Followup through the chat — the model calls crm_get_record and the
    // record card renders as its own widget (Golden Path 1).
    host?.sendFollowup?.(`Open the ${payload.object} record "${name}" (id ${row.id})`);
  };

  const showMore = async () => {
    if (!host || !cursor) return;
    setLoadingMore(true);
    try {
      // Saved views paginate through crm_list_view; ad-hoc results through crm_search.
      const result = payload.savedViewId
        ? await host.callTool("crm_list_view", { object: payload.object, view: payload.savedViewId, cursor })
        : await host.callTool("crm_search", { object: payload.object, cursor });
      const data = result.structuredContent as ResultsTablePayload | undefined;
      if (!result.isError && data?.page) {
        setRows((prev) => [...prev, ...data.page.rows]);
        setCursor(data.page.cursor);
        setHasMore(data.page.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  if (rows.length === 0) {
    return (
      <MessageCard
        title={`No ${payload.object} match`}
        body="Try widening the ask — or check the saved views your admin exposed."
      />
    );
  }

  return (
    <div className="cs-card">
      <header className="rt-header">
        <div className="rt-title-group">
          <h1 className="rt-title">{payload.title}</h1>
          {payload.savedViewName && (
            <span className="cs-muted rt-view-note">
              {payload.savedViewName} ·{" "}
              {payload.savedViewId?.startsWith("cl-")
                ? "Your Cardstack list"
                : `Your saved ${payload.provenance.crmLabel} view`}
            </span>
          )}
        </div>
        <span className="rt-chips">
          <LayoutChip provenance={payload.provenance} />
        </span>
      </header>

      <div className="rt-table" role="table" aria-label={payload.title}>
        <div className="rt-row rt-row--head" role="row">
          {columns.map((col) => (
            <span key={col} role="columnheader" className="rt-cell rt-cell--head">
              {payload.meta[col]?.label ?? col}
            </span>
          ))}
          <span className="rt-cell rt-cell--action" aria-hidden="true" />
        </div>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="rt-row rt-row--body"
            role="row"
            onClick={() => openRecord(row)}
          >
            {columns.map((col) => {
              const meta = payload.meta[col];
              const formatted = formatValue(row.fields[col], meta, locale);
              const isStage = meta?.type === "picklist";
              return (
                <span key={col} role="cell" className="rt-cell">
                  {formatted === null ? (
                    <NullValue />
                  ) : isStage ? (
                    <StagePill value={formatted} tone={stageTone(formatted)} />
                  ) : (
                    formatted
                  )}
                </span>
              );
            })}
            <span className="rt-cell rt-cell--action" aria-hidden="true">
              Open card ↗
            </span>
          </button>
        ))}
      </div>

      <footer className="rt-footer">
        <span className="rt-footer-left">
          <span className="cs-muted rt-count">
            Showing {rows.length} of {total} · click a row to open its card
            {payload.savedViewFilterSummary && (
              <>
                {" "}
                · filters: {payload.savedViewFilterSummary}{" "}
                <span className="rt-crm-managed">
                  {payload.savedViewId?.startsWith("cl-")
                    ? "(defined in Cardstack)"
                    : `(managed in ${payload.provenance.crmLabel})`}
                </span>
              </>
            )}
          </span>
          {hasMore && (
            <button type="button" className="cs-link-btn" onClick={showMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : `Show ${Math.max(total - rows.length, 0)} more`}
            </button>
          )}
        </span>
        <MakerChip provenance={payload.provenance} />
      </footer>
    </div>
  );
}
