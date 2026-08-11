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
  { slug: "layouts", label: "Card design" },
  { slug: "actions", label: "Card actions" },
  { slug: "lists", label: "Lists & views" },
  { slug: "permissions", label: "Write access" },
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
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  indent?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
  const [pendingCount, setPendingCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // The tray is the source of truth for "what's staged" across every surface;
  // the per-object dot below is a secondary hint for layouts only.
  const loadPending = useCallback(async () => {
    try {
      const res = await fetch("/api/pending");
      if (!res.ok) return;
      const { changes } = (await res.json()) as { changes?: unknown[] };
      setPendingCount(changes?.length ?? 0);
    } catch {
      // A pending-count hiccup must never take the whole nav down.
    }
  }, []);

  // Refetch on navigation: connect/disconnect and publishes change the rail.
  useEffect(() => {
    void load();
    void loadPending();
  }, [load, loadPending, pathname]);

  useEffect(() => setMobileOpen(false), [pathname]);

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

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    window.location.assign("/login");
  };

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <button
          type="button"
          className="st-btn !px-2.5 !py-1.5"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          Menu
        </button>
        <span className="text-[15px] font-semibold tracking-[-0.02em]">Cardstack Studio</span>
        <span className="w-[58px]" />
      </div>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-[rgba(20,24,40,0.35)] lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-[252px] shrink-0 flex-col gap-5 border-r border-line bg-surface px-3 py-5 shadow-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="flex items-center gap-2 px-2">
        <span className="relative inline-block h-3.5 w-3.5">
          <span className="absolute left-0 top-0 h-2.5 w-2.5 rounded-[3px] border-[1.4px] border-ink opacity-50" />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-[3px] border-[1.4px] border-ink" />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.02em]">Cardstack Studio</span>
        <button
          type="button"
          className="st-btn ml-auto !px-2 !py-1 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        >
          ×
        </button>
      </div>

      <RailLink href="/" active={pathname === "/"}>
        Overview
      </RailLink>

      {connected && (
        <Link
          href="/publish"
          className={`-mt-3 block rounded-[8px] px-2.5 py-1.5 text-[12.5px] transition-colors ${
            pathname === "/publish"
              ? "bg-[rgba(47,53,80,0.08)] font-medium text-ink"
              : pendingCount > 0
                ? "bg-draft text-draft-ink hover:bg-[rgba(138,90,16,0.12)]"
                : "text-ink-45 hover:bg-[rgba(47,53,80,0.05)] hover:text-ink"
          }`}
          title={
            pendingCount > 0
              ? "Staged changes reps can't see yet — review and publish them"
              : "Nothing staged"
          }
        >
          <span className="flex items-center justify-between gap-2">
            <span>Pending changes</span>
            {pendingCount > 0 && (
              <span className="st-chip-mono bg-draft text-draft-ink">{pendingCount}</span>
            )}
          </span>
        </Link>
      )}

      <div>
        <div className="st-section-label px-2.5 pb-1.5">Cards</div>
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

      {connected && (
        <div>
          <div className="st-section-label px-2.5 pb-1.5">Shared</div>
          <RailLink href="/home-card" active={pathname === "/home-card"}>
            Home card
          </RailLink>
          {/* Custom screens are reached from a flow (design 10c), not a rail
              entry of their own — see custom-screen-editor.tsx's design note. */}
          <RailLink
            href="/flows"
            active={pathname.startsWith("/flows") || pathname.startsWith("/custom-screens")}
          >
            Flows
          </RailLink>
          <RailLink href="/audit" active={pathname === "/audit"}>
            Audit log
          </RailLink>
        </div>
      )}

      <div className="mt-auto space-y-1">
        <RailLink href="/connections" active={pathname === "/connections"}>
          <span className="flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-success-dot" : "bg-line"}`}
            />
            Connections
          </span>
        </RailLink>
        <button
          type="button"
          className="block w-full rounded-[8px] px-2.5 py-1.5 text-left text-[13px] text-ink-55 hover:bg-paper hover:text-ink"
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
      </nav>
    </>
  );
}
