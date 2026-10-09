import type {
  PluginAgentCatalogEntry,
  PluginContext,
  PluginEngineInfo,
  PluginEngineModel,
  PluginModelSource,
  PluginModelSourceKind,
  WindowBounds,
} from "./ccgui-plugin";
import type { Copy } from "./i18n";
import { copy as resolveCopy } from "./i18n";

/** 插件展示层来源行：宿主每个 source 一行；内部 kind "cache" 仅标记本地缓存副本，不属于宿主契约。 */
export interface CatalogSourceRow {
  engineId: string;
  id: string;
  name: string;
  kind: PluginModelSourceKind | "cache";
  authoritative: boolean;
  remote: boolean;
  models: PluginEngineModel[];
  refreshedAt: number;
  detail?: string;
}
export interface CatalogEngineGroup {
  engine: PluginEngineInfo;
  sources: CatalogSourceRow[];
}

export interface AssistantState {
  loaded: boolean;
  busy: boolean;
  windowSupported: boolean;
  currentBounds: WindowBounds | null;
  expectedBounds: WindowBounds | null;
  autoRestore: boolean;
  groups: CatalogEngineGroup[];
  catalogErrors: string[];
  lastError: string | null;
  workspace: string;
}

interface PersistedSettings { expectedBounds: WindowBounds | null; autoRestore: boolean }
const SETTINGS_KEY = "settings";
const CATALOG_CACHE_KEY = "modelCatalogCache";
/** 980x720 是建议初始值，并非微信窗口实测。 */
export const WECHAT_LIKE_SIZE = { width: 980, height: 720 };

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
export function validBounds(value: unknown): value is WindowBounds {
  const b = value as Partial<WindowBounds> | null;
  return !!b && finite(b.x) && finite(b.y) && finite(b.width) && finite(b.height) && b.width > 0 && b.height > 0;
}
export function suggestedBounds(current: WindowBounds): WindowBounds {
  return { x: current.x, y: current.y, width: WECHAT_LIKE_SIZE.width, height: WECHAT_LIKE_SIZE.height };
}

function asMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

const SOURCE_KINDS: ReadonlySet<string> = new Set(["cli", "official", "provider", "custom", "configured", "builtin"]);

/** 只保留契约字段，丢弃来源对象上可能出现的任何额外字段（如密钥、URL），防止敏感数据进入展示层与缓存。 */
function pickModel(model: PluginEngineModel): PluginEngineModel {
  return {
    id: model.id,
    ...(model.name != null ? { name: model.name } : {}),
    ...(model.description != null ? { description: model.description } : {}),
    provider: model.provider,
    ...(model.contextWindow != null ? { contextWindow: model.contextWindow } : {}),
  };
}

function normalizeSource(engineId: string, source: PluginModelSource): CatalogSourceRow {
  const seen = new Set<string>();
  const models: PluginEngineModel[] = [];
  for (const model of source.models ?? []) {
    if (!model || typeof model.id !== "string" || !model.id || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(pickModel(model));
  }
  return {
    engineId,
    id: source.id,
    name: source.name,
    kind: SOURCE_KINDS.has(source.kind) ? source.kind : "custom",
    authoritative: source.authoritative === true,
    remote: source.remote === true,
    models,
    refreshedAt: finite(source.refreshedAt) ? source.refreshedAt : 0,
    ...(source.detail ? { detail: source.detail } : {}),
  };
}

/** 缓存副本：kind 强制 cache、authoritative 强制 false；仅供插件本地存储层使用，不回传宿主。 */

/**
 * 官方 agent.catalog（SDK 0.3.14）降级适配：引擎级平铺模型映射为每引擎一个
 * 「宿主引擎目录」来源行；providers 只作 detail 展示（目录不含逐模型渠道归属）。
 * 禁用的引擎官方不返回，故 enabled 恒 true；supports* 等能力位本目录不承诺，置 false。
 */
export function adaptAgentCatalog(list: PluginAgentCatalogEntry[]): CatalogEngineGroup[] {
  const groups: CatalogEngineGroup[] = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry || typeof entry.engine !== "string" || !entry.engine) continue;
    const providerNames = (entry.providers ?? []).map((p) => p.label || p.id).filter(Boolean).join(" / ");
    const seen = new Set<string>();
    const models: PluginEngineModel[] = [];
    for (const m of entry.models ?? []) {
      if (!m || typeof m.id !== "string" || !m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      models.push({ id: m.id, name: m.label || m.id, provider: entry.providers?.[0]?.id || entry.engine });
    }
    groups.push({
      engine: {
        id: entry.engine,
        available: entry.available !== false,
        enabled: true,
        supportsImages: false,
        supportsComputerUse: false,
        supportsEffort: false,
        supportsToolConstraints: false,
        permissions: [],
      },
      sources: models.length
        ? [{
            engineId: entry.engine,
            id: "agent-catalog",
            name: entry.label || entry.engine,
            kind: "builtin",
            authoritative: true,
            remote: false,
            models,
            refreshedAt: Date.now(),
            ...(providerNames ? { detail: `服务商：${providerNames}` } : {}),
          }]
        : [],
    });
  }
  return groups;
}

