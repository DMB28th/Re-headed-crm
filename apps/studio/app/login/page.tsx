/**
 * Sign in. Salesforce is the identity provider — signing in is also what
 * creates your workspace the first time someone from your org arrives.
 *
 * A server component so the OAuth entry points can be ordinary links: no client
 * JavaScript is involved in starting a sign-in, and the `?error=` a failed
 * callback redirects back with renders on the first paint.
 *
 * The access key stays as a secondary path so deployments that predate accounts
 * (and any org that has not configured the Cardstack connected app yet) can
 * still get in. /api/session's POST bridges it to a real account + workspace.
 */
import { cardstackSalesforceLoginApp } from "@cardstack/crm-adapters";
import { AccessKeyForm } from "./access-key-form";
import { safeNext } from "../../lib/login-flow";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  const error = single(params.error);
  const next = safeNext(single(params.next));
  const salesforceConfigured = Boolean(cardstackSalesforceLoginApp());
  const startUrl = (env: "production" | "sandbox") =>
    `/api/auth/salesforce/start?next=${encodeURIComponent(next)}${
      env === "sandbox" ? "&env=sandbox" : ""
    }`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-[420px] rounded-[16px] border border-line bg-surface p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="relative inline-block h-6 w-6">
            <span className="absolute left-0 top-0 h-4 w-4 rounded-[4px] border-2 border-accent opacity-45" />
            <span className="absolute bottom-0 right-0 h-4 w-4 rounded-[4px] border-2 border-accent" />
          </span>
          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.02em]">Cardstack Studio</h1>
            <p className="text-[13px] text-ink-55">Sign in to your workspace</p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-[9px] bg-drift px-3 py-2 text-[13px] leading-5 text-drift-ink"
          >
            {error}
          </div>
        )}

        {salesforceConfigured ? (
          <>
            <p className="mt-6 text-[14px] leading-6 text-ink-70">
              Use your Salesforce account. The first person from your org creates the
              workspace and becomes its admin. Studio is limited to workspace admins.
            </p>
            <a
              href={startUrl("production")}
              className="st-btn st-btn--primary mt-5 flex w-full items-center justify-center !py-2.5 text-[14px]"
            >
              Sign in with Salesforce
            </a>
            <a
              href={startUrl("sandbox")}
              className="mt-2.5 block text-center text-[13px] text-ink-55 underline-offset-2 hover:underline"
            >
              Use a sandbox org instead
            </a>
          </>
        ) : (
          <p className="mt-6 text-[14px] leading-6 text-ink-70">
            Salesforce sign-in is not configured on this deployment. Set{" "}
            <code className="rounded bg-paper px-1 py-0.5 text-[12px]">CARDSTACK_SF_CLIENT_ID</code>{" "}
            and{" "}
            <code className="rounded bg-paper px-1 py-0.5 text-[12px]">
              CARDSTACK_SF_CLIENT_SECRET
            </code>{" "}
            to enable it.
          </p>
        )}

        <AccessKeyForm next={next} collapsed={salesforceConfigured} />
      </div>
    </main>
  );
}
