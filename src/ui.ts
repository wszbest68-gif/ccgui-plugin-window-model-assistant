import type { PluginContext, WindowBounds } from "./ccgui-plugin";
import type { Copy } from "./i18n";
import type { AssistantStore } from "./store";

type H = PluginContext["react"];

function boundsText(bounds: WindowBounds | null): string {
  return bounds ? `${Math.round(bounds.width)}×${Math.round(bounds.height)} @ ${Math.round(bounds.x)}, ${Math.round(bounds.y)}` : "—";
}

function formatTime(timestamp: number, locale: string): string {
  try {
    return new Date(timestamp).toLocaleString(locale, { hour12: false });
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function sourceLabel(t: Copy, source: string): string {
  if (source === "authoritative") return t.sourceAuthoritative;
  if (source === "cache") return t.sourceCache;
  return t.sourceBuiltin;
}

function button(h: H, label: string, onClick: () => void, primary = false) {
  return h.createElement("button", {
    type: "button",
    className: primary ? "wma-button wma-button-primary" : "wma-button",
    onClick,
  }, label);
}

export function makeAssistantView(ctx: PluginContext, store: AssistantStore, t: Copy) {
  const h = ctx.react;
  return function AssistantView() {
    const state = h.useSyncExternalStore(store.subscribe, store.getSnapshot);
    const modelCount = state.providers.reduce((sum, provider) => sum + provider.models.length, 0);
    const providerRows = state.providers.map((provider) => h.createElement(
      "section",
      { className: "wma-provider", key: `${provider.engine}:${provider.id}` },
      h.createElement("div", { className: "wma-provider-head" },
        h.createElement("strong", null, provider.name),
        h.createElement("span", {
          className: provider.authoritative ? "wma-badge wma-badge-ok" : "wma-badge wma-badge-warn",
        }, provider.authoritative ? t.authoritative : t.nonAuthoritative),
      ),
      h.createElement("div", { className: "wma-meta" }, `${provider.engine} · ${sourceLabel(t, provider.source)}`),
      h.createElement("div", { className: "wma-meta" }, `${t.refreshed}: ${formatTime(provider.refreshedAt, ctx.host.locale)}`),
      provider.detail ? h.createElement("div", { className: "wma-warning" }, `${t.degraded}: ${provider.detail}`) : null,
      h.createElement("ul", { className: "wma-model-list" }, ...provider.models.map((model) => h.createElement(
        "li", { key: model.id, title: model.id },
        h.createElement("span", { className: "wma-model-name" }, model.name || model.id),
        model.name && model.name !== model.id ? h.createElement("code", null, model.id) : null,
      ))),
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
          button(h, t.reset, () => void store.reset()),
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
        ...state.catalogErrors.map((message, index) => h.createElement("div", { className: "wma-warning", key: `${index}:${message}` }, message)),
        state.providers.length === 0 && !state.busy ? h.createElement("div", { className: "wma-empty" }, t.noModels) : null,
        ...providerRows,
      ),
    );
  };
}

export function makeStatus(ctx: PluginContext, store: AssistantStore, t: Copy) {
  const h = ctx.react;
  return function StatusItem() {
    const state = h.useSyncExternalStore(store.subscribe, store.getSnapshot);
    const count = state.providers.reduce((sum, provider) => sum + provider.models.length, 0);
    const text = `${state.autoRestore ? `${t.statusAuto} · ` : ""}${count} ${t.statusModels}`;
    return h.createElement("button", {
      type: "button",
      className: "wma-status",
      title: t.settings,
      onClick: () => ctx.ui.openSettings("window-model-assistant"),
    }, text);
  };
}
