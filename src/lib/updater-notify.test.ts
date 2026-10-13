import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * `notify()` is best-effort, and nothing in the type system stops two classes of silent failure
 * here: an un-awaited `sendNotification` rejects outside the try/catch that was written to hold
 * it, and a bare `catch {}` leaves a caller believing it was told. svelte-check flags neither, so
 * the class needs a gate.
 */

const SOURCE = readFileSync(new URL("./updater.ts", import.meta.url), "utf8");
const NOTIFY = SOURCE.slice(
  SOURCE.indexOf("export async function notify("),
  SOURCE.indexOf("export async function autoUpdateOnLaunch"),
);

test("notify awaits every send it guards", () => {
  const sends = [...NOTIFY.matchAll(/^.*sendNotification\(.*$/gm)].map((match) => match[0].trim());
  assert.ok(sends.length > 0, "notify no longer sends anything");
  for (const send of sends) assert.ok(send.startsWith("await "), `not awaited: ${send}`);
});

test("notify records a denied permission instead of returning silently", () => {
  const denied = NOTIFY.slice(NOTIFY.lastIndexOf("if (!granted)"));
  assert.match(denied, /appendUpdateLog\(/, "a denied permission is swallowed");
});

test("notify records a failed send instead of swallowing it", () => {
  assert.match(
    NOTIFY,
    /catch\s*(\([^)]*\))?\s*\{[\s\S]*?appendUpdateLog\(/,
    "the catch block drops the error",
  );
});
