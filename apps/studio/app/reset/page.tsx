/**
 * Password reset landing page. GET must only PEEK the token
 * (`peekToken`), never consume it — mail clients' link-scanners prefetch
 * this URL, and consuming here would burn the token before the person ever
 * sees the form. It burns only on the form's POST (`/api/auth/reset` →
 * `performPasswordReset` → `consumeToken`).
 */
import { getStore } from "../../lib/backend";
import { peekToken, PASSWORD_RESET_NS } from "../../lib/auth-tokens";
import { AuthShell } from "../../components/auth-shell";
import { ResetForm } from "../../components/auth-forms";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const token = single(params.token);

  const store = await getStore();
  const payload = token ? await peekToken(store, PASSWORD_RESET_NS, token) : undefined;

  if (!token || !payload) {
    return (
      <AuthShell title="Reset your password">
        <p className="text-[14px] leading-6 text-ink-70">
          That link expired or was already used.{" "}
          <a href="/forgot" className="underline-offset-2 hover:underline">
            Request a new link
          </a>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <ResetForm token={token} />
    </AuthShell>
  );
}
