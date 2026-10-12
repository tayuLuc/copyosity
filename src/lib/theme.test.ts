import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { applyTheme, isThemeChoice, resolveTheme, THEME_CHOICES } from "./theme.ts";

// A stand-in for <html>: applyTheme only touches `dataset`, so nothing else is needed.
function fakeRoot() {
  return { dataset: {} as DOMStringMap };
}

describe("resolveTheme", () => {
  it("honours an explicit choice regardless of the OS appearance", () => {
    for (const prefersDark of [true, false]) {
      assert.equal(resolveTheme("light", prefersDark), "light");
      assert.equal(resolveTheme("dark", prefersDark), "dark");
    }
  });

  it("follows the OS only for the system choice", () => {
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("system", false), "light");
  });
});

describe("applyTheme", () => {
  // The perturbation the whole feature rests on: each stored choice must land on
  // `documentElement.dataset.theme` as a resolved light/dark value, never "system".
  it("lands every stored choice on data-theme", () => {
    const prefersDarkCases = [
      { systemPreference: "dark", expected: "dark" },
      { systemPreference: "light", expected: "light" },
    ] as const;

    for (const choice of THEME_CHOICES) {
      for (const { systemPreference, expected } of prefersDarkCases) {
        const root = fakeRoot();
        applyTheme(resolveTheme(choice, systemPreference === "dark"), root);
        assert.equal(
          root.dataset.theme,
          choice === "system" ? expected : choice,
          `${choice} under a ${systemPreference} OS`,
        );
        assert.notEqual(root.dataset.theme, "system", `${choice} leaked the raw choice`);
      }
    }
  });
});

describe("isThemeChoice", () => {
  it("accepts exactly the three offered values", () => {
    for (const choice of THEME_CHOICES) assert.equal(isThemeChoice(choice), true);
  });

  it("rejects anything else, including what a stale database row may hold", () => {
    for (const value of ["", "Light", "auto", "system ", null, undefined, 3, {}]) {
      assert.equal(isThemeChoice(value), false, JSON.stringify(value));
    }
  });
});

// tokens.css is the palette: a mistyped custom property there is invisible to every
// other gate, so the definitions are checked against their own references.
describe("tokens.css palettes", () => {
  const css = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");
  const defined = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]));
  const referenced = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));

  it("defines every custom property tokens.css references", () => {
    const missing = [...referenced].filter((name) => !defined.has(name)).toSorted();
    assert.deepEqual(missing, [], `tokens.css references undefined properties: ${missing}`);
  });

  it("resolves the dark palette from an explicit data-theme attribute", () => {
    assert.match(css, /:root\[data-theme="dark"\]\s*\{/);
  });

  it("switches color-scheme with the attribute instead of pinning it", () => {
    assert.match(css, /color-scheme:\s*light;/);
    assert.match(css, /color-scheme:\s*dark;/);
    // The old flat `color-scheme: dark` on html would pin form controls to dark.
    assert.doesNotMatch(css, /html\s*\{[^}]*color-scheme/);
  });

  it("never expresses the theme through a media query", () => {
    assert.doesNotMatch(css, /prefers-color-scheme/);
  });

  it("only overrides names the light palette also declares", () => {
    const names = (selector: string): string[] => {
      const start = css.indexOf(selector);
      assert.notEqual(start, -1, `${selector} missing`);
      const open = css.indexOf("{", start);
      const close = css.indexOf("\n}", open);
      return [...css.slice(open, close).matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
    };

    const light = new Set(names(":root {"));
    const dark = names(':root[data-theme="dark"] {');
    assert.ok(dark.length > 0, "the dark palette overrides nothing");
    assert.deepEqual(
      dark.filter((name) => !light.has(name)).toSorted(),
      [],
      "the dark palette must not invent a name the light palette lacks",
    );
  });
});
