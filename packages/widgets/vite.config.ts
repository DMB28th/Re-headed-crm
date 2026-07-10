import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Each widget compiles to ONE self-contained HTML file (MCP Apps requirement:
// the resource carries everything; the sandbox loads nothing from our servers).
const INPUT = process.env.INPUT;
if (!INPUT) throw new Error("INPUT env var is not set (e.g. INPUT=record-card.html)");

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    minify: true,
    cssMinify: true,
    rollupOptions: { input: INPUT },
    outDir: "dist",
    emptyOutDir: false,
  },
});
