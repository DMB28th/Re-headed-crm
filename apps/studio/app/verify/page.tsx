/**
 * Email verification landing page. Unlike `/reset`, this GET DOES consume the
 * token (`verifyEmail` → `consumeToken`) — deliberate, not an oversight: a
 * mail-scanner prefetch that ends up verifying the address proves delivery to
 * that inbox, which is a harmless side effect to get for free (task-11
 * brief). A real click and a scanner's prefetch are indistinguishable here,
 * and both outcomes — "verified" — are fine.
 */
import { getStore } from "../../lib/backend";
import { verifyEmail } from "../../lib/account-flows";
import { AuthShell } from "../../components/auth-shell";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const token = single(params.token);

  const store = await getStore();
  const result = token ? await verifyEmail(store, token) : { ok: false };

  if (!result.ok) {
    return (
      <AuthShell title="That link expired.">
        <p className="text-[14px] leading-6 text-ink-70">
          Sign in and use the “Resend” banner to get a new one.
        </p>
        <a
          href="/login"
          className="st-btn st-btn--primary mt-4 flex w-full items-center justify-center !py-2.5 text-[14px]"
        >
          Sign in
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Email verified.">
      <a
        href="/"
        className="st-btn st-btn--primary mt-2 flex w-full items-center justify-center !py-2.5 text-[14px]"
      >
        Open Studio →
      </a>
    </AuthShell>
  );
}
