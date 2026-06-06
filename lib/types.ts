export type Category = 'ai-builders' | 'tech' | 'economy' | 'news' | 'sports';
export type Region = 'israel' | 'world';

export interface Article {
  id: string;
  title: string;
  title_he: string | null;
  summary_he: string;
  url: string;
  source: string;
  category: Category;
  published_at: string | null;
  fetched_at: string;
  image_url: string | null;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  'ai-builders': 'AI & Builders',
  'tech': 'Tech',
  'economy': 'Economy',
  'news': 'News',
  'sports': 'Sports',
};

export const CATEGORY_ICONS: Record<Category, string> = {
  'ai-builders': '🤖',
  'tech':        '💻',
  'economy':     '📊',
  'news':        '📰',
  'sports':      '⚽',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  'ai-builders': '#A855F7',
  'tech': '#06B6D4',
  'economy': '#10B981',
  'news': '#F97316',
  'sports': '#EC4899',
};

// RSS source definition
export interface RssSource {
  url: string;
  name: string;
  category: Category;
  region: Region;
}
