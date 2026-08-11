/**
 * Sign in — one of six pages sharing the split brand panel (`AuthShell`).
 * Server component so a failed OAuth callback's `?error=` renders on first
 * paint and "Continue with Salesforce" needs no client JS to start.
 */
import { cardstackSalesforceLoginApp } from "@cardstack/crm-adapters";
import { AuthShell } from "../../components/auth-shell";
import { SigninForm } from "../../components/auth-forms";
import { safeNext } from "../../lib/login-flow";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(single(params.next));
  const salesforce = Boolean(cardstackSalesforceLoginApp());
  return (
    <AuthShell title="Sign in" subtitle="Welcome back." error={single(params.error)}>
      <SigninForm next={next} />
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
