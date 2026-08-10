/**
 * The consent interstitial, and what counts as a client we already trust.
 *
 * Finding A1: dynamic client registration is open (it has to be — that is how
 * a chat host connects), `/authorize` redirected straight to Salesforce, and
 * the Salesforce authorize URL carries no `prompt`. So anyone could register a
 * client pointing at their own server, send a rep a link on the genuine
 * Cardstack origin, and receive an authorization code the moment the rep
 * clicked it — Salesforce auto-approves an app the rep has already authorized.
 * PKCE does not help: the attacker IS the client, so they own both ends of it.
 * The SDK's redirect_uri check does not help either: the attacker registered
 * the URI they are redirecting to.
 *
 * What was missing is the one thing neither control can supply — the rep being
 * told, in terms they can act on, WHO is asking and WHERE the token goes.
 *
 * **Placement matters more than the screen does.** This runs after the
 * Salesforce leg, not at `/authorize`. Before Salesforce we do not know who the
 * browser belongs to, so the page could only warn an anonymous visitor. After
 * it we know the signer, their workspace, and the exact redirect target, and
 * `completeSalesforceCallback` is the only path to an authorization code — so
 * the code is minted on the far side of the decision and cannot be reached
 * around.
 */
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * True when every registered redirect_uri belongs to a configured trusted
 * origin.
 *
 * EVERY, not any: a client that registers one blessed URI and one
 * attacker-controlled URI is not trusted, because `/authorize` will happily
 * redirect to whichever one the request names.
 *
 * Unset config means nothing is first party, so a deployment that forgets to
 * configure this fails toward showing the screen rather than away from it.
 */
export function isFirstPartyClient(
  client: Pick<OAuthClientInformationFull, "redirect_uris">,
  env: { CARDSTACK_TRUSTED_CLIENT_ORIGINS?: string } = process.env,
): boolean {
  const trusted = new Set(
    (env.CARDSTACK_TRUSTED_CLIENT_ORIGINS ?? "")
      .split(",")
      .map((value) => originOf(value.trim()))
      .filter((value): value is string => !!value),
  );
  if (trusted.size === 0) return false;
  const uris = client.redirect_uris ?? [];
  if (uris.length === 0) return false;
  // Origin comparison, never prefix: "https://claude.ai.evil.example" must not
  // match "https://claude.ai".
  return uris.every((uri) => {
    const origin = originOf(uri);
    return !!origin && trusted.has(origin);
  });
}

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export interface ConsentDetails {
  /** Signed, single-use continuation token bound to the pending record. */
  token: string;
  signerName: string;
  signerEmail?: string;
  workspaceName: string;
  clientName: string;
  /** Where the authorization code will be sent if this is allowed. */
  redirectOrigin: string;
}

/** `client_name` is attacker-controlled and lands in HTML. Escape everything. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#f6f6f4; color:#191918; font:15px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif; padding:20px; }
  .card { width:100%; max-width:440px; background:#fff; border:1px solid #e5e4e0; border-radius:16px; padding:28px; }
  h1 { font-size:19px; margin:0 0 4px; letter-spacing:-0.02em; }
  p { margin:0 0 14px; }
  .muted { color:#6b6a66; font-size:13px; }
  dl { margin:18px 0; padding:14px; background:#f6f6f4; border-radius:10px; }
  dt { font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#6b6a66; }
  dd { margin:2px 0 12px; font-weight:500; word-break:break-all; }
  dd:last-child { margin-bottom:0; }
  .actions { display:flex; gap:10px; margin-top:20px; }
  button { flex:1; padding:9px 14px; border-radius:9px; border:1px solid #e5e4e0; background:#fff;
    font:inherit; font-weight:500; cursor:pointer; }
  button.primary { background:#191918; color:#fff; border-color:#191918; }
  form { display:contents; }
  @media (prefers-color-scheme: dark) {
    body { background:#141414; color:#f2f1ee; }
    .card { background:#1c1c1b; border-color:#2e2e2c; }
    dl { background:#141414; }
    button { background:#1c1c1b; color:#f2f1ee; border-color:#2e2e2c; }
    button.primary { background:#f2f1ee; color:#191918; border-color:#f2f1ee; }
  }
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
<body><div class="card">${body}</div></body></html>`;
}

/**
 * The screen itself. Deliberately states the redirect origin as its own field:
 * that is the fact an attacker cannot disguise and the one a rep can judge.
 */
export function renderConsent(details: ConsentDetails, consentPath: string): string {
  const signer = details.signerEmail
    ? `${details.signerName} (${details.signerEmail})`
    : details.signerName;
  return page(
    "Allow access to your CRM?",
    `<h1>Allow access to your CRM?</h1>
<p class="muted">You're signed in to Cardstack as ${escapeHtml(signer)} — ${escapeHtml(details.workspaceName)}.</p>
<p><strong>${escapeHtml(details.clientName)}</strong> is asking to read and edit your Salesforce records through Cardstack.</p>
<dl>
  <dt>App</dt><dd>${escapeHtml(details.clientName)}</dd>
  <dt>Access tokens will be sent to</dt><dd>${escapeHtml(details.redirectOrigin)}</dd>
</dl>
<p class="muted">If you didn't start this from that app, cancel. Allowing it lets that app act as you in Salesforce.</p>
<div class="actions">
  <form method="post" action="${escapeHtml(consentPath)}">
    <input type="hidden" name="token" value="${escapeHtml(details.token)}">
    <input type="hidden" name="decision" value="deny">
    <button type="submit">Cancel</button>
  </form>
  <form method="post" action="${escapeHtml(consentPath)}">
    <input type="hidden" name="token" value="${escapeHtml(details.token)}">
    <input type="hidden" name="decision" value="allow">
    <button type="submit" class="primary">Allow</button>
  </form>
</div>`,
  );
}

/**
 * Production vs sandbox, for the rep lane (C2).
 *
 * Studio has always offered this choice; `/authorize` never could, because the
 * MCP SDK passes no custom parameters through to the provider. So a rep whose
 * org is a sandbox simply could not sign in on a production-configured
 * deployment, and got a generic failure with no control that would fix it.
 * Guessing is not better than asking.
 */
export function renderLoginHostPicker(token: string, chooseUrl: string): string {
  const href = (env: string) =>
    `${escapeHtml(chooseUrl)}?t=${encodeURIComponent(token)}&env=${env}`;
  return page(
    "Which Salesforce?",
    `<h1>Which Salesforce?</h1>
<p class="muted">Sign in to the org your records live in.</p>
<div class="actions">
  <a href="${href("production")}" style="flex:1"><button type="button" class="primary" style="width:100%">Production</button></a>
  <a href="${href("sandbox")}" style="flex:1"><button type="button" style="width:100%">Sandbox</button></a>
</div>
<p class="muted" style="margin-top:16px">Sandbox orgs sign in at test.salesforce.com. A sandbox is a separate Salesforce org, so it gets its own Cardstack workspace.</p>`,
  );
}

/** Rendered when a consent token is stale, replayed, or forged. */
export function renderConsentExpired(): string {
  return page(
    "That sign-in link expired",
    `<h1>That sign-in link expired</h1>
<p>Close this tab and connect Cardstack again from your chat app.</p>`,
  );
}
