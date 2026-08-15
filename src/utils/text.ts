/** A space that will not break, so the words either side stay together. */
const NBSP = ' ';

/**
 * Stops a line ending on a single stranded word.
 *
 * "Same numbers for all, resets Monday." wrapping so that "Monday." sits alone
 * on the second line reads as a mistake rather than as a sentence, and no
 * amount of rewriting protects against it - the same string is fine on one
 * phone and orphaned on the next. Binding the last two words means the pair
 * moves down together, so the break lands somewhere that looks deliberate.
 *
 * Two words, not more: forcing three or four onto one line can overflow a
 * narrow column, which is a worse failure than the one being fixed. A long
 * final word is left alone for the same reason - it fills a line by itself
 * and was never a widow.
 */
export function noWidow(input: string): string {
  const at = input.trimEnd().lastIndexOf(' ');
  if (at < 1) return input;
  if (input.length - at > 14) return input;
  return input.slice(0, at) + NBSP + input.slice(at + 1);
}
