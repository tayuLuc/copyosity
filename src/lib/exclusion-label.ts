/** Visible copy for resolved app names (buttons, list rows, success notices). */

import { tr } from "./i18n/index.ts";

function formatAppNameForLabel(appName: string): string {
  const trimmed = appName.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Overlay — visible button / status copy (section context implies clipboard). */
export function excludeFromHistoryLabel(appName: string): string {
  return tr("exclusion.text.exclude-app-from-history", {
    app: formatAppNameForLabel(appName),
  });
}

/** Settings active-app row — context from `ExcludableAppCandidate.source`. */
export function excludableCandidateMetaLabel(source: "remembered" | "frontmost"): string {
  return source === "frontmost" ? tr("exclusion.text.active-app") : tr("exclusion.text.recent-app");
}

/** Settings list row — compact visible label. */
export function excludeListAddLabel(): string {
  return tr("exclusion.text.add");
}

export function excludeListRemoveLabel(): string {
  return tr("collections.title.remove");
}

/** Settings row actions — full meaning for aria-label / title. */
export function excludeFromClipboardHistoryAriaLabel(appName: string): string {
  return tr("exclusion.text.exclude-app-from-clipboard", { app: formatAppNameForLabel(appName) });
}

export function allowInClipboardHistoryAriaLabel(appName: string): string {
  return tr("exclusion.text.allow-app-in-clipboard", { app: formatAppNameForLabel(appName) });
}

/** Overlay status when an app is already excluded from capture. */
export function alreadyExcludedFromHistoryLabel(appName: string): string {
  return tr("exclusion.msg.app-excluded-from-history", { app: formatAppNameForLabel(appName) });
}

export function excludedFromHistoryNotice(appName: string): string {
  return tr("exclusion.msg.app-excluded-from-history", { app: formatAppNameForLabel(appName) });
}

/** Settings — app is already on the exclusion list. */
export function alreadyExcludedFromHistoryNotice(appName: string): string {
  return tr("exclusion.msg.app-is-already-excluded", { app: formatAppNameForLabel(appName) });
}

export function allowedInHistoryNotice(appName: string): string {
  return tr("exclusion.msg.app-allowed-in-history", { app: formatAppNameForLabel(appName) });
}

/** Settings — label for the native app picker row (keep in sync with Settings UI). */
export function chooseApplicationActionLabel(): string {
  return tr("exclusion.text.choose-application");
}

/** Settings — app name could not be resolved (HIG-style inline warning). */
export function appNotFoundNotice(appName: string): string {
  return tr("exclusion.msg.no-app-named-name", {
    name: appName.trim(),
    action: chooseApplicationActionLabel(),
  });
}

/** Settings — generic add-by-name failure with the entered app name. */
export function couldNotAddExcludedAppNotice(appName: string): string {
  return tr("exclusion.msg.could-not-add-app", { app: appName.trim() });
}

/** Settings — add via native picker failed without a resolved app name. */
export function couldNotAddSelectedAppNotice(): string {
  return tr("exclusion.msg.could-not-add-the");
}

export function invokeErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    if ("message" in err && typeof (err as { message: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    if ("error" in err && typeof (err as { error: unknown }).error === "string") {
      return (err as { error: string }).error;
    }
  }
  return "";
}

export function isAppNotFoundError(err: unknown): boolean {
  return invokeErrorMessage(err).includes("app_not_found:");
}

/** Settings candidate row when list and candidate are out of sync. */
export function alreadyExcludedListMetaLabel(): string {
  return tr("exclusion.msg.already-excluded");
}
