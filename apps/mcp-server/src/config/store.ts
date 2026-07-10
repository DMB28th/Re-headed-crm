import type { LayoutConfig } from "@cardstack/core";
import { DEMO_TENANT_ID, demoDealsLayout } from "./demo-tenant.js";

/**
 * Layout config resolution. Keyed on (tenant, object, audience) from day one —
 * v1 only ever resolves the "default" audience, but the key shape is the
 * schema-prep for role-based layouts (PLAN.md V1).
 */
export interface ConfigStore {
  getLayout(
    tenantId: string,
    object: string,
    audience?: string,
  ): Promise<LayoutConfig | undefined>;
  listConfiguredObjects(tenantId: string): Promise<string[]>;
}

export class InMemoryConfigStore implements ConfigStore {
  private configs = new Map<string, LayoutConfig>();

  constructor(configs: LayoutConfig[] = [demoDealsLayout]) {
    for (const config of configs) this.set(config);
  }

  set(config: LayoutConfig): void {
    this.configs.set(this.key(config.tenantId, config.object, config.audience), config);
  }

  async getLayout(
    tenantId: string,
    object: string,
    audience = "default",
  ): Promise<LayoutConfig | undefined> {
    return (
      this.configs.get(this.key(tenantId, object, audience)) ??
      this.configs.get(this.key(tenantId, object, "default"))
    );
  }

  async listConfiguredObjects(tenantId: string): Promise<string[]> {
    const objects = new Set<string>();
    for (const config of this.configs.values()) {
      if (config.tenantId === tenantId) objects.add(config.object);
    }
    return [...objects];
  }

  private key(tenantId: string, object: string, audience: string): string {
    return `${tenantId}::${object}::${audience}`;
  }
}

export { DEMO_TENANT_ID, demoDealsLayout };
