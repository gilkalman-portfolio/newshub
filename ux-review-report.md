# דוח סקירת UX/UI — NewsHub

**תאריך:** 6 ביולי 2026 | **שיטה:** צילום חי עם Playwright (dev server מקומי, Desktop 1440px + Mobile 390px) + ניתוח קוד frontend + מדידות DOM חיות.
**כיסוי:** דף הבית, /stocks, /quotes, וכל 5 עמודי הקטגוריה (tech, sports, news, economy, ai-builders) בשתי הרזולוציות + מצבי 404.
**ראיות:** תיקיית `ux-review-screenshots/` (18 צילומים) + הפניות file:line.
**ביצוע:** 3 סוכני ניתוח מקבילים (Opus — ויזואלי, Sonnet — נגישות וקוד, Haiku — עקביות) + אימות ידני של כל ממצא Critical מול ה-DOM.

---

## סיכום

**ציון UX: 5.5/10** | **ציון ויזואלי: 7.5/10**

**בשורה אחת:** שפה עיצובית טובה באמת בדסקטופ עם יסודות RTL נכונים — אבל הכותרת שבורה במובייל (המכשיר העיקרי של הקהל), עמודת הציטוטים נופלת מהגריד, קליק על קטגוריית QA & Testing מדף הבית מוביל ל-404 שבור, והנגישות (ניגודיות, פוקוס, מגע) לא עומדת בתקן.

> ממצאי [דעה] אינם נספרים בציון, בהתאם לכללי הסקירה.

---

## 🔴 Critical

### C1. הכותרת העליונה שבורה במובייל — התאריך נחתך ונערם על הלוגו [אובייקטיבי]
- **תיאור:** ב-390px, `.header-center` (התאריך "יום שני, 6 ביולי 2026") נדחס לרוחב 28px, נשבר ל-4 שורות, וחלקו העליון נחתך מחוץ למסך.
- **ראיה:** `ux-review-screenshots/newshub-home-mobile-390.png` (ראש העמוד) + מדידת DOM חיה: `header-center` rect = `{x:249, y:-9, w:28, h:70}` — y שלילי = טקסט חתוך; הלוגו ב-x:277 צמוד אליו. גם `status-txt` ("60 כתבות") נשבר לשתי שורות (`w:34, h:26`).
- **תיקון מוצע:** media query ל-≤700px: להסתיר את `.header-center` או לקצר פורמט תאריך (`6.7.26`) ולתת לו שורה משלו.

### C2. עמודת QUOTES נופלת לשורה שנייה בדסקטופ — הגריד לא עודכן אחרי הוספת קטגוריה [אובייקטיבי]
- **תיאור:** `.grid` מגדיר 6 עמודות (`repeat(5, 1fr) 0.7fr`), אבל נוספה קטגוריה שישית (QA & Testing) — סה"כ 7 ילדים. עמודת הציטוטים (ה-0.7fr) נדחפת לשורה שנייה ומופיעה מתחת ל-AI & BUILDERS עם בור לבן ענק, ברוחב מלא של עמודת 1fr.
- **ראיה:** `app/globals.css:258` מול הקטגוריה החדשה ב-`lib/rss.ts:439` (`qa-testing`); צילום `ux-review-screenshots/newshub-home-desktop-1440.png` — QUOTES בתחתית ימין במקום כעמודה שביעית.
- **תיקון מוצע:** `grid-template-columns: repeat(6, 1fr) 0.7fr` (ולעדכן גם את ה-breakpoint של 1100px), או לגזור את מספר העמודות מ-`CATEGORIES.length`.

