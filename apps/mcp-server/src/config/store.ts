/**
 * Config storage moved to @cardstack/config-store (shared with Studio).
 * Re-exported here so server code keeps one import path.
 */
export {
  DEMO_TENANT_ID,
  demoDealsLayout,
  demoViewExposures,
  FileConfigStore,
  defaultConfigPath,
  InMemoryConfigStore,
  type AdminConfigStore,
  type ConfigStore,
} from "@cardstack/config-store";
