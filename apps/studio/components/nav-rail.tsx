"use client";
/**
 * Studio navigation shell (design 12b): 224px left rail, object-scoped tabs.
 * Objects are dynamic (object picker 3c); Shared holds cross-object capability
 * surfaces (home card, custom screens, flows, audit).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const objectTabs = [
  { slug: "layouts", label: "Layouts" },
  { slug: "lists", label: "Lists" },
  { slug: "permissions", label: "Permissions" },
  { slug: "assignment", label: "Assignment" },
];

interface ObjectsData {
  connection: { status: "connected" | "disconnected" } | null;
  objects: { api: string; labelPlural: string; draft: boolean; publishedRevision: number | null }[];
  available: { api: string; labelPlural: string }[];
  /** Set when custom-object discovery is blocked by a missing token scope. */
  customObjectsBlocked?: string | null;
}

function RailLink({
  href,
  active,
  children,
  indent,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-[8px] px-2.5 py-1.5 text-[12.5px] transition-colors ${
        indent ? "ml-4" : ""
      } ${active ? "bg-[rgba(47,53,80,0.08)] font-medium text-ink" : "text-ink-55 hover:bg-[rgba(47,53,80,0.05)] hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<ObjectsData | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close the object picker on an outside click (org lists are long — it must
  // not linger after you click away).
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setPickerQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const load = useCallback(async () => {
    const res = await fetch("/api/objects");
    setData((await res.json()) as ObjectsData);
  }, []);

  // Refetch on navigation: connect/disconnect and publishes change the rail.
  useEffect(() => {
    void load();
  }, [load, pathname]);

  const addObject = async (api: string) => {
    setAdding(api);
    setAddError(null);
    try {
      const res = await fetch("/api/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object: api }),
      });
      if (res.ok) {
        setPickerOpen(false);
        await load();
        router.push(`/objects/${api}/layouts`);
        return;
      }
      // Surface the failure instead of silently doing nothing (a describe error,
      // a scope gap, or a misconfigured server all landed here invisibly before).
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setAddError(json.error ?? `Couldn't add ${api} (HTTP ${res.status}).`);
    } catch (err) {
      setAddError(String(err));
    } finally {
      setAdding(null);
    }
  };

  const connected = data?.connection?.status === "connected";
  const activeObject = pathname.startsWith("/objects/") ? pathname.split("/")[2] : null;

  return (
    <nav className="w-[224px] shrink-0 border-r border-line-soft bg-surface px-3 py-5 flex flex-col gap-5">
      <div className="flex items-center gap-2 px-2">
        <span className="relative inline-block h-3.5 w-3.5">
          <span className="absolute left-0 top-0 h-2.5 w-2.5 rounded-[3px] border-[1.4px] border-ink opacity-50" />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-[3px] border-[1.4px] border-ink" />
        </span>
        <span className="text-[13.5px] font-semibold tracking-tight">Cardstack Studio</span>
      </div>

      <RailLink href="/" active={pathname === "/"}>
        Home
      </RailLink>

      <div>
        <div className="st-section-label px-2.5 pb-1.5">Objects</div>
        {data && !connected && (
          <div className="px-2.5 py-1.5 text-[12px] text-ink-45">
            No CRM connected —{" "}
            <Link href="/connections" className="underline">
              connect one
            </Link>
          </div>
        )}
        {connected &&
          data?.objects.map((object) => {
            const expanded = activeObject === object.api || (activeObject === null && data.objects[0] === object);
            return (
              <div key={object.api}>
                <RailLink
                  href={`/objects/${object.api}`}
                  active={pathname === `/objects/${object.api}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium capitalize text-ink">
                      {object.labelPlural}
                      {object.draft && (
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warn-dot"
                          title="Unpublished draft — reps still see the published version"
                        />
                      )}
                    </span>
                    {object.draft && (
                      <span className="st-chip-mono bg-draft text-draft-ink">draft</span>
                    )}
                  </span>
                </RailLink>
                {expanded &&
                  objectTabs.map((tab) => (
                    <RailLink
                      key={tab.slug}
                      href={`/objects/${object.api}/${tab.slug}`}
                      active={pathname === `/objects/${object.api}/${tab.slug}`}
                      indent
                    >
                      {tab.label}
                    </RailLink>
                  ))}
              </div>
            );
          })}
        {connected && (data?.available.length ?? 0) > 0 && (
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              className="mt-2 ml-2.5 w-[calc(100%-20px)] rounded-[8px] border border-dashed border-line px-2.5 py-1.5 text-left text-[12px] text-ink-45 hover:text-ink"
              onClick={() => {
                setPickerOpen((o) => !o);
                setPickerQuery("");
              }}
            >
              + Add object
            </button>
            {pickerOpen &&
              (() => {
                const q = pickerQuery.trim().toLowerCase();
                const all = data?.available ?? [];
                const matches = q
                  ? all.filter(
                      (o) =>
                        o.labelPlural.toLowerCase().includes(q) || o.api.toLowerCase().includes(q),
                    )
                  : all;
                const shown = matches.slice(0, 10); // top 10; search to reach the rest
                return (
                  <div className="absolute left-2.5 z-30 mt-1 w-[calc(100%-20px)] rounded-[10px] border border-line bg-surface p-1 shadow-lg">
                    <input
                      autoFocus
                      className="st-input mb-1 w-full py-1 text-[12px]"
                      placeholder={`Search ${all.length} objects…`}
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                    />
                    <div className="max-h-[260px] overflow-y-auto">
                      {shown.map((object) => (
                        <button
                          key={object.api}
                          type="button"
                          className="block w-full rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] hover:bg-paper"
                          disabled={adding !== null}
                          onClick={() => addObject(object.api)}
                        >
                          {adding === object.api ? "Adding…" : object.labelPlural}
                        </button>
                      ))}
                      {shown.length === 0 && (
                        <div className="px-2.5 py-2 text-[11.5px] text-ink-45">No matches.</div>
                      )}
                    </div>
                    {matches.length > shown.length && (
                      <div className="px-2.5 py-1 text-[11px] text-ink-45">
                        +{matches.length - shown.length} more — keep typing to narrow.
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        )}
        {connected && data?.customObjectsBlocked && (
          <div className="mx-2.5 mt-2 rounded-[8px] bg-draft px-2.5 py-1.5 text-[11px] leading-snug text-draft-ink">
            {data.customObjectsBlocked}
          </div>
        )}
        {addError && (
          <div className="mx-2.5 mt-2 rounded-[8px] bg-drift px-2.5 py-1.5 text-[11px] leading-snug text-drift-ink">
            {addError}
          </div>
        )}
      </div>

      <div>
        <div className="st-section-label px-2.5 pb-1.5">Shared</div>
        {/* Home card / custom screens / flows all read from the connected CRM —
            hide them until a CRM is connected so they can't render empty/broken.
            Audit log is CRM-independent and always available. */}
        {connected && (
          <>
            <RailLink href="/home-card" active={pathname === "/home-card"}>
              Home card
            </RailLink>
            <RailLink href="/custom-screens" active={pathname === "/custom-screens"}>
              Custom screens
            </RailLink>
            <RailLink href="/flows" active={pathname === "/flows"}>
              Flows
            </RailLink>
          </>
        )}
        <RailLink href="/audit" active={pathname === "/audit"}>
          Audit log
        </RailLink>
      </div>

      <div className="mt-auto">
        <RailLink href="/connections" active={pathname === "/connections"}>
          <span className="flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-success-dot" : "bg-line"}`}
            />
            Connections
          </span>
        </RailLink>
      </div>
    </nav>
  );
}
