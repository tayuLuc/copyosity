import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ClipboardEntry } from "$lib/types";

import {
  badgeDigitForIndex,
  entryIdForDigit,
  QUICK_SELECT_MAX,
  quickSelectDigit,
  type QuickSelectEntry,
} from "./overlay-quick-select.ts";

const freeFocus = { searchFocused: false, typingInField: false, hasModifier: false };

function makeEntry(id: number, contentType = "text"): ClipboardEntry {
  return {
    id,
    content_type: contentType,
    text_content: `entry-${id}`,
    image_data: null,
    image_thumb: null,
    source_app: null,
    source_app_icon: null,
    content_hash: `hash-${id}`,
    char_count: null,
    created_at: "2026-01-01T00:00:00Z",
    is_pinned: false,
    collection_id: null,
    tags: [],
  };
}

describe("quickSelectDigit", () => {
  it("maps bare digit keys 1-9 to their number", () => {
    assert.equal(quickSelectDigit("1", freeFocus), 1);
    assert.equal(quickSelectDigit("9", freeFocus), 9);
  });

  it("rejects 0, letters, multi-char keys and symbols", () => {
    assert.equal(quickSelectDigit("0", freeFocus), null);
    assert.equal(quickSelectDigit("a", freeFocus), null);
    assert.equal(quickSelectDigit("Digit1", freeFocus), null);
    assert.equal(quickSelectDigit("/", freeFocus), null);
  });

  it("yields to search field and text inputs", () => {
    assert.equal(quickSelectDigit("1", { ...freeFocus, searchFocused: true }), null);
    assert.equal(quickSelectDigit("1", { ...freeFocus, typingInField: true }), null);
  });

  it("yields when a modifier is held (Cmd/Ctrl/Alt combos are not ours)", () => {
    assert.equal(quickSelectDigit("1", { ...freeFocus, hasModifier: true }), null);
  });
});

describe("entryIdForDigit", () => {
  const entries = [
    { id: 11, content_type: "text" },
    { id: 22, content_type: "image" },
    { id: 33, content_type: "file" },
  ];

  it("returns the id of the digit's entry (1-based)", () => {
    assert.equal(entryIdForDigit(1, entries), 11);
    assert.equal(entryIdForDigit(2, entries), 22);
  });

  it("returns null for empty slots", () => {
    assert.equal(entryIdForDigit(4, entries), null);
    assert.equal(entryIdForDigit(9, entries), null);
  });

  it("returns null for non-pasteable content types", () => {
    assert.equal(entryIdForDigit(3, entries), null);
  });

  it("returns null out of range", () => {
    assert.equal(entryIdForDigit(0, entries), null);
    assert.equal(entryIdForDigit(QUICK_SELECT_MAX + 1, entries), null);
  });

  it("accepts full ClipboardEntry rows, not just the structural subset", () => {
    const rows: ClipboardEntry[] = [makeEntry(101, "text"), makeEntry(102, "image")];
    const subset: QuickSelectEntry[] = rows;
    assert.equal(entryIdForDigit(1, rows), 101);
    assert.equal(entryIdForDigit(2, subset), 102);
  });

  it("ignores the fork-only smart fields when gating a slot", () => {
    const link = { ...makeEntry(201), smart_kind: "link", smart_value: "https://a.test" };
    assert.equal(entryIdForDigit(1, [link]), 201);
  });

  it("treats an empty display list as no selectable slot", () => {
    assert.equal(entryIdForDigit(1, []), null);
  });
});

describe("badgeDigitForIndex", () => {
  it("labels the first nine indexes 1-9", () => {
    assert.equal(badgeDigitForIndex(0), 1);
    assert.equal(badgeDigitForIndex(8), 9);
  });

  it("returns null beyond the first nine and for negatives", () => {
    assert.equal(badgeDigitForIndex(9), null);
    assert.equal(badgeDigitForIndex(-1), null);
  });

  it("stays in sync with QUICK_SELECT_MAX", () => {
    assert.equal(badgeDigitForIndex(QUICK_SELECT_MAX - 1), QUICK_SELECT_MAX);
    assert.equal(badgeDigitForIndex(QUICK_SELECT_MAX), null);
  });
});
