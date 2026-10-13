/**
 * A failed retention sweep reaches the user as a notification, so the body must be a phrase the
 * dictionary owns. The backend sends a stable code, never its error text: a driver message can
 * name tables and paths, and none of that may reach a system notification.
 */

/** Codes `clipboard_monitor` emits. Anything else falls back to the generic message. */
const DETAIL_KEYS: Record<string, string> = {
  settings_unreadable: "overlay.msg.retention-settings-unreadable",
  delete_failed: "overlay.msg.retention-delete-failed",
};

/** Dictionary key for the body of a retention-failure notification. */
export function retentionDetailKey(code: string): string {
  return DETAIL_KEYS[code] ?? "overlay.msg.retention-failed";
}

/**
 * A sweep that stays broken repeats every minute, and a notification a minute for the life of a
 * menu-bar app is noise rather than a warning. The clock runs from the last notification, so a
 * fault that returns after an hour of health still reaches the user.
 */
export const RETENTION_NOTICE_INTERVAL_MS = 3_600_000;

/** True when `code` is due for a notification; records the time when it is. */
export function claimRetentionNotice(
  notifiedAt: Map<string, number>,
  code: string,
  now: number,
): boolean {
  const last = notifiedAt.get(code);
  if (last !== undefined && now - last < RETENTION_NOTICE_INTERVAL_MS) return false;
  notifiedAt.set(code, now);
  return true;
}
