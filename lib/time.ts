// Relative time formatting in Hebrew, e.g. "לפני 5 דקות".
// Tolerates null/invalid dates (returns '') — safe for optional timestamp fields.
export function relativeTimeHe(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMins = Math.floor((now - then) / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 2) return 'עכשיו';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours === 1) return 'לפני שעה';
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  return `לפני ${diffDays} ימים`;
}

// Format a date in Hebrew style, e.g. "ראשון, 26 במאי 2026".
export function formatHebrewDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
