import { applyWorkspaceContext } from './workspace.mjs';
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { mountRecordEdit } from "./controller.mjs";
const app = new App({ name: "Cardstack Record editor", version: "1.0.0" });
function hostStyles(context) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
  applyWorkspaceContext(document, context);
}
const controller = mountRecordEdit(app, document, { hostStyles });
addEventListener(
  "pagehide",
  () => {
    controller.disconnect();
    app.close();
  },
  { once: true },
);
