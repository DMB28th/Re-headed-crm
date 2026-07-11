/**
 * Component entry for consumers that render widgets OUTSIDE an MCP host —
 * i.e. Cardstack Studio's live preview. Ships as source; Studio transpiles
 * (next.config transpilePackages). The MCP bundles keep using mcp-app.tsx.
 */
export { RecordCard, type WidgetHost, type WidgetHostResult } from "./record-card/card.tsx";
export { LoadingCard, MessageCard } from "./shared/components.tsx";
