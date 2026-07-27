import { describe, expect, it, vi } from "vitest";
import { ConfigPreferenceStore, normalizeAsk } from "./preferences.js";

describe("durable view preferences", () => {
  it("normalizes equivalent asks to the same key", () => {
    expect(normalizeAsk("  My OPEN deals?! ")).toBe("my open deals");
  });

  it("persists and recalls choices through the config store", async () => {
    const values = new Map<string, Record<string, unknown>>();
    const store = {
      kvSet: vi.fn(async (namespace: string, key: string, value: Record<string, unknown>) => {
        values.set(`${namespace}:${key}`, value);
      }),
      kvGet: vi.fn(async (namespace: string, key: string) => values.get(`${namespace}:${key}`)),
    };
    const preferences = new ConfigPreferenceStore(store);

    await preferences.rememberViewChoice("workspace", "My OPEN deals?!", "view-7", "ada");

    expect(await preferences.recallViewChoice("workspace", "my open deals", "ada")).toBe(
      "view-7",
    );
    expect(store.kvSet).toHaveBeenCalledWith(
      "view-preferences",
      "workspace::ada::my open deals",
      { viewId: "view-7" },
    );
  });
});
