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

// In Node.js < 22, Supabase Realtime needs an explicit WebSocket implementation.
// We conditionally provide 'ws' in non-browser environments (scripts / server).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NodeWebSocket = typeof window === 'undefined' ? require('ws') : undefined;

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

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  // Provide ws for Node.js < 22 (no-op in browser where window is defined)
  NodeWebSocket ? { realtime: { transport: NodeWebSocket } } : {}
);

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
      persistSession: false,
      autoRefreshToken: false,
    },
    // Provide ws for Node.js < 22 (needed by Supabase Realtime client)
    ...(NodeWebSocket && { realtime: { transport: NodeWebSocket } }),
  }
);
