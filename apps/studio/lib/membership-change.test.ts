import { describe, expect, it } from "vitest";
import type { Membership } from "@cardstack/config-store";
import { planRoleChange } from "./membership-change";

const at = "2026-08-01T00:00:00.000Z";
const member = (accountId: string, role: "admin" | "member"): Membership => ({
  accountId,
  workspaceId: "w1",
  role,
  createdAt: at,
});

describe("planRoleChange", () => {
  it("promotes a member", () => {
    const plan = planRoleChange([member("ada", "admin"), member("rex", "member")], "rex", "admin");
    expect(plan).toEqual({ ok: true, role: "admin", changed: true });
  });

  it("demotes an admin while another remains", () => {
    const plan = planRoleChange([member("ada", "admin"), member("zoe", "admin")], "zoe", "member");
    expect(plan).toEqual({ ok: true, role: "member", changed: true });
  });

  it("refuses to demote the only admin", () => {
    const plan = planRoleChange([member("ada", "admin"), member("rex", "member")], "ada", "member");
    expect(plan).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses to demote yourself when you are the only admin", () => {
    // Same rule, stated separately because it is the one people hit.
    const plan = planRoleChange([member("ada", "admin")], "ada", "member");
    expect(plan).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses an account that is not in this workspace", () => {
    const plan = planRoleChange([member("ada", "admin")], "stranger", "admin");
    expect(plan).toMatchObject({ ok: false, status: 404 });
  });

  it("is a no-op when the role already matches", () => {
    const plan = planRoleChange([member("ada", "admin")], "ada", "admin");
    expect(plan).toEqual({ ok: true, role: "admin", changed: false });
  });

  it("allows demoting the last admin's peer down to one admin, but no further", () => {
    const two = [member("ada", "admin"), member("zoe", "admin")];
    expect(planRoleChange(two, "zoe", "member")).toMatchObject({ ok: true });
    const one = [member("ada", "admin"), member("zoe", "member")];
    expect(planRoleChange(one, "ada", "member")).toMatchObject({ ok: false, status: 409 });
  });
});