/** 缓存副本：kind 强制 cache、authoritative 强制 false；仅供插件本地存储层使用，不回传宿主。 */
function cacheRows(groups: CatalogEngineGroup[]): CatalogEngineGroup[] {
  return groups.map((group) => ({
    engine: group.engine,
    sources: group.sources.map((source) => ({
      ...source,
      kind: "cache" as const,
      authoritative: false,
      detail: source.detail ?? "本地缓存副本，可能不是最新目录",
    })),
  }));
}

/** 读取持久化缓存时重新校验并强制 cache 语义，避免旧数据冒充实时来源。 */
function sanitizeCache(raw: unknown): CatalogEngineGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: CatalogEngineGroup[] = [];
  for (const item of raw) {
    const group = item as CatalogEngineGroup | null;
    if (!group || !group.engine || typeof group.engine.id !== "string" || !Array.isArray(group.sources)) continue;
    groups.push({
      engine: group.engine,
      sources: group.sources.flatMap((source) => {
        if (!source || typeof source.id !== "string" || typeof source.name !== "string") return [];
        const row = normalizeSource(group.engine.id, { ...source, kind: "builtin", authoritative: false, remote: false });
        return [{ ...row, kind: "cache" as const, authoritative: false, detail: source.detail ?? "本地缓存副本，可能不是最新目录" }];
      }),
    });
  }
  return groups;
}

export class AssistantStore {
  private state: AssistantState;
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private readonly copy: Copy;
  constructor(private readonly ctx: PluginContext, copy?: Copy) {
    this.copy = copy ?? resolveCopy(ctx.host.locale);
    // 窗口能力已在 SDK 0.3.19 / CC GUI 1.1.2 发布；仍同步探测一次以防异常宿主。
    const windowSupported = !!ctx.window && typeof ctx.window.getState === "function";
    this.state = {
      loaded: false, busy: false, windowSupported,
      currentBounds: null, expectedBounds: null, autoRestore: false,
      groups: [], catalogErrors: [], lastError: null, workspace: "",
    };
  }
  readonly subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  readonly getSnapshot = (): AssistantState => this.state;
  private set(patch: Partial<AssistantState>): void { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }

  setWorkspace(workspace: string): void {
    if (typeof workspace === "string" && workspace && workspace !== this.state.workspace) this.set({ workspace });
  }

  private windowApi() {
    return this.state.windowSupported ? this.ctx.window ?? null : null;
  }

  async init(): Promise<void> {
    const windowApi = this.windowApi();
    if (windowApi) {
      try {
        const [settings, snapshot] = await Promise.all([this.ctx.storage.get<PersistedSettings>(SETTINGS_KEY), windowApi.getState()]);
        const expected = validBounds(settings?.expectedBounds) ? settings.expectedBounds : suggestedBounds(snapshot.bounds);
        const autoRestore = settings?.autoRestore === true;
        this.set({ currentBounds: snapshot.bounds, expectedBounds: expected, autoRestore });
        if (autoRestore) {
          const restored = await windowApi.setNormalBounds(expected);
          this.set({ currentBounds: restored.bounds });
        }
      } catch (error) { this.set({ lastError: asMessage(error) }); }
    }
    await this.refreshModels(false);
    this.set({ loaded: true });
  }

