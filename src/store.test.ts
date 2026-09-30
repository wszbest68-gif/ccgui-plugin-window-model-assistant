import { describe, expect, it } from "vitest";
import type {
  PluginAgentCatalogEntry,
  PluginContext,
  WindowBounds,
} from "./ccgui-plugin";
import { adaptAgentCatalog, AssistantStore, suggestedBounds } from "./store";

const bounds: WindowBounds = { x: 30, y: 40, width: 800, height: 600 };

function fakeContext(options?: {
  cached?: unknown;
  wechatError?: Error;
  /** 模拟官方宿主：无候选 window 能力 */
  noWindow?: boolean;
  /** 模拟极旧宿主：无 agent 能力 */
  noAgent?: boolean;
  agentCatalog?: PluginAgentCatalogEntry[];
  agentError?: Error;
}) {
  const values = new Map<string, unknown>();
  if (options?.cached !== undefined) values.set("modelCatalogCache", options.cached);
  let current = bounds;
  const agentCalls: string[] = [];
  const ctx: Record<string, unknown> = {
    host: { locale: "zh-CN", appVersion: "1.1.0", sdkVersion: "0.3.15", isWeb: false },
    storage: {
      get: async <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
      set: async (key: string, value: unknown) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); },
    },
  };
  if (!options?.noWindow) {
    ctx.window = {
      getState: async () => ({ bounds: current, state: "normal" as const, scaleFactor: 1 }),
      setNormalBounds: async (next: WindowBounds) => { current = next; return { bounds: next, state: "normal" as const, scaleFactor: 1 }; },
      sampleWechat: async () => {
        if (options?.wechatError) throw options.wechatError;
        return { bounds: { x: 10, y: 20, width: 1100, height: 800 }, executable: "WeChat.exe" };
      },
    };
  }
  if (!options?.noAgent) {
    ctx.agent = {
      catalog: async (workspacePath: string) => {
        agentCalls.push(workspacePath);
        if (options?.agentError) throw options.agentError;
        return options?.agentCatalog ?? [];
      },
    };
  }
  return { ctx: ctx as unknown as PluginContext, values, agentCalls };
}

function agentEntry(engine: string, models: string[], patch?: Partial<PluginAgentCatalogEntry>): PluginAgentCatalogEntry {
  return {
    engine, label: engine, available: true, readOnly: false,
    providers: [], models: models.map((id) => ({ id, label: id })), ...patch,
  };
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

describe("窗口候选能力缺失（官方宿主）", () => {
  it("init 不触碰窗口 API 且 windowSupported=false", async () => {
    const { ctx } = fakeContext({ noWindow: true });
    const store = new AssistantStore(ctx);
    await store.init();
    const state = store.getSnapshot();
    expect(state.loaded).toBe(true);
    expect(state.windowSupported).toBe(false);
    expect(state.currentBounds).toBeNull();
    expect(state.lastError).toBeNull();
  });
  it("窗口操作守卫：不支持时写入友好错误且不抛异常", async () => {
    const { ctx } = fakeContext({ noWindow: true });
    const store = new AssistantStore(ctx);
    await store.applyExpected();
    expect(store.getSnapshot().lastError).toContain("不支持窗口管理");
    await store.reset();
    expect(store.getSnapshot().lastError).toContain("不支持窗口管理");
  });
});

describe("adaptAgentCatalog（官方 agent 目录适配）", () => {
  const sample: PluginAgentCatalogEntry[] = [
    agentEntry("kimi", ["k3", "k3", "k2"], { label: "Kimi", providers: [{ id: "p1", label: "官方" }] }),
    agentEntry("dsh", [], { available: false }),
  ];
  it("引擎级平铺模型映射为单来源行并按 id 去重", () => {
    const groups = adaptAgentCatalog(sample);
    expect(groups).toHaveLength(2);
    expect(groups[0].engine).toMatchObject({ id: "kimi", available: true, enabled: true });
    expect(groups[0].sources[0]).toMatchObject({ id: "agent-catalog", kind: "builtin", authoritative: true });
    expect(groups[0].sources[0].models.map((m) => m.id)).toEqual(["k3", "k2"]);
    expect(groups[0].sources[0].models[0]).toMatchObject({ name: "k3", provider: "p1" });
  });
  it("无模型的引擎保留空 sources；不可用时透传 available=false", () => {
    const groups = adaptAgentCatalog(sample);
    expect(groups[1].engine.available).toBe(false);
    expect(groups[1].sources).toEqual([]);
  });
});

describe("refreshModels（agent 路径）", () => {
  it("init 与用户刷新均调用 agent.catalog，传入已知工作区", async () => {
    const { ctx, agentCalls } = fakeContext({ agentCatalog: [agentEntry("codex", ["gpt-6"])] });
    const store = new AssistantStore(ctx);
    store.setWorkspace("D:/ws");
    await store.init();
    await store.refreshModels(true);
    expect(agentCalls).toEqual(["D:/ws", "D:/ws"]);
    expect(store.getSnapshot().groups[0].sources[0].models.map((m) => m.id)).toEqual(["gpt-6"]);
    expect(store.getSnapshot().catalogErrors).toEqual([]);
  });
  it("实时成功时缓存不混入展示", async () => {
    const cached = [{ engine: { id: "old" }, sources: [{ engineId: "old", id: "c", name: "c", kind: "cache", authoritative: false, remote: false, models: [{ id: "stale", provider: "p" }], refreshedAt: 1 }] }];
    const { ctx } = fakeContext({ cached, agentCatalog: [agentEntry("codex", ["gpt-6"])] });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    expect(store.getSnapshot().groups.map((group) => group.engine.id)).toEqual(["codex"]);
  });
  it("实时失败时降级缓存副本并显示错误", async () => {
    const cached = [{ engine: { id: "codex" }, sources: [{ engineId: "codex", id: "cli", name: "CLI", kind: "cli", authoritative: true, remote: false, models: [{ id: "gpt-4", provider: "p" }], refreshedAt: 1 }] }];
    const { ctx } = fakeContext({ agentError: new Error("offline"), cached });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    const row = store.getSnapshot().groups[0].sources[0];
    expect(row).toMatchObject({ kind: "cache", authoritative: false });
    expect(store.getSnapshot().catalogErrors[0]).toContain("offline");
  });
  it("宿主无 agent 能力时明确报错并降级缓存", async () => {
    const { ctx } = fakeContext({ noAgent: true });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    expect(store.getSnapshot().catalogErrors[0]).toContain("no catalog capability");
  });
  it("写入缓存时强制 kind=cache 且 authoritative=false", async () => {
    const { ctx, values } = fakeContext({ agentCatalog: [agentEntry("codex", ["gpt-6"])] });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    const cached = values.get("modelCatalogCache") as Array<{ sources: Array<{ kind: string; authoritative: boolean }> }>;
    expect(cached[0].sources[0]).toMatchObject({ kind: "cache", authoritative: false });
  });
  it("缓存不保留契约外敏感字段", async () => {
    const dirty = agentEntry("codex", ["gpt-6"]);
    (dirty as unknown as Record<string, unknown>).apiKey = "sk-secret";
    const { ctx, values } = fakeContext({ agentCatalog: [dirty] });
    const store = new AssistantStore(ctx);
    await store.refreshModels(false);
    const serialized = JSON.stringify(values.get("modelCatalogCache"));
    expect(serialized).not.toContain("sk-secret");
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
