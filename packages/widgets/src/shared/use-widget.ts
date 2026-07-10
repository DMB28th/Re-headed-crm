/**
 * Shared App wiring for every Cardstack widget: connect to the host, apply
 * host theme/styles, and surface the latest tool result + host context.
 * Handlers are registered in onAppCreated — BEFORE connect() — so the one-shot
 * tool-result notification is never missed.
 */
import { useCallback, useState } from "react";
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type App,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface WidgetState<Payload> {
  app: App | null;
  /** Parsed structuredContent, once the tool result arrives. */
  payload: Payload | null;
  /** Local payload replace (e.g. re-fetch after a write). Host tool results still win. */
  setPayload: (payload: Payload) => void;
  /** Model-facing error text when the tool result reported isError. */
  toolError: string | null;
  connectionError: Error | null;
  hostContext: McpUiHostContext | null;
  locale: string;
}

function applyHostAppearance(ctx: Partial<McpUiHostContext>) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

export function useWidget<Payload>(name: string): WidgetState<Payload> {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);

  const handleResult = useCallback((result: CallToolResult) => {
    if (result.isError) {
      const text = result.content?.find((c) => c.type === "text");
      setToolError(text?.type === "text" ? text.text : "The tool call failed.");
      return;
    }
    setToolError(null);
    setPayload((result.structuredContent as Payload) ?? null);
  }, []);

  const { app, error: connectionError } = useApp({
    appInfo: { name: `Cardstack ${name}`, version: "0.0.1" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = handleResult;
      app.onhostcontextchanged = (ctx) => {
        applyHostAppearance(ctx);
        setHostContext((prev) => ({ ...prev, ...ctx }));
      };
      app.onerror = console.error;
    },
  });

  // Initial context arrives with the handshake, before any change notification.
  const initialCtx = app?.getHostContext();
  if (initialCtx && !hostContext) {
    applyHostAppearance(initialCtx);
    setHostContext(initialCtx);
  }

  return {
    app,
    payload,
    setPayload,
    toolError,
    connectionError,
    hostContext,
    locale: hostContext?.locale ?? "en-US",
  };
}
