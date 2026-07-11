import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CrmRecord, ResultsTablePayload, ViewPickerPayload } from "@cardstack/core";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useWidget } from "../shared/use-widget.js";
import {
  LayoutChip,
  LoadingCard,
  MakerChip,
  MessageCard,
  NullValue,
  StagePill,
} from "../shared/components.tsx";
import { formatValue, stageTone } from "../shared/format.ts";
import "../shared/theme.css";
import "./results-table.css";

type TablePayload = ResultsTablePayload | ViewPickerPayload;

function ResultsTableApp() {
  const { app, payload, setPayload, toolError, connectionError, locale } =
    useWidget<TablePayload>("Results Table");

  if (connectionError) {
    return <MessageCard title="Couldn't connect to the chat host" body={connectionError.message} />;
  }
  if (toolError) {
    return <MessageCard title={toolError} body="Nothing was written." />;
  }
  if (!payload) {
    return <LoadingCard label="Loading results…" />;
  }
  if (payload.kind === "view-picker") {
    return <ViewPicker payload={payload} app={app} onResolved={setPayload} />;
  }
  return <ResultsTable payload={payload} locale={locale} app={app} />;
}

/** Ambiguous-ask picker (design 5b): pick a view; the choice is remembered. */
function ViewPicker({
  payload,
  app,
  onResolved,
}: {
  payload: ViewPickerPayload;
  app: App | null;
  onResolved: (payload: TablePayload) => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);

  const pick = async (viewId: string) => {
    if (!app) return;
    setPicking(viewId);
    try {
      // Passing the original query back makes the server remember this choice.
      const result = await app.callServerTool({
        name: "crm_list_view",
        arguments: { object: payload.object, view: viewId, query: payload.query },
      });
      if (!result.isError && result.structuredContent) {
        onResolved(result.structuredContent as unknown as TablePayload);
      }
    } finally {
      setPicking(null);
    }
  };

  return (
    <div className="cs-card">
      <header className="rt-header">
        <div className="rt-title-group">
          <h1 className="rt-title">
            “{payload.query}” matches {payload.options.length} saved views
          </h1>
          <span className="cs-muted rt-view-note">
            Pick one — Cardstack remembers your choice for next time.
          </span>
        </div>
      </header>
      <div className="rt-picker">
        {payload.options.map((option) => (
          <button
            key={option.viewId}
            type="button"
            className="rt-picker-option"
            onClick={() => pick(option.viewId)}
            disabled={picking !== null}
          >
            <span className="rt-picker-name">
              {picking === option.viewId ? "Opening…" : option.name}
            </span>
            <span className="cs-muted rt-picker-filters">{option.filterSummary}</span>
          </button>
        ))}
      </div>
      <footer className="rt-footer">
        <span className="cs-muted rt-count">
          Saved {payload.provenance.crmLabel} views · filters managed in{" "}
          {payload.provenance.crmLabel}
        </span>
        <MakerChip provenance={payload.provenance} />
      </footer>
    </div>
  );
}

function ResultsTable({
  payload,
  locale,
  app,
}: {
  payload: ResultsTablePayload;
  locale: string;
  app: ReturnType<typeof useWidget>["app"];
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

  const openRecord = async (row: CrmRecord) => {
    if (!app) return;
    const name = String(row.fields[nameCol] ?? row.id);
    // Followup through the chat — the model calls crm_get_record and the
    // record card renders as its own widget (Golden Path 1).
    await app.sendMessage({
      role: "user",
      content: [
        {
          type: "text",
          text: `Open the ${payload.object} record "${name}" (id ${row.id})`,
        },
      ],
    });
  };

  const showMore = async () => {
    if (!app || !cursor) return;
    setLoadingMore(true);
    try {
      // Saved views paginate through crm_list_view; ad-hoc results through crm_search.
      const result = await app.callServerTool(
        payload.savedViewId
          ? {
              name: "crm_list_view",
              arguments: { object: payload.object, view: payload.savedViewId, cursor },
            }
          : { name: "crm_search", arguments: { object: payload.object, cursor } },
      );
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
              {payload.savedViewName} · Your saved {payload.provenance.crmLabel} view
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
                <span className="rt-crm-managed">(managed in {payload.provenance.crmLabel})</span>
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResultsTableApp />
  </StrictMode>,
);
