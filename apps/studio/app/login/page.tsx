import { redirect } from "next/navigation";
import { enabledProviders, isAuthEnabled } from "../../lib/auth";
import { getSession } from "../../lib/session";
import { LoginForm } from "../../components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isAuthEnabled()) {
    redirect("/");
  }
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="min-h-screen bg-paper">
      <LoginForm providers={enabledProviders()} />
    </div>
  );
}
