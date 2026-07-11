import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { BaseConfigStore, seededState, type StoreState } from "./memory-store.js";

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
    return JSON.parse(readFileSync(this.filePath, "utf-8")) as StoreState;
  }

  protected async save(state: StoreState): Promise<void> {
    this.writeAtomic(state);
  }

  private writeAtomic(state: StoreState): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, this.filePath);
  }
}

export function defaultConfigPath(): string {
  return (
    process.env.CARDSTACK_CONFIG_PATH ??
    path.join(process.cwd(), "..", "..", "data", "cardstack-config.json")
  );
}
