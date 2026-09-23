# 窗口与模型助手

CC GUI 插件，只管理 **CC GUI 主窗口**，并通过宿主公开 API 查看所有已接入引擎/服务商的模型目录。

## 功能

- 记住并恢复主窗口位置与大小；首次提供 `980×720` 的类微信窗口建议值，并按当前显示器可用区域钳制。
- 采样当前微信主窗口、应用预期值、保存当前值、启动自动恢复、恢复宿主默认窗口。
- 优先展示宿主权威/实时模型目录；失败时合并展示本地缓存和宿主返回的引擎内置目录。
- 每个服务商明确标注来源、是否 authoritative、刷新时间、错误和降级原因。
- 模型“列出”只表示宿主发现该条目，**不代表**服务商鉴权、额度或真实调用当前可用。
- 简体中文默认并支持英文；适配窄右侧面板和宿主浅色/深色语义 token。

插件不读取或保存服务商密钥，不访问文件系统，不执行命令，不使用 `__TAURI_INTERNALS__` 或私有 model-switcher transport，也不管理弹窗。

## 预期宿主 API

本版本面向计划中的 `@ccgui/plugin-sdk ^0.3.16`：`ctx.window` 仅暴露受控主窗口能力，`ctx.models` 暴露经过宿主权限过滤的模型目录及变更订阅。`src/ccgui-plugin.d.ts` 是合并宿主 API 前的公开契约快照，不是私有桥接。

## 开发

```bash
npm ci
npm run check
npm run checksums
```

构建产物是根目录的单文件 ESM `main.js` 和 `styles.css`；不引入或打包 React，UI 使用宿主 `ctx.react`。

## 发布

创建与 `manifest.json` 版本一致的 `0.1.0` 或 `v0.1.0` tag。GitHub Actions 会运行类型检查、单测、构建、manifest 校验并生成 SHA-256 `checksums.txt` 后发布四个安装文件。

## 权限

`host:window`、`host:models`、`storage`、`ui:panel-tab`、`ui:settings-section`、`ui:command`、`ui:status-bar`、`i18n`。

## License

MIT
