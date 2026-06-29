import { NextResponse } from 'next/server';

// Called by Vercel Cron every hour — protected by CRON_SECRET
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://newshub-ruby.vercel.app';
  const res = await fetch(`${baseUrl}/api/quotes`, { method: 'POST' });
  const data = await res.json();

  return NextResponse.json(data);
}
