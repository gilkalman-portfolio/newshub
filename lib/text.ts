// True when the string contains no Hebrew characters — used to force LTR
// rendering for English-only content (tweet bodies, news titles, quotes)
// so it doesn't inherit RTL from the surrounding layout.
export const isLatin = (s: string) => !/[֐-׿]/.test(s);