  async sampleWechat(): Promise<void> {
    const windowApi = this.windowApi();
    if (!windowApi) { this.set({ lastError: this.copy.windowUnsupported }); return; }
    try {
      const sampled = await windowApi.sampleWechat();
      this.set({ expectedBounds: sampled.bounds, lastError: null });
    } catch (error) {
      // 微信未运行或采样失败：原样透传宿主 Unsupported/NotFound 错误。
      this.set({ lastError: asMessage(error) });
    }
  }

  async applyExpected(): Promise<void> {
    const windowApi = this.windowApi();
    if (!windowApi) { this.set({ lastError: this.copy.windowUnsupported }); return; }
    if (!this.state.expectedBounds) return;
    try {
      const snapshot = await windowApi.setNormalBounds(this.state.expectedBounds);
      this.set({ currentBounds: snapshot.bounds, lastError: null });
    } catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  async saveCurrentAsExpected(): Promise<void> {
    const windowApi = this.windowApi();
    if (!windowApi) { this.set({ lastError: this.copy.windowUnsupported }); return; }
    try {
      const snapshot = await windowApi.getState();
      await this.persist({ expectedBounds: snapshot.bounds, autoRestore: this.state.autoRestore });
      this.set({ currentBounds: snapshot.bounds, expectedBounds: snapshot.bounds, lastError: null });
    } catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  async setAutoRestore(autoRestore: boolean): Promise<void> {
    if (!this.windowApi()) { this.set({ lastError: this.copy.windowUnsupported }); return; }
    try { await this.persist({ expectedBounds: this.state.expectedBounds, autoRestore }); this.set({ autoRestore, lastError: null }); }
    catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  /** 恢复建议尺寸：保留当前 x/y，应用 980x720，并关闭 autoRestore、清除插件设置。 */
  async reset(): Promise<void> {
    const windowApi = this.windowApi();
    if (!windowApi) { this.set({ lastError: this.copy.windowUnsupported }); return; }
    try {
      const snapshot = await windowApi.getState();
      const expectedBounds = suggestedBounds(snapshot.bounds);
      const applied = await windowApi.setNormalBounds(expectedBounds);
      await this.ctx.storage.delete(SETTINGS_KEY);
      this.set({ currentBounds: applied.bounds, expectedBounds, autoRestore: false, lastError: null });
    } catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  async refreshModels(userRequested: boolean): Promise<void> {
    // userRequested 预留给未来的完整目录 API（refreshProviders 仅该 API 支持）；当前 agent 路径不接受该参数。
    void userRequested;
    this.set({ busy: true, catalogErrors: [] });
    let cached: CatalogEngineGroup[] = [];
    try { cached = sanitizeCache(await this.ctx.storage.get<unknown>(CATALOG_CACHE_KEY)); }
    catch (error) { this.set({ catalogErrors: [`缓存读取失败：${asMessage(error)}`] }); }
    try {
      // 官方 agent 目录（SDK 0.3.14 起，权限 agent）。
      if (this.ctx.agent && typeof this.ctx.agent.catalog === "function") {
        const groups = adaptAgentCatalog(await this.ctx.agent.catalog(this.state.workspace || ""));
        if (groups.some((group) => group.sources.length > 0)) {
          await this.ctx.storage.set(CATALOG_CACHE_KEY, cacheRows(groups));
        }
        this.set({ groups, catalogErrors: [], lastError: null, busy: false });
        return;
      }
      throw new Error("no catalog capability on this host");
    } catch (error) {
      const message = asMessage(error);
      // 实时失败：保留缓存目录并透明显示宿主错误。
      this.set({ groups: cached, catalogErrors: [`宿主模型目录失败，已展示缓存副本：${message}`], lastError: message, busy: false });
    }
  }

  dispose(): void { this.disposed = true; this.listeners.clear(); }
  private persist(settings: PersistedSettings): Promise<void> { return this.ctx.storage.set(SETTINGS_KEY, settings); }
}
