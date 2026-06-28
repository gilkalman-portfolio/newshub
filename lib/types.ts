export type Category = 'ai-builders' | 'tech' | 'economy' | 'news' | 'sports' | 'qa-testing';
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
  'qa-testing': 'QA & Testing',
};

export const CATEGORY_ICONS: Record<Category, string> = {
  'ai-builders': '🤖',
  'tech':        '💻',
  'economy':     '📊',
  'news':        '📰',
  'sports':      '⚽',
  'qa-testing':  '🧪',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  'ai-builders': '#A855F7',
  'tech': '#06B6D4',
  'economy': '#10B981',
  'news': '#F97316',
  'sports': '#EC4899',
  'qa-testing': '#3B82F6',
};

// RSS source definition
export interface RssSource {
  url: string;
  name: string;
  category: Category;
  region: Region;
}

export interface Quote {
  id: string;
  author_name: string;
  author_handle: string;
  author_firm: string | null;
  tweet_id: string | null;
  text: string;
  tweeted_at: string | null;
  fetched_at: string;
}

export const INVESTOR_CONFIG: Record<string, { name: string; firm: string; color: string }> = {
  michaeljburry:    { name: 'Michael Burry',         firm: 'Scion Asset Mgmt',    color: '#ef4444' },
  BillAckman:       { name: 'Bill Ackman',            firm: 'Pershing Square',      color: '#3b82f6' },
  CathieDWood:      { name: 'Cathie Wood',            firm: 'ARK Invest',           color: '#8b5cf6' },
  StanDruckenmiller:{ name: 'Stanley Druckenmiller',  firm: 'Duquesne Family Office', color: '#f59e0b' },
};
