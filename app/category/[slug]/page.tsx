/**
 * app/category/[slug]/page.tsx
 *
 * Category page — shows ALL recent articles for a single category.
 * URL pattern: /category/ai-builders  /category/tech  etc.
 *
 * Server component — fetches directly from Supabase, revalidates hourly.
 */

import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Article, Category } from '@/lib/types';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/types';
import CategoryPage from '@/components/CategoryPage';

export const revalidate = 3600;

const VALID_CATEGORIES: Category[] = [
  'ai-builders',
  'tech',
  'economy',
  'news',
  'sports',
];

// ---------------------------------------------------------------------------
// Static params — pre-render all 5 category pages at build time
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  return VALID_CATEGORIES.map((slug) => ({ slug }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = slug as Category;

  if (!VALID_CATEGORIES.includes(cat)) return {};

  const label = CATEGORY_LABELS[cat];
  return {
    title: `${label} | NewsHUB`,
    description: `כל הכתבות בנושא ${label} — NewsHUB`,
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchCategoryArticles(category: Category): Promise<Article[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return [];

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('category', category)
    .order('fetched_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    console.error(`[category] Supabase fetch error for "${category}":`, error?.message);
    return [];
  }

  return data as Article[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CategorySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = slug as Category;

  if (!VALID_CATEGORIES.includes(cat)) notFound();

  const articles = await fetchCategoryArticles(cat);
  const color = CATEGORY_COLORS[cat];
  const label = CATEGORY_LABELS[cat];

  return (
    <CategoryPage
      category={cat}
      label={label}
      color={color}
      articles={articles}
    />
  );
}
