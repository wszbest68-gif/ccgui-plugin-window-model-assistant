/** @ccgui/plugin-sdk 契约快照（官方 SDK ≥0.3.14）：窗口与模型助手使用的公共契约。
 *
 * 能力分层：
 * - `agent.catalog`：官方已发布能力（权限 `agent`，SDK 0.3.14 起），引擎与模型目录的降级来源。
 * - `window` / `models`：候选能力（随宿主新版窗口/完整目录 API 提供）。官方宿主未发布时
 *   为 undefined——插件必须能力探测后优雅降级，不得假设其存在。
 */
export type Disposer = () => void;
export type ComponentLike<P = Record<string, never>> = (props: P) => unknown;

export interface ReactLike {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
  useSyncExternalStore<T>(subscribe: (fn: () => void) => Disposer, getSnapshot: () => T): T;
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void];
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

/** 官方 agent 能力目录条目（SDK 0.3.14）：引擎可用性 + 渠道与模型的 ID/显示名；
 *  不含配置、认证或环境变量；禁用的引擎不出现在列表中。 */
export interface PluginAgentCatalogEntry {
  engine: string;
  label: string;
  available: boolean;
  readOnly: boolean;
  providers: { id: string; label: string }[];
  models: { id: string; label: string }[];
}

export interface PluginContext {
  pluginId: string;
  react: ReactLike;
  host: { locale: string; appVersion: string; sdkVersion: string; isWeb: boolean };
  storage: { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void> };
  /** 官方窗口能力（权限 host:window，SDK 0.3.19 起）；保留可选形状做防御性降级。 */
  window?: {
    getState(): Promise<PluginWindowSnapshot>;
    setNormalBounds(bounds: WindowBounds): Promise<PluginWindowSnapshot>;
    sampleWechat(): Promise<PluginWechatWindow>;
  };
  /** 官方能力（权限 agent，SDK 0.3.14 起）。旧宿主可能不存在，调用前探测。 */
  agent?: {
    catalog(workspacePath: string): Promise<PluginAgentCatalogEntry[]>;
  };
  ui: {
    registerPanelTab(def: { key?: string; label: () => string; component: ComponentLike<{ workspacePath?: string }>; order?: number }): Disposer;
    registerSettingsSection(def: { key?: string; label: () => string; component: ComponentLike }): Disposer;
    registerStatusBarItem(def: { key?: string; component: ComponentLike; order?: number; zone?: "start" | "end" }): Disposer;
    registerCommand(def: { key: string; title: () => string; keywords?: () => string[]; run: () => void }): Disposer;
    openSettings(key?: string): void;
  };
  i18n: { addBundle(lang: string, ns: string, resources: Record<string, unknown>): Disposer };
}

export type PluginActivate = (ctx: PluginContext) => void | Disposer;
