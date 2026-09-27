import { firebaseConfig } from './firebase-config.js';
// Firebase 程式庫只在有設定時才動態載入（見 initBackend），本機模式完全不需要網路
const FB_VER = '10.12.2';
let initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, getDoc, onSnapshot;
async function loadFirebase(){
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [a, au, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  ({ initializeApp } = a);
  ({ getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = au);
  ({ initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, getDoc, onSnapshot } = fs);
}

/*
 * 交易日誌 主程式
 * 純前端，不需要任何框架或建置工具。
 * 區段索引（搜尋「=====」即可跳轉）：
 *   常數、狀態、工具、計算、儲存（localStorage）、導覽與路由、共用元件、
 *   總覽、交易列表、表單（三步驟：進場／風控／復盤）、K 線圖與標註、
 *   詳情、分析、設定、PWA、啟動
 * 資料：登入 Google 後存在 Firebase Firestore（跨裝置同步）；
 *       未設定 Firebase 或選擇不登入時，存在瀏覽器 localStorage。
 */
(function(){
'use strict';

/* ================= 常數 ================= */
const DEFAULT_PATTERNS = ['頭肩底','頭肩頂','W底（雙重底）','M頭（雙重頂）','三重底','三重頂','上升三角','下降三角','對稱三角','上升旗形','下降旗形','上升楔形','下降楔形','箱型整理','杯柄'];
const DEFAULT_SYMBOLS = [
  {sym:'ES', pv:50, mode:'fixed', fee:4.5}, {sym:'MES', pv:5, mode:'fixed', fee:1.5},
  {sym:'NQ', pv:20, mode:'fixed', fee:4.5}, {sym:'MNQ', pv:2, mode:'fixed', fee:1.5},
  {sym:'BTC', pv:1, mode:'pct', fee:0.05}, {sym:'ETH', pv:1, mode:'pct', fee:0.05}
];
const DEFAULT_SETTINGS = {minRR:3, symbols:DEFAULT_SYMBOLS, patterns:DEFAULT_PATTERNS, theme:'light'};
const GRANVILLE = [
  ['買1','買1　均線走平或上揚，價格向上突破'], ['買2','買2　均線上揚，價格跌破後又站回'],
  ['買3','買3　價格在上揚均線上方回檔不破'], ['買4','買4　價格遠低於下彎均線，乖離過大反彈'],
  ['賣5','賣5　均線走平或下彎，價格向下跌破'], ['賣6','賣6　均線下彎，價格突破後又跌回'],
  ['賣7','賣7　價格在下彎均線下方反彈不過'], ['賣8','賣8　價格遠高於上揚均線，乖離過大回落']
];
const TL_SIGNALS = ['突破下降趨勢線','跌破上升趨勢線','回測上升趨勢線支撐','回測下降趨勢線壓力','通道下緣支撐','通道上緣壓力','突破後回測確認'];
const MA_EVENTS = ['黃金交叉','死亡交叉','回測 20MA 支撐','回測 20MA 壓力','回測 100MA 支撐','回測 100MA 壓力','站上 20MA','跌破 20MA'];
const EXIT_REASONS = ['達到目標價','觸發停損','移動停利','跌破／突破 20MA','跌破／突破 100MA','趨勢線被破','型態失敗','時間出場','手動提前出場'];
const TFS = ['1分','5分','15分','30分','1小時','4小時','日線','週線'];
const SESSIONS = ['亞洲盤','歐洲盤','美盤'];
const CONTEXTS = ['多頭','空頭','盤整','不確定'];
const STATUS_LABEL = {watch:'觀察中', open:'持倉中', closed:'已平倉', skipped:'已放棄'};
const PIP_LABELS = ['型','線','道','葛','均'];
const PIP_NAMES = ['型態','趨勢線','順著市場背景','葛蘭碧方向相符','價格在兩條均線同一側'];
const MARK_COLORS = {teal:'#48A9A6', red:'#C1666B', blue:'#125E8A'};
const ICON = {
  pointer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3l14 7-6 2-2 6z"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M9 6h9v9"/></svg>',
  hline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 12h16"/></svg>',
  text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5h14M12 5v14"/></svg>',
  undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-2"/></svg>',
  clear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  full:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/><circle cx="9" cy="12" r="1.8"/><path d="M20 17l-5-5-9 9"/></svg>'
};

/* ================= 狀態 ================= */
const S = {
  trades:[], settings:{...DEFAULT_SETTINGS}, view:'home', step:1, draft:null,
  listStatus:'all', listSym:'all', statsSym:'all',
  backend:'pending', user:null, loaded:false, online:navigator.onLine, migrating:false,
  tool:'none', color:'teal', installPrompt:null, textVal:'', saveT:null, saving:null, pendingSave:false, dirty:false,
  symEdit:null
};

/* ================= 工具 ================= */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isNum = v => v !== '' && v !== null && v !== undefined && !isNaN(+v);
const money = (n, sign=true) => { if (!isNum(n)) return '—'; const s = Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); return (n < 0 ? '−$' : (sign && n > 0 ? '+$' : '$')) + s; };
const fmtR = r => isNum(r) ? (r > 0 ? '+' : '') + (+r).toFixed(2) + 'R' : '—';
const pct = x => isNum(x) ? Math.round(x*100) + '%' : '—';
const cls = n => !isNum(n) || n === 0 ? '' : (n > 0 ? 'up' : 'down');
const pad = n => String(n).padStart(2,'0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function fmtDate(s){ if(!s) return '—'; const d = new Date(s); if(isNaN(d)) return s; return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const imgCache = new Map();
const isCloudImg = ref => String(ref||'').startsWith('img:');
const srcOf = ref => !ref ? '' : isCloudImg(ref) ? (imgCache.get(String(ref).slice(4)) || '') : String(ref);
/* 雲端圖片存在 images 集合，交易裡只記錄「img:編號」，需要時才下載 */
function imgTag(ref, alt, extra){
  const src = srcOf(ref);
  if (src) return `<img src="${esc(src)}" alt="${esc(alt)}" ${extra||''}>`;
  return `<img alt="${esc(alt)}" data-img="${esc(String(ref).slice(4))}" ${extra||''}><div class="imgph" data-ph>讀取圖片中</div>`;
}
function hydrateImages(root){
  if (!root) return;
  root.querySelectorAll('img[data-img]').forEach(async img => {
    const id = img.dataset.img; img.removeAttribute('data-img');
    const ph = img.parentElement && img.parentElement.querySelector('[data-ph]');
    try{ const data = await loadImage(id); if (data){ img.src = data; if (ph) ph.remove(); } else if (ph) ph.textContent = '找不到這張圖片'; }
    catch(e){ if (ph) ph.textContent = '圖片讀取失敗，請確認網路'; }
  });
}
const minRR = () => +S.settings.minRR > 0 ? +S.settings.minRR : 3;
const fmtPrice = x => { const a = Math.abs(x); return String(+(+x).toFixed(a < 10 ? 4 : 2)); };
const fmtRatio = x => (+x).toFixed(x >= 10 ? 1 : 2);
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('show'), 2200); }

/* ================= 計算 ================= */
function findPreset(sym){
  const u = String(sym||'').trim().toUpperCase(); if (!u) return null;
  const list = S.settings.symbols || DEFAULT_SYMBOLS;
  const exact = list.find(p => p.sym.toUpperCase() === u); if (exact) return exact;
  return list.filter(p => u.startsWith(p.sym.toUpperCase())).sort((a,b) => b.sym.length - a.sym.length)[0] || null;
}
function legacyPV(t){ return t.market === 'ES' ? 50 : t.market === 'MES' ? 5 : 1; }
function pvOf(t){ return isNum(t.pointValue) && +t.pointValue > 0 ? +t.pointValue : legacyPV(t); }
function feeOf(t){
  if (isNum(t.fee)) return +t.fee;
  const q = +t.qty || 0, e = +t.entryPrice || 0, x = isNum(t.exitPrice) ? +t.exitPrice : e, r = +t.feeRate || 0;
  if (t.feeMode === 'pct') return (e + x) * q * pvOf(t) * r / 100;
  if (t.feeMode === 'fixed') return r * q;
  if (t.market === 'ES') return 4.5 * q; if (t.market === 'MES') return 1.5 * q;
  if (t.market === 'CRYPTO') return (e + x) * q * 0.05 / 100;
  return 0;
}
function riskInfo(t){
  const e = +t.entryPrice, s = +t.stop, g = +t.target, min = minRR();
  if (![t.entryPrice, t.stop, t.target].every(isNum)) return {state:'incomplete', min};
  const long = t.side !== 'short';
  if (long ? !(s < e && e < g) : !(g < e && e < s)) return {state:'order', min, long};
  const rr = Math.abs(g - e) / Math.abs(e - s);
  const q = isNum(t.qty) ? +t.qty : 0, pv = pvOf(t);
  return {
    state: rr >= min - 1e-9 ? 'ok' : 'low', rr, min, long,
    needTarget: long ? e + min * (e - s) : e - min * (s - e),
    needStop: long ? e - (g - e) / min : e + (e - g) / min,
    riskAmt: q ? Math.abs(e - s) * q * pv : null, rewardAmt: q ? Math.abs(g - e) * q * pv : null
  };
}
function calc(t){
  const d = t.side === 'short' ? -1 : 1, m = pvOf(t), q = +t.qty || 0, e = +t.entryPrice;
  const risk = isNum(t.stop) && isNum(t.entryPrice) && q ? Math.abs(e - +t.stop) * q * m : null;
  if (t.status !== 'closed' || !isNum(t.exitPrice)) return {risk};
  const pts = (+t.exitPrice - e) * d, gross = pts * q * m, fee = feeOf(t);
  const net = gross - fee - (+t.otherFee || 0) - (+t.funding || 0);
  return {risk, pts, gross, fee, net, R: risk ? net / risk : null};
}
const ctxOf = t => t.context || t.dow || '';
function confluence(t){
  const long = t.side !== 'short', ctx = ctxOf(t);
  const g = t.granville ? parseInt(String(t.granville).replace(/\D/g,''),10) : 0;
  return [ !!t.pattern, !!t.tlSignal, long ? ctx === '多頭' : ctx === '空頭',
    long ? (g >= 1 && g <= 4) : (g >= 5 && g <= 8),
    long ? (t.pos20 === '上' && t.pos100 === '上') : (t.pos20 === '下' && t.pos100 === '下') ];
}
const confCount = t => confluence(t).filter(Boolean).length;
const pipsHTML = t => `<span class="pips" aria-label="訊號共振 ${confCount(t)} 項">${confluence(t).map((on,i)=>`<span class="${on?'lit':''}" title="${PIP_NAMES[i]}">${PIP_LABELS[i]}</span>`).join('')}</span>`;
function closedTrades(sym){
  return S.trades.filter(t => t.status === 'closed' && isNum(t.exitPrice) && (sym === 'all' || (t.symbol||'').toUpperCase() === sym))
    .sort((a,b) => String(a.exitTime||a.entryTime).localeCompare(String(b.exitTime||b.entryTime)));
}
function summary(list){
  let net=0, wins=0, losses=0, sumW=0, sumL=0, rSum=0, rN=0, peak=0, eq=0, mdd=0; const curve=[0];
  list.forEach(t => { const c = calc(t); net += c.net; eq += c.net; curve.push(eq); peak = Math.max(peak, eq); mdd = Math.max(mdd, peak - eq);
    if (c.net > 0){ wins++; sumW += c.net; } else if (c.net < 0){ losses++; sumL += c.net; }
    if (isNum(c.R)){ rSum += c.R; rN++; } });
  const n = list.length;
  return {n, net, winRate: n ? wins/n : null, avgW: wins ? sumW/wins : null, avgL: losses ? sumL/losses : null,
    payoff: wins && losses ? (sumW/wins)/Math.abs(sumL/losses) : null, pf: sumL ? sumW/Math.abs(sumL) : null,
    avgR: rN ? rSum/rN : null, mdd, curve};
}
const sortKey = t => String(t.entryTime || t.obsTime || t.createdAt || '');
const symbolsUsed = () => [...new Set(S.trades.map(t => (t.symbol||'').toUpperCase()).filter(Boolean))].sort();

/* ================= 儲存 =================
 * 兩種模式：
 *   cloud：登入 Google 後，資料存在 Firebase Firestore，手機與電腦同步
 *          users/{uid}/trades/{交易編號}   交易紀錄
 *          users/{uid}/images/{圖片編號}   K 線截圖（壓縮後的 JPEG data URL）
 *          users/{uid}/meta/settings      設定
 *   local：尚未設定 Firebase，或選擇「先不登入」時，資料存在瀏覽器 localStorage
 *          tj-trades、tj-settings（與先前版本相同）
 * 只要替換這一段，就能改用其他資料庫。
 */
const STORE_KEYS = {trades:'tj-trades', settings:'tj-settings', mode:'tj-mode'};
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
let fb = null, tradesCol = null, imagesCol = null, settingsDoc = null, unsubs = [];
const configReady = () => !!(firebaseConfig && firebaseConfig.apiKey && !/貼上|YOUR_/i.test(String(firebaseConfig.apiKey)));
const isCloud = () => S.backend === 'cloud';
function storageUsage(){
  let bytes = 0;
  try{ [STORE_KEYS.trades, STORE_KEYS.settings].forEach(k => { const v = localStorage.getItem(k); if (v) bytes += v.length * 2; }); }catch(e){}
  return bytes;
}
function setSync(){
  const el = $('#sync');
  if (isCloud()){ el.textContent = S.online ? '雲端同步' : '離線中，恢復連線後自動同步'; el.className = 'sync ' + (S.online ? 'on' : 'off'); }
  else if (S.backend === 'local'){ el.textContent = '資料只存在此裝置'; el.className = 'sync off'; }
  else { el.textContent = '讀取中'; el.className = 'sync'; }
}
window.addEventListener('online', () => { S.online = true; setSync(); });
window.addEventListener('offline', () => { S.online = false; setSync(); });
function mergeSettings(s){ const m = {...DEFAULT_SETTINGS, ...(s||{})}; if (!Array.isArray(m.symbols) || !m.symbols.length) m.symbols = DEFAULT_SYMBOLS; if (!Array.isArray(m.patterns) || !m.patterns.length) m.patterns = DEFAULT_PATTERNS; return m; }
function startLocal(){
  unsubs.forEach(u => u()); unsubs = [];
  S.backend = 'local'; S.user = null; S.loaded = true;
  S.trades = LS.get(STORE_KEYS.trades, []);
  S.settings = mergeSettings(LS.get(STORE_KEYS.settings, {}));
  applyTheme(); setSync(); render(true);
}
async function initBackend(){
  if (!configReady()){ startLocal(); return; }
  try{ await loadFirebase(); }
  catch(e){ S.backend = 'fberror'; setSync(); render(true); return; }
  try{
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    let db;
    try{ db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})}); }
    catch(e){ db = initializeFirestore(app, {}); }
    fb = {app, auth, db};
    getRedirectResult(auth).catch(() => {});
    onAuthStateChanged(auth, user => {
      unsubs.forEach(u => u()); unsubs = [];
      if (!user){
        if (LS.get(STORE_KEYS.mode, '') === 'local') startLocal();
        else { S.backend = 'login'; S.user = null; S.trades = []; setSync(); render(true); }
        return;
      }
      LS.del(STORE_KEYS.mode);
      S.user = user; S.backend = 'cloud'; S.loaded = false; S.trades = [];
      const base = doc(db, 'users', user.uid);
      tradesCol = collection(base, 'trades'); imagesCol = collection(base, 'images'); settingsDoc = doc(base, 'meta', 'settings');
      setSync(); render(true);
      unsubs.push(onSnapshot(tradesCol, snap => {
        S.trades = snap.docs.map(d => ({...d.data(), id: d.id})); S.loaded = true; render();
      }, () => toast('同步中斷，請重新整理頁面')));
      unsubs.push(onSnapshot(settingsDoc, snap => {
        S.settings = mergeSettings(snap.exists() ? snap.data() : {}); applyTheme(); render();
      }, () => {}));
    });
  }catch(e){ console.error(e); startLocal(); toast('無法連線到 Firebase，暫時使用本機資料'); }
}
async function login(){
  if (!fb){ toast('尚未設定 Firebase'); return; }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt: 'select_account'});
  try{ await signInWithPopup(fb.auth, provider); }
  catch(e){
    const c = e && e.code;
    if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(fb.auth, provider);
    else if (c === 'auth/unauthorized-domain') toast('這個網址還沒加入 Firebase 的授權網域');
    else if (c !== 'auth/popup-closed-by-user' && c !== 'auth/cancelled-popup-request') toast('登入失敗，請再試一次');
  }
}
function useLocalOnly(){ LS.set(STORE_KEYS.mode, 'local'); startLocal(); }
async function logout(){
  if (S.dirty) await flushSave();
  if (fb) await signOut(fb.auth);
}
// 本機模式：其他分頁修改資料時同步畫面
window.addEventListener('storage', e => {
  if (S.backend !== 'local') return;
  if (e.key === STORE_KEYS.trades){ S.trades = LS.get(STORE_KEYS.trades, []); if (S.view !== 'form') render(); }
  if (e.key === STORE_KEYS.settings){ S.settings = mergeSettings(LS.get(STORE_KEYS.settings, {})); applyTheme(); if (S.view !== 'form') render(); }
});
// 雲端寫入：有網路時等待伺服器確認；離線時資料先存在本機快取，恢復連線後自動上傳
async function cloudWrite(promise){ if (S.online) await promise; else promise.catch(() => {}); }
async function saveTrade(src){
  const t = JSON.parse(JSON.stringify(src));
  if (!t.id) t.id = newId();
  if (!t.createdAt) t.createdAt = new Date().toISOString();
  t.updatedAt = new Date().toISOString();
  if (isCloud()){ const data = {...t}; delete data.id; await cloudWrite(setDoc(doc(tradesCol, t.id), data)); return t.id; }
  const next = S.trades.slice();
  const i = next.findIndex(x => x.id === t.id);
  if (i >= 0) next[i] = t; else next.push(t);
  if (!LS.set(STORE_KEYS.trades, next)) { const e = new Error('storage'); e.code = 'quota_exceeded'; throw e; }
  S.trades = next;
  return t.id;
}
async function deleteTrade(id){
  if (isCloud()){
    const t = S.trades.find(x => x.id === id);
    await cloudWrite(deleteDoc(doc(tradesCol, id)));
    if (t) [t.chartEntry, t.chartExit].filter(isCloudImg).forEach(r => deleteDoc(doc(imagesCol, r.slice(4))).catch(() => {}));
    return;
  }
  const next = S.trades.filter(t => t.id !== id);
  if (!LS.set(STORE_KEYS.trades, next)) throw new Error('storage');
  S.trades = next;
}
async function saveSettings(s){
  if (isCloud()){ await cloudWrite(setDoc(settingsDoc, s)); S.settings = mergeSettings(s); return; }
  if (!LS.set(STORE_KEYS.settings, s)) throw new Error('storage');
  S.settings = mergeSettings(s);
}
const newImgId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
async function saveImage(dataUrl){
  if (!isCloud()) return dataUrl;
  const id = newImgId();
  imgCache.set(id, dataUrl);
  await cloudWrite(setDoc(doc(imagesCol, id), {data: dataUrl, createdAt: new Date().toISOString()}));
  return 'img:' + id;
}
async function loadImage(id){
  if (imgCache.has(id)) return imgCache.get(id);
  if (!imagesCol) return '';
  const snap = await getDoc(doc(imagesCol, id));
  const data = snap.exists() ? snap.data().data : '';
  if (data) imgCache.set(id, data);
  return data;
}
/* 把這台裝置 localStorage 裡的舊紀錄上傳到雲端（同一筆交易重複上傳只會覆蓋，不會變兩筆） */
const migrateFlag = () => 'tj-migrated-' + (S.user ? S.user.uid : '');
function localPendingCount(){
  if (!isCloud() || !S.user || LS.get(migrateFlag(), false)) return 0;
  return LS.get(STORE_KEYS.trades, []).length;
}
async function migrateLocal(){
  if (S.migrating) return; S.migrating = true; render(true);
  try{
    const list = LS.get(STORE_KEYS.trades, []);
    for (const src of list){
      const t = {...src};
      for (const k of ['chartEntry','chartExit']) if (t[k] && String(t[k]).startsWith('data:')) t[k] = await saveImage(t[k]);
      delete t.shots;
      const id = t.id || newId(); delete t.id;
      await cloudWrite(setDoc(doc(tradesCol, id), t));
    }
    const cloudSet = await getDoc(settingsDoc).catch(() => null);
    const localSet = LS.get(STORE_KEYS.settings, null);
    if (localSet && cloudSet && !cloudSet.exists()) await cloudWrite(setDoc(settingsDoc, localSet));
    LS.set(migrateFlag(), true);
    toast(`已上傳 ${list.length} 筆紀錄到雲端`);
  }catch(e){ toast('上傳沒有完成，請確認網路後再試一次'); }
  S.migrating = false; render(true);
}
function skipMigrate(){ LS.set(migrateFlag(), true); render(true); }
function applyTheme(){
  const th = S.settings.theme, root = document.documentElement;
  if (th === 'dark') root.setAttribute('data-theme', 'dark');
  else if (th === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', 'light');
  const dark = th === 'dark' || (th === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.getElementById('themeColor'); if (m) m.setAttribute('content', dark ? '#15343C' : '#F7ECE1');
}

/* ================= 導覽 ================= */
function blankDraft(){
  return {symbol:'', side:'long', status:'watch', obsTime: nowLocal(), context:'不確定', obsTf:'1小時', entryTf:'15分',
    feeMode:'fixed', feeRate:'', pointValue:'', marksEntry:[], marksExit:[]};
}
function normalize(t){
  const d = JSON.parse(JSON.stringify(t));
  if (!isNum(d.pointValue)){ const p = findPreset(d.symbol); d.pointValue = d.market ? legacyPV(d) : (p ? p.pv : ''); }
  if (!d.feeMode){ const p = findPreset(d.symbol); if (d.market === 'CRYPTO'){ d.feeMode = 'pct'; d.feeRate = 0.05; } else if (d.market){ d.feeMode = 'fixed'; d.feeRate = d.market === 'ES' ? 4.5 : 1.5; } else if (p){ d.feeMode = p.mode; d.feeRate = p.fee; } else d.feeMode = 'fixed'; }
  if (!d.context && d.dow) d.context = d.dow;
  if (!d.entryTf && d.tf) d.entryTf = d.tf;
  if (!d.obsTime) d.obsTime = d.entryTime || nowLocal();
  if (!Array.isArray(d.marksEntry)) d.marksEntry = [];
  if (!Array.isArray(d.marksExit)) d.marksExit = [];
  if (!d.chartEntry && Array.isArray(d.shots) && d.shots.length) d.chartEntry = d.shots[0];
  return d;
}
/* 路由：每個頁面有自己的網址，重新整理不會跑回首頁 */
const ROUTES = {home:'/', list:'/trades', form:'/new', stats:'/stats', settings:'/settings'};
const viewFromPath = p => (Object.entries(ROUTES).find(([,path]) => path === p.replace(/\/+$/,'') ) || ['home'])[0];
function syncUrl(view, replace){
  const path = ROUTES[view] || '/';
  if (location.pathname === path) return;
  try{ history[replace ? 'replaceState' : 'pushState']({view}, '', path); }catch(e){}
}
window.addEventListener('popstate', () => { const v = viewFromPath(location.pathname); if (v !== S.view) go(v, {fromHistory:true}); });
async function go(view, opts){
  opts = opts || {};
  if (!opts.fromHistory) syncUrl(view);
  if (S.view === 'form' && view !== 'form' && S.dirty) await flushSave();
  closeFullscreen();
  if (view === 'form'){
    S.draft = opts.trade ? normalize(opts.trade) : blankDraft();
    S.step = opts.step || (S.draft.status === 'open' || S.draft.status === 'closed' ? 3 : (S.draft.step || 1));
    if (S.step === 2 && !gate1(S.draft).every(g => g.ok)) S.step = 1;
    S.dirty = false; S.tool = 'none';
  }
  S.view = view;
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.view === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  render(true); window.scrollTo(0,0);
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.view); });
document.querySelector('.brand').addEventListener('click', () => go('home'));