### C3. קטגוריית QA & Testing מקושרת מדף הבית — ומובילה ל-404 שבור [אובייקטיבי]
- **תיאור:** הקטגוריה `qa-testing` נוספה ל-`lib/types.ts` (label, אייקון, צבע) ול-`lib/rss.ts`, ודף הבית מקשר אליה בכותרת העמודה — אבל היא **לא נוספה** ל-`VALID_CATEGORIES` בעמוד הקטגוריה ול-`ALL_CATEGORIES` של טאבי הניווט. התוצאה: קליק על "QA & TESTING <" בדף הבית → `notFound()` → עמוד ה-404 הגנרי והשבור (ראו M9). בנוסף, הקטגוריה נעדרת מטאבי הניווט בכל עמודי הקטגוריה — אין שום דרך להגיע אליה חוץ מדף הבית.
- **ראיה:** ניווט חי ל-`/category/qa-testing` → 404 (`ux-review-screenshots/newshub-category-qa-testing-404-desktop.png`); `app/category/[slug]/page.tsx:19-25` (חסרה ב-`VALID_CATEGORIES`); `components/CategoryPage.tsx:16-22` (חסרה ב-`ALL_CATEGORIES`); `components/NewsGrid.tsx:270` (דף הבית כן מקשר).
- **שורש הבעיה:** רשימת הקטגוריות משוכפלת ב-3+ מקומות לפחות (רשימת הראוטים, רשימת הטאבים, ומספר העמודות בגריד — ראו C2). הוספת קטגוריה אחת דרשה 5 עדכונים ופספסה 3.
- **תיקון מוצע:** מקור אמת יחיד — `export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]` ב-`lib/types.ts`, ולגזור ממנו את `VALID_CATEGORIES`, את הטאבים ואת מספר עמודות הגריד.

---

## 🟠 Major

### M1. תוכן ציטוטים שבור — ציוצים קטועים וקישורי t.co גולמיים [אובייקטיבי]
- **ראיה:** `newshub-home-desktop-1440.png` — כרטיס Cathie Wood מציג רק "Gratitude us"; כרטיסי Burry מסתיימים ב-`https://t.co/...` גולמי. גם ב-`newshub-quotes-desktop-1440.png`.
- **תיקון מוצע:** סינון ציוצים קצרים מ-N תווים + הסרת/קיצור קישורי t.co לפני תצוגה (בשכבת התצוגה — לא ב-pipeline).

### M2. טקסט אנגלי מיושר לימין בתוך RTL — פיסוק נודד לצד הלא נכון [אובייקטיבי]
- **תיאור:** ציוצי StockTwits, ציטוטי משקיעים וכותרות Yahoo באנגלית טהורה יורשים `dir="rtl"` — נקודות וסימני שאלה קופצים לתחילת השורה, טיקרי `$SPY` נודדים.
- **ראיה:** `newshub-stocks-desktop-1440.png` (בלוקי STOCKTWITS וחדשות באנגלית), `newshub-quotes-desktop-1440.png`, וגם עמוד 404 (`newshub-404-mobile-390.png`: ‏".This page could not be found404").
- **תיקון מוצע:** `dir="ltr"` + `text-align: start` על כל פריט שתוכנו לטיני (זיהוי פשוט: regex על התו הראשון), כמו שכבר נעשה נכון בשדה הטיקר.

### M3. כשלי ניגודיות WCAG AA בטקסטים קטנים [אובייקטיבי]
- **ראיות (יחסי ניגודיות מחושבים):**
  - צבעי קטגוריה כטקסט 11px: `--cat-eco #16A34A` = 3.02:1, `--cat-news #EA580C` = 3.26:1, `--cat-tech #0891B2` = 3.38:1 (`app/globals.css:19-20`, נצרך ב-`.cat-label`/`.meta-source`) — סף AA לטקסט רגיל: 4.5:1.
  - `--neon #4F6EF7` כטקסט = 3.92:1 (`app/globals.css:14`; `.logo`, `.panel-cta`).
  - תג "אין נתונים": `#9CA3AF` על `#F3F4F6` = **2.31:1** (`components/StockCard.tsx:115`).
  - תג Bullish: `#16A34A` על `#DCFCE7` = 3.00:1 (`app/globals.css:1161`).
- **תיקון מוצע:** גרסת טקסט כהה לכל צבע (`color-mix(in srgb, var(--cc) 70%, black)` או טוקן `-text` ייעודי); את `#9CA3AF` להכהות ל-`#6B7280`.

### M4. אין ניהול פוקוס בפאנל הצד ואין `:focus-visible` בכלל האתר [אובייקטיבי]
- **תיאור:** הפאנל הוא `role="dialog" aria-modal="true"` אבל הפוקוס לא עובר אליו בפתיחה, אין focus trap ואין החזרת פוקוס בסגירה. בנוסף — אפס כללי `:focus`/`:focus-visible` ב-`globals.css`, כך שלניווט מקלדת אין אינדיקציה עיצובית.
- **ראיה:** `components/NewsGrid.tsx:357-379`, `components/CategoryPage.tsx:181-193`, `app/globals.css` (אין אף `:focus`).
- **תיקון מוצע:** העברת פוקוס לכפתור הסגירה בפתיחה + החזרה בסגירה; `:focus-visible { outline: 2px solid var(--neon); outline-offset: 2px; }` גלובלי.

