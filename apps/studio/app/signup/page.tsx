/**
 * Create an account — same split-panel shell as `/login`. Success either
 * signs in immediately (brand-new account) or hands back
 * `{status:"check-email"}` when the address already exists passwordless
 * (Salesforce-created or rep-runtime identity) — `SignupForm` renders the
 * inline notice for that case instead of navigating.
 */
import { cardstackSalesforceLoginApp } from "@cardstack/crm-adapters";
import { AuthShell } from "../../components/auth-shell";
import { SignupForm } from "../../components/auth-forms";
import { safeNext } from "../../lib/login-flow";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(single(params.next));
  const salesforce = Boolean(cardstackSalesforceLoginApp());
  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up your Studio workspace."
      error={single(params.error)}
    >
      <SignupForm next={next} />
      {salesforce && (
        <>
          <div className="mt-5 flex items-center gap-3 text-[12px] text-ink-45">
            <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
          </div>
          <a
            href={`/api/auth/salesforce/start?next=${encodeURIComponent(next)}`}
            className="st-btn mt-4 flex w-full items-center justify-center !py-2.5 text-[14px]"
          >
            Continue with Salesforce
          </a>
          <a
            href={`/api/auth/salesforce/start?env=sandbox&next=${encodeURIComponent(next)}`}
            className="mt-2 block text-center text-[13px] text-ink-55 underline-offset-2 hover:underline"
          >
            Use a sandbox org instead
          </a>
        </>
      )}
    </AuthShell>
  );
}
