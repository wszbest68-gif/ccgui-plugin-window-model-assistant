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
  sourceCli: string;
  sourceOfficial: string;
  sourceProvider: string;
  sourceCustom: string;
  sourceConfigured: string;
  sourceBuiltin: string;
  sourceCache: string;
  refreshed: string;
  remote: string;
  local: string;
  authoritativeMark: string;
  engineUnavailable: string;
  engineDisabled: string;
  modelsCount: string;
  errorsTitle: string;
  availabilityNotice: string;
  authoritativeNotice: string;
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
  reset: "恢复建议尺寸",
  modelsTitle: "模型目录",
  refresh: "刷新",
  loading: "正在读取宿主模型目录…",
  noModels: "宿主未返回模型。",
  sourceCli: "CLI 目录",
  sourceOfficial: "官方配置",
  sourceProvider: "服务商配置",
  sourceCustom: "自定义模型",
  sourceConfigured: "默认配置",
  sourceBuiltin: "宿主内置",
  sourceCache: "缓存副本",
  refreshed: "刷新时间",
  remote: "远程",
  local: "本地",
  authoritativeMark: "闭合集合",
  engineUnavailable: "引擎不可用",
  engineDisabled: "引擎未启用",
  modelsCount: "个模型",
  errorsTitle: "目录错误",
  availabilityNotice: "目录存在不代表鉴权、订阅权益、额度或真实调用已验证。",
  authoritativeNotice: "authoritative 仅表示该来源（如 CLI selector）可解析出闭合模型集合，不代表账号可用。",
  error: "错误",
  statusAuto: "自动恢复已启用",
  statusModels: "个模型",
  commandRestore: "恢复主窗口到预期位置与大小",
  commandRefresh: "刷新模型目录",
  suggested: "980×720 为建议初始尺寸，并非微信实测",
};

const en: Copy = {
  tab: "Window & Models", settings: "Window & Model Assistant", title: "Window & Model Assistant",
  windowTitle: "Main window", current: "Current", expected: "Expected", sampleWechat: "Sample WeChat window",
  apply: "Apply", saveExpected: "Save as expected", autoRestore: "Restore automatically on startup", reset: "Restore suggested size",
  modelsTitle: "Model catalog", refresh: "Refresh", loading: "Reading the host model catalog…", noModels: "No models returned by host.",
  sourceCli: "CLI catalog", sourceOfficial: "Official config", sourceProvider: "Provider config", sourceCustom: "Custom models",
  sourceConfigured: "Default config", sourceBuiltin: "Host built-in", sourceCache: "Cache copy",
  refreshed: "Refreshed", remote: "Remote", local: "Local", authoritativeMark: "Closed set",
  engineUnavailable: "Engine unavailable", engineDisabled: "Engine disabled", modelsCount: "models", errorsTitle: "Catalog errors",
  availabilityNotice: "A catalog entry does not prove authentication, subscription entitlement, quota, or a verified invocation.",
  authoritativeNotice: "authoritative only means the source (e.g. a CLI selector) resolves to a closed model set; it does not mean the account is usable.",
  error: "Error", statusAuto: "Auto restore enabled", statusModels: "models", commandRestore: "Restore expected main-window bounds",
  commandRefresh: "Refresh model catalog", suggested: "980×720 is a suggested initial size, not measured from WeChat",
};

export function copy(locale: string): Copy {
  return locale.toLowerCase().startsWith("zh") ? zh : en;
}

export const bundles = { "zh-CN": zh, en };
