"use client";
/** Studio navigation shell (design 12b): 224px left rail, object-scoped tabs. */
import Link from "next/link";
import { usePathname } from "next/navigation";

const objectTabs = [
  { slug: "layouts", label: "Layouts" },
  { slug: "lists", label: "Lists" },
  { slug: "permissions", label: "Permissions" },
  { slug: "assignment", label: "Assignment" },
];

const sharedItems = [
  { label: "Home card", hint: "M4" },
  { label: "Custom screens", hint: "M6" },
  { label: "Flows", hint: "M5" },
];

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
        <RailLink href="/objects/deals/layouts" active={false}>
          <span className="font-medium text-ink">Deals</span>
        </RailLink>
        {objectTabs.map((tab) => (
          <RailLink
            key={tab.slug}
            href={`/objects/deals/${tab.slug}`}
            active={pathname === `/objects/deals/${tab.slug}`}
            indent
          >
            {tab.label}
          </RailLink>
        ))}
        <button
          type="button"
          className="mt-2 ml-2.5 w-[calc(100%-20px)] rounded-[8px] border border-dashed border-line px-2.5 py-1.5 text-left text-[12px] text-ink-45"
          disabled
          title="One object in the demo portal — more come with the object picker (3c)"
        >
          + Add object
        </button>
      </div>

      <div>
        <div className="st-section-label px-2.5 pb-1.5">Shared</div>
        {sharedItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between px-2.5 py-1.5 text-[12.5px] text-ink-45"
          >
            <span>{item.label}</span>
            <span className="st-chip-mono bg-paper text-ink-45">{item.hint}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <RailLink href="/connections" active={pathname === "/connections"}>
          <span className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-dot" />
            Connections
          </span>
        </RailLink>
      </div>
    </nav>
  );
}
