/** Password reset request — a thin wrapper around `ForgotForm` on the shared shell. */
import { AuthShell } from "../../components/auth-shell";
import { ForgotForm } from "../../components/auth-forms";

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a link.">
      <ForgotForm />
    </AuthShell>
  );
}
