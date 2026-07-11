/**
 * MCP widget shell: connects the shared RecordCard component (card.tsx —
 * also used verbatim by Studio's live preview) to the real host bridge.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { RecordCardPayload } from "@cardstack/core";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useWidget } from "../shared/use-widget.js";
import { LoadingCard, MessageCard } from "../shared/components.tsx";
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
  };
}

function RecordCardApp() {
  const { app, payload, setPayload, toolError, connectionError, locale } =
    useWidget<RecordCardPayload>("Record Card");

  if (connectionError) {
    return <MessageCard title="Couldn't connect to the chat host" body={connectionError.message} />;
  }
  if (toolError) {
    return <MessageCard title={toolError} body="Nothing was written." />;
  }
  if (!payload) {
    return <LoadingCard label="Loading record…" />;
  }
  return (
    <RecordCard payload={payload} setPayload={setPayload} locale={locale} host={hostFromApp(app)} />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RecordCardApp />
  </StrictMode>,
);
