import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ConfirmMessagePart } from "./confirm.ts";
import { clearAllConfirmBody, clearUnpinnedConfirmBody } from "./destructive-actions.ts";
import { tr, trp } from "./i18n/index.ts";
import type { HistoryCounts } from "./types.ts";

const counts = (over: Partial<HistoryCounts> = {}): HistoryCounts => ({
  total: 0,
  pinned: 0,
  unpinned: 0,
  ...over,
});

/** Concatenate the text of a message part list — locale-independent. */
function text(parts: ConfirmMessagePart[]): string {
  return parts.map((p) => p.text).join("");
}

describe("clearUnpinnedConfirmBody", () => {
  it("leads with the emphasised unpinned count", () => {
    const body = clearUnpinnedConfirmBody(counts({ total: 5, pinned: 2, unpinned: 3 }));
    assert.equal(body.primary[0].emph, true);
    assert.equal(body.primary[0].text, (3).toLocaleString());
    assert.ok(text(body.primary).endsWith(trp("destructive.msg.unpinned-deleted", 3)));
    assert.equal(text(body.secondary ?? []), tr("destructive.msg.pinned-kept"));
  });

  it("uses the singular noun for one item", () => {
    const body = clearUnpinnedConfirmBody(counts({ unpinned: 1 }));
    const singular = trp("destructive.msg.unpinned-deleted", 1);
    const plural = trp("destructive.msg.unpinned-deleted", 3);
    assert.notEqual(singular, plural);
    assert.ok(text(body.primary).endsWith(singular));
  });
});

describe("clearAllConfirmBody", () => {
  it("omits the pinned note when nothing is pinned", () => {
    const body = clearAllConfirmBody(counts({ total: 4, pinned: 0, unpinned: 4 }));
    assert.equal(body.secondary, undefined);
    assert.ok(text(body.primary).endsWith(trp("destructive.msg.items-deleted", 4)));
  });

  it("calls out the pinned items when some are pinned", () => {
    const body = clearAllConfirmBody(counts({ total: 10, pinned: 3, unpinned: 7 }));
    assert.ok(body.secondary);
    assert.ok(text(body.secondary ?? []).startsWith(tr("destructive.msg.this-includes")));
    assert.ok(text(body.secondary ?? []).endsWith(trp("destructive.msg.pinned-count", 3)));
  });

  it("uses the singular pinned noun for one pinned item", () => {
    const body = clearAllConfirmBody(counts({ total: 2, pinned: 1, unpinned: 1 }));
    assert.ok(text(body.secondary ?? []).endsWith(trp("destructive.msg.pinned-count", 1)));
  });
});
