import { describe, expect, it } from "vitest";
import { CustomListFilter, summarizeCustomFilters } from "./view-exposures.js";

describe("CustomListFilter ops", () => {
  it("accepts not_contains / starts_with / ends_with / in", () => {
    expect(
      CustomListFilter.parse({ field: "name", op: "not_contains", value: "test" }).op,
    ).toBe("not_contains");
    expect(CustomListFilter.parse({ field: "name", op: "starts_with", value: "Acme" }).op).toBe(
      "starts_with",
    );
    expect(CustomListFilter.parse({ field: "email", op: "ends_with", value: "@acme.com" }).op).toBe(
      "ends_with",
    );
    expect(
      CustomListFilter.parse({ field: "dealstage", op: "in", values: ["a", "b"] }).values,
    ).toEqual(["a", "b"]);
  });

  it("summarizes new string ops in human phrases", () => {
    const summary = summarizeCustomFilters(
      {
        id: "cl-test",
        name: "No test names",
        filters: [
          { field: "name", op: "not_contains", value: "test" },
          { field: "dealstage", op: "in", values: ["appointmentscheduled", "qualifiedtobuy"] },
        ],
      },
      {
        name: { label: "Deal Name" },
        dealstage: {
          label: "Deal Stage",
          valueLabels: {
            appointmentscheduled: "Appointment scheduled",
            qualifiedtobuy: "Qualified to buy",
          },
        },
      },
    );
    expect(summary).toContain("Deal Name does not contain test");
    expect(summary).toContain("Deal Stage is any of Appointment scheduled, Qualified to buy");
  });
});
