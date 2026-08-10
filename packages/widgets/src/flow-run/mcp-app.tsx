/**
 * MCP widget shell for the flow-run card (design 10a). Declares the openLinks
 * capability so the HANDOFF launch button can open the flow in the CRM.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { FlowRunPayload } from "@cardstack/core";
import type { App } from "@modelcontextprotocol/ext-apps";
import { useWidget } from "../shared/use-widget.js";
import { ErrorCard, LoadingCard, MessageCard } from "../shared/components.tsx";
import type { WidgetHost } from "../record-card/card.tsx";
import { FlowRunCard } from "./card.tsx";
import "../shared/theme.css";
import "./flow-run.css";

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

function FlowRunApp() {
  const { app, payload, setPayload, toolError, connectionError } = useWidget<FlowRunPayload>(
    "Flow Run",
    { openLinks: {} },
  );

  if (connectionError) {
    return <MessageCard title="Couldn't connect to the chat host" body={connectionError.message} />;
  }
  if (toolError) {
    return <MessageCard title={toolError} body="The flow couldn't be prepared — try again." />;
  }
  if (!payload) {
    return <LoadingCard label="Preparing the flow…" />;
  }
  if (payload.kind === "error") {
    return <ErrorCard payload={payload} host={hostFromApp(app)} onPayload={setPayload} />;
  }
  return <FlowRunCard payload={payload} host={hostFromApp(app)} onPayload={setPayload} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FlowRunApp />
  </StrictMode>,
);
