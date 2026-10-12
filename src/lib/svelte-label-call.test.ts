import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Svelte renders a bare function reference as its source text, so `{labelFn}` printed the
 * minified body instead of the label. svelte-check does not flag it, so the class needs a gate.
 */

const SRC = join(import.meta.dirname, "..");

function walk(dir: string, extensions: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path, extensions, out);
    } else if (extensions.some((ext) => path.endsWith(ext))) {
      out.push(path);
    }
  }
  return out;
}

function functionNames(): Set<string> {
  const names = new Set<string>();
  for (const path of walk(SRC, [".ts", ".svelte", ".svelte.ts"])) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

describe("svelte templates", () => {
  it("never render a function reference as visible text", () => {
    const functions = functionNames();
    const offenders: string[] = [];

    for (const path of walk(SRC, [".svelte", ".svelte.ts"])) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/\{([A-Za-z_$][\w$]*)\s*\}/g)) {
        const name = match[1];
        if (!functions.has(name)) continue;
        // `attr={fn}` passes the reference on purpose; only text position renders it.
        if (text.slice(Math.max(0, match.index - 1), match.index) === "=") continue;
        // `<Tag {prop} />` is prop shorthand, not visible text.
        const before = text.slice(0, match.index);
        if (before.lastIndexOf("<") > before.lastIndexOf(">")) continue;
        const line = text.slice(0, match.index).split("\n").length;
        offenders.push(`${path.slice(SRC.length + 1)}:${line} {${name}}`);
      }
    }

    assert.deepEqual(offenders, [], `вызов потерян: ${offenders.join(", ")}`);
  });
});
