import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
        assert.equal(
          tokens(value.split("|")[0]),
          tokens(dict.en[key].split("|")[0]),
          `${code}.${key} placeholders`,
        );
        assert.equal(edge(value), edge(dict.en[key]), `${code}.${key} spacing around markup`);
      }
    }
  });

  it("offers every locale code the picker can set", () => {
    for (const { code } of LOCALES) assert.ok(code in dict, `${code} has no dictionary`);
  });

  it("keeps brand and shortcut tokens wherever english has them", () => {
    const protectedTokens = [
      "⌘⇧Space",
      "⌘⇧V",
      "⌘Y",
      "/v1",
      "Copyosity",
      "Ollama",
      "FaceTime",
      "SwiftUI",
    ];
    for (const code of codes) {
      const table = dict[code as keyof typeof dict];
      for (const key of KEYS) {
        for (const token of protectedTokens) {
          if (dict.en[key].includes(token)) {
            assert.ok(table[key].includes(token), `${code}.${key} lost ${token}`);
          }
        }
      }
    }
  });

  it("keeps multi-placeholder values in english word order", () => {
    for (const code of codes) {
      const table = dict[code as keyof typeof dict];
      for (const key of KEYS) {
        const expected = dict.en[key].match(PLACEHOLDER) || [];
        if (new Set(expected).size < 2) continue;
        assert.deepEqual(
          table[key].match(PLACEHOLDER) || [],
          expected,
          `${code}.${key} reordered slots`,
        );
      }
    }
  });

  it("translates instead of echoing english", () => {
    const UNTRANSLATED = new Set([
      "AI Hub",
      "Hub",
      "IMG",
      "JSON",
      "Link",
      "Color",
      "FaceTime",
      "E-Mail",
      "Web",
      "Agent",
      "FaceTime Audio",
      "Audio",
      "Text",
      "Image",
      "Images",
      "Note",
      "Conversation",
      "Message",
      "Microphone",
      "Transcription",
      "Version",
      "General",
      "Name...",
      "Snippets",
      "Ok",
      "Esc",
      "Space",
      "Tab",
      "Copy",
      // German keeps the English spelling for the appearance option (das System).
      "System",
    ]);
    const echo = [];
    for (const code of codes) {
      const table = dict[code as keyof typeof dict];
      for (const key of KEYS) {
        if (table[key] === dict.en[key] && !UNTRANSLATED.has(table[key]))
          echo.push(`${code}.${key} = ${table[key]}`);
      }
    }
    assert.deepEqual(echo, []);
  });

  it("gives the menu-bar menu a label set for every pickable locale", () => {
    const rust = readFileSync(new URL("../../../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const body = rust.slice(rust.indexOf("fn tray_labels"), rust.indexOf("fn tray_locale"));
    for (const { code } of LOCALES) {
      if (code === "en") continue;
      assert.match(body, new RegExp(`"${code}" =>`), `tray_labels has no arm for ${code}`);
    }
  });
  it("writes french elisions with a typographic apostrophe", () => {
    const table = dict.fr;
    for (const key of KEYS) {
      assert.ok(
        !/[a-zàâçéèêëîïôûùüÿœæ]'[a-zàâçéèêëîïôûùüÿœæ]/i.test(table[key]),
        `fr.${key} uses a straight apostrophe`,
      );
    }
  });
});
