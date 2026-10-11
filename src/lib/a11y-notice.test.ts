import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  A11Y_NOTICE_SETTINGS_PANE,
  A11Y_POLL_INTERVAL_MS,
  a11yNoticeState,
  a11yNoticeStatusFromProbe,
  beginA11yNoticeSession,
  type A11yNoticeInput,
} from "./a11y-notice.ts";
import { isSettingsPane } from "./settings-pane.ts";

const openAndFresh: Omit<A11yNoticeInput, "status"> = {
  dismissedThisSession: false,
  windowVisible: true,
};

function notice(status: A11yNoticeInput["status"], over: Partial<A11yNoticeInput> = {}) {
  return a11yNoticeState({ ...openAndFresh, status, ...over });
}

describe("a11yNoticeStatusFromProbe", () => {
  it("maps a prompt-free probe answer to granted or missing", () => {
    assert.equal(a11yNoticeStatusFromProbe(true), "granted");
    assert.equal(a11yNoticeStatusFromProbe(false), "missing");
  });

  it("keeps an unread probe as unknown instead of guessing", () => {
    assert.equal(a11yNoticeStatusFromProbe(null), "unknown");
  });
});

describe("a11yNoticeState", () => {
  it("shows the notice when Accessibility is missing", () => {
    assert.deepEqual(notice("missing"), { show: true, poll: true });
  });

  it("stays quiet while the first probe is still in flight", () => {
    assert.deepEqual(notice("unknown"), { show: false, poll: true });
  });

  it("hides and stops polling once the grant is there", () => {
    assert.deepEqual(notice("granted"), { show: false, poll: false });
  });

  it("drops out after the user dismisses it this session", () => {
    assert.deepEqual(notice("missing", { dismissedThisSession: true }), {
      show: false,
      poll: false,
    });
  });

  it("does not render or poll while the overlay is hidden", () => {
    assert.deepEqual(notice("missing", { windowVisible: false }), {
      show: false,
      poll: false,
    });
  });

  it("keeps polling a missing grant so the notice can retire itself", () => {
    assert.equal(notice("missing").poll, true);
  });

  it("comes back on a fresh session after dismissal", () => {
    const dismissed = notice("missing", { dismissedThisSession: true });
    assert.equal(dismissed.show, false);
    assert.equal(notice("missing").show, true);
  });

  it("treats a fresh session as no cached status and no dismissal", () => {
    assert.deepEqual(beginA11yNoticeSession(), {
      status: "unknown",
      dismissedThisSession: false,
    });
  });

  it("re-probes from scratch in a fresh session even after a dismissal", () => {
    const fresh = { ...beginA11yNoticeSession(), windowVisible: true };
    assert.deepEqual(a11yNoticeState(fresh), { show: false, poll: true });
    assert.deepEqual(a11yNoticeState({ ...fresh, status: "missing" }), {
      show: true,
      poll: true,
    });
  });

  it("stops the poll the moment a re-probe flips the grant on", () => {
    const before = a11yNoticeState({ ...openAndFresh, status: "missing" });
    assert.equal(before.poll, true);
    const after = a11yNoticeState({
      ...openAndFresh,
      status: a11yNoticeStatusFromProbe(true),
    });
    assert.deepEqual(after, { show: false, poll: false });
  });
});

describe("notice contract constants", () => {
  it("polls on a three-second cadence", () => {
    assert.equal(A11Y_POLL_INTERVAL_MS, 3000);
  });

  it("points its click at a pane the settings window can actually show", () => {
    assert.ok(isSettingsPane(A11Y_NOTICE_SETTINGS_PANE));
    assert.equal(A11Y_NOTICE_SETTINGS_PANE, "permissions");
  });
});
