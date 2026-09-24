import type { PluginContext, WindowBounds } from "./ccgui-plugin";
import type { Copy } from "./i18n";
import type { AssistantStore, CatalogSourceRow } from "./store";

type H = PluginContext["react"];

function boundsText(bounds: WindowBounds | null): string {
  return bounds ? `${Math.round(bounds.width)}×${Math.round(bounds.height)} @ ${Math.round(bounds.x)}, ${Math.round(bounds.y)}` : "—";
}

function formatTime(timestamp: number, locale: string): string {
  if (!timestamp) return "—";
  try {
    return new Date(timestamp).toLocaleString(locale, { hour12: false });
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function kindLabel(t: Copy, kind: CatalogSourceRow["kind"]): string {
  switch (kind) {
    case "cli": return t.sourceCli;
    case "official": return t.sourceOfficial;
    case "provider": return t.sourceProvider;
    case "custom": return t.sourceCustom;
    case "configured": return t.sourceConfigured;
    case "builtin": return t.sourceBuiltin;
    case "cache": return t.sourceCache;
  }
}

function button(h: H, label: string, onClick: () => void, primary = false, title?: string) {
  return h.createElement("button", {
    type: "button",
    className: primary ? "wma-button wma-button-primary" : "wma-button",
    onClick,
    ...(title ? { title } : {}),
  }, label);
}

export function makeAssistantView(ctx: PluginContext, store: AssistantStore, t: Copy) {
  const h = ctx.react;
  return function AssistantView() {
    const state = h.useSyncExternalStore(store.subscribe, store.getSnapshot);
    const modelCount = state.groups.reduce((sum, group) => sum + group.sources.reduce((inner, source) => inner + source.models.length, 0), 0);

    const groupRows = state.groups.map((group) => h.createElement(
      "section",
      { className: "wma-provider", key: group.engine.id },
      h.createElement("div", { className: "wma-provider-head" },
        h.createElement("strong", null, group.engine.id),
        group.engine.available ? null : h.createElement("span", { className: "wma-badge wma-badge-warn" }, t.engineUnavailable),
        group.engine.enabled ? null : h.createElement("span", { className: "wma-badge wma-badge-warn" }, t.engineDisabled),
      ),
      ...group.sources.map((source) => h.createElement(
        "div",
        { className: "wma-source", key: source.id },
        h.createElement("div", { className: "wma-provider-head" },
          h.createElement("strong", null, source.name),
          h.createElement("span", {
            className: source.kind === "cache" ? "wma-badge wma-badge-warn" : "wma-badge wma-badge-ok",
          }, kindLabel(t, source.kind)),
        ),
        h.createElement("div", { className: "wma-meta" },
          `${source.id} · ${source.models.length} ${t.modelsCount} · ${source.remote ? t.remote : t.local}${source.authoritative ? ` · ${t.authoritativeMark}` : ""}`),
        h.createElement("div", { className: "wma-meta" }, `${t.refreshed}: ${formatTime(source.refreshedAt, ctx.host.locale)}`),
        source.detail ? h.createElement("div", { className: "wma-warning" }, source.detail) : null,
        h.createElement("ul", { className: "wma-model-list" }, ...source.models.map((model) => h.createElement(
          "li", { key: model.id, title: model.description ?? model.id },
          h.createElement("span", { className: "wma-model-name" }, model.name || model.id),
          model.name && model.name !== model.id ? h.createElement("code", null, model.id) : null,
        ))),
      )),
    ));

    return h.createElement("div", { className: "wma-panel" },
      h.createElement("header", { className: "wma-header" },
        h.createElement("h2", null, t.title),
        state.busy ? h.createElement("span", { className: "wma-meta" }, t.loading) : null,
      ),
      h.createElement("section", { className: "wma-card" },
        h.createElement("h3", null, t.windowTitle),
        h.createElement("dl", { className: "wma-bounds" },
          h.createElement("dt", null, t.current), h.createElement("dd", null, boundsText(state.currentBounds)),
          h.createElement("dt", null, t.expected), h.createElement("dd", null, boundsText(state.expectedBounds)),
        ),
        h.createElement("div", { className: "wma-actions" },
          button(h, t.sampleWechat, () => void store.sampleWechat()),
          button(h, t.apply, () => void store.applyExpected(), true),
          button(h, t.saveExpected, () => void store.saveCurrentAsExpected()),
          button(h, t.reset, () => void store.reset(), false, t.suggested),
        ),
        h.createElement("label", { className: "wma-check" },
          h.createElement("input", {
            type: "checkbox",
            checked: state.autoRestore,
            onChange: (event: { target: { checked: boolean } }) => void store.setAutoRestore(event.target.checked),
          }),
          t.autoRestore,
        ),
      ),
      state.lastError ? h.createElement("div", { className: "wma-error", role: "alert" }, `${t.error}: ${state.lastError}`) : null,
      h.createElement("section", { className: "wma-card" },
        h.createElement("div", { className: "wma-section-head" },
          h.createElement("h3", null, `${t.modelsTitle} (${modelCount})`),
          button(h, t.refresh, () => void store.refreshModels(true)),
        ),
        h.createElement("p", { className: "wma-notice" }, t.availabilityNotice),
        h.createElement("p", { className: "wma-notice" }, t.authoritativeNotice),
        ...state.catalogErrors.map((message, index) => h.createElement("div", { className: "wma-warning", key: `${index}:${message}` }, `${t.errorsTitle}: ${message}`)),
        state.groups.length === 0 && !state.busy ? h.createElement("div", { className: "wma-empty" }, t.noModels) : null,
        ...groupRows,
      ),
    );
  };
}

export function makeStatus(ctx: PluginContext, store: AssistantStore, t: Copy) {
  const h = ctx.react;
  return function StatusItem() {
    const state = h.useSyncExternalStore(store.subscribe, store.getSnapshot);
    const count = state.groups.reduce((sum, group) => sum + group.sources.reduce((inner, source) => inner + source.models.length, 0), 0);
    const text = `${state.autoRestore ? `${t.statusAuto} · ` : ""}${count} ${t.statusModels}`;
    return h.createElement("button", {
      type: "button",
      className: "wma-status",
      title: t.settings,
      onClick: () => ctx.ui.openSettings("window-model-assistant"),
    }, text);
  };
}
