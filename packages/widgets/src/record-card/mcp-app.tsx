/**
 * MCP widget shell: connects the shared RecordCard component (card.tsx —
 * also used verbatim by Studio's live preview) to the real host bridge.
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { RecordCardPayload } from "@cardstack/core";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useWidget } from "../shared/use-widget.js";
import { ErrorCard, LoadingCard, MessageCard } from "../shared/components.tsx";
import { RecordCard, type WidgetHost } from "./card.tsx";
import "../shared/theme.css";
import "./record-card.css";

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
    openLink: (url) => {
      app.openLink({ url }).catch(() => {});
    },
  };
}

function RecordCardApp() {
  const { app, payload, setPayload, toolError, connectionError, locale } =
    useWidget<RecordCardPayload>("Record Card", { openLinks: {} });
  // The last good record payload survives a typed error so any in-progress
  // edit state stays mounted (design 1e re-auth: "edits kept").
  const [lastGood, setLastGood] = useState<RecordCardPayload | null>(null);

  const good = payload && payload.kind === "record-card" ? payload : null;
  const error = payload && payload.kind === "error" ? payload : null;
  if (good && good !== lastGood) setLastGood(good);

  if (connectionError) {
    return <MessageCard title="Couldn't connect to the chat host" body={connectionError.message} />;
  }
  if (toolError) {
    // A bare tool error here is a failed READ — "Nothing was written." is
    // reserved for write failures inside the card.
    return <MessageCard title={toolError} body="Nothing was loaded — try asking again." />;
  }
  if (!payload) {
    return <LoadingCard label="Loading record from your CRM…" />;
  }
  return (
    <>
      {error && <ErrorCard payload={error} host={hostFromApp(app)} onPayload={setPayload} />}
      {lastGood && (
        <div style={error ? { display: "none" } : undefined}>
          <RecordCard
            payload={lastGood}
            setPayload={setPayload}
            locale={locale}
            host={hostFromApp(app)}
          />
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RecordCardApp />
  </StrictMode>,
);
