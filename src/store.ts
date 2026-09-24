import type {
  PluginContext,
  PluginEngineInfo,
  PluginEngineModel,
  PluginModelCatalogResult,
  PluginModelSource,
  PluginModelSourceKind,
  WindowBounds,
} from "./ccgui-plugin";

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
  currentBounds: WindowBounds | null;
  expectedBounds: WindowBounds | null;
  autoRestore: boolean;
  groups: CatalogEngineGroup[];
  catalogErrors: string[];
  lastError: string | null;
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

/** 仅接受宿主最终契约 DTO：result.engines[].sources[].models。 */
export function normalizeCatalog(result: PluginModelCatalogResult): CatalogEngineGroup[] {
  if (!result || !Array.isArray(result.engines) || !Array.isArray(result.errors)) {
    throw new Error("宿主模型目录 DTO 不符合契约");
  }
  return result.engines.map((entry) => ({
    engine: entry.engine,
    sources: (entry.sources ?? []).map((source) => normalizeSource(entry.engine.id, source)),
  }));
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

function formatErrors(result: PluginModelCatalogResult): string[] {
  return result.errors.map((error) => `${error.engine}${error.sourceId ? `/${error.sourceId}` : ""}: ${error.message}`);
}

export class AssistantStore {
  private state: AssistantState = { loaded: false, busy: false, currentBounds: null, expectedBounds: null, autoRestore: false, groups: [], catalogErrors: [], lastError: null };
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  constructor(private readonly ctx: PluginContext) {}
  readonly subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  readonly getSnapshot = (): AssistantState => this.state;
  private set(patch: Partial<AssistantState>): void { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }

  async init(): Promise<void> {
    try {
      const [settings, snapshot] = await Promise.all([this.ctx.storage.get<PersistedSettings>(SETTINGS_KEY), this.ctx.window.getState()]);
      const expected = validBounds(settings?.expectedBounds) ? settings.expectedBounds : suggestedBounds(snapshot.bounds);
      const autoRestore = settings?.autoRestore === true;
      this.set({ currentBounds: snapshot.bounds, expectedBounds: expected, autoRestore });
      if (autoRestore) {
        const restored = await this.ctx.window.setNormalBounds(expected);
        this.set({ currentBounds: restored.bounds });
      }
    } catch (error) { this.set({ lastError: asMessage(error) }); }
    await this.refreshModels(false);
    this.set({ loaded: true });
  }

  async sampleWechat(): Promise<void> {
    try {
      const sampled = await this.ctx.window.sampleWechat();
      this.set({ expectedBounds: sampled.bounds, lastError: null });
    } catch (error) {
      // 微信未运行或采样失败：原样透传宿主 Unsupported/NotFound 错误。
      this.set({ lastError: asMessage(error) });
    }
  }

  async applyExpected(): Promise<void> {
    if (!this.state.expectedBounds) return;
    try {
      const snapshot = await this.ctx.window.setNormalBounds(this.state.expectedBounds);
      this.set({ currentBounds: snapshot.bounds, lastError: null });
    } catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  async saveCurrentAsExpected(): Promise<void> {
    try {
      const snapshot = await this.ctx.window.getState();
      await this.persist({ expectedBounds: snapshot.bounds, autoRestore: this.state.autoRestore });
      this.set({ currentBounds: snapshot.bounds, expectedBounds: snapshot.bounds, lastError: null });
    } catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  async setAutoRestore(autoRestore: boolean): Promise<void> {
    try { await this.persist({ expectedBounds: this.state.expectedBounds, autoRestore }); this.set({ autoRestore, lastError: null }); }
    catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  /** 恢复建议尺寸：保留当前 x/y，应用 980x720，并关闭 autoRestore、清除插件设置。 */
  async reset(): Promise<void> {
    try {
      const snapshot = await this.ctx.window.getState();
      const expectedBounds = suggestedBounds(snapshot.bounds);
      const applied = await this.ctx.window.setNormalBounds(expectedBounds);
      await this.ctx.storage.delete(SETTINGS_KEY);
      this.set({ currentBounds: applied.bounds, expectedBounds, autoRestore: false, lastError: null });
    } catch (error) { this.set({ lastError: asMessage(error) }); }
  }

  async refreshModels(userRequested: boolean): Promise<void> {
    this.set({ busy: true, catalogErrors: [] });
    let cached: CatalogEngineGroup[] = [];
    try { cached = sanitizeCache(await this.ctx.storage.get<unknown>(CATALOG_CACHE_KEY)); }
    catch (error) { this.set({ catalogErrors: [`缓存读取失败：${asMessage(error)}`] }); }
    try {
      const result = await this.ctx.models.catalog({ refreshProviders: userRequested });
      const groups = normalizeCatalog(result);
      const errors = formatErrors(result);
      if (groups.some((group) => group.sources.length > 0)) {
        await this.ctx.storage.set(CATALOG_CACHE_KEY, cacheRows(groups));
      }
      // 实时目录成功时只展示实时结果；缓存副本不得覆盖或混入。
      this.set({ groups, catalogErrors: errors, lastError: null, busy: false });
    } catch (error) {
      const message = asMessage(error);
      // 实时失败：保留缓存目录并透明显示宿主错误。
      this.set({ groups: cached, catalogErrors: [`宿主模型目录失败，已展示缓存副本：${message}`], lastError: message, busy: false });
    }
  }

  dispose(): void { this.disposed = true; this.listeners.clear(); }
  private persist(settings: PersistedSettings): Promise<void> { return this.ctx.storage.set(SETTINGS_KEY, settings); }
}
