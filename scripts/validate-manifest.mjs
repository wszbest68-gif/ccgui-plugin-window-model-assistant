#!/usr/bin/env node
/**
 * window-model-assistant manifest 校验器。
 * 权限白名单对齐 desktop-cc-gui 官方 packages/plugin-sdk/spec/permissions.json
 * （单一事实源）；只含官方宿主已发布的权限，不含私有候选权限。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));

// 与本插件使用到的官方 spec/permissions.json 权限保持一致（SDK 0.3.19）。
const KNOWN = new Set([
  "storage",
  "ui:settings-section",
  "ui:add-menu",
  "ui:composer-status",
  "ui:panel-tab",
  "ui:status-bar",
  "ui:command",
  "ui:markdown",
  "ui:page",
  "ui:timeline-row",
  "ui:session-menu",
  "ui:sidebar-entry",
  "ui:center-tab",
  "ui:conversation-mode",
  "agent",
  "theme",
  "i18n",
  "events",
  "network:none",
  "composer:draft",
  "host:session",
  "host:workspace",
  "host:workspace:remote",
  "host:window",
  "host:models",
]);

const NETWORK_RE = /^network:[A-Za-z0-9.-]+(?::\d+(?:-\d+)?)?$/;
const EXEC_RE = /^exec:[A-Za-z0-9._-]+$/;
const SDK_RANGE_RE = /^(\^|~|>=)?\d+\.\d+(\.\d+)?$|^\*$/;

function isKnownPermission(p) {
  if (KNOWN.has(p)) return true;
  if (p.startsWith("network:") && p !== "network:none") return NETWORK_RE.test(p);
  if (p.startsWith("exec:")) return EXEC_RE.test(p);
  return false;
}

const problems = [];
if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id ?? "")) problems.push("id 不合法");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) problems.push("version 必须为三段 semver");
if (manifest.minAppVersion !== undefined && !/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
  problems.push("minAppVersion 必须为三段 semver");
}
if (manifest.sdkVersion !== undefined && !SDK_RANGE_RE.test(manifest.sdkVersion)) {
  problems.push('sdkVersion 形状不合法（支持 "*"、精确、"^x.y(.z)"、"~x.y.z"、">=x.y.z"）');
}
if (manifest.repo !== "wszbest68-gif/ccgui-plugin-window-model-assistant") problems.push("repo 不匹配");
if (manifest.author !== "wszbest68-gif") problems.push("author 不匹配");
if ((manifest.name ?? "").length > 30) problems.push("name 超 30 字符");
if ((manifest.description ?? "").length > 120) problems.push("description 超 120 字符");
if ((manifest.keywords ?? []).length > 8) problems.push("keywords 超 8 个");
if (!["declarative", "js"].includes(manifest.tier)) problems.push("tier 只能为 declarative|js");
if (!Array.isArray(manifest.permissions)) problems.push("permissions 必须为数组");
else for (const permission of manifest.permissions) {
  if (typeof permission !== "string" || !isKnownPermission(permission)) {
    problems.push(`未知权限：${permission}（不在官方 spec 白名单；候选权限须先合入上游）`);
  }
}

if (problems.length) {
  console.error(`manifest 校验失败：\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`manifest 校验通过：${manifest.id}@${manifest.version}（${manifest.permissions.length} 项权限）`);
