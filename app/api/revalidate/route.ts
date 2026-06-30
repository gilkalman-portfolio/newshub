import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * GET /api/revalidate?secret=<REVALIDATE_SECRET>
 *
 * Called by the GitHub Actions fetch workflow after inserting new articles.
 * Invalidates the Next.js ISR cache so Vercel serves fresh content immediately.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');

  if (!process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'REVALIDATE_SECRET not configured' }, { status: 500 });
  }

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  // Revalidate all pages that read from Supabase
  revalidatePath('/', 'layout');
  revalidatePath('/category', 'layout');

  return NextResponse.json({ revalidated: true, paths: ['/', '/category'], at: new Date().toISOString() });
}
