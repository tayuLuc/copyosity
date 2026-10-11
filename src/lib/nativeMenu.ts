/**
 * Native macOS application menu strings.
 *
 * The menu itself lives in Rust (`src-tauri/src/app_menu.rs`) and cannot read the Svelte store, so
 * the webview resolves the strings from `src/lib/i18n/dict.ts` and pushes them to the core. The
 * dictionary stays the only place these translations exist.
 *
 * This module is deliberately outside `src/lib/i18n/`: `usage.test.ts` skips that directory, and the
 * dictionary keys below must be visible to it as real usage.
 */

export interface NativeMenuLabels {
  about: string;
  settings: string;
  quit: string;
  edit: string;
  window: string;
  help: string;
  docs: string;
}

const MENU_LABEL_KEYS: Record<keyof NativeMenuLabels, string> = {
  about: "menu.app.about",
  settings: "menu.app.settings",
  quit: "menu.app.quit",
  edit: "menu.edit",
  window: "menu.window",
  help: "menu.help",
  docs: "menu.help.docs",
};

const MENU_LABEL_FIELDS = Object.keys(MENU_LABEL_KEYS) as (keyof NativeMenuLabels)[];

/** Resolve the menu strings with the caller's translator and push them into the Rust core. */
export function pushNativeMenuLabels(translate: (key: string) => string): void {
  const labels = {} as NativeMenuLabels;
  for (const field of MENU_LABEL_FIELDS) {
    labels[field] = translate(MENU_LABEL_KEYS[field]);
  }
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("set_native_menu_labels", { labels }))
    .catch(() => undefined);
}
