import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { BaseConfigStore, seededState, type StoreState } from "./memory-store.js";
import { openConnection, openKvValue, sealConnection, sealKvValue } from "./crypto.js";

/**
 * Seal/open the secret-bearing records in a whole StoreState. Only what hits
 * disk is encrypted; the in-memory StoreState the base store operates on stays
 * plaintext. Never mutates the input — connections/userConnections are remapped
 * into fresh objects.
 */
type SecretBearing = { credentials?: Record<string, string>; pendingAuth?: Record<string, string> };

function mapConnections(state: StoreState, fn: <T extends SecretBearing>(v: T) => T): StoreState {
  const remap = <V extends SecretBearing>(record: Record<string, V>): Record<string, V> =>
    Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
  return {
    ...state,
    ...(state.connections ? { connections: remap(state.connections) } : {}),
    ...(state.userConnections ? { userConnections: remap(state.userConnections) } : {}),
  };
}

/** KV values carry MCP OAuth bearer secrets — sealed on write, opened on load. */
function mapKv(
  state: StoreState,
  fn: (value: Record<string, unknown>) => Record<string, unknown>,
): StoreState {
  if (!state.kv) return state;
  return {
    ...state,
    kv: Object.fromEntries(
      Object.entries(state.kv).map(([k, entry]) => [k, { ...entry, value: fn(entry.value) }]),
    ),
  };
}

/**
 * JSON-file-backed store shared by Studio (writes) and the MCP server (reads).
 * Loaded fresh on EVERY call — render-time freshness is the whole point of
 * Golden Path 3 (publish in Studio → next render uses the new layout, no
 * restart). Swapping this for Postgres is an implementation of the same
 * AdminConfigStore interface (deliberately deferred; see PLAN.md hosting).
 */
export class FileConfigStore extends BaseConfigStore {
  constructor(private readonly filePath: string) {
    super();
    mkdirSync(path.dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) {
      this.writeAtomic(seededState());
    }
  }

  protected async load(): Promise<StoreState> {
    const raw = JSON.parse(readFileSync(this.filePath, "utf-8")) as StoreState;
    return mapKv(mapConnections(raw, openConnection), openKvValue);
  }

  protected async save(state: StoreState): Promise<void> {
    this.writeAtomic(state);
  }

  private writeAtomic(state: StoreState): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify(mapKv(mapConnections(state, sealConnection), sealKvValue), null, 2),
    );
    renameSync(tmp, this.filePath);
  }
}

export function defaultConfigPath(): string {
  return (
    process.env.CARDSTACK_CONFIG_PATH ??
    path.join(process.cwd(), "..", "..", "data", "cardstack-config.json")
  );
}
