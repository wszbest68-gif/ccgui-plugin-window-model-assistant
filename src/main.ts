import "./styles.css";
import type { Disposer, PluginActivate } from "./ccgui-plugin";
import { bundles, copy } from "./i18n";
import { AssistantStore } from "./store";
import { makeAssistantView, makeStatus } from "./ui";

const activate: PluginActivate = (ctx) => {
  const disposers: Disposer[] = [];
  const t = copy(ctx.host.locale);
  const store = new AssistantStore(ctx);
  const view = makeAssistantView(ctx, store, t);

  // 激活同步返回；异步初始化不阻塞插件加载。
  void store.init();

  disposers.push(ctx.i18n.addBundle("zh-CN", "window-model-assistant", { ...bundles["zh-CN"] }));
  disposers.push(ctx.i18n.addBundle("en", "window-model-assistant", { ...bundles.en }));
  disposers.push(ctx.models.onDidChange(() => void store.refreshModels(false)));
  disposers.push(ctx.ui.registerPanelTab({ key: "window-model-assistant", label: () => t.tab, component: view }));
  disposers.push(ctx.ui.registerSettingsSection({ key: "window-model-assistant", label: () => t.settings, component: view }));
  disposers.push(ctx.ui.registerStatusBarItem({ key: "window-model-assistant", component: makeStatus(ctx, store, t), zone: "end" }));
  disposers.push(ctx.ui.registerCommand({
    key: "window-model-assistant.restore",
    title: () => t.commandRestore,
    keywords: () => ["window", "restore", "窗口", "恢复"],
    run: () => void store.applyExpected(),
  }));
  disposers.push(ctx.ui.registerCommand({
    key: "window-model-assistant.refresh-models",
    title: () => t.commandRefresh,
    keywords: () => ["models", "catalog", "模型", "刷新"],
    run: () => void store.refreshModels(true),
  }));

  return () => {
    for (const dispose of disposers.reverse()) dispose();
    store.dispose();
  };
};

export default activate;
