import { describe, expect, it } from "vitest";
import { evaluateFormula, type FormulaScope } from "./flow-expressions.js";

const scope: FormulaScope = (ref) =>
  ({
    Quantity: 5,
    Price: 19.99,
    CustomerName: "Jane",
    RushOrder: true,
    Empty: "",
    Nothing: null,
    "Get_Account.Name": "Acme",
  })[ref];

const evalOk = (expr: string) => {
  const r = evaluateFormula(expr, scope);
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.value;
};

describe("flow formula evaluator", () => {
  it("arithmetic with precedence and merge refs", () => {
    expect(evalOk("{!Quantity} * 2 + 1")).toBe(11);
    expect(evalOk("({!Quantity} + 1) * 2")).toBe(12);
    expect(evalOk("2 ^ 3 * 2")).toBe(16);
    expect(evalOk("-{!Quantity}")).toBe(-5);
    expect(evalOk("ROUND({!Quantity} * {!Price}, 2)")).toBe(99.95);
  });

  it("string concat via & and +", () => {
    expect(evalOk('"Hi " & {!CustomerName} & "!"')).toBe("Hi Jane!");
    expect(evalOk('{!CustomerName} + " Doe"')).toBe("Jane Doe");
  });

  it("comparison and logic", () => {
    expect(evalOk("{!Quantity} > 3")).toBe(true);
    expect(evalOk("{!Quantity} <> 5")).toBe(false);
    expect(evalOk('{!CustomerName} = "Jane"')).toBe(true);
    expect(evalOk("AND({!RushOrder}, {!Quantity} >= 5)")).toBe(true);
    expect(evalOk("OR(false, NOT({!RushOrder}))")).toBe(false);
    expect(evalOk("{!RushOrder} && {!Quantity} > 1")).toBe(true);
  });

  it("core functions", () => {
    expect(evalOk('IF({!Quantity} > 3, "big", "small")')).toBe("big");
    expect(evalOk("ISBLANK({!Empty})")).toBe(true);
    expect(evalOk("ISBLANK({!CustomerName})")).toBe(false);
    expect(evalOk('NULLVALUE({!Nothing}, "fallback")')).toBe("fallback");
    expect(evalOk("LEN({!CustomerName})")).toBe(4);
    expect(evalOk("UPPER(LEFT({!CustomerName}, 2))")).toBe("JA");
    expect(evalOk('CONTAINS({!Get_Account.Name}, "cm")')).toBe(true);
    expect(evalOk('CASE({!Quantity}, 1, "one", 5, "five", "many")')).toBe("five");
    expect(evalOk("MAX(1, {!Quantity}, 3)")).toBe(5);
    expect(evalOk('SUBSTITUTE("a-b-c", "-", "+")')).toBe("a+b+c");
    expect(evalOk("TEXT({!Quantity})")).toBe("5");
    expect(evalOk('VALUE("42") + 1')).toBe(43);
  });

  it("globals and dates", () => {
    expect(evalOk("{!$GlobalConstant.True}")).toBe(true);
    expect(evalOk("{!$GlobalConstant.EmptyString}")).toBe("");
    expect(evalOk("DATE(2026, 8, 5)")).toBe("2026-08-05");
    expect(String(evalOk("{!$Flow.CurrentDate}"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(evalOk('DATE(2026, 8, 5) > "2026-08-01"')).toBe(true);
  });

  it("unset references read as null (like flow)", () => {
    expect(evalOk("ISBLANK({!NeverSet})")).toBe(true);
  });

  it("degrades honestly on the unknown", () => {
    expect(evaluateFormula("VLOOKUP({!X})", scope).ok).toBe(false);
    expect(evaluateFormula("{!$Api.Session_ID}", scope).ok).toBe(false);
    expect(evaluateFormula("1 +* 2", scope).ok).toBe(false);
    expect(evaluateFormula('LEFT("abc")', scope).ok).toBe(false); // arity
    expect(evaluateFormula("REGEX({!X}, '.*')", scope).ok).toBe(false);
  });
});
