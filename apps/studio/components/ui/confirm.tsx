"use client";
/**
 * Confirmation + dialog primitives.
 *
 * Studio used to expand a sentence and two buttons INSIDE the flex row that
 * held the trigger, so confirming a regenerate shoved "Publish layout…"
 * sideways mid-interaction. These overlay instead: the row never reflows, and
 * Escape / outside-click / focus-return work the way a dropdown should.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Escape to dismiss + click-outside to dismiss + focus return, in one place. */
function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    // `true` so a click that also closes a parent still reaches us first.
    document.addEventListener("mousedown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer, true);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

export function ConfirmPopover({
  open,
  title,
  detail,
  confirmLabel = "Confirm",
  busyLabel,
  busy = false,
  tone = "default",
  align = "right",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** What actually happens, in the admin's terms. Reps are the stakes. */
  detail?: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  tone?: "default" | "danger";
  align?: "left" | "right";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useDismissable(open, onCancel);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);
  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className={`absolute z-40 mt-2 w-[286px] rounded-[10px] border border-line bg-surface p-3 shadow-lg ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="text-[12.5px] font-medium">{title}</div>
      {detail && <p className="mt-1 text-[11.5px] leading-snug text-ink-55">{detail}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="st-btn !py-1 text-[11.5px]" onClick={onCancel}>
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          className={`st-btn !py-1 text-[11.5px] ${tone === "danger" ? "st-btn--danger" : "st-btn--primary"}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? (busyLabel ?? "Working…") : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** A trigger button that owns its own confirm popover. */
export function ConfirmButton({
  label,
  className = "st-btn",
  title,
  detail,
  confirmLabel,
  busyLabel,
  busy,
  tone,
  align,
  disabled,
  onConfirm,
}: {
  label: React.ReactNode;
  className?: string;
  title: string;
  detail?: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  tone?: "default" | "danger";
  align?: "left" | "right";
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      <ConfirmPopover
        open={open}
        title={title}
        {...(detail ? { detail } : {})}
        {...(confirmLabel ? { confirmLabel } : {})}
        {...(busyLabel ? { busyLabel } : {})}
        {...(busy !== undefined ? { busy } : {})}
        {...(tone ? { tone } : {})}
        {...(align ? { align } : {})}
        onConfirm={() => void onConfirm()}
        onCancel={close}
      />
    </span>
  );
}

/** Modal dialog for flows too big for a popover (Review & publish). */
export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const ref = useDismissable(true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(16,18,28,0.35)] p-8">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="st-card flex max-h-full w-full flex-col overflow-hidden shadow-xl"
        style={{ maxWidth: width }}
      >
        <header className="border-b border-line-soft px-5 py-3.5">
          <h2 className="text-[13.5px] font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11.5px] text-ink-55">{subtitle}</p>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Dropdown panel with the same dismissal contract as the confirm popover. */
export function Popover({
  open,
  onClose,
  children,
  width = 280,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
}) {
  const ref = useDismissable(open, onClose);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute z-30 mt-2 rounded-[10px] border border-line bg-surface p-1.5 shadow-lg ${
        align === "right" ? "right-0" : "left-0"
      }`}
      style={{ width }}
    >
      {children}
    </div>
  );
}
