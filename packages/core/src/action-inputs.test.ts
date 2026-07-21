import { describe, expect, it } from "vitest";
import { resolveActionInputs } from "./action-inputs.js";

describe("resolveActionInputs", () => {
  it("resolves context, field, literal, selection, and answered ask inputs", () => {
    const result = resolveActionInputs({
      inputs: {
        recordId: { source: "context", key: "recordId", valueType: "recordId" },
        amount: { source: "field", field: "Amount", valueType: "number" },
        urgent: { source: "literal", value: true, valueType: "boolean" },
        contactIds: {
          source: "selection",
          relationship: "OpportunityContactRoles",
          valueType: "recordIds",
          required: true,
        },
        reason: {
          source: "ask",
          prompt: "Why does this need approval?",
          valueType: "string",
          required: true,
        },
      },
      context: {
        tenantId: "t1",
        crm: "salesforce",
        objectApiName: "Opportunity",
        recordId: "006xx",
        recordFields: { Amount: 42000 },
        selections: { OpportunityContactRoles: ["003xx"] },
      },
      answers: { reason: "Competitor pressure" },
    });

    expect(result.pending).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.resolved).toEqual([
      { name: "recordId", valueType: "recordId", value: "006xx", source: "context" },
      { name: "amount", valueType: "number", value: 42000, source: "field" },
      { name: "urgent", valueType: "boolean", value: true, source: "literal" },
      {
        name: "contactIds",
        valueType: "recordIds",
        value: ["003xx"],
        source: "selection",
      },
      { name: "reason", valueType: "string", value: "Competitor pressure", source: "ask" },
    ]);
  });

  it("returns pending asks and missing required selections", () => {
    const result = resolveActionInputs({
      inputs: {
        notes: { source: "ask", prompt: "Add notes", valueType: "string", required: false },
        contactIds: { source: "selection", valueType: "recordIds", required: true },
      },
      context: {
        tenantId: "t1",
        crm: "hubspot",
        objectApiName: "deals",
        recordId: "d1",
      },
    });

    expect(result.pending).toEqual([
      { name: "notes", prompt: "Add notes", valueType: "string", required: false },
    ]);
    expect(result.missing).toEqual(["contactIds"]);
    expect(result.resolved).toEqual([]);
  });
});
