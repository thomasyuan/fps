// Generates versions/index.html from versions.json.
// Usage: node tools/build-hub.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versions = JSON.parse(readFileSync(resolve(root, 'versions.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cards = versions
  .slice()
  .sort((a, b) => (a.id < b.id ? 1 : -1))
  .map((v, i) => {
    const bullets = (v.notes || []).map((n) => `          <li>${esc(n)}</li>`).join('\n');
    return `      <article class="rel${i === 0 ? ' latest' : ''}">
        <header>
          <h2>${esc(v.name)}${i === 0 ? '<span class="badge">latest</span>' : ''}</h2>
          <span class="date">${esc(v.date)}</span>
        </header>
        <p class="summary">${esc(v.summary)}</p>
        <ul>
${bullets}
        </ul>
        <a class="play" href="${esc(v.file.split('/').slice(-2).join('/'))}">Play ${esc(v.id)}</a>
      </article>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Strike Zone - version history</title>
<style>
  *{box-sizing:border-box}
  :root{--neon:#5fe8ff;--neon-dim:rgba(95,232,255,.25)}
  body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0%,#12212e,#05080d 70%);
    color:#cfe0ec;font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:48px 20px 80px}
  .wrap{max-width:860px;margin:0 auto}
  h1{margin:0 0 6px;font-size:38px;letter-spacing:.14em;color:var(--neon);text-shadow:0 0 26px rgba(95,232,255,.45)}
  h1 span{color:#fff}
  .sub{color:#8fb0c8;font-size:14px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:26px}
  .now{display:inline-block;margin-bottom:34px;padding:12px 22px;border-radius:8px;text-decoration:none;
    border:1px solid var(--neon);background:var(--neon);color:#04121a;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
  .now:hover{background:#8ff2ff;box-shadow:0 0 22px rgba(95,232,255,.5)}
  .rel{border:1px solid var(--neon-dim);border-radius:12px;background:rgba(8,15,23,.72);
    padding:22px 26px;margin-bottom:20px;box-shadow:0 12px 40px rgba(0,0,0,.45)}
  .rel.latest{border-color:rgba(95,232,255,.55)}
  .rel header{display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap}
  .rel h2{margin:0;font-size:20px;letter-spacing:.1em;color:#eaf7ff}
  .badge{margin-left:10px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#04121a;
    background:var(--neon);border-radius:4px;padding:2px 7px;vertical-align:middle}
  .date{font:12px/1 Consolas,monospace;color:#6f8ba0;letter-spacing:.1em}
  .summary{margin:10px 0 12px;color:#a9c4d8}
  ul{margin:0 0 16px;padding-left:20px;color:#93aec2;font-size:14.5px}
  li{margin:4px 0}
  .play{display:inline-block;text-decoration:none;color:var(--neon);border:1px solid var(--neon-dim);
    border-radius:6px;padding:8px 16px;font-size:13px;letter-spacing:.14em;text-transform:uppercase}
  .play:hover{background:rgba(95,232,255,.12);border-color:var(--neon)}
  footer{margin-top:34px;color:#5f788c;font-size:12.5px;letter-spacing:.08em}
  footer a{color:#7d97ab}
</style>
</head>
<body>
  <div class="wrap">
    <h1>STRIKE <span>ZONE</span></h1>
    <div class="sub">three.js arena shooter &middot; version history</div>
    <a class="now" href="../index.html">Play the latest build</a>
${cards}
    <footer>
      Every build is a single self-contained HTML file. Older versions stay playable. &middot;
      <a href="../index.html">latest</a>
    </footer>
  </div>
</body>
</html>
`;

writeFileSync(resolve(root, 'versions/index.html'), html);
console.log('wrote versions/index.html (' + versions.length + ' releases)');