function viewGate(){
  const icon = '<img src="/icons/icon-192.png" alt="">';
  if (S.backend === 'login') return `<div class="login">${icon}<h1>交易日誌</h1><p>用 Google 帳號登入，手機和電腦就會看到同一份紀錄。</p>
    <button class="gbtn" id="loginBtn"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.5 5.8c4.4-4 6.8-10 6.8-17.3z"/><path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.9l-8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>用 Google 登入</button>
    <button class="btn ghost" id="localBtn">先不登入，資料只存在這台裝置</button></div>`;
  if (S.backend === 'fberror') return `<div class="login">${icon}<h1>無法連線到同步服務</h1><p>第一次開啟需要網路。請確認連線後重新載入。</p>
    <button class="btn primary" onclick="location.reload()">重新載入</button><button class="btn ghost" id="localBtn">先使用這台裝置的本機資料</button></div>`;
  return `<div class="panel empty" style="margin-top:14px">讀取中</div>`;
}
function render(force){
  const app = $('#app');
  const gated = !(S.backend === 'cloud' || S.backend === 'local');
  document.body.classList.toggle('nologin', gated);
  if (gated){
    app.classList.remove('withbar'); app.innerHTML = viewGate();
    const lb = $('#loginBtn'); if (lb) lb.onclick = login;
    const lo = $('#localBtn'); if (lo) lo.onclick = () => { if (S.backend === 'fberror') startLocal(); else useLocalOnly(); };
    return;
  }
  app.classList.toggle('withbar', S.view === 'form');
  if (S.view === 'form'){ if (force) renderForm(); return; }
  if (S.view === 'settings' && !force) return;
  app.innerHTML = S.view === 'home' ? viewHome() : S.view === 'list' ? viewList() : S.view === 'stats' ? viewStats() : viewSettings();
  if (S.view === 'settings') bindSettings();
  const mu = $('#migUp'); if (mu) mu.onclick = migrateLocal;
  const ms = $('#migSkip'); if (ms) ms.onclick = skipMigrate;
}