### M5. מטרות מגע קטנות מ-44px [אובייקטיבי]
- **ראיות (כולל מדידה חיה ב-390px):** `.panel-close` ‏~22×24px (`app/globals.css:591-602`); `.stock-remove-btn` ‏~28×24px (`app/globals.css:967-977`); `.refresh-btn` נמדד חי: 21-22px גובה; `.region-btn`, `.cat-tab` ‏~26px.
- **תיקון מוצע:** `min-width/min-height: 44px` לכפתורי סגירה/הסרה; הגדלת padding אנכי לכפתורים במובייל.

### M6. StockTwits — "טוען..." נצחי כשה-fetch נכשל או ריק [אובייקטיבי]
- **תיאור:** התנאי `twits.length === 0` מציג "טוען..." לעד — גם אחרי כישלון (`catch` רק ל-console) וגם כשבאמת אין ציוצים. אין הבחנה בין שלושת המצבים.
- **ראיה:** `components/StockCard.tsx:241-248`, `app/stocks/page.tsx:87-91`.
- **תיקון מוצע:** להעביר `twitsLoading` + דגל שגיאה כ-props ולהציג טוען / אין תוצאות / שגיאה בנפרד.

### M7. רענון ידני ללא טיפול בשגיאה — unhandled rejection [אובייקטיבי]
- **ראיה:** `components/NewsGrid.tsx:97-107` — `refreshNews()` ללא try/catch; כישלון לא מציג דבר למשתמש ומשאיר "מרענן…" תלוי.
- **תיקון מוצע:** try/catch + הודעת שגיאה קצרה ליד הכפתור.

### M8. אין `<h1>` בדף הבית ובעמוד הציטוטים [אובייקטיבי]
- **ראיה:** `app/page.tsx` + `components/NewsGrid.tsx:210-233` (הלוגו הוא `span`), `app/quotes/page.tsx:58-71` — אפס כותרות סמנטיות. לעומת `CategoryPage.tsx:118` שתקין.
- **תיקון מוצע:** `<h1 className="sr-only">` או הפיכת הלוגו ל-h1. משפר גם SEO.

### M9. עמוד 404 גנרי של Next.js — אנגלית, בלי מיתוג, שבור ב-RTL [אובייקטיבי]
- **ראיה:** `ux-review-screenshots/newshub-404-mobile-390.png`; אין `app/not-found.tsx` בפרויקט.
- **תיקון מוצע:** `app/not-found.tsx` בעברית עם קישור חזרה לדף הבית.

### M10. גוף טקסט מרכזי קטן מ-16px [אובייקטיבי — לפי תקן הסקירה; WCAG לא מחייב פורמלית]
- **ראיה:** `.item-title` — הטקסט המרכזי של כל כרטיס — הוא 15px (`app/globals.css:388`); `.quote-text` 12px (`app/globals.css:502`); `.twit-body` 13px (`app/globals.css:1140`).
- **תיקון מוצע:** `.item-title` ל-16px לפחות; ציטוטים וטוויטים ל-13-14px מינימום עם line-height מוגדל.

### M11. דף הבית במובייל = גלילה של ~9,370px ללא כיווץ [דעה]
- **ראיה:** `ux-review-screenshots/newshub-home-mobile-390.png` — כל 6 הקטגוריות + ציטוטים נערמים במלואם.
- **תיקון מוצע:** במובייל — N כתבות ראשונות לקטגוריה + "עוד" (הקישור לעמוד הקטגוריה כבר קיים). Trade-off: פחות scroll depth = פחות חשיפה לקטגוריות תחתונות; אפשר לפצות בטאבים דביקים.

### M12. עמוד /quotes בדסקטופ — קיר טקסט מונוטוני [דעה]
- **ראיה:** `ux-review-screenshots/newshub-quotes-desktop-1440.png` — עשרות כרטיסים זהים ברוחב מלא, ללא קיבוץ לפי משקיע/תאריך.
- **תיקון מוצע:** קיבוץ לפי יום או משקיע + רשת 2 עמודות בדסקטופ.

---

## 🟡 Minor

