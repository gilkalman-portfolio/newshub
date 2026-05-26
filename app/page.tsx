import { createClient } from '@supabase/supabase-js';
import type { Article, Category } from '@/lib/types';
import NewsGrid from '@/components/NewsGrid';

export const revalidate = 3600;

const ARTICLES_PER_CATEGORY = 10; // change this to show more/fewer per category

const CATEGORIES: Category[] = ['ai-builders', 'tech', 'economy', 'news', 'sports'];

async function fetchArticles(): Promise<Record<Category, Article[]>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Return empty buckets if env vars are not set (local dev without .env.local)
  if (!url || !key) {
    return Object.fromEntries(
      CATEGORIES.map((c) => [c, [] as Article[]])
    ) as Record<Category, Article[]>;
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .order('fetched_at', { ascending: false });

  if (error || !data) {
    console.error('[page] Supabase fetch error:', error?.message);
    return Object.fromEntries(
      CATEGORIES.map((c) => [c, [] as Article[]])
    ) as Record<Category, Article[]>;
  }

  // Group by category, keep top ARTICLES_PER_CATEGORY per category
  const grouped = Object.fromEntries(
    CATEGORIES.map((c) => [c, [] as Article[]])
  ) as Record<Category, Article[]>;

  for (const article of data as Article[]) {
    const cat = article.category;
    if (grouped[cat] && grouped[cat].length < ARTICLES_PER_CATEGORY) {
      grouped[cat].push(article);
    }
  }

  return grouped;
}

export default async function HomePage() {
  const articles = await fetchArticles();

  const totalArticles = CATEGORIES.reduce(
    (sum, cat) => sum + articles[cat].length,
    0
  );

  if (totalArticles === 0) {
    return (
      <>
        <header>
          <span className="logo">NewsHUB</span>
          <span className="header-center">{formatHebrewDate(new Date())}</span>
          <div className="header-right">
            <div className="status-pill">
              <div className="status-dot err" />
              <span className="status-txt">אין נתונים</span>
            </div>
          </div>
        </header>
        <div className="empty-state">
          <p>עדיין אין כתבות — הפייפליין עוד לא רץ</p>
          <span>הרץ את הסקריפט fetch כדי לאכלס את מסד הנתונים</span>
        </div>
      </>
    );
  }

  return <NewsGrid articles={articles} />;
}

// Format today's date in Hebrew style: "ראשון, 26 במאי 2026"
function formatHebrewDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