/* ================= 共用 ================= */
function tradeRow(t){
  const c = calc(t), st = t.status || 'open', ri = riskInfo(t);
  let right;
  if (st === 'closed') right = `<span class="pnl num ${cls(c.net)}">${money(c.net)}</span><span class="r num">${fmtR(c.R)}</span>`;
  else right = `<span class="badge st-${st}">${STATUS_LABEL[st]}</span>${isNum(ri.rr) ? `<span class="r num">計畫 ${fmtRatio(ri.rr)}：1</span>` : ''}`;
  const tf = [t.obsTf, t.entryTf || t.tf].filter(Boolean).join('／');
  return `<button class="trade" data-id="${esc(t.id)}">
    <span class="side ${t.side==='short'?'short':'long'}">${t.side==='short'?'空':'多'}</span>
    <span><span class="sym">${esc(t.symbol || '未命名')}</span> <span class="meta">${esc(tf)}　${esc(fmtDate(t.entryTime || t.obsTime))}</span></span>
    <span>${right}</span>
    <span class="row2">${pipsHTML(t)}<span class="meta">${esc([t.granville, t.pattern].filter(Boolean).join('　'))}</span></span>
  </button>`;
}
document.addEventListener('click', e => { const b = e.target.closest('.trade[data-id]'); if (b) openDetail(b.dataset.id); });
function equitySVG(curve){
  const W = 640, H = 200, P = 8; if (curve.length < 2) return '';
  const min = Math.min(0, ...curve), max = Math.max(0, ...curve), span = (max - min) || 1;
  const x = i => P + i * (W - 2*P) / (curve.length - 1), y = v => P + (max - v) * (H - 2*P) / span;
  const pts = curve.map((v,i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const col = curve[curve.length-1] >= 0 ? 'var(--up-fill)' : 'var(--down-fill)';
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="資金曲線">
    <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <line x1="${P}" x2="${W-P}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 6" vector-effect="non-scaling-stroke"/>
    <polygon points="${x(0)},${y(0)} ${pts} ${x(curve.length-1)},${y(0)}" fill="url(#eqg)"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}
const emptyBlock = msg => `<div class="panel empty"><div>${msg}</div><button class="btn primary" data-go="form">新增一筆交易</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.classList.contains('brand')) go(b.dataset.go); });

/* ================= 總覽 ================= */
function viewHome(){
  if (!S.loaded) return `<div class="panel empty" style="margin-top:14px">讀取交易紀錄中</div>`;
  const pend = localPendingCount();
  const mig = pend ? `<div class="panel migrate"><h3>這台裝置有 ${pend} 筆本機紀錄</h3>
    <p>要上傳到雲端嗎？上傳後手機和電腦都看得到。本機的資料不會被刪除。</p>
    <div class="row"><button class="btn primary" id="migUp" ${S.migrating?'disabled':''}>${S.migrating?'上傳中…':'上傳到雲端'}</button><button class="btn ghost" id="migSkip" ${S.migrating?'disabled':''}>先不要</button></div></div>` : '';
  if (!S.trades.length) return mig + `<h2>歡迎使用</h2>` + emptyBlock('先上傳你正在觀察的 K 線圖，再逐步檢查條件和盈虧比。');
  return mig + viewHomeMain();
}
function viewHomeMain(){
  if (!S.trades.length) return `<h2>歡迎使用</h2>` + emptyBlock('先上傳你正在觀察的 K 線圖，再逐步檢查條件和盈虧比。');
  const list = closedTrades('all'), s = summary(list);
  const active = S.trades.filter(t => t.status === 'open' || t.status === 'watch').sort((a,b)=>sortKey(b).localeCompare(sortKey(a)));
  const skipped = S.trades.filter(t => t.status === 'skipped');
  const skippedRR = skipped.filter(t => riskInfo(t).state === 'low').length;
  const recent = S.trades.filter(t => t.status === 'closed').sort((a,b)=>sortKey(b).localeCompare(sortKey(a))).slice(0,5);
  const byConf = [0,1,2,3,4,5].map(k => ({k, s: summary(list.filter(t => confCount(t) === k))})).filter(r => r.s.n);
  return `
  <section class="hero" style="margin-top:14px">
    <div class="cap">已平倉淨損益（美元）</div>
    <div class="big num ${cls(s.net)}">${money(s.net)}</div>
    <div class="cap">${s.n} 筆已平倉，${S.trades.filter(t=>t.status==='open').length} 筆持倉中，${S.trades.filter(t=>t.status==='watch').length} 筆觀察中</div>
    ${s.n ? equitySVG(s.curve) : '<p class="muted">完成第一筆復盤後，這裡會畫出資金曲線。</p>'}
  </section>
  <div class="kpis">
    <div class="kpi"><div class="v num">${pct(s.winRate)}</div><div class="l">勝率</div></div>
    <div class="kpi"><div class="v num">${isNum(s.payoff)?s.payoff.toFixed(2):'—'}</div><div class="l">實際盈虧比</div></div>
    <div class="kpi"><div class="v num ${cls(s.avgR)}">${fmtR(s.avgR)}</div><div class="l">平均 R 倍數</div></div>
    <div class="kpi"><div class="v num down">${s.mdd ? money(-s.mdd) : '—'}</div><div class="l">最大回撤</div></div>
    <div class="kpi"><div class="v num">${skipped.length}</div><div class="l">放棄的交易${skippedRR ? `（${skippedRR} 筆盈虧比不足）` : ''}</div></div>
  </div>
  ${active.length ? `<h2>進行中</h2>${active.map(tradeRow).join('')}` : ''}
  ${byConf.length ? `<h2>訊號共振與勝率</h2><div class="panel tbl"><table><thead><tr><th>符合幾項依據</th><th>筆數</th><th>勝率</th><th>平均 R</th></tr></thead><tbody>
  ${byConf.map(r => `<tr><td>${r.k} 項</td><td class="num">${r.s.n}</td><td class="num">${pct(r.s.winRate)}<div class="bar"><i style="width:${(r.s.winRate||0)*100}%"></i></div></td><td class="num ${cls(r.s.avgR)}">${fmtR(r.s.avgR)}</td></tr>`).join('')}
  </tbody></table><p class="hint">五項依據：型態、趨勢線、順著市場背景、葛蘭碧方向相符、價格在兩條均線同一側。</p></div>` : ''}
  ${recent.length ? `<h2>最近平倉</h2>${recent.map(tradeRow).join('')}` : ''}`;
}

/* ================= 交易列表 ================= */
function segHTML(name, opts, val){
  return `<div class="seg" role="radiogroup">${opts.map(o => { const [v,l] = Array.isArray(o) ? o : [o,o];
    return `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v)===String(val??'')?'checked':''}><span>${esc(l)}</span></label>`; }).join('')}</div>`;
}
function symSelect(name, val){ return `<select name="${name}" aria-label="商品"><option value="all">全部商品</option>${symbolsUsed().map(s => `<option ${s===val?'selected':''}>${esc(s)}</option>`).join('')}</select>`; }
function viewList(){
  const list = S.trades.filter(t => (S.listStatus === 'all' || (t.status||'open') === S.listStatus) && (S.listSym === 'all' || (t.symbol||'').toUpperCase() === S.listSym))
    .sort((a,b)=>sortKey(b).localeCompare(sortKey(a)));
  return `<h2>全部交易</h2>
  <div class="filters">${segHTML('ls', [['all','全部'],['watch','觀察中'],['open','持倉中'],['closed','已平倉'],['skipped','已放棄']], S.listStatus)}${symSelect('lsym', S.listSym)}</div>
  ${S.trades.length ? (list.length ? list.map(tradeRow).join('') : '<div class="panel empty">這個篩選條件下沒有交易。</div>') : emptyBlock('還沒有任何交易。')}`;
}

/* ================= 表單：欄位元件 ================= */
const D = () => S.draft;
function fld(label, inner, attrs){ return `<label class="f" ${attrs||''}><span>${label}</span>${inner}</label>`; }
function sel(name, opts, val, empty){
  return `<select name="${name}">${empty!==false?`<option value="">${empty||'—'}</option>`:''}${opts.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(v)===String(val??'')?'selected':''}>${esc(l)}</option>`;}).join('')}</select>`;
}
function inp(name, val, type, extra){ return `<input type="${type||'text'}" name="${name}" value="${esc(val??'')}" ${type==='number'?'inputmode="decimal" step="any" data-num':''} ${extra||''}>`; }
function segF(label, name, opts, val){ return `<div class="f"><span>${label}</span>${segHTML(name, opts, val)}</div>`; }

function gate1(d){ return [{ok: !!String(d.symbol||'').trim(), label:'商品'}, {ok: !!d.chartEntry, label:'K 線圖'}]; }
function gate2(d){
  const ri = riskInfo(d), qtyOk = isNum(d.qty) && +d.qty > 0;
  return {ri, qtyOk, ok: ri.state === 'ok' && qtyOk};
}
const entered = d => d.status === 'open' || d.status === 'closed';

/* ================= 表單：主畫面 ================= */
function renderForm(){
  const d = D(), app = $('#app');
  const presets = (S.settings.symbols || DEFAULT_SYMBOLS).map(p => p.sym);
  const opts = [...new Set([...presets, ...symbolsUsed()])];
  app.innerHTML = `
  <div class="panel fhead">
    <div class="frow">
      <input type="text" name="symbol" list="symlist" value="${esc(d.symbol)}" placeholder="商品，例如 MNQ" autocomplete="off" autocapitalize="characters" aria-label="商品">
      <select name="side" aria-label="方向"><option value="long" ${d.side!=='short'?'selected':''}>做多</option><option value="short" ${d.side==='short'?'selected':''}>做空</option></select>
    </div>
    <datalist id="symlist">${opts.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="frow2"><span class="badge st-${d.status}" id="stBadge">${STATUS_LABEL[d.status]}</span><span class="savest" id="saveState">${d.id ? '已儲存' : '尚未儲存'}</span></div>
  </div>
  <div class="steps" id="steps"></div>
  <div id="stepBody">${S.step === 1 ? step1() : S.step === 2 ? step2() : step3()}</div>
  <div class="fbar"><div class="in" id="fbar"></div></div>`;
  if (d.id) $('#saveState').classList.add('ok');
  mountZones(); updateLive();
}
function renderSteps(){
  const d = D(), g1 = gate1(d).every(g => g.ok), g2 = gate2(d).ok;
  const items = [['進場', true, g1], ['風控', g1 || entered(d), entered(d) || (g2 && S.step > 2)], ['復盤', entered(d), d.status === 'closed']];
  $('#steps').innerHTML = items.map(([name, enabled, done], i) =>
    `<button type="button" class="step ${done && S.step !== i+1 ? 'done' : ''}" data-step="${i+1}" ${S.step===i+1?'aria-current="step"':''} ${enabled?'':'disabled'}><span class="n">${done && S.step !== i+1 ? '✓' : i+1}</span>${name}</button>`).join('');
}

function step1(){
  const d = D(), patterns = S.settings.patterns || DEFAULT_PATTERNS;
  const patOpts = d.pattern && !patterns.includes(d.pattern) ? [...patterns, d.pattern] : patterns;
  return `
  ${chartZone('chartEntry', '進場 K 線圖', '可拖曳、貼上或選擇圖片，再用工具標出重點')}
  <fieldset><legend>基本資料</legend>
    <div class="fg">
      ${fld('日期時間', inp('obsTime', d.obsTime, 'datetime-local'))}
      ${fld('觀察週期', sel('obsTf', TFS, d.obsTf, false))}
      ${fld('進場週期', sel('entryTf', TFS, d.entryTf, false))}
      ${fld('時段', sel('session', SESSIONS, d.session))}
    </div>
    <div class="f" style="margin-top:12px"><span>市場背景（道氏理論的主要趨勢）</span>${segHTML('context', CONTEXTS, d.context)}</div>
  </fieldset>
  <fieldset><legend>策略條件 <span id="pipsLive"></span></legend>
    <h4 style="margin-top:4px">型態</h4>
    <div class="fg">${fld('型態', sel('pattern', patOpts, d.pattern, '無'))}${fld('型態狀態', sel('patternState', ['突破頸線','突破後回測','型態尚未完成','假突破'], d.patternState))}</div>
    <h4>趨勢線</h4>
    <div class="fg">${fld('趨勢線訊號', sel('tlSignal', TL_SIGNALS, d.tlSignal, '無'))}${fld('觸點數', sel('tlTouches', ['2','3','4','5 以上'], d.tlTouches))}</div>
    <h4>道氏理論</h4>
    <div class="fg">${fld('高低點結構', sel('dowStructure', ['高點墊高、低點墊高','高點降低、低點降低','高低點尚未確認'], d.dowStructure))}${fld('目前階段', sel('dowPhase', ['主要趨勢延續','次級修正','修正結束轉折','趨勢可能反轉'], d.dowPhase))}</div>
    <h4>葛蘭碧八大法則</h4>
    <div class="fg">${fld('法則', sel('granville', GRANVILLE, d.granville, '無'), 'style="grid-column:1/-1"')}${fld('依據哪條均線', sel('granvilleMA', ['20MA','100MA'], d.granvilleMA))}</div>
    <h4>20 與 100 均線</h4>
    <div class="fg">${segF('價格相對 20MA','pos20',[['上','在上方'],['下','在下方']], d.pos20)}${segF('價格相對 100MA','pos100',[['上','在上方'],['下','在下方']], d.pos100)}</div>
    <div class="fg">
      ${fld('20MA 方向', sel('ma20dir', ['上揚','走平','下彎'], d.ma20dir))}
      ${fld('100MA 方向', sel('ma100dir', ['上揚','走平','下彎'], d.ma100dir))}
      ${fld('兩條均線', sel('ma20vs100', [['上','20MA 在 100MA 上方'],['下','20MA 在 100MA 下方']], d.ma20vs100))}
      ${fld('均線事件', sel('maEvent', MA_EVENTS, d.maEvent, '無'))}
    </div>
    <div class="f" style="margin-top:14px"><span>進場理由</span><textarea name="entryNote" placeholder="用一兩句話寫下為什麼想進場">${esc(d.entryNote)}</textarea></div>
  </fieldset>`;
}
function step2(){
  const d = D(), p = findPreset(d.symbol);
  return `
  <fieldset><legend>風控</legend>
    <div class="fg">
      ${fld('進場價', inp('entryPrice', d.entryPrice, 'number'))}
      ${fld('停損價', inp('stop', d.stop, 'number'))}
      ${fld('目標價', inp('target', d.target, 'number'))}
    </div>
  </fieldset>
  <div id="rrPanel"></div>
  <fieldset><legend>部位與手續費</legend>
    <div class="fg">
      ${fld('數量（口或單位）', inp('qty', d.qty, 'number', 'placeholder="例如 1"'))}
      ${fld('每點價值（美元）', inp('pointValue', d.pointValue, 'number', 'placeholder="MNQ 為 2"'))}
      ${fld('手續費方式', sel('feeMode', [['fixed','每口固定'],['pct','成交金額 %']], d.feeMode, false))}
      ${fld('<span id="feeLabel">手續費</span>', inp('feeRate', d.feeRate, 'number'))}
      ${fld('實際進場時間', inp('entryTime', d.entryTime || '', 'datetime-local'), 'style="grid-column:1/-1"')}
    </div>
    <p class="hint" id="presetHint">${p ? `已套用 ${esc(p.sym)} 的預設值，可以在設定裡修改。` : '這個商品沒有預設值，請填入每點價值；之後可在設定裡新增。'}</p>
  </fieldset>`;
}
function step3(){
  const d = D();
  if (!entered(d)) return `<div class="panel empty" style="margin-top:14px">確認進場後才能復盤。</div>`;
  return `
  <fieldset><legend>出場</legend>
    <div class="fg">
      ${fld('出場時間', inp('exitTime', d.exitTime || nowLocal(), 'datetime-local'))}
      ${fld('出場價', inp('exitPrice', d.exitPrice, 'number'))}
      ${fld('手續費（留空自動計算）', inp('fee', d.fee, 'number'))}
      ${fld('其他費用，如資金費率', inp('otherFee', d.otherFee, 'number'))}
    </div>
    <div class="calcbox num" id="calcLive"></div>
  </fieldset>
  ${chartZone('chartExit', '出場 K 線圖', '選填，記錄出場時的走勢')}
  <fieldset><legend>檢討</legend>
    <div class="fg">${fld('出場原因', sel('exitReason', EXIT_REASONS, d.exitReason))}${segF('有照計畫執行嗎','followedPlan',[['yes','有'],['no','沒有']], d.followedPlan)}</div>
    <div class="f" style="margin-top:12px"><span>心理狀態（1 很慌，5 很穩）</span>${segHTML('emotion', ['1','2','3','4','5'], d.emotion)}</div>
    <div class="f" style="margin-top:12px"><span>復盤心得</span><textarea name="notes" placeholder="回頭看這筆交易，哪裡做得好、哪裡要改？">${esc(d.notes)}</textarea></div>
  </fieldset>`;
}

/* ================= 表單：即時更新 ================= */
function rrPanelHTML(){
  const d = D(), ri = riskInfo(d), min = ri.min;
  if (ri.state === 'incomplete') return `<div class="rr"><div class="msg">填入進場價、停損價與目標價</div><p class="hint">系統會計算盈虧比，至少要 ${min}：1 才能進場。</p></div>`;
  if (ri.state === 'order') return `<div class="rr order"><div class="msg down">價格順序不對</div><p style="margin:6px 0 0">${ri.long ? '做多時需要：停損價 < 進場價 < 目標價' : '做空時需要：目標價 < 進場價 < 停損價'}</p></div>`;
  const cap = min * 2, w = Math.min(ri.rr / cap, 1) * 100, mk = min / cap * 100;
  const ok = ri.state === 'ok', col = ok ? 'var(--up-fill)' : 'var(--down-fill)';
  const money2 = n => isNum(n) ? money(n, false) : '—';
  return `<div class="rr ${ri.state}">
    <div class="hint">盈虧比</div>
    <div class="ratio num ${ok?'up':'down'}">${fmtRatio(ri.rr)} : 1</div>
    <div class="meter"><i style="width:${w}%;background:${col}"></i><b style="left:calc(${mk}% - 1px)"></b><em style="left:${mk}%">${min}：1</em></div>
    <div class="msg ${ok?'up':'down'}">${ok ? `符合 ${min}：1，可以進場` : `未達 ${min}：1，這不是一筆該進場的交易`}</div>
    ${ok ? '' : `<ul><li>停損不變，目標價至少要到 <b class="num">${fmtPrice(ri.needTarget)}</b></li><li>目標不變，停損要縮到 <b class="num">${fmtPrice(ri.needStop)}</b></li></ul>`}
    <div class="calcbox num"><span>風險 <b>${money2(ri.riskAmt)}</b></span><span>潛在獲利 <b>${money2(ri.rewardAmt)}</b></span></div>
  </div>`;
}
function updateLive(){
  if (S.view !== 'form' || !$('#fbar')) return;
  const d = D();
  renderSteps();
  const badge = $('#stBadge'); badge.className = `badge st-${d.status}`; badge.textContent = STATUS_LABEL[d.status];
  const pl = $('#pipsLive'); if (pl) pl.innerHTML = pipsHTML(d) + ` <span class="hint">${confCount(d)} 項</span>`;
  const rp = $('#rrPanel'); if (rp) rp.innerHTML = rrPanelHTML();
  const fl = $('#feeLabel'); if (fl) fl.textContent = d.feeMode === 'pct' ? '費率（%，單邊）' : '每口來回（美元）';
  const cl = $('#calcLive');
  if (cl){
    const c = calc({...d, status:'closed'}), parts = [];
    if (isNum(d.exitPrice) && isNum(c.net)){
      parts.push(`<span>點數 <b>${c.pts>0?'+':''}${+c.pts.toFixed(4)}</b></span>`, `<span>手續費 <b>${money(c.fee,false)}</b></span>`,
        `<span>淨損益 <b class="${cls(c.net)}">${money(c.net)}</b></span>`, `<span>R 倍數 <b class="${cls(c.R)}">${fmtR(c.R)}</b></span>`);
    }
    cl.innerHTML = parts.join('') || '<span class="hint">填入出場價後會自動計算損益。</span>';
  }
  renderBar();
}
function renderBar(){
  const d = D(), bar = $('#fbar'); let note = '', noteCls = '', btns = '';
  const saveBtn = `<button type="button" class="btn" data-act="save">儲存修改</button>`;
  const skipBtn = d.status === 'watch' ? `<button type="button" class="btn ghost" data-act="skip">放棄交易</button>` : '';
  if (S.step === 1){
    const g = gate1(d), n = g.filter(x => x.ok).length, miss = g.filter(x => !x.ok).map(x => x.label);
    note = `必要條件 ${n}/${g.length}${miss.length ? `：還缺 ${miss.join('、')}` : '，可以進入風控'}`; noteCls = miss.length ? '' : 'ok';
    btns = saveBtn + skipBtn + `<button type="button" class="btn primary" data-act="next" ${miss.length?'disabled':''}>下一步 ›</button>`;
  } else if (S.step === 2){
    const g = gate2(d), ri = g.ri;
    if (ri.state === 'ok') { note = `盈虧比 ${fmtRatio(ri.rr)}：1，符合條件${g.qtyOk ? '' : '，請填入數量'}`; noteCls = g.qtyOk ? 'ok' : ''; }
    else if (ri.state === 'low') { note = `盈虧比 ${fmtRatio(ri.rr)}：1，未達 ${ri.min}：1，不建議進場`; noteCls = 'bad'; }
    else if (ri.state === 'order') { note = '價格順序不對，請檢查停損與目標'; noteCls = 'bad'; }
    else note = `盈虧比至少 ${ri.min}：1 才能進場`;
    btns = saveBtn + skipBtn + (entered(d) ? `<button type="button" class="btn primary" data-act="to3">下一步 ›</button>`
      : `<button type="button" class="btn primary" data-act="enter" ${g.ok?'':'disabled'}>確認進場</button>`);
  } else {
    if (d.status === 'closed'){ note = '已平倉，可以隨時補充復盤'; noteCls = 'ok'; btns = saveBtn + `<button type="button" class="btn primary" data-act="finish">更新復盤</button>`; }
    else if (d.status === 'open'){ note = isNum(d.exitPrice) ? '按下完成復盤，這筆交易就會平倉' : '平倉後填入出場價'; btns = saveBtn + `<button type="button" class="btn primary" data-act="finish" ${isNum(d.exitPrice)?'':'disabled'}>完成復盤</button>`; }
    else { btns = saveBtn; }
  }
  bar.innerHTML = `<div class="note ${noteCls}">${note}</div><div class="btns">${btns}</div>`;
}

/* ================= 表單：自動儲存 ================= */
const hasContent = d => !!(d.id || String(d.symbol||'').trim() || d.chartEntry);
function setSaveState(txt, kind){ const el = $('#saveState'); if (!el) return; el.textContent = txt; el.className = 'savest' + (kind ? ' ' + kind : ''); }
function markDirty(){ S.dirty = true; setSaveState('尚未儲存'); scheduleSave(); }
function scheduleSave(){ clearTimeout(S.saveT); if (!hasContent(D())) return; S.saveT = setTimeout(doSave, 1200); }
async function doSave(){
  if (S.saving){ S.pendingSave = true; return S.saving; }
  const d = D(); if (!d || !hasContent(d)) return;
  if (!d.id) d.id = newId();
  d.step = S.step;
  S.saving = (async () => {
    setSaveState('儲存中');
    try{ await saveTrade(d); S.dirty = false; setSaveState('已儲存', 'ok'); }
    catch(x){ setSaveState('儲存失敗', 'bad'); toast(x && x.code === 'quota_exceeded' ? '儲存空間已滿，請刪除一些舊交易' : '儲存失敗，請檢查網路連線'); throw x; }
  })();
  try{ await S.saving; } finally { S.saving = null; }
  if (S.pendingSave){ S.pendingSave = false; await doSave(); }
}
async function flushSave(){ clearTimeout(S.saveT); if (S.saving) { try{ await S.saving; }catch(e){} } if (hasContent(D())) await doSave(); }

/* ================= 表單：事件 ================= */
function onFormInput(e){
  if (S.view !== 'form') return;
  const el = e.target; if (!el.name || el.closest('[data-nodraft]')) return;
  if (el.type === 'radio' && !el.checked) return;
  const d = D(); let v = el.value;
  if (el.hasAttribute('data-num')) v = v === '' ? '' : +v;
  if (d[el.name] === v) return;
  d[el.name] = v;
  if (el.name === 'symbol'){
    d.symbol = String(v).toUpperCase();
    const p = findPreset(d.symbol);
    if (p){ d.pointValue = p.pv; d.feeMode = p.mode; d.feeRate = p.fee; }
  }
  if (el.name === 'feeMode' || el.name === 'pointValue') { /* 使用者手動調整，保留 */ }
  markDirty(); updateLive();
}
$('#app').addEventListener('input', onFormInput);
$('#app').addEventListener('change', e => {
  onFormInput(e);
  const n = e.target.name;
  if (S.view === 'list' && (n === 'ls' || n === 'lsym')){ if (n === 'ls') S.listStatus = e.target.value; else S.listSym = e.target.value; render(true); }
  if (S.view === 'stats' && n === 'ssym'){ S.statsSym = e.target.value; render(true); }
});
$('#app').addEventListener('click', async e => {
  if (S.view !== 'form') return;
  const st = e.target.closest('[data-step]');
  if (st && !st.disabled){ S.step = +st.dataset.step; renderForm(); window.scrollTo(0,0); if (S.dirty || D().id) scheduleSave(); return; }
  const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
  const d = D(), act = a.dataset.act;
  if (act === 'save'){ if (!hasContent(d)){ toast('先輸入商品或上傳圖片'); return; } await flushSave(); toast('已儲存'); }
  if (act === 'next'){ S.step = 2; renderForm(); window.scrollTo(0,0); scheduleSave(); }
  if (act === 'to3'){ S.step = 3; renderForm(); window.scrollTo(0,0); }
  if (act === 'enter'){
    d.status = 'open'; if (!d.entryTime) d.entryTime = nowLocal();
    try{ await flushSave(); }catch(x){ d.status = 'watch'; return; }
    S.step = 3; renderForm(); window.scrollTo(0,0); toast('已記錄進場');
  }
  if (act === 'finish'){
    if (!isNum(d.exitPrice)){ toast('請填入出場價'); return; }
    const was = d.status; d.status = 'closed'; if (!d.exitTime) d.exitTime = nowLocal();
    try{ await flushSave(); }catch(x){ d.status = was; return; }
    S.dirty = false; toast(was === 'closed' ? '已更新復盤' : '已完成復盤'); go('list');
  }
  if (act === 'skip'){
    if (a.dataset.confirm !== '1'){ a.dataset.confirm = '1'; a.textContent = '再按一次確認'; setTimeout(() => { if (a.isConnected){ a.dataset.confirm = ''; a.textContent = '放棄交易'; } }, 4000); return; }
    if (!hasContent(d)){ S.dirty = false; go('home'); return; }
    const ri = riskInfo(d);
    d.status = 'skipped';
    d.skipReason = ri.state === 'low' ? `盈虧比 ${fmtRatio(ri.rr)}：1，未達 ${ri.min}：1` : '放棄進場';
    try{ await flushSave(); }catch(x){ d.status = 'watch'; return; }
    S.dirty = false; toast('已記錄為放棄的交易'); go('list');
  }
});

/* ================= K 線圖與標註 ================= */
const marksKey = key => key === 'chartEntry' ? 'marksEntry' : 'marksExit';
function chartZone(key, title, sub){
  const d = D(), ref = d[key];
  const toolBtn = (t, label) => `<button type="button" class="tool" data-tool="${t}" aria-pressed="${S.tool===t}" title="${label}" aria-label="${label}">${ICON[t==='none'?'pointer':t]}</button>`;
  const tools = ref ? `<div class="tools" data-nodraft>
      ${toolBtn('none','選取')}${toolBtn('arrow','箭頭')}${toolBtn('hline','水平線')}${toolBtn('text','文字')}
      <input type="text" class="textin" data-textin placeholder="輸入文字再點圖" value="${esc(S.textVal)}" ${S.tool==='text'?'':'hidden'}>
      <button type="button" class="tool" data-color title="切換顏色" aria-label="切換顏色"><span class="dot" style="background:${MARK_COLORS[S.color]}"></span></button>
      <button type="button" class="tool" data-undo title="復原" aria-label="復原">${ICON.undo}</button>
      <button type="button" class="tool" data-clearmarks title="清除標註" aria-label="清除標註">${ICON.clear}</button>
      <button type="button" class="tool" data-full title="全螢幕" aria-label="全螢幕">${ICON.full}</button>
    </div>` : '';
  const body = ref
    ? `<div class="cwrap ${S.tool!=='none'?'drawing':''}" data-dropzone="${key}">${imgTag(ref, title)}<svg class="marks"></svg></div>`
    : `<button type="button" class="drop" data-pick="${key}" data-dropzone="${key}">${ICON.image}<b>貼上或拖曳 K 線截圖</b><span>也可以點擊選擇圖片</span></button>`;
  return `<section class="panel chartp" id="zone-${key}" data-key="${key}">
    <div class="chead"><h3>${title}</h3><div class="hint">${sub}</div></div>
    ${tools}
    <div class="cbody">${body}</div>
    <div class="cfoot" data-nodraft>
      <button type="button" class="btn sm" data-pick="${key}">${ref ? '更換圖片' : '選擇圖片'}</button>
      ${ref ? `<button type="button" class="btn sm ghost" data-rmchart="${key}">移除</button>` : ''}
      <span class="hint">${ref ? '已加入圖表' : '尚未加入圖表'}</span>
    </div>
    <input type="file" accept="image/*" data-file="${key}" data-nodraft hidden>
  </section>`;
}
function refreshZone(key){
  const el = document.getElementById('zone-' + key); if (!el) return;
  const fs = el.classList.contains('fs');
  const tmp = document.createElement('div'); tmp.innerHTML = chartZone(key, el.querySelector('h3').textContent, el.querySelector('.chead .hint').textContent);
  const nz = tmp.firstElementChild; if (fs) nz.classList.add('fs');
  el.replaceWith(nz); mountZone(key);
}
function mountZones(){ ['chartEntry','chartExit'].forEach(k => { if (document.getElementById('zone-' + k)) mountZone(k); }); }
function drawMarksInto(svg, img, marks, temp){
  const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const sw = Math.max(2, w * 0.004), fs = Math.max(14, w * 0.032);
  const all = temp ? [...marks, temp] : marks;
  svg.innerHTML = all.map(m => {
    const c = MARK_COLORS[m.c] || MARK_COLORS.teal;
    if (m.t === 'h'){ const y = m.y * h; return `<line x1="0" x2="${w}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="${sw}" stroke-dasharray="${sw*4} ${sw*2.5}"/>`; }
    if (m.t === 'text'){ return `<text x="${m.x*w}" y="${m.y*h}" fill="${c}" font-size="${fs}" font-weight="900" font-family="Noto Sans TC, sans-serif" stroke="rgba(10,25,30,.55)" stroke-width="${fs*0.16}" paint-order="stroke" dominant-baseline="middle">${esc(m.s)}</text>`; }
    if (m.t === 'arrow'){
      const x1 = m.x1*w, y1 = m.y1*h, x2 = m.x2*w, y2 = m.y2*h, ang = Math.atan2(y2-y1, x2-x1), L = sw*5.5;
      const p1 = [x2 - L*Math.cos(ang - 0.45), y2 - L*Math.sin(ang - 0.45)], p2 = [x2 - L*Math.cos(ang + 0.45), y2 - L*Math.sin(ang + 0.45)];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${sw*1.3}" stroke-linecap="round"/><polygon points="${x2},${y2} ${p1.join(',')} ${p2.join(',')}" fill="${c}"/>`;
    }
    return '';
  }).join('');
}
function mountZone(key){
  const zone = document.getElementById('zone-' + key); if (!zone) return;
  const img = zone.querySelector('.cwrap img'), svg = zone.querySelector('svg.marks'), mk = marksKey(key);
  if (img && svg){
    const draw = temp => drawMarksInto(svg, img, D()[mk] || [], temp);
    img.addEventListener('load', () => draw());
    if (img.complete && img.naturalWidth) draw();
    hydrateImages(zone);
    let start = null;
    const pt = e => { const r = svg.getBoundingClientRect(); return {x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))}; };
    const commit = m => { const d = D(); d[mk] = [...(d[mk] || []), m]; draw(); markDirty(); };
    svg.addEventListener('pointerdown', e => {
      if (S.tool === 'none') return; e.preventDefault();
      const p = pt(e);
      if (S.tool === 'hline'){ commit({t:'h', y:+p.y.toFixed(4), c:S.color}); return; }
      if (S.tool === 'text'){ const s = S.textVal.trim(); if (!s){ toast('先在工具列輸入文字'); return; } commit({t:'text', x:+p.x.toFixed(4), y:+p.y.toFixed(4), s, c:S.color}); return; }
      if (S.tool === 'arrow'){ start = p; svg.setPointerCapture(e.pointerId); }
    });
    svg.addEventListener('pointermove', e => { if (!start) return; const p = pt(e); draw({t:'arrow', x1:start.x, y1:start.y, x2:p.x, y2:p.y, c:S.color}); });
    const end = e => { if (!start) return; const p = pt(e), s0 = start; start = null;
      if (Math.hypot(p.x - s0.x, p.y - s0.y) < 0.02){ draw(); return; }
      commit({t:'arrow', x1:+s0.x.toFixed(4), y1:+s0.y.toFixed(4), x2:+p.x.toFixed(4), y2:+p.y.toFixed(4), c:S.color}); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', () => { start = null; draw(); });
  }
  const ti = zone.querySelector('[data-textin]'); if (ti) ti.addEventListener('input', () => { S.textVal = ti.value; });
  zone.querySelectorAll('[data-dropzone]').forEach(dz => {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = [...(e.dataTransfer.files||[])].find(x => x.type.startsWith('image/')); if (f) handleImage(key, f); });
  });
  zone.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.pick){ zone.querySelector('[data-file]').click(); }
    else if (t.dataset.rmchart){ const d = D(); d[key] = ''; d[mk] = []; markDirty(); refreshZone(key); updateLive(); }
    else if (t.dataset.tool){ S.tool = t.dataset.tool; ['chartEntry','chartExit'].forEach(refreshZone); if (S.tool === 'text'){ const i = zone.ownerDocument.querySelector(`#zone-${key} [data-textin]`); if (i) i.focus(); } }
    else if (t.hasAttribute('data-color')){ const ks = Object.keys(MARK_COLORS); S.color = ks[(ks.indexOf(S.color) + 1) % ks.length]; ['chartEntry','chartExit'].forEach(refreshZone); }
    else if (t.hasAttribute('data-undo')){ const d = D(); if ((d[mk]||[]).length){ d[mk] = d[mk].slice(0,-1); markDirty(); refreshZone(key); } }
    else if (t.hasAttribute('data-clearmarks')){ const d = D(); if ((d[mk]||[]).length){ d[mk] = []; markDirty(); refreshZone(key); } }
    else if (t.hasAttribute('data-full')){ const on = !zone.classList.contains('fs'); zone.classList.toggle('fs', on); document.body.style.overflow = on ? 'hidden' : ''; t.setAttribute('aria-pressed', on); }
  });
  zone.querySelector('[data-file]').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) handleImage(key, f); });
}
function closeFullscreen(){ document.querySelectorAll('.chartp.fs').forEach(z => z.classList.remove('fs')); document.body.style.overflow = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ closeFullscreen(); $('#sheet').hidden = true; } });
function compressImage(file, maxW, q){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const r = Math.min(1, maxW / img.naturalWidth), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}
async function handleImage(key, file){
  if (!file || !file.type.startsWith('image/')) { toast('請選擇圖片檔'); return; }
  const zone = document.getElementById('zone-' + key); const hint = zone && zone.querySelector('.cfoot .hint');
  if (hint) hint.textContent = '處理圖片中…';
  let ref = null;
  try{
    // 雲端：單張上限約 850 KB（Firestore 每筆 1 MB）；本機：壓得更小，避免 localStorage 5 MB 很快用完
    const limit = isCloud() ? 850000 : 230000;
    let data = await compressImage(file, isCloud() ? 1600 : 1400, isCloud() ? 0.78 : 0.72);
    if (data.length > limit) data = await compressImage(file, 1100, 0.62);
    if (data.length > limit) data = await compressImage(file, 800, 0.5);
    ref = await saveImage(data);
  }catch(err){
    toast(isCloud() ? '圖片上傳失敗，請確認網路' : '圖片無法讀取，請換一張'); if (hint) hint.textContent = '尚未加入圖表'; return;
  }
  const d = D(); d[key] = ref; d[marksKey(key)] = [];
  markDirty(); refreshZone(key); updateLive();
}
document.addEventListener('paste', e => {
  if (S.view !== 'form') return;
  const key = S.step === 3 ? 'chartExit' : 'chartEntry';
  if (!document.getElementById('zone-' + key)) return;
  const item = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.type.startsWith('image/'));
  if (item){ e.preventDefault(); handleImage(key, item.getAsFile()); }
});

