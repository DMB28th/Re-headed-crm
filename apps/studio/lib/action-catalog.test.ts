import { describe, expect, it } from "vitest";
import type { CardAction } from "@cardstack/core";
import { buildActionCatalog } from "./action-catalog";

const configured: CardAction[] = [
  {
    type: "screen_flow",
    flowApiName: "Renewal",
    label: "Run renewal",
    embed: "auto",
    enabled: true,
    inputs: {},
  },
];

describe("buildActionCatalog", () => {
  it("returns builtins even when both CRM sources are unavailable", () => {
    const catalog = buildActionCatalog({
      configured: [],
      objects: ["tasks", "notes"],
      quickActions: null,
      flows: null,
    });
    const builtin = catalog.sources.find((s) => s.kind === "builtin");
    expect(builtin?.entries.map((e) => e.ref.type)).toEqual([
      "update_record",
      "create_related",
      "create_related",
    ]);
    expect(catalog.sources.find((s) => s.kind === "quick_action")?.unavailable).toBeTruthy();
    expect(catalog.sources.find((s) => s.kind === "screen_flow")?.unavailable).toBeTruthy();
  });

  it("distinguishes an empty source from an unavailable one", () => {
    const catalog = buildActionCatalog({
      configured: [],
      objects: [],
      quickActions: [],
      flows: [],
    });
    expect(catalog.sources.find((s) => s.kind === "screen_flow")?.unavailable).toBeUndefined();
    expect(catalog.sources.find((s) => s.kind === "screen_flow")?.entries).toEqual([]);
  });

  it("marks already-configured actions", () => {
    const catalog = buildActionCatalog({
      configured,
      objects: [],
      quickActions: [],
      flows: [
        { api: "Renewal", label: "Renewal", inputVariables: [] },
        { api: "Onboarding", label: "Onboarding", inputVariables: [] },
      ],
    });
    const entries = catalog.sources.find((s) => s.kind === "screen_flow")!.entries;
    expect(entries.find((e) => e.label === "Renewal")?.alreadyConfigured).toBe(true);
    expect(entries.find((e) => e.label === "Onboarding")?.alreadyConfigured).toBe(false);
  });

  it("treats a configured-but-disabled action as already configured", () => {
    const catalog = buildActionCatalog({
      configured: [{ ...configured[0]!, enabled: false }],
      objects: [],
      quickActions: [],
      flows: [{ api: "Renewal", label: "Renewal", inputVariables: [] }],
    });
    const entries = catalog.sources.find((s) => s.kind === "screen_flow")!.entries;
    expect(entries[0]!.alreadyConfigured).toBe(true);
  });

  it("carries input variables including collections", () => {
    const catalog = buildActionCatalog({
      configured: [],
      objects: [],
      quickActions: [],
      flows: [
        {
          api: "Bulk",
          label: "Bulk",
          inputVariables: [
            { name: "recordIds", dataType: "String", isCollection: true },
            { name: "note", dataType: "String", isCollection: false },
          ],
        },
      ],
    });
    const entry = catalog.sources.find((s) => s.kind === "screen_flow")!.entries[0]!;
    expect(entry.inputVariables?.map((v) => v.isCollection)).toEqual([true, false]);
  });

  it("keeps an unreadable flow definition (undefined) distinct from a flow that declares no inputs ([])", () => {
    const catalog = buildActionCatalog({
      configured: [],
      objects: [],
      quickActions: [],
      flows: [
        { api: "Unreadable", label: "Unreadable", inputVariables: undefined },
        { api: "NoInputs", label: "No inputs", inputVariables: [] },
      ],
    });
    const entries = catalog.sources.find((s) => s.kind === "screen_flow")!.entries;
    const unreadable = entries.find((e) => e.label === "Unreadable")!;
    const noInputs = entries.find((e) => e.label === "No inputs")!;
    expect(unreadable.inputVariables).toBeUndefined();
    expect(noInputs.inputVariables).toEqual([]);
  });
});
