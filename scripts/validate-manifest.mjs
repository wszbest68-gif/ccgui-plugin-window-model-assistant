#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const known = new Set(["host:window", "host:models", "storage", "ui:panel-tab", "ui:settings-section", "ui:command", "ui:status-bar", "i18n"]);
const problems = [];
if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id ?? "")) problems.push("id 不合法");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) problems.push("version 必须为三段 semver");
if (manifest.minAppVersion !== "1.0.10") problems.push("minAppVersion 应为 1.0.10");
if (manifest.sdkVersion !== "^0.3.16") problems.push("sdkVersion 应为 ^0.3.16");
if (manifest.repo !== "wszbest68-gif/ccgui-plugin-window-model-assistant") problems.push("repo 不匹配");
if (manifest.author !== "wszbest68-gif") problems.push("author 不匹配");
if (!Array.isArray(manifest.permissions)) problems.push("permissions 必须为数组");
else for (const permission of manifest.permissions) if (!known.has(permission)) problems.push(`未知或非最小权限：${permission}`);
for (const required of known) if (!manifest.permissions?.includes(required)) problems.push(`缺少权限：${required}`);
if (problems.length) {
  console.error(`manifest 校验失败：\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`manifest 校验通过：${manifest.id}@${manifest.version}（${manifest.permissions.length} 项权限）`);
