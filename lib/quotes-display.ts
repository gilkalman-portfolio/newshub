/**
 * Display-layer helpers for cleaning up investor quote text.
 *
 * Raw tweet text sometimes contains trailing t.co short links and can be
 * truncated to meaningless fragments. These helpers keep that cleanup
 * confined to rendering — they do not touch the stored data.
 */

/** Strip trailing t.co links and collapse/trim whitespace. */
export function cleanQuoteText(text: string): string {
  if (!text) return '';
  return text
    .replace(/https?:\/\/t\.co\/\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** After cleaning, require a minimum length so meaningless fragments are filtered out. */
export function isDisplayableQuote(text: string): boolean {
  return cleanQuoteText(text).length >= 25;
}
