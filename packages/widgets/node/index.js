// Node-side accessor for the built widget bundles. The MCP server imports this
// to serve ui:// resources; keeping it plain JS avoids a second build toolchain
// in this package (vite owns the widget build).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

export const WIDGET_NAMES = ["record-card", "results-table", "home-card", "flow-run"];

/** @param {"record-card" | "results-table" | "home-card" | "flow-run"} name */
export async function getWidgetHtml(name) {
  if (!WIDGET_NAMES.includes(name)) {
    throw new Error(`Unknown widget: ${name}`);
  }
  return readFile(path.join(distDir, `${name}.html`), "utf-8");
}
