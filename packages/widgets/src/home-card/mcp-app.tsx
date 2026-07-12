/**
 * MCP widget shell for the home card ("open my CRM", design 7a). The shared
 * component lives in card.tsx and is reused by Studio's home-card builder.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { HomeCardPayload } from "@cardstack/core";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useWidget } from "../shared/use-widget.js";
import { ErrorCard, LoadingCard, MessageCard } from "../shared/components.tsx";
import type { WidgetHost } from "../record-card/card.tsx";
import { HomeCard } from "./card.tsx";
import "../shared/theme.css";
import "./home-card.css";

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
  };
}

function HomeCardApp() {
  const { app, payload, setPayload, toolError, connectionError, locale } =
    useWidget<HomeCardPayload>("Home Card");

  if (connectionError) {
    return <MessageCard title="Couldn't connect to the chat host" body={connectionError.message} />;
  }
  if (toolError) {
    // Failed READ — "Nothing was written." is reserved for write failures.
    return <MessageCard title={toolError} body="Nothing was loaded — try asking again." />;
  }
  if (!payload) {
    return <LoadingCard label="Opening your CRM…" />;
  }
  if (payload.kind === "error") {
    return <ErrorCard payload={payload} host={hostFromApp(app)} onPayload={setPayload} />;
  }
  return <HomeCard payload={payload} locale={locale} host={hostFromApp(app)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HomeCardApp />
  </StrictMode>,
);
