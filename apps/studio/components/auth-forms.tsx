"use client";

/**
 * The five auth forms, one client module. Each follows the exact
 * fetch-then-`router.replace` shape of the deleted `login` access-key form
 * (busy/error state, `st-input`/`st-btn` classes, `router.replace` +
 * `router.refresh` on success) — see the repo's git history for the pattern
 * this was copied from.
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ErrorBody = { error?: string };

function FieldError({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-3 rounded-[9px] bg-drift px-3 py-2 text-[13px] text-drift-ink">
      {message}
    </div>
  );
}

export function SigninForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      if (!response.ok) {
        setError(body.error ?? "Sign-in failed.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label className="text-[13px] font-medium" htmlFor="signin-email">
        Email
      </label>
      <input
        id="signin-email"
        type="email"
        autoFocus
        autoComplete="email"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <label className="mt-4 block text-[13px] font-medium" htmlFor="signin-password">
        Password
      </label>
      <input
        id="signin-password"
        type="password"
        autoComplete="current-password"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error && <FieldError message={error} />}

      <button
        type="submit"
        className="st-btn st-btn--primary mt-4 w-full !py-2.5 text-[14px]"
        disabled={busy || !email || !password}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <div className="mt-4 flex items-center justify-between text-[13px] text-ink-55">
        <a href="/forgot" className="underline-offset-2 hover:underline">
          Forgot password?
        </a>
        <a href="/signup" className="underline-offset-2 hover:underline">
          Create an account
        </a>
      </div>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody & { status?: string };
      if (!response.ok) {
        setError(body.error ?? "Sign-up failed.");
        setConflict(response.status === 409);
        return;
      }
      if (body.status === "check-email") {
        setCheckEmail(true);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (checkEmail) {
    return (
      <p className="text-[14px] leading-6 text-ink-70">
        Check your email to finish setting up your account.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="text-[13px] font-medium" htmlFor="signup-name">
        Name
      </label>
      <input
        id="signup-name"
        autoFocus
        autoComplete="name"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <label className="mt-4 block text-[13px] font-medium" htmlFor="signup-email">
        Email
      </label>
      <input
        id="signup-email"
        type="email"
        autoComplete="email"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <label className="mt-4 block text-[13px] font-medium" htmlFor="signup-password">
        Password
      </label>
      <input
        id="signup-password"
        type="password"
        autoComplete="new-password"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error && (
        <div role="alert" className="mt-3 rounded-[9px] bg-drift px-3 py-2 text-[13px] text-drift-ink">
          {error}
          {conflict && (
            <>
              {" "}
              <a href="/login" className="underline underline-offset-2">
                Sign in instead
              </a>
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        className="st-btn st-btn--primary mt-4 w-full !py-2.5 text-[14px]"
        disabled={busy || !name || !email || !password}
      >
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="mt-4 text-center text-[13px] text-ink-55">
        Already have an account?{" "}
        <a href="/login" className="underline-offset-2 hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Always flips, success or failure: the route itself answers the same
      // way either way (enumeration resistance), and a network hiccup here
      // isn't worth a distinct error state to design for.
      setBusy(false);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <p className="text-[14px] leading-6 text-ink-70">
        If that email has an account, we sent a link.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="text-[13px] font-medium" htmlFor="forgot-email">
        Email
      </label>
      <input
        id="forgot-email"
        type="email"
        autoFocus
        autoComplete="email"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <button
        type="submit"
        className="st-btn st-btn--primary mt-4 w-full !py-2.5 text-[14px]"
        disabled={busy || !email}
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>

      <p className="mt-4 text-center text-[13px] text-ink-55">
        <a href="/login" className="underline-offset-2 hover:underline">
          Back to sign in
        </a>
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      if (!response.ok) {
        setError(body.error ?? "Could not reset your password.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label className="text-[13px] font-medium" htmlFor="reset-password">
        New password
      </label>
      <input
        id="reset-password"
        autoFocus
        type="password"
        autoComplete="new-password"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error && <FieldError message={error} />}

      <button
        type="submit"
        className="st-btn st-btn--primary mt-4 w-full !py-2.5 text-[14px]"
        disabled={busy || !password}
      >
        {busy ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}

export function LinkForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      if (!response.ok) {
        setError(body.error ?? "Could not link your account.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="text-[14px] leading-6 text-ink-70">
        <strong className="font-semibold text-ink">{email}</strong> already has a Cardstack
        account. Enter its password once to link your Salesforce sign-in.
      </p>

      <label className="mt-4 block text-[13px] font-medium" htmlFor="link-password">
        Password
      </label>
      <input
        id="link-password"
        autoFocus
        type="password"
        autoComplete="current-password"
        className="st-input mt-2 w-full !px-3 !py-2.5 text-[14px]"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error && <FieldError message={error} />}

      <button
        type="submit"
        className="st-btn st-btn--primary mt-4 w-full !py-2.5 text-[14px]"
        disabled={busy || !password}
      >
        {busy ? "Linking…" : "Link account"}
      </button>
    </form>
  );
}
