import type { LayoutConfig, ViewExposure, ViewExposuresConfig } from "@cardstack/core";
import { DEMO_TENANT_ID, demoDealsLayout, demoViewExposures } from "./demo-tenant.js";

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
  /** Exposed saved-view config for an object (design 5a). Unexposed views are omitted. */
  getViewExposures(tenantId: string, object: string): Promise<ViewExposure[]>;
}

export class InMemoryConfigStore implements ConfigStore {
  private configs = new Map<string, LayoutConfig>();
  private exposures = new Map<string, ViewExposuresConfig>();

  constructor(
    configs: LayoutConfig[] = [demoDealsLayout],
    exposures: ViewExposuresConfig[] = [demoViewExposures],
  ) {
    for (const config of configs) this.set(config);
    for (const exposure of exposures) {
      this.exposures.set(`${exposure.tenantId}::${exposure.object}`, exposure);
    }
  }

  async getViewExposures(tenantId: string, object: string): Promise<ViewExposure[]> {
    const config = this.exposures.get(`${tenantId}::${object}`);
    return (config?.views ?? []).filter((v) => v.exposed);
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
