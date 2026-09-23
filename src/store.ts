import type {
  DisplayArea,
  ModelCatalogResult,
  ModelProviderCatalog,
  PluginContext,
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

interface PersistedSettings {
  expectedBounds: WindowBounds | null;
  autoRestore: boolean;
}

const SETTINGS_KEY = "settings";
const CATALOG_CACHE_KEY = "modelCatalogCache";
export const WECHAT_LIKE_SIZE = { width: 980, height: 720 };

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validBounds(value: unknown): value is WindowBounds {
  const b = value as Partial<WindowBounds> | null;
  return !!b && finite(b.x) && finite(b.y) && finite(b.width) && finite(b.height) && b.width > 0 && b.height > 0;
}

export function clampBounds(bounds: WindowBounds, area: DisplayArea): WindowBounds {
  const minWidth = Math.min(480, area.width);
  const minHeight = Math.min(360, area.height);
  const width = Math.min(Math.max(bounds.width, minWidth), area.width);
  const height = Math.min(Math.max(bounds.height, minHeight), area.height);
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
  };
}

export function suggestedBounds(area: DisplayArea): WindowBounds {
  const width = Math.min(WECHAT_LIKE_SIZE.width, area.width);
  const height = Math.min(WECHAT_LIKE_SIZE.height, area.height);
  return clampBounds({
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
  }, area);
}

const SOURCE_RANK = { authoritative: 3, cache: 2, "engine-builtin": 1 } as const;

/** 合并宿主实时、缓存、引擎内置目录；同服务商/模型优先保留权威来源。 */
export function mergeCatalogs(...groups: ModelProviderCatalog[][]): ModelProviderCatalog[] {
  const providerMap = new Map<string, ModelProviderCatalog>();
  for (const provider of groups.flat()) {
    const key = `${provider.engine}:${provider.id}`;
    const previous = providerMap.get(key);
    if (!previous) {
      providerMap.set(key, { ...provider, models: [...provider.models] });
      continue;
    }
    const primary = SOURCE_RANK[provider.source] > SOURCE_RANK[previous.source] ? provider : previous;
    const secondary = primary === provider ? previous : provider;
    const models = new Map(secondary.models.map((model) => [model.id, model]));
    for (const model of primary.models) models.set(model.id, model);
    providerMap.set(key, { ...primary, models: [...models.values()] });
  }
  return [...providerMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AssistantStore {
  private state: AssistantState = {
    loaded: false,
    busy: false,
    currentBounds: null,
    expectedBounds: null,
    autoRestore: false,
    providers: [],
    catalogErrors: [],
    lastError: null,
  };
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(private readonly ctx: PluginContext) {}

  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  readonly getSnapshot = (): AssistantState => this.state;

  private set(patch: Partial<AssistantState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  async init(): Promise<void> {
    try {
      const [settings, current, area] = await Promise.all([
        this.ctx.storage.get<PersistedSettings>(SETTINGS_KEY),
        this.ctx.window.getMainBounds(),
        this.ctx.window.getAvailableArea(),
      ]);
      const expected = validBounds(settings?.expectedBounds)
        ? clampBounds(settings.expectedBounds, area)
        : suggestedBounds(area);
      const autoRestore = settings?.autoRestore === true;
      this.set({ currentBounds: current, expectedBounds: expected, autoRestore });
      if (autoRestore) {
        await this.ctx.window.setMainBounds(expected);
        this.set({ currentBounds: expected });
      }
    } catch (error) {
      this.set({ lastError: asMessage(error) });
    }
    await this.refreshModels(false);
    this.set({ loaded: true });
  }

  async refreshWindow(): Promise<void> {
    try {
      this.set({ currentBounds: await this.ctx.window.getMainBounds(), lastError: null });
    } catch (error) {
      this.set({ lastError: asMessage(error) });
    }
  }

  async sampleWechat(): Promise<void> {
    try {
      const sampled = await this.ctx.window.sampleExternalWindow({ app: "wechat" });
      if (!sampled) throw new Error("未找到可采样的微信主窗口");
      const area = await this.ctx.window.getAvailableArea();
      this.set({ expectedBounds: clampBounds(sampled, area), lastError: null });
    } catch (error) {
      this.set({ lastError: asMessage(error) });
    }
  }

  async applyExpected(): Promise<void> {
    if (!this.state.expectedBounds) return;
    try {
      const area = await this.ctx.window.getAvailableArea();
      const bounds = clampBounds(this.state.expectedBounds, area);
      await this.ctx.window.setMainBounds(bounds);
      this.set({ expectedBounds: bounds, currentBounds: bounds, lastError: null });
    } catch (error) {
      this.set({ lastError: asMessage(error) });
    }
  }

  async saveCurrentAsExpected(): Promise<void> {
    try {
      const current = await this.ctx.window.getMainBounds();
      const area = await this.ctx.window.getAvailableArea();
      const expectedBounds = clampBounds(current, area);
      await this.persist({ expectedBounds, autoRestore: this.state.autoRestore });
      this.set({ currentBounds: current, expectedBounds, lastError: null });
    } catch (error) {
      this.set({ lastError: asMessage(error) });
    }
  }

  async setAutoRestore(autoRestore: boolean): Promise<void> {
    try {
      await this.persist({ expectedBounds: this.state.expectedBounds, autoRestore });
      this.set({ autoRestore, lastError: null });
    } catch (error) {
      this.set({ lastError: asMessage(error) });
    }
  }

  async reset(): Promise<void> {
    try {
      await this.ctx.window.resetMainBounds();
      await this.ctx.storage.delete(SETTINGS_KEY);
      const [current, area] = await Promise.all([
        this.ctx.window.getMainBounds(),
        this.ctx.window.getAvailableArea(),
      ]);
      this.set({ currentBounds: current, expectedBounds: suggestedBounds(area), autoRestore: false, lastError: null });
    } catch (error) {
      this.set({ lastError: asMessage(error) });
    }
  }

  async refreshModels(refresh = true): Promise<void> {
    this.set({ busy: true });
    let cached: ModelProviderCatalog[] = [];
    try {
      cached = (await this.ctx.storage.get<ModelProviderCatalog[]>(CATALOG_CACHE_KEY)) ?? [];
    } catch (error) {
      this.set({ catalogErrors: [`缓存读取失败：${asMessage(error)}`] });
    }
    try {
      const result: ModelCatalogResult = await this.ctx.models.listCatalog({ refresh });
      const providers = mergeCatalogs(result.providers, cached);
      const errors = (result.errors ?? []).map((item) => item.providerId ? `${item.providerId}: ${item.message}` : item.message);
      const authoritative = result.providers.filter((item) => item.authoritative);
      if (authoritative.length > 0) await this.ctx.storage.set(CATALOG_CACHE_KEY, authoritative.map((item) => ({ ...item, source: "cache", authoritative: false })));
      this.set({ providers, catalogErrors: errors, lastError: null, busy: false });
    } catch (error) {
      const message = asMessage(error);
      this.set({
        providers: mergeCatalogs(cached),
        catalogErrors: [`宿主实时目录失败，已降级到缓存：${message}`],
        lastError: message,
        busy: false,
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private persist(settings: PersistedSettings): Promise<void> {
    return this.ctx.storage.set(SETTINGS_KEY, settings);
  }
}
