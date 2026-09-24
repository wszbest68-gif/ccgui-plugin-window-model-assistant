/** @ccgui/plugin-sdk v0.3.16（宿主 >=1.0.10）：窗口与模型助手使用的安全公共契约快照。 */
export type Disposer = () => void;
export type ComponentLike<P = Record<string, never>> = (props: P) => unknown;

export interface ReactLike {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  useSyncExternalStore<T>(subscribe: (fn: () => void) => Disposer, getSnapshot: () => T): T;
}

export interface WindowBounds { x: number; y: number; width: number; height: number }

/** 物理像素；宿主只操作 main 窗口，仅 normal 可设置。 */
export interface PluginWindowSnapshot {
  bounds: WindowBounds;
  state: "normal" | "minimized" | "maximized" | "fullscreen";
  scaleFactor: number;
}
export interface PluginWechatWindow { bounds: WindowBounds; executable: string }

export interface PluginEngineModel {
  id: string;
  name?: string | null;
  description?: string | null;
  provider: string;
  contextWindow?: number | null;
}
export type PluginModelSourceKind = "cli" | "official" | "provider" | "custom" | "configured" | "builtin";
export interface PluginModelSource {
  id: string;
  name: string;
  kind: PluginModelSourceKind;
  authoritative: boolean;
  remote: boolean;
  models: PluginEngineModel[];
  refreshedAt: number;
  detail?: string;
}
export interface PluginEngineInfo {
  id: string;
  available: boolean;
  enabled: boolean;
  supportsImages: boolean;
  supportsComputerUse: boolean;
  supportsEffort: boolean;
  supportsToolConstraints: boolean;
  permissions: string[];
}
export interface PluginModelCatalogEngine { engine: PluginEngineInfo; sources: PluginModelSource[] }
export interface PluginModelCatalogError { engine: string; sourceId?: string; message: string }
export interface PluginModelCatalogResult {
  engines: PluginModelCatalogEngine[];
  errors: PluginModelCatalogError[];
  refreshedAt: number;
}

export interface PluginContext {
  pluginId: string;
  react: ReactLike;
  host: { locale: string; appVersion: string; sdkVersion: string; isWeb: boolean };
  storage: { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void> };
  window: {
    getState(): Promise<PluginWindowSnapshot>;
    setNormalBounds(bounds: WindowBounds): Promise<PluginWindowSnapshot>;
    sampleWechat(): Promise<PluginWechatWindow>;
  };
  models: {
    catalog(options?: { workspace?: string; refreshProviders?: boolean }): Promise<PluginModelCatalogResult>;
  };
  ui: {
    registerPanelTab(def: { key?: string; label: () => string; component: ComponentLike; order?: number }): Disposer;
    registerSettingsSection(def: { key?: string; label: () => string; component: ComponentLike }): Disposer;
    registerStatusBarItem(def: { key?: string; component: ComponentLike; order?: number; zone?: "start" | "end" }): Disposer;
    registerCommand(def: { key: string; title: () => string; keywords?: () => string[]; run: () => void }): Disposer;
    openSettings(key?: string): void;
  };
  i18n: { addBundle(lang: string, ns: string, resources: Record<string, unknown>): Disposer };
}

export type PluginActivate = (ctx: PluginContext) => void | Disposer;
