import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOCALES, dict } from "./dict.ts";

const KEYS = Object.keys(dict.en);
const PLACEHOLDER = /\{\w+\}/g;
const edge = (value: string) => `${/^\s/.test(value) ? "L" : ""}${/\s$/.test(value) ? "R" : ""}`;
const tokens = (value: string) => (value.match(PLACEHOLDER) || []).toSorted().join(",");

describe("i18n dictionary", () => {
  const codes = (Object.keys(dict) as string[]).filter((code) => code !== "en");

  it("covers every english key in every locale", () => {
    for (const code of codes) {
      const table = dict[code as keyof typeof dict];
      const missing = KEYS.filter((key) => !(key in table));
      const extra = Object.keys(table).filter((key) => !KEYS.includes(key));
      assert.deepEqual([missing, extra], [[], []], `${code} diverges from en`);
    }
  });

  it("keeps {placeholders} and fragment spacing identical across locales", () => {
    for (const code of codes) {
      const table = dict[code as keyof typeof dict];
      for (const key of KEYS) {
        const value = table[key];
        assert.ok(value.length > 0, `${code}.${key} is empty`);
        assert.equal(tokens(value), tokens(dict.en[key]), `${code}.${key} placeholders`);
        assert.equal(edge(value), edge(dict.en[key]), `${code}.${key} spacing around markup`);
      }
    }
  });

  it("offers every locale code the picker can set", () => {
    for (const { code } of LOCALES) assert.ok(code in dict, `${code} has no dictionary`);
  });
});
