import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claimRetentionNotice,
  RETENTION_NOTICE_INTERVAL_MS,
  retentionDetailKey,
} from "./retention-notice.ts";

describe("retentionDetailKey", () => {
  it("maps every code the monitor emits to its own phrase", () => {
    assert.equal(
      retentionDetailKey("settings_unreadable"),
      "overlay.msg.retention-settings-unreadable",
    );
    assert.equal(retentionDetailKey("delete_failed"), "overlay.msg.retention-delete-failed");
  });

  it("falls back to the generic message for an unknown code", () => {
    assert.equal(retentionDetailKey("no such table: settings"), "overlay.msg.retention-failed");
    assert.equal(retentionDetailKey(""), "overlay.msg.retention-failed");
  });
});

describe("claimRetentionNotice", () => {
  it("notifies the first time a code arrives", () => {
    const seen = new Map<string, number>();
    assert.equal(claimRetentionNotice(seen, "delete_failed", 1_000), true);
  });

  it("keeps a sweep that never recovers from repeating every minute", () => {
    const seen = new Map<string, number>();
    assert.equal(claimRetentionNotice(seen, "delete_failed", 0), true);
    for (let minute = 1; minute < 60; minute++) {
      assert.equal(claimRetentionNotice(seen, "delete_failed", minute * 60_000), false);
    }
  });

  it("notifies again once the hour has passed", () => {
    const seen = new Map<string, number>();
    assert.equal(claimRetentionNotice(seen, "delete_failed", 0), true);
    assert.equal(
      claimRetentionNotice(seen, "delete_failed", RETENTION_NOTICE_INTERVAL_MS - 1),
      false,
    );
    assert.equal(claimRetentionNotice(seen, "delete_failed", RETENTION_NOTICE_INTERVAL_MS), true);
  });

  it("announces a fault that returns after the window closed, not only the first one", () => {
    const seen = new Map<string, number>();
    assert.equal(claimRetentionNotice(seen, "delete_failed", 0), true);
    // Health in between is invisible to the frontend: a successful sweep emits nothing here.
    assert.equal(claimRetentionNotice(seen, "delete_failed", 4 * 3_600_000), true);
  });

  it("keeps separate codes on separate clocks", () => {
    const seen = new Map<string, number>();
    assert.equal(claimRetentionNotice(seen, "delete_failed", 0), true);
    assert.equal(claimRetentionNotice(seen, "settings_unreadable", 0), true);
    assert.equal(claimRetentionNotice(seen, "delete_failed", 0), false);
    assert.equal(claimRetentionNotice(seen, "settings_unreadable", 0), false);
  });
});
