import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  alreadyExcludedFromHistoryLabel,
  alreadyExcludedFromHistoryNotice,
  appNotFoundNotice,
  chooseApplicationActionLabel,
  excludeFromClipboardHistoryAriaLabel,
  excludeFromHistoryLabel,
  excludableCandidateMetaLabel,
  invokeErrorMessage,
  isAppNotFoundError,
} from "./exclusion-label.ts";
import { tr } from "./i18n/index.ts";

describe("excludeFromHistoryLabel", () => {
  it("capitalizes the app name in visible copy", () => {
    assert.equal(
      excludeFromHistoryLabel("safari"),
      tr("exclusion.text.exclude-app-from-history", { app: "Safari" }),
    );
    assert.equal(
      excludeFromHistoryLabel("  notes  "),
      tr("exclusion.text.exclude-app-from-history", { app: "Notes" }),
    );
  });
});

describe("excludableCandidateMetaLabel", () => {
  it("distinguishes frontmost vs remembered sources", () => {
    assert.equal(excludableCandidateMetaLabel("frontmost"), tr("exclusion.text.active-app"));
    assert.equal(excludableCandidateMetaLabel("remembered"), tr("exclusion.text.recent-app"));
  });
});

describe("aria labels", () => {
  it("uses clipboard history context in full labels", () => {
    assert.equal(
      excludeFromClipboardHistoryAriaLabel("chrome"),
      tr("exclusion.text.exclude-app-from-clipboard", { app: "Chrome" }),
    );
  });
});

describe("status notices", () => {
  it("formats already-excluded copy consistently", () => {
    assert.equal(
      alreadyExcludedFromHistoryLabel("mail"),
      tr("exclusion.msg.app-excluded-from-history", { app: "Mail" }),
    );
    assert.equal(
      alreadyExcludedFromHistoryNotice("mail"),
      tr("exclusion.msg.app-is-already-excluded", { app: "Mail" }),
    );
  });
});

describe("invokeErrorMessage", () => {
  it("extracts messages from common invoke error shapes", () => {
    assert.equal(invokeErrorMessage("app_not_found: Safari"), "app_not_found: Safari");
    assert.equal(invokeErrorMessage(new Error("boom")), "boom");
    assert.equal(invokeErrorMessage({ message: "nested" }), "nested");
    assert.equal(invokeErrorMessage({ error: "legacy" }), "legacy");
    assert.equal(invokeErrorMessage(null), "");
  });
});

describe("isAppNotFoundError", () => {
  it("detects app_not_found invoke failures", () => {
    assert.equal(isAppNotFoundError("app_not_found: Foo"), true);
    assert.equal(isAppNotFoundError(new Error("app_not_found: Foo")), true);
    assert.equal(isAppNotFoundError(new Error("permission denied")), false);
  });
});

describe("appNotFoundNotice", () => {
  it("includes the entered app name", () => {
    assert.match(appNotFoundNotice("Safari"), /Safari/);
    assert.ok(appNotFoundNotice("Safari").includes(chooseApplicationActionLabel()));
  });
});
