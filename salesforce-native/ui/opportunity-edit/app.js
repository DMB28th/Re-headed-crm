import { applyWorkspaceContext } from './workspace.mjs';
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';
import { mountOpportunity } from './controller.mjs';
const app = new App({ name: 'Cardstack Opportunity editor', version: '1.0.0' });
function hostStyles(context) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
  applyWorkspaceContext(document, context);
}
const controller = mountOpportunity(app, document, { hostStyles });
addEventListener(
  'pagehide',
  () => {
    controller.disconnect();
    app.close();
  },
  { once: true },
);
