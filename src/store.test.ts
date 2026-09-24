import { describe, expect, it } from "vitest";
import type {
  PluginContext,
  PluginEngineInfo,
  PluginModelCatalogEngine,
  PluginModelCatalogResult,
  PluginModelSource,
  PluginModelSourceKind,
  WindowBounds,
} from "./ccgui-plugin";
import { AssistantStore, normalizeCatalog, suggestedBounds } from "./store";

const bounds: WindowBounds = { x: 30, y: 40, width: 800, height: 600 };

function engineInfo(id: string, patch?: Partial<PluginEngineInfo>): PluginEngineInfo {
  return {
    id, available: true, enabled: true, supportsImages: false, supportsComputerUse: false,
    supportsEffort: false, supportsToolConstraints: false, permissions: [], ...patch,
  };
}
function source(id: string, kind: PluginModelSourceKind, models: string[], patch?: Partial<PluginModelSource>): PluginModelSource {
  return {
    id, name: id, kind, authoritative: kind === "cli", remote: kind === "provider",
    models: models.map((model) => ({ id: model, provider: "p" })), refreshedAt: 200, ...patch,
  };
}
function entry(engineId: string, sources: PluginModelSource[]): PluginModelCatalogEngine {
  return { engine: engineInfo(engineId), sources };
}
function result(engines: PluginModelCatalogEngine[], errors: PluginModelCatalogResult["errors"] = []): PluginModelCatalogResult {
  return { engines, errors, refreshedAt: 200 };
}

function fakeContext(options?: {
  catalogError?: Error;
  catalogResult?: PluginModelCatalogResult;
  cached?: unknown;
  wechatError?: Error;
}) {
  const values = new Map<string, unknown>();
  if (options?.cached !== undefined) values.set("modelCatalogCache", options.cached);
  let current = bounds;
  const calls: Array<{ refreshProviders?: boolean }> = [];
  const ctx = {
    storage: {
      get: async <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
      set: async (key: string, value: unknown) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); },
    },
    window: {
      getState: async () => ({ bounds: current, state: "normal" as const, scaleFactor: 1 }),
      setNormalBounds: async (next: WindowBounds) => { current = next; return { bounds: next, state: "normal" as const, scaleFactor: 1 }; },
      sampleWechat: async () => {
        if (options?.wechatError) throw options.wechatError;
        return { bounds: { x: 10, y: 20, width: 1100, height: 800 }, executable: "WeChat.exe" };
      },
    },
    models: {
      catalog: async (opts?: { workspace?: string; refreshProviders?: boolean }) => {
        calls.push({ refreshProviders: opts?.refreshProviders });
        if (options?.catalogError) throw options.catalogError;
        return options?.catalogResult ?? result([entry("codex", [source("cli", "cli", ["gpt-5"])])]);
      },
    },
  };
  return { ctx: ctx as unknown as PluginContext, values, calls };
}

describe("窗口建议尺寸", () => {
  it("保留当前坐标，仅替换为 980x720 建议值", () => {
    expect(suggestedBounds(bounds)).toEqual({ x: 30, y: 40, width: 980, height: 720 });
  });
  it("微信未运行时原样透传宿主错误", async () => {
    const { ctx } = fakeContext({ wechatError: new Error("NotFound: 微信窗口未找到") });
    const store = new AssistantStore(ctx);
    await store.sampleWechat();
    expect(store.getSnapshot().lastError).toBe("NotFound: 微信窗口未找到");
  });
});

describe("normalizeCatalog", () => {
  it("按 source 分组：一个引擎的多个来源各自成行", () => {
    const groups = normalizeCatalog(result([
      entry("codex", [source("cli", "cli", ["gpt-5"]), source("cfg", "configured", ["gpt-4"])]),
    ]));
    expect(groups).toHaveLength(1);
    expect(groups[0].sources.map((row) => row.id)).toEqual(["cli", "cfg"]);
    expect(groups[0].sources[0]).toMatchObject({ kind: "cli", authoritative: true });
    expect(groups[0].sources[1]).toMatchObject({ kind: "configured", authoritative: false });
  });
  it("保留 remote 来源标记", () => {
    const groups = normalizeCatalog(result([entry("codex", [source("remote-p", "provider", ["m"], { remote: true })])]));
    expect(groups[0].sources[0].remote).toBe(true);
  });
  it("同一 source 内按 id 去重", () => {
    const groups = normalizeCatalog(result([entry("codex", [source("cli", "cli", ["a", "a", "b"])])]));
    expect(groups[0].sources[0].models.map((model) => model.id)).toEqual(["a", "b"]);
  });
  it("拒绝不符合契约的 DTO", () => {
    expect(() => normalizeCatalog({ sources: [] } as unknown as PluginModelCatalogResult)).toThrow();
  });
});

