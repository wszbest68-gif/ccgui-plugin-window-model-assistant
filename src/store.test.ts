import { describe, expect, it } from "vitest";
import type { ModelProviderCatalog, PluginContext, WindowBounds } from "./ccgui-plugin";
import { AssistantStore, clampBounds, mergeCatalogs, suggestedBounds } from "./store";

function provider(source: ModelProviderCatalog["source"], authoritative: boolean, models: string[]): ModelProviderCatalog {
  return {
    id: "openai", name: "OpenAI", engine: "codex", source, authoritative,
    refreshedAt: source === "authoritative" ? 200 : 100,
    models: models.map((id) => ({ id })),
  };
}

function fakeContext(options?: { catalogError?: Error; cached?: ModelProviderCatalog[] }) {
  const values = new Map<string, unknown>();
  if (options?.cached) values.set("modelCatalogCache", options.cached);
  let bounds: WindowBounds = { x: 30, y: 40, width: 800, height: 600 };
  const ctx = {
    storage: {
      get: async <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
      set: async (key: string, value: unknown) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); },
    },
    window: {
      getMainBounds: async () => bounds,
      setMainBounds: async (next: WindowBounds) => { bounds = next; },
      getAvailableArea: async () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
      sampleExternalWindow: async () => null,
      resetMainBounds: async () => { bounds = { x: 0, y: 0, width: 1024, height: 768 }; },
    },
    models: {
      listCatalog: async () => {
        if (options?.catalogError) throw options.catalogError;
        return { providers: [provider("authoritative", true, ["gpt-5", "gpt-5-mini"])] };
      },
      onDidChange: () => () => undefined,
    },
  };
  return { ctx: ctx as unknown as PluginContext, values };
}

describe("窗口范围", () => {
  it("把越界尺寸和位置钳制到可用区域", () => {
    expect(clampBounds({ x: -50, y: 900, width: 2500, height: 500 }, { x: 0, y: 0, width: 1920, height: 1080 }))
      .toEqual({ x: 0, y: 580, width: 1920, height: 500 });
  });

  it("首次使用提供类似微信的居中建议尺寸", () => {
    expect(suggestedBounds({ x: 0, y: 0, width: 1920, height: 1080 }))
      .toEqual({ x: 470, y: 180, width: 980, height: 720 });
  });
});

describe("模型目录", () => {
  it("合并缓存时权威来源及其同 id 模型优先", () => {
    const merged = mergeCatalogs([provider("cache", false, ["gpt-4", "gpt-5"])], [provider("authoritative", true, ["gpt-5", "gpt-5-mini"])]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("authoritative");
    expect(merged[0].authoritative).toBe(true);
    expect(merged[0].models.map((m) => m.id)).toEqual(["gpt-4", "gpt-5", "gpt-5-mini"]);
  });

  it("实时目录错误时透明降级到带来源标记的缓存", async () => {
    const cached = [provider("cache", false, ["gpt-4"] )];
    const { ctx } = fakeContext({ catalogError: new Error("offline"), cached });
    const store = new AssistantStore(ctx);
    await store.refreshModels(true);
    expect(store.getSnapshot().providers[0].source).toBe("cache");
    expect(store.getSnapshot().providers[0].authoritative).toBe(false);
    expect(store.getSnapshot().catalogErrors[0]).toContain("offline");
  });

  it("成功结果保存为非权威缓存且保留刷新时间", async () => {
    const { ctx, values } = fakeContext();
    const store = new AssistantStore(ctx);
    await store.refreshModels(true);
    const cached = values.get("modelCatalogCache") as ModelProviderCatalog[];
    expect(cached[0]).toMatchObject({ source: "cache", authoritative: false, refreshedAt: 200 });
  });
});

describe("store 初始化", () => {
  it("读取主窗口并写入完整默认状态", async () => {
    const { ctx } = fakeContext();
    const store = new AssistantStore(ctx);
    await store.init();
    expect(store.getSnapshot()).toMatchObject({ loaded: true, autoRestore: false, currentBounds: { width: 800, height: 600 } });
    expect(store.getSnapshot().expectedBounds).toMatchObject({ width: 980, height: 720 });
  });
});
