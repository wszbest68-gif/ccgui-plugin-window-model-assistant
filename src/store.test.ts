import { describe, expect, it } from "vitest";
import type { HostCatalogEntry, PluginContext, WindowBounds } from "./ccgui-plugin";
import { AssistantStore, mergeCatalogs, normalizeCatalog, suggestedBounds } from "./store";

const bounds: WindowBounds = { x: 30, y: 40, width: 800, height: 600 };
function entry(catalog: unknown, error?: string): HostCatalogEntry { return { engine: "codex", catalog, error }; }
function fakeContext(options?: { catalogError?: Error; cached?: ReturnType<typeof normalizeCatalog> }) {
  const values = new Map<string, unknown>();
  if (options?.cached) values.set("modelCatalogCache", options.cached);
  let current = bounds;
  const ctx = {
    storage: { get: async <T,>(key: string) => (values.get(key) as T | undefined) ?? null, set: async (key: string, value: unknown) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); } },
    window: {
      getState: async () => ({ bounds: current, state: "normal", scaleFactor: 1 }),
      setNormalBounds: async (next: WindowBounds) => { current = next; return { bounds: next, state: "normal", scaleFactor: 1 }; },
      sampleWechat: async () => ({ bounds: { x: 10, y: 20, width: 1100, height: 800 }, executable: "WeChat.exe" }),
    },
    models: {
      catalog: async () => { if (options?.catalogError) throw options.catalogError; return [entry({ sources: [{ id: "cli", name: "CLI catalog", kind: "catalog", authoritative: true, models: ["gpt-5", "gpt-5-mini"], refreshedAt: 200 }] })]; },
      refreshProviderModels: async () => ({ models: ["gpt-5", "gpt-5-mini", "gpt-5-pro"] }),
    },
  };
  return { ctx: ctx as unknown as PluginContext, values };
}

describe("窗口建议尺寸", () => {
  it("保留当前坐标，仅替换为类微信尺寸", () => expect(suggestedBounds(bounds)).toEqual({ x: 30, y: 40, width: 980, height: 720 }));
});

describe("模型目录", () => {
  it("解析来源目录并保留 authoritative 原义", () => {
    const rows = normalizeCatalog([entry({ sources: [{ id: "cli", name: "CLI", kind: "catalog", authoritative: true, models: ["gpt-5"], refreshedAt: 200 }] })]);
    expect(rows[0]).toMatchObject({ source: "catalog", authoritative: true, refreshedAt: 200 });
  });
  it("合并实时目录时实时来源优先，缓存不覆盖", () => {
    const current = normalizeCatalog([entry({ sources: [{ id: "cli", name: "CLI", kind: "catalog", authoritative: false, models: ["gpt-5"], refreshedAt: 200 }] })]);
    const cached = normalizeCatalog([entry({ sources: [{ id: "cli", name: "CLI", kind: "catalog", authoritative: true, models: ["gpt-4"], refreshedAt: 100 }] })]).map((row) => ({ ...row, source: "cache", authoritative: false as const }));
    expect(mergeCatalogs(current, cached)[0].models.map((model) => model.id)).toEqual(["gpt-5"]);
  });
  it("宿主失败时降级缓存并保留错误", async () => {
    const cached = normalizeCatalog([entry({ sources: [{ id: "cli", name: "CLI", kind: "catalog", authoritative: false, models: ["gpt-4"], refreshedAt: 100 }] })]).map((row) => ({ ...row, source: "cache", authoritative: false as const }));
    const { ctx } = fakeContext({ catalogError: new Error("offline"), cached });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    expect(store.getSnapshot().providers[0]).toMatchObject({ source: "cache", authoritative: false });
    expect(store.getSnapshot().catalogErrors[0]).toContain("offline");
  });
  it("用户刷新才调用 provider refresh", async () => {
    const { ctx } = fakeContext();
    let calls = 0;
    ctx.models.refreshProviderModels = async () => { calls += 1; return { models: ["gpt-5-pro"] }; };
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    expect(calls).toBe(0);
    await store.refreshModels(true);
    expect(calls).toBe(1);
  });
});

describe("store 初始化", () => {
  it("读取主窗口并写入默认状态", async () => {
    const { ctx } = fakeContext();
    const store = new AssistantStore(ctx);
    await store.init();
    expect(store.getSnapshot()).toMatchObject({ loaded: true, currentBounds: bounds, expectedBounds: { width: 980, height: 720 } });
  });
});
