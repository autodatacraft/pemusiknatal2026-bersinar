import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
for (const path of ['public/index.html', 'public/app.js', 'public/sync.js', 'api/config.js', 'supabase/schema.sql']) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
}
for (const path of ['public/app.js', 'public/sync.js']) new vm.Script(readFileSync(path, 'utf8'), { filename: path });
JSON.parse(readFileSync('vercel.json', 'utf8'));
console.log('Buildless app and Vercel configuration validated.');
