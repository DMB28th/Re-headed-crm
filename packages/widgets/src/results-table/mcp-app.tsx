/**
 * MCP widget shell: connects the shared ResultsTable component (table.tsx —
 * also used by Studio's home-card drill-in preview) to the real host bridge.
 * The ambiguous-ask ViewPicker (5b) stays here: it only exists host-side.
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ResultsTablePayload, ViewPickerPayload } from "@cardstack/core";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useWidget } from "../shared/use-widget.js";
import { ErrorCard, LoadingCard, MakerChip, MessageCard } from "../shared/components.tsx";
import type { WidgetHost } from "../record-card/card.tsx";
import { ResultsTable } from "./table.tsx";
import "../shared/theme.css";
import "./results-table.css";

type TablePayload = ResultsTablePayload | ViewPickerPayload;

function hostFromApp(app: App | null): WidgetHost | null {
  if (!app) return null;
  return {
    callTool: (name, args) => app.callServerTool({ name, arguments: args }),
    updateModelContext: (text) => {
      app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {});
    },
    sendFollowup: (text) => {
      app.sendMessage({ role: "user", content: [{ type: "text", text }] }).catch(() => {});
    },
    // The embedded RecordCard's "View in Salesforce" uses this.
    openLink: (url) => {
      app.openLink({ url }).catch(() => {});
    },
  };
}

function ResultsTableApp() {
  const { app, payload, setPayload, toolError, connectionError, locale } =
    useWidget<TablePayload>("Results Table", { openLinks: {} });

  if (connectionError) {
    return <MessageCard title="Couldn't connect to the chat host" body={connectionError.message} />;
  }
  if (toolError) {
    // Failed READ — "Nothing was written." is reserved for write failures.
    return <MessageCard title={toolError} body="Nothing was loaded — try asking again." />;
  }
  if (!payload) {
    return <LoadingCard label="Loading results from your CRM…" />;
  }
  if (payload.kind === "error") {
    return <ErrorCard payload={payload} host={hostFromApp(app)} onPayload={setPayload} />;
  }
  if (payload.kind === "view-picker") {
    return <ViewPicker payload={payload} app={app} onResolved={setPayload} />;
  }
  return <ResultsTable payload={payload} locale={locale} host={hostFromApp(app)} />;
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResultsTableApp />
  </StrictMode>,
);
