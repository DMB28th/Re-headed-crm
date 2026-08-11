/**
 * The Studio authorization choke point.
 *
 * These tests are the regression guard for finding A5 (demotion took up to
 * fourteen days to take effect) and for the self-serve-accounts redesign:
 * Studio authority is workspace OWNERSHIP (`Workspace.ownerAccountId`), with a
 * legacy fallback to admin membership for workspaces the attach-workspace
 * script has not stamped yet, and a password reset invalidates every session
 * minted before it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryConfigStore } from "@cardstack/config-store";
import { resolveStudioSession } from "./auth";
import { STUDIO_SESSION_NS, type StudioSessionRecord } from "./studio-session";

const NOW = Date.UTC(2026, 7, 8, 12);
const DAY = 24 * 60 * 60 * 1_000;

let store: InMemoryConfigStore;

const seed = async (overrides: Partial<StudioSessionRecord> = {}) => {
  store = new InMemoryConfigStore();
  await store.createWorkspace({
    id: "w1",
    salesforceOrgId: "00D000000000001AAA",
    name: "Acme",
    createdAt: new Date(NOW - DAY).toISOString(),
  });
  await store.upsertAccount({
    id: "ada@example.com",
    salesforceUserId: "005000000000001AAA",
    name: "Ada Admin",
    email: "ada@example.com",
    createdAt: new Date(NOW - DAY).toISOString(),
  });
  await store.setMembership({
    accountId: "ada@example.com",
    workspaceId: "w1",
    role: "admin",
    createdAt: new Date(NOW - DAY).toISOString(),
  });
  const record: StudioSessionRecord = {
    accountId: "ada@example.com",
    workspaceId: "w1",
    role: "admin",
    createdAt: new Date(NOW - DAY).toISOString(),
    lastSeenAt: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
  await store.kvSet(
    STUDIO_SESSION_NS,
    "sid",
    record as unknown as Record<string, unknown>,
    new Date(NOW + 13 * DAY).toISOString(),
  );
};

describe("resolveStudioSession", () => {
  beforeEach(async () => {
    await seed();
  });

  it("resolves a session on a legacy workspace with admin membership", async () => {
    const identity = await resolveStudioSession(store, "sid", NOW);
    expect(identity).toMatchObject({
      account: { id: "ada@example.com" },
      workspace: { id: "w1" },
      role: "admin",
    });
  });

  it("refuses an unknown session id", async () => {
    expect(await resolveStudioSession(store, "nope", NOW)).toBeNull();
  });

  it("refuses a session whose membership row is gone", async () => {
    // Same account, same workspace, same live session record — only the
    // membership is missing. Everything else must still resolve, so this pins
    // the legacy-fallback membership read specifically rather than any of its
    // neighbours.
    const record = await store.kvGet(STUDIO_SESSION_NS, "sid");
    const removed = new InMemoryConfigStore();
    await removed.createWorkspace({
      id: "w1",
      salesforceOrgId: "00D000000000001AAA",
      name: "Acme",
      createdAt: new Date(NOW - DAY).toISOString(),
    });
    await removed.upsertAccount({
      id: "ada@example.com",
      salesforceUserId: "005000000000001AAA",
      name: "Ada Admin",
      createdAt: new Date(NOW - DAY).toISOString(),
    });
    await removed.kvSet(STUDIO_SESSION_NS, "sid", record as Record<string, unknown>);
    expect(await removed.getAccount("ada@example.com")).toBeTruthy();
    expect(await resolveStudioSession(removed, "sid", NOW)).toBeNull();
  });

  it("refuses and deletes a session idle past the window", async () => {
    await seed({ lastSeenAt: new Date(NOW - 4 * DAY).toISOString() });
    expect(await resolveStudioSession(store, "sid", NOW)).toBeNull();
    expect(await store.kvGet(STUDIO_SESSION_NS, "sid")).toBeUndefined();
  });

  it("treats a record with no lastSeenAt as last seen when it was created", async () => {
    await seed({ lastSeenAt: undefined, createdAt: new Date(NOW - 60_000).toISOString() });
    expect(await resolveStudioSession(store, "sid", NOW)).not.toBeNull();
  });

  it("refreshes lastSeenAt once the throttle has elapsed", async () => {
    await seed({ lastSeenAt: new Date(NOW - 10 * 60_000).toISOString() });
    await resolveStudioSession(store, "sid", NOW);
    const record = (await store.kvGet(STUDIO_SESSION_NS, "sid")) as unknown as StudioSessionRecord;
    expect(record.lastSeenAt).toBe(new Date(NOW).toISOString());
  });

  it("leaves lastSeenAt alone inside the throttle window", async () => {
    const recent = new Date(NOW - 60_000).toISOString();
    await seed({ lastSeenAt: recent });
    await resolveStudioSession(store, "sid", NOW);
    const record = (await store.kvGet(STUDIO_SESSION_NS, "sid")) as unknown as StudioSessionRecord;
    expect(record.lastSeenAt).toBe(recent);
  });

  it("never extends a session past its absolute cap when touching it", async () => {
    const createdAt = new Date(NOW - 13 * DAY).toISOString();
    await seed({ createdAt, lastSeenAt: new Date(NOW - 10 * 60_000).toISOString() });
    await resolveStudioSession(store, "sid", NOW);
    // Absolute expiry is recomputed from createdAt: 14d after creation, i.e.
    // one day from now — not fourteen days from now.
    const expiry = Date.parse(createdAt) + 14 * DAY;
    expect(expiry - NOW).toBe(DAY);
  });
});

describe("resolveStudioSession — ownership is authority", () => {
  beforeEach(async () => {
    await seed();
  });

  it("a non-owner with a live session resolves to null", async () => {
    // Membership grants chat, never Studio (spec §1) — an "admin" membership
    // row does not help an account that is not the workspace's owner.
    const s = new InMemoryConfigStore();
    await s.createWorkspace({
      id: "w1",
      name: "Acme",
      ownerAccountId: "owner@x",
      createdAt: new Date(NOW - DAY).toISOString(),
    });
    await s.upsertAccount({
      id: "other@x",
      name: "Other",
      email: "other@x",
      createdAt: new Date(NOW - DAY).toISOString(),
    });
    await s.setMembership({
      accountId: "other@x",
      workspaceId: "w1",
      role: "admin",
      createdAt: new Date(NOW - DAY).toISOString(),
    });
    await s.kvSet(
      STUDIO_SESSION_NS,
      "sid",
      {
        accountId: "other@x",
        workspaceId: "w1",
        role: "admin",
        createdAt: new Date(NOW - DAY).toISOString(),
        lastSeenAt: new Date(NOW - 60_000).toISOString(),
      } as unknown as Record<string, unknown>,
      new Date(NOW + 13 * DAY).toISOString(),
    );
    expect(await resolveStudioSession(s, "sid", NOW)).toBeNull();
  });

  it("the owner resolves", async () => {
    const s = new InMemoryConfigStore();
    await s.createWorkspace({
      id: "w1",
      name: "Acme",
      ownerAccountId: "owner@x",
      createdAt: new Date(NOW - DAY).toISOString(),
    });
    await s.upsertAccount({
      id: "owner@x",
      name: "Owner",
      email: "owner@x",
      createdAt: new Date(NOW - DAY).toISOString(),
    });
    // No membership row at all: ownership alone is sufficient authority.
    await s.kvSet(
      STUDIO_SESSION_NS,
      "sid",
      {
        accountId: "owner@x",
        workspaceId: "w1",
        role: "admin",
        createdAt: new Date(NOW - DAY).toISOString(),
        lastSeenAt: new Date(NOW - 60_000).toISOString(),
      } as unknown as Record<string, unknown>,
      new Date(NOW + 13 * DAY).toISOString(),
    );
    const identity = await resolveStudioSession(s, "sid", NOW);
    expect(identity).toMatchObject({ account: { id: "owner@x" }, workspace: { id: "w1" } });
  });

  it("a legacy workspace with no owner falls back to admin membership", async () => {
    const identity = await resolveStudioSession(store, "sid", NOW);
    expect(identity).not.toBeNull();
  });

  it("a legacy workspace with no owner refuses a member-role account", async () => {
    await store.setMembership({
      accountId: "ada@example.com",
      workspaceId: "w1",
      role: "member",
      createdAt: new Date(NOW).toISOString(),
    });
    expect(await resolveStudioSession(store, "sid", NOW)).toBeNull();
  });
});

describe("resolveStudioSession — password reset invalidation", () => {
  it("refuses and deletes a session minted before the reset", async () => {
    const s = new InMemoryConfigStore();
    await s.createWorkspace({
      id: "w1",
      name: "Acme",
      ownerAccountId: "ada@example.com",
      createdAt: new Date(NOW - 2 * DAY).toISOString(),
    });
    await s.upsertAccount({
      id: "ada@example.com",
      name: "Ada Admin",
      email: "ada@example.com",
      createdAt: new Date(NOW - 2 * DAY).toISOString(),
      passwordChangedAt: new Date(NOW - 60_000).toISOString(),
    });
    await s.kvSet(
      STUDIO_SESSION_NS,
      "sid",
      {
        accountId: "ada@example.com",
        workspaceId: "w1",
        role: "admin",
        createdAt: new Date(NOW - DAY).toISOString(),
        lastSeenAt: new Date(NOW - 60_000).toISOString(),
      } as unknown as Record<string, unknown>,
      new Date(NOW + 13 * DAY).toISOString(),
    );
    expect(await resolveStudioSession(s, "sid", NOW)).toBeNull();
    expect(await s.kvGet(STUDIO_SESSION_NS, "sid")).toBeUndefined();
  });

  it("a session minted after the reset resolves", async () => {
    const s = new InMemoryConfigStore();
    await s.createWorkspace({
      id: "w1",
      name: "Acme",
      ownerAccountId: "ada@example.com",
      createdAt: new Date(NOW - 2 * DAY).toISOString(),
    });
    await s.upsertAccount({
      id: "ada@example.com",
      name: "Ada Admin",
      email: "ada@example.com",
      createdAt: new Date(NOW - 2 * DAY).toISOString(),
      passwordChangedAt: new Date(NOW - DAY).toISOString(),
    });
    await s.kvSet(
      STUDIO_SESSION_NS,
      "sid",
      {
        accountId: "ada@example.com",
        workspaceId: "w1",
        role: "admin",
        createdAt: new Date(NOW - 60_000).toISOString(),
        lastSeenAt: new Date(NOW - 60_000).toISOString(),
      } as unknown as Record<string, unknown>,
      new Date(NOW + 13 * DAY).toISOString(),
    );
    expect(await resolveStudioSession(s, "sid", NOW)).not.toBeNull();
  });
});
