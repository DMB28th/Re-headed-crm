/**
 * CSS coverage guard: every rc-/rt-/hc-/cs-/wd- class a widget's TSX references
 * must have a matching rule in the CSS files that widget's mcp-app.tsx imports.
 * A cross-bundle leak (a class defined only in another widget's CSS) ships an
 * unstyled element — this catches it at the source level, no build required.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const WIDGETS = ["record-card", "results-table", "home-card", "flow-run"];
// Not preceded by "-" so CSS custom properties (--rt-cols) aren't read as classes.
const CLASS_RE = /(?<![-\w])((?:rc|rt|hc|cs|wd)-[a-z0-9-]+)/g;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Resolve the CSS files a widget bundle imports (theme + its own). */
function importedCss(widget) {
  const app = readFileSync(join(SRC, widget, "mcp-app.tsx"), "utf8");
  return [...app.matchAll(/import\s+"([^"]+\.css)"/g)].map((m) =>
    resolve(SRC, widget, m[1]),
  );
}

/** TSX source files that render into a widget: its dir + everything in shared/. */
function widgetSources(widget) {
  return [...walk(join(SRC, widget)), ...walk(join(SRC, "shared"))].filter(
    (p) => p.endsWith(".tsx") || p.endsWith(".ts"),
  );
}

let failures = 0;
for (const widget of WIDGETS) {
  const css = importedCss(widget).map((p) => readFileSync(p, "utf8")).join("\n");
  const defined = new Set([...css.matchAll(/\.((?:rc|rt|hc|cs|wd)-[a-z0-9-]+)/g)].map((m) => m[1]));
  const used = new Set();
  for (const file of widgetSources(widget)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(CLASS_RE)) used.add(m[1]);
  }
  // A token ending in "-" is a template-literal stem (`cs-pill--${tone}`); it's
  // covered if any defined class starts with it (`.cs-pill--warn`).
  const isCovered = (c) =>
    defined.has(c) || (c.endsWith("-") && [...defined].some((d) => d.startsWith(c)));
  const missing = [...used].filter((c) => !isCovered(c)).sort();
  if (missing.length > 0) {
    failures += missing.length;
    console.error(`✗ ${widget}: ${missing.length} class(es) used but not defined in its bundle:`);
    for (const c of missing) console.error(`    .${c}`);
  } else {
    console.log(`✓ ${widget}: all ${used.size} classes covered`);
  }
}

if (failures > 0) {
  console.error(`\nCSS coverage failed: ${failures} unstyled class(es).`);
  process.exit(1);
}
console.log("\nCSS coverage OK.");
