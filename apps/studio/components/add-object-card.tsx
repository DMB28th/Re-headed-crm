"use client";
/** "+ Add an object" card (object picker 3c) — creates a starter draft and jumps to the builder. */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddObjectCard({
  available,
}: {
  available: { api: string; labelPlural: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  if (available.length === 0) {
    return (
      <div className="rounded-[13px] border border-dashed border-line p-4 text-[12.5px] text-ink-45">
        Every CRM object is configured.
      </div>
    );
  }

  const add = async (api: string) => {
    setAdding(api);
    try {
      const res = await fetch("/api/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object: api }),
      });
      if (res.ok) router.push(`/objects/${api}/layouts`);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="relative rounded-[13px] border border-dashed border-line p-4">
      <button
        type="button"
        className="block w-full text-left text-[12.5px] text-ink-45 hover:text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        + Add an object
        <div className="mt-1 text-[11.5px]">
          Starts a draft card from the CRM&apos;s fields — nothing reaches reps until you publish.
        </div>
      </button>
      {open && (
        <div className="absolute left-3 top-full z-30 mt-1 w-[220px] rounded-[10px] border border-line bg-surface p-1 shadow-lg">
          {available.map((object) => (
            <button
              key={object.api}
              type="button"
              className="block w-full rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] capitalize hover:bg-paper"
              disabled={adding !== null}
              onClick={() => add(object.api)}
            >
              {adding === object.api ? "Adding…" : object.labelPlural}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