| # | ממצא | ראיה | תיוג | תיקון מוצע |
|---|------|------|------|------------|
| N1 | line-height מתחת ל-1.6 לעברית: `.quote-text` 1.55, `.twit-body` 1.5 | `app/globals.css:504, 1140` | [אובייקטיבי] | להעלות ל-1.6 |
| N2 | אין `aria-current`/`aria-pressed` על טאבים ופילטרים פעילים | `components/CategoryPage.tsx:134-146`, `components/NewsGrid.tsx:240-248` | [אובייקטיבי] | להוסיף לפי מצב |
| N3 | שדה הוספת טיקר ללא label נגיש (placeholder בלבד) | `app/stocks/page.tsx:180-188` | [אובייקטיבי] | `aria-label="הוסף טיקר"` |
| N4 | בליעת שגיאה שקטה `catch {}` ב-fetchQuotes | `components/NewsGrid.tsx:183` | [אובייקטיבי] | לפחות `console.error` + דגל state |
| N5 | scroll listener מריץ setState בכל אירוע — re-render מיותר | `components/CategoryPage.tsx:71-81`, `components/NewsGrid.tsx:165-175` | [אובייקטיבי] | rAF throttle או עדכון ref ישיר (כמו ה-region-pill באותו קובץ) |
| N6 | favicon.ico חסר — 404 בקונסול בכל עמוד | לוג קונסול; אין קובץ ב-`app/`/`public/` | [אובייקטיבי] | להוסיף favicon |
| N7 | אמוג'י דקורטיבי בלי `aria-hidden` עקבי | `components/NewsGrid.tsx:275` מול `NewsItem.tsx:39` שתקין | [אובייקטיבי] | `aria-hidden="true"` בכל מקום |
| N8 | CSS פיזי במקום לוגי באתר RTL: `border-left`, `margin-left`, `text-align: right`, `right: 0` | `app/globals.css:556, 561, 796, 1247` | [אובייקטיבי] | מעבר ל-logical properties (`border-inline-start` וכו') |
| N9 | intervals ממשיכים לירות fetch גם כשהטאב מוסתר — בזבוז מכסות API (Polygon free tier) | `app/stocks/page.tsx:102-118` | [דעה] | בדיקת `document.visibilityState` לפני fetch |
| N10 | 4 משפחות פונטים נטענות; `--font-inter` לא נמצא בשימוש ב-CSS | `app/layout.tsx:5-31` | [דעה] | לבדוק ולהסיר משקלים/משפחות שלא בשימוש |
| N11 | עמודת QA & TESTING קצרה משמעותית — בור לבן בגריד | `newshub-home-desktop-1440.png` (עמודה שמאלית) | [דעה] | לאזן כמות פריטים או להגביל גובה |
| N12 | שם מקור באנגלית ב-monospace קטן — הבחנה חלשה מהתאריך | `newshub-home-desktop-1440.png` (ראש כל כרטיס) | [דעה] | חיזוק משקל/ניגודיות של שם המקור |
| N13 | מרווח לא אחיד בין מחיר לתג האחוז בכרטיסי מניות | `newshub-stocks-desktop-1440.png` | [אובייקטיבי] | gap קבוע |
| N14 | שתי מערכות צבעים מקבילות לאותן קטגוריות עם ערכים שונים: `CATEGORY_COLORS` (למשל tech `#06B6D4`) מול `--cat-*` ב-CSS (tech `#0891B2`) | `lib/types.ts:35-42` מול `app/globals.css:19-20` | [אובייקטיבי] | מקור אמת יחיד — טוקני CSS שנגזרים מ-`CATEGORY_COLORS` או להפך |

---

## ⚪ Polish

| # | ממצא | ראיה | תיקון מוצע |
|---|------|------|------------|
| P1 | צבעי bull/bear/סגול hardcoded ב-8+ מקומות במקום טוקנים | `components/StockCard.tsx:18-20, 57, 161-167`, `app/globals.css:1099-1100, 1161-1162` | טוקנים `--bull`, `--bear`, `--neutral` ב-`:root` |
| P2 | `relativeTimeHe` משוכפלת ב-6 קבצים, `formatHebrewDate` ב-3, `initials` ב-2 | `components/NewsItem.tsx:9`, `QuoteItem.tsx:9`, `StockCard.tsx:7`, `NewsGrid.tsx:68`, `CategoryPage.tsx:24`, `app/quotes/page.tsx:33` | איחוד ל-`lib/time.ts` |
| P3 | Header ממומש מחדש בכל עמוד (4 מימושים) | `app/page.tsx:62-71`, `app/stocks/page.tsx:149-176`, `app/quotes/page.tsx:58-71`, `components/CategoryPage.tsx:99-110` | `components/Header.tsx` משותף |
| P4 | עמוד /quotes בנוי כמעט כולו inline styles בניגוד לשאר האתר | `app/quotes/page.tsx:73-135` | מעבר ל-classes ב-globals.css |
| P5 | border-radius לא עקבי: 2/3/8/12/20px ללא טוקנים | `app/globals.css:103, 346, 495, 653, 854` | `--radius-sm/md/lg/pill` |
| P6 | 3 שיטות opacity שונות: rgba / hex-suffix (`+'18'`) / color-mix | `app/globals.css:15, 349`, `components/NewsGrid.tsx:408`, `CategoryPage.tsx:220` | תקנון ל-color-mix |
| P7 | `direction: rtl` inline מיותר (יורש מ-html) | `app/quotes/page.tsx:73`, `app/globals.css:1246-1247` | הסרה |
| P8 | אין fallback עברי ספציפי לפונט (רק sans-serif) | `app/globals.css:31` | הוספת `'Noto Sans Hebrew'` ל-stack |
| P9 | כרטיס מניה נעלם בלי הסבר אם fetch ראשוני נכשל (רק באנר כללי) | `app/stocks/page.tsx:205-213` | placeholder שגיאה פר-כרטיס |
| P10 | שורת מטא במובייל מבזבזת גובה — whitespace גדול בין זמן לאייקון | `newshub-home-mobile-390.png` | צמצום padding אנכי |
| P11 | אין אינדיקציה חזותית לרענון אוטומטי ברקע בעמוד המניות | `app/stocks/page.tsx:102-118` | הבהוב עדין על כרטיס שהתעדכן |

---

## חוזקות (כנות, לא מנומסות)

1. **ה-RTL הקשה נעשה נכון.** `dir="rtl"`+`lang="he"` ברמת html, מחירים/אחוזים/טיקרים ($423.70, +1.19%) מרונדרים בכיוון הנכון בתוך עברית, ו-`dir="ltr"` מכוון על שדה הטיקר — הנקודה שרוב האתרים הדו-לשוניים נכשלים בה עובדת כאן (`newshub-stocks-desktop-1440.png`, `app/stocks/page.tsx:187`).
2. **מצבי ריק (empty states) מטופלים בכל עמוד, בעקביות** — הודעה + הנחיה בכל אחד מ-5 המקומות (`app/page.tsx:59-78`, `CategoryPage.tsx:151-155`, `stocks/page.tsx:194-200`, `quotes/page.tsx:74-78`, `NewsGrid.tsx:292-305`). נדיר במוצר בגודל הזה.
3. **רשת הקטגוריות בדסקטופ מצוינת לסריקה** — עמודות צבעוניות עם כותרות ואייקונים, אוריינטציה תוך שנייה (`newshub-home-desktop-1440.png`).
4. **ארכיטקטורת Next נכונה** — הפרדת server/client נקייה, ISR (`revalidate`) בכל דפי השרת, `generateStaticParams` לקטגוריות, `suppressHydrationWarning` בדיוק איפה שצריך.
5. **מחשבה מוצרית ב-StockCard** — דרישת מינימום 3 ציוצים מתויגים לפני הצגת % סנטימנט מונעת סטטיסטיקה מטעה (`components/StockCard.tsx:65`).

---

## סדר תיקונים מוצע (ממצא אחד = branch אחד = PR אחד)

1. **C3** — קטגוריה שמובילה ל-404; התיקון (מקור אמת יחיד לקטגוריות) פותר גם את שורש C2
2. **C2** — שורת grid אחת, סיכון אפסי, אפקט ענק בדסקטופ
3. **C1** — media query לכותרת מובייל
4. **M2** — כיווניות טקסט לטיני (משפיע על stocks, quotes, 404)
5. **M6 + M7** — מצבי שגיאה
6. **M3** — ניגודיות
7. **M5** — מטרות מגע
8. **M9** — עמוד 404
9. השאר לפי הטבלאות

*תיקונים יבוצעו רק לאחר אישור מפורש, כל אחד עם צילום לפני/אחרי.*
