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

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export const CATEGORY_ICONS: Record<Category, string> = {
  'ai-builders': '🤖',
  'tech':        '💻',
  'economy':     '📊',
  'news':        '📰',
  'sports':      '⚽',
  'qa-testing':  '🧪',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  'ai-builders': '#7C3AED',
  'tech': '#0891B2',
  'economy': '#16A34A',
  'news': '#EA580C',
  'sports': '#DB2777',
  'qa-testing': '#2563EB',
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
  michaeljburry: { name: 'Michael Burry',  firm: 'Scion Asset Mgmt', color: '#ef4444' },
  BillAckman:    { name: 'Bill Ackman',    firm: 'Pershing Square',   color: '#3b82f6' },
  CathieDWood:   { name: 'Cathie Wood',   firm: 'ARK Invest',        color: '#8b5cf6' },
  // Druckenmiller אין לו חשבון X פעיל — להוסיף handle כשיימצא
};

// ---------------------------------------------------------------------------
// Autonomous editorial agent — mirrors supabase/migrations/003_editorial_agent.sql
// ---------------------------------------------------------------------------

// Snapshot of a source article cited by the agent (survives `articles` pruning).
export interface AgentSourceRef {
  title_he: string;
  url: string;
  source: string;
  category: string;
}

// A candidate story the agent weighed before choosing its lead story.
export interface AgentCandidate {
  title_he: string;
  url: string;
  source: string;
  category: string;
  note: string;
}

// One published (or draft) opinion column written by the agent.
export interface AgentColumn {
  id: string;
  run_id: string;
  title_he: string;
  body_he: string;
  source_refs: AgentSourceRef[];
  category: string | null;
  model: string | null;
  created_at: string;
  published: boolean;
}

// Per-run transparency log: candidates considered + reasoning, in Hebrew.
export interface AgentDecisionLog {
  id: string;
  run_id: string;
  candidates_considered: AgentCandidate[];
  chosen: AgentSourceRef | null;
  reasoning_he: string | null;
  created_at: string;
}
