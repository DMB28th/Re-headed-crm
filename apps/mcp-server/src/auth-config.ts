/**
 * Fail-closed auth-config resolution for /mcp.
 *
 * Identity on the MCP server is still derived from request headers (the chat
 * host passes x-cardstack-user-id/-tenant-id), and that identity selects which
 * user's Salesforce token drives the adapter. Until per-user cryptographic
 * identity exists (OAuth 2.1 for MCP — M7), MCP_SHARED_SECRET is the gate on
 * WHO may reach the server. Leaving it unset makes /mcp internet-open, so in
 * production we refuse to serve rather than run unauthenticated.
 */
export function resolveMcpAuth(env: {
  MCP_SHARED_SECRET?: string;
  NODE_ENV?: string;
}): { secret?: string } {
  const secret = env.MCP_SHARED_SECRET?.trim() || undefined;
  const isProd = env.NODE_ENV === "production";
  if (!secret && isProd) {
    throw new Error(
      "MCP_SHARED_SECRET is required when NODE_ENV=production. Refusing to serve /mcp unauthenticated — " +
        "set it and pass it as `Authorization: Bearer <secret>` (or x-cardstack-key) from the chat host.",
    );
  }
  return secret ? { secret } : {};
}
