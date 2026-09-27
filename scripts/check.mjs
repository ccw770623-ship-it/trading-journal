// 部署前檢查：確認 PWA 必要檔案都存在、manifest 格式正確
// Vercel 會在部署時自動執行（npm run build）
import { readFile, access } from 'node:fs/promises';

const pub = new URL('../public/', import.meta.url);
const must = ['index.html', 'manifest.webmanifest', 'sw.js', 'assets/css/styles.css', 'assets/js/app.js', 'assets/js/firebase-config.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
let ok = true;
for (const f of must) {
  try { await access(new URL(f, pub)); } catch { console.error('缺少檔案：public/' + f); ok = false; }
}
try {
  const m = JSON.parse(await readFile(new URL('manifest.webmanifest', pub), 'utf8'));
  const sizes = (m.icons || []).map(i => i.sizes);
  const checks = [
    [m.name === '交易日誌', 'name 必須是「交易日誌」'],
    [m.display === 'standalone', 'display 必須是 standalone'],
    [m.start_url === '/', 'start_url 必須是 /'],
    [!!m.theme_color && !!m.background_color, '需要 theme_color 與 background_color'],
    [sizes.includes('192x192') && sizes.includes('512x512'), '需要 192x192 與 512x512 圖示']
  ];
  for (const [pass, msg] of checks) if (!pass) { console.error('manifest：' + msg); ok = false; }
} catch (e) { console.error('manifest.webmanifest 不是有效的 JSON：' + e.message); ok = false; }
const html = await readFile(new URL('index.html', pub), 'utf8');
if (!html.includes('rel="manifest"')) { console.error('index.html 沒有連結 manifest'); ok = false; }
try {
  const cfg = await readFile(new URL('assets/js/firebase-config.js', pub), 'utf8');
  if (/YOUR_API_KEY|YOUR_PROJECT/.test(cfg)) console.warn('提醒：firebase-config.js 還沒填入 Firebase 設定，網站會以「本機模式」運作（不會同步）。');
} catch {}
if (!ok) process.exit(1);
console.log('檢查通過：PWA 檔案齊全，public/ 可直接部署');
