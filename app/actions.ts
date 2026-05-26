'use server';

import { revalidatePath } from 'next/cache';

/**
 * Server Action — invalidates the Next.js page cache for all routes.
 * Called from the client-side refresh button in NewsGrid.
 */
export async function refreshNews(): Promise<{ refreshedAt: string }> {
  // Revalidate homepage and all 5 category pages
  revalidatePath('/', 'layout');
  return { refreshedAt: new Date().toISOString() };
}
