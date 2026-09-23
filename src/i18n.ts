export interface Copy {
  tab: string;
  settings: string;
  title: string;
  windowTitle: string;
  current: string;
  expected: string;
  sampleWechat: string;
  apply: string;
  saveExpected: string;
  autoRestore: string;
  reset: string;
  modelsTitle: string;
  refresh: string;
  loading: string;
  noModels: string;
  authoritative: string;
  nonAuthoritative: string;
  sourceAuthoritative: string;
  sourceCache: string;
  sourceBuiltin: string;
  refreshed: string;
  degraded: string;
  availabilityNotice: string;
  error: string;
  statusAuto: string;
  statusModels: string;
  commandRestore: string;
  commandRefresh: string;
  suggested: string;
}

const zh: Copy = {
  tab: "窗口与模型",
  settings: "窗口与模型助手",
  title: "窗口与模型助手",
  windowTitle: "主窗口",
  current: "当前窗口",
  expected: "预期窗口",
  sampleWechat: "采样微信窗口",
  apply: "应用",
  saveExpected: "保存为预期",
  autoRestore: "启动时自动恢复",
  reset: "恢复默认",
  modelsTitle: "模型目录",
  refresh: "刷新",
  loading: "正在读取宿主模型目录…",
  noModels: "宿主未返回模型。",
  authoritative: "权威实时目录",
  nonAuthoritative: "降级目录",
  sourceAuthoritative: "宿主权威/实时",
  sourceCache: "本地缓存",
  sourceBuiltin: "引擎内置",
  refreshed: "刷新时间",
  degraded: "降级原因",
  availabilityNotice: "目录条目仅表示宿主已发现；不代表服务商鉴权、额度或真实调用当前可用。",
  error: "错误",
  statusAuto: "自动恢复已启用",
  statusModels: "个模型",
  commandRestore: "恢复主窗口到预期位置与大小",
  commandRefresh: "刷新模型目录",
  suggested: "建议初始大小（类似微信）",
};

const en: Copy = {
  tab: "Window & Models", settings: "Window & Model Assistant", title: "Window & Model Assistant",
  windowTitle: "Main window", current: "Current", expected: "Expected", sampleWechat: "Sample WeChat window",
  apply: "Apply", saveExpected: "Save as expected", autoRestore: "Restore automatically on startup", reset: "Restore defaults",
  modelsTitle: "Model catalog", refresh: "Refresh", loading: "Reading the host model catalog…", noModels: "No models returned by host.",
  authoritative: "Authoritative live catalog", nonAuthoritative: "Fallback catalog", sourceAuthoritative: "Host authoritative/live",
  sourceCache: "Local cache", sourceBuiltin: "Engine built-in", refreshed: "Refreshed", degraded: "Fallback reason",
  availabilityNotice: "Catalog entries mean discovered by the host only; they do not prove provider authentication, quota, or successful invocation.",
  error: "Error", statusAuto: "Auto restore enabled", statusModels: "models", commandRestore: "Restore expected main-window bounds",
  commandRefresh: "Refresh model catalog", suggested: "Suggested initial size (similar to WeChat)",
};

export function copy(locale: string): Copy {
  return locale.toLowerCase().startsWith("zh") ? zh : en;
}

export const bundles = { "zh-CN": zh, en };
