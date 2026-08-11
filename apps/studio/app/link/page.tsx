/**
 * Password-once-to-link (spec §3). Reached only via the Salesforce callback's
 * `link-required` redirect (`/link?token=...&email=...`) — a missing token
 * means this was opened directly rather than followed from that redirect, so
 * there is nothing to link and the page points back at `/login`.
 */
import { AuthShell } from "../../components/auth-shell";
import { LinkForm } from "../../components/auth-forms";

export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const token = single(params.token);
  const email = single(params.email);

  if (!token || !email) {
    return (
      <AuthShell title="Link your account">
        <p className="text-[14px] leading-6 text-ink-70">
          This link is missing or expired.{" "}
          <a href="/login" className="underline-offset-2 hover:underline">
            Back to sign in
          </a>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Link your account" subtitle="One password, then you’re in.">
      <LinkForm token={token} email={email} />
    </AuthShell>
  );
}
