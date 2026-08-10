/**
 * Two cheap guards on Studio's request surface, and one honest statement of
 * what they are worth.
 *
 * **Rate limiting.** `POST /api/session` accepts a human-typed access key, is
 * reachable without a session, and had no limit, no lockout, and no log line —
 * so guessing it was an unlimited online attack that left no trace. This
 * converts that into a rate-limited online attack that leaves a trace. It is a
 * speed bump, not a wall: the window is in-memory, so a deployment running N
 * instances allows N times the configured rate, and an attacker with many
 * source addresses is limited per address. The real fix is retiring the access
 * key (see the migration in docs/superpowers/specs/2026-08-08-auth-redesign.md);
 * this is what makes the interim survivable.
 *
 * **Origin checking.** `SameSite=Lax` already blocks cookie attachment on
 * cross-site POST in current browsers, so this is defense in depth rather than
 * a live hole being closed. It matters because Lax is currently the *only*
 * thing standing between Studio and CSRF, and because `req.json()` does not
 * check Content-Type — a cross-site `text/plain` form can produce a body these
 * routes would parse if the cookie ever did ride along.
 *
 * Both live here rather than in each route so there is one place to read.
 */

const WINDOW_MS = 60_000;

/** Failure counters, keyed by bucket. Bounded by the opportunistic prune. */
const windows = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  /** Requests allowed per window. */
  max: number;
  windowMs?: number;
  now?: number;
}

/**
 * True when this key has exhausted its window. Counts every call, so callers
 * that only want to limit FAILURES must call it only on failure.
 */
export function rateLimited(key: string, { max, windowMs = WINDOW_MS, now = Date.now() }: RateLimitOptions): boolean {
  const existing = windows.get(key);
  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now >= v.resetAt) windows.delete(k);
    }
    return false;
  }
  existing.count += 1;
  return existing.count > max;
}

/** Test seam — the window map is module state by design. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Best-effort client address. Behind Railway's proxy `x-forwarded-for` is the
 * only signal; it is caller-controlled, so this is a bucketing key and never an
 * authorization input.
 */
export function clientKey(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

/**
 * False when the request declares an Origin that is not ours.
 *
 * A MISSING Origin is allowed: browsers omit it on same-origin navigations and
 * on some same-origin form posts, and non-browser callers omit it entirely.
 * Treating absence as hostile would break `curl` and the demo scripts without
 * closing anything, because the attack this guards against is a cross-site
 * request from a browser — and browsers always send Origin on those.
 */
export function sameOriginRequest(
  req: { method: string; headers: { get(name: string): string | null }; url: string },
  configuredOrigin = process.env.CARDSTACK_STUDIO_URL?.trim(),
): boolean {
  if (!MUTATING.has(req.method.toUpperCase())) return true;
  const declared = req.headers.get("origin");
  if (!declared) return true;
  const expected = configuredOrigin ? safeOrigin(configuredOrigin) : safeOrigin(req.url);
  return !!expected && safeOrigin(declared) === expected;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function safeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
