// Preloaded via --require before tsx processes any TypeScript module.
// This runs synchronously before ALL static imports in fetch.ts / migrate.ts.
require('dotenv').config({ path: '.env.local' });