/* ================= 詳情 ================= */
function chartView(ref, marks){ return ref ? `<div class="dview">${imgTag(ref, 'K 線圖', `data-marks='${esc(JSON.stringify(marks||[]))}'`)}<svg></svg></div>` : ''; }
function openDetail(id){
  const t = S.trades.find(x => x.id === id); if (!t) return;
  const c = calc(t), st = t.status || 'open', ri = riskInfo(t), gv = GRANVILLE.find(g => g[0] === t.granville);
  const row = (k,v) => v !== '' && v != null ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const j = a => esc(a.filter(Boolean).join('，'));
  let head;
  if (st === 'closed') head = `<div class="hero" style="margin-top:12px"><div class="cap">淨損益</div><div class="big num ${cls(c.net)}">${money(c.net)}</div><div class="cap num">${fmtR(c.R)}　手續費 ${money(c.fee,false)}</div></div>`;
  else head = `<p style="margin:10px 0 0"><span class="badge st-${st}">${STATUS_LABEL[st]}</span>${t.skipReason && st==='skipped' ? `　<span class="down">${esc(t.skipReason)}</span>` : ''}</p>`;
  const mainBtn = st === 'watch' ? '<button class="btn primary" data-dact="edit">繼續</button>'
    : st === 'open' ? '<button class="btn primary" data-dact="edit">平倉復盤</button>'
    : st === 'skipped' ? '<button class="btn primary" data-dact="revive">重新評估</button>'
    : '<button class="btn primary" data-dact="edit">編輯復盤</button>';
  $('#sheetInner').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h2 style="margin:0">${esc(t.symbol || '未命名')} <span class="side ${t.side==='short'?'short':'long'}">${t.side==='short'?'做空':'做多'}</span></h2>
      <button class="btn sm" data-dact="close">關閉</button>
    </div>
    ${head}
    ${t.chartEntry ? `<div class="panel" style="margin-top:12px"><h3>進場 K 線圖</h3>${chartView(t.chartEntry, t.marksEntry)}</div>` : ''}
    <div class="panel" style="margin-top:12px"><h3>基本資料與風控</h3><dl class="kv num">
      ${row('觀察時間', esc(fmtDate(t.obsTime)))}${row('週期', j([t.obsTf && '觀察 ' + t.obsTf, (t.entryTf||t.tf) && '進場 ' + (t.entryTf||t.tf)]))}
      ${row('時段', esc(t.session))}${row('市場背景', esc(ctxOf(t)))}
      ${row('進場', t.entryPrice !== '' && t.entryPrice != null ? esc((t.entryTime ? fmtDate(t.entryTime) + '　' : '') + t.entryPrice) : '')}
      ${row('停損／目標', isNum(t.stop) || isNum(t.target) ? esc(`${t.stop ?? '—'}／${t.target ?? '—'}`) : '')}
      ${row('計畫盈虧比', isNum(ri.rr) ? `<span class="${ri.state==='ok'?'up':'down'}">${fmtRatio(ri.rr)}：1</span>` : '')}
      ${row('數量', esc(t.qty))}${row('每點價值', isNum(pvOf(t)) ? '$' + pvOf(t) : '')}
      ${st === 'closed' ? row('出場', esc(fmtDate(t.exitTime) + '　' + t.exitPrice)) + row('出場原因', esc(t.exitReason)) + row('照計畫執行', t.followedPlan==='yes'?'有':t.followedPlan==='no'?'沒有':'') + row('心理狀態', esc(t.emotion)) : ''}
    </dl></div>
    <div class="panel" style="margin-top:12px"><h3>策略條件 ${pipsHTML(t)}</h3><dl class="kv">
      ${row('型態', j([t.pattern, t.patternState]))}${row('趨勢線', j([t.tlSignal, t.tlTouches && t.tlTouches + ' 個觸點']))}
      ${row('道氏理論', j([ctxOf(t), t.dowStructure, t.dowPhase]))}${row('葛蘭碧', j([gv && gv[1].replace('　','：'), t.granvilleMA]))}
      ${row('均線', j([t.pos20 && '價格在 20MA ' + (t.pos20==='上'?'上方':'下方'), t.pos100 && '價格在 100MA ' + (t.pos100==='上'?'上方':'下方'), t.ma20dir && '20MA ' + t.ma20dir, t.ma100dir && '100MA ' + t.ma100dir, t.maEvent]))}
    </dl>${t.entryNote ? `<p style="white-space:pre-wrap;margin:10px 0 0">${esc(t.entryNote)}</p>` : ''}</div>
    ${t.chartExit ? `<div class="panel" style="margin-top:12px"><h3>出場 K 線圖</h3>${chartView(t.chartExit, t.marksExit)}</div>` : ''}
    ${t.notes ? `<div class="panel" style="margin-top:12px"><h3>復盤心得</h3><div style="white-space:pre-wrap;margin-top:6px">${esc(t.notes)}</div></div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">${mainBtn}<button class="btn danger" data-dact="del" style="margin-left:auto">刪除</button></div>`;
  $('#sheetInner').querySelectorAll('.dview img').forEach(img => {
    const marks = JSON.parse(img.dataset.marks || '[]'), svg = img.parentElement.querySelector('svg');
    img.addEventListener('load', () => drawMarksInto(svg, img, marks));
    if (img.complete && img.naturalWidth) drawMarksInto(svg, img, marks);
  });
  hydrateImages($('#sheetInner'));
  const sh = $('#sheet'); sh.hidden = false; sh.dataset.id = id; sh.querySelector('.inner').scrollTop = 0;
}
$('#sheet').addEventListener('click', async e => {
  const sh = $('#sheet');
  if (e.target === sh){ sh.hidden = true; return; }
  const b = e.target.closest('[data-dact]'); if (!b) return;
  const t = S.trades.find(x => x.id === sh.dataset.id); const act = b.dataset.dact;
  if (act === 'close'){ sh.hidden = true; return; }
  if (!t) return;
  if (act === 'edit'){ sh.hidden = true; go('form', {trade: t}); }
  if (act === 'revive'){ sh.hidden = true; go('form', {trade: {...t, status:'watch', skipReason:''}, step: 2}); }
  if (act === 'del'){
    if (b.dataset.confirm !== '1'){ b.dataset.confirm = '1'; b.textContent = '再按一次確認刪除'; return; }
    try{ await deleteTrade(t.id); sh.hidden = true; toast('已刪除交易'); render(true); }catch(x){ toast('刪除失敗，請再試一次'); }
  }
});

/* ================= 分析 ================= */
function groupTable(title, list, keyFn, note){
  const map = new Map();
  list.forEach(t => { const k = keyFn(t) || '未填'; if (!map.has(k)) map.set(k, []); map.get(k).push(t); });
  const rows = [...map.entries()].map(([k,l]) => ({k, s: summary(l)})).sort((a,b) => b.s.n - a.s.n);
  if (!rows.length) return '';
  return `<div class="panel tbl"><h3 style="margin-bottom:8px">${title}</h3><table><thead><tr><th>項目</th><th>筆數</th><th>勝率</th><th>淨損益</th><th>平均 R</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.k)}</td><td class="num">${r.s.n}</td><td class="num">${pct(r.s.winRate)}<div class="bar"><i style="width:${(r.s.winRate||0)*100}%"></i></div></td><td class="num ${cls(r.s.net)}">${money(r.s.net)}</td><td class="num ${cls(r.s.avgR)}">${fmtR(r.s.avgR)}</td></tr>`).join('')}
  </tbody></table>${note ? `<p class="hint">${note}</p>` : ''}</div>`;
}
function viewStats(){
  const list = closedTrades(S.statsSym), s = summary(list);
  const head = `<h2>策略分析</h2><div class="filters">${symSelect('ssym', S.statsSym)}</div>`;
  const skipped = S.trades.filter(t => t.status === 'skipped' && (S.statsSym === 'all' || (t.symbol||'').toUpperCase() === S.statsSym));
  const skipPanel = skipped.length ? `<div class="panel"><h3>放棄的交易</h3><p style="margin:8px 0 0">共 ${skipped.length} 筆，其中 ${skipped.filter(t => riskInfo(t).state === 'low').length} 筆因盈虧比未達 ${minRR()}：1 而放棄。</p></div>` : '';
  if (!list.length) return head + '<div class="panel empty">完成幾筆復盤之後，這裡會拆解每種訊號的表現。</div>' + (skipPanel ? '<div style="margin-top:14px">' + skipPanel + '</div>' : '');
  const ctxKey = t => { const c = ctxOf(t); return !c ? '' : (c === '盤整' || c === '不確定') ? '背景為' + c : ((t.side !== 'short') === (c === '多頭') ? '順著市場背景' : '逆著市場背景'); };
  const maKey = t => t.pos20 && t.pos100 ? `價格在 20MA ${t.pos20==='上'?'上方':'下方'}，100MA ${t.pos100==='上'?'上方':'下方'}` : '';
  const rrKey = t => { const r = riskInfo(t).rr; if (!isNum(r)) return ''; const m = minRR(); return r < m ? `低於 ${m}：1` : r < m + 1 ? `${m} 到 ${m+1}：1` : `${m+1}：1 以上`; };
  return head + `
  <div class="kpis" style="margin-top:0">
    <div class="kpi"><div class="v num ${cls(s.net)}">${money(s.net)}</div><div class="l">淨損益</div></div>
    <div class="kpi"><div class="v num">${s.n}</div><div class="l">已平倉筆數</div></div>
    <div class="kpi"><div class="v num">${pct(s.winRate)}</div><div class="l">勝率</div></div>
    <div class="kpi"><div class="v num up">${money(s.avgW)}</div><div class="l">平均獲利</div></div>
    <div class="kpi"><div class="v num down">${money(s.avgL)}</div><div class="l">平均虧損</div></div>
    <div class="kpi"><div class="v num ${cls(s.avgR)}">${fmtR(s.avgR)}</div><div class="l">期望值（平均 R）</div></div>
  </div>
  <div class="hero" style="margin-top:14px"><div class="cap">資金曲線</div>${equitySVG(s.curve)}</div>
  <div class="grid2" style="margin-top:14px">
    ${skipPanel}
    ${groupTable('計畫盈虧比', list, rrKey, '進場時規劃的盈虧比，和實際結果對照。')}
    ${groupTable('葛蘭碧八大法則', list, t => t.granville ? t.granville + (t.granvilleMA ? '（' + t.granvilleMA + '）' : '') : '無')}
    ${groupTable('型態', list, t => t.pattern || '無')}
    ${groupTable('趨勢線訊號', list, t => t.tlSignal || '無')}
    ${groupTable('市場背景', list, ctxKey, '比較順勢與逆勢交易的差異。')}
    ${groupTable('價格與均線位置', list, maKey)}
    ${groupTable('均線事件', list, t => t.maEvent || '無')}
    ${groupTable('訊號共振數', list, t => confCount(t) + ' 項')}
    ${groupTable('多空方向', list, t => t.side === 'short' ? '做空' : '做多')}
    ${groupTable('進場週期', list, t => t.entryTf || t.tf)}
    ${groupTable('時段', list, t => t.session)}
    ${groupTable('照計畫執行', list, t => t.followedPlan === 'yes' ? '有照計畫' : t.followedPlan === 'no' ? '沒照計畫' : '')}
    ${groupTable('出場原因', list, t => t.exitReason)}
    ${groupTable('商品', list, t => t.symbol)}
  </div>`;
}

/* ================= 設定 ================= */
function symRows(){
  return S.symEdit.map((p,i) => `<div class="symrow" data-i="${i}">
    <input type="text" data-k="sym" value="${esc(p.sym)}" placeholder="商品" aria-label="商品" autocapitalize="characters">
    <input type="number" data-k="pv" value="${esc(p.pv)}" inputmode="decimal" step="any" aria-label="每點價值" placeholder="每點價值">
    <select data-k="mode" class="sm2" aria-label="手續費方式"><option value="fixed" ${p.mode!=='pct'?'selected':''}>每口固定</option><option value="pct" ${p.mode==='pct'?'selected':''}>成交金額 %</option></select>
    <input type="number" data-k="fee" value="${esc(p.fee)}" inputmode="decimal" step="any" aria-label="手續費" placeholder="手續費">
    <button type="button" class="tool" data-delsym="${i}" aria-label="刪除 ${esc(p.sym)}">${ICON.clear}</button>
  </div>`).join('');
}
function viewSettings(){
  const s = S.settings;
  S.symEdit = JSON.parse(JSON.stringify(s.symbols || DEFAULT_SYMBOLS));
  return `<h2>設定</h2>
  <fieldset style="margin-top:0"><legend>進場門檻</legend>
    <div class="fg">${fld('最低盈虧比（例如 3 代表 3：1）', `<input type="number" id="minRR" value="${esc(s.minRR)}" inputmode="decimal" step="0.1" min="0.5">`)}</div>
    <p class="hint">盈虧比低於這個數字時，無法按下「確認進場」。</p>
  </fieldset>
  <fieldset><legend>商品預設值</legend>
    <p class="hint" style="margin-top:0">輸入商品代號時會自動帶入。代號開頭相符也算，例如 MNQZ6 會套用 MNQ。</p>
    <div class="symhead">商品／每點價值（美元）／手續費方式／手續費</div>
    <div id="symRows">${symRows()}</div>
    <button type="button" class="btn sm" id="addSym" style="margin-top:10px">新增商品</button>
  </fieldset>
  <fieldset><legend>型態清單</legend><p class="hint" style="margin-top:0">一行一個</p>
    <textarea id="patList" rows="8">${esc((s.patterns||DEFAULT_PATTERNS).join('\n'))}</textarea>
  </fieldset>
  <fieldset><legend>外觀</legend>${segHTML('theme', [['light','米白（預設）'],['dark','深色'],['system','跟隨裝置']], ['dark','system'].includes(s.theme) ? s.theme : 'light')}</fieldset>
  <div style="margin-top:14px"><button class="btn primary" id="saveSet">儲存設定</button></div>
  <fieldset><legend>資料</legend>
    ${isCloud()
      ? `<p style="margin-top:0">已登入：<b>${esc(S.user.email || S.user.displayName || '')}</b></p><p>交易紀錄存在 Firebase 雲端。手機和電腦用同一個 Google 帳號登入，就會看到同一份資料，而且只有你自己看得到。沒有網路時也能記錄，恢復連線後會自動上傳。</p><p class="hint">共 ${S.trades.length} 筆交易。</p>`
      : `<p style="margin-top:0">交易紀錄只存在這台裝置的瀏覽器裡，不會在手機和電腦之間同步。清除瀏覽器資料或解除安裝 App 會一併刪除紀錄。</p><p class="hint">共 ${S.trades.length} 筆交易，已使用約 ${(storageUsage()/1048576).toFixed(2)} MB（瀏覽器上限通常約 5 MB）。</p>${configReady() ? '' : '<p class="hint">尚未設定 Firebase，所以無法登入同步。設定方式請看 README。</p>'}`}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${S.installPrompt ? '<button class="btn primary" id="installBtn">安裝到主畫面</button>' : ''}
      ${!isCloud() && configReady() ? '<button class="btn primary" id="loginSet">登入 Google 並同步</button>' : ''}
      ${isCloud() && LS.get(STORE_KEYS.trades, []).length ? '<button class="btn" id="reMigrate">上傳這台裝置的本機紀錄</button>' : ''}
      <button class="btn" id="exportCsv">匯出 CSV</button>
      ${isCloud() ? '<button class="btn ghost" id="logoutBtn">登出</button>' : ''}
    </div>
  </fieldset>`;
}
function bindSettings(){
  const rows = $('#symRows');
  rows.addEventListener('input', e => { const r = e.target.closest('.symrow'); if (!r) return; const k = e.target.dataset.k; const p = S.symEdit[+r.dataset.i]; p[k] = (k === 'pv' || k === 'fee') ? (e.target.value === '' ? '' : +e.target.value) : (k === 'sym' ? e.target.value.toUpperCase() : e.target.value); });
  rows.addEventListener('change', e => { if (e.target.dataset.k === 'mode'){ const r = e.target.closest('.symrow'); S.symEdit[+r.dataset.i].mode = e.target.value; } });
  rows.addEventListener('click', e => { const b = e.target.closest('[data-delsym]'); if (!b) return; S.symEdit.splice(+b.dataset.delsym, 1); rows.innerHTML = symRows(); });
  $('#addSym').addEventListener('click', () => { S.symEdit.push({sym:'', pv:'', mode:'fixed', fee:''}); rows.innerHTML = symRows(); const last = rows.querySelector('.symrow:last-child input'); if (last) last.focus(); });
  $('#saveSet').addEventListener('click', async () => {
    const mr = +$('#minRR').value;
    const theme = (document.querySelector('[name=theme]:checked')||{}).value || 'light';
    const patterns = $('#patList').value.split('\n').map(x => x.trim()).filter(Boolean);
    const symbols = S.symEdit.filter(p => String(p.sym).trim() && isNum(p.pv)).map(p => ({sym:String(p.sym).trim().toUpperCase(), pv:+p.pv, mode:p.mode === 'pct' ? 'pct' : 'fixed', fee: isNum(p.fee) ? +p.fee : 0}));
    const next = {minRR: mr > 0 ? mr : 3, symbols: symbols.length ? symbols : DEFAULT_SYMBOLS, patterns: patterns.length ? patterns : DEFAULT_PATTERNS, theme};
    try{ await saveSettings(next); S.settings = mergeSettings(next); applyTheme(); toast('已儲存設定'); }
    catch(e){ toast('儲存失敗，請再試一次'); }
  });
  const ib = $('#installBtn'); if (ib) ib.addEventListener('click', promptInstall);
  const ls = $('#loginSet'); if (ls) ls.addEventListener('click', () => { LS.del(STORE_KEYS.mode); login(); });
  const lo = $('#logoutBtn'); if (lo) lo.addEventListener('click', logout);
  const rm = $('#reMigrate'); if (rm) rm.addEventListener('click', async () => { await migrateLocal(); });
  const ex = $('#exportCsv');
  if (ex) ex.addEventListener('click', async () => {
    const cols = ['status','symbol','side','obsTime','obsTf','entryTf','session','context','entryTime','entryPrice','stop','target','qty','pointValue','exitTime','exitPrice','fee','otherFee','pattern','patternState','tlSignal','tlTouches','dowStructure','dowPhase','granville','granvilleMA','pos20','pos100','ma20dir','ma100dir','ma20vs100','maEvent','exitReason','followedPlan','emotion','skipReason','entryNote','notes'];
    const q = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
    const lines = [[...cols,'plannedRR','netPnl','R','confluence'].join(',')];
    [...S.trades].sort((a,b)=>sortKey(a).localeCompare(sortKey(b))).forEach(t => { const c = calc(t), ri = riskInfo(t);
      lines.push([...cols.map(k => q(t[k])), isNum(ri.rr)?ri.rr.toFixed(2):'', isNum(c.net)?c.net.toFixed(2):'', isNum(c.R)?c.R.toFixed(2):'', confCount(t)].join(',')); });
    const blob = new Blob(['\ufeff' + lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'trading-journal-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
}

/* ================= PWA ================= */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; if (S.view === 'settings') render(true); });
window.addEventListener('appinstalled', () => { S.installPrompt = null; toast('已安裝到主畫面'); if (S.view === 'settings') render(true); });
async function promptInstall(){ const p = S.installPrompt; if (!p) return; p.prompt(); try{ await p.userChoice; }catch(e){} S.installPrompt = null; if (S.view === 'settings') render(true); }
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });

/* ================= 啟動 ================= */
setSync(); initBackend();
{ const v = viewFromPath(location.pathname); if (v !== 'home') go(v, {fromHistory:true}); else syncUrl('home', true); }
window.addEventListener('beforeunload', () => { if (S.dirty) flushSave(); });
})();
