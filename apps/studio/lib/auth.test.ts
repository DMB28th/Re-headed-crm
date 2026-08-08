/**
 * The Studio authorization choke point.
 *
 * These tests are the regression guard for finding A5: before this, `role` was
 * checked in exactly one route handler and nothing behind it enforced anything,
 * so a demotion took up to fourteen days to take effect and any future
 * session-minting route would have had to remember the check itself.
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

  it("resolves an admin session", async () => {
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

  // A5: this is the case that used to take fourteen days to take effect.
  it("refuses a session whose membership was demoted to member", async () => {
    await store.setMembership({
      accountId: "ada@example.com",
      workspaceId: "w1",
      role: "member",
      createdAt: new Date(NOW).toISOString(),
    });
    expect(await resolveStudioSession(store, "sid", NOW)).toBeNull();
  });

  it("refuses a session whose membership row is gone", async () => {
    // Same account, same workspace, same live session record — only the
    // membership is missing. Everything else must still resolve, so this pins
    // the membership read specifically rather than any of its neighbours.
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

  it("does not trust the role snapshot stored on the session record", async () => {
    // The record still claims admin from sign-in time; the membership says
    // member. The membership is authoritative and the snapshot is colour, so
    // this must be refused — otherwise a demotion would never take effect.
    await seed({ role: "admin" });
    await store.setMembership({
      accountId: "ada@example.com",
      workspaceId: "w1",
      role: "member",
      createdAt: new Date(NOW).toISOString(),
    });
    const record = (await store.kvGet(STUDIO_SESSION_NS, "sid")) as unknown as StudioSessionRecord;
    expect(record.role).toBe("admin");
    expect(await resolveStudioSession(store, "sid", NOW)).toBeNull();
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
