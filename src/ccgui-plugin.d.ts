/** @ccgui/plugin-sdk v0.3.16：窗口与模型助手使用的安全公共契约快照。 */
export type Disposer = () => void;
export type ComponentLike<P = Record<string, never>> = (props: P) => unknown;

export interface ReactLike {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  useSyncExternalStore<T>(subscribe: (fn: () => void) => Disposer, getSnapshot: () => T): T;
}

export interface WindowBounds { x: number; y: number; width: number; height: number }
export interface WindowStateSnapshot { bounds: WindowBounds; state: string; scaleFactor: number }
export interface WechatSample { bounds: WindowBounds; executable: string }

export type ModelSourceKind = "catalog" | "cache" | string;
export interface CatalogModel { id: string; name?: string; capabilities?: string[] }
export interface ModelProviderCatalog {
  id: string;
  name: string;
  engine: string;
  source: ModelSourceKind;
  authoritative: boolean;
  refreshedAt: number;
  models: CatalogModel[];
  detail?: string;
}
export interface HostCatalogEntry {
  engine: string;
  catalog: unknown;
  error?: string;
}
export interface PluginCatalogResult {
  entries: HostCatalogEntry[];
  refreshedAt: number;
}

export interface PluginContext {
  pluginId: string;
  react: ReactLike;
  host: { locale: string; appVersion: string; sdkVersion: string; isWeb: boolean };
  storage: { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void> };
  window: {
    getState(): Promise<WindowStateSnapshot>;
    setNormalBounds(bounds: WindowBounds): Promise<WindowStateSnapshot>;
    sampleWechat(): Promise<WechatSample>;
  };
  models: {
    catalog(workspace?: string): Promise<HostCatalogEntry[]>;
    refreshProviderModels(engine: string, providerId: string): Promise<{ models: string[] }>;
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
