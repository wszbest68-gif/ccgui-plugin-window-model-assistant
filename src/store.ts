import type {
  CatalogSourceSummary,
  ModelProviderCatalog,
  PluginContext,
  PluginModelCatalogResult,
  WindowBounds,
} from "./ccgui-plugin";

export interface AssistantState {
  loaded: boolean;
  busy: boolean;
  currentBounds: WindowBounds | null;
  expectedBounds: WindowBounds | null;
  autoRestore: boolean;
  providers: ModelProviderCatalog[];
  catalogErrors: string[];
  lastError: string | null;
}

interface PersistedSettings { expectedBounds: WindowBounds | null; autoRestore: boolean }
const SETTINGS_KEY = "settings";
const CATALOG_CACHE_KEY = "modelCatalogCache";
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
function asModels(value: unknown): Array<{ id: string; name?: string; capabilities?: string[] }> {
  const source = Array.isArray(value) ? value : (value && typeof value === "object" ? (value as { models?: unknown; items?: unknown }).models ?? (value as { items?: unknown }).items : undefined);
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ id: item }];
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; name?: unknown; capabilities?: unknown };
    if (typeof row.id !== "string" || !row.id) return [];
    return [{ id: row.id, ...(typeof row.name === "string" ? { name: row.name } : {}), ...(Array.isArray(row.capabilities) ? { capabilities: row.capabilities.filter((x): x is string => typeof x === "string") } : {}) }];
  });
}

/** 将宿主安全 catalog DTO 转换为仅含展示字段的来源行；不推断鉴权或在线状态。 */
export function normalizeCatalog(result: PluginModelCatalogResult): ModelProviderCatalog[] {
  const rows: ModelProviderCatalog[] = [];
  for (const entry of result.engines) {
    const raw = entry.catalog as { models?: unknown; sources?: unknown } | null;
    const models = asModels(raw?.models ?? entry.catalog);
    const source = result.sources.find((item: CatalogSourceSummary) => item.engine === entry.engine);
    rows.push({
      id: source?.providerId ?? `${entry.engine}:engine`,
      name: source?.label ?? entry.engine,
      engine: entry.engine,
      source: source?.kind ?? "engine",
      authoritative: source?.kind !== "cache",
      refreshedAt: source?.refreshed ?? result.refreshedAt,
      models,
      modelCount: source?.modelCount ?? models.length,
    });
  }
  return rows;
}

/** 合并宿主目录与缓存；缓存永远为非 authoritative，来源类型为 cache。 */
export function mergeCatalogs(current: ModelProviderCatalog[], cached: ModelProviderCatalog[]): ModelProviderCatalog[] {
  const map = new Map<string, ModelProviderCatalog>();
  for (const provider of [...current, ...cached]) {
    const key = `${provider.engine}:${provider.id}`;
    const previous = map.get(key);
    if (!previous || (provider.source !== "cache" && previous.source === "cache")) map.set(key, { ...provider, models: [...provider.models] });
    else if (provider.source === "cache" && previous.source !== "cache") continue;
    else {
      const models = new Map(previous.models.map((model) => [model.id, model]));
      for (const model of provider.models) models.set(model.id, model);
      map.set(key, { ...previous, models: [...models.values()] });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function cacheRows(providers: ModelProviderCatalog[]): ModelProviderCatalog[] {
  return providers.map((provider) => ({ ...provider, source: "cache", authoritative: false, detail: provider.detail ?? "来源目录缓存副本" }));
}

export class AssistantStore {
  private state: AssistantState = { loaded: false, busy: false, currentBounds: null, expectedBounds: null, autoRestore: false, providers: [], catalogErrors: [], lastError: null };
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private latestEntries: PluginModelCatalogResult | null = null;
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
    } catch (error) { this.set({ lastError: asMessage(error) }); }
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
    let cached: ModelProviderCatalog[] = [];
    try { cached = (await this.ctx.storage.get<ModelProviderCatalog[]>(CATALOG_CACHE_KEY)) ?? []; }
    catch (error) { this.set({ catalogErrors: [`缓存读取失败：${asMessage(error)}`] }); }
    try {
      const result = await this.ctx.models.catalog({ refreshProviders: userRequested });
      this.latestEntries = result;
      const providers = normalizeCatalog(result);
      const errors = result.errors.map((error) => `${error.engine}${error.providerId ? `/${error.providerId}` : ""}: ${error.message}`);
      const visible = mergeCatalogs(providers, cached);
      if (providers.length > 0) await this.ctx.storage.set(CATALOG_CACHE_KEY, cacheRows(providers));
      this.set({ providers: visible, catalogErrors: errors, lastError: null, busy: false });
    } catch (error) {
      const message = asMessage(error);
      this.set({ providers: mergeCatalogs([], cached), catalogErrors: [`宿主模型目录失败，已降级到缓存：${message}`], lastError: message, busy: false });
    }
  }

  dispose(): void { this.disposed = true; this.listeners.clear(); }
  private persist(settings: PersistedSettings): Promise<void> { return this.ctx.storage.set(SETTINGS_KEY, settings); }
}
