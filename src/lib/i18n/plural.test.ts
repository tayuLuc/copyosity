import assert from "node:assert/strict";
import { test } from "node:test";

import { dict } from "./dict.ts";
import type { LocaleCode } from "./index.ts";
import { PLURAL_INDEX, setLocale, trp } from "./index.ts";

const FORMS: Record<string, number> = { ru: 3, en: 2, de: 2, es: 2, fr: 2, zh: 1, ja: 1 };
const PLURAL_KEYS = Object.keys(dict.en).filter((key) => dict.en[key].includes("|"));

test("slavic rule picks one, few and many", () => {
  const pick = PLURAL_INDEX.ru;
  assert.equal(pick(1), 0);
  assert.equal(pick(21), 0);
  assert.equal(pick(101), 0);
  assert.equal(pick(2), 1);
  assert.equal(pick(4), 1);
  assert.equal(pick(104), 1);
  assert.equal(pick(5), 2);
  assert.equal(pick(11), 2);
  assert.equal(pick(111), 2);
  assert.equal(pick(0), 2);
});

test("germanic rule picks singular and plural", () => {
  for (const code of ["en", "de", "es", "fr"] as LocaleCode[]) {
    assert.equal(PLURAL_INDEX[code](1), 0, code);
    assert.equal(PLURAL_INDEX[code](2), 1, code);
    assert.equal(PLURAL_INDEX[code](11), 1, code);
  }
});

test("analytic locales keep a single form", () => {
  for (const code of ["zh", "ja"] as LocaleCode[]) {
    assert.equal(PLURAL_INDEX[code](1), 0, code);
    assert.equal(PLURAL_INDEX[code](7), 0, code);
  }
});

test("plural keys declare the forms their locale needs", () => {
  assert.ok(PLURAL_KEYS.length > 0, "нет ни одного ключа с формами");
  for (const [code, forms] of Object.entries(FORMS)) {
    for (const key of PLURAL_KEYS) {
      assert.equal(dict[code as LocaleCode][key].split("|").length, forms, `${code} ${key}`);
    }
  }
});

test("trp picks the russian form the count asks for", () => {
  setLocale("ru");
  const deleted = "destructive.msg.items-deleted";
  assert.match(trp(deleted, 1), /^элемент будет/);
  assert.match(trp(deleted, 21), /^элемент будет/);
  assert.match(trp(deleted, 3), /^элемента будут/);
  assert.match(trp(deleted, 11), /^элементов будут/);
  assert.match(trp(deleted, 104), /^элемента будут/);
  assert.notEqual(trp(deleted, 2), trp(deleted, 5));
  setLocale("en");
});
