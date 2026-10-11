import type { SettingsPane } from "./settings-pane";

export type A11yNoticeStatus = "unknown" | "granted" | "missing";

export type A11yNoticeInput = {
  status: A11yNoticeStatus;
  dismissedThisSession: boolean;
  windowVisible: boolean;
};

export type A11yNoticeSession = {
  status: A11yNoticeStatus;
  dismissedThisSession: boolean;
};

export type A11yNoticeState = {
  show: boolean;
  poll: boolean;
};

export const A11Y_POLL_INTERVAL_MS = 3000;

export const A11Y_NOTICE_SETTINGS_PANE: SettingsPane = "permissions";

export function a11yNoticeStatusFromProbe(granted: boolean | null): A11yNoticeStatus {
  if (granted === null) return "unknown";
  return granted ? "granted" : "missing";
}

export function beginA11yNoticeSession(): A11yNoticeSession {
  return { status: "unknown", dismissedThisSession: false };
}

export function a11yNoticeState(input: A11yNoticeInput): A11yNoticeState {
  const engaged = input.windowVisible && !input.dismissedThisSession;
  return {
    show: engaged && input.status === "missing",
    poll: engaged && input.status !== "granted",
  };
}
