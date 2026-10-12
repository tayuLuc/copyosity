// Interface appearance (light / dark / system).
//
// The store owns exactly one piece of DOM state: `data-theme` on <html>, always
// set to a RESOLVED value ("light" | "dark"). "system" is resolved here through
// matchMedia, never in CSS — a media query alone cannot express "dark while the
// OS is light", which is the whole point of the setting.
//
// Persistence mirrors $lib/i18n: the SQLite `settings` row is the source of
// truth, and a localStorage copy makes the first paint in every window correct
// before the IPC round-trip for get_app_settings lands. Settings, overlay and
// palette are separate windows, so a change is broadcast over a Tauri event the
// same way the locale is.

import { get, writable } from "svelte/store";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_CHOICES: ThemeChoice[] = ["light", "dark", "system"];

const STORAGE_KEY = "copyocity.theme";
const BROADCAST_EVENT = "ui-theme-changed";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** Collapse a choice into the two values `data-theme` can carry. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === "light") return "light";
  if (choice === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

/** The OS appearance query, or null when there is no window to ask (SSR, tests). */
function darkMedia(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  return darkMedia()?.matches ?? false;
}

function readMirror(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isThemeChoice(saved)) return saved;
  } catch {
    /* storage unavailable — the database copy still applies on the next read */
  }
  return "system";
}

function writeMirror(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* storage unavailable — theme still applies in-session and in the database */
  }
}

export const theme = writable<ThemeChoice>(readMirror());

/** Write the resolved theme onto an element's `data-theme`. Exported for tests. */
export function applyTheme(resolved: ResolvedTheme, target?: { dataset: DOMStringMap }): void {
  const el = target ?? (typeof document === "undefined" ? null : document.documentElement);
  if (el) el.dataset.theme = resolved;
}

// Every writer goes through resolve → apply, so one place decides what data-theme
// must be for a given choice and OS appearance. A derived store is deliberately not
// used here: while it has a subscriber it serves a cached value, which goes stale
// the moment the OS appearance changes without the choice changing.
function publish(): void {
  applyTheme(resolveTheme(get(theme), systemPrefersDark()));
}

// The store is the single writer of `data-theme`; the browser cannot flip it back.
theme.subscribe(publish);

// "system" has to follow the OS while the app is running, not only at start.
function watchSystemAppearance(): void {
  const mq = darkMedia();
  if (!mq) return;
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", publish);
  }
}

watchSystemAppearance();

/** Tell every window of this app which appearance is now active. */
function broadcastTheme(choice: ThemeChoice): void {
  void import("@tauri-apps/api/event")
    .then(({ emit }) => emit(BROADCAST_EVENT, choice))
    .catch(() => undefined);
}

/** Subscribe this window to appearance changes made in any other window. */
export async function followThemeChanges(): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<ThemeChoice>(BROADCAST_EVENT, (event) => {
    if (!isThemeChoice(event.payload)) return;
    theme.set(event.payload);
    writeMirror(event.payload);
  });
}

/**
 * Apply and persist a new appearance. The caller is responsible for writing it to
 * the database; the mirror and the broadcast go out here so every window follows.
 */
export function setTheme(choice: ThemeChoice): void {
  theme.set(choice);
  // Writing the value a store already holds notifies nobody, so re-publish:
  // re-selecting the current choice must still land on data-theme.
  publish();
  writeMirror(choice);
  broadcastTheme(choice);
}

/**
 * Adopt the choice reported by the backend at start-up. Silent when it already
 * matches, so a window that boots with a fresh mirror does not rebroadcast.
 */
export function adoptTheme(choice: unknown): void {
  if (!isThemeChoice(choice)) return;
  if (get(theme) === choice) return;
  setTheme(choice);
}
