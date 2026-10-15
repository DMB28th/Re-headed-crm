#!/usr/bin/env node
// Offline asset builder only; no runtime hosting, installs or network assets.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const native = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let dependencyPath;
let mode = "normal";
for (let index = 0; index < args.length; index += 2) {
  const value = args[index + 1];
  if (!value)
    throw Error(
      "Use --dependencies EXISTING_NODE_MODULES --mode normal|qa_delivery",
    );
  if (args[index] === "--dependencies") dependencyPath = value;
  else if (
    args[index] === "--mode" &&
    ["normal", "qa_delivery"].includes(value)
  )
    mode = value;
  else
    throw Error(
      "Use --dependencies EXISTING_NODE_MODULES --mode normal|qa_delivery",
    );
}
const dependencyRoot = dependencyPath
  ? path.resolve(dependencyPath)
  : path.resolve(native, "node_modules");
const require = createRequire(path.join(dependencyRoot, "../package.json"));
const entry = require.resolve("@modelcontextprotocol/ext-apps");
const sdk = JSON.parse(
  await readFile(
    path.join(path.resolve(path.dirname(entry), "../.."), "package.json"),
    "utf8",
  ),
);
if (sdk.version !== "1.7.4") throw Error("SDK_1_7_4_REQUIRED");
const { build } = createRequire(require.resolve("vite"))("esbuild");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const resource = "force-app/main/default/staticresources/";
for (const target of [
  {
    title: "Read-only delivery QA geometry",
    entry: "tests/fixtures/delivery-qa-geometry.mjs",
    template: "ui/opportunity-edit/index.html",
    output: "tests/fixtures/delivery-qa-geometry.html",
    deliveryQa: true,
  },
  {
    title: "Cardstack Record editor",
    entry: "ui/opportunity-edit/record-app.js",
    template: "ui/opportunity-edit/index.html",
    output: resource + "CardstackRecordEditUi.resource",
  },
  {
    title: "Synthetic Contact renderer demo",
    entry: "tests/fixtures/record-screen-demo.mjs",
    template: "ui/opportunity-edit/index.html",
    output: "tests/fixtures/record-screen-demo.html",
  },
  {
    entry: "ui/opportunity-edit/app.js",
    template: "ui/opportunity-edit/index.html",
    output: resource + "CardstackOpportunityEditUi.resource",
  },
  {
    entry: "ui/opportunity-edit/preview.js",
    template: "ui/opportunity-edit/preview.html",
    output: resource + "CardstackOpportunityPreviewUi.resource",
  },
  {
    entry: "tests/fixtures/opportunity-screen-demo.mjs",
    template: "ui/opportunity-edit/index.html",
    output: "tests/fixtures/opportunity-screen-demo.html",
  },
]) {
  const result = await build({
    entryPoints: [path.join(native, target.entry)],
    bundle: true,
    define: {
      CARDSTACK_DELIVERY_QA: String(
        target.deliveryQa === true || mode === "qa_delivery",
      ),
    },
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    drop: ["console", "debugger"],
    legalComments: "none",
    nodePaths: [dependencyRoot],
    metafile: true,
  });
  const script = result.outputFiles[0].text.replace(
    /<\/script/gi,
    "<\\/script",
  );
  const scriptHash = createHash("sha256").update(script).digest("base64");
  const source = await readFile(path.join(native, target.template), "utf8");
  const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const workspaceCss = await readFile(
    path.join(native, "ui/opportunity-edit/workspace.css"),
    "utf8",
  );
  const html = source
    .replace("<!--WORKSPACE_STYLE-->", `<style>${workspaceCss}</style>`)
    .replace(
      "<title>Cardstack Opportunity</title>",
      `<title>${target.title || "Cardstack Opportunity"}</title>`,
    )
    .replace(
      "<!--CSP-->",
      `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    )
    .replace("<!--APP-->", () => `<script>${script}</script>`);
  await writeFile(path.join(native, target.output), html);
  console.log(
    JSON.stringify({
      sdk: sdk.version,
      mode: target.deliveryQa ? "local_geometry" : mode,
      output: target.output,
      bytes: Buffer.byteLength(html),
      sha256: hash(html),
      inputs: Object.keys(result.metafile.inputs).length,
    }),
  );
}
