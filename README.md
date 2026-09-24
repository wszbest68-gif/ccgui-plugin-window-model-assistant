# 窗口与模型助手

CC GUI 插件，只管理 **CC GUI 主窗口**，并通过宿主公开 API 查看各引擎/来源的模型目录。

## 功能

- 记住并恢复主窗口位置与大小；首次提供 `980×720` 的建议初始尺寸（**建议值，并非微信实测**），由宿主按显示器可用区域钳制。
- 采样当前微信主窗口、应用预期值、保存当前值、启动自动恢复、恢复建议尺寸；微信未运行或采样失败时原样展示宿主 Unsupported/NotFound 错误。
- 按引擎分组、按来源分行展示宿主模型目录：来源 kind、名称、模型数、authoritative、remote、刷新时间与降级说明。
- 激活时以 `refreshProviders:false` 读取目录（绝不出网）；仅用户点击“刷新”时以 `refreshProviders:true` 触发宿主刷新。
- 实时读取失败时保留并展示本地缓存副本（强制 `authoritative=false`、标记“缓存副本”），并透明显示宿主返回的脱敏错误。
- 每个来源明确标注：目录存在**不代表**鉴权、订阅权益、额度或真实调用已验证；`authoritative` 仅表示该来源（如 CLI selector）可解析出闭合模型集合，不代表账号可用。
- 简体中文默认并支持英文；适配窄右侧面板和宿主浅色/深色语义 token。

插件不读取或保存服务商密钥，不访问文件系统，不执行命令，不使用 `__TAURI_INTERNALS__` 或私有 model-switcher transport，也不管理弹窗。

## 预期宿主 API

本版本面向 `@ccgui/plugin-sdk ^0.3.16`、宿主 `>=1.0.10`：`ctx.window` 提供 `getState`、`setNormalBounds` 与 `sampleWechat`（物理像素，仅 main 窗口，仅 normal 可设置）；`ctx.models.catalog({ refreshProviders })` 返回 `PluginModelCatalogResult`（`engines[].sources[].models` 与脱敏 `errors`）。宿主不向插件暴露 URL、密钥或原始 provider 配置。来源 kind 取值：`cli`（CLI 目录）、`official`（官方配置）、`provider`（服务商配置）、`custom`（自定义模型）、`configured`（默认配置）、`builtin`（宿主内置）；插件本地缓存仅用于降级展示，UI 统一标记为“缓存副本”。

## 开发

```bash
npm ci
npm run check
npm run checksums
```

构建产物是根目录的单文件 ESM `main.js` 和 `styles.css`；不引入或打包 React，UI 使用宿主 `ctx.react`。

## 发布

创建与 `manifest.json` 版本完全一致且不带 `v` 的 `0.1.0` tag。GitHub Actions 会运行类型检查、单测、构建、manifest 校验并生成 SHA-256 `checksums.txt` 后发布四个安装文件。

## 权限

`host:window`、`host:models`、`storage`、`ui:panel-tab`、`ui:settings-section`、`ui:command`、`ui:status-bar`、`i18n`。

## License

MIT
