/**
 * scripts/test-gemini.ts
 *
 * Integration test — verifies that summarizeBatch works end-to-end
 * against the real Gemini API.
 *
 * Run with:
 *   npm run test:gemini
 */

import { summarizeBatch, type BatchInput } from '../lib/gemini';

const SAMPLES: BatchInput[] = [
  {
    id: 0,
    title: 'OpenAI releases GPT-5 with major reasoning improvements',
    content:
      'OpenAI has announced GPT-5, featuring significantly improved reasoning capabilities and a new chain-of-thought approach. The model outperforms previous versions on math and coding benchmarks by a wide margin.',
    source: 'TechCrunch',
  },
  {
    id: 1,
    title: 'Israel tech sector raises $2.5B in Q1 2025',
    content:
      'Israeli tech companies raised $2.5 billion in the first quarter of 2025, according to a new IVC report. AI and cybersecurity startups led fundraising activity, accounting for over 60% of total capital raised.',
    source: 'Geektime',
  },
  {
    id: 2,
    title: 'Federal Reserve holds interest rates steady amid inflation uncertainty',
    content:
      'The Federal Reserve decided to maintain its benchmark interest rate unchanged at its latest FOMC meeting, citing continued uncertainty about inflation trends and a resilient labor market. Officials signaled they want more data before cutting.',
    source: 'Reuters Business',
  },
];

async function main(): Promise<void> {
  console.log('='.repeat(55));
  console.log('Gemini API integration test');
  console.log('='.repeat(55));
  console.log(`Model:   gemini-2.5-flash (native API)`);
  console.log(`Articles: ${SAMPLES.length}`);
  console.log('');

  const start = Date.now();
  const { results, failReasons } = await summarizeBatch(SAMPLES, 1);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nResponse time: ${elapsed}s\n`);
  console.log('─'.repeat(55));

  let passed = 0;
  let failed = 0;

  for (const article of SAMPLES) {
    const summary = results.get(article.id);

    if (
      summary &&
      typeof summary.title_he === 'string' && summary.title_he.trim() &&
      typeof summary.summary_he === 'string' && summary.summary_he.trim()
    ) {
      console.log(`✓  [${article.id}] ${article.title.slice(0, 50)}`);
      console.log(`   title_he:   ${summary.title_he}`);
      console.log(`   summary_he: ${summary.summary_he}`);
      console.log('');
      passed++;
    } else {
      const reason = failReasons.get(article.id) ?? 'unknown';
      console.error(`✗  [${article.id}] ${article.title.slice(0, 50)}`);
      console.error(`   FAILED: ${reason}`);
      console.error('');
      failed++;
    }
  }

  console.log('─'.repeat(55));
  console.log(`Result: ${passed}/${SAMPLES.length} passed${failed > 0 ? `, ${failed} FAILED` : ' ✓'}`);
  console.log('='.repeat(55));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n[test-gemini] Fatal error:', err.message);
  process.exit(1);
});
