/** 预期 @ccgui/plugin-sdk v0.3.16 公共契约子集；宿主合并后应改为包导入。 */
export type Disposer = () => void;
export type ComponentLike<P = Record<string, never>> = (props: P) => unknown;

export interface ReactLike {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  useSyncExternalStore<T>(subscribe: (fn: () => void) => Disposer, getSnapshot: () => T): T;
}

export interface WindowBounds { x: number; y: number; width: number; height: number }
export interface DisplayArea { x: number; y: number; width: number; height: number }
export type ModelCatalogSource = "authoritative" | "cache" | "engine-builtin";
export interface CatalogModel { id: string; name?: string; capabilities?: string[] }
export interface ModelProviderCatalog {
  id: string;
  name: string;
  engine: string;
  source: ModelCatalogSource;
  authoritative: boolean;
  refreshedAt: number;
  models: CatalogModel[];
  detail?: string;
}
export interface ModelCatalogResult {
  providers: ModelProviderCatalog[];
  errors?: Array<{ providerId?: string; message: string }>;
}

export interface PluginContext {
  pluginId: string;
  react: ReactLike;
  host: { locale: string; appVersion: string; sdkVersion: string; isWeb: boolean };
  storage: {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  window: {
    getMainBounds(): Promise<WindowBounds>;
    setMainBounds(bounds: WindowBounds): Promise<void>;
    getAvailableArea(): Promise<DisplayArea>;
    sampleExternalWindow(query: { app: "wechat" }): Promise<WindowBounds | null>;
    resetMainBounds(): Promise<void>;
  };
  models: {
    listCatalog(options?: { refresh?: boolean }): Promise<ModelCatalogResult>;
    onDidChange(cb: () => void): Disposer;
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