describe("refreshModels", () => {
  it("init 用 refreshProviders:false，用户刷新用 true", async () => {
    const { ctx, calls } = fakeContext();
    const store = new AssistantStore(ctx);
    await store.init();
    await store.refreshModels(true);
    expect(calls.map((call) => call.refreshProviders)).toEqual([false, true]);
  });
  it("透传 per-engine 与 per-source 错误", async () => {
    const catalogResult = result(
      [entry("codex", [source("cli", "cli", ["gpt-5"])])],
      [
        { engine: "claude", message: "engine not available" },
        { engine: "codex", sourceId: "remote-p", message: "provider timeout" },
      ],
    );
    const { ctx } = fakeContext({ catalogResult });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    const errors = store.getSnapshot().catalogErrors;
    expect(errors).toContain("claude: engine not available");
    expect(errors).toContain("codex/remote-p: provider timeout");
    expect(store.getSnapshot().groups[0].sources[0].models).toHaveLength(1);
  });
  it("实时成功时缓存不混入展示", async () => {
    const cached = [{ engine: engineInfo("old"), sources: [{ engineId: "old", id: "c", name: "c", kind: "cache", authoritative: false, remote: false, models: [{ id: "stale", provider: "p" }], refreshedAt: 1 }] }];
    const { ctx } = fakeContext({ cached });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    expect(store.getSnapshot().groups.map((group) => group.engine.id)).toEqual(["codex"]);
  });
  it("实时失败时降级缓存副本并显示宿主错误", async () => {
    const cached = [{ engine: engineInfo("codex"), sources: [{ engineId: "codex", id: "cli", name: "CLI", kind: "cli", authoritative: true, remote: false, models: [{ id: "gpt-4", provider: "p" }], refreshedAt: 1 }] }];
    const { ctx } = fakeContext({ catalogError: new Error("offline"), cached });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    const row = store.getSnapshot().groups[0].sources[0];
    expect(row).toMatchObject({ kind: "cache", authoritative: false });
    expect(store.getSnapshot().catalogErrors[0]).toContain("offline");
  });
  it("写入缓存时强制 kind=cache 且 authoritative=false", async () => {
    const { ctx, values } = fakeContext();
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    const cached = values.get("modelCatalogCache") as Array<{ sources: Array<{ kind: string; authoritative: boolean }> }>;
    expect(cached[0].sources[0]).toMatchObject({ kind: "cache", authoritative: false });
  });
  it("缓存不保留契约外敏感字段", async () => {
    const dirty = source("cli", "cli", ["gpt-5"]);
    (dirty.models[0] as unknown as Record<string, unknown>).apiKey = "sk-secret";
    (dirty as unknown as Record<string, unknown>).baseUrl = "https://internal.example";
    const { ctx, values } = fakeContext({ catalogResult: result([entry("codex", [dirty])]) });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    const serialized = JSON.stringify(values.get("modelCatalogCache"));
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("internal.example");
  });
});

describe("store 初始化", () => {
  it("读取主窗口并写入建议预期尺寸", async () => {
    const { ctx } = fakeContext();
    const store = new AssistantStore(ctx);
    await store.init();
    expect(store.getSnapshot()).toMatchObject({ loaded: true, currentBounds: bounds, expectedBounds: { width: 980, height: 720 } });
  });
  it("恢复建议尺寸保留当前 x/y、关闭 autoRestore 并清除设置", async () => {
    const { ctx, values } = fakeContext();
    const store = new AssistantStore(ctx);
    await store.init();
    await store.setAutoRestore(true);
    await store.reset();
    const state = store.getSnapshot();
    expect(state.expectedBounds).toEqual({ x: 30, y: 40, width: 980, height: 720 });
    expect(state.autoRestore).toBe(false);
    expect(values.has("settings")).toBe(false);
  });
});
