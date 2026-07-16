"use client";
/**
 * Danger zone on the object hub: remove an object's Cardstack config. Reversible
 * (re-add anytime) but confirmation-gated — you type the object's name to arm
 * the delete, matching the weight of losing a layout + its lists.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemoveObjectZone({ object, label }: { object: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim().toLowerCase() === label.toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/objects/${object}`, { method: "DELETE" });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Remove failed.");
        setBusy(false);
        return;
      }
      // Back to home; the nav re-reads its object list on mount.
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 rounded-[12px] border border-drift-ink/30 bg-drift/40 p-4">
      <h2 className="text-[13px] font-semibold text-drift-ink">Danger zone</h2>
      <p className="mt-1 text-[12px] text-ink-55">
        Remove <strong>{label}</strong> from Cardstack — its layout, chat lists and card config.
        This does <strong>not</strong> delete the object or any records in your CRM; {label} simply
        returns to “+ Add object” and you can set it up again anytime.
      </p>

      {!open ? (
        <button
          type="button"
          className="st-btn mt-3 border-drift-ink/40 text-drift-ink"
          onClick={() => setOpen(true)}
        >
          Remove {label} from Cardstack…
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-[12px] text-ink-55">
            Type <strong>{label}</strong> to confirm:
            <input
              autoFocus
              className="st-input mt-1 w-full py-1 text-[12.5px]"
              value={typed}
              placeholder={label}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          {error && <div className="text-[12px] text-drift-ink">{error}</div>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="st-btn"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="st-btn border-drift-ink/50 bg-drift text-drift-ink disabled:opacity-40"
              disabled={!armed || busy}
              onClick={remove}
            >
              {busy ? "Removing…" : `Remove ${label}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
