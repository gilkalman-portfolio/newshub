/**
 * lib/supabase.ts
 *
 * Two Supabase clients:
 *  1. `supabase`      — browser/anon client (uses NEXT_PUBLIC_ vars, respects RLS)
 *  2. `supabaseAdmin` — service-role client (bypasses RLS, write access, server-side only)
 *
 * Never import `supabaseAdmin` in client-side code or expose it to the browser.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// 1. Browser / anon client
//    Safe to use in Next.js components, API routes, and client bundles.
//    Respects Row Level Security (RLS) — read-only for public data.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing environment variable: NEXT_PUBLIC_SUPABASE_URL\n' +
      'Add it to your .env.local file.'
  );
}
if (!supabaseAnonKey) {
  throw new Error(
    'Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
      'Add it to your .env.local file.'
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// ---------------------------------------------------------------------------
// 2. Server / admin client (service-role key)
//    Bypasses RLS — use ONLY in server-side scripts and trusted server code.
//    NEVER import this in client components or expose it to the browser.
// ---------------------------------------------------------------------------

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  throw new Error(
    'Missing environment variable: SUPABASE_SERVICE_ROLE_KEY\n' +
      'This key bypasses RLS and must only be used server-side.\n' +
      'Add it to your .env.local file (never commit it to version control).'
  );
}

export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      // Service-role clients should not persist sessions or auto-refresh tokens.
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
