export type QuickSelectEntry = { id: number; content_type: string };

export const QUICK_SELECT_MAX = 9;

const PASTEABLE_TYPES = new Set(["text", "image"]);

export function quickSelectDigit(
  key: string,
  opts: { searchFocused: boolean; typingInField: boolean; hasModifier: boolean },
): number | null {
  if (opts.searchFocused || opts.typingInField || opts.hasModifier) return null;
  if (key.length !== 1 || key < "1" || key > "9") return null;
  return key.charCodeAt(0) - 48;
}

export function entryIdForDigit(
  digit: number,
  entries: readonly QuickSelectEntry[],
): number | null {
  if (digit < 1 || digit > QUICK_SELECT_MAX) return null;
  const entry = entries[digit - 1];
  if (!entry || !PASTEABLE_TYPES.has(entry.content_type)) return null;
  return entry.id;
}

export function badgeDigitForIndex(index: number): number | null {
  return index >= 0 && index < QUICK_SELECT_MAX ? index + 1 : null;
}
