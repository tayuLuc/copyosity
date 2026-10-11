// Minimal dependency-free i18n: a `locale` store + a reactive `t` translator.
// English is the fallback for any missing key. Persisted in localStorage so it
// applies across all windows (overlay, palette, settings) independently.

import { derived, get, writable } from "svelte/store";

import { pushNativeMenuLabels } from "../nativeMenu.ts";
import { dict, LOCALES, type LocaleCode } from "./dict.ts";

export { LOCALES, type LocaleCode };

const STORAGE_KEY = "copyosity.locale";

function isLocale(code: string): code is LocaleCode {
  return Object.prototype.hasOwnProperty.call(dict, code);
}

function initialLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLocale(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  try {
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    if (isLocale(nav)) return nav;
  } catch {
    /* no navigator */
  }
  return "en";
}

export const locale = writable<LocaleCode>(initialLocale());

/** Push the locale into the Rust core so the native menu-bar menu follows it. */
export function publishLocale(code: LocaleCode): void {
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("set_ui_locale", { locale: code }))
    .catch(() => undefined);
  // Same store value the tray menu follows, but pushed as ready strings: the native application
  // menu has no store access, and dict.ts must stay its only source of translations.
  pushNativeMenuLabels((key) => lookup(code, key));
}

/** Tell every window of this app which locale is now active. */
function broadcastLocale(code: LocaleCode): void {
  void import("@tauri-apps/api/event")
    .then(({ emit }) => emit("ui-locale-changed", code))
    .catch(() => undefined);
}

/** Subscribe this window to locale changes made in any other window. */
export async function followLocaleChanges(): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<LocaleCode>("ui-locale-changed", (event) => locale.set(event.payload));
}

export function setLocale(code: LocaleCode): void {
  locale.set(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable — locale still applies in-session */
  }
  broadcastLocale(code);
  publishLocale(code);
}

function lookup(code: LocaleCode, key: string): string {
  return dict[code]?.[key] ?? dict.en[key] ?? key;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

function applyParams(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let out = text;
  for (const [name, value] of Object.entries(params)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

/** Grammatical number → index into the `|`-separated forms of a dictionary value. */
export const PLURAL_INDEX: Record<LocaleCode, (count: number) => number> = {
  en: (count) => (count === 1 ? 0 : 1),
  de: (count) => (count === 1 ? 0 : 1),
  es: (count) => (count === 1 ? 0 : 1),
  fr: (count) => (count === 1 ? 0 : 1),
  ru: (count) =>
    count % 10 === 1 && count % 100 !== 11
      ? 0
      : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
        ? 1
        : 2,
  zh: () => 0,
  ja: () => 0,
};

function translate(
  code: LocaleCode,
  key: string,
  params?: Record<string, string | number>,
): string {
  return applyParams(lookup(code, key), params);
}

/** Reactive translator: `$t("key")` re-renders when the locale changes. */
export const t = derived<typeof locale, Translate>(locale, ($locale) => {
  return (key: string, params?: Record<string, string | number>) => translate($locale, key, params);
});

/** One-shot translator for imperative code paths (status strings, toasts). */
export function tr(key: string, params?: Record<string, string | number>): string {
  return translate(get(locale), key, params);
}

/** The active locale code for callers that cannot subscribe to the store. */
export function currentLocale(): LocaleCode {
  return get(locale);
}

/**
 * Count-aware translator for keys whose value holds `|`-separated plural forms.
 * Forms beyond the locale's grammatical number are ignored, so one-form locales
 * store a single string.
 */
export function trp(key: string, count: number, params?: Record<string, string | number>): string {
  const code = get(locale);
  const forms = lookup(code, key).split("|");
  const index = Math.min(PLURAL_INDEX[code](count), forms.length - 1);
  return applyParams(forms[index], { count, ...params });
}
