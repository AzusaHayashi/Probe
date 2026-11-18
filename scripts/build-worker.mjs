import { readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const code = `// Generated from dist/index.html; do not edit directly.\nconst html = ${JSON.stringify(html)};\nexport default {\n  fetch(request) {\n    const path = new URL(request.url).pathname;\n    if (path !== '/' && path !== '/index.html') return new Response('Not found', { status: 404 });\n    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });\n  }\n};\n`;
await writeFile(new URL('../dist/worker.js', import.meta.url), code);
console.log('Built dist/worker.js from dist/index.html');
