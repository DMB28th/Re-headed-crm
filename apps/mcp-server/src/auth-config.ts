/**
 * Auth-config resolution for /mcp.
 *
 * Identity on the MCP server is still derived from request headers (the chat
 * host passes x-cardstack-user-id/-tenant-id), and that identity selects which
 * user's Salesforce token drives the adapter. Until per-user cryptographic
 * identity exists (OAuth 2.1 for MCP — M7), MCP_SHARED_SECRET is the gate on
 * WHO may reach the server: set it to require a bearer, and the connector must
 * send it.
 *
 * When unset in production this returns `{ warnOpen: true }` — the caller logs a
 * prominent warning but the server STILL BOOTS. It must not throw here: crashing
 * at boot would fail the deploy and take a working connector offline, which is
 * worse than a warned-open endpoint. Enforcement is opt-in by setting the secret.
 */
export function resolveMcpAuth(env: {
  MCP_SHARED_SECRET?: string;
  NODE_ENV?: string;
}): { secret?: string; warnOpen: boolean } {
  const secret = env.MCP_SHARED_SECRET?.trim() || undefined;
  const isProd = env.NODE_ENV === "production";
  if (secret) return { secret, warnOpen: false };
  return { warnOpen: isProd };
}
