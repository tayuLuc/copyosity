import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("../../../", import.meta.url).pathname;
const SKIP = ["node_modules", ".svelte-kit", "dist", "target", "src-tauri", "i18n"];

function components(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SKIP.some((skip) => path.includes(`/${skip}`))) continue;
    if (statSync(path).isDirectory()) components(path, out);
    else if (entry.endsWith(".svelte")) out.push(path);
  }
  return out;
}

function script(source: string): string {
  const start = source.indexOf("<script");
  if (start < 0) return "";
  const open = source.indexOf(">", start) + 1;
  return source.slice(open, source.indexOf("</script>", open));
}

function block(body: string, from: number): string {
  let depth = 0;
  for (let i = from; i < body.length; i += 1) {
    if (body[i] === "(") depth += 1;
    else if (body[i] === ")") {
      depth -= 1;
      if (depth === 0) return body.slice(from, i);
    }
  }
  return body.slice(from);
}

function legacyBlock(body: string, from: number): string {
  let depth = 0;
  for (let i = from; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(from, i + 1);
    }
  }
  return body.slice(from);
}

test("derived values never call the one-shot translator", () => {
  const stale: string[] = [];
  for (const file of components(join(ROOT, "src"))) {
    const body = script(readFileSync(file, "utf8"));
    const short = file.slice(file.indexOf("/src/") + 1);
    for (const match of body.matchAll(/\$derived(\.by)?\s*\(/g)) {
      const code = block(body, body.indexOf("(", match.index));
      const line = body.slice(0, match.index).split("\n").length;
      if (/[^a-zA-Z]trp?\(/.test(code) && !/void \$locale/.test(code))
        stale.push(`${short}:${line}`);
    }
    for (const match of body.matchAll(/\{@const[^=]*=\s*[^;]*tr\(/g)) {
      stale.push(`${short}:{@const}`);
    }
  }
  assert.deepEqual(stale, []);
});

test("prop defaults and top-level constants are not translated once", () => {
  const stale: string[] = [];
  for (const file of components(join(ROOT, "src"))) {
    const body = script(readFileSync(file, "utf8"));
    const short = file.slice(file.indexOf("/src/") + 1);
    const props = /\{([^}]*)\}\s*=\s*\$props\(\)/.exec(body);
    if (props && /[^a-zA-Z]trp?\(/.test(props[1])) stale.push(`${short}:$props default`);
    for (const line of body.split("\n")) {
      if (/^ {0,2}(export )?const [A-Za-z0-9_]+ =.*[^a-zA-Z]trp?\(/.test(line))
        stale.push(`${short}:const`);
    }
  }
  assert.deepEqual(stale, []);
});
