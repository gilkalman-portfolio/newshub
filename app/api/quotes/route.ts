import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { Quote } from '@/lib/types';
import { INVESTOR_CONFIG } from '@/lib/types';

// GET — return stored quotes from Supabase
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') ?? '20', 10);

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json([] as Quote[]);

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .order('tweeted_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[quotes] GET error:', error.message);
    return NextResponse.json([] as Quote[]);
  }

  return NextResponse.json(data as Quote[]);
}

// POST — fetch latest tweets from X API and upsert into Supabase
// Call this from a cron or manually: POST /api/quotes
export async function POST() {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return NextResponse.json({ error: 'X_BEARER_TOKEN not set' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const handles  = Object.keys(INVESTOR_CONFIG);
  let totalInserted = 0;

  for (const handle of handles) {
    try {
      // 1. Resolve user ID from handle
      const userRes = await fetch(
        `https://api.twitter.com/2/users/by/username/${handle}`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      );
      if (!userRes.ok) {
        console.error(`[quotes] user lookup failed for @${handle}:`, await userRes.text());
        continue;
      }
      const { data: userData } = await userRes.json();
      const userId: string = userData.id;

      // 2. Fetch recent tweets (max 5 per user)
      const tweetsRes = await fetch(
        `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at&exclude=retweets,replies`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      );
      if (!tweetsRes.ok) {
        console.error(`[quotes] tweets fetch failed for @${handle}:`, await tweetsRes.text());
        continue;
      }
      const { data: tweets } = await tweetsRes.json();
      if (!tweets?.length) continue;

      const config = INVESTOR_CONFIG[handle];
      const rows = tweets.map((t: { id: string; text: string; created_at?: string }) => ({
        author_name:   config.name,
        author_handle: handle,
        author_firm:   config.firm,
        tweet_id:      t.id,
        text:          t.text,
        tweeted_at:    t.created_at ?? null,
      }));

      // 3. Upsert — skip duplicates by tweet_id
      const { error } = await supabase
        .from('quotes')
        .upsert(rows, { onConflict: 'tweet_id', ignoreDuplicates: true });

      if (error) console.error(`[quotes] upsert error for @${handle}:`, error.message);
      else totalInserted += rows.length;

    } catch (err) {
      console.error(`[quotes] unexpected error for @${handle}:`, err);
    }
  }

  return NextResponse.json({ ok: true, inserted: totalInserted });
}
