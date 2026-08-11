/**
 * Split brand panel shared by all six auth pages (/login, /signup, /forgot,
 * /reset, /verify, /link). Server component — the panel and its copy are
 * static; the actual forms live in the "use client" `auth-forms.tsx` this
 * renders as `children`.
 *
 * /design has no sign-in mockup (spec §5): this surface is invented in the
 * Studio token vocabulary ONLY — bg-paper, bg-surface, border-line,
 * text-ink-*, bg-accent, st-btn, st-input (see app/globals.css) — plus
 * `white`/`black` opacity variants where the mark and card rectangles sit on
 * the dark `bg-accent` panel, which the brief calls for explicitly
 * (`border-white`). No bespoke hex colors.
 */
export function AuthShell({
  title,
  subtitle,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Below md the brand panel collapses to this slim header row. */}
      <div className="flex items-center gap-3 bg-accent px-5 py-4 text-white md:hidden">
        <Mark />
        <span className="text-[14px] font-semibold tracking-[-0.02em]">Cardstack Studio</span>
      </div>

      <div className="hidden md:flex md:w-[44%] flex-col justify-between bg-accent p-10 text-white">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="text-[14px] font-semibold tracking-[-0.02em]">Cardstack Studio</span>
        </div>

        <div>
          <h2 className="text-[26px] font-semibold leading-[1.25] tracking-[-0.01em]">
            Record cards your reps use right inside chat.
          </h2>
          <p className="mt-3 max-w-[320px] text-[14px] leading-6 text-white/70">
            Design once in Studio. Live in Claude, ChatGPT, and Copilot.
          </p>
        </div>

        {/* Three offset outlined card rectangles, standing in for record cards. */}
        <div className="relative h-28 w-full max-w-[240px]">
          <div className="absolute left-0 top-8 h-20 w-40 rounded-[10px] border border-white/25" />
          <div className="absolute left-6 top-4 h-20 w-40 rounded-[10px] border border-white/45" />
          <div className="absolute left-12 top-0 h-20 w-40 rounded-[10px] border border-white/80" />
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center bg-surface px-5 py-10 md:items-center">
        <div className="w-full max-w-[360px]">
          <h1 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-ink-55">{subtitle}</p>}

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-[9px] bg-drift px-3 py-2 text-[13px] leading-5 text-drift-ink"
            >
              {error}
            </div>
          )}

          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** The two-square Cardstack mark (copied from the old login page), borders
 * flipped to white since it now sits on the dark `bg-accent` panel. */
function Mark() {
  return (
    <span className="relative inline-block h-6 w-6 shrink-0">
      <span className="absolute left-0 top-0 h-4 w-4 rounded-[4px] border-2 border-white opacity-45" />
      <span className="absolute bottom-0 right-0 h-4 w-4 rounded-[4px] border-2 border-white" />
    </span>
  );
}
