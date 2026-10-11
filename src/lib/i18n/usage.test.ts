import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { dict } from "./dict.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;
const SKIP = ["node_modules", ".svelte-kit", "target", "dist", "i18n"];

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SKIP.some((skip) => path.includes(`/${skip}`))) continue;
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(svelte|ts)$/.test(entry)) out.push(path);
  }
  return out;
}

test("every dictionary key is used somewhere", () => {
  const corpus = sources(join(ROOT, "src"))
    .concat(sources(join(ROOT, "src-tauri", "src")))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const unused = Object.keys(dict.en).filter(
    (key) =>
      !corpus.includes(`"${key}"`) &&
      !corpus.includes(`\`${key}\``) &&
      !corpus.includes(`'${key}'`),
  );
  assert.deepEqual(unused, []);
});
