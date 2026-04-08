// ===== Onboarding Line Demo Animation =====
function obPlayLineDemo() {
  const mock = document.getElementById('obLineMock');
  const flash = document.getElementById('obFlash');
  const imp = document.getElementById('obAwaiImport');
  const names = document.getElementById('obImportedNames');
  if (!mock || !flash || !imp || !names) return;
  mock.style.opacity = '1'; mock.style.transform = 'scale(1)'; mock.style.filter = 'blur(0)';
  flash.style.opacity = '0';
  imp.style.opacity = '0'; imp.style.transform = 'translateY(10px)';
  names.innerHTML = '';
  setTimeout(() => { flash.style.opacity = '0.7'; setTimeout(() => { flash.style.opacity = '0'; }, 600); }, 2500);
  setTimeout(() => { mock.style.transform = 'scale(0.95)'; mock.style.opacity = '0.15'; mock.style.filter = 'blur(4px)'; }, 3500);
  setTimeout(() => {
    imp.style.opacity = '1'; imp.style.transform = 'translateY(0)';
    ['田中 花子','鈴木 太郎','佐藤 美咲','山田 健一'].forEach((n, i) => {
      setTimeout(() => {
        const tag = document.createElement('div');
        tag.style.cssText = 'background:var(--accent);color:#fff;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:500;opacity:0;transform:translateY(8px);transition:all 0.6s cubic-bezier(0.4,0,0.2,1);';
        tag.textContent = '👤 ' + n;
        names.appendChild(tag);
        requestAnimationFrame(() => { tag.style.opacity = '1'; tag.style.transform = 'translateY(0)'; });
      }, i * 500);
    });
  }, 4500);
  setTimeout(() => { imp.style.opacity = '0'; imp.style.transform = 'translateY(-10px)'; setTimeout(() => obPlayLineDemo(), 1500); }, 9000);
}

// ===== Supabase =====
const SUPABASE_URL = 'https://njdnfvlucwasrafoepmu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZG5mdmx1Y3dhc3JhZm9lcG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTEzNjgsImV4cCI6MjA5MDg4NzM2OH0.jDjqf3nWqaQ0sMfDf-85dDQNbEhX90qLsOOhWJdDlM8';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let _sbUser = null;
let _sbSyncing = false;

async function sbInit() {
  try {
    // OAuth リダイレクト後のセッション検出
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const hasOAuthToken = hashParams.has('access_token') || window.location.search.includes('code=');

    // セッション復元（匿名ログインは行わない）
    const { data: { session } } = await _sb.auth.getSession();
    if (session && session.user) {
      _sbUser = session.user;
      if (hasOAuthToken && _sbUser.email) {
        window.history.replaceState({}, '', window.location.pathname);
        // OAuthリダイレクト後：オンボーディングを閉じてログイン状態にする
        document.getElementById('onboardingOverlay').style.display = 'none';
        localStorage.setItem(OB_KEY, '1');
        const loginOv = document.getElementById('loginOverlay');
        if (loginOv) loginOv.remove();
        setTimeout(() => showToast('✅ ' + _sbUser.email + ' でログインしました'), 500);
      }
      // ログイン済み（メールあり）の場合のみクラウド同期
      if (_sbUser.email) {
        await sbLoad();
        await sbSave();
        checkShareRequests();
        ensureShareCode();
        syncReferralPoints();
        showLoginWarningHide();
        render();
      }
    } else {
      _sbUser = null;
    }
    // 未ログイン警告
    showLoginWarning();
  } catch(e) { console.error('Supabase init error:', e); }
}

function showLoginWarningHide() {
  const banner = document.getElementById('loginWarningBanner');
  if (banner) banner.innerHTML = '';
}

function showLoginWarning() {
  if (!_sbUser || _sbUser.email) return; // ログイン済みなら表示しない
  const dismissed = localStorage.getItem('awai_login_warn_dismissed');
  if (dismissed) return;
  const banner = document.getElementById('loginWarningBanner');
  if (!banner) return;
  banner.innerHTML = `<div style="margin:0 16px 8px;padding:14px 16px;background:linear-gradient(135deg,#fff0f0,#ffe8e8);border:1px solid #e8a0a0;border-radius:14px;display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="document.getElementById('settingsModalOverlay').classList.add('open');openSettings();document.getElementById('loginWarningBanner').innerHTML='';">
    <span style="font-size:22px;flex-shrink:0;">⚠️</span>
    <div style="flex:1;">
      <div style="font-size:14px;font-weight:600;color:#c05050;">ログインしないとデータが消える可能性があります</div>
      <div style="font-size:12px;color:#a07070;margin-top:2px;">タップしてGoogleでログイン →</div>
    </div>
    <span style="font-size:14px;color:#c0a0a0;flex-shrink:0;" onclick="event.stopPropagation();localStorage.setItem('awai_login_warn_dismissed','1');this.parentElement.remove();">✕</span>
  </div>`;
}

async function sbLoad() {
  // ログイン済み（メールあり）のユーザーのみクラウドから読み込む
  if (!_sbUser || !_sbUser.email) return;
  try {
    const { data: row, error } = await _sb.from('user_data').select('data,profile,user_id,updated_at').eq('user_id', _sbUser.id).single();
    if (error && error.code !== 'PGRST116') { console.error('Load error:', error); return; }
    if (row && row.data) {
      // 二重チェック：取得したデータのuser_idが自分のものか確認
      if (row.user_id !== _sbUser.id) {
        console.error('SECURITY: user_id mismatch. Expected:', _sbUser.id, 'Got:', row.user_id);
        return;
      }
      // クラウドとローカルを比較
      const localRaw = localStorage.getItem('awai_data');
      const localData = localRaw ? JSON.parse(localRaw) : null;
      const localCount = localData ? Object.values(localData).reduce((s,v) => s + (Array.isArray(v)?v.length:0), 0) : 0;
      const cloudCount = Object.values(row.data).reduce((s,v) => s + (Array.isArray(v)?v.length:0), 0);

      // ローカルにデータがあってクラウドが空の場合 → ローカルを優先してクラウドに保存
      if (localCount > 0 && cloudCount === 0) {
        await sbSave();
        return;
      }

      // クラウドにデータがある場合 → 更新日時で判断
      const localUpdated = localStorage.getItem('awai_data_updated') || '';
      const cloudUpdated = row.updated_at || '';

      if (cloudCount > 0 && cloudUpdated && cloudUpdated > localUpdated) {
        TABS.forEach(t => { if (Array.isArray(row.data[t])) data[t] = row.data[t]; });
        if (row.data.labels) data.labels = {...data.labels, ...row.data.labels};
        localStorage.setItem('awai_data', JSON.stringify(data));
        localStorage.setItem('awai_data_updated', cloudUpdated);
        render();
      } else if (localCount > 0) {
        // ローカルが新しいか同じ → ローカルをクラウドに保存
        await sbSave();
      }
      if (row.profile) {
        localStorage.setItem('awai_my_profile', JSON.stringify(row.profile));
      }
    }
  } catch(e) { console.error('sbLoad error:', e); }
}

async function sbSave() {
  // ログイン済み（メールあり）のユーザーのみクラウドに保存
  if (!_sbUser || !_sbUser.email || _sbSyncing) return;
  _sbSyncing = true;
  try {
    const dataObj = JSON.parse(localStorage.getItem('awai_data') || '{}');
    const profileObj = JSON.parse(localStorage.getItem('awai_my_profile') || '{}');
    const { error } = await _sb.from('user_data').upsert({
      user_id: _sbUser.id,
      data: dataObj,
      profile: profileObj,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) console.error('Save error:', error);
  } catch(e) { console.error('sbSave error:', e); }
  _sbSyncing = false;
}

// ===== Email Auth =====
async function registerEmail() {
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;
  if (!email || !password) { alert('メールアドレスとパスワードを入力してください'); return; }
  if (password.length < 6) { alert('パスワードは6文字以上にしてください'); return; }
  try {
    const { data: res, error } = await _sb.auth.updateUser({ email, password });
    if (error) { alert('登録エラー: ' + error.message); return; }
    _sbUser = res.user;
    showToast('メールアドレスを登録しました');
    // 設定画面を再描画
    openSettings();
  } catch(e) { alert('登録に失敗しました: ' + e.message); }
}

function showLoginScreen() {
  const overlay = document.createElement('div');
  overlay.id = 'loginOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:100000;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="max-width:400px;margin:0 auto;padding:60px 24px;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;">
      <div style="text-align:center;margin-bottom:32px;font-size:48px;">🕊️</div>
      <h2 style="text-align:center;font-family:'Shippori Mincho',serif;font-size:22px;margin-bottom:24px;">ログイン</h2>
      <div class="form-group">
        <input type="email" id="loginEmail" placeholder="メールアドレス" style="width:100%;padding:14px 16px;font-size:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;">
        <input type="password" id="loginPassword" placeholder="パスワード" style="width:100%;padding:14px 16px;font-size:16px;border:1px solid var(--border);border-radius:12px;">
      </div>
      <button class="btn btn-primary" style="width:100%;padding:12px;font-size:15px;border-radius:12px;margin-top:16px;" onclick="doLogin()">ログイン</button>
      <p style="text-align:center;margin-top:16px;"><a href="#" onclick="event.preventDefault();showResetPassword()" style="color:var(--accent);font-size:13px;">パスワードを忘れた方</a></p>
      <div style="display:flex;align-items:center;gap:12px;margin:24px 0;">
        <div style="flex:1;height:1px;background:var(--border);"></div>
        <span style="font-size:12px;color:var(--sub);">または</span>
        <div style="flex:1;height:1px;background:var(--border);"></div>
      </div>
      <button onclick="loginWithGoogle()" style="width:100%;padding:14px;font-size:16px;border-radius:14px;border:1px solid var(--border);background:#fff;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:'Zen Maru Gothic',sans-serif;">
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:20px;height:20px;"> Googleでログイン
      </button>
      <p style="text-align:center;margin-top:24px;"><a href="#" onclick="event.preventDefault();document.getElementById('loginOverlay').remove()" style="color:var(--sub);font-size:13px;">戻る</a></p>
    </div>`;
  document.body.appendChild(overlay);
}

async function doLogin() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) { alert('メールアドレスとパスワードを入力してください'); return; }
  try {
    const { data: res, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) { alert('ログインエラー: ' + error.message); return; }
    _sbUser = res.user;
    // ログイン後：クラウドにデータがあれば読み込み、なければローカルデータをクラウドに保存
    await sbLoad();
    await sbSave(); // ローカルデータをクラウドに初回保存
    render();
    document.getElementById('loginOverlay')?.remove();
    document.getElementById('onboardingOverlay').style.display = 'none';
    localStorage.setItem(OB_KEY, '1');
    showLoginWarningHide();
    showToast('ログインしました');
  } catch(e) { alert('ログインに失敗しました: ' + e.message); }
}

async function loginWithGoogle() {
  try {
    const { error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://awai.gift/' }
    });
    if (error) alert('Googleログインエラー: ' + error.message);
  } catch(e) { alert('Googleログインに失敗しました'); }
}

function showResetPassword() {
  const email = document.getElementById('loginEmail')?.value?.trim() || '';
  const input = prompt('パスワードリセット用のメールアドレスを入力してください', email);
  if (!input) return;
  resetPassword(input);
}

async function resetPassword(email) {
  try {
    const { error } = await _sb.auth.resetPasswordForEmail(email);
    if (error) { alert('エラー: ' + error.message); return; }
    showToast('リセットメールを送信しました');
  } catch(e) { alert('送信に失敗しました: ' + e.message); }
}

async function logoutAccount() {
  if (!confirm('ログアウトしますか？\nローカルデータも削除されます。')) return;
  try {
    await _sb.auth.signOut();
    localStorage.clear();
    location.reload();
  } catch(e) { alert('ログアウトに失敗しました: ' + e.message); }
}

// ===== Constants =====
const APP_VERSION = '2.1';
const STORAGE_KEY = 'awai_data';
const SEASON_KEY = 'awai_season';
const ANN_POPUP_KEY = 'awai_ann_popup_date';
const VERSION_KEY = 'awai_last_version';
const TABS = ['wish','received','gave','place','people','groups','items'];
const MODAL_TITLES = { wish:'お気に入り', received:'もらった', gave:'あげた', place:'行きたい', people:'友だち', groups:'グループ' };
const SEASON_ICONS = { spring:'🌸', summer:'🌊', autumn:'🍂', winter:'❄️' };
const LABEL_COLORS = ['#e8a598','#7a9ad4','#8abf7a','#c49a6c','#b07acc','#d4956a','#7ec8d9','#d48a7a','#8ea4bf','#6bab8a'];

// ===== State =====
let data = { wish:[], received:[], gave:[], place:[], people:[], groups:[], items:[], labels:{wish:[],received:[],gave:[],place:[],items:[]} };
let currentTab = localStorage.getItem('awai_last_tab') || 'people';
let currentLabel = localStorage.getItem('awai_last_label') || (currentTab==='people'?'individual':null);
if (currentLabel === '') currentLabel = null;
let editingId = null;
let editPhotoAction = 'keep';
let searchQuery = '';
let rankMode = false;
let annSortMode = null; // null=off, 'asc'=近い順, 'desc'=遠い順
let calViewMode = 'calendar'; // 'calendar' or 'list'
let openPersonId = null;

// ===== Data =====
function loadData() {
  // v2.1リセット: 古いデータをクリアして再スタート（1回だけ実行）
  if (!localStorage.getItem('awai_v21_reset')) {
    localStorage.setItem('awai_v21_reset', '1');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('awai_onboarding_done');
    localStorage.removeItem('awai_auto_backup');
    try { sessionStorage.removeItem('awai_auto_backup'); } catch(e) {}
    // マイルストーン等のフラグもクリア
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('awai_ms_') || k.startsWith('awai_milestone_') || k.startsWith('awai_action_') || k.startsWith('awai_streak_')) {
        localStorage.removeItem(k);
      }
    });
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      TABS.forEach(t => { if (Array.isArray(p[t])) data[t] = p[t]; });
      if (p.labels) {
        data.labels = {...data.labels, ...p.labels};
        // Merge received/gave labels into gift
        if (!data.labels.gift) data.labels.gift = [];
        ['received','gave'].forEach(t => {
          if (data.labels[t]?.length) {
            data.labels[t].forEach(l => {
              if (!data.labels.gift.some(g=>g.name===l.name)) data.labels.gift.push(l);
            });
            delete data.labels[t];
          }
        });
      }
    }
    // Ensure all items have an id
    let needsSave = false;
    TABS.forEach(t => {
      (data[t]||[]).forEach(item => {
        if (!item.id) { item.id = item.createdAt || genId(); needsSave = true; }
      });
    });
    if (needsSave) saveData();
    // Migrate from old format
    const old = localStorage.getItem('gn_data');
    if (old && !raw) {
      const p = JSON.parse(old);
      ['wish','received','gave','place'].forEach(t => { if (Array.isArray(p[t])) data[t] = p[t]; });
      if (Array.isArray(p.birthday)) {
        data.people = p.birthday.map(b => ({
          ...b, nickname: b.title, type: 'individual',
          anniversaries: b.date ? [{name:'🎂 誕生日', date:b.date, dateType:'monthday', reminders:[30]}] : [],
          interests: b.interests || [], sizes:{}, smoking:null, drinking:null,
          foodLike:[], foodDislike:[], brands:[], personality:[], family:[], fullName:null, relation:null
        }));
      }
      saveData();
    }
  } catch(e) { console.error('Load error', e); }
  // セーフティネット: LocalStorageが空でsessionStorageにバックアップがある場合は復元
  const hasData = data.people.length > 0 || data.wish.length > 0 || data.place.length > 0 || data.received.length > 0 || data.gave.length > 0;
  if (!hasData) {
    try {
      const autoBackup = sessionStorage.getItem('awai_auto_backup');
      if (autoBackup) {
        const p = JSON.parse(autoBackup);
        TABS.forEach(t => { if (Array.isArray(p[t])) data[t] = p[t]; });
        if (p.labels) data.labels = {...data.labels, ...p.labels};
        saveData();
        showToast('自動バックアップからデータを復元しました');
      }
    } catch(e2) {}
  }
}
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem('awai_data_updated', new Date().toISOString());
    try { sessionStorage.setItem('awai_auto_backup', JSON.stringify(data)); } catch(e2) {}
    // クラウド同期（非同期・失敗してもローカル保存は成功）
    sbSave();
    // マイルストーン祝福チェック
    setTimeout(() => checkMilestoneCelebration(), 500);
  } catch(e) {
    console.error('Save error:', e);
    alert('保存に失敗しました。写真が多すぎる可能性があります。不要な写真を削除してください。');
  }
}

// ===== Helpers =====
function esc(str) { const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }
function parseTags(str) { return str ? str.split(/[,、，\s]+/).map(s=>s.trim().toLowerCase()).filter(Boolean) : []; }
function truncUrl(u) { return u.length>40 ? u.substring(0,40)+'…' : u; }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function personIcon(p) {
  if (p.type==='corporate') return {emoji:'🏢', bg:'var(--accent-light)'};
  const g = p.gender||'unset';
  const svg = (c) => `<svg viewBox="0 0 24 24" style="width:60%;height:60%;"><circle cx="12" cy="8" r="4" fill="${c}"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="${c}"/></svg>`;
  if (g==='female') return {emoji:svg('#e8879a'), bg:'#fff'};
  if (g==='male') return {emoji:svg('#7a9ec7'), bg:'#fff'};
  return {emoji:svg('#b0a49e'), bg:'#fff'};
}

// ===== Date Helper (timezone safe) =====
function toLocalDateStr(d) {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
}

// ===== Season =====
function getAutoSeason() {
  const m = new Date().getMonth()+1;
  if (m>=3&&m<=5) return 'spring'; if (m>=6&&m<=8) return 'summer';
  if (m>=9&&m<=11) return 'autumn'; return 'winter';
}
function setSeason(s) {
  document.body.dataset.season = s;
  document.getElementById('seasonBtn').textContent = SEASON_ICONS[s];
  localStorage.setItem(SEASON_KEY, s);
  document.querySelectorAll('.season-option').forEach(el => el.classList.toggle('active', el.dataset.season===s));
}

// ===== Special Events & Animations =====
const ANIMAL_EMOJIS = ['🐱','🐈','🐈‍⬛','😺','😸','😻','😼','🐶','🐕','🐩','🐻','🐻‍❄️','🐰','🐇','🦊','🐼','🐨','🦁','🐯','🐮','🐷','🐸','🐵','🙈','🦄','🐧','🐦','🐤','🦜','🦩','🐹','🐭','🦝','🦦','🦥','🐿️','🦔','🐺','🦋','🐬','🐳','🐙','🐾','🐝','🦒','🐘','🦘','🦫','🦭','🐞'];

function getSpecialEvent() {
  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const dow = today.getDay();
  const md = `${m}/${d}`;

  // 固定日イベント
  const fixed = {
    '1/1': { type: 'newyear', emoji: '🎍', anim: 'snow', msg: '' },
    '1/2': { type: 'newyear', emoji: '🎍', anim: 'snow', msg: '' },
    '1/3': { type: 'newyear', emoji: '🎍', anim: 'snow', msg: '' },
    '2/3': { type: 'setsubun', emoji: '👹', anim: 'lantern', msg: '' },
    '2/14': { type: 'valentine', emoji: '💝', anim: 'sparkle', msg: '' },
    '3/3': { type: 'hinamatsuri', emoji: '🎎', anim: 'sakura', msg: '' },
    '3/14': { type: 'whiteday', emoji: '🤍', anim: 'sparkle', msg: '' },
    '4/1': { type: 'aprilfool', emoji: '🐾', anim: 'none', msg: '' },
    '5/5': { type: 'kodomonohi', emoji: '🎏', anim: 'lantern', msg: '' },
    '7/7': { type: 'tanabata', emoji: '🎋', anim: 'sparkle', msg: '' },
    '8/13': { type: 'obon', emoji: '🏮', anim: 'lantern', msg: '' },
    '8/14': { type: 'obon', emoji: '🏮', anim: 'lantern', msg: '' },
    '8/15': { type: 'obon', emoji: '🏮', anim: 'lantern', msg: '' },
    '10/31': { type: 'halloween', emoji: '🎃', anim: 'pumpkin', msg: '' },
    '11/15': { type: 'shichigosan', emoji: '👘', anim: 'confetti', msg: '' },
    '11/23': { type: 'thanksgiving', emoji: '🙏', anim: 'autumn', msg: '' },
    '12/24': { type: 'christmas', emoji: '🎄', anim: 'snow', msg: '' },
    '12/25': { type: 'christmas', emoji: '🎄', anim: 'snow', msg: '' },
    '12/31': { type: 'omisoka', emoji: '🎆', anim: 'sparkle', msg: '' },
  };

  if (fixed[md]) return fixed[md];

  // 変動日イベント
  // 成人の日（1月第2月曜）
  if (m === 1 && dow === 1 && d >= 8 && d <= 14) return { type: 'seijin', emoji: '🎊', anim: 'confetti', msg: '' };
  // 春分の日（3/20前後）
  if (m === 3 && d >= 19 && d <= 21) return { type: 'shunbun', emoji: '🌸', anim: 'sakura', msg: '' };
  // 母の日（5月第2日曜）
  if (m === 5 && dow === 0 && d >= 8 && d <= 14) return { type: 'mothersday', emoji: '🌹', anim: 'sakura', msg: '' };
  // 父の日（6月第3日曜）
  if (m === 6 && dow === 0 && d >= 15 && d <= 21) return { type: 'fathersday', emoji: '👔', anim: 'confetti', msg: '' };
  // 敬老の日（9月第3月曜）
  if (m === 9 && dow === 1 && d >= 15 && d <= 21) return { type: 'keiro', emoji: '👴', anim: 'autumn', msg: '' };
  // 秋分の日（9/22-23前後）
  if (m === 9 && d >= 22 && d <= 24) return { type: 'shubun', emoji: '🍁', anim: 'autumn', msg: '' };

  // 本人の誕生日
  const myProfile = getMyProfile();
  if (myProfile.anniversaries) {
    for (const a of myProfile.anniversaries) {
      if (!a.date) continue;
      const parts = a.date.split('-');
      const annMD = parts.length >= 2 ? `${parseInt(parts[parts.length-2])}/${parseInt(parts[parts.length-1])}` : '';
      if (annMD === md) {
        return { type: 'birthday', emoji: '🎂', anim: 'confetti', msg: '' };
      }
    }
  }

  return null;
}

function showSpecialAnimation(animType) {
  if (animType === 'none' || !animType) return;
  const container = document.createElement('div');
  container.id = 'specialAnim';
  container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);

  const particles = {
    confetti: { chars: ['🎊','✨','🎉','⭐','💫','🌟'], colors: ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6ec7'] },
    snow: { chars: ['❄️','❄','✨','⛄','🌨'], colors: ['#fff','#e8f4ff','#d4eaff'] },
    sakura: { chars: ['🌸','🌺','💮','✿','❀'], colors: ['#ffb7c5','#ff91a4','#ffc0cb'] },
    sparkle: { chars: ['✨','⭐','💫','🌟','⚡','💖'], colors: ['#ffd700','#ff69b4','#87ceeb'] },
    autumn: { chars: ['🍁','🍂','🍃','🌾','🍄'], colors: ['#d4760a','#c0392b','#f39c12'] },
    pumpkin: { chars: ['🎃','👻','🦇','🕷','✨'], colors: ['#ff8c00','#800080','#00ff00'] },
    lantern: { chars: ['🏮','✨','🔥','💫','🌟'], colors: ['#ff6347','#ffa500','#ffd700'] }
  };

  const p = particles[animType] || particles.confetti;
  let count = 0;
  const maxParticles = 30;

  const interval = setInterval(() => {
    if (count >= maxParticles) { clearInterval(interval); return; }
    const el = document.createElement('div');
    el.textContent = p.chars[Math.floor(Math.random() * p.chars.length)];
    el.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;font-size:${16+Math.random()*16}px;opacity:0.8;transition:none;`;
    container.appendChild(el);

    const duration = 3000 + Math.random() * 3000;
    const swayX = (Math.random() - 0.5) * 200;
    el.animate([
      { transform: 'translateY(0) translateX(0) rotate(0deg)', opacity: 0.9 },
      { transform: `translateY(${window.innerHeight + 50}px) translateX(${swayX}px) rotate(${Math.random()*720-360}deg)`, opacity: 0 }
    ], { duration, easing: 'ease-in' }).onfinish = () => el.remove();

    count++;
  }, 200);

  // 8秒後にコンテナを削除
  setTimeout(() => { if (container.parentNode) container.remove(); }, 10000);
}

function applyAprilFool() {
  const today = new Date();
  if (today.getMonth() !== 3 || today.getDate() !== 1) return false;
  // personIconを一時的に上書き
  if (!window._originalPersonIcon) window._originalPersonIcon = personIcon;
  window._aprilFoolAnimals = {};
  const origFn = window._originalPersonIcon;
  window.personIcon = function(p) {
    if (p.type === 'corporate') return origFn(p);
    if (!window._aprilFoolAnimals[p.id||p.nickname]) {
      window._aprilFoolAnimals[p.id||p.nickname] = ANIMAL_EMOJIS[Math.floor(Math.random() * ANIMAL_EMOJIS.length)];
    }
    return { emoji: window._aprilFoolAnimals[p.id||p.nickname], bg: '#fff' };
  };
  return true;
}

function checkSpecialEvent() {
  const shown = localStorage.getItem('awai_special_event_date');
  const today = new Date().toISOString().split('T')[0];
  if (shown === today) return;

  const event = getSpecialEvent();
  if (!event) return;

  localStorage.setItem('awai_special_event_date', today);

  // エイプリルフール特別処理
  if (event.type === 'aprilfool') {
    applyAprilFool();
    render();
    return;
  }

  // アニメーション
  setTimeout(() => showSpecialAnimation(event.anim), 1000);
}

// ===== Celebration System =====
function getTotalItemCount() {
  return (data.wish?.length||0) + (data.received?.length||0) + (data.gave?.length||0)
       + (data.place?.length||0) + (data.people?.filter(p=>!p.isMemory&&!p.isSample)?.length||0);
}
function getTabCount(tab) {
  if (tab === 'people') return data.people?.filter(p=>!p.isMemory&&!p.isSample)?.length||0;
  return data[tab]?.length||0;
}

// 合計マイルストーン（100以降も20刻みで永続）
function getTotalMilestone(n) {
  const fixed = [5,10,20,30,50,75,100];
  if (fixed.includes(n)) return true;
  if (n > 100 && n % 20 === 0) return true;
  return false;
}
const TOTAL_MS = {
  5:   { emoji:'🌱', title:'はじめの一歩！', sub:'5個の大切なものが集まりました' },
  10:  { emoji:'🌿', title:'いい調子！', sub:'あなたの世界が広がっています' },
  20:  { emoji:'✨', title:'20個！', sub:'習慣になってきましたね' },
  30:  { emoji:'🌸', title:'すごい！', sub:'素敵なコレクション' },
  50:  { emoji:'🎉', title:'50個達成！', sub:'AWAIマスターへの道' },
  75:  { emoji:'💫', title:'75個！', sub:'あなたの記録はかけがえのない宝物' },
  100: { emoji:'💎', title:'100個達成！', sub:'あなたの世界は豊かです' },
};
function getTotalMsData(n) {
  if (TOTAL_MS[n]) return TOTAL_MS[n];
  if (n >= 200 && n % 100 === 0) return { emoji:'🏆', title:`${n}個！`, sub:'素晴らしい継続力です' };
  return { emoji:'🎊', title:`${n}個！`, sub:'どんどん豊かになっていますね' };
}

// タブ別マイルストーン
const TAB_MS = {
  people: { points:[3,5,10,20,30,50], msgs:{
    3:{emoji:'👥',title:'3人の大切な人'},5:{emoji:'👥',title:'5人！素敵な輪'},10:{emoji:'👥',title:'10人！豊かな人間関係'},
    20:{emoji:'👥',title:'20人！'},30:{emoji:'👥',title:'30人！'},50:{emoji:'👥',title:'50人！'}
  }},
  wish: { points:[3,5,10,20,30,50], msgs:{
    3:{emoji:'⭐',title:'3つのお気に入り'},5:{emoji:'⭐',title:'5つ！好きなものがわかってきた'},10:{emoji:'⭐',title:'10個！センスが光ります'},
    20:{emoji:'⭐',title:'20個！'},30:{emoji:'⭐',title:'30個！'},50:{emoji:'⭐',title:'50個！'}
  }},
  place: { points:[3,5,10,20,30], msgs:{
    3:{emoji:'📍',title:'3つの行きたい場所'},5:{emoji:'📍',title:'5つ！冒険心'},10:{emoji:'📍',title:'10か所！旅の地図が広がる'},
    20:{emoji:'📍',title:'20か所！'},30:{emoji:'📍',title:'30か所！'}
  }},
  received: { points:[1,3,5,10,20], msgs:{
    1:{emoji:'🎀',title:'最初のギフト記録！'},3:{emoji:'🎀',title:'3つのもらった記録'},5:{emoji:'🎀',title:'5つ！大切にされていますね'},
    10:{emoji:'🎀',title:'10個！'},20:{emoji:'🎀',title:'20個！'}
  }},
  gave: { points:[1,3,5,10,20], msgs:{
    1:{emoji:'🎁',title:'最初の贈り物記録！'},3:{emoji:'🎁',title:'3つのあげた記録'},5:{emoji:'🎁',title:'5つ！あなたの優しさ'},
    10:{emoji:'🎁',title:'10個！'},20:{emoji:'🎁',title:'20個！'}
  }}
};

// 行動ベース演出
function checkActionCelebration(action) {
  const key = 'awai_action_' + action;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, new Date().toISOString());
  const actions = {
    first_ai: { emoji:'💡', title:'コンシェルジュデビュー！', sub:'AIがあなたの力になります' },
    first_photo: { emoji:'📷', title:'最初の写真登録！', sub:'撮るだけで記録が増えていきます' },
    first_gift: { emoji:'🎁', title:'最初のギフト記録！', sub:'忘れない気持ちが素敵です' },
    first_place: { emoji:'📍', title:'最初の場所登録！', sub:'行きたい場所がある人生は楽しい' },
  };
  const a = actions[action];
  if (a) showMiniCelebration(a.emoji, a.title, a.sub);
}

// 連続ログイン
function checkLoginStreak() {
  const today = new Date().toISOString().split('T')[0];
  const lastOpen = localStorage.getItem('awai_last_open_date');
  const streak = parseInt(localStorage.getItem('awai_login_streak')||'0');

  if (lastOpen === today) return; // 今日は既にカウント済み

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  let newStreak = (lastOpen === yesterday) ? streak + 1 : 1;
  localStorage.setItem('awai_last_open_date', today);
  localStorage.setItem('awai_login_streak', String(newStreak));

  const streakMS = {3:'3日連続！',5:'5日連続！',7:'1週間！',14:'2週間！',21:'3週間！',30:'1ヶ月！',60:'2ヶ月！',90:'3ヶ月！',180:'半年！',365:'1年！'};
  if (streakMS[newStreak]) {
    const key = 'awai_streak_' + newStreak;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, today);
      setTimeout(() => showMiniCelebration('🔥', streakMS[newStreak], `${newStreak}日連続でAWAIを開いています`), 1500);
    }
  }
}

// AWAI記念日（インストールからの日数）
function checkAwaiAnniversary() {
  const installed = localStorage.getItem('awai_installed_date');
  const today = new Date().toISOString().split('T')[0];
  if (!installed) { localStorage.setItem('awai_installed_date', today); return; }
  const days = Math.floor((new Date(today) - new Date(installed)) / 86400000);
  const annivs = {7:'1週間',30:'1ヶ月',90:'3ヶ月',180:'半年',365:'1年',730:'2年'};
  if (annivs[days]) {
    const key = 'awai_anniv_' + days;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, today);
      setTimeout(() => showMiniCelebration('🎂', `AWAIと${annivs[days]}！`, `${days}日間、一緒に歩んできました`), 2000);
    }
  }
}

// ミニ演出（トースト風・パーティクル少なめ）
function showMiniCelebration(emoji, title, sub) {
  // ミニパーティクル
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:9998;overflow:hidden;';
  document.body.appendChild(container);
  const chars = ['✨','💫','⭐','🌟'];
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.textContent = chars[Math.floor(Math.random()*chars.length)];
      el.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;font-size:${14+Math.random()*12}px;`;
      container.appendChild(el);
      el.animate([
        { transform:'translateY(0) rotate(0deg)', opacity:0.8 },
        { transform:`translateY(${window.innerHeight+40}px) rotate(${Math.random()*360}deg)`, opacity:0 }
      ], { duration:2500+Math.random()*2000, easing:'ease-in' }).onfinish = () => el.remove();
    }, i * 100);
  }
  setTimeout(() => container.remove(), 6000);

  // バナー表示
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%) translateY(-20px);z-index:10000;background:var(--card);border-radius:20px;padding:16px 24px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.18);opacity:0;transition:all 0.5s cubic-bezier(0.34,1.56,0.64,1);max-width:300px;width:85%;';
  banner.innerHTML = `<div style="font-size:32px;margin-bottom:6px;">${emoji}</div>
    <div style="font-size:16px;font-weight:700;color:var(--text);">${title}</div>
    <div style="font-size:12px;color:var(--sub);margin-top:4px;">${sub}</div>`;
  document.body.appendChild(banner);
  requestAnimationFrame(() => { banner.style.opacity='1'; banner.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(() => {
    banner.style.opacity='0'; banner.style.transform='translateX(-50%) translateY(-20px)';
    setTimeout(() => banner.remove(), 500);
  }, 3500);
}

// フル演出（大きなマイルストーン用）
function showFullCelebration(emoji, title, sub, number, label) {
  // パーティクル
  const container = document.createElement('div');
  container.id = 'milestoneAnim';
  container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  const pChars = ['🎊','✨','🎉','⭐','💫','🌟','💖'];
  let cnt = 0;
  const maxP = number >= 100 ? 50 : number >= 30 ? 40 : 30;
  const iv = setInterval(() => {
    if (cnt >= maxP) { clearInterval(iv); return; }
    const el = document.createElement('div');
    el.textContent = pChars[Math.floor(Math.random()*pChars.length)];
    el.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;font-size:${18+Math.random()*18}px;opacity:0.9;`;
    container.appendChild(el);
    el.animate([
      { transform:'translateY(0) translateX(0) rotate(0deg)', opacity:0.95 },
      { transform:`translateY(${window.innerHeight+60}px) translateX(${(Math.random()-0.5)*250}px) rotate(${Math.random()*720-360}deg)`, opacity:0 }
    ], { duration:2500+Math.random()*3000, easing:'ease-in' }).onfinish = () => el.remove();
    cnt++;
  }, 120);
  setTimeout(() => { if (container.parentNode) container.remove(); }, 10000);

  // カード
  setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.id = 'milestoneOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity 0.5s ease;';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--card);border-radius:24px;padding:36px 28px;text-align:center;max-width:320px;width:85%;box-shadow:0 20px 60px rgba(0,0,0,0.25);transform:scale(0.7);transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1);';
    card.innerHTML = `
      <div style="font-size:56px;margin-bottom:12px;animation:milestoneBounce 0.6s ease 0.5s both;">${emoji}</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px;">${title}</div>
      <div style="font-size:14px;color:var(--sub);margin-bottom:6px;line-height:1.6;">${sub}</div>
      <div style="font-size:40px;font-weight:800;color:var(--accent);margin:16px 0;">${number}</div>
      <div style="font-size:12px;color:var(--sub);margin-bottom:20px;">${label}</div>
      <button onclick="closeMilestone()" style="padding:12px 32px;border-radius:50px;border:none;background:var(--accent);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;box-shadow:0 4px 12px rgba(193,154,132,0.4);transition:transform 0.2s ease;">ありがとう！</button>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity='1'; card.style.transform='scale(1)'; });
  }, 600);
}

function closeMilestone() {
  const ov = document.getElementById('milestoneOverlay');
  if (ov) { ov.style.opacity='0'; setTimeout(() => ov.remove(), 500); }
}

// メインチェック（saveData から呼ばれる）
function checkMilestoneCelebration() {
  // 合計マイルストーン
  const total = getTotalItemCount();
  if (getTotalMilestone(total)) {
    const key = 'awai_ms_total_' + total;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, new Date().toISOString());
      const ms = getTotalMsData(total);
      if (total >= 50 || total % 100 === 0) {
        showFullCelebration(ms.emoji, ms.title, ms.sub, total, 'アイテム登録数');
      } else {
        showMiniCelebration(ms.emoji, ms.title, ms.sub);
      }
      return; // 1回の保存で1演出まで
    }
  }

  // タブ別マイルストーン
  for (const [tab, conf] of Object.entries(TAB_MS)) {
    const count = getTabCount(tab);
    if (conf.points.includes(count)) {
      const key = 'awai_ms_' + tab + '_' + count;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, new Date().toISOString());
        const m = conf.msgs[count] || { emoji:'🎊', title:`${count}個！` };
        const tabNames = {people:'友だち',wish:'お気に入り',place:'行きたい場所',received:'もらったギフト',gave:'あげたギフト'};
        showMiniCelebration(m.emoji, m.title, tabNames[tab]+'が'+count+(tab==='people'?'人':'個'));
        return;
      }
    }
    // タブ別も10個以降は10刻みで永続
    if (count > 50 && count % 10 === 0) {
      const key = 'awai_ms_' + tab + '_' + count;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, new Date().toISOString());
        const tabNames = {people:'友だち',wish:'お気に入り',place:'行きたい場所',received:'もらったギフト',gave:'あげたギフト'};
        showMiniCelebration('🎊', `${tabNames[tab]}${count}${tab==='people'?'人':'個'}！`, 'すごいペースです');
        return;
      }
    }
  }
}

// 起動時チェック
function checkStartupCelebrations() {
  checkLoginStreak();
  checkAwaiAnniversary();
}

// ===== Anniversary helpers =====
function daysUntil(dateStr, dateType) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const parts = dateStr.split('-');
  if (dateType === 'month') {
    const m = parseInt(parts[1]||parts[0])-1;
    let target = new Date(today.getFullYear(), m, 1);
    if (target < today) target.setFullYear(target.getFullYear()+1);
    return Math.ceil((target-today)/(1000*60*60*24));
  }
  const month = parseInt(parts.length>=2?parts[parts.length-2]:parts[0])-1;
  const day = parseInt(parts.length>=2?parts[parts.length-1]:1);
  let bd = new Date(today.getFullYear(), month, day); bd.setHours(0,0,0,0);
  if (bd < today) bd.setFullYear(bd.getFullYear()+1);
  return Math.ceil((bd-today)/(1000*60*60*24));
}
function formatAnnDate(dateStr, dateType) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (dateType === 'full') return dateStr;
  if (dateType === 'month') return (parseInt(parts[1]||parts[0]))+'月';
  const m = parts.length>=2 ? parseInt(parts[parts.length-2]) : parseInt(parts[0]);
  const d = parts.length>=2 ? parseInt(parts[parts.length-1]) : '';
  return m+'月'+d+'日';
}

function daysSince(dateStr, dateType) {
  if (!dateStr || dateType !== 'full') return null;
  const parts = dateStr.split('-');
  if (parts.length < 3) return null;
  const past = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  past.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  if (past > today) return null;
  return Math.floor((today - past) / (1000*60*60*24));
}

const ELAPSED_MODE_KEY = 'awai_elapsed_mode';
let elapsedMode = localStorage.getItem(ELAPSED_MODE_KEY) || 'days'; // days or years

function toggleElapsedMode() {
  elapsedMode = elapsedMode==='days' ? 'years' : 'days';
  localStorage.setItem(ELAPSED_MODE_KEY, elapsedMode);
  render();
}

function formatElapsed(days) {
  if (days === null) return '';
  if (elapsedMode === 'days') {
    return days.toLocaleString() + '日目';
  } else {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    if (years > 0) return (years+1) + '年目（' + years + '年' + (months>0?months+'ヶ月':'') + '）';
    if (months > 0) return months + 'ヶ月目';
    return days + '日目';
  }
}

// ===== Search =====
function matchesSearch(item, tab) {
  // 検索時、大切な人タブでは非表示の人を除外（非表示フィルター以外）
  if (searchQuery && tab === 'people' && item.hidden && currentLabel !== 'hidden') return false;
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const fields = [item.title, item.nickname, item.name, item.description, item.person, item.memo, item.fullName, item.relation,
    item.drinking, item.smoking, item.industry, item.address, item.position, item.companyLink,
    ...(item.tags||[]), ...(item.interests||[]),
    ...(item.foodLike||[]), ...(item.foodDislike||[]), ...(item.brands||[]),
    ...(item.personality||[]), ...(item.oshi||[]), ...(item.family||[]).map(f=>f.name+' '+f.note)
  ].filter(Boolean);
  // For groups, also search member names
  if (item.memberIds) {
    item.memberIds.forEach(id => {
      const p = data.people.find(x=>x.id===id);
      if (p) fields.push(p.nickname, p.fullName, p.relation);
    });
  }
  return fields.some(f => f && f.toLowerCase().includes(q));
}

// ===== Pickup =====
function findMatchingPeople(tags) {
  if (!tags||!tags.length) return [];
  return data.people.filter(p => {
    if (p.isMemory) return false;
    const allPrefs = [...(p.interests||[]), ...(p.foodLike||[]), ...(p.brands||[]), ...(p.oshi||[])];
    if (!allPrefs.length) return false;
    return tags.some(t => allPrefs.some(i => t.toLowerCase().includes(i.toLowerCase())||i.toLowerCase().includes(t.toLowerCase())));
  }).map(p => {
    const allPrefs = [...(p.interests||[]), ...(p.foodLike||[]), ...(p.brands||[]), ...(p.oshi||[])];
    return {
      name: p.nickname||'名前なし',
      matched: [...new Set(tags.filter(t => allPrefs.some(i => t.toLowerCase().includes(i.toLowerCase())||i.toLowerCase().includes(t.toLowerCase()))))]
    };
  }).filter(m=>m.matched.length).sort((a,b)=>b.matched.length-a.matched.length);
}

// ===== Reminders =====
function renderReminders() {
  const zone = document.getElementById('reminderZone');
  const reminders = [];
  data.people.forEach(p => {
    (p.anniversaries||[]).forEach(a => {
      const days = daysUntil(a.date, a.dateType);
      if (days === null) return;
      const shouldShow = (a.reminders||[30]).some(r => days <= r);
      if (shouldShow && days <= 60) {
        reminders.push({ name: p.nickname||'名前なし', event: a.name, days, dateType: a.dateType, interests: p.interests||[] });
      }
    });
  });
  reminders.sort((a,b) => a.days-b.days);
  if (!reminders.length) { zone.innerHTML=''; return; }
  zone.innerHTML = reminders.slice(0,3).map(r => {
    const urgent = r.days <= 7;
    const badgeClass = r.days===0?'today':r.days<=7?'soon':'far';
    const badgeText = r.days===0?'今日！':'あと'+r.days+'日';
    return `<div class="reminder-item ${urgent?'urgent':''}">
      <span class="r-emoji">${r.event.match(/[\p{Emoji}]/u)?r.event.match(/[\p{Emoji}]/u)[0]:'📅'}</span>
      <div class="r-info"><div class="r-name">${esc(r.name)}</div><div class="r-event">${esc(r.event)}</div></div>
      <span class="reminder-badge ${badgeClass}">${badgeText}</span>
    </div>`;
  }).join('');
}

function renderPickup() {
  const zone = document.getElementById('pickupZone');
  if (currentTab==='people' || currentTab==='groups') { zone.innerHTML=''; return; }

  // Only show when searching or filtering by category
  const isSearching = searchQuery && searchQuery.length > 0;
  const isCategoryFilter = currentLabel !== null && typeof currentLabel === 'string' && currentLabel !== 'closed';

  if (!isSearching && !isCategoryFilter) { zone.innerHTML=''; return; }

  // Collect tags from visible items + search keyword + category genres
  const searchTags = [];
  if (isSearching) searchTags.push(searchQuery);
  if (isCategoryFilter && currentTab === 'place') {
    const catName = currentLabel.replace(/^[^\s]+\s/, '');
    searchTags.push(catName);
    (PLACE_CATEGORIES[currentLabel]||[]).forEach(g => searchTags.push(g));
  }
  if (isCategoryFilter && ['wish','received','gave'].includes(currentTab)) {
    const catName = currentLabel.replace(/^[^\s]+\s/, '');
    searchTags.push(catName);
    (ITEM_CATEGORIES[currentLabel]||[]).forEach(g => searchTags.push(g));
  }
  // Also include tags from filtered items (only items matching current filter)
  let filteredItems = (data[currentTab]||[]).filter(i => matchesSearch(i, currentTab));
  if (isCategoryFilter && ['wish','received','gave'].includes(currentTab)) {
    filteredItems = filteredItems.filter(i => i.itemCategory === currentLabel);
  } else if (isCategoryFilter && currentTab === 'place') {
    filteredItems = filteredItems.filter(i => i.placeCategory === currentLabel);
  }
  filteredItems.forEach(i => (i.tags||[]).forEach(t => { if (!searchTags.includes(t)) searchTags.push(t); }));

  const matches = findMatchingPeople(searchTags);
  if (!matches.length) { zone.innerHTML=''; return; }

  zone.innerHTML = `<div class="pickup-mini" style="animation:fadeUp 0.3s ease;"><div class="pickup-mini-title">💡 喜びそうな人</div>${
    matches.slice(0,3).map(m =>
      `<div class="pickup-mini-row"><span class="pickup-mini-person" style="cursor:pointer;" onclick="jumpToPerson('${data.people.find(p=>p.nickname===m.name)?.id||''}')">${esc(m.name)}</span>${m.matched.map(t=>`<span class="pickup-mini-tag">${esc(t)}</span>`).join('')}</div>`
    ).join('')
  }</div>`;
}

// ===== Labels =====
function getLabelKey(tab) { return (tab==='gave'||tab==='received') ? 'gift' : tab; }
function getLabels(tab) { return data.labels[getLabelKey(tab)]||[]; }
function autoLabelItem(item, tab) {
  if (item.labelIdx !== null && item.labelIdx !== undefined) return;
  const labels = getLabels(tab);
  const text = [item.title, item.memo, ...(item.tags||[])].filter(Boolean).join(' ').toLowerCase();
  labels.forEach((l, i) => { if (text.includes(l.name.toLowerCase())) item.labelIdx = i; });
}
function calGoToday() {
  const d = new Date();
  _calYear = d.getFullYear();
  _calMonth = d.getMonth();
  render();
}

let _dialYear, _dialMonth;

function calJumpToDate() {
  const y = document.getElementById('calJumpYear')?.value;
  const m = document.getElementById('calJumpMonth')?.value;
  if (m) {
    _calMonth = parseInt(m) - 1;
    if (y) _calYear = parseInt(y);
    render();
  }
}

function dialYear(dir) {
  const el = document.getElementById('dialYearVal');
  if (!el) return;
  let v = parseInt(el.textContent) + dir;
  if (v < 1900) v = 1900;
  if (v > 2100) v = 2100;
  el.textContent = v;
  el.style.animation = 'none'; void el.offsetHeight;
  el.style.animation = dir > 0 ? 'dialUp 0.15s ease' : 'dialDown 0.15s ease';
}

function dialMonth(dir) {
  const el = document.getElementById('dialMonthVal');
  if (!el) return;
  let v = parseInt(el.textContent) + dir;
  if (v < 1) v = 12;
  if (v > 12) v = 1;
  el.textContent = v;
  el.style.animation = 'none'; void el.offsetHeight;
  el.style.animation = dir > 0 ? 'dialUp 0.15s ease' : 'dialDown 0.15s ease';
}

function calDialJump() {
  const y = parseInt(document.getElementById('dialYearVal')?.textContent);
  const m = parseInt(document.getElementById('dialMonthVal')?.textContent);
  if (y && m) {
    _calYear = y;
    _calMonth = m - 1;
    render();
  }
}

function renderLabelBar() {
  const bar = document.getElementById('labelBar');
  if (currentTab==='calendar') {
    const today = new Date();
    const isToday = _calYear===today.getFullYear() && _calMonth===today.getMonth();
    const todayDate = today.getDate();
    bar.innerHTML = `<div class="label-chip ${isToday?'active':''}" onclick="calGoToday()"><span class="cal-date-icon" style="width:18px;height:20px;border-width:1.5px;"><span style="display:block;width:100%;height:5px;background:var(--accent);border-radius:3px 3px 0 0;"></span><span style="font-size:10px;font-weight:700;color:var(--text);line-height:1;margin-top:1px;">${todayDate}</span></span> 今日</div>
      <div class="label-chip add" onclick="const t=new Date();calDayTap(t.getFullYear(),t.getMonth(),t.getDate())">＋</div>`;
    return;
  }
  if (currentTab==='people') {
    let phtml = `<div class="label-chip ${currentLabel===null?'active':''}" style="color:var(--accent);${currentLabel===null?'border-color:var(--accent);':''}" onclick="filterLabel(null)"><span class="ldot" style="background:var(--accent);"></span> すべて</div>`;
    phtml += `<div class="label-chip ${currentLabel==='individual'?'active':''}" style="color:#d48a7a;${currentLabel==='individual'?'border-color:#d48a7a;':''}" onclick="filterLabel('individual')"><span class="ldot" style="background:#d48a7a;"></span> 👤 友だち</div>`;
    phtml += `<div class="label-chip ${currentLabel==='corporate'?'active':''}" style="color:#6b88a8;${currentLabel==='corporate'?'border-color:#6b88a8;':''}" onclick="filterLabel('corporate')"><span class="ldot" style="background:#6b88a8;"></span> 🏢 会社</div>`;
    phtml += `<div class="label-chip ${currentLabel==='groups'?'active':''}" style="color:#8a7acc;${currentLabel==='groups'?'border-color:#8a7acc;':''}" onclick="filterLabel('groups')"><span class="ldot" style="background:#8a7acc;"></span> 👥 グループ</div>`;
    phtml += `<div class="label-chip ${currentLabel==='memory'?'active':''}" style="color:#a09590;${currentLabel==='memory'?'border-color:#a09590;':''}" onclick="filterLabel('memory')"><span class="ldot" style="background:#a09590;"></span> 🤍 記憶</div>`;
    bar.innerHTML = phtml;
    return;
  }
  // Gift tab: カテゴリのみ（あげた/もらったはランキング横のボタンで）
  if (currentTab==='gift') {
    let html = `<div class="label-chip ${currentLabel===null||currentLabel==='received'||currentLabel==='gave'?'active':''}" onclick="filterLabel(null)"><span class="ldot" style="background:var(--accent);"></span> すべて</div>`;
    _itemCatData.forEach((cat, ci) => {
      const active = currentLabel === cat;
      html += `<div class="label-chip ${active?'active':''}" onclick="filterItemCat(${ci})">${_itemCatEmoji[ci]} ${cat}</div>`;
    });
    bar.innerHTML = html;
    return;
  }
  // Item tabs: category-based filter
  if (['wish','received','gave','items'].includes(currentTab)) {
    let html = `<div class="label-chip ${currentLabel===null?'active':''}" style="color:var(--accent);${currentLabel===null?'border-color:var(--accent);':''}" onclick="filterLabel(null)"><span class="ldot" style="background:var(--accent);"></span> すべて</div>`;
    _itemCatData.forEach((cat, ci) => {
      const active = currentLabel === cat;
      html += `<div class="label-chip ${active?'active':''}" style="color:var(--text);${active?'border-color:var(--accent);background:var(--accent-light);':''}" onclick="filterItemCat(${ci})">${_itemCatEmoji[ci]} ${cat}</div>`;
    });
    // ラベル
    const labels = getLabels(currentTab);
    labels.forEach((l,i) => {
      html += `<div class="label-chip ${currentLabel===i?'active':''}" style="color:${l.color};${currentLabel===i?'border-color:'+l.color+';':''}" onclick="filterLabel(${i})"><span class="ldot" style="background:${l.color};"></span> ${esc(l.name)}</div>`;
    });
    html += `<div class="label-chip add" onclick="openLabelModal()">＋</div>`;
    bar.innerHTML = html;
    return;
  }
  // Place tab: category-based filter + 記憶
  if (currentTab==='place') {
    let html = `<div class="label-chip ${currentLabel===null?'active':''}" style="color:var(--accent);${currentLabel===null?'border-color:var(--accent);':''}" onclick="filterLabel(null)"><span class="ldot" style="background:var(--accent);"></span> すべて</div>`;
    _placeCatData.forEach((cat, ci) => {
      const active = currentLabel === cat;
      html += `<div class="label-chip ${active?'active':''}" style="color:var(--text);${active?'border-color:var(--accent);background:var(--accent-light);':''}" onclick="filterPlaceCat(${ci})">${_placeCatEmoji[ci]} ${cat}</div>`;
    });
    html += `<div class="label-chip ${currentLabel==='closed'?'active':''}" style="color:#a09590;${currentLabel==='closed'?'border-color:#a09590;':''}" onclick="filterLabel('closed')"><span class="ldot" style="background:#a09590;"></span> 🤍 記憶</div>`;
    bar.innerHTML = html;
    return;
  }
  const labels = getLabels(currentTab);
  let html = `<div class="label-chip ${currentLabel===null?'active':''}" style="color:var(--accent);${currentLabel===null?'border-color:var(--accent);':''}" onclick="filterLabel(null)"><span class="ldot" style="background:var(--accent);"></span> すべて</div>`;
  labels.forEach((l,i) => {
    html += `<div class="label-chip ${currentLabel===i?'active':''}" style="color:${l.color};${currentLabel===i?'border-color:'+l.color+';':''}" onclick="filterLabel(${i})"><span class="ldot" style="background:${l.color};"></span> ${esc(l.name)}</div>`;
  });
  html += `<div class="label-chip add" onclick="openLabelModal()">＋</div>`;
  bar.innerHTML = html;
  // スクロールリセット＋ヒントアニメーション（スクロール可能な場合のみ）
  bar.scrollLeft = 0;
  bar.classList.remove('hint-anim');
  const wrap = bar.parentElement;
  if (wrap) wrap.classList.remove('scrolled-end');
  requestAnimationFrame(() => {
    if (bar.scrollWidth > bar.clientWidth + 10) {
      void bar.offsetHeight;
      bar.classList.add('hint-anim');
      if (wrap) wrap.classList.remove('scrolled-end');
    } else {
      if (wrap) wrap.classList.add('scrolled-end');
    }
  });
}
function filterLabel(idx) { currentLabel=idx; render(); }
function filterGiftType(type) { currentLabel = currentLabel===type ? null : type; render(); }
// カテゴリ: データ保存はテキストのみ、表示時に絵文字を付与
const _itemCatData = ['ファッション','グルメ','お菓子','美容・健康','インテリア','家電・ガジェット','趣味・体験','ギフト券','その他'];
const _itemCatEmoji = ['👕','🍽','🍪','💄','🏠','📱','📚','🎁','📋'];
const _placeCatData = ['食事','遊び','観光','買い物','宿泊','リラックス','その他'];
const _placeCatEmoji = ['🍽','🎮','📸','🛍','🏨','💆','📋'];

const ITEM_CATEGORIES = {
  'ファッション': ['服','靴','バッグ','アクセサリー','時計','帽子','財布','ストール','ネクタイ','サングラス'],
  'グルメ': ['お酒','コーヒー','紅茶','調味料','お取り寄せ','フルーツ','ワイン','日本酒','焼酎'],
  'お菓子': ['チョコレート','焼き菓子','和菓子','ケーキ','クッキー','ゼリー','アイス','おせんべい','ナッツ','ギフトボックス'],
  '美容・健康': ['コスメ','オイル','スキンケア','香水','ヘアケア','入浴剤','サプリ','マッサージ','アロマ'],
  'インテリア': ['雑貨','キッチン用品','食器','花','観葉植物','キャンドル','タオル','寝具','文房具'],
  '家電・ガジェット': ['イヤホン','スピーカー','充電器','スマホケース','カメラ','家電','ゲーム'],
  '趣味・体験': ['本','音楽','映画','チケット','体験ギフト','習い事','旅行券','スポーツ用品'],
  'ギフト券': ['Amazonギフト','商品券','カタログギフト','QUOカード','食事券','旅行券'],
  'その他': []
};
const PLACE_CATEGORIES = {
  '食事': ['和食','洋食','イタリアン','フレンチ','中華','焼肉','寿司','ラーメン','カレー','居酒屋','バー','カフェ','パン屋','スイーツ','ビュッフェ','鉄板焼き','海鮮','うどん・そば'],
  '遊び': ['カラオケ','ボウリング','テーマパーク','ゲームセンター','映画館','ライブ','スポーツ観戦','釣り','キャンプ','BBQ','ドライブ','プール','スキー','ゴルフ'],
  '観光': ['神社','お寺','温泉','絶景','公園','美術館','博物館','水族館','動物園','城','庭園','展望台','街歩き','離島','世界遺産'],
  '買い物': ['ショッピングモール','アウトレット','商店街','百貨店','セレクトショップ','お土産','市場','蚤の市'],
  '宿泊': ['ホテル','旅館','民宿','グランピング','コテージ','ゲストハウス'],
  'リラックス': ['スパ','マッサージ','エステ','サウナ','岩盤浴','ヨガ','リトリート'],
  'その他': []
};
const ALL_ITEM_GENRES = [...new Set(Object.values(ITEM_CATEGORIES).flat())];
const ALL_PLACE_GENRES = [...new Set(Object.values(PLACE_CATEGORIES).flat())];
function catDisplay(data, emoji, idx) { return emoji[idx] + ' ' + data[idx]; }
function filterItemCat(ci) { currentLabel = _itemCatData[ci]; render(); }
function filterPlaceCat(ci) { currentLabel = _placeCatData[ci]; render(); }

// ===== Render items =====
function renderStars(rating, itemId, tab) {
  const r = rating||0;
  let html = '<div class="card-stars">';
  for (let i=1; i<=5; i++) {
    html += `<span class="card-star ${i<=r?'on':''}" onclick="setRating('${tab}','${itemId}',${i})" style="cursor:pointer;">★</span>`;
  }
  html += '</div>';
  return html;
}

// ===== Place Modal =====
function openPlaceModal(id) {
  editingId = id||null;
  const modal = document.getElementById('modal');
  const isEdit = !!editingId;
  const item = isEdit ? data.place.find(i=>i.id===editingId) : null;
  const labels = getLabels('place');

  let html = `<h2>行きたい を${isEdit?'編集':'追加'}</h2>`;
  html += `<div class="form-group"><label>店名・場所名 <span style="color:#c97070;font-size:11px;">* 必須</span></label><input id="fTitle" placeholder="例：鳥貴族 名駅店、伏見稲荷大社" value="${esc(item?.title||'')}"></div>`;

  // Labels
  if (labels.length) {
    html += `<div class="form-group"><label>ラベル</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">`;
    labels.forEach((l,i) => {
      const active = item?.labelIdx===i;
      html += `<div class="label-chip ${active?'active':''}" style="color:${l.color};${active?'border-color:'+l.color+';background:'+l.color+'18;':''}" onclick="toggleFormLabel(this,${i})"><span class="ldot" style="background:${l.color};"></span> ${esc(l.name)}</div>`;
    });
    html += `</div><input type="hidden" id="fLabelIdx" value="${item?.labelIdx??''}"></div>`;
  }

  // Category + Genre tags with association
  const currentTags = item?.tags || [];
  const currentCat = item?.placeCategory || '';

  html += `<div class="form-group"><label>カテゴリ</label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">`;
  const _pcKeys = Object.keys(PLACE_CATEGORIES);
  _pcKeys.forEach((cat, ci) => {
    const active = currentCat === cat;
    const _pEmoji = _placeCatEmoji[_placeCatData.indexOf(cat)] || '';
    html += `<div class="date-type-chip ${active?'active':''}" onclick="selectPlaceCatByIdx(this,${ci})" style="font-size:13px;padding:6px 14px;">${_pEmoji} ${cat}</div>`;
  });
  html += `</div><input type="hidden" id="fPlaceCategory" value="${currentCat}"></div>`;

  html += `<div class="form-group"><label>ジャンル・目的</label>
    <div id="placeGenreTags" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">`;
  const showTags = currentCat && PLACE_CATEGORIES[currentCat] ? PLACE_CATEGORIES[currentCat] : ALL_PLACE_GENRES;
  showTags.forEach(g => {
    const active = currentTags.includes(g.toLowerCase()) || currentTags.includes(g);
    html += `<div class="date-type-chip ${active?'active':''}" onclick="togglePlaceTag(this,'${g}')" style="font-size:12px;">${g}</div>`;
  });
  html += `</div>
    <input id="fTags" placeholder="その他のタグ（カンマ区切り）" value="${currentTags.filter(t=>!ALL_PLACE_GENRES.map(g=>g.toLowerCase()).includes(t)&&!ALL_PLACE_GENRES.includes(t)).join(', ')}">
    <input type="hidden" id="fPlaceSelectedTags" value="${currentTags.filter(t=>ALL_PLACE_GENRES.map(g=>g.toLowerCase()).includes(t)||ALL_PLACE_GENRES.includes(t)).join(',')}">
  </div>`;

  // Star rating
  const curRating = item?.rating||0;
  html += `<div class="form-group"><label>期待度</label><div class="stars" id="fStars">`;
  for (let i=1; i<=5; i++) html += `<span class="star ${i<=curRating?'on':''}" onclick="setFormStar(${i})">★</span>`;
  html += `</div><input type="hidden" id="fRating" value="${curRating}"></div>`;

  // Address + Map
  html += `<div class="form-group"><label>📍 住所</label>
    <input id="fAddress" placeholder="例：東京都渋谷区..." value="${esc(item?.address||'')}">
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
      <button class="card-btn" onclick="openMapSearch()" style="font-size:13px;">🗺 Googleマップで検索</button>
      <span id="fMapLinkStatus" style="font-size:12px;color:#6bab8a;display:${item?.googleMapUrl?'inline':'none'};">✓ リンク登録済み</span>
    </div>
    <input type="hidden" id="fGoogleMapUrl" value="${esc(item?.googleMapUrl||'')}">
  </div>`;

  // Homepage URL
  html += `<div class="form-group"><label>🔗 ホームページURL</label>
    <input id="fMapUrl" placeholder="https://..." value="${esc(item?.mapUrl||item?.url||'')}">
    <div class="form-hint">お店や施設のURLを貼り付け</div>
  </div>`;

  // Phone number
  html += `<div class="form-group"><label>📞 連絡先</label>
    <input id="fPhone" type="tel" placeholder="例：058-123-4567" value="${esc(item?.phone||'')}">
  </div>`;

  // Who to go with (multiple + groups)
  const selectedWith = item?.withPeople || (item?.person ? [item.person] : []);
  const selectedGroups = item?.withGroups || [];
  html += `<div class="form-group"><label>誰と行きたい？</label>
    <div class="form-hint" style="margin-bottom:6px;">タップで選択（複数OK）</div>
    <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:4px;">`;
  // Groups first
  if (data.groups.length) {
    data.groups.forEach(g => {
      const checked = selectedGroups.includes(g.id);
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;${checked?'background:var(--accent-light);':''}border-radius:8px;margin-bottom:2px;" onclick="togglePlaceWith(this,'group','${g.id}')">
        <span style="font-size:14px;">👥</span>
        <span style="font-size:13px;font-weight:${checked?'600':'400'};">${esc(g.name)}</span>
        <span style="font-size:11px;color:var(--sub);">${(g.memberIds||[]).length}人</span>
        ${checked?'<span style="margin-left:auto;color:var(--accent);">✓</span>':''}
      </div>`;
    });
  }
  // People
  data.people.filter(p=>p.type!=='corporate').forEach(p => {
    const checked = selectedWith.includes(p.nickname);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;${checked?'background:var(--accent-light);':''}border-radius:8px;margin-bottom:2px;" onclick="togglePlaceWith(this,'person','${esc(p.nickname)}')">
      <span style="font-size:14px;">👤</span>
      <span style="font-size:13px;font-weight:${checked?'600':'400'};">${esc(p.nickname)}</span>
      ${checked?'<span style="margin-left:auto;color:var(--accent);">✓</span>':''}
    </div>`;
  });
  html += `</div>
    <input type="hidden" id="fWithPeople" value="${selectedWith.join(',')}">
    <input type="hidden" id="fWithGroups" value="${selectedGroups.join(',')}">
  </div>`;

  // Memo
  html += `<div class="form-group"><label>メモ</label><textarea id="fMemo" placeholder="営業時間、予算感、おすすめメニューなど">${esc(item?.memo||'')}</textarea></div>`;

  // Photo
  html += photoInputHTML('fImg', item?.img);

  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="savePlaceItem()">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function selectPlaceCatByIdx(el, ci) {
  selectPlaceCategory(el, _placeCatData[ci]);
}

function selectPlaceCategory(el, cat) {
  const input = document.getElementById('fPlaceCategory');
  const wasActive = el.classList.contains('active');
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c => c.classList.remove('active'));
  if (wasActive) {
    input.value = '';
  } else {
    el.classList.add('active');
    input.value = cat;
  }
  // Update genre tags based on category
  const selectedTags = document.getElementById('fPlaceSelectedTags').value ? document.getElementById('fPlaceSelectedTags').value.split(',').filter(Boolean) : [];
  const showTags = input.value && PLACE_CATEGORIES[input.value] ? PLACE_CATEGORIES[input.value] : ALL_PLACE_GENRES;
  const container = document.getElementById('placeGenreTags');
  container.innerHTML = showTags.map(g => {
    const active = selectedTags.includes(g.toLowerCase()) || selectedTags.includes(g);
    return `<div class="date-type-chip ${active?'active':''}" onclick="togglePlaceTag(this,'${g}')" style="font-size:12px;">${g}</div>`;
  }).join('');
}

function togglePlaceTag(el, tag) {
  el.classList.toggle('active');
  const input = document.getElementById('fPlaceSelectedTags');
  let tags = input.value ? input.value.split(',').filter(Boolean) : [];
  if (el.classList.contains('active')) {
    if (!tags.includes(tag.toLowerCase())) tags.push(tag.toLowerCase());
  } else {
    tags = tags.filter(t => t !== tag.toLowerCase());
  }
  input.value = tags.join(',');
}

function togglePlaceWith(el, type, value) {
  const input = document.getElementById(type==='group'?'fWithGroups':'fWithPeople');
  let vals = input.value ? input.value.split(',').filter(Boolean) : [];
  if (vals.includes(value)) {
    vals = vals.filter(v=>v!==value);
    el.style.background = '';
    el.querySelector('span:last-child')?.remove();
  } else {
    vals.push(value);
    el.style.background = 'var(--accent-light)';
    if (!el.querySelector('[style*="margin-left:auto"]')) {
      el.insertAdjacentHTML('beforeend', '<span style="margin-left:auto;color:var(--accent);">✓</span>');
    }
  }
  input.value = vals.join(',');
  // Also update font weight
  el.querySelector('span:nth-child(2)').style.fontWeight = vals.includes(value)?'600':'400';
}

function openMapSearch() {
  const address = document.getElementById('fAddress')?.value.trim();
  const title = document.getElementById('fTitle')?.value.trim();
  const query = address || title || '';
  if (!query) { alert('店名か住所を入力してから検索してください'); return; }
  const mapUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(query);
  document.getElementById('fGoogleMapUrl').value = mapUrl;
  document.getElementById('fMapLinkStatus').style.display = 'inline';
  window.open(mapUrl, '_blank');
}

function openPlaceMemoryModal(id) {
  editingId = id||null;
  const modal = document.getElementById('modal');
  const isEdit = !!editingId;
  const item = isEdit ? data.place.find(i=>i.id===editingId) : null;
  const labels = getLabels('place');

  let html = `<h2>🤍 記憶の場所を${isEdit?'編集':'追加'}</h2>`;
  html += `<div class="form-group"><label>場所の名前 <span style="color:#c97070;font-size:11px;">* 必須</span></label><input id="fTitle" placeholder="例：炭火焼肉 牛角 岐阜店、じいちゃんの畑" value="${esc(item?.title||'')}"></div>`;

  // Labels
  if (labels.length) {
    html += `<div class="form-group"><label>ラベル</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">`;
    labels.forEach((l,i) => {
      const active = item?.labelIdx===i;
      html += `<div class="label-chip ${active?'active':''}" style="color:${l.color};${active?'border-color:'+l.color+';background:'+l.color+'18;':''}" onclick="toggleFormLabel(this,${i})"><span class="ldot" style="background:${l.color};"></span> ${esc(l.name)}</div>`;
    });
    html += `</div><input type="hidden" id="fLabelIdx" value="${item?.labelIdx??''}"></div>`;
  }

  // Category + Genre tags
  const currentTags = item?.tags || [];
  const currentCat = item?.placeCategory || '';

  html += `<div class="form-group"><label>カテゴリ</label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">`;
  const _pcKeys = Object.keys(PLACE_CATEGORIES);
  _pcKeys.forEach((cat, ci) => {
    const active = currentCat === cat;
    const _pEmoji = _placeCatEmoji[_placeCatData.indexOf(cat)] || '';
    html += `<div class="date-type-chip ${active?'active':''}" onclick="selectPlaceCatByIdx(this,${ci})" style="font-size:13px;padding:6px 14px;">${_pEmoji} ${cat}</div>`;
  });
  html += `</div><input type="hidden" id="fPlaceCategory" value="${currentCat}"></div>`;

  html += `<div class="form-group"><label>ジャンル・目的</label>
    <div id="placeGenreTags" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">`;
  const showTags = currentCat && PLACE_CATEGORIES[currentCat] ? PLACE_CATEGORIES[currentCat] : ALL_PLACE_GENRES;
  showTags.forEach(g => {
    const active = currentTags.includes(g.toLowerCase()) || currentTags.includes(g);
    html += `<div class="date-type-chip ${active?'active':''}" onclick="togglePlaceTag(this,'${g}')" style="font-size:12px;">${g}</div>`;
  });
  html += `</div>
    <input id="fTags" placeholder="その他のタグ（カンマ区切り）" value="${currentTags.filter(t=>!ALL_PLACE_GENRES.map(g=>g.toLowerCase()).includes(t)&&!ALL_PLACE_GENRES.includes(t)).join(', ')}">
    <input type="hidden" id="fPlaceSelectedTags" value="${currentTags.filter(t=>ALL_PLACE_GENRES.map(g=>g.toLowerCase()).includes(t)||ALL_PLACE_GENRES.includes(t)).join(',')}">
  </div>`;

  // Star rating - 思い出の大切さとして
  const curRating = item?.rating||0;
  html += `<div class="form-group"><label>大切さ</label><div class="stars" id="fStars">`;
  for (let i=1; i<=5; i++) html += `<span class="star ${i<=curRating?'on':''}" onclick="setFormStar(${i})">★</span>`;
  html += `</div><input type="hidden" id="fRating" value="${curRating}"></div>`;

  // Address + Map
  html += `<div class="form-group"><label>📍 住所</label>
    <input id="fAddress" placeholder="例：岐阜県各務原市..." value="${esc(item?.address||'')}">
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
      <button class="card-btn" onclick="openMapSearch()" style="font-size:13px;">🗺 Googleマップで検索</button>
      <span id="fMapLinkStatus" style="font-size:12px;color:#6bab8a;display:${item?.googleMapUrl?'inline':'none'};">✓ リンク登録済み</span>
    </div>
    <input type="hidden" id="fGoogleMapUrl" value="${esc(item?.googleMapUrl||'')}">
  </div>`;

  // Homepage URL
  html += `<div class="form-group"><label>🔗 ホームページURL</label>
    <input id="fMapUrl" placeholder="https://..." value="${esc(item?.mapUrl||item?.url||'')}">
  </div>`;

  // Phone
  html += `<div class="form-group"><label>📞 連絡先</label>
    <input id="fPhone" type="tel" placeholder="例：058-123-4567" value="${esc(item?.phone||'')}">
  </div>`;

  // Who
  const selectedWith = item?.withPeople || (item?.person ? [item.person] : []);
  const selectedGroups = item?.withGroups || [];
  html += `<div class="form-group"><label>誰との思い出？</label>
    <div class="form-hint" style="margin-bottom:6px;">タップで選択（複数OK）</div>
    <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:4px;">`;
  if (data.groups.length) {
    data.groups.forEach(g => {
      const checked = selectedGroups.includes(g.id);
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;${checked?'background:var(--accent-light);':''}border-radius:8px;margin-bottom:2px;" onclick="togglePlaceWith(this,'group','${g.id}')">
        <span style="font-size:14px;">👥</span>
        <span style="font-size:13px;font-weight:${checked?'600':'400'};">${esc(g.name)}</span>
        <span style="font-size:11px;color:var(--sub);">${(g.memberIds||[]).length}人</span>
        ${checked?'<span style="margin-left:auto;color:var(--accent);">✓</span>':''}
      </div>`;
    });
  }
  data.people.filter(p=>p.type!=='corporate').forEach(p => {
    const checked = selectedWith.includes(p.nickname);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;${checked?'background:var(--accent-light);':''}border-radius:8px;margin-bottom:2px;" onclick="togglePlaceWith(this,'person','${esc(p.nickname)}')">
      <span style="font-size:14px;">👤</span>
      <span style="font-size:13px;font-weight:${checked?'600':'400'};">${esc(p.nickname)}</span>
      ${checked?'<span style="margin-left:auto;color:var(--accent);">✓</span>':''}
    </div>`;
  });
  html += `</div>
    <input type="hidden" id="fWithPeople" value="${selectedWith.join(',')}">
    <input type="hidden" id="fWithGroups" value="${selectedGroups.join(',')}">
  </div>`;

  // Memo - 記憶向けplaceholder
  html += `<div class="form-group"><label>📝 メモ</label><textarea id="fMemo" placeholder="家族でよく行った焼肉屋。あの特製タレの味が忘れられない">${esc(item?.memo||'')}</textarea></div>`;

  // Photo
  html += photoInputHTML('fImg', item?.img);

  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="savePlaceItem(true)">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function savePlaceItem(asMemory) {
  const title = document.getElementById('fTitle').value.trim();
  if (!title) { alert(asMemory ? '場所の名前を入力してください' : '店名・場所名を入力してください'); return; }
  const fileInput = getPhotoData('fImg');

  // Combine selected tags + typed tags
  const selectedTags = document.getElementById('fPlaceSelectedTags')?.value.split(',').filter(Boolean) || [];
  const typedTags = parseTags(document.getElementById('fTags')?.value||'');
  const allTags = [...new Set([...selectedTags, ...typedTags])];

  const labelIdxEl = document.getElementById('fLabelIdx');
  const labelIdx = labelIdxEl&&labelIdxEl.value!=='' ? parseInt(labelIdxEl.value) : null;

  function doSave(imgData) {
    const item = {
      id: editingId || genId(),
      title,
      withPeople: document.getElementById('fWithPeople')?.value.split(',').filter(Boolean)||[],
      withGroups: document.getElementById('fWithGroups')?.value.split(',').filter(Boolean)||[],
      person: (document.getElementById('fWithPeople')?.value.split(',').filter(Boolean)||[]).join(', ')||null,
      labelIdx,
      address: document.getElementById('fAddress')?.value.trim()||null,
      mapUrl: document.getElementById('fMapUrl')?.value.trim()||null,
      url: document.getElementById('fMapUrl')?.value.trim()||null,
      googleMapUrl: document.getElementById('fGoogleMapUrl')?.value.trim()||null,
      phone: document.getElementById('fPhone')?.value.trim()||null,
      tags: allTags.length ? allTags : null,
      placeCategory: document.getElementById('fPlaceCategory')?.value||null,
      rating: parseInt(document.getElementById('fRating')?.value)||0,
      memo: document.getElementById('fMemo')?.value.trim()||null,
      img: imgData,
      pinned: editingId ? (data.place.find(i=>i.id===editingId)?.pinned||false) : false,
      createdAt: editingId ? (data.place.find(i=>i.id===editingId)?.createdAt||new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (asMemory) item.isClosed = true;
    autoLabelItem(item, 'place');
    if (editingId) {
      const idx = data.place.findIndex(i=>i.id===editingId);
      if (idx>=0) { if (asMemory) item.isClosed = data.place[idx].isClosed; data.place[idx] = item; }
    } else {
      data.place.push(item);
    }
    saveData(); closeModal(); render();
  }

  const removeFlag = document.getElementById('fImgRemove')?.value === '1';
  if (removeFlag) { doSave(null); return; }
  if (fileInput&&fileInput.files&&fileInput.files[0]) {
    compressImage(fileInput.files[0]).then(dataUrl => doSave(dataUrl));
  } else {
    doSave(editingId ? (data.place.find(i=>i.id===editingId)?.img||null) : null);
  }
}

// ===== All record detail toggle =====
let openAllRecordId = null;

function toggleAllRecordDetail(tab, id) {
  const key = tab + ':' + id;
  openAllRecordId = openAllRecordId === key ? null : key;
  render();
  if (openAllRecordId) {
    setTimeout(() => {
      const detail = document.getElementById('allRecordDetail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

// ===== Regift (give to someone) =====
let regiftSourceTab = null;
let regiftSourceId = null;

function regiftItem(tab, id) {
  const item = data[tab].find(i=>i.id===id);
  if (!item) return;
  regiftSourceTab = tab;
  regiftSourceId = id;
  const modal = document.getElementById('modal');

  let html = `<h2>🎁 「${esc(item.title)}」をプレゼントする</h2>`;
  html += `<div class="form-group"><label>誰にあげる？</label>`;
  if (data.people.length) {
    html += `<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;">`;
    data.people.filter(p=>p.type!=='corporate').forEach(p => {
      html += `<div class="list-item" onclick="regiftStep2('${p.id}')" style="padding:10px 12px;">
        <div class="list-avatar" style="width:36px;height:36px;font-size:18px;background:${p.avatar?'transparent':personIcon(p).bg}">${p.avatar?`<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">`:personIcon(p).emoji}</div>
        <div class="list-name" style="font-size:14px;">${esc(p.nickname)}</div>
      </div>`;
    });
    html += `</div>`;
  }
  html += `<div style="margin-top:8px;"><input id="rgManualName" placeholder="または名前を直接入力" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:12px;font-size:14px;font-family:'Zen Maru Gothic',sans-serif;color:var(--text);background:var(--bg);"></div>`;
  html += `</div>`;
  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="regiftStep2Manual()">次へ</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function regiftStep2(personId) {
  const person = data.people.find(p=>p.id===personId);
  if (person) showRegiftConfirm(person.nickname);
}

function regiftStep2Manual() {
  const name = document.getElementById('rgManualName')?.value.trim();
  if (!name) { alert('名前を入力するか、リストから選んでください'); return; }
  showRegiftConfirm(name);
}

function showRegiftConfirm(recipientName) {
  const item = data[regiftSourceTab]?.find(i=>i.id===regiftSourceId);
  if (!item) return;
  const modal = document.getElementById('modal');
  const today = toLocalDateStr();

  let html = `<h2>🎁 あげる内容を確認</h2>`;
  html += `<div style="background:var(--bg);border-radius:12px;padding:12px;margin-bottom:14px;">
    <div style="font-size:15px;font-weight:600;">${esc(item.title)}</div>
    <div style="font-size:13px;color:var(--sub);margin-top:4px;">→ ${esc(recipientName)} さんへ</div>
  </div>`;
  html += `<div class="form-group"><label>あげる相手</label><input id="rgRecipient" value="${esc(recipientName)}"></div>`;
  html += `<div class="form-group"><label>日付</label><input type="date" id="rgDate" value="${today}"></div>`;
  html += `<div class="form-group"><label>何の記念？（任意）</label><input id="rgOccasion" placeholder="例：誕生日、お礼、手土産"></div>`;
  html += `<div class="form-group"><label>金額（任意）</label><input type="number" id="rgAmount" placeholder="例：5000" value="${item.amount||''}"></div>`;
  html += `<div class="form-group"><label>メモ</label><textarea id="rgMemo" placeholder="一言メモ">${item.person ? item.person+'からもらったもの' : ''}</textarea></div>`;
  html += `<div class="form-btns">
    <button class="btn btn-secondary" onclick="regiftItem('${regiftSourceTab}','${regiftSourceId}')">← 戻る</button>
    <button class="btn btn-primary" onclick="doRegift()">✅ 記録する</button>
  </div>`;
  modal.innerHTML = html;
}

function doRegift() {
  const item = data[regiftSourceTab]?.find(i=>i.id===regiftSourceId);
  if (!item) return;
  const recipient = document.getElementById('rgRecipient').value.trim();
  if (!recipient) { alert('相手の名前を入力してください'); return; }
  const now = new Date().toISOString();
  const gaveItem = {
    id: genId(),
    title: item.title,
    person: recipient,
    date: document.getElementById('rgDate').value || now.split('T')[0],
    occasion: document.getElementById('rgOccasion').value.trim() || null,
    amount: document.getElementById('rgAmount').value || null,
    tags: item.tags || null,
    memo: document.getElementById('rgMemo').value.trim() || null,
    img: item.img || null,
    rating: null,
    pinned: false,
    createdAt: now,
    updatedAt: now
  };
  data.gave.push(gaveItem);
  saveData();
  closeModal();
  render();
}

// ===== Pin =====
function togglePin(tab, id) {
  const item = data[tab].find(i=>i.id===id);
  if (!item) return;
  item.pinned = !item.pinned;
  saveData(); render();
}

// Auto-label: match items by title, tags, memo
function autoLabelAll() {
  const tabs = ['wish','received','gave','place'];
  tabs.forEach(tab => {
    const labels = getLabels(tab);
    if (!labels.length) return;
    (data[tab]||[]).forEach(item => {
      if (item.labelIdx !== null && item.labelIdx !== undefined) return; // already labeled
      const text = [item.title, item.memo, ...(item.tags||[])].filter(Boolean).join(' ').toLowerCase();
      labels.forEach((l, i) => {
        if (text.includes(l.name.toLowerCase())) {
          item.labelIdx = i;
        }
      });
    });
  });
  saveData();
}

function markVisited(id) {
  const item = data.place.find(i=>i.id===id);
  if (!item) return;
  if (item.visited) {
    // Toggle off
    item.visited = false;
    item.visitedDate = null;
    saveData(); render();
    return;
  }
  // Show date input
  const modal = document.getElementById('modal');
  const today = toLocalDateStr();
  modal.innerHTML = `<h2>✅ 行った！</h2>
    <div style="background:var(--bg);border-radius:12px;padding:12px;margin-bottom:14px;">
      <div style="font-size:15px;font-weight:600;">${esc(item.title)}</div>
    </div>
    <div class="form-group"><label>いつ行った？</label><input type="date" id="visitDate" value="${today}"></div>
    <div class="form-group"><label>満足度</label><div class="stars" id="visitStars">
      ${[1,2,3,4,5].map(i=>`<span class="star ${i<=item.rating?'on':''}" onclick="document.getElementById('visitRating').value=${i};this.parentElement.querySelectorAll('.star').forEach((s,j)=>s.classList.toggle('on',j<${i}))">★</span>`).join('')}
    </div><input type="hidden" id="visitRating" value="${item.rating||0}"></div>
    <div class="form-group"><label>感想メモ</label><textarea id="visitMemo" placeholder="おすすめメニュー、雰囲気、また行きたいかなど">${esc(item.memo||'')}</textarea></div>
    <div class="form-group"><label>写真を追加</label>
      <input type="file" id="visitCamera" accept="image/*" capture="environment" style="display:none;" onchange="previewPhoto(this,'visitPhotoPreview')">
      <input type="file" id="visitFile" accept="image/*" style="display:none;" onchange="previewPhoto(this,'visitPhotoPreview')">
      <input type="hidden" id="visitPhotoRemove" value="">
      <div style="display:flex;gap:8px;">
        <div style="font-size:13px;color:var(--accent);cursor:pointer;padding:6px 14px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('visitCamera').click()">📷 カメラ</div>
        <div style="font-size:13px;color:var(--accent);cursor:pointer;padding:6px 14px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('visitFile').click()">📁 ファイル</div>
      </div>
      <div id="visitPhotoPreview">${item.img?`<div style="position:relative;display:inline-block;width:100%;"><img src="${item.img}" style="width:100%;max-height:160px;object-fit:cover;border-radius:12px;margin-top:6px;"><div style="position:absolute;top:10px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;" onclick="removePhoto('visitPhoto')">✕</div></div>`:''}</div>
    </div>
    <div class="form-btns">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="saveVisited('${id}')">✅ 記録する</button>
    </div>`;
  openModal();
}

function saveVisited(id) {
  const item = data.place.find(i=>i.id===id);
  if (!item) return;
  item.visited = true;
  item.visitedDate = document.getElementById('visitDate').value;
  item.rating = parseInt(document.getElementById('visitRating').value)||0;
  item.memo = document.getElementById('visitMemo').value.trim()||null;

  const camera = document.getElementById('visitCamera');
  const file = document.getElementById('visitFile');
  const photoInput = (file?.files?.length ? file : camera?.files?.length ? camera : null);
  const removeFlag = document.getElementById('visitPhotoRemove')?.value === '1';

  if (removeFlag) {
    item.img = null;
    saveData(); closeModal(); render();
  } else if (photoInput?.files?.[0]) {
    compressImage(photoInput.files[0]).then(dataUrl => { item.img = dataUrl; saveData(); closeModal(); render(); });
  } else {
    saveData(); closeModal(); render();
  }
}

function quickLabel(tab, id, labelIdx) {
  const item = data[tab].find(i=>i.id===id);
  if (!item) return;
  item.labelIdx = labelIdx===-1 ? null : (item.labelIdx===labelIdx ? null : labelIdx);
  saveData(); render();
}

function setRating(tab, id, rating) {
  const item = data[tab].find(i=>i.id===id);
  if (!item) return;
  item.rating = item.rating===rating ? 0 : rating; // tap same star to clear
  saveData(); render();
}

function setRankMode(on) {
  rankMode = on;
  annSortMode = null;
  document.getElementById('rankOnBtn').classList.toggle('active', on);
  const annBtn = document.getElementById('annSortBtn');
  if (annBtn) { annBtn.classList.remove('asc','desc','active'); annBtn.textContent = '📅 記念日順'; }
  render();
}

function toggleAnnSort() {
  rankMode = false;
  document.getElementById('rankOnBtn').classList.remove('active');
  if (annSortMode === null) annSortMode = 'asc';
  else if (annSortMode === 'asc') annSortMode = 'desc';
  else annSortMode = null;
  const btn = document.getElementById('annSortBtn');
  if (btn) {
    btn.classList.remove('asc','desc','active');
    const dIcon = `<span class="cal-date-icon" style="width:16px;height:18px;border-width:1.5px;"><span style="display:block;width:100%;height:4px;background:${annSortMode?'#fff':'var(--accent)'};border-radius:2px 2px 0 0;"></span><span style="font-size:9px;font-weight:700;color:${annSortMode?'#fff':'var(--text)'};line-height:1;margin-top:1px;">${new Date().getDate()}</span></span>`;
    if (annSortMode === 'asc') { btn.classList.add('asc','active'); btn.innerHTML = dIcon + ' 近い順 ↑'; }
    else if (annSortMode === 'desc') { btn.classList.add('desc','active'); btn.innerHTML = dIcon + ' 遠い順 ↓'; }
    else { btn.innerHTML = dIcon + ' 記念日順'; }
  }
  render();
}

function getNearestAnnDays(person) {
  let nearest = Infinity;
  (person.anniversaries||[]).forEach(a => {
    const d = daysUntil(a.date, a.dateType);
    if (d !== null && d < nearest) nearest = d;
  });
  return nearest === Infinity ? 9999 : nearest;
}

function renderItemCard(item, tab, rank) {
  let html = '<div class="card" style="position:relative;">';
  html += `<div style="position:absolute;top:42px;right:12px;display:flex;gap:8px;z-index:1;">
    <label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;" onclick="event.stopPropagation();">
      <input type="checkbox" ${item.pinned?'checked':''} onchange="event.stopPropagation();togglePin('${tab}','${item.id}')"><span>📌</span>
    </label>
    <label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;" onclick="event.stopPropagation();">
      <input type="checkbox" ${item.hidden?'checked':''} onchange="event.stopPropagation();toggleItemHidden('${tab}','${item.id}')"><span>${item.hidden?'👁':'👁‍🗨'}</span>
    </label>
  </div>`;
  if (rank) html += `<div style="display:flex;align-items:center;gap:8px;">
    <span class="rank-number">${rank}</span><div style="flex:1;">`;
  html += '<div class="card-title" style="padding-right:40px;">';
  html += esc(item.title||'無題');
  html += '</div>';
  html += renderStars(item.rating, item.id, tab);
  if (rank) html += '</div></div>';
  // Quick label assign - always use wish labels for unified view
  // No manual label chips - labels filter by tag matching
  if (item.withGroups?.length) {
    const groupNames = item.withGroups.map(gid => data.groups.find(g=>g.id===gid)?.name).filter(Boolean);
    if (groupNames.length) html += `<div class="card-person">👥 ${groupNames.map(n=>esc(n)).join(', ')}</div>`;
  }
  if (item.placeCategory) { const _pci=_placeCatData.indexOf(item.placeCategory); html += `<div style="font-size:13px;color:var(--accent);font-weight:600;margin-top:4px;">${_pci>=0?_placeCatEmoji[_pci]+' ':''}${esc(item.placeCategory)}</div>`; }
  if (item.itemCategory) { const _ici=_itemCatData.indexOf(item.itemCategory); html += `<div style="font-size:13px;color:var(--accent);font-weight:600;margin-top:4px;">${_ici>=0?_itemCatEmoji[_ici]+' ':''}${esc(item.itemCategory)}</div>`; }
  if (item.withPeople?.length) {
    const peopleLinks = item.withPeople.map(pid => {
      const pp = data.people.find(x=>x.id===pid);
      if (pp) return `<span style="color:var(--accent);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();jumpToPerson('${pid}')">${esc(pp.nickname)}</span>`;
      return `<span>${esc(pid)}</span>`;
    });
    html += `<div class="card-person">👤 ${peopleLinks.join(', ')}</div>`;
  } else if (item.person) {
    const names = item.person.split(/[,、]\s*/);
    const links = names.map(name => {
      const pp = data.people.find(x=>x.nickname===name||x.id===name);
      if (pp) return `<span style="color:var(--accent);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();jumpToPerson('${pp.id}')">${esc(pp.nickname)}</span>`;
      return `<span>${esc(name)}</span>`;
    });
    html += `<div class="card-person">👤 ${links.join(', ')}</div>`;
  }
  if (item.date) html += `<div class="card-sub">📅 ${item.date}</div>`;
  if (item.occasion) html += `<div class="card-occasion">${esc(item.occasion)}</div>`;
  if (item.amount) html += `<div class="card-amount">¥${Number(item.amount).toLocaleString()}</div>`;
  if (item.img) html += `<img class="card-img" src="${item.img}" alt="">`;
  if (item.memo) html += `<div class="card-memo">${esc(item.memo)}</div>`;
  if (item.aiLinks) {
    const _al = 'display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;font-size:11px;text-decoration:none;font-weight:500;margin:2px;';
    const linkMap = {
      rakuten: { label:'🛒 楽天', style:'background:#BF0000;color:#fff;' },
      amazon: { label:'🛒 Amazon', style:'background:#FF9900;color:#000;' },
      official: { label:'🔗 公式サイト', style:'background:#4A90D9;color:#fff;' },
      instagram: { label:'📸 Instagram', style:'background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;' },
      tabelog: { label:'🍽 食べログ', style:'background:#F09000;color:#fff;' },
      hotpepper: { label:'🔥 ホットペッパー', style:'background:#E60012;color:#fff;' },
      gurunavi: { label:'🍴 ぐるなび', style:'background:#E2001A;color:#fff;' }
    };
    html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">`;
    Object.entries(item.aiLinks).forEach(([key, url]) => {
      const info = linkMap[key] || { label:'🔗 '+key, style:'background:var(--accent);color:#fff;' };
      html += `<a href="${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="${_al}${info.style}">${info.label}</a>`;
    });
    html += `</div>`;
  }
  if (item.tags&&item.tags.length) html += `<div class="card-tags">${item.tags.map(t=>`<span class="card-tag">#${esc(t)}</span>`).join('')}</div>`;
  if (item.address) html += `<div style="font-size:13px;color:var(--sub);margin-top:6px;">📍 ${esc(item.address)}</div>`;
  if (item.phone) html += `<a href="tel:${esc(item.phone)}" style="display:block;font-size:13px;color:var(--accent);margin-top:6px;text-decoration:none;">📞 ${esc(item.phone)}</a>`;
  if (item.googleMapUrl) html += `<a class="card-url" href="${esc(item.googleMapUrl)}" target="_blank" rel="noopener" style="margin-top:6px;font-size:15px;">🗺 Googleマップで開く</a>`;
  if (item.mapUrl) html += `<a class="card-url" href="${esc(item.mapUrl)}" target="_blank" rel="noopener" style="margin-top:6px;font-size:15px;">🔗 ホームページを開く</a>`;
  else if (item.url) html += `<a class="card-url" href="${esc(item.url)}" target="_blank" rel="noopener" style="font-size:15px;">🔗 ${esc(truncUrl(item.url))}</a>`;
  const _bs = 'display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;font-size:13px;font-weight:500;cursor:pointer;font-family:"Zen Maru Gothic",sans-serif;';
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
    <button onclick="event.stopPropagation();regiftItem('${tab}','${item.id}')" style="${_bs}border:1px solid var(--pickup-border);background:linear-gradient(135deg,var(--pickup),#fff4e6);color:var(--text);">🎁 プレゼントする</button>
    <button onclick="event.stopPropagation();searchFromCard('${tab}','${item.id}')" style="${_bs}border:1px solid #d4c8e8;background:linear-gradient(135deg,#f3eefa,#ece0f8);color:#7a60a0;">🔍 もっと探す</button>
    ${tab==='place'&&!item.isClosed?`<button onclick="event.stopPropagation();markVisited('${item.id}')" style="${_bs}border:1px solid ${item.visited?'#a5d6a7':'var(--pickup-border)'};background:linear-gradient(135deg,${item.visited?'#e8f5e9':'var(--pickup)'},${item.visited?'#d4ecd6':'#fff4e6'});color:var(--text);">${item.visited?'✅ 行った！':'📍 行った！'}</button>`:''}
    ${tab==='place'&&!item.isClosed?`<button onclick="event.stopPropagation();closePlacePrompt('${item.id}')" style="${_bs}border:1px solid #d8d0c8;background:linear-gradient(135deg,#f5f0eb,#ece5dd);color:#8a7e74;">🤍 記憶に移す</button>`:''}
    ${tab==='place'&&item.isClosed?`<button onclick="event.stopPropagation();reopenPlace('${item.id}')" style="${_bs}border:1px solid #90caf9;background:linear-gradient(135deg,#e8f4ff,#d6ebfc);color:#4a7aaa;">↩ 戻す</button>`:''}
    ${tab!=='received'&&tab!=='gave'?`<button onclick="event.stopPropagation();shareItem('${tab}','${item.id}')" style="${_bs}border:1px solid #bdd8f0;background:linear-gradient(135deg,#e8f2fc,#daeaf8);color:#4a7aaa;">📤 共有</button>`:''}
    <button onclick="event.stopPropagation();editItem('${tab}','${item.id}')" style="${_bs}border:1px solid var(--border);background:linear-gradient(135deg,#faf8f6,#f3eeea);color:var(--text);">✏️ 編集</button>
    <button onclick="event.stopPropagation();duplicateItem('${tab}','${item.id}')" style="${_bs}border:1px solid #c8d8c0;background:linear-gradient(135deg,#f0f8ee,#e4f0e0);color:#6a8a60;">📋 コピー</button>
    <button onclick="event.stopPropagation();deleteItem('${tab}','${item.id}')" style="${_bs}border:1px solid #e8c0c0;background:linear-gradient(135deg,#fdf0f0,#f8e4e4);color:#c07070;">🗑 削除</button>
  </div></div>`;
  return html;
}

function renderPersonCard(p) {
  let html = '<div class="person-card" style="position:relative;">';
  const isCorp = p.type==='corporate';
  html += `<div style="position:absolute;top:42px;right:12px;display:flex;gap:8px;z-index:1;">
    <label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;" onclick="event.stopPropagation();">
      <input type="checkbox" ${p.pinned?'checked':''} onchange="event.stopPropagation();togglePin('people','${p.id}')"><span>📌</span>
    </label>
    <label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;" onclick="event.stopPropagation();">
      <input type="checkbox" ${p.hidden?'checked':''} onchange="event.stopPropagation();toggleHidden('${p.id}')"><span>${p.hidden?'👁':'👁‍🗨'}</span>
    </label>
  </div>`;
  html += `<div style="padding:8px 16px 0;"><span style="font-size:12px;color:var(--accent);cursor:pointer;" onclick="event.stopPropagation();openPersonId=null;render();window.scrollTo({top:0,behavior:'smooth'});">← 一覧に戻る</span></div>`;
  html += `<div class="person-header">
    <div class="person-avatar${isCorp?' biz-avatar':''}" style="overflow:hidden;background:${p.avatar?'':personIcon(p).bg};${p.avatar?'cursor:pointer;':''}" ${p.avatar?`onclick="event.stopPropagation();showAvatarFull('${p.id}')"`:''}>${p.avatar?`<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">`:(personIcon(p).emoji)}</div>
    <div><div class="person-nickname">${esc(p.nickname||'名前なし')}</div>
    ${p.relation?`<div class="person-relation">${esc(p.relation)}</div>`:''}
    ${p.corpFullName?`<div class="person-relation">${esc(p.corpFullName)}</div>`:''}
    ${p.fullName?`<div class="person-relation">${esc(p.fullName)}</div>`:''}
    ${p.position?`<div class="person-relation">${esc(p.position)}</div>`:''}
    ${p.industry?`<div class="person-relation">${esc(p.industry)}</div>`:''}
    ${p.companyLink?(()=>{const corp=data.people.find(x=>x.type==='corporate'&&(x.nickname===p.companyLink||x.corpNickname===p.companyLink||x.corpFullName===p.companyLink));return corp?`<div class="person-relation" style="color:var(--accent);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();jumpToPerson('${corp.id}')">🏢 ${esc(p.companyLink)}</div>`:`<div class="person-relation" style="color:var(--accent);">🏢 ${esc(p.companyLink)}</div>`;})():''}
    </div></div>
`;
  // Concierge button (between name and anniversaries)
  if (!p.isMemory) {
    html += `<div style="padding:8px 16px;display:flex;gap:8px;">
      <button class="card-btn" onclick="event.stopPropagation();openAiSuggest('${p.id}')" style="background:var(--pickup);border-color:var(--pickup-border);font-size:14px;padding:10px 16px;flex:1;">💡 コンシェルジュ</button>
      <button class="card-btn" onclick="event.stopPropagation();openPartnerLinks('${p.id}')" style="background:linear-gradient(135deg,#e8f2fc,#daeaf8);border-color:#bdd8f0;font-size:14px;padding:10px 16px;flex:1;">🎁 ギフトを探す</button>
    </div>`;
    // 仕掛け3: 過去の提案履歴（階層構造）
    if (p.aiHistory?.length) {
      html += `<div class="person-section"><div class="person-section-title" style="cursor:pointer;" onclick="event.stopPropagation();this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">💡 過去の提案 (${p.aiHistory.length}回) ▾</div>`;
      html += `<div style="display:none;">`;
      p.aiHistory.forEach((h, hi) => {
        const sceneLabel = h.scene || '条件なし';
        const budgetLabel = h.budget ? `・予算${Number(h.budget).toLocaleString()}円` : '';
        const toggleId = `aiHist_${p.id}_${hi}`;
        html += `<div style="margin-bottom:8px;background:var(--bg);border-radius:12px;overflow:hidden;">`;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;" onclick="event.stopPropagation();const el=document.getElementById('${toggleId}');el.style.display=el.style.display==='none'?'':'none'">
          <div>
            <span style="font-size:13px;font-weight:600;">${esc(sceneLabel)}${budgetLabel}</span>
            <span style="font-size:11px;color:var(--sub);margin-left:8px;">${h.date}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;color:var(--sub);">${(h.items||[]).length}件 ▾</span>
            <span onclick="event.stopPropagation();deleteAiHistory('${p.id}',${hi})" style="font-size:11px;color:#c97070;cursor:pointer;padding:2px 6px;">✕</span>
          </div>
        </div>`;
        html += `<div id="${toggleId}" style="display:none;padding:0 12px 10px;">`;
        (h.items||[]).forEach(item => {
          const price = item.budget ? `¥${Number(item.budget).toLocaleString()}` : '';
          html += `<div style="padding:8px 0;border-top:1px solid var(--border);">`;
          html += `<div style="font-size:14px;font-weight:600;font-family:'Shippori Mincho',serif;">${esc(item.name)}</div>`;
          html += `<div style="font-size:12px;color:var(--sub);margin:2px 0;">${esc(item.shop)}${price ? ' · ' + price : ''}${item.category ? ' · ' + esc(item.category) : ''}</div>`;
          if (item.reason) html += `<div style="font-size:12px;margin:4px 0;line-height:1.5;">${esc(item.reason)}</div>`;
          const _hl = 'display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:6px;font-size:10px;text-decoration:none;font-weight:500;margin:1px;';
          let linksHtml = '';
          if (item.rakutenUrl) linksHtml += `<a href="${esc(item.rakutenUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="${_hl}background:#BF0000;color:#fff;">🛒 楽天</a>`;
          if (item.amazonUrl) linksHtml += `<a href="${esc(item.amazonUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="${_hl}background:#FF9900;color:#000;">🛒 Amazon</a>`;
          if (item.webLinks?.official) linksHtml += `<a href="${esc(item.webLinks.official)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="${_hl}background:#4A90D9;color:#fff;">🔗 公式</a>`;
          if (item.webLinks?.instagram) linksHtml += `<a href="${esc(item.webLinks.instagram)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="${_hl}background:linear-gradient(45deg,#f09433,#dc2743,#bc1888);color:#fff;">📸</a>`;
          if (item.webLinks?.tabelog) linksHtml += `<a href="${esc(item.webLinks.tabelog)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="${_hl}background:#F09000;color:#fff;">🍽</a>`;
          if (linksHtml) html += `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">${linksHtml}</div>`;
          html += `</div>`;
        });
        html += `</div></div>`;
      });
      html += `</div></div>`;
    }
  }
  // Corporate photo (business card etc.)
  if (p.corpPhoto) {
    html += `<div class="person-section"><div class="person-section-title">📷 写真</div><img src="${p.corpPhoto}" style="width:100%;max-height:250px;object-fit:contain;border-radius:12px;"></div>`;
  }
  // Corporate members (people linked to this company)
  if (isCorp) {
    const members = data.people.filter(x => x.type!=='corporate' && x.companyLink && (x.companyLink===p.nickname || (p.corpNickname && x.companyLink===p.corpNickname) || (p.corpFullName && x.companyLink===p.corpFullName)));
    html += '<div class="person-section"><div class="person-section-title">👥 所属メンバー</div>';
    if (members.length) {
      members.forEach(m => {
        const icon = personIcon(m);
        html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="event.stopPropagation();jumpToPerson('${m.id}')">
          <div style="width:32px;height:32px;border-radius:50%;background:${icon.bg};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${icon.emoji}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;color:var(--accent);text-decoration:underline;">${esc(m.nickname)}</div>
            ${m.position?`<div style="font-size:12px;color:var(--sub);">${esc(m.position)}</div>`:''}
          </div>
          <span style="font-size:14px;color:#c97070;cursor:pointer;padding:4px 8px;" onclick="event.stopPropagation();unlinkMember('${m.id}','${p.id}')">✕</span>
        </div>`;
      });
    } else {
      html += '<div style="font-size:13px;color:var(--sub);padding:4px 0;">まだメンバーがいません</div>';
    }
    html += `<div class="add-btn" onclick="event.stopPropagation();openAddMemberModal('${p.id}','${esc(p.nickname)}')">＋ メンバーを追加</div></div>`;
  }
  // Corporate seasonal gifts
  if (p.chugen||p.seibo) {
    html += '<div class="person-section"><div class="person-section-title">🎐🎄 季節の贈答</div>';
    if (p.chugen==='yearly') html += `<div class="person-ann"><div class="person-ann-icon">🎐</div><span class="person-ann-label">お中元</span><span>毎年手配</span>${p.chugenBudget?`<span style="margin-left:auto;font-size:12px;color:var(--accent);">¥${Number(p.chugenBudget).toLocaleString()}</span>`:''}</div>`;
    if (p.seibo==='yearly') html += `<div class="person-ann"><div class="person-ann-icon">🎄</div><span class="person-ann-label">お歳暮</span><span>毎年手配</span>${p.seiboBudget?`<span style="margin-left:auto;font-size:12px;color:var(--accent);">¥${Number(p.seiboBudget).toLocaleString()}</span>`:''}</div>`;
    if (p.address) html += `<div style="font-size:11px;color:var(--sub);margin-top:4px;">📮 ${esc(p.address)}</div>`;
    html += '</div>';
  }
  // Counters (カウンターあり → 記念日の上に表示)
  const counters = p.counters||[];
  function renderCounterSection() {
    let ch = '<div class="person-section"><div class="person-section-title" style="cursor:pointer;" onclick="event.stopPropagation();toggleCounterSection(\''+p.id+'\')">🔢 カウンター <span id="counterToggle_'+p.id+'" style="font-size:12px;color:var(--sub);">▶</span></div>';
    ch += '<div id="counterBody_'+p.id+'" style="display:none;">';
    counters.forEach((c,ci) => {
      ch += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="flex:1;cursor:pointer;" onclick="event.stopPropagation();toggleCounterLog('${p.id}',${ci})">
          <span style="font-size:14px;">${esc(c.name)}</span>
          <span style="font-size:16px;font-weight:600;color:var(--accent);margin-left:8px;">${c.count||0}回</span>
        </div>
        <button onclick="event.stopPropagation();incrementCounter('${p.id}',${ci})" style="background:var(--accent-light);border:1px solid var(--accent);border-radius:10px;padding:6px 14px;font-size:13px;cursor:pointer;color:var(--accent);font-family:'Zen Maru Gothic',sans-serif;">+1</button>
        <span style="font-size:14px;color:#c97070;cursor:pointer;" onclick="event.stopPropagation();removeCounter('${p.id}',${ci})">×</span>
      </div>`;
      ch += `<div id="counterLog_${p.id}_${ci}" style="display:none;padding:4px 0 8px;font-size:12px;color:var(--sub);"></div>`;
    });
    ch += `<div class="add-btn" style="margin-top:8px;" onclick="event.stopPropagation();promptAddCounter('${p.id}')">＋ カウンターを追加</div>`;
    ch += '</div></div>';
    return ch;
  }
  if (counters.length) {
    html += renderCounterSection();
  }

  // Section collapse helper
  const secId = () => 'sec_'+p.id+'_'+(Math.random()*1e6|0);
  function collapsibleSection(icon, title, count, threshold, contentFn) {
    const id = secId();
    const collapsed = count >= threshold;
    let h = `<div class="person-section"><div class="person-section-title" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="event.stopPropagation();const b=document.getElementById('${id}');const t=this.querySelector('.sec-toggle');if(b.style.display==='none'){b.style.display='';t.textContent='▼';}else{b.style.display='none';t.textContent='▶';}">
      <span>${icon} ${title}${count?' ('+count+')':''}</span>
      <span class="sec-toggle" style="font-size:12px;color:var(--sub);">${collapsed?'▶':'▼'}</span>
    </div>`;
    h += `<div id="${id}" style="display:${collapsed?'none':''};">`;
    h += contentFn();
    h += '</div></div>';
    return h;
  }

  // Anniversaries (あと何日が近い順にソート)
  const validAnns = (p.anniversaries||[]).filter(a => a.date).map((a,i) => ({...a, _idx:i, _days: daysUntil(a.date, a.dateType)}));
  validAnns.sort((a,b) => {
    if (a._days===null && b._days===null) return 0;
    if (a._days===null) return 1;
    if (b._days===null) return -1;
    return a._days - b._days;
  });
  if (validAnns.length) {
    html += collapsibleSection('📅', '記念日', validAnns.length, 3, () => {
      let ah = `<div style="display:flex;gap:4px;margin-bottom:8px;justify-content:flex-end;"><span style="font-size:10px;padding:2px 8px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--card);" onclick="event.stopPropagation();scrollToAnnSection()">📅 一覧へ</span><span style="font-size:10px;padding:2px 8px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--card);" onclick="event.stopPropagation();toggleElapsedMode()">${elapsedMode==='days'?'📆 日数':'📅 年数'} ↔</span></div>`;
    validAnns.forEach(a => {
      const days = a._days;
      const badge = days!==null ? (days===0?'🎉 今日！':'あと'+days+'日') : '';
      const elapsed = daysSince(a.date, a.dateType);
      const elapsedStr = elapsed!==null ? formatElapsed(elapsed) : '';
      const emoji = a.name.match(/[\p{Emoji}]/u)?a.name.match(/[\p{Emoji}]/u)[0]:'📅';
      const label = a.name.replace(/[\p{Emoji}]/gu,'').trim();
      const remOn = a.reminders && a.reminders.length > 0;

      ah += `<div style="background:var(--bg);border-radius:12px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:18px;">${emoji}</span>
            <span style="font-size:15px;font-weight:600;">${esc(label)}</span>
          </div>
          ${badge?`<span class="person-ann-badge" style="font-size:13px;padding:4px 10px;">${badge}</span>`:''}
          ${(()=>{
            if (!days || days<=0 || days>30) return '';
            const gKey = p.id+'_'+a.name+'_'+a.date;
            const st = p.giftStatus?.[gKey]?.status || 'none';
            const styles = {
              none: 'background:#FFF3E0;color:#F57C00;border:1px solid #FFE0B2;',
              preparing: 'background:#FFF8E1;color:#F9A825;border:1px solid #FFF0B3;',
              ready: 'background:#E8F5E9;color:#4CAF50;border:1px solid #C8E6C9;'
            };
            const labels = { none: '🎁 準備する', preparing: '🟡 準備中', ready: '✅ 準備OK' };
            return `<span onclick="event.stopPropagation();toggleGiftStatus('${p.id}','${gKey}')" style="font-size:11px;padding:3px 8px;border-radius:10px;cursor:pointer;${styles[st]}">${labels[st]}</span>`;
          })()}
        </div>
        <div style="font-size:14px;color:var(--text);margin-bottom:2px;">
          ${formatAnnDate(a.date,a.dateType)}${a.dateType==='month'?' <span style="font-size:12px;color:var(--sub);">（月のみ）</span>':''}
        </div>
        ${elapsedStr?`<div style="font-size:14px;font-weight:600;color:var(--accent);margin-top:4px;">${elapsedStr}</div>`:''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
          <span style="font-size:12px;color:var(--accent);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();cycleAnnReminderDays('${p.id}',${a._idx})">🔔 ${remOn?a.reminders.sort((x,y)=>y-x).map(d=>d===1?'前日':d+'日前').join('・'):'タップして設定'}</span>
        </div>
      </div>`;
    });
      return ah;
    });
  }
  // Smoking/Drinking
  if (p.smoking||p.drinking) {
    html += '<div class="person-section"><div class="person-section-title">🚬 嗜好品</div><div class="profile-grid">';
    if (p.smoking) html += `<div class="profile-item"><div class="profile-item-label">タバコ</div><div class="profile-item-value">${esc(p.smoking)}</div></div>`;
    if (p.drinking) html += `<div class="profile-item"><div class="profile-item-label">お酒</div><div class="profile-item-value">${esc(p.drinking)}</div></div>`;
    html += '</div></div>';
  }
  // Interests
  if (p.interests&&p.interests.length) {
    html += collapsibleSection('💖', '好きなもの・趣味', p.interests.length, 5, () =>
      `<div class="interest-tags">${p.interests.map(t=>`<span class="interest-tag">${esc(t)}</span>`).join('')}</div>`);
  }
  // Brands
  if (p.brands&&p.brands.length) {
    html += collapsibleSection('🎨', 'ブランド・色', p.brands.length, 5, () =>
      `<div class="interest-tags">${p.brands.map(t=>`<span class="interest-tag">${esc(t)}</span>`).join('')}</div>`);
  }
  // Oshi
  if (p.oshi&&p.oshi.length) {
    html += collapsibleSection('🌟', '推し活', p.oshi.length, 5, () =>
      `<div class="interest-tags">${p.oshi.map(t=>`<span class="interest-tag" style="background:#fff0f5;border-color:#f0c0d0;color:#c06080;">${esc(t)}</span>`).join('')}</div>`);
  }
  // Food
  const foodCount = (p.foodLike?.length||0) + (p.foodDislike?.length||0);
  if (foodCount) {
    html += collapsibleSection('🍽', '食の好み', foodCount, 5, () => {
      let fh = '<div class="interest-tags">';
      (p.foodLike||[]).forEach(f => { fh += `<span class="food-like">☺ ${esc(f)}</span>`; });
      (p.foodDislike||[]).forEach(f => { fh += `<span class="food-dislike">✗ ${esc(f)}</span>`; });
      fh += '</div>';
      return fh;
    });
  }
  // Sizes
  const sizes = p.sizes||{};
  const sizeEntries = Object.entries(sizes).filter(([k,v])=>v);
  if (sizeEntries.length) {
    html += '<div class="person-section"><div class="person-section-title">📏 サイズ</div><div class="profile-grid">';
    sizeEntries.forEach(([k,v]) => {
      const labels = {tops:'服トップス',bottoms:'服ボトムス',shoes:'靴',ring:'指輪'};
      html += `<div class="profile-item"><div class="profile-item-label">${labels[k]||k}</div><div class="profile-item-value">${esc(v)}</div></div>`;
    });
    html += '</div></div>';
  }
  // Family（登録済みの友だちとリンク）
  if (p.family&&p.family.length) {
    html += collapsibleSection('👨‍👩‍👧', '家族構成', p.family.length, 3, () => {
      let fh = '';
      p.family.forEach(f => {
        const linked = data.people.find(x => x.id !== p.id && (x.nickname === f.name || x.fullName === f.name));
        if (linked) {
          fh += `<div class="family-member" style="cursor:pointer;" onclick="event.stopPropagation();jumpToPerson('${linked.id}')"><div class="family-icon">👤</div><span style="color:var(--accent);text-decoration:underline;">${esc(f.name)}</span><span class="family-note">${esc(f.note||'')}</span><span style="margin-left:auto;color:var(--sub);font-size:12px;">→</span></div>`;
        } else {
          fh += `<div class="family-member"><div class="family-icon">👤</div><span>${esc(f.name)}</span><span class="family-note">${esc(f.note||'')}</span></div>`;
        }
      });
      return fh;
    });
  }
  // 逆リンク（他の人の家族として登録されている場合）
  const familyBackLinks = data.people.filter(x => x.id !== p.id && x.family && x.family.some(f => f.name === p.nickname || f.name === p.fullName));
  if (familyBackLinks.length) {
    html += collapsibleSection('🔗', 'この人の家族として登録', familyBackLinks.length, 3, () => {
      let fh = '';
      familyBackLinks.forEach(x => {
        const rel = x.family.find(f => f.name === p.nickname || f.name === p.fullName);
        fh += `<div class="family-member" style="cursor:pointer;" onclick="event.stopPropagation();jumpToPerson('${x.id}')"><div class="family-icon">👤</div><span style="color:var(--accent);text-decoration:underline;">${esc(x.nickname)}</span><span class="family-note">${esc(rel?.note||'')}</span><span style="margin-left:auto;color:var(--sub);font-size:12px;">→</span></div>`;
      });
      return fh;
    });
  }
  // Personality
  if (p.personality&&p.personality.length) {
    html += collapsibleSection('✨', '個性', p.personality.length, 5, () =>
      `<div class="interest-tags">${p.personality.map(t=>`<span class="personality-tag">${esc(t)}</span>`).join('')}</div>`);
  }
  // Memo
  if (p.memo) {
    html += `<div class="person-section"><div class="person-section-title">📝 メモ</div>
    <div style="font-size:12px;line-height:1.6;white-space:pre-wrap;">${esc(p.memo)}</div></div>`;
  }
  // === 🔗 つながり（確定リンクのみ。推測しない。） ===
  const links = [];

  // グループ（明示的に追加された紐づけ）
  data.groups.forEach(g => {
    if ((g.memberIds||[]).includes(p.id)) {
      links.push({type:'group', icon:'👥', label:'グループ', name:g.name, onclick:`jumpToGroup('${g.id}')`});
    }
  });

  // 会社（明示的に登録された所属）
  if (p.companyLink) {
    const corp = data.people.find(x=>x.type==='corporate'&&(x.nickname===p.companyLink||x.corpNickname===p.companyLink||x.corpFullName===p.companyLink));
    if (corp) links.push({type:'company', icon:'🏢', label:'会社', name:p.companyLink, onclick:`jumpToPerson('${corp.id}')`});
  }

  // 行きたい場所（明示的に「誰と」に登録された場所）
  data.place.forEach(item => {
    if (item.withPeople && item.withPeople.includes(p.nickname)) {
      links.push({type:'place', icon:'📍', label:'一緒に行きたい', name:item.title, onclick:`jumpToItem('place','${item.id}')`});
    }
  });

  // ギフト履歴（明示的に相手として登録されたもの）
  const nameMatch = (itemPerson) => itemPerson && p.nickname && itemPerson === p.nickname;
  data.gave.forEach(item => { if (nameMatch(item.person)) links.push({type:'gave', icon:'🎁', label:'あげた', name:item.title, date:item.date, onclick:`jumpToItem('gave','${item.id}')`}); });
  data.received.forEach(item => { if (nameMatch(item.person)) links.push({type:'received', icon:'🎀', label:'もらった', name:item.title, date:item.date, onclick:`jumpToItem('received','${item.id}')`}); });

  if (links.length) {
    html += collapsibleSection('🔗', 'つながり', links.length, 5, () => {
      let rh = '';
      const typeColors = {group:'#f0eaf8', company:'#e8f0ff', place:'#edf7fa', gave:'#fdeee9', received:'#e9f0fd'};
      const typeTextColors = {group:'#8a7acc', company:'#6b88a8', place:'#7ec8d9', gave:'#d48a7a', received:'#7a9ad4'};
      links.forEach(l => {
        rh += `<div class="history-item" onclick="event.stopPropagation();${l.onclick}" style="cursor:pointer;">
          <span class="history-dir" style="background:${typeColors[l.type]||'var(--bg)'};color:${typeTextColors[l.type]||'var(--sub)'};">${l.icon} ${l.label}</span>
          <span style="flex:1;">${esc(l.name)}</span>
          ${l.date?`<span class="history-date">${l.date}</span>`:''}
          <span style="color:var(--accent);font-size:12px;margin-left:4px;">→</span>
        </div>`;
      });
      return rh;
    });
  }

  // カウンターなし → 下部にさりげなく追加ボタン
  if (!counters.length) {
    html += `<div class="person-section" style="padding-top:4px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <div style="font-size:12px;color:var(--sub);padding:6px 12px;border:1px dashed var(--border);border-radius:10px;cursor:pointer;" onclick="event.stopPropagation();addCounter('${p.id}','一緒に食事した')">🔢 一緒に食事した</div>
        <div style="font-size:12px;color:var(--sub);padding:6px 12px;border:1px dashed var(--border);border-radius:10px;cursor:pointer;" onclick="event.stopPropagation();addCounter('${p.id}','会った')">🔢 会った</div>
        <div style="font-size:12px;color:var(--sub);padding:6px 12px;border:1px dashed var(--border);border-radius:10px;cursor:pointer;" onclick="event.stopPropagation();promptAddCounter('${p.id}')">＋ カウンター</div>
      </div>
    </div>`;
  }

  // Chat section
  html += renderChatSection(p.id, !!p.isMemory);

  html += `<div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
    <button onclick="event.stopPropagation();sharePerson('${p.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #bdd8f0;background:linear-gradient(135deg,#e8f2fc,#daeaf8);color:#4a7aaa;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📤 共有</button>
    <button onclick="event.stopPropagation();sendShareRequest('${p.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #c8b8e8;background:linear-gradient(135deg,#f0eaf8,#e8e0f4);color:#7a6aaa;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📩 カード共有</button>
    <button onclick="event.stopPropagation();editItem('people','${p.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid var(--border);background:linear-gradient(135deg,#faf8f6,#f3eeea);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">✏️ 編集</button>
    ${!p.isMemory?`<button onclick="event.stopPropagation();moveToMemory('${p.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #d8d0c8;background:linear-gradient(135deg,#f5f0eb,#ece5dd);color:#8a7e74;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">🤍 記憶に移す</button>`:''}
    ${p.isMemory?`<button onclick="event.stopPropagation();restoreFromMemory('${p.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #90caf9;background:linear-gradient(135deg,#e8f4ff,#d6ebfc);color:#4a7aaa;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">↩ 戻す</button>`:''}
    <button onclick="event.stopPropagation();duplicateItem('people','${p.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #c8d8c0;background:linear-gradient(135deg,#f0f8ee,#e4f0e0);color:#6a8a60;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📋 コピー</button>
    <button onclick="event.stopPropagation();deleteItem('people','${p.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #e8c0c0;background:linear-gradient(135deg,#fdf0f0,#f8e4e4);color:#c07070;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">🗑 削除</button>
  </div></div>`;
  return html;
}

// ===== Person list item (LINE-style) =====
function renderPersonListItem(p) {
  const isCorp = p.type==='corporate';

  // 次の記念日を探す（最も近いもの）
  let nearestAnn = null, nearestDays = Infinity;
  (p.anniversaries||[]).forEach(a => {
    const days = daysUntil(a.date, a.dateType);
    if (days !== null && days < nearestDays) { nearestDays = days; nearestAnn = a; }
  });

  // Preview text
  let preview = p.relation || '';
  if (!preview && p.interests?.length) preview = p.interests.slice(0,3).join(', ');
  if (!preview) preview = isCorp ? (p.industry||'会社') : '友だち';

  // カウントダウン表示
  let countdownHtml = '';
  if (nearestAnn && nearestDays <= 365) {
    const annName = (nearestAnn.name||'').replace(/[\p{Emoji}]/gu,'').trim() || '記念日';
    if (nearestDays === 0) {
      countdownHtml = `<div style="font-size:12px;color:var(--accent);font-weight:600;">🎉 ${annName} 今日！</div>`;
    } else if (nearestDays <= 7) {
      countdownHtml = `<div style="font-size:12px;color:#c97070;font-weight:600;">${annName}<br>あと${nearestDays}日</div>`;
    } else if (nearestDays <= 30) {
      countdownHtml = `<div style="font-size:12px;color:var(--accent);font-weight:500;">${annName}<br>あと${nearestDays}日</div>`;
    } else {
      countdownHtml = `<div style="font-size:11px;color:var(--sub);">${annName}<br>あと${nearestDays}日</div>`;
    }
  }

  const isOpen = openPersonId === p.id;

  return `<div class="list-item" data-lp-type="people" data-lp-id="${p.id}" ontouchstart="lpStart(event,'people','${p.id}')" ontouchend="lpEnd()" ontouchmove="lpMove(event)" onclick="${_selectMode&&_selectType==='people'?`toggleSelectItem('${p.id}')`:`togglePersonDetail('${p.id}')`}" style="${isOpen?'background:var(--accent-light);':''}${_selectMode&&_selectedIds.has(p.id)?'background:rgba(193,154,132,0.15);':''}">
    ${_selectMode&&_selectType==='people'?`<input type="checkbox" id="sel_${p.id}" ${_selectedIds.has(p.id)?'checked':''} onclick="event.stopPropagation();toggleSelectItem('${p.id}')" style="width:20px;height:20px;flex-shrink:0;accent-color:var(--accent);">`:''}
    <div class="list-avatar" style="background:${p.avatar?'transparent':personIcon(p).bg}">${p.avatar?`<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">`:(personIcon(p).emoji)}</div>
    <div class="list-body">
      <div class="list-name">${p.pinned?'📌 ':''}${esc(p.nickname||'名前なし')}</div>
      <div class="list-preview">${esc(preview)}</div>
    </div>
    <div class="list-meta">
      ${countdownHtml}
    </div>
  </div>`;
}

function togglePersonDetail(id) {
  openPersonId = openPersonId === id ? null : id;
  if (openPersonId) history.pushState({person:id}, '');
  render();
  if (openPersonId) {
    setTimeout(() => {
      const detail = document.getElementById('personDetail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

// ===== Card Chat =====
const _chatChannels = {};

function renderChatSection(cardId, isMemory) {
  const bodyId = 'chatBody_' + cardId;
  const msgsId = 'chatMsgs_' + cardId;
  const inputId = 'chatInput_' + cardId;
  const memoryFlag = isMemory ? 'true' : 'false';
  return `<div class="person-section">
    <div class="person-section-title" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="event.stopPropagation();toggleChatSection('${cardId}',${memoryFlag})">
      <span>${isMemory ? 'ひとこと' : '💬 チャット'}</span>
      <span id="chatToggle_${cardId}" class="sec-toggle" style="font-size:12px;color:var(--sub);">▶</span>
    </div>
    <div id="${bodyId}" style="display:none;">
      <div id="${msgsId}" class="chat-messages"><div style="font-size:12px;color:var(--sub);text-align:center;padding:12px 0;">読み込み中…</div></div>
      <div class="chat-input-row" id="chatInputRow_${cardId}" onclick="event.stopPropagation();">
        <input id="${inputId}" type="text" placeholder="${isMemory ? '思い出に一言…' : 'メッセージを入力…'}" data-chat-input="true" onkeydown="if(event.key==='Enter'){event.preventDefault();sendCardChat('${cardId}',${memoryFlag});}" autocomplete="off">
        <button onclick="event.stopPropagation();sendCardChat('${cardId}',${memoryFlag})">送信</button>
      </div>
    </div>
  </div>`;
}

function toggleChatSection(cardId, isMemory) {
  const body = document.getElementById('chatBody_' + cardId);
  const toggle = document.getElementById('chatToggle_' + cardId);
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = '';
    if (toggle) toggle.textContent = '▼';
    loadCardChat(cardId, isMemory);
    subscribeCardChat(cardId);
  } else {
    body.style.display = 'none';
    if (toggle) toggle.textContent = '▶';
    unsubscribeCardChat(cardId);
  }
}

async function loadCardChat(cardId, isMemory) {
  const msgsEl = document.getElementById('chatMsgs_' + cardId);
  if (!msgsEl) return;
  if (!_sb || !_sbUser) {
    msgsEl.innerHTML = '<div style="font-size:12px;color:var(--sub);text-align:center;padding:12px 0;">ログインが必要です</div>';
    return;
  }
  try {
    const { data: msgs, error } = await _sb.from('card_chats')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    renderChatMessages(cardId, msgs || []);
    // 記憶カード: 自分のメッセージが既にあれば入力欄を非表示
    if (isMemory) {
      const myMsgExists = (msgs||[]).some(m => m.user_id === _sbUser.id);
      const inputRow = document.getElementById('chatInputRow_' + cardId);
      if (inputRow && myMsgExists) inputRow.style.display = 'none';
    }
  } catch (e) {
    console.error('loadCardChat error:', e);
    msgsEl.innerHTML = '<div style="font-size:12px;color:#c07070;text-align:center;padding:12px 0;">読み込みに失敗しました</div>';
  }
}

function renderChatMessages(cardId, msgs) {
  const msgsEl = document.getElementById('chatMsgs_' + cardId);
  if (!msgsEl) return;
  if (!msgs.length) {
    msgsEl.innerHTML = '<div style="font-size:12px;color:var(--sub);text-align:center;padding:12px 0;">まだメッセージがありません</div>';
    return;
  }
  const myId = _sbUser ? _sbUser.id : null;
  const recent = msgs.slice(-50);
  let html = '';
  recent.forEach(m => {
    const isMine = m.user_id === myId;
    const time = m.created_at ? new Date(m.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
    html += `<div style="display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};margin-bottom:4px;">`;
    if (!isMine) {
      html += `<div class="chat-sender">${esc(m.sender_name || 'ゲスト')}</div>`;
    }
    html += `<div class="chat-bubble ${isMine ? 'chat-bubble-mine' : 'chat-bubble-other'}">${esc(m.message)}</div>`;
    html += `<div style="display:flex;align-items:center;gap:6px;">`;
    html += `<span class="chat-time">${time}</span>`;
    if (isMine) {
      html += `<span style="font-size:10px;color:var(--sub);cursor:pointer;" onclick="event.stopPropagation();editChatMsg('${cardId}','${m.id}','${esc(m.message).replace(/'/g,"\\'")}')">✏️</span>`;
      html += `<span style="font-size:10px;color:#c07070;cursor:pointer;" onclick="event.stopPropagation();deleteChatMsg('${cardId}','${m.id}')">🗑</span>`;
    }
    html += `</div></div>`;
  });
  msgsEl.innerHTML = html;
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

async function editChatMsg(cardId, msgId, oldText) {
  const newText = prompt('メッセージを編集', oldText);
  if (newText === null || newText.trim() === '' || newText === oldText) return;
  try {
    const { error } = await _sb.from('card_chats').update({ message: newText.trim() }).eq('id', msgId);
    if (error) throw error;
    await loadCardChat(cardId);
  } catch(e) { alert('編集に失敗しました'); }
}

async function deleteChatMsg(cardId, msgId) {
  if (!confirm('このメッセージを削除しますか？')) return;
  try {
    const { error } = await _sb.from('card_chats').delete().eq('id', msgId).eq('user_id', _sbUser.id);
    if (error) throw error;
    await loadCardChat(cardId);
  } catch(e) { alert('削除に失敗しました'); }
}

async function sendCardChat(cardId, isMemory) {
  const inputEl = document.getElementById('chatInput_' + cardId);
  if (!inputEl) return;
  const message = inputEl.value.trim();
  if (!message) return;
  if (!_sb || !_sbUser) { alert('ログインが必要です'); return; }
  const profile = getMyProfile();
  const senderName = (profile && profile.name) ? profile.name : 'ゲスト';
  inputEl.value = '';
  inputEl.disabled = true;
  try {
    const { error } = await _sb.from('card_chats').insert({
      card_id: cardId,
      user_id: _sbUser.id,
      sender_name: senderName,
      message: message
    });
    if (error) throw error;
    await loadCardChat(cardId, isMemory);
  } catch (e) {
    console.error('sendCardChat error:', e);
    inputEl.value = message;
    alert('送信に失敗しました');
  } finally {
    inputEl.disabled = false;
    if (!isMemory) inputEl.focus();
  }
}

function subscribeCardChat(cardId) {
  if (_chatChannels[cardId]) return;
  if (!_sb) return;
  try {
    const channel = _sb.channel('card-chat-' + cardId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'card_chats',
        filter: 'card_id=eq.' + cardId
      }, payload => {
        appendChatMessage(cardId, payload.new);
      })
      .subscribe();
    _chatChannels[cardId] = channel;
  } catch (e) {
    console.error('subscribeCardChat error:', e);
  }
}

function unsubscribeCardChat(cardId) {
  if (_chatChannels[cardId]) {
    try { _sb.removeChannel(_chatChannels[cardId]); } catch(e) {}
    delete _chatChannels[cardId];
  }
}

function appendChatMessage(cardId, msg) {
  const msgsEl = document.getElementById('chatMsgs_' + cardId);
  if (!msgsEl) return;
  // If it's the "no messages" placeholder, clear it
  if (msgsEl.querySelector('.chat-sender') === null && msgsEl.querySelector('.chat-bubble') === null) {
    msgsEl.innerHTML = '';
  }
  const myId = _sbUser ? _sbUser.id : null;
  const isMine = msg.user_id === myId;
  const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
  let html = `<div style="display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};">`;
  if (!isMine) {
    html += `<div class="chat-sender">${esc(msg.sender_name || 'ゲスト')}</div>`;
  }
  html += `<div class="chat-bubble ${isMine ? 'chat-bubble-mine' : 'chat-bubble-other'}">${esc(msg.message)}</div>`;
  html += `<div class="chat-time">${time}</div>`;
  html += '</div>';
  msgsEl.insertAdjacentHTML('beforeend', html);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

// ===== Group render =====
let openGroupId = null;

function toggleGroupDetail(id) {
  openGroupId = openGroupId === id ? null : id;
  render();
  if (openGroupId) {
    setTimeout(() => {
      const detail = document.getElementById('groupDetail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function renderGroupListItem(g) {
  const members = (g.memberIds||[]).map(id => data.people.find(p=>p.id===id)).filter(Boolean);
  const memberNames = members.slice(0,3).map(m=>m.nickname).join(', ') + (members.length>3 ? ' ほか'+(members.length-3)+'人' : '');
  const isOpen = openGroupId === g.id;
  const isPinned = g.pinned;

  // Nearest anniversary
  let annBadge = '';
  members.forEach(m => {
    (m.anniversaries||[]).forEach(a => {
      const days = daysUntil(a.date, a.dateType);
      if (days!==null && days<=30 && !annBadge) {
        annBadge = days===0 ? '🎉今日！' : 'あと'+days+'日';
      }
    });
  });

  return `<div class="list-item" onclick="toggleGroupDetail('${g.id}')" style="${isOpen?'background:var(--accent-light);':''}">
    <div class="list-avatar" style="border-radius:14px;background:var(--accent-light);">👥</div>
    <div class="list-body">
      <div class="list-name">${isPinned?'📌 ':''}${esc(g.name||'名前なし')} <span style="font-size:11px;color:var(--sub);font-weight:400;">${members.length}人</span></div>
      <div class="list-preview">${esc(memberNames||'メンバーなし')}</div>
    </div>
    <div class="list-meta">
      ${g.description?`<div class="list-date">${esc(g.description.substring(0,8))}</div>`:''}
      ${annBadge?`<div class="list-badge-wrap"><span class="list-ann-badge">${annBadge}</span></div>`:''}
    </div>
  </div>`;
}

function renderGroupCard(g) {
  const members = (g.memberIds||[]).map(id => data.people.find(p=>p.id===id)).filter(Boolean);
  let html = '<div class="card" style="border-left:3px solid var(--accent);position:relative;">';
  html += `<div style="position:absolute;top:42px;right:12px;display:flex;gap:8px;z-index:1;">
    <label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;" onclick="event.stopPropagation();">
      <input type="checkbox" ${g.pinned?'checked':''} onchange="event.stopPropagation();togglePin('groups','${g.id}')"><span>📌</span>
    </label>
    <label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;" onclick="event.stopPropagation();">
      <input type="checkbox" ${g.hidden?'checked':''} onchange="event.stopPropagation();toggleItemHidden('groups','${g.id}')"><span>${g.hidden?'👁':'👁‍🗨'}</span>
    </label>
  </div>`;
  html += `<div class="card-title" style="font-size:17px;padding-right:40px;">👥 ${esc(g.name||'名前なし')}</div>`;
  if (g.description) html += `<div class="card-sub">${esc(g.description)}</div>`;
  html += `<div style="margin-top:8px;">`;
  if (!members.length) {
    html += '<div style="font-size:12px;color:var(--sub);">メンバーがいません</div>';
  } else {
    members.forEach(m => {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);" onclick="event.stopPropagation();jumpToPerson('${m.id}')">
        <span style="width:28px;height:28px;border-radius:50%;background:${m.avatar?'transparent':personIcon(m).bg};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;overflow:hidden;">${m.avatar?`<img src="${m.avatar}" style="width:100%;height:100%;object-fit:cover;">`:personIcon(m).emoji}</span>
        <span style="font-weight:500;color:var(--accent);text-decoration:underline;">${esc(m.nickname)}</span>
        ${m.relation?`<span style="font-size:11px;color:var(--sub);">${esc(m.relation)}</span>`:''}
        <span style="margin-left:auto;color:var(--sub);font-size:12px;">→</span>
      </div>`;
    });
  }
  html += '</div>';
  // Upcoming anniversaries in this group
  const upcoming = [];
  members.forEach(m => {
    (m.anniversaries||[]).forEach(a => {
      const days = daysUntil(a.date, a.dateType);
      if (days!==null && days<=60) upcoming.push({name:m.nickname, event:a.name, days});
    });
  });
  if (upcoming.length) {
    upcoming.sort((a,b)=>a.days-b.days);
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">';
    html += '<div style="font-size:11px;color:var(--sub);margin-bottom:4px;">📅 近づいている記念日</div>';
    upcoming.slice(0,3).forEach(u => {
      html += `<div style="font-size:12px;padding:2px 0;">${esc(u.name)} — ${esc(u.event)} <span style="color:var(--accent);font-weight:600;">${u.days===0?'今日！':'あと'+u.days+'日'}</span></div>`;
    });
    html += '</div>';
  }
  // Group history: items related to any member
  const groupHistory = [];
  const catLabelsG = {gave:'🎁 あげた', received:'🎀 もらった', wish:'💭 気になる', wantgive:'🎁 あげたい', place:'📍 行きたい'};
  const catColorsG = {gave:'#fdeee9', received:'#e9f0fd', wish:'#f5f0ed', wantgive:'#fdf0ed', place:'#edf7fa'};
  const catTextColorsG = {gave:'#d48a7a', received:'#7a9ad4', wish:'#9e8e88', wantgive:'#e8a598', place:'#7ec8d9'};
  const catToTabG = {gave:'gave', received:'received', wish:'wish', wantgive:'wish', place:'place'};
  const memberNames = members.map(m => m.nickname).filter(Boolean);
  const nameMatchG = (itemPerson) => itemPerson && memberNames.some(n => itemPerson.includes(n));
  data.gave.forEach(item => { if (nameMatchG(item.person)) groupHistory.push({...item, cat:'gave'}); });
  data.received.forEach(item => { if (nameMatchG(item.person)) groupHistory.push({...item, cat:'received'}); });
  data.wish.forEach(item => {
    if (nameMatchG(item.person) || nameMatchG(item.giftTarget)) groupHistory.push({...item, cat: item.purpose==='gift'?'wantgive':'wish'});
  });
  data.place.forEach(item => {
    if (nameMatchG(item.person) || (item.withGroups && item.withGroups.includes(g.id))) groupHistory.push({...item, cat:'place'});
  });
  if (groupHistory.length) {
    html += '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);">';
    html += '<div style="font-size:11px;color:var(--sub);margin-bottom:4px;">📋 メンバーとの記録</div>';
    groupHistory.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,10).forEach(h => {
      html += `<div class="history-item" onclick="event.stopPropagation();jumpToItem('${catToTabG[h.cat]}','${h.id}')" style="cursor:pointer;"><span class="history-dir" style="background:${catColorsG[h.cat]};color:${catTextColorsG[h.cat]};">${catLabelsG[h.cat]}</span><span style="flex:1;">${esc(h.title)}</span><span class="history-date">${h.date||''}</span><span style="color:var(--accent);font-size:12px;margin-left:4px;">→</span></div>`;
    });
    html += '</div>';
  }
  // Concierge button
  html += `<div style="padding:4px 0 8px;"><button onclick="event.stopPropagation();openGroupAiSuggest('${g.id}')" style="width:100%;padding:10px 20px;border-radius:14px;border:1px solid var(--pickup-border);background:var(--pickup);color:var(--text);font-size:14px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">💡 コンシェルジュに相談</button></div>`;
  // Action buttons (grid)
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:8px;">
    <button onclick="event.stopPropagation();shareGroup('${g.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #bdd8f0;background:linear-gradient(135deg,#e8f2fc,#daeaf8);color:#4a7aaa;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📤 共有</button>
    <button onclick="event.stopPropagation();editGroup('${g.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid var(--border);background:linear-gradient(135deg,#faf8f6,#f3eeea);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">✏️ 編集</button>
    <button onclick="event.stopPropagation();duplicateItem('groups','${g.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #c8d8c0;background:linear-gradient(135deg,#f0f8ee,#e4f0e0);color:#6a8a60;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📋 コピー</button>
    <button onclick="event.stopPropagation();deleteItem('groups','${g.id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:14px;border:1px solid #e8c0c0;background:linear-gradient(135deg,#fdf0f0,#f8e4e4);color:#c07070;font-size:13px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">🗑 削除</button>
  </div></div>`;
  return html;
}

// ===== Group modal =====
function openGroupModal(id) {
  editingId = id||null;
  const modal = document.getElementById('modal');
  const isEdit = !!editingId;
  const g = isEdit ? data.groups.find(x=>x.id===editingId) : null;
  const selectedIds = g?.memberIds||[];

  let html = `<h2>グループ を${isEdit?'編集':'作成'}</h2>`;
  html += `<div class="form-group"><label>グループ名 *</label><input id="gName" placeholder="例：ゴルフ仲間、家族、ABC商事チーム" value="${esc(g?.name||'')}"></div>`;
  html += `<div class="form-group"><label>説明（任意）</label><input id="gDesc" placeholder="例：毎月第2土曜にラウンド" value="${esc(g?.description||'')}"></div>`;
  html += `<div class="form-group"><label>メンバー</label><div class="form-hint" style="margin-bottom:6px;">タップで選択・解除</div><div id="gMemberList" style="max-height:300px;overflow-y:auto;">`;
  if (!data.people.length) {
    html += '<div style="font-size:12px;color:var(--sub);padding:12px;">友だちを先に登録してください</div>';
  } else {
    data.people.forEach(p => {
      const checked = selectedIds.includes(p.id);
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="toggleGroupMember(this,'${p.id}')">
        <span style="width:20px;height:20px;border-radius:5px;border:2px solid ${checked?'var(--accent)':'var(--border)'};background:${checked?'var(--accent)':'var(--card)'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;flex-shrink:0;transition:all 0.2s;" class="gcheck">${checked?'✓':''}</span>
        <span style="width:24px;height:24px;border-radius:50%;background:${p.avatar?'transparent':personIcon(p).bg};display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;overflow:hidden;">${p.avatar?`<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">`:personIcon(p).emoji}</span>
        <div><div style="font-weight:500;font-size:13px;">${esc(p.nickname)}</div>
        ${p.relation?`<div style="font-size:11px;color:var(--sub);">${esc(p.relation)}</div>`:''}</div>
      </div>`;
    });
  }
  html += `</div><input type="hidden" id="gMembers" value="${selectedIds.join(',')}"></div>`;
  // Group photo
  html += photoInputHTML('gImg', g?.img);
  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="saveGroup()">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function toggleGroupMember(el, id) {
  const input = document.getElementById('gMembers');
  let ids = input.value ? input.value.split(',').filter(Boolean) : [];
  const check = el.querySelector('.gcheck');
  if (ids.includes(id)) {
    ids = ids.filter(x=>x!==id);
    check.style.borderColor = 'var(--border)';
    check.style.background = 'var(--card)';
    check.textContent = '';
  } else {
    ids.push(id);
    check.style.borderColor = 'var(--accent)';
    check.style.background = 'var(--accent)';
    check.textContent = '✓';
  }
  input.value = ids.join(',');
}

function saveGroup() {
  const name = document.getElementById('gName').value.trim();
  if (!name) { alert('グループ名を入力してください'); return; }
  const memberIds = document.getElementById('gMembers').value.split(',').filter(Boolean);
  const fileInput = getPhotoData('gImg');
  const existingImg = editingId ? (data.groups.find(x=>x.id===editingId)?.img||null) : null;
  const removeFlag = document.getElementById('gImgRemove')?.value === '1';

  function doSaveGroup(imgData) {
    const group = {
      id: editingId || genId(),
      name,
      description: document.getElementById('gDesc').value.trim()||null,
      memberIds,
      img: imgData,
      pinned: editingId ? (data.groups.find(x=>x.id===editingId)?.pinned||false) : false,
      createdAt: editingId ? (data.groups.find(x=>x.id===editingId)?.createdAt||new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (editingId) {
      const idx = data.groups.findIndex(x=>x.id===editingId);
      if (idx>=0) data.groups[idx] = group;
    } else {
      data.groups.push(group);
    }
    saveData(); closeModal(); render();
  }

  if (removeFlag) { doSaveGroup(null); return; }
  if (fileInput&&fileInput.files&&fileInput.files[0]) {
    compressImage(fileInput.files[0]).then(dataUrl => doSaveGroup(dataUrl));
  } else {
    doSaveGroup(existingImg);
  }
}

function editGroup(id) {
  currentTab = 'groups';
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab==='groups'));
  openGroupModal(id);
}

// ===== Group AI suggest (batch) =====
function openGroupAiSuggest(groupId) {
  const group = data.groups.find(g=>g.id===groupId);
  if (!group) return;
  const members = (group.memberIds||[]).map(id=>data.people.find(p=>p.id===id)).filter(Boolean);
  if (!members.length) { alert('メンバーがいません'); return; }

  const modal = document.getElementById('aiModal');
  let html = `<h2>💡 ${esc(group.name)} へのギフト コンシェルジュ</h2>`;
  html += `<div style="background:var(--bg);border-radius:12px;padding:10px;font-size:12px;margin-bottom:12px;">`;
  html += `<div style="font-size:11px;color:var(--sub);margin-bottom:4px;">メンバー ${members.length}人</div>`;
  members.forEach(m => {
    html += `<div>👤 ${esc(m.nickname)}${m.interests?.length?' — '+m.interests.join(', '):''}</div>`;
  });
  html += '</div>';
  html += `<div class="form-group"><label>場面・シチュエーション</label>
    <input id="aiGroupScene" placeholder="例：京都旅行のお土産、忘年会の景品">
    <div class="form-hint">全員分まとめて提案します</div></div>`;
  html += `<div class="form-group"><label>1人あたりの予算（任意）</label>
    <input id="aiGroupBudget" placeholder="例：3000"></div>`;
  html += `<div class="form-btns" style="margin-bottom:12px;">
    <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    <button class="btn btn-primary" id="aiGroupBtn" onclick="runGroupAiSuggest('${groupId}')">✨ まとめて提案</button></div>`;
  html += '<div id="aiGroupResult" style="font-size:13px;line-height:1.8;white-space:pre-wrap;"></div>';
  modal.innerHTML = html;
  document.getElementById('aiModalOverlay').classList.add('open');
}

async function runGroupAiSuggest(groupId) {
  const group = data.groups.find(g=>g.id===groupId);
  if (!group) return;
  const members = (group.memberIds||[]).map(id=>data.people.find(p=>p.id===id)).filter(Boolean);

  const resultDiv = document.getElementById('aiGroupResult');
  const btn = document.getElementById('aiGroupBtn');
  btn.disabled=true; btn.textContent='探しています...';
  resultDiv.innerHTML = '' + conciergeWaitingHtml('メンバーの情報をもとにお探しします・・・', 'あなたのコンシェルジュが') + '';

  const scene = document.getElementById('aiGroupScene')?.value.trim()||'';
  const budget = document.getElementById('aiGroupBudget')?.value.trim()||'';

  // 匿名化: メンバーにABC...のラベルを割り当て
  let memberProfiles = '';
  const anonLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const anonMap = {}; // anonLabel -> real nickname
  members.forEach((m, idx) => {
    const label = anonLabels[idx] || `メンバー${idx+1}`;
    anonMap[label] = m.nickname;
    const lines = buildAnonymizedProfile(m);
    memberProfiles += `\n### ${label}さん\n${lines.join('\n')}\n`;
  });

  const prompt = `以下のグループメンバー全員に対して、それぞれに合った贈り物を提案してください。

## グループの説明
${group.description || 'なし'}

## メンバー
${memberProfiles}
${scene ? '\n## 場面\n'+scene : ''}
${budget ? '\n## 1人あたりの予算\n約'+budget+'円' : ''}

各メンバーに1つずつ提案してください。苦手なものは絶対に避けてください。`;

  try {
    const result = await callAI(prompt, memberProfiles, true);
    if (result.suggestions && result.suggestions.length) {
      _lastAiSuggestions = result.suggestions;
      let html = '';
      result.suggestions.forEach((s, i) => {
        const hasRakuten = s.rakuten && s.rakuten.url;
        const rakutenImg = s.rakuten?.image ? `<div style="text-align:center;margin-bottom:10px;"><img src="${esc(s.rakuten.image)}" style="max-width:120px;max-height:120px;border-radius:8px;object-fit:cover;"></div>` : '';
        const price = s.rakuten?.price ? `¥${Number(s.rakuten.price).toLocaleString()}` : (s.budget ? `約¥${Number(s.budget).toLocaleString()}` : '');
        html += `<div style="background:var(--pickup);border:1px solid var(--pickup-border);border-radius:14px;padding:14px;margin-bottom:12px;">
          ${rakutenImg}
          <div style="font-weight:600;font-size:14px;font-family:'Shippori Mincho',serif;">${esc(s.name)}</div>
          <div style="font-size:12px;color:var(--sub);margin:4px 0;">${esc(s.shop)}${price ? ' | ' + price : ''}</div>
          <div style="font-size:13px;margin:8px 0;line-height:1.6;">${esc(s.reason)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
            ${hasRakuten ? `<a href="${esc(s.rakuten.url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:#BF0000;color:#fff;font-size:12px;text-decoration:none;font-weight:500;">🛒 楽天</a>` : ''}
            <a href="${esc(s.amazonUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:#FF9900;color:#000;font-size:12px;text-decoration:none;font-weight:500;">🛒 Amazon</a>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button onclick="saveAiSuggestionDirect('wish',${i})" style="padding:6px 12px;border-radius:8px;background:var(--pickup);border:1px solid var(--pickup-border);color:var(--text);font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">⭐ 保存</button>
          </div>
        </div>`;
      });
      html += `<div style="text-align:center;margin-top:12px;">
        <button class="btn btn-secondary" onclick="runGroupAiSuggest('${groupId}')" style="font-size:13px;padding:8px 20px;">🔄 別の提案を探す</button>
      </div>`;
      resultDiv.innerHTML = html;
    } else {
      const text = typeof result === 'string' ? result : (result.reply || '');
      resultDiv.innerHTML = `<div style="background:var(--pickup);border:1px solid var(--pickup-border);border-radius:14px;padding:14px;">
        <div style="font-weight:600;margin-bottom:8px;font-family:'Shippori Mincho',serif;">💡 ${esc(group.name)} への提案</div>
        <div>${mdToHtml(text)}</div></div>
      <div style="text-align:center;margin-top:12px;">
        <button class="btn btn-secondary" onclick="runGroupAiSuggest('${groupId}')" style="font-size:13px;padding:8px 20px;">🔄 別の提案を探す</button>
      </div>`;
    }
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#c97070;padding:12px;">エラー: ${esc(e.message)}</div>`;
  }
  btn.disabled=false; btn.textContent='✨ まとめて提案';
}

// ===== Main render =====
// ===== Anniversary Reminders =====
function getUpcomingAnniversaries() {
  const results = [];
  (data.people||[]).forEach(p => {
    (p.anniversaries||[]).forEach(a => {
      const days = daysUntil(a.date, a.dateType);
      if (days === null) return;
      const reminders = a.reminders && a.reminders.length ? a.reminders : [];
      const maxReminder = reminders.length ? Math.max(...reminders) : 0;
      if (reminders.length && days <= maxReminder) {
        results.push({ person: p, ann: a, days });
      } else if (!reminders.length && days === 0) {
        results.push({ person: p, ann: a, days });
      }
    });
  });
  // My profile anniversaries
  const myProfile = getMyProfile();
  if (myProfile.anniversaries) {
    const me = { id: '_myprofile', nickname: myProfile.name || '自分', type: 'myprofile' };
    myProfile.anniversaries.forEach(a => {
      const days = daysUntil(a.date, a.dateType);
      if (days === null) return;
      const reminders = a.reminders && a.reminders.length ? a.reminders : [];
      const maxReminder = reminders.length ? Math.max(...reminders) : 0;
      if (reminders.length && days <= maxReminder) {
        results.push({ person: me, ann: a, days });
      } else if (!reminders.length && days === 0) {
        results.push({ person: me, ann: a, days });
      }
    });
  }
  results.sort((a,b) => a.days - b.days);
  return results;
}

function showAnnPopup() {
  const upcoming = getUpcomingAnniversaries();
  if (!upcoming.length) return;
  const today = toLocalDateStr();
  const lastShown = localStorage.getItem(ANN_POPUP_KEY);
  const hasToday = upcoming.some(u => u.days === 0);
  // 当日は毎回、それ以外は1日1回
  if (!hasToday && lastShown === today) return;
  if (!hasToday) localStorage.setItem(ANN_POPUP_KEY, today);

  let html = '<div class="ann-popup"><h2>📅 記念日リマインド</h2>';
  upcoming.forEach(u => {
    const emoji = u.ann.name.match(/[\p{Emoji}]/u) ? u.ann.name.match(/[\p{Emoji}]/u)[0] : '📅';
    const label = u.ann.name.replace(/[\p{Emoji}]/gu,'').trim();
    const badgeClass = u.days === 0 ? 'ann-badge-today' : 'ann-badge-soon';
    const badgeText = u.days === 0 ? '🎉 今日！' : 'あと'+u.days+'日';
    const popupClick = u.person.id==='_myprofile' ? 'closeAnnPopup();openMyProfile()' : `closeAnnPopup();jumpToPerson('${u.person.id}')`;
    html += `<div class="ann-popup-item" onclick="${popupClick}">
      <div class="ann-emoji">${emoji}</div>
      <div class="ann-info">
        <div class="ann-person">${esc(u.person.nickname)}</div>
        <div class="ann-event">${esc(label)} ${formatAnnDate(u.ann.date, u.ann.dateType)}</div>
      </div>
      <span class="ann-badge ${badgeClass}">${badgeText}</span>
    </div>
    ${u.person.id!=='_myprofile'?`<div style="text-align:right;margin-top:-4px;margin-bottom:8px;padding-right:8px;">
      <span style="font-size:12px;color:var(--accent);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();closeAnnPopup();openPartnerLinks('${u.person.id}')">🎁 ギフトを探す</span>
    </div>`:''}`;
  });
  html += '<div style="text-align:center;margin-top:14px;"><button class="btn btn-secondary" onclick="closeAnnPopup()" style="min-width:120px;">閉じる</button></div></div>';
  const overlay = document.createElement('div');
  overlay.id = 'annPopupOverlay';
  overlay.className = 'ann-popup-overlay';
  overlay.innerHTML = html;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAnnPopup(); });
  document.body.appendChild(overlay);
}

function closeAnnPopup() {
  const el = document.getElementById('annPopupOverlay');
  if (el) el.remove();
  // After closing ann popup, check memory popup
  setTimeout(showMemoryPopup, 300);
}

function showMemoryPopup() {
  const today = new Date();
  const todayM = today.getMonth()+1, todayD = today.getDate();
  const memoryKey = 'awai_memory_popup_date';
  const lastShown = localStorage.getItem(memoryKey);
  const todayStr = toLocalDateStr(today);

  const memoryPeople = data.people.filter(p => p.isMemory && p.memoryDate && p.reminderMode !== 'none');
  const matches = [];
  memoryPeople.forEach(p => {
    const parts = p.memoryDate.split('-').map(Number);
    if (parts.length < 2) return;
    const m = parts[0], d = parts[1];
    if (p.memoryDateType === 'monthly') {
      if (todayD === d) matches.push(p);
    } else {
      if (todayM === m && todayD === d) matches.push(p);
      // 「自分で決める」モードの場合は設定日数前から
      if (p.reminderMode === 'custom') {
        const remDays = p.reminderDays || 7;
        let next = new Date(today.getFullYear(), m-1, d);
        if (next < today) next = new Date(today.getFullYear()+1, m-1, d);
        const diff = Math.ceil((next - today) / (1000*60*60*24));
        if (diff > 0 && diff <= remDays && !matches.includes(p)) matches.push(p);
      }
    }
  });

  if (!matches.length) return;
  const hasToday = matches.some(p => {
    const parts = p.memoryDate.split('-').map(Number);
    return (p.memoryDateType==='monthly' ? todayD===parts[1] : todayM===parts[0]&&todayD===parts[1]);
  });
  if (!hasToday && lastShown === todayStr) return;
  if (!hasToday) localStorage.setItem(memoryKey, todayStr);

  // Show one at a time (first match)
  const p = matches[0];
  const overlay = document.createElement('div');
  overlay.id = 'memoryPopupOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.25);z-index:300;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.5s;';
  overlay.innerHTML = `<div style="background:#f9f8f6;border-radius:20px;width:90%;max-width:360px;padding:32px 24px;box-shadow:0 4px 24px rgba(0,0,0,0.1);text-align:center;">
    <div style="font-size:18px;font-weight:600;color:#5a5550;margin-bottom:16px;">${esc(p.nickname)}</div>
    <div style="font-size:15px;color:#7a7570;line-height:1.8;margin-bottom:8px;">思い出してみませんか。</div>
    ${p.memoryMessage?`<div style="font-size:13px;color:#a5a09a;margin-bottom:12px;font-style:italic;">${esc(p.memoryMessage)}</div>`:''}
    <div style="display:flex;gap:8px;justify-content:center;margin-top:20px;">
      <button onclick="closeMemoryPopup();currentLabel='memory';jumpToPerson('${p.id}')" style="background:none;border:1px solid #c5c0ba;border-radius:12px;padding:10px 24px;font-family:'Zen Maru Gothic',sans-serif;font-size:14px;color:#7a7570;cursor:pointer;">会いに行く</button>
      <button onclick="closeMemoryPopup()" style="background:none;border:1px solid #c5c0ba;border-radius:12px;padding:10px 24px;font-family:'Zen Maru Gothic',sans-serif;font-size:14px;color:#7a7570;cursor:pointer;">そっと閉じる</button>
    </div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMemoryPopup(); });
  document.body.appendChild(overlay);
}

function closeMemoryPopup() {
  const el = document.getElementById('memoryPopupOverlay');
  if (el) el.remove();
}

function openAddMemberModal(corpId, corpName) {
  const corp = data.people.find(x=>x.id===corpId);
  if (!corp) return;
  const modal = document.getElementById('modal');
  const alreadyLinked = data.people.filter(x => x.type!=='corporate' && x.companyLink && (x.companyLink===corp.nickname || (corp.corpNickname && x.companyLink===corp.corpNickname) || (corp.corpFullName && x.companyLink===corp.corpFullName)));
  const linkedIds = alreadyLinked.map(m=>m.id);
  const candidates = data.people.filter(x => x.type!=='corporate' && !linkedIds.includes(x.id));

  let html = `<h2>👥 ${esc(corp.nickname)} にメンバーを追加</h2>`;
  if (!candidates.length) {
    html += '<div style="padding:12px;color:var(--sub);text-align:center;">追加できる友だちがいません<br>先に友だちを登録してください</div>';
  } else {
    html += '<div style="max-height:60dvh;overflow-y:auto;">';
    candidates.forEach(c => {
      const icon = personIcon(c);
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="linkMember('${c.id}','${corpId}')">
        <div style="width:36px;height:36px;border-radius:50%;background:${icon.bg};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${icon.emoji}</div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:600;">${esc(c.nickname)}</div>
          ${c.relation?`<div style="font-size:12px;color:var(--sub);">${esc(c.relation)}</div>`:''}
        </div>
        <span style="font-size:13px;color:var(--accent);">追加 →</span>
      </div>`;
    });
    html += '</div>';
  }
  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function linkMember(personId, corpId) {
  const person = data.people.find(x=>x.id===personId);
  const corp = data.people.find(x=>x.id===corpId);
  if (!person || !corp) return;
  person.companyLink = corp.nickname;
  saveData();
  closeModal();
  openPersonId = corpId;
  render();
  showToast(person.nickname + ' を追加しました ✓');
  setTimeout(() => {
    const detail = document.getElementById('personDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function unlinkMember(personId, corpId) {
  const person = data.people.find(x=>x.id===personId);
  if (!person) return;
  if (!confirm(person.nickname + ' を所属メンバーから外しますか？')) return;
  person.companyLink = null;
  saveData();
  openPersonId = corpId;
  render();
  showToast(person.nickname + ' を外しました');
}

function scrollToAnnSection() {
  openPersonId = null;
  render();
  setTimeout(() => {
    const el = document.getElementById('annSectionCard');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function renderAnnSection() {
  const section = document.getElementById('annSection');
  if (currentTab !== 'people') { section.innerHTML = ''; return; }
  const upcoming = getUpcomingAnniversaries();
  if (!upcoming.length) { section.innerHTML = ''; return; }
  let html = '<div class="ann-section" id="annSectionCard"><div class="ann-section-title">📅 直近の記念日</div>';
  upcoming.forEach(u => {
    const emoji = u.ann.name.match(/[\p{Emoji}]/u) ? u.ann.name.match(/[\p{Emoji}]/u)[0] : '📅';
    const label = u.ann.name.replace(/[\p{Emoji}]/gu,'').trim();
    const badgeClass = u.days === 0 ? 'ann-badge-today' : 'ann-badge-soon';
    const badgeText = u.days === 0 ? '🎉 今日！' : 'あと'+u.days+'日';
    const sectionClick = u.person.id==='_myprofile' ? 'openMyProfile()' : `jumpToPerson('${u.person.id}')`;
    html += `<div class="ann-section-item" onclick="${sectionClick}">
      <span style="font-size:20px;">${emoji}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${esc(u.person.nickname)}</div>
        <div style="font-size:12px;color:var(--sub);">${esc(label)} ${formatAnnDate(u.ann.date, u.ann.dateType)}</div>
      </div>
      <span class="ann-badge ${badgeClass}">${badgeText}</span>
    </div>`;
  });
  html += '</div>';
  section.innerHTML = html;
}

// ===== Update notification =====
const UPDATE_CHECK_KEY = 'awai_last_update_check';
const VERSION_URL = 'https://awai.gift/version.json';
const CHECK_HOURS = [9, 19]; // 朝9時・夜7時にチェック

function checkAppUpdate() {
  // 起動時：前回ローカルバージョンと違えば即バナー（デプロイ直後対応）
  const lastVersion = localStorage.getItem(VERSION_KEY);
  if (lastVersion && lastVersion !== APP_VERSION) {
    showUpdateBanner(APP_VERSION);
  }
  localStorage.setItem(VERSION_KEY, APP_VERSION);
  // 定期チェック開始
  scheduleUpdateCheck();
  // バックアップリマインドチェック（Supabase導入済みのため無効化）
  // checkBackupReminder();
  // 緊急バックアップがあれば復元案内
  checkEmergencyBackup();
}

function shouldCheckNow() {
  const now = new Date();
  const hour = now.getHours();
  const today = toLocalDateStr(now);
  const lastCheck = localStorage.getItem(UPDATE_CHECK_KEY) || '';
  // チェック時間帯（9時台 or 19時台）かつ、今日のその時間帯でまだチェックしていない
  for (const h of CHECK_HOURS) {
    if (hour === h) {
      const checkKey = today + '-' + h;
      if (lastCheck !== checkKey) return checkKey;
    }
  }
  return null;
}

async function fetchVersionCheck() {
  try {
    const res = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    if (json.version && json.version !== APP_VERSION) {
      showUpdateBanner(json.version);
    }
  } catch(e) { /* ネットワークエラーは無視 */ }
}

function showUpdateBanner(newVersion) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.innerHTML = `<div class="update-banner" onclick="location.reload()">
    <span class="update-icon">🆕</span>
    <span class="update-text">新しいバージョン(v${newVersion})があります。タップして更新してください。</span>
    <span class="update-close" onclick="event.stopPropagation();this.parentElement.remove();">✕</span>
  </div>`;
}

function scheduleUpdateCheck() {
  // 5分ごとに「チェック時間帯か？」を確認（軽量な判定のみ）
  setInterval(() => {
    const checkKey = shouldCheckNow();
    if (checkKey) {
      localStorage.setItem(UPDATE_CHECK_KEY, checkKey);
      fetchVersionCheck();
    }
  }, 5 * 60 * 1000);
  // 起動時にもチェック時間帯なら即チェック
  const checkKey = shouldCheckNow();
  if (checkKey) {
    localStorage.setItem(UPDATE_CHECK_KEY, checkKey);
    fetchVersionCheck();
  }
}

let _navHistory = [];
let _navFuture = [];

function updateBackBtn() {
  const backBtn = document.getElementById('navBackBtn');
  const fwdBtn = document.getElementById('navFwdBtn');
  if (!backBtn || !fwdBtn) return;
  const canBack = openPersonId || openGroupId || openItemId || openAllRecordId || _navHistory.length > 0;
  const canFwd = _navFuture.length > 0;
  backBtn.style.color = canBack ? 'var(--accent)' : 'var(--border)';
  backBtn.style.pointerEvents = canBack ? '' : 'none';
  fwdBtn.style.color = canFwd ? 'var(--accent)' : 'var(--border)';
  fwdBtn.style.pointerEvents = canFwd ? '' : 'none';
}

function navPushState() {
  _navHistory.push({ tab: currentTab, label: currentLabel, person: openPersonId, group: openGroupId, item: openItemId, record: openAllRecordId });
  _navFuture = [];
}

function goBack() {
  if (openPersonId) { _navFuture.push({person:openPersonId}); openPersonId = null; render(); return; }
  if (openGroupId) { _navFuture.push({group:openGroupId}); openGroupId = null; render(); return; }
  if (openItemId) { _navFuture.push({item:openItemId}); openItemId = null; render(); return; }
  if (openAllRecordId) { _navFuture.push({record:openAllRecordId}); openAllRecordId = null; render(); return; }
  if (_navHistory.length > 0) {
    _navFuture.push({ tab: currentTab, label: currentLabel });
    const prev = _navHistory.pop();
    currentTab = prev.tab;
    currentLabel = prev.label;
    openPersonId = prev.person || null;
    openGroupId = prev.group || null;
    openItemId = prev.item || null;
    openAllRecordId = prev.record || null;
    document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab===currentTab));
    render();
  }
}

function goForward() {
  if (_navFuture.length === 0) return;
  const next = _navFuture.pop();
  if (next.person) { openPersonId = next.person; render(); return; }
  if (next.group) { openGroupId = next.group; render(); return; }
  if (next.item) { openItemId = next.item; render(); return; }
  if (next.record) { openAllRecordId = next.record; render(); return; }
  if (next.tab) {
    _navHistory.push({ tab: currentTab, label: currentLabel });
    currentTab = next.tab;
    currentLabel = next.label || null;
    document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab===currentTab));
    render();
  }
}

function render() {
  updateBackBtn();
  const cardList = document.getElementById('cardList');
  if (isDummyMode) {
    cardList.innerHTML = '<div class="empty-msg">データがありません<br>下の ＋ ボタンから追加できます</div>';
    document.getElementById('reminderZone').innerHTML = '';
    document.getElementById('pickupZone').innerHTML = '';
    document.getElementById('annSection').innerHTML = '';
    document.getElementById('labelBar').innerHTML = '';
    return;
  }
  renderLabelBar();
  renderReminders();
  renderPickup();
  renderAnnSection();

  // Items tab（独立描画）
  if (currentTab === 'items') {
    document.getElementById('rankingToggle').style.display = '';
    document.getElementById('rankOnBtn').style.display = '';
    const annBtn = document.getElementById('annSortBtn');
    if (annBtn) annBtn.style.display = '';
    renderItemsTab(cardList);
    return;
  }

  // Calendar tab
  if (currentTab === 'calendar') {
    renderCalendar(cardList);
    document.getElementById('rankingToggle').style.display = 'none';
    return;
  }

  // Show ranking toggle for all tabs (except calendar)
  const rankToggle = document.getElementById('rankingToggle');
  rankToggle.style.display = currentTab !== 'calendar' ? '' : 'none';
  // ランキングボタンはアイテム系タブのみ
  document.getElementById('rankOnBtn').style.display = ['wish','received','gave','place','gift','items'].includes(currentTab) ? '' : 'none';
  // 記念日ソートボタンは全タブ表示
  const annSortBtn = document.getElementById('annSortBtn');
  if (annSortBtn) annSortBtn.style.display = '';
  // ギフトタブ用のあげた/もらったボタン表示制御
  const gaveBtn = document.getElementById('giftGaveBtn');
  const recvBtn = document.getElementById('giftReceivedBtn');
  if (gaveBtn && recvBtn) {
    gaveBtn.style.display = currentTab==='gift' ? '' : 'none';
    recvBtn.style.display = currentTab==='gift' ? '' : 'none';
    gaveBtn.classList.toggle('active', currentLabel==='gave');
    recvBtn.classList.toggle('active', currentLabel==='received');
  }

  // Gift tab: もらった＋あげた統合ビュー
  if (currentTab === 'gift') {
    const allGifts = [];
    const tabIcons = {received:'🎀', gave:'🎁'};
    ['received','gave'].forEach(tab => {
      (data[tab]||[]).forEach(item => {
        if (matchesSearch(item, tab)) {
          // フィルター: もらった/あげた
          if (currentLabel === 'received' && tab !== 'received') return;
          if (currentLabel === 'gave' && tab !== 'gave') return;
          // カテゴリフィルター
          if (currentLabel && currentLabel !== 'received' && currentLabel !== 'gave' && item.itemCategory !== currentLabel) return;
          allGifts.push({...item, _tab:tab, _icon:tabIcons[tab]});
        }
      });
    });
    allGifts.sort((a,b) => {
      if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
      return (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'');
    });
    if (!allGifts.length) {
      cardList.innerHTML = '<div class="empty-msg">🎁 ギフトの記録はまだありません<br>下の ＋ ボタンから追加できます</div>';
    } else {
      const visibleGifts = allGifts.filter(i=>!i.hidden);
      const hiddenGifts = allGifts.filter(i=>i.hidden);
      const isOpenKey = openAllRecordId;
      let giftHtml = visibleGifts.map(item => {
        const key = item._tab + ':' + item.id;
        const preview = item._icon + ' ' + (item.person?item.person+' ':'') + (item.occasion||'');
        const active = isOpenKey === key;
        return `<div class="list-item" data-lp-type="${item._tab}" data-lp-id="${item.id}" ontouchstart="lpStart(event,'${item._tab}','${item.id}')" ontouchend="lpEnd()" ontouchmove="lpMove(event)" onclick="toggleAllRecordDetail('${item._tab}','${item.id}')" style="${active?'background:var(--accent-light);':''}">
          <div style="width:6px;height:40px;border-radius:3px;background:${item._tab==='gave'?'#d48a7a':'#7a9ad4'};flex-shrink:0;"></div>
          <div class="list-body">
            <div class="list-name">${item.pinned?'📌 ':''}${esc(item.title||'無題')}</div>
            <div class="list-preview">${esc(preview)}</div>
          </div>
          <div class="list-meta"><div class="list-date">${item.date||''}</div></div>
        </div>`;
      }).join('');
      if (hiddenGifts.length) {
        const hid = 'hiddenGifts_'+Math.random().toString(36).slice(2);
        giftHtml += `<div style="margin-top:12px;padding:8px 12px;cursor:pointer;color:var(--sub);font-size:13px;text-align:center;border:1px dashed var(--border);border-radius:12px;" onclick="const b=document.getElementById('${hid}');const t=this;if(b.style.display==='none'){b.style.display='';t.textContent='▲ 非表示を閉じる (${hiddenGifts.length}件)';}else{b.style.display='none';t.textContent='▼ 非表示を表示 (${hiddenGifts.length}件)';}">▼ 非表示を表示 (${hiddenGifts.length}件)</div>`;
        giftHtml += `<div id="${hid}" style="display:none;opacity:0.5;">${hiddenGifts.map(item => {
          const preview = (item._tab==='gave'?'🎁':'🎀') + ' ' + (item.person||'');
          return `<div class="list-item" data-lp-type="${item._tab}" data-lp-id="${item.id}" ontouchstart="lpStart(event,'${item._tab}','${item.id}')" ontouchend="lpEnd()" ontouchmove="lpMove(event)" onclick="toggleAllRecordDetail('${item._tab}','${item.id}')"><div style="width:6px;height:40px;border-radius:3px;background:${item._tab==='gave'?'#d48a7a':'#7a9ad4'};flex-shrink:0;"></div><div class="list-body"><div class="list-name">${esc(item.title||'無題')}</div><div class="list-preview">${esc(preview)}</div></div></div>`;
        }).join('')}</div>`;
      }
      cardList.innerHTML = giftHtml;
      addMenuButtons(cardList);
      if (isOpenKey) {
        const openItem = allGifts.find(x=>(x._tab+':'+x.id)===isOpenKey);
        if (openItem) cardList.innerHTML += `<div id="allRecordDetail">${renderItemCard(openItem, openItem._tab)}</div>`;
      }
    }
    return;
  }

  // All records view (wish tab, label = null = "all")
  if (currentTab === 'wish' && currentLabel === null) {
    const allItems = [];
    const tabIcons = {wish:'✨', received:'🎀', gave:'🎁', place:'📍'};
    ['wish','received','gave'].forEach(tab => {
      (data[tab]||[]).forEach(item => {
        if (matchesSearch(item, tab)) allItems.push({...item, _tab:tab, _icon:tabIcons[tab]});
      });
    });
    allItems.sort((a,b) => {
      if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
      return (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'');
    });
    if (!allItems.length) {
      cardList.innerHTML = '<div class="empty-msg">📋 まだ記録がありません</div>';
    } else {
      const isOpenKey = openAllRecordId;
      cardList.innerHTML = allItems.map(item => {
        const key = item._tab + ':' + item.id;
        const preview = item._icon + ' ' + (item.person?item.person+' ':'') + (item.occasion||'');
        const active = isOpenKey === key;
        return `<div class="list-item" data-lp-type="${item._tab}" data-lp-id="${item.id}" ontouchstart="lpStart(event,'${item._tab}','${item.id}')" ontouchend="lpEnd()" ontouchmove="lpMove(event)" onclick="toggleAllRecordDetail('${item._tab}','${item.id}')" style="${active?'background:var(--accent-light);':''}">
          <div style="width:6px;height:40px;border-radius:3px;background:${item._tab==='gave'?'#d48a7a':item._tab==='received'?'#7a9ad4':'var(--accent)'};flex-shrink:0;"></div>
          <div class="list-body">
            <div class="list-name">${item.pinned?'📌 ':''}${esc(item.title||'無題')}</div>
            <div class="list-preview">${esc(preview)}</div>
          </div>
          <div class="list-meta"><div class="list-date">${item.date||''}</div></div>
        </div>`;
      }).join('');
      if (isOpenKey) {
        const openItem = allItems.find(x=>(x._tab+':'+x.id)===isOpenKey);
        if (openItem) cardList.innerHTML += `<div id="allRecordDetail">${renderItemCard(openItem, openItem._tab)}</div>`;
      }
    }
    return;
  }

  // For wish tab with category filter, search across wish+received+gave
  if (currentTab === 'wish' && currentLabel !== null && typeof currentLabel === 'string') {
    const tabIcons = {wish:'✨', received:'🎀', gave:'🎁'};
    const allFiltered = [];
    ['wish','received','gave'].forEach(tab => {
      (data[tab]||[]).forEach(item => {
        if (!matchesSearch(item, tab)) return;
        if (item.itemCategory === currentLabel) {
          allFiltered.push({...item, _tab:tab, _icon:tabIcons[tab]});
        }
      });
    });
    if (!allFiltered.length) {
      cardList.innerHTML = `<div class="empty-msg">「${esc(currentLabel)}」のお気に入りはまだありません</div>`;
      return;
    }
    allFiltered.sort((a,b) => {
      if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
      return (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'');
    });
    const isOpenKey = openAllRecordId;
    cardList.innerHTML = allFiltered.map(item => {
      const key = item._tab + ':' + item.id;
      const preview = item._icon + ' ' + (item.person?item.person+' ':'') + (item.occasion||'');
      const active = isOpenKey === key;
      return `<div class="list-item" data-lp-type="${item._tab}" data-lp-id="${item.id}" ontouchstart="lpStart(event,'${item._tab}','${item.id}')" ontouchend="lpEnd()" ontouchmove="lpMove(event)" onclick="toggleAllRecordDetail('${item._tab}','${item.id}')" style="${active?'background:var(--accent-light);':''}">
        <div style="width:6px;height:40px;border-radius:3px;background:${item._tab==='gave'?'#d48a7a':item._tab==='received'?'#7a9ad4':'var(--accent)'};flex-shrink:0;"></div>
        <div class="list-body">
          <div class="list-name">${item.pinned?'📌 ':''}${esc(item.title||'無題')}</div>
          <div class="list-preview">${esc(preview)}</div>
        </div>
        <div class="list-meta"><div class="list-date">${item.date||''}</div></div>
      </div>`;
    }).join('');
    if (isOpenKey) {
      const openItem = allFiltered.find(x=>(x._tab+':'+x.id)===isOpenKey);
      if (openItem) cardList.innerHTML += `<div id="allRecordDetail">${renderItemCard(openItem, openItem._tab)}</div>`;
    }
    return;
  }

  let items = (data[currentTab]||[]).filter(i => matchesSearch(i, currentTab));
  // フィルター処理（全てitemsに代入し、描画は後の共通パスで行う）
  if (currentTab === 'place' && currentLabel === null) items = items.filter(i => !i.isClosed);
  if (currentTab === 'place' && currentLabel === 'closed') {
    items = items.filter(i => i.isClosed);
  } else if (currentTab === 'place' && currentLabel && typeof currentLabel === 'string' && currentLabel !== 'closed') {
    items = items.filter(i => !i.isClosed && i.placeCategory === currentLabel);
  } else if (['wish','received','gave'].includes(currentTab) && currentLabel && typeof currentLabel === 'string') {
    items = items.filter(i => i.itemCategory === currentLabel);
  } else if (currentTab !== 'people' && currentLabel !== null && typeof currentLabel === 'number') {
    const ln = (getLabels(currentTab)[currentLabel]?.name||'').toLowerCase();
    items = items.filter(i => {
      if (i.labelIdx === currentLabel) return true;
      const text = [i.title, i.memo, ...(i.tags||[])].filter(Boolean).join(' ').toLowerCase();
      return ln && text.includes(ln);
    });
  } else if (currentTab === 'groups') {
    const groups = (data.groups||[]).filter(g => matchesSearch(g, 'groups'));
    if (!groups.length) {
      cardList.innerHTML = '<div class="empty-msg">👥 グループを作りましょう<br>旅行のお土産やまとめた贈り物に便利です<br>下の ＋ ボタンから作成できます</div>';
      return;
    }
    const visibleGroups = groups.filter(g => !g.hidden);
    const hiddenGroups = groups.filter(g => g.hidden);
    const sorted = [...visibleGroups].sort((a,b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'');
    });
    let groupHtml = sorted.map(g => renderGroupListItem(g)).join('');
    if (hiddenGroups.length) {
      const hid = 'hiddenGroups_'+Math.random().toString(36).slice(2);
      groupHtml += `<div style="margin-top:12px;padding:8px 12px;cursor:pointer;color:var(--sub);font-size:13px;text-align:center;border:1px dashed var(--border);border-radius:12px;" onclick="const b=document.getElementById('${hid}');const t=this;if(b.style.display==='none'){b.style.display='';t.textContent='▲ 非表示を閉じる (${hiddenGroups.length}件)';}else{b.style.display='none';t.textContent='▼ 非表示を表示 (${hiddenGroups.length}件)';}">▼ 非表示を表示 (${hiddenGroups.length}件)</div>`;
      groupHtml += `<div id="${hid}" style="display:none;opacity:0.5;">`;
      groupHtml += hiddenGroups.map(g => renderGroupListItem(g)).join('');
      groupHtml += '</div>';
    }
    cardList.innerHTML = groupHtml;
    if (openGroupId) {
      const group = data.groups.find(x=>x.id===openGroupId);
      if (group) cardList.innerHTML += `<div id="groupDetail">${renderGroupCard(group)}</div>`;
    }
    return;
  } else if (currentTab === 'people') {
    // Filter by individual/corporate
    // グループフィルター
    if (currentLabel === 'groups') {
      const groups = (data.groups||[]).filter(g => matchesSearch(g, 'groups'));
      if (!groups.length) {
        cardList.innerHTML = '<div class="empty-msg">👥 グループを作りましょう<br>下の ＋ ボタンから作成できます</div>';
        return;
      }
      const visibleG = groups.filter(g=>!g.hidden);
      const hiddenG = groups.filter(g=>g.hidden);
      const sortedG = [...visibleG].sort((a,b) => { if(a.pinned&&!b.pinned)return -1; if(!a.pinned&&b.pinned)return 1; return (b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''); });
      let gHtml = sortedG.map(g => renderGroupListItem(g)).join('');
      if (hiddenG.length) {
        const hid='hidG_'+Math.random().toString(36).slice(2);
        gHtml += `<div style="margin-top:12px;padding:8px 12px;cursor:pointer;color:var(--sub);font-size:13px;text-align:center;border:1px dashed var(--border);border-radius:12px;" onclick="const b=document.getElementById('${hid}');const t=this;if(b.style.display==='none'){b.style.display='';t.textContent='▲ 非表示を閉じる (${hiddenG.length}件)';}else{b.style.display='none';t.textContent='▼ 非表示を表示 (${hiddenG.length}件)';}">▼ 非表示を表示 (${hiddenG.length}件)</div>`;
        gHtml += `<div id="${hid}" style="display:none;opacity:0.5;">${hiddenG.map(g=>renderGroupListItem(g)).join('')}</div>`;
      }
      cardList.innerHTML = gHtml;
      if (openGroupId) { const group=data.groups.find(x=>x.id===openGroupId); if(group) cardList.innerHTML+=`<div id="groupDetail">${renderGroupCard(group)}</div>`; }
      return;
    }
    let filteredPeople = items;
    if (currentLabel === 'memory') filteredPeople = items.filter(p=>p.isMemory);
    else if (currentLabel === 'individual') filteredPeople = items.filter(p=>p.type!=='corporate'&&!p.isMemory);
    else if (currentLabel === 'corporate') filteredPeople = items.filter(p=>p.type==='corporate'&&!p.isMemory);
    else filteredPeople = items.filter(p=>!p.isMemory);
    if (!filteredPeople.length) {
      const msg = currentLabel==='memory' ? '🤍 記憶はまだ登録されていません' : currentLabel==='corporate' ? '🏢 会社はまだ登録されていません' : currentLabel==='individual' ? '👤 友だちはまだ登録されていません' : '👤 友だちを追加しましょう';
      cardList.innerHTML = `<div class="empty-msg">${msg}<br>下の ＋ ボタンから追加できます</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
          <button onclick="openPeopleFabMenu()" style="padding:10px 16px;border-radius:12px;border:1px solid var(--pickup-border);background:var(--pickup);color:var(--text);font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📷 画像から一括登録</button>
        </div>`;
      return;
    }
    const visiblePeople = filteredPeople.filter(p=>!p.hidden);
    const hiddenPeople = filteredPeople.filter(p=>p.hidden);
    const sortedPeople = [...visiblePeople].sort((a,b) => {
      if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
      if (annSortMode) {
        const da = getNearestAnnDays(a), db = getNearestAnnDays(b);
        return annSortMode==='asc' ? da-db : db-da;
      }
      return (a.nickname||'').localeCompare(b.nickname||'', 'ja');
    });
    let peopleHtml = sortedPeople.map(p => renderPersonListItem(p)).join('');
    if (hiddenPeople.length) {
      const hid = 'hiddenPeople_'+Math.random().toString(36).slice(2);
      peopleHtml += `<div style="margin-top:12px;padding:8px 12px;cursor:pointer;color:var(--sub);font-size:13px;text-align:center;border:1px dashed var(--border);border-radius:12px;" onclick="const b=document.getElementById('${hid}');const t=this;if(b.style.display==='none'){b.style.display='';t.textContent='▲ 非表示を閉じる (${hiddenPeople.length}人)';}else{b.style.display='none';t.textContent='▼ 非表示を表示 (${hiddenPeople.length}人)';}">▼ 非表示を表示 (${hiddenPeople.length}人)</div>`;
      peopleHtml += `<div id="${hid}" style="display:none;">`;
      const sortedHidden = [...hiddenPeople].sort((a,b) => (a.nickname||'').localeCompare(b.nickname||'', 'ja'));
      peopleHtml += sortedHidden.map(p => renderPersonListItem(p)).join('');
      peopleHtml += '</div>';
    }
    cardList.innerHTML = peopleHtml;
    addMenuButtons(cardList);
    // If a person detail is open, show it
    if (openPersonId) {
      const person = data.people.find(x=>x.id===openPersonId);
      if (person) cardList.innerHTML += `<div id="personDetail">${renderPersonCard(person)}</div>`;
    }
  }
  // アイテム系タブは常にここで描画（elseチェーンから独立）
  if (['wish','received','gave','place'].includes(currentTab)) {
    console.log('[AWAI DEBUG] wish/place direct render path for', currentTab, 'items:', items.length);
    // アイテム系タブ: 直接描画（⋮ボタン確実表示）
    const visibleItems = items.filter(i => !i.hidden);
    const hiddenItems = items.filter(i => i.hidden);
    if (!visibleItems.length && !hiddenItems.length) {
      const msgs = { wish:'✨ お気に入りを追加してみましょう', received:'🎀 もらった贈り物を記録しましょう',
        gave:'🎁 あげた贈り物を記録しましょう', place:'📍 行きたい場所を追加しましょう' };
      cardList.innerHTML = `<div class="empty-msg">${msgs[currentTab]||''}<br>下の ＋ ボタンから追加できます</div>`;
      return;
    }
    const sorted = [...visibleItems].sort((a,b) => {
      if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
      return (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'');
    });
    const tab = currentTab;
    const inSelect = _selectMode && _selectType === tab;
    let listHtml = sorted.map(item => {
      const stars = item.rating ? '★'.repeat(item.rating) : '';
      const tagPreview = item.tags?.slice(0,3).map(t=>'#'+t).join(' ')||'';
      const personPreview = item.person ? '👤 '+item.person : '';
      const preview = personPreview || tagPreview || (item.memo?item.memo.substring(0,20):'');
      const isOpen = openItemId === item.id;
      const selected = inSelect && _selectedIds.has(item.id);
      return `<div class="list-item" data-lp-type="${tab}" data-lp-id="${item.id}" onclick="${inSelect?`toggleSelectItem('${item.id}')`:`toggleItemDetail('${item.id}')`}" style="${isOpen?'background:var(--accent-light);':''}${selected?'background:rgba(193,154,132,0.15);':''}">
        ${inSelect?`<input type="checkbox" ${selected?'checked':''} onclick="event.stopPropagation();toggleSelectItem('${item.id}')" style="width:22px;height:22px;flex-shrink:0;accent-color:var(--accent);">`:''}
        <div class="list-body">
          <div class="list-name">${item.visited?'✅ ':''}${item.pinned?'📌 ':''}${esc(item.title||'無題')}${stars?` <span style="color:#f0b040;font-size:12px;">${stars}</span>`:''}</div>
          <div class="list-preview">${esc(preview)}</div>
        </div>
        <div class="list-meta">
          <div class="list-date">${item.date||''}</div>
          ${item.amount?`<div style="font-size:11px;color:var(--accent);font-weight:600;">¥${Number(item.amount).toLocaleString()}</div>`:''}
        </div>
        <span class="awai-menu-btn" style="font-size:24px;color:#b0a49e;padding:8px 12px;cursor:pointer;flex-shrink:0;line-height:1;font-weight:bold;" onclick="event.stopPropagation();showLongPressMenu('${tab}','${item.id}')">⋮</span>
      </div>`;
    }).join('');
    if (hiddenItems.length) {
      const hid = 'hiddenItems_'+Math.random().toString(36).slice(2);
      listHtml += `<div style="margin-top:12px;padding:8px 12px;cursor:pointer;color:var(--sub);font-size:13px;text-align:center;border:1px dashed var(--border);border-radius:12px;" onclick="const b=document.getElementById('${hid}');const t=this;if(b.style.display==='none'){b.style.display='';t.textContent='▲ 非表示を閉じる (${hiddenItems.length}件)';}else{b.style.display='none';t.textContent='▼ 非表示を表示 (${hiddenItems.length}件)';}">▼ 非表示を表示 (${hiddenItems.length}件)</div>`;
      listHtml += `<div id="${hid}" style="display:none;opacity:0.5;">`;
      listHtml += [...hiddenItems].sort((a,b) => (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'')).map(item => {
        const preview = item.person ? '👤 '+item.person : (item.memo?item.memo.substring(0,20):'');
        return `<div class="list-item" data-lp-type="${tab}" data-lp-id="${item.id}" onclick="toggleItemDetail('${item.id}')">
          <div class="list-body"><div class="list-name">${esc(item.title||'無題')}</div><div class="list-preview">${esc(preview)}</div></div>
          <span class="awai-menu-btn" style="font-size:24px;color:#b0a49e;padding:8px 12px;cursor:pointer;flex-shrink:0;line-height:1;font-weight:bold;" onclick="event.stopPropagation();showLongPressMenu('${tab}','${item.id}')">⋮</span>
        </div>`;
      }).join('');
      listHtml += '</div>';
    }
    cardList.innerHTML = listHtml;
    if (openItemId) {
      const item = items.find(x=>x.id===openItemId);
      if (item) cardList.innerHTML += `<div id="itemDetail">${renderItemCard(item, currentTab)}</div>`;
    }
  }
  // 全タブ共通: card-itemに⋮ボタンをDOM追加
  setTimeout(() => {
    const cl = document.getElementById('cardList');
    if (!cl) return;
    Array.from(cl.children).forEach(el => {
      if (el.querySelector('.awai-menu-btn')) return;
      if (el.classList.contains('empty-msg') || el.tagName === 'STYLE') return;
      if (el.id && ['itemDetail','personDetail','groupDetail','allRecordDetail'].includes(el.id)) return;
      const type = el.dataset.lpType || el.dataset.tab || currentTab;
      let id = el.dataset.lpId || el.dataset.id;
      if (!id) {
        const oc = el.getAttribute('onclick') || '';
        const m = oc.match(/'([a-z0-9_]+)'/);
        if (m) id = m[1];
      }
      if (!id) return;
      const btn = document.createElement('button');
      btn.className = 'awai-menu-btn';
      btn.textContent = '⋮';
      btn.style.cssText = 'font-size:22px;font-weight:bold;color:#b0a49e;background:none;border:none;padding:8px;cursor:pointer;flex-shrink:0;';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showLongPressMenu(type, id);
      });
      el.appendChild(btn);
    });
  }, 200);
}

let openItemId = null;

function renderItemListItem(item, tab) {
  const isOpen = openItemId === item.id;
  const stars = item.rating ? '★'.repeat(item.rating) : '';
  const purposeIcons = {self:'🛒', gift:'🎁', curious:'💭'};
  const purposeIcon = item.purpose ? (purposeIcons[item.purpose]||'') : '';
  const giftTo = item.purpose==='gift' && item.giftTarget ? ' → '+item.giftTarget : '';
  const tagPreview = item.tags?.slice(0,3).map(t=>'#'+t).join(' ')||'';
  const personPreview = item.person ? '👤 '+item.person : '';
  const preview = item.purpose ? (purposeIcon + giftTo + (personPreview&&!giftTo?' '+personPreview:'')) : (personPreview || tagPreview || (item.memo?item.memo.substring(0,20):''));

  return `<div class="list-item" data-lp-type="${tab}" data-lp-id="${item.id}" ontouchstart="lpStart(event,'${tab}','${item.id}')" ontouchend="lpEnd()" ontouchmove="lpMove(event)" onclick="${_selectMode&&_selectType===tab?`toggleSelectItem('${item.id}')`:`toggleItemDetail('${item.id}')`}" style="${isOpen?'background:var(--accent-light);':''}${_selectMode&&_selectedIds.has(item.id)?'background:rgba(193,154,132,0.15);':''}">
    ${_selectMode&&_selectType===tab?`<input type="checkbox" id="sel_${item.id}" ${_selectedIds.has(item.id)?'checked':''} onclick="event.stopPropagation();toggleSelectItem('${item.id}')" style="width:20px;height:20px;flex-shrink:0;accent-color:var(--accent);">`:''}
    <div class="list-body">
      <div class="list-name">${item.visited?'✅ ':''}${item.pinned?'📌 ':''}${esc(item.title||'無題')}${stars?` <span style="color:#f0b040;font-size:12px;">${stars}</span>`:''}</div>
      <div class="list-preview">${esc(preview)}${tagPreview&&preview!==tagPreview?' '+tagPreview:''}</div>
    </div>
    <div class="list-meta">
      <div class="list-date">${item.date||''}</div>
      ${item.amount?`<div style="font-size:11px;color:var(--accent);font-weight:600;">¥${Number(item.amount).toLocaleString()}</div>`:''}
    </div>
    <button class="awai-menu-btn" style="font-size:16px;color:#fff;background:var(--accent);border:none;border-radius:8px;padding:4px 10px;cursor:pointer;flex-shrink:0;font-weight:bold;margin-left:4px;" onclick="event.stopPropagation();showLongPressMenu('${tab}','${item.id}')">⋮</button>
  </div>`;
}

function toggleItemDetail(id) {
  openItemId = openItemId === id ? null : id;
  render();
  if (openItemId) {
    setTimeout(() => {
      const detail = document.getElementById('itemDetail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function renderItems(items, cardList) {
  // 非表示フィルタリング
  const visibleItems = items.filter(i => !i.hidden);
  const hiddenItems = items.filter(i => i.hidden);

  if (!visibleItems.length && !hiddenItems.length) {
    const msgs = { wish:'✨ お気に入りを追加してみましょう', received:'🎀 もらった贈り物を記録しましょう',
      gave:'🎁 あげた贈り物を記録しましょう', place:'📍 行きたい場所を追加しましょう' };
    cardList.innerHTML = `<div class="empty-msg">${msgs[currentTab]||''}<br>下の ＋ ボタンから追加できます</div>`;
    return;
  }
  let sorted;
  if (rankMode) {
    sorted = [...visibleItems].filter(i=>(i.rating||0)>0).sort((a,b) => {
      if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
      return (b.rating||0)-(a.rating||0);
    });
    if (!sorted.length) {
      cardList.innerHTML = '<div class="empty-msg">⭐ まだ評価がありません<br>カードの★をタップして評価してください</div>';
      return;
    }
    cardList.innerHTML = sorted.map((i,idx) => renderItemListItem(i, currentTab)).join('');
    if (openItemId) {
      const item = sorted.find(x=>x.id===openItemId);
      if (item) cardList.innerHTML += `<div id="itemDetail">${renderItemCard(item, currentTab)}</div>`;
    }
  } else {
    sorted = [...visibleItems].sort((a,b) => {
      if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
      return (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'');
    });
    let listHtml = sorted.map(i => renderItemListItem(i, currentTab)).join('');
    // 非表示アイテムの折りたたみ
    if (hiddenItems.length) {
      const hid = 'hiddenItems_'+Math.random().toString(36).slice(2);
      listHtml += `<div style="margin-top:12px;padding:8px 12px;cursor:pointer;color:var(--sub);font-size:13px;text-align:center;border:1px dashed var(--border);border-radius:12px;" onclick="const b=document.getElementById('${hid}');const t=this;if(b.style.display==='none'){b.style.display='';t.textContent='▲ 非表示を閉じる (${hiddenItems.length}件)';}else{b.style.display='none';t.textContent='▼ 非表示を表示 (${hiddenItems.length}件)';}">▼ 非表示を表示 (${hiddenItems.length}件)</div>`;
      listHtml += `<div id="${hid}" style="display:none;opacity:0.5;">`;
      listHtml += [...hiddenItems].sort((a,b) => (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'')).map(i => renderItemListItem(i, currentTab)).join('');
      listHtml += '</div>';
    }
    cardList.innerHTML = listHtml;
    if (openItemId) {
      const item = items.find(x=>x.id===openItemId);
      if (item) cardList.innerHTML += `<div id="itemDetail">${renderItemCard(item, currentTab)}</div>`;
    }
  }
  // 全list-itemに⋮メニューを確実に追加（DOMフォールバック）
  setTimeout(() => addMenuButtons(cardList), 100);
}

// ===== Items Tab =====
function openItemsFabMenu() {
  const modal = document.getElementById('aiModal');
  modal.innerHTML = `<h2>アイテムを登録</h2>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');openItemsTabModal()" class="fab-menu-btn">
        <span style="font-size:24px;">✏️</span>
        <div><div style="font-size:14px;font-weight:500;">手動で追加</div><div style="font-size:11px;color:var(--sub);">名前やカテゴリを入力して登録</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startItemOcr('item_ocr','items','camera')" class="fab-menu-btn">
        <span style="font-size:24px;">📷</span>
        <div><div style="font-size:14px;font-weight:500;">カメラで撮影</div><div style="font-size:11px;color:var(--sub);">商品を撮影してAIが自動判定</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startItemOcr('item_ocr','items','file')" class="fab-menu-btn">
        <span style="font-size:24px;">📁</span>
        <div><div style="font-size:14px;font-weight:500;">ファイルから選択</div><div style="font-size:11px;color:var(--sub);">スクリーンショットもOK！</div></div>
      </button>
    </div>
    <div class="form-btns" style="margin-top:12px;">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

function openItemsTabModal(editId) {
  const modal = document.getElementById('modal');
  const item = editId ? data.items.find(i=>i.id===editId) : null;
  const isEdit = !!editId;
  const currentTags = item?.tags || [];
  const currentCat = item?.itemCategory || '';

  let html = `<h2>📦 アイテムを${isEdit?'編集':'追加'}</h2>`;

  // 名前
  html += `<div class="form-group"><label>名前 <span style="color:#c97070;font-size:11px;">* 必須</span></label><input id="fItemTitle" placeholder="例：ワイヤレスイヤホン、日本酒 獺祭" value="${esc(item?.title||'')}"></div>`;

  // カテゴリ
  const itemCatKeys = Object.keys(ITEM_CATEGORIES);
  html += `<div class="form-group"><label>カテゴリ</label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">`;
  itemCatKeys.forEach((cat, ci) => {
    const active = currentCat === cat;
    const emoji = _itemCatEmoji[_itemCatData.indexOf(cat)] || '';
    html += `<div class="date-type-chip ${active?'active':''}" onclick="selectItemsTabCat(this,${ci})" style="font-size:13px;padding:6px 14px;">${emoji} ${cat}</div>`;
  });
  html += `</div><input type="hidden" id="fItemCategory" value="${currentCat}"></div>`;

  // ジャンル
  html += `<div class="form-group"><label>ジャンル</label>
    <div id="itemsTabGenreTags" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">`;
  const showGenres = currentCat && ITEM_CATEGORIES[currentCat] ? ITEM_CATEGORIES[currentCat] : ALL_ITEM_GENRES;
  showGenres.forEach(g => {
    const active = currentTags.includes(g.toLowerCase()) || currentTags.includes(g);
    html += `<div class="date-type-chip ${active?'active':''}" onclick="toggleItemsTabTag(this,'${g}')" style="font-size:12px;">${g}</div>`;
  });
  html += `</div>
    <input id="fItemTags" placeholder="その他のタグ（カンマ区切り）" value="${currentTags.filter(t=>!ALL_ITEM_GENRES.map(g=>g.toLowerCase()).includes(t)&&!ALL_ITEM_GENRES.includes(t)).join(', ')}">
    <input type="hidden" id="fItemSelectedTags" value="${currentTags.filter(t=>ALL_ITEM_GENRES.map(g=>g.toLowerCase()).includes(t)||ALL_ITEM_GENRES.includes(t)).join(',')}">
  </div>`;

  // 評価
  const curRating = item?.rating||0;
  html += `<div class="form-group"><label>評価</label><div class="stars" id="fItemStars">`;
  for (let i=1; i<=5; i++) {
    html += `<span class="star ${i<=curRating?'on':''}" onclick="setItemsTabStar(${i})">★</span>`;
  }
  html += `</div><input type="hidden" id="fItemRating" value="${curRating}"></div>`;

  // 商品URL
  html += `<div class="form-group"><label>🔗 商品URL</label><input type="url" id="fItemUrl" placeholder="https://..." value="${esc(item?.url||'')}">
  <div class="form-hint">Amazon・楽天・公式サイトなどのリンク</div></div>`;

  // メモ
  html += `<div class="form-group"><label>メモ</label><textarea id="fItemMemo" placeholder="気になった理由、どこで見たかなど">${esc(item?.memo||'')}</textarea></div>`;

  // 写真
  html += photoInputHTML('fItemImg', item?.img);

  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="saveItemsTabItem('${editId||''}')">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function selectItemsTabCat(el, ci) {
  const cat = _itemCatData[ci];
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('fItemCategory').value = cat;
  // ジャンルタグを更新
  const container = document.getElementById('itemsTabGenreTags');
  if (!container) return;
  const genres = ITEM_CATEGORIES[cat] || ALL_ITEM_GENRES;
  const selected = (document.getElementById('fItemSelectedTags')?.value||'').split(',').filter(Boolean);
  container.innerHTML = genres.map(g => {
    const active = selected.includes(g) || selected.includes(g.toLowerCase());
    return `<div class="date-type-chip ${active?'active':''}" onclick="toggleItemsTabTag(this,'${g}')" style="font-size:12px;">${g}</div>`;
  }).join('');
}

function toggleItemsTabTag(el, tag) {
  el.classList.toggle('active');
  const input = document.getElementById('fItemSelectedTags');
  let tags = input.value.split(',').filter(Boolean);
  if (el.classList.contains('active')) { if (!tags.includes(tag)) tags.push(tag); }
  else { tags = tags.filter(t=>t!==tag&&t!==tag.toLowerCase()); }
  input.value = tags.join(',');
}

function setItemsTabStar(n) {
  document.getElementById('fItemRating').value = n;
  document.querySelectorAll('#fItemStars .star').forEach((s,i) => s.classList.toggle('on', i<n));
}

function saveItemsTabItem(editId) {
  const title = document.getElementById('fItemTitle').value.trim();
  if (!title) { alert('名前を入力してください'); return; }
  const selectedTags = (document.getElementById('fItemSelectedTags')?.value||'').split(',').filter(Boolean);
  const typedTags = parseTags(document.getElementById('fItemTags')?.value||'');
  const tags = [...new Set([...selectedTags, ...typedTags])];
  const fileInput = getPhotoData('fItemImg');
  function doSave(imgData) {
    const now = new Date().toISOString();
    const existing = editId ? data.items.find(i=>i.id===editId) : null;
    const item = {
      id: editId || genId(),
      title,
      itemCategory: document.getElementById('fItemCategory')?.value||'',
      tags: tags.length ? tags : [],
      rating: parseInt(document.getElementById('fItemRating')?.value)||0,
      url: document.getElementById('fItemUrl')?.value.trim()||'',
      memo: document.getElementById('fItemMemo')?.value.trim()||'',
      img: imgData,
      pinned: existing?.pinned||false,
      createdAt: existing?.createdAt||now,
      updatedAt: now
    };
    if (editId) {
      const idx = data.items.findIndex(i=>i.id===editId);
      if (idx >= 0) data.items[idx] = {...data.items[idx], ...item};
    } else {
      data.items.push(item);
    }
    saveData(); closeModal(); render();
    showToast(editId ? '更新しました' : '登録しました ✓');
  }
  if (fileInput && fileInput.files?.length) {
    const reader = new FileReader();
    reader.onload = e => doSave(e.target.result);
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    doSave(editId ? (editPhotoAction==='delete'?null:(data.items.find(i=>i.id===editId)?.img||null)) : null);
  }
}

// ===== Items Tab（完全独立描画） =====
function renderItemsTab(cardList) {
  const items = (data.items||[]).filter(i => matchesSearch(i, 'items'));
  if (!items.length) {
    cardList.innerHTML = '<div class="empty-msg">📦 アイテムを追加しましょう<br>下の ＋ ボタンから追加できます</div>';
    return;
  }
  const sorted = [...items].filter(i=>!i.hidden).sort((a,b) => {
    if (a.pinned&&!b.pinned) return -1; if (!a.pinned&&b.pinned) return 1;
    return (b.date||b.createdAt||'').localeCompare(a.date||a.createdAt||'');
  });
  const inSelect = _selectMode && _selectType === 'items';
  let html = sorted.map(item => {
    const preview = item.memo ? item.memo.substring(0,30) : (item.tags?.slice(0,3).map(t=>'#'+t).join(' ')||'');
    const isOpen = openItemId === item.id;
    const selected = inSelect && _selectedIds.has(item.id);
    return `<div class="list-item" style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--border);cursor:pointer;${isOpen?'background:var(--accent-light);':''}${selected?'background:rgba(193,154,132,0.15);':''}" onclick="${inSelect?`toggleSelectItem('${item.id}')`:`toggleItemDetail('${item.id}')`}">
      ${inSelect?`<input type="checkbox" ${selected?'checked':''} onclick="event.stopPropagation();toggleSelectItem('${item.id}')" style="width:22px;height:22px;flex-shrink:0;accent-color:var(--accent);">`:''}
      <div style="flex:1;min-width:0;">
        <div style="font-size:16px;font-weight:600;">${item.pinned?'📌 ':''}${esc(item.title||'無題')}</div>
        <div style="font-size:13px;color:var(--sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(preview)}</div>
      </div>
      <div style="flex-shrink:0;text-align:right;">
        ${item.date?`<div style="font-size:12px;color:var(--sub);">${item.date}</div>`:''}
        ${item.amount?`<div style="font-size:11px;color:var(--accent);font-weight:600;">¥${Number(item.amount).toLocaleString()}</div>`:''}
      </div>
      ${inSelect?'':`<button class="awai-menu-btn" style="font-size:22px;font-weight:bold;color:#b0a49e;background:none;border:none;padding:8px;cursor:pointer;flex-shrink:0;" onclick="event.stopPropagation();showLongPressMenu('items','${item.id}')">⋮</button>`}
    </div>`;
  }).join('');
  cardList.innerHTML = html;
  if (openItemId) {
    const item = items.find(x=>x.id===openItemId);
    if (item) cardList.innerHTML += `<div id="itemDetail">${renderItemCard(item, 'items')}</div>`;
  }
}

function addMenuButtons(container) {
  if (!container) return;
  // .list-itemだけでなく、cardListの直接の子要素全てを対象にする
  container.querySelectorAll('.list-item, .card-item, [onclick*="toggleItemDetail"], [onclick*="toggleAllRecordDetail"]').forEach(el => {
    if (el.querySelector('.awai-menu-btn')) return;
    const type = el.dataset.lpType || el.dataset.tab || currentTab;
    let id = el.dataset.lpId || el.dataset.id;
    // data属性がない場合、onclickから抽出
    if (!id) {
      const onclick = el.getAttribute('onclick') || '';
      const m = onclick.match(/Detail\('([^']+)'\)/) || onclick.match(/'([a-z0-9]+)'/);
      if (m) id = m[1];
    }
    if (!id) return;
    const btn = document.createElement('button');
    btn.className = 'awai-menu-btn';
    btn.textContent = '⋮';
    btn.style.cssText = 'font-size:16px;color:#fff;background:var(--accent);border:none;border-radius:8px;padding:4px 10px;cursor:pointer;flex-shrink:0;font-weight:bold;margin-left:4px;';
    btn.onclick = (e) => { e.stopPropagation(); showLongPressMenu(type, id); };
    el.appendChild(btn);
  });
}

// ===== Tab =====
function switchTab(tab) {
  // giftタブはreceived/gaveの統合ビュー
  if (tab === 'gift') {
    currentTab = 'gift';
    currentLabel = null;
  } else {
    currentTab = tab;
    currentLabel = tab==='people' ? 'individual' : null;
  }
  searchQuery = ''; rankMode = false; openPersonId = null; openItemId = null; openGroupId = null; openAllRecordId = null;
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab===tab));
  // タブ状態を常時保存（リロード時復元用）
  localStorage.setItem('awai_last_tab', currentTab);
  localStorage.setItem('awai_last_label', currentLabel === null ? '' : currentLabel);
  // ブラウザ履歴にpush（戻るボタン用）
  navPushState();
  history.pushState({tab: currentTab, label: currentLabel}, '');
  render();
  showTabGuide(tab);
}

// タブ初回ガイド
const TAB_GUIDES = {
  people: { emoji:'👤', msg:'友だち・会社・グループを登録して\n誕生日や記念日を忘れないようにしましょう' },
  wish: { emoji:'✨', msg:'気になるもの、欲しいものを\nメモしておく場所です' },
  calendar: { emoji:'📅', msg:'記念日やギフトの記録が\n一覧できます' },
  place: { emoji:'📍', msg:'行きたい場所、行った場所を\n記録しておきましょう' },
  gift: { emoji:'🎁', msg:'あげた・もらったギフトの\n記録を残す場所です' }
};

function showTabGuide(tab) {
  const key = 'awai_guide_' + tab;
  if (localStorage.getItem(key)) return;
  const guide = TAB_GUIDES[tab];
  if (!guide) return;
  localStorage.setItem(key, '1');

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);max-width:320px;width:90%;background:var(--text);color:#fff;border-radius:16px;padding:16px 20px;z-index:300;text-align:center;animation:fadeUp 0.3s ease;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
  el.innerHTML = `<div style="font-size:28px;margin-bottom:8px;">${guide.emoji}</div>
    <div style="font-size:14px;line-height:1.7;white-space:pre-line;">${guide.msg}</div>
    <div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);">タップして閉じる</div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentElement) el.remove(); }, 5000);
}

function jumpToPerson(id) {
  const person = data.people.find(x=>x.id===id);
  switchTab('people');
  // 記憶の人の場合は記憶フィルターに切り替え
  if (person?.isMemory) currentLabel = 'memory';
  else if (person?.hidden) currentLabel = null; // 非表示でも表示する
  openPersonId = id;
  history.pushState({person:id, tab:'people'}, '');
  render();
  setTimeout(() => {
    const detail = document.getElementById('personDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}
function jumpToItem(tab, id) {
  switchTab(tab);
  openItemId = id;
  history.pushState({item:id, tab:tab}, '');
  render();
  setTimeout(() => {
    const detail = document.getElementById('itemDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function jumpToGroup(id) {
  switchTab('people');
  currentLabel = 'groups';
  openGroupId = id;
  history.pushState({group:id, tab:'people'}, '');
  render();
  setTimeout(() => {
    const detail = document.getElementById('groupDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

// ===== Modal: Items =====
function openItemModal(id) {
  editingId = id||null; editPhotoAction = 'keep';
  const modal = document.getElementById('modal');
  const isEdit = !!editingId;
  const item = isEdit ? data[currentTab].find(i=>i.id===editingId) : null;
  const showPerson = ['received','gave'].includes(currentTab);
  const showOccasion = ['received','gave'].includes(currentTab);
  const showAmount = ['received','gave'].includes(currentTab);
  const showUrl = currentTab!=='people';

  // Category + Genre (same structure as place)
  const currentTags = item?.tags || [];
  const currentCat = item?.itemCategory || '';

  const tabTitles = {wish:'ほしいもの',received:'もらった',gave:'あげた'};
  let html = `<h2>${tabTitles[currentTab]||MODAL_TITLES[currentTab]} を${isEdit?'編集':'追加'}</h2>`;

  // Title
  const titlePlaceholders = {wish:'例：ワイヤレスイヤホン、日本酒 獺祭',received:'例：バースデーケーキ、ネクタイ',gave:'例：ハンドクリーム、お菓子詰め合わせ'};
  html += `<div class="form-group"><label>名前 <span style="color:#c97070;font-size:11px;">* 必須</span></label><input id="fTitle" placeholder="${titlePlaceholders[currentTab]||'例：商品名'}" value="${esc(item?.title||'')}"></div>`;

  // Person (received/gave)
  if (showPerson) {
    const personLabel = currentTab==='received' ? '誰から？' : '誰に？';
    const personVal = item?.person||'';
    html += `<div class="form-group"><label>${personLabel}</label>
    <input id="fPerson" placeholder="例：さとうさん" value="${esc(personVal)}" oninput="filterPersonSuggest(this.value)">
    <div id="personSuggestList" style="max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;margin-top:4px;${data.people.length?'':'display:none;'}">
      ${data.people.filter(p=>!p.isMemory).map(p=>`<div style="padding:8px 12px;font-size:14px;cursor:pointer;border-bottom:1px solid var(--border);" class="person-suggest-item" onclick="document.getElementById('fPerson').value='${esc(p.nickname||'')}';document.getElementById('personSuggestList').style.display='none';">${esc(p.nickname||'')}</div>`).join('')}
    </div>
    <div class="form-hint">友だちに登録済みの名前をタップで選択</div></div>`;
  }

  // Category (like place)
  const itemCatKeys = Object.keys(ITEM_CATEGORIES);
  html += `<div class="form-group"><label>カテゴリ</label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">`;
  itemCatKeys.forEach((cat, ci) => {
    const active = currentCat === cat;
    const emoji = _itemCatEmoji[_itemCatData.indexOf(cat)] || '';
    html += `<div class="date-type-chip ${active?'active':''}" onclick="selectItemCatByIdx(this,${ci})" style="font-size:13px;padding:6px 14px;">${emoji} ${cat}</div>`;
  });
  html += `</div><input type="hidden" id="fItemCategory" value="${currentCat}"></div>`;

  // Genre tags (like place)
  html += `<div class="form-group"><label>ジャンル</label>
    <div id="itemGenreTags" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">`;
  const showGenres = currentCat && ITEM_CATEGORIES[currentCat] ? ITEM_CATEGORIES[currentCat] : ALL_ITEM_GENRES;
  showGenres.forEach(g => {
    const active = currentTags.includes(g.toLowerCase()) || currentTags.includes(g);
    html += `<div class="date-type-chip ${active?'active':''}" onclick="toggleItemTag(this,'${g}')" style="font-size:12px;">${g}</div>`;
  });
  html += `</div>
    <input id="fTags" placeholder="その他のタグ（カンマ区切り）" value="${currentTags.filter(t=>!ALL_ITEM_GENRES.map(g=>g.toLowerCase()).includes(t)&&!ALL_ITEM_GENRES.includes(t)).join(', ')}">
    <input type="hidden" id="fItemSelectedTags" value="${currentTags.filter(t=>ALL_ITEM_GENRES.map(g=>g.toLowerCase()).includes(t)||ALL_ITEM_GENRES.includes(t)).join(',')}">
  </div>`;

  // Occasion (received/gave)
  if (showOccasion) {
    html += `<div class="form-group"><label>何の記念？</label><input id="fOccasion" placeholder="例：🎂 誕生日、🎍 お正月" value="${esc(item?.occasion||'')}"></div>`;
  }

  // Amount
  if (showAmount) {
    html += `<div class="form-group"><label>金額（任意）</label><input id="fAmount" type="number" placeholder="例：5000" value="${item?.amount||''}"></div>`;
  }

  // Date (received/gave)
  if (['received','gave'].includes(currentTab)) {
    html += `<div class="form-group"><label>日付</label><input type="date" id="fDate" value="${item?.date||''}"></div>`;
  }

  // Star rating
  const curRating = item?.rating||0;
  const ratingLabel = '評価';
  html += `<div class="form-group"><label>${ratingLabel}</label><div class="stars" id="fStars">`;
  for (let i=1; i<=5; i++) {
    html += `<span class="star ${i<=curRating?'on':''}" onclick="setFormStar(${i})">★</span>`;
  }
  html += `</div><input type="hidden" id="fRating" value="${curRating}"></div>`;

  // URL
  if (showUrl) {
    html += `<div class="form-group"><label>🔗 商品URL</label><input type="url" id="fUrl" placeholder="https://..." value="${esc(item?.url||'')}">
    <div class="form-hint">Amazon・楽天・公式サイトなどのリンク</div></div>`;
  }

  // Memo
  const memoPlaceholders = {wish:'気になった理由、どこで見たかなど',received:'感想、もらった場面など',gave:'相手の反応、喜んでくれたかなど'};
  html += `<div class="form-group"><label>メモ</label><textarea id="fMemo" placeholder="${memoPlaceholders[currentTab]||'自由にメモ'}">${esc(item?.memo||'')}</textarea></div>`;

  // Photo
  html += photoInputHTML('fImg', item?.img);
  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="saveItem()">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function setItemPurpose(purpose, el) {
  document.getElementById('fPurpose').value = purpose;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  const targetGroup = document.getElementById('fGiftTargetGroup');
  if (targetGroup) targetGroup.style.display = purpose==='gift' ? '' : 'none';
}

function filterPersonSuggest(query) {
  const list = document.getElementById('personSuggestList');
  if (!list) return;
  const items = list.querySelectorAll('.person-suggest-item');
  const q = query.toLowerCase();
  let visible = 0;
  items.forEach(el => {
    const match = !q || el.textContent.toLowerCase().includes(q);
    el.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  list.style.display = visible ? '' : 'none';
}

function filterCompanySuggest(query) {
  const list = document.getElementById('companySuggestList');
  if (!list) return;
  const items = list.querySelectorAll('.company-suggest-item');
  const q = query.toLowerCase();
  let visible = 0;
  items.forEach(el => {
    const match = !q || el.textContent.toLowerCase().includes(q);
    el.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  list.style.display = visible ? '' : 'none';
}

function selectItemCatByIdx(el, ci) {
  selectItemCategory(el, _itemCatData[ci]);
}

function selectItemCategory(el, cat) {
  const input = document.getElementById('fItemCategory');
  const wasActive = el.classList.contains('active');
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  if (!wasActive) { el.classList.add('active'); input.value = cat; } else { input.value = ''; }
  // Update genre tags
  const selectedTags = (document.getElementById('fItemSelectedTags')?.value||'').split(',').filter(Boolean);
  const genres = input.value && ITEM_CATEGORIES[input.value] ? ITEM_CATEGORIES[input.value] : ALL_ITEM_GENRES;
  const container = document.getElementById('itemGenreTags');
  if (container) {
    container.innerHTML = genres.map(g => {
      const active = selectedTags.includes(g) || selectedTags.includes(g.toLowerCase());
      return `<div class="date-type-chip ${active?'active':''}" onclick="toggleItemTag(this,'${g}')" style="font-size:12px;">${g}</div>`;
    }).join('');
  }
}

function toggleItemTag(el, tag) {
  el.classList.toggle('active');
  const input = document.getElementById('fItemSelectedTags');
  let tags = (input.value||'').split(',').filter(Boolean);
  if (el.classList.contains('active')) { if (!tags.includes(tag)) tags.push(tag); }
  else { tags = tags.filter(t=>t!==tag&&t!==tag.toLowerCase()); }
  input.value = tags.join(',');
}

function photoInputHTML(inputId, existingImg) {
  let preview = '';
  if (existingImg) {
    preview = `<div style="position:relative;display:inline-block;width:100%;"><img src="${existingImg}" style="width:100%;max-height:160px;object-fit:cover;border-radius:12px;margin-top:6px;"><div style="position:absolute;top:10px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;" onclick="removePhoto('${inputId}')">✕</div></div>`;
  }
  return `<div class="form-group"><label>写真</label>
    <input type="file" id="${inputId}Camera" accept="image/*" capture="environment" style="display:none;" onchange="previewPhoto(this,'${inputId}Preview')">
    <input type="file" id="${inputId}File" accept="image/*" style="display:none;" onchange="previewPhoto(this,'${inputId}Preview')">
    <input type="hidden" id="${inputId}Remove" value="">
    <div style="display:flex;gap:8px;margin-bottom:6px;">
      <div style="font-size:13px;color:var(--accent);cursor:pointer;padding:6px 14px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('${inputId}Camera').click()">📷 カメラ</div>
      <div style="font-size:13px;color:var(--accent);cursor:pointer;padding:6px 14px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('${inputId}File').click()">📁 ファイル</div>
    </div>
    <div id="${inputId}Preview">${preview}</div>
  </div>`;
}

function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 800;
  quality = quality || 0.8;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Generic rectangular crop state
let _rectCropImg=null,_rectCropX=0,_rectCropY=0,_rectCropScale=1,_rectCropDrag=false,_rectCropSX=0,_rectCropSY=0,_rectCropTargetId='',_rectCropInputId='';

function previewPhoto(input, previewId) {
  if (!input.files||!input.files[0]) return;
  const inputId = previewId.replace('Preview','');
  const removeEl = document.getElementById(inputId+'Remove');
  if (removeEl) removeEl.value = '';
  _rectCropTargetId = previewId;
  _rectCropInputId = inputId;
  compressImage(input.files[0]).then(dataUrl => {
    input.dataset.compressed = dataUrl;
    showRectCrop(dataUrl, previewId, inputId);
  });
}

function showRectCrop(dataUrl, previewId, inputId) {
  _rectCropImg = new Image();
  _rectCropImg.onload = function() {
    _rectCropX=0; _rectCropY=0; _rectCropScale=1; _rectCropDrag=false;
    const container = document.getElementById(previewId);
    if (!container) return;
    container.innerHTML = `
      <div id="rectCropBox" style="width:100%;height:200px;overflow:hidden;border-radius:12px;border:2px solid var(--accent);position:relative;touch-action:none;margin-top:6px;">
        <img id="rectCropImage" src="${dataUrl}" style="position:absolute;pointer-events:none;">
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <span style="font-size:14px;">−</span>
        <input type="range" id="rectCropZoom" min="50" max="300" value="100" style="flex:1;" oninput="setRectCropScale(this.value/100)">
        <span style="font-size:14px;">＋</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;justify-content:center;">
        <button class="card-btn" onclick="applyRectCrop()" style="padding:8px 24px;background:var(--accent-light);border-color:var(--accent);color:var(--accent);">✓ 決定</button>
        <button class="card-btn" onclick="cancelRectCrop('${inputId}')" style="padding:8px 24px;">✕ キャンセル</button>
      </div>`;
    const box = document.getElementById('rectCropBox');
    updateRectCrop(box);
    box.onmousedown = e=>{_rectCropDrag=true;_rectCropSX=e.clientX-_rectCropX;_rectCropSY=e.clientY-_rectCropY;};
    box.onmousemove = e=>{if(!_rectCropDrag)return;_rectCropX=e.clientX-_rectCropSX;_rectCropY=e.clientY-_rectCropSY;updateRectCrop(box);};
    box.onmouseup = ()=>{_rectCropDrag=false;};
    box.ontouchstart = e=>{e.preventDefault();const t=e.touches[0];_rectCropDrag=true;_rectCropSX=t.clientX-_rectCropX;_rectCropSY=t.clientY-_rectCropY;};
    box.ontouchmove = e=>{e.preventDefault();if(!_rectCropDrag)return;const t=e.touches[0];_rectCropX=t.clientX-_rectCropSX;_rectCropY=t.clientY-_rectCropSY;updateRectCrop(box);};
    box.ontouchend = ()=>{_rectCropDrag=false;};
  };
  _rectCropImg.src = dataUrl;
}

function updateRectCrop(box) {
  const img = document.getElementById('rectCropImage');
  if (!img||!_rectCropImg||!box) return;
  const bw = box.clientWidth, bh = box.clientHeight;
  const aspect = _rectCropImg.width/_rectCropImg.height;
  let w,h;
  if (aspect > bw/bh) { h=bh*_rectCropScale; w=h*aspect; } else { w=bw*_rectCropScale; h=w/aspect; }
  img.style.width=w+'px'; img.style.height=h+'px';
  img.style.left=((bw-w)/2+_rectCropX)+'px'; img.style.top=((bh-h)/2+_rectCropY)+'px';
}

function setRectCropScale(s) { _rectCropScale=s; const box=document.getElementById('rectCropBox'); if(box)updateRectCrop(box); }

function applyRectCrop() {
  const box = document.getElementById('rectCropBox');
  if (!box||!_rectCropImg) return;
  const bw=box.clientWidth, bh=box.clientHeight;
  const aspect=_rectCropImg.width/_rectCropImg.height;
  let w,h;
  if(aspect>bw/bh){h=bh*_rectCropScale;w=h*aspect;}else{w=bw*_rectCropScale;h=w/aspect;}
  const sx=(bw-w)/2+_rectCropX, sy=(bh-h)/2+_rectCropY;
  const srcX=(-sx/w)*_rectCropImg.width, srcY=(-sy/h)*_rectCropImg.height;
  const srcW=(bw/w)*_rectCropImg.width, srcH=(bh/h)*_rectCropImg.height;
  const canvas=document.createElement('canvas');
  canvas.width=Math.min(srcW,800); canvas.height=Math.min(srcH,800*(bh/bw));
  const ctx=canvas.getContext('2d');
  ctx.drawImage(_rectCropImg, srcX,srcY,srcW,srcH, 0,0,canvas.width,canvas.height);
  const result=canvas.toDataURL('image/jpeg',0.85);
  const previewId=_rectCropTargetId, inputId=_rectCropInputId;
  const container=document.getElementById(previewId);
  container.innerHTML=`<div style="position:relative;display:inline-block;width:100%;"><img src="${result}" style="width:100%;max-height:160px;object-fit:cover;border-radius:12px;margin-top:6px;"><div style="position:absolute;top:10px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;" onclick="removePhoto('${inputId}')">✕</div></div>`;
  const fileInput=document.getElementById(inputId+'File')||document.getElementById(inputId+'Camera');
  if(fileInput)fileInput.dataset.compressed=result;
}

function cancelRectCrop(inputId) {
  const previewId=_rectCropTargetId;
  document.getElementById(previewId).innerHTML='';
  const camera=document.getElementById(inputId+'Camera');
  const file=document.getElementById(inputId+'File');
  if(camera)camera.value=''; if(file)file.value='';
}

function removePhoto(inputId) {
  document.getElementById(inputId+'Preview').innerHTML = '';
  const removeEl = document.getElementById(inputId+'Remove');
  if (removeEl) removeEl.value = '1';
  const camera = document.getElementById(inputId+'Camera');
  const file = document.getElementById(inputId+'File');
  if (camera) camera.value = '';
  if (file) file.value = '';
}

function getPhotoData(inputId) {
  const camera = document.getElementById(inputId+'Camera');
  const file = document.getElementById(inputId+'File');
  const input = (file?.files?.length ? file : camera?.files?.length ? camera : null);
  return input;
}

function setFormStar(n) {
  const input = document.getElementById('fRating');
  const current = parseInt(input.value)||0;
  const newVal = current===n ? 0 : n;
  input.value = newVal;
  document.querySelectorAll('#fStars .star').forEach((s,i) => s.classList.toggle('on', i<newVal));
}

function toggleFormLabel(el, idx) {
  const input = document.getElementById('fLabelIdx');
  const wasActive = input.value == idx;
  document.querySelectorAll('#modal .label-chip').forEach(c => { c.classList.remove('active'); c.style.borderColor=''; c.style.background=''; });
  if (wasActive) { input.value = ''; }
  else { input.value = idx; el.classList.add('active'); el.style.borderColor=el.style.color; }
}

// ===== Modal: People =====
function openPeopleModal(id) {
  editingId = id||null; const modal = document.getElementById('modal');
  const isEdit = !!editingId;
  const p = isEdit ? data.people.find(i=>i.id===editingId) : null;

  const isCorp = isEdit ? p?.type==='corporate' : currentLabel==='corporate';
  let html = `<h2>${isCorp?'🏢 会社':'👤 友だち'} を${isEdit?'編集':'追加'}</h2>`;
  html += `<input type="hidden" id="pType" value="${isCorp?'corporate':'individual'}">`;

  // Individual fields
  html += `<div id="individualFields" style="display:${isCorp?'none':''}">`;
  // Avatar photo
  html += `<div class="form-group" style="text-align:center;">
    <div id="pAvatarPreview" style="width:72px;height:72px;border-radius:50%;background:var(--accent-light);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:32px;overflow:hidden;cursor:pointer;position:relative;" onclick="document.getElementById('pAvatarFile').click()">
      ${p?.avatar ? `<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">` : personIcon(p||{}).emoji}
    </div>
    <input type="file" id="pAvatarCamera" accept="image/*" capture="environment" style="display:none;" onchange="previewAvatar(this)">
    <input type="file" id="pAvatarFile" accept="image/*" style="display:none;" onchange="previewAvatar(this)">
    <input type="hidden" id="pAvatarRemove" value="">
    <div style="display:flex;gap:8px;justify-content:center;">
      <div style="font-size:12px;color:var(--accent);cursor:pointer;padding:4px 12px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('pAvatarCamera').click()">📷 カメラ</div>
      <div style="font-size:12px;color:var(--accent);cursor:pointer;padding:4px 12px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('pAvatarFile').click()">📁 ファイル</div>
      ${p?.avatar ? `<div style="font-size:12px;color:#c97070;cursor:pointer;padding:4px 12px;border:1px solid #c97070;border-radius:10px;" onclick="removeAvatar(event)">✕ 削除</div>` : ''}
    </div>
  </div>`;
  html += `<div class="form-group"><label>呼び名 <span style="color:#c97070;font-size:11px;">* 必須</span> ${helpBtn('nickname')}</label><input id="pNickname" placeholder="例：さとうさん、みーちゃん、部長" value="${esc(p?.nickname||'')}"></div>`;
  html += `<div class="form-group"><label>本名（任意）${helpBtn('fullName')}</label><input id="pFullName" placeholder="" value="${esc(p?.fullName||'')}"></div>`;
  // Gender
  html += `<div class="form-group"><label>性別</label>
    <div style="display:flex;gap:6px;margin-top:4px;">
      ${['male','female','other','unset'].map(g => {
        const labels = {male:'男性',female:'女性',other:'その他',unset:'未設定'};
        const active = (p?.gender||'unset')===g;
        return `<div class="date-type-chip ${active?'active':''}" onclick="selectGender('${g}',this)" style="flex:1;text-align:center;">${labels[g]}</div>`;
      }).join('')}
    </div><input type="hidden" id="pGender" value="${p?.gender||'unset'}">
  </div>`;
  html += `<div class="form-group"><label>関係 ${helpBtn('relation')}</label><input id="pRelation" placeholder="例：友人、同僚、取引先、家族" value="${esc(p?.relation||'')}"></div>`;
  const corps = data.people.filter(x=>x.type==='corporate');
  html += `<div class="form-group"><label>所属会社（任意）</label>
    <input id="pCompanyLink" placeholder="会社名を入力" value="${esc(p?.companyLink||'')}" oninput="filterCompanySuggest(this.value)">
    ${corps.length?`<div id="companySuggestList" style="max-height:100px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;margin-top:4px;">
      ${corps.map(c=>`<div style="padding:6px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);" class="company-suggest-item" onclick="document.getElementById('pCompanyLink').value='${esc(c.nickname||'')}';document.getElementById('companySuggestList').style.display='none';">🏢 ${esc(c.nickname||'')}</div>`).join('')}
    </div>`:''}
  </div>`;
  html += `<div class="form-group"><label>役職</label><input id="pPosition" placeholder="例：営業部長" value="${esc(p?.position||'')}"></div>`;
  html += `</div>`;

  // Corporate fields
  html += `<div id="corporateFields" style="display:${isCorp?'':'none'}">`;
  html += `<div class="form-group"><label>呼び名 <span style="color:#c97070;font-size:11px;">* 必須</span></label><input id="pCorpNickname" placeholder="例：ABC商事、〇〇さんの会社" value="${esc(isCorp?(p?.corpNickname||p?.nickname||''):'')}"><div class="form-hint">自分がどう呼んでいるか</div></div>`;
  html += `<div class="form-group"><label>正式名称</label><input id="pCorpName" placeholder="例：ABC商事 株式会社" value="${esc(isCorp?(p?.corpFullName||p?.nickname||''):'')}"></div>`;
  // Corporate photo (business card etc.)
  html += `<div class="form-group"><label>📷 写真（名刺など）</label>
    <div id="pCorpPhotoPreview" style="margin-bottom:8px;">${p?.corpPhoto?`<div style="position:relative;display:inline-block;width:100%;"><img src="${p.corpPhoto}" style="width:100%;max-height:200px;object-fit:contain;border-radius:12px;border:1px solid var(--border);"><div style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;" onclick="removeCorpPhoto()">✕</div></div>`:''}
    </div>
    <input type="file" id="pCorpPhotoCamera" accept="image/*" capture="environment" style="display:none;" onchange="previewCorpPhoto(this)">
    <input type="file" id="pCorpPhotoFile" accept="image/*" style="display:none;" onchange="previewCorpPhoto(this)">
    <input type="hidden" id="pCorpPhotoRemove" value="">
    <div style="display:flex;gap:8px;">
      <div style="font-size:12px;color:var(--accent);cursor:pointer;padding:4px 12px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('pCorpPhotoCamera').click()">📷 カメラ</div>
      <div style="font-size:12px;color:var(--accent);cursor:pointer;padding:4px 12px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('pCorpPhotoFile').click()">📁 ファイル</div>
    </div>
  </div>`;
  html += `<div class="form-group"><label>業種</label><input id="pIndustry" placeholder="例：建設業" value="${esc(p?.industry||'')}"></div>`;
  html += `<div class="form-group"><label>住所（送付先）</label><input id="pAddress" placeholder="" value="${esc(p?.address||'')}"></div>`;
  html += `</div>`;

  // Anniversaries
  const defaultAnn = isCorp ? {name:'🏢 創立記念日',date:'',dateType:'monthday',reminders:[30]} : {name:'🎂 誕生日',date:'',dateType:'monthday',reminders:[30]};
  const anns = p?.anniversaries||[defaultAnn];
  html += `<div class="form-group"><label>📅 記念日 ${helpBtn('anniversary')}</label><div id="annContainer">`;
  anns.forEach((a,i) => { html += annRowHTML(a,i); });
  html += `</div><div class="add-btn" onclick="addAnnRow()">＋ 記念日を追加</div></div>`;

  // Seasonal gifts (shared: individual + corporate)
  html += `<div class="form-group"><label>🎐🎄 季節の贈答（任意）</label>
    <div class="form-row" style="margin-bottom:6px;">
      <select id="pChugen" style="flex:1;"><option value="">🎐 お中元: なし</option><option value="yearly" ${p?.chugen==='yearly'?'selected':''}>🎐 お中元: 毎年</option></select>
      <input id="pChugenBudget" placeholder="予算" value="${esc(p?.chugenBudget||'')}" style="flex:1;">
    </div>
    <div class="form-row">
      <select id="pSeibo" style="flex:1;"><option value="">🎄 お歳暮: なし</option><option value="yearly" ${p?.seibo==='yearly'?'selected':''}>🎄 お歳暮: 毎年</option></select>
      <input id="pSeiboBudget" placeholder="予算" value="${esc(p?.seiboBudget||'')}" style="flex:1;">
    </div>
  </div>`;

  if (!isCorp) {
  // Sizes
  const sz = p?.sizes||{};
  html += `<div class="form-group"><label>📏 サイズ（分かる範囲で）${helpBtn('sizes')}</label><div class="profile-form-grid">
    <input id="pSizeTops" placeholder="服トップス" value="${esc(sz.tops||'')}">
    <input id="pSizeBottoms" placeholder="服ボトムス" value="${esc(sz.bottoms||'')}">
    <input id="pSizeShoes" placeholder="靴サイズ" value="${esc(sz.shoes||'')}">
    <input id="pSizeRing" placeholder="指輪サイズ" value="${esc(sz.ring||'')}">
  </div></div>`;

  // Smoking/Drinking
  html += `<div class="form-group"><label>🚬 嗜好品 ${helpBtn('smoking')}</label><div class="form-row">
    <input id="pSmoking" placeholder="タバコ（銘柄）" value="${esc(p?.smoking||'')}">
    <input id="pDrinking" placeholder="お酒（種類）" value="${esc(p?.drinking||'')}">
  </div></div>`;

  // Interests
  html += `<div class="form-group"><label>💖 好きなもの・趣味 ${helpBtn('interests')}</label><input id="pInterests" placeholder="例：音楽, ゴルフ, ワイン" value="${(p?.interests||[]).join(', ')}"></div>`;

  // Brands
  html += `<div class="form-group"><label>🎨 好きなブランド・色 ${helpBtn('brands')}</label><input id="pBrands" placeholder="例：ZARA, 無印, ベージュ系" value="${(p?.brands||[]).join(', ')}"></div>`;

  // Oshi-katsu
  html += `<div class="form-group"><label>🌟 推し活 ${helpBtn('oshi')}</label><input id="pOshi" placeholder="例：Snow Man, 鬼滅の刃, 阪神タイガース" value="${(p?.oshi||[]).join(', ')}"></div>`;

  // Food
  html += `<div class="form-group"><label>🍽 食の好み ${helpBtn('food')}</label>
    <input id="pFoodLike" placeholder="☺ 好きなもの（カンマ区切り）" value="${(p?.foodLike||[]).join(', ')}" style="margin-bottom:6px;">
    <input id="pFoodDislike" placeholder="✗ 苦手なもの（カンマ区切り）" value="${(p?.foodDislike||[]).join(', ')}">
  </div>`;

  // Family
  html += `<div class="form-group"><label>👨‍👩‍👧 家族構成 ${helpBtn('family')}</label><div id="familyContainer">`;
  (p?.family||[]).forEach((f,i) => {
    html += `<div class="form-row" style="margin-bottom:6px;" id="famRow${i}"><input placeholder="名前・続柄" value="${esc(f.name||'')}" class="fam-name"><input placeholder="メモ" value="${esc(f.note||'')}" class="fam-note"><span style="color:#c97070;cursor:pointer;font-size:18px;" onclick="this.parentElement.remove()">×</span></div>`;
  });
  html += `</div><div class="add-btn" onclick="addFamilyRow()">＋ 家族を追加</div></div>`;

  // Personality
  html += `<div class="form-group"><label>✨ 個性 ${helpBtn('personality')}</label><input id="pPersonality" placeholder="例：気配り上手, 豪快, サプライズ好き" value="${(p?.personality||[]).join(', ')}"></div>`;
  } // end !isCorp

  // Memo
  html += `<div class="form-group"><label>📝 メモ ${helpBtn('memo')}</label><textarea id="pMemo" placeholder="自由にメモ。ここに書いた内容も検索でヒットします">${esc(p?.memo||'')}</textarea></div>`;

  // Memory fields (記憶の人の場合のみ表示)
  if (p?.isMemory) {
    const memType = p.memoryType||'person';
    html += `<hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">`;
    html += `<div class="form-group"><label>🤍 記憶の設定</label></div>`;
    html += `<div class="form-group"><label>種別</label>
      <div style="display:flex;gap:6px;margin-top:4px;">
        <div class="date-type-chip ${memType==='person'?'active':''}" onclick="selectMemoryType('person',this)" style="flex:1;text-align:center;">👤 友だち</div>
        <div class="date-type-chip ${memType==='pet'?'active':''}" onclick="selectMemoryType('pet',this)" style="flex:1;text-align:center;">🐾 ペット</div>
      </div><input type="hidden" id="mMemoryType" value="${memType}">
    </div>`;
    // Memory date
    const md = p.memoryDate||'';
    const mdFmt = p.memoryDateFormat||'monthday';
    const mdP = md.split('-');
    let mY='',mM='',mD='';
    if (mdFmt==='full'&&mdP.length>=3){mY=mdP[0];mM=parseInt(mdP[1])||'';mD=parseInt(mdP[2])||'';}
    else if (mdFmt==='monthday'&&mdP.length>=2){mM=parseInt(mdP[mdP.length-2])||'';mD=parseInt(mdP[mdP.length-1])||'';}
    else if (mdFmt==='month'&&mdP.length>=1){mM=parseInt(mdP[0])||'';}
    const ty = new Date().getFullYear();
    let yOpts='<option value="">--</option>';
    for(let y=ty;y>=ty-100;y--)yOpts+=`<option value="${y}" ${mY==y?'selected':''}>${y}</option>`;
    html += `<div class="form-group"><label>🤍 記憶の日（任意）</label>
      <div style="display:flex;gap:4px;margin-bottom:8px;">
        <div class="date-type-chip ${mdFmt==='full'?'active':''}" onclick="selectMemDateFormat('full',this)" style="flex:1;text-align:center;font-size:12px;">年月日</div>
        <div class="date-type-chip ${mdFmt==='monthday'?'active':''}" onclick="selectMemDateFormat('monthday',this)" style="flex:1;text-align:center;font-size:12px;">月日</div>
        <div class="date-type-chip ${mdFmt==='month'?'active':''}" onclick="selectMemDateFormat('month',this)" style="flex:1;text-align:center;font-size:12px;">月のみ</div>
      </div><input type="hidden" id="mDateFormat" value="${mdFmt}">
      <div style="display:flex;gap:8px;">
        <select id="mDateYear" style="flex:1;display:${mdFmt==='full'?'':'none'};">${yOpts}</select>
        <input id="mDateMonth" type="number" min="1" max="12" placeholder="月" value="${mM}" style="flex:1;">
        <input id="mDateDay" type="number" min="1" max="31" placeholder="日" value="${mD}" style="flex:1;display:${mdFmt==='month'?'none':''};">
      </div>
    </div>`;
    const dateRepeat = p.memoryDateType||'yearly';
    html += `<div class="form-group"><label>繰り返し</label>
      <div style="display:flex;gap:6px;margin-top:4px;">
        <div class="date-type-chip ${dateRepeat==='yearly'?'active':''}" onclick="selectMemDateType('yearly',this)" style="flex:1;text-align:center;">年1回</div>
        <div class="date-type-chip ${dateRepeat==='monthly'?'active':''}" onclick="selectMemDateType('monthly',this)" style="flex:1;text-align:center;">毎月</div>
      </div><input type="hidden" id="mDateType" value="${dateRepeat}">
    </div>`;
    const remMode = p.reminderMode||'none';
    const remDays = p.reminderDays||7;
    html += `<div class="form-group"><label>通知</label>
      <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">
        <div class="date-type-chip ${remMode==='custom'?'active':''}" onclick="selectRemMode('custom',this)" style="flex:1;text-align:center;font-size:12px;">自分で決める</div>
        <div class="date-type-chip ${remMode==='dayonly'?'active':''}" onclick="selectRemMode('dayonly',this)" style="flex:1;text-align:center;font-size:12px;">当日だけ</div>
        <div class="date-type-chip ${remMode==='none'?'active':''}" onclick="selectRemMode('none',this)" style="flex:1;text-align:center;font-size:12px;">しない</div>
      </div><input type="hidden" id="mRemMode" value="${remMode}">
      <div id="mRemDaysRow" style="display:${remMode==='custom'?'flex':'none'};gap:8px;align-items:center;margin-top:8px;">
        <input id="mRemDays" type="number" min="1" max="60" value="${remDays}" style="width:60px;text-align:center;">
        <span style="font-size:13px;color:var(--sub);">日前から通知</span>
      </div>
    </div>`;
    html += `<div class="form-group"><label>ひとこと</label><input id="mMessage" placeholder="その人・その子への言葉" value="${esc(p.memoryMessage||'')}"></div>`;
  }

  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="savePerson()">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function annRowHTML(a, idx) {
  // Parse existing date
  const parts = (a.date||'').split('-');
  let selYear='', selMonth='', selDay='';
  if (a.dateType==='full' && parts.length>=3) { selYear=parts[0]; selMonth=parseInt(parts[1])||''; selDay=parseInt(parts[2])||''; }
  else if (a.dateType==='monthday' && parts.length>=2) { selMonth=parseInt(parts[parts.length-2])||''; selDay=parseInt(parts[parts.length-1])||''; }
  else if (a.dateType==='month') { selMonth=parseInt(parts[1]||parts[0])||''; }

  const repeat = a.repeat || 'yearly';

  // Year options
  const thisYear = new Date().getFullYear();
  let yearOpts = '<option value="">--</option>';
  for (let y=thisYear; y>=thisYear-100; y--) yearOpts += `<option value="${y}" ${selYear==y?'selected':''}>${y}</option>`;

  // Month options
  let monthOpts = '<option value="">--</option>';
  for (let m=1; m<=12; m++) monthOpts += `<option value="${m}" ${selMonth==m?'selected':''}>${m}月</option>`;

  // Day options
  let dayOpts = '<option value="">--</option>';
  for (let d=1; d<=31; d++) dayOpts += `<option value="${d}" ${selDay==d?'selected':''}>${d}日</option>`;

  return `<div class="ann-row" id="annRow${idx}">
    <input placeholder="記念日の名前" value="${esc(a.name||'')}" class="ann-name" style="margin-bottom:6px;">
    <div class="date-type-chips">
      <span class="date-type-chip ${a.dateType==='full'?'active':''}" onclick="setDateType(${idx},'full',this)">年月日</span>
      <span class="date-type-chip ${a.dateType==='monthday'||!a.dateType?'active':''}" onclick="setDateType(${idx},'monthday',this)">月日</span>
      <span class="date-type-chip ${a.dateType==='month'?'active':''}" onclick="setDateType(${idx},'month',this)">月のみ</span>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:6px;">
      <select class="ann-year" style="flex:1;padding:10px 6px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:'Zen Maru Gothic',sans-serif;color:var(--text);background:var(--bg);display:${a.dateType==='full'?'':'none'};">${yearOpts}</select>
      <select class="ann-month" style="flex:1;padding:10px 6px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:'Zen Maru Gothic',sans-serif;color:var(--text);background:var(--bg);">${monthOpts}</select>
      <select class="ann-day" style="flex:1;padding:10px 6px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:'Zen Maru Gothic',sans-serif;color:var(--text);background:var(--bg);display:${a.dateType==='month'?'none':''};">${dayOpts}</select>
    </div>
    <div style="margin-bottom:6px;">
      <div style="font-size:11px;color:var(--sub);margin-bottom:4px;">🔄 繰り返し</div>
      <div class="date-type-chips">
        <span class="date-type-chip ${repeat==='yearly'?'active':''}" onclick="setRepeat(${idx},'yearly',this)">毎年</span>
        <span class="date-type-chip ${repeat==='monthly'?'active':''}" onclick="setRepeat(${idx},'monthly',this)">毎月</span>
        <span class="date-type-chip ${repeat==='once'?'active':''}" onclick="setRepeat(${idx},'once',this)">単発</span>
      </div>
      <input type="hidden" class="ann-repeat" value="${repeat}">
    </div>
    <div style="margin-top:6px;">
      <div style="font-size:12px;color:var(--sub);margin-bottom:4px;">🔔 どのくらい前から準備しますか？</div>
      <div style="display:flex;gap:6px;" class="ann-reminder-btns">
        <span class="date-type-chip ${(a.reminders||[]).includes(7)?'active':''}" onclick="toggleReminderDay(this,7)" style="font-size:12px;">7日前</span>
        <span class="date-type-chip ${(a.reminders||[]).includes(14)?'active':''}" onclick="toggleReminderDay(this,14)" style="font-size:12px;">14日前</span>
        <span class="date-type-chip ${(a.reminders||[]).includes(30)?'active':''}" onclick="toggleReminderDay(this,30)" style="font-size:12px;">30日前</span>
        <span class="date-type-chip ${(a.reminders||[]).includes(1)?'active':''}" onclick="toggleReminderDay(this,1)" style="font-size:12px;">前日</span>
      </div>
      <input type="hidden" class="ann-reminders" value="${(a.reminders||[]).join(', ')}">
    </div>
    ${idx>0?`<div class="ann-remove" onclick="document.getElementById('annRow${idx}').remove()">削除</div>`:''}
  </div>`;
}


function cycleAnnReminderDays(personId, annIdx) {
  const person = data.people.find(p=>p.id===personId);
  if (!person || !person.anniversaries?.[annIdx]) return;
  const a = person.anniversaries[annIdx];
  // プリセットパターンを順番に切り替え
  const patterns = [
    [30],         // 30日前
    [14],         // 14日前
    [7],          // 7日前
    [30, 1],      // 30日前＋前日
    [14, 1],      // 14日前＋前日
    [7, 1],       // 7日前＋前日
    [30, 7, 1],   // 30日前＋7日前＋前日
    []            // OFF
  ];
  const current = JSON.stringify((a.reminders||[]).sort((x,y)=>x-y));
  let nextIdx = 0;
  for (let i = 0; i < patterns.length; i++) {
    if (JSON.stringify(patterns[i].sort((x,y)=>x-y)) === current) {
      nextIdx = (i + 1) % patterns.length;
      break;
    }
  }
  a.reminders = patterns[nextIdx];
  saveData(); render();
  if (patterns[nextIdx].length) {
    const label = patterns[nextIdx].sort((x,y)=>y-x).map(d=>d===1?'前日':d+'日前').join('・');
    showToast(`🔔 ${label} に通知します`);
  } else {
    showToast('🔕 リマインドをOFFにしました');
  }
}

function toggleReminderDay(el, day) {
  el.classList.toggle('active');
  // 親の.ann-reminder-btnsから隠しinputを更新
  const container = el.closest('.ann-reminder-btns') || el.parentElement;
  const hiddenInput = container.parentElement.querySelector('.ann-reminders');
  if (hiddenInput) {
    const active = container.querySelectorAll('.date-type-chip.active');
    const days = Array.from(active).map(chip => {
      const txt = chip.textContent;
      if (txt.includes('前日')) return 1;
      return parseInt(txt);
    }).filter(n => !isNaN(n));
    hiddenInput.value = days.join(', ');
  }
}

let annCounter = 100;
function addAnnRow() {
  const c = document.getElementById('annContainer');
  const idx = annCounter++;
  c.insertAdjacentHTML('beforeend', annRowHTML({name:'',date:'',dateType:'monthday',reminders:[]}, idx));
}
function setDateType(idx, type, el) {
  const row = document.getElementById('annRow'+idx);
  // Only toggle chips in the first date-type-chips group (not repeat)
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  const yearSel = row.querySelector('.ann-year');
  const daySel = row.querySelector('.ann-day');
  yearSel.style.display = type==='full'?'':'none';
  daySel.style.display = type==='month'?'none':'';
}
function setRepeat(idx, repeat, el) {
  const row = document.getElementById('annRow'+idx);
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  row.querySelector('.ann-repeat').value = repeat;
}
function selectGender(g, el) {
  document.getElementById('pGender').value = g;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
}
function previewAvatar(input) {
  if (!input.files||!input.files[0]) return;
  const removeEl = document.getElementById('pAvatarRemove');
  if (removeEl) removeEl.value = '';
  compressImage(input.files[0]).then(dataUrl => {
    input.dataset.compressed = dataUrl;
    // Show inline crop UI
    const preview = document.getElementById('pAvatarPreview');
    if (!preview) return;
    _cropX = 0; _cropY = 0; _cropScale = 1; _cropDragging = false;
    _cropImg = new Image();
    _cropImg.onload = function() {
      preview.style.width = '200px';
      preview.style.height = '200px';
      preview.style.position = 'relative';
      preview.style.touchAction = 'none';
      preview.innerHTML = `<img id="cropImage" src="${dataUrl}" style="position:absolute;pointer-events:none;">`;
      preview.onclick = null;
      preview.onmousedown = cropDragStart;
      preview.onmousemove = cropDragMove;
      preview.onmouseup = cropDragEnd;
      preview.ontouchstart = function(e){e.preventDefault();cropTouchStart(e);};
      preview.ontouchmove = function(e){e.preventDefault();cropTouchMove(e);};
      preview.ontouchend = cropDragEnd;
      updateCropImage();
      // Add zoom slider after preview
      let slider = document.getElementById('cropZoomRow');
      if (!slider) {
        slider = document.createElement('div');
        slider.id = 'cropZoomRow';
        slider.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;justify-content:center;';
        slider.innerHTML = '<span style="font-size:14px;">−</span><input type="range" id="cropZoom" min="50" max="300" value="100" style="width:140px;" oninput="setCropScale(this.value/100)"><span style="font-size:14px;">＋</span>';
        preview.parentElement.insertBefore(slider, preview.nextSibling);
      }
      // Add confirm button
      let confirmRow = document.getElementById('cropConfirmRow');
      if (!confirmRow) {
        confirmRow = document.createElement('div');
        confirmRow.id = 'cropConfirmRow';
        confirmRow.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:8px;';
        confirmRow.innerHTML = '<button class="card-btn" onclick="applyCropInline()" style="font-size:13px;padding:8px 20px;background:var(--accent-light);border-color:var(--accent);color:var(--accent);">✓ この位置で決定</button>';
        const zoomRow = document.getElementById('cropZoomRow');
        zoomRow.parentElement.insertBefore(confirmRow, zoomRow.nextSibling);
      }
    };
    _cropImg.src = dataUrl;
  });
}

function applyCropInline() {
  if (!_cropImg) return;
  const containerSize = 200;
  const aspect = _cropImg.width / _cropImg.height;
  let w, h;
  if (aspect > 1) { h = containerSize * _cropScale; w = h * aspect; }
  else { w = containerSize * _cropScale; h = w / aspect; }
  const sx = ((containerSize - w) / 2 + _cropX);
  const sy = ((containerSize - h) / 2 + _cropY);
  const srcX = (-sx / w) * _cropImg.width;
  const srcY = (-sy / h) * _cropImg.height;
  const srcW = (containerSize / w) * _cropImg.width;
  const srcH = (containerSize / h) * _cropImg.height;
  const canvas = document.createElement('canvas');
  const size = 300;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(_cropImg, srcX, srcY, srcW, srcH, 0, 0, size, size);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const preview = document.getElementById('pAvatarPreview');
  preview.style.width = '72px';
  preview.style.height = '72px';
  preview.style.touchAction = '';
  preview.onmousedown = preview.onmousemove = preview.onmouseup = preview.ontouchstart = preview.ontouchmove = preview.ontouchend = null;
  preview.onclick = function(){ document.getElementById('pAvatarFile').click(); };
  preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
  const file = document.getElementById('pAvatarFile');
  if (file) file.dataset.compressed = dataUrl;
  // Remove crop controls
  document.getElementById('cropZoomRow')?.remove();
  document.getElementById('cropConfirmRow')?.remove();
}
// Avatar full-screen view
function showAvatarFull(personId) {
  const p = data.people.find(x=>x.id===personId);
  if (!p || !p.avatar) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;animation:fadeIn 0.2s;';
  overlay.innerHTML = `
    <div style="position:relative;width:80vw;max-width:320px;">
      <img src="${p.avatar}" style="width:100%;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
    </div>
    <div style="color:#fff;font-size:16px;margin-top:16px;font-family:'Shippori Mincho',serif;">${esc(p.nickname||'')}</div>
    <div style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:24px;">タップして閉じる</div>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// Avatar crop modal
let _cropImg = null, _cropX = 0, _cropY = 0, _cropScale = 1, _cropDragging = false, _cropStartX = 0, _cropStartY = 0;

function openCropModal(dataUrl) {
  _cropImg = new Image();
  _cropImg.onload = function() {
    _cropX = 0; _cropY = 0; _cropScale = 1;
    const modal = document.getElementById('modal');
    modal.innerHTML = `<h2>📷 画像を調整</h2>
      <div style="text-align:center;margin-bottom:16px;">
        <div id="cropContainer" style="width:200px;height:200px;border-radius:50%;overflow:hidden;margin:0 auto;border:3px solid var(--accent);position:relative;touch-action:none;">
          <img id="cropImage" src="${dataUrl}" style="position:absolute;transform-origin:center;pointer-events:none;">
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:0 20px;margin-bottom:16px;">
        <span style="font-size:18px;">🔍</span>
        <input type="range" id="cropZoom" min="50" max="300" value="100" style="flex:1;" oninput="setCropScale(this.value/100)">
        <span id="cropZoomLabel" style="font-size:12px;color:var(--sub);min-width:36px;">100%</span>
      </div>
      <div class="form-btns">
        <button class="btn btn-secondary" onclick="cancelCrop()">キャンセル</button>
        <button class="btn btn-primary" onclick="applyCrop()">決定</button>
      </div>`;
    openModal();
    updateCropImage();
    // Touch/mouse drag
    const container = document.getElementById('cropContainer');
    container.addEventListener('mousedown', cropDragStart);
    container.addEventListener('mousemove', cropDragMove);
    container.addEventListener('mouseup', cropDragEnd);
    container.addEventListener('touchstart', cropTouchStart, {passive:false});
    container.addEventListener('touchmove', cropTouchMove, {passive:false});
    container.addEventListener('touchend', cropDragEnd);
  };
  _cropImg.src = dataUrl;
}

function updateCropImage() {
  const img = document.getElementById('cropImage');
  if (!img || !_cropImg) return;
  const containerSize = 200;
  const aspect = _cropImg.width / _cropImg.height;
  let w, h;
  if (aspect > 1) { h = containerSize * _cropScale; w = h * aspect; }
  else { w = containerSize * _cropScale; h = w / aspect; }
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.left = ((containerSize - w) / 2 + _cropX) + 'px';
  img.style.top = ((containerSize - h) / 2 + _cropY) + 'px';
}

function setCropScale(s) {
  _cropScale = s;
  document.getElementById('cropZoomLabel').textContent = Math.round(s*100) + '%';
  updateCropImage();
}

function cropDragStart(e) { _cropDragging = true; _cropStartX = e.clientX - _cropX; _cropStartY = e.clientY - _cropY; }
function cropDragMove(e) { if (!_cropDragging) return; _cropX = e.clientX - _cropStartX; _cropY = e.clientY - _cropStartY; updateCropImage(); }
function cropDragEnd() { _cropDragging = false; }
function cropTouchStart(e) { e.preventDefault(); const t = e.touches[0]; _cropDragging = true; _cropStartX = t.clientX - _cropX; _cropStartY = t.clientY - _cropY; }
function cropTouchMove(e) { e.preventDefault(); if (!_cropDragging) return; const t = e.touches[0]; _cropX = t.clientX - _cropStartX; _cropY = t.clientY - _cropStartY; updateCropImage(); }

function applyCrop() {
  const canvas = document.createElement('canvas');
  const size = 300;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const containerSize = 200;
  const aspect = _cropImg.width / _cropImg.height;
  let w, h;
  if (aspect > 1) { h = containerSize * _cropScale; w = h * aspect; }
  else { w = containerSize * _cropScale; h = w / aspect; }
  const sx = ((containerSize - w) / 2 + _cropX);
  const sy = ((containerSize - h) / 2 + _cropY);
  const scale = size / containerSize;
  ctx.drawImage(_cropImg, sx * scale, sy * scale, w * scale, h * scale);
  // Re-draw properly: map container coords to source image coords
  const imgW = w * (_cropImg.width / w);
  const imgH = h * (_cropImg.height / h);
  const srcX = (-sx / w) * _cropImg.width;
  const srcY = (-sy / h) * _cropImg.height;
  const srcW = (containerSize / w) * _cropImg.width;
  const srcH = (containerSize / h) * _cropImg.height;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(_cropImg, srcX, srcY, srcW, srcH, 0, 0, size, size);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  document.getElementById('pAvatarPreview').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
  document.getElementById('pAvatarRemove').value = '';
  // Store cropped result
  const file = document.getElementById('pAvatarFile');
  if (file) file.dataset.compressed = dataUrl;
  closeModal();
  // Re-open person modal would lose state, so just update preview
}

function cancelCrop() {
  closeModal();
}

function removeAvatar(e) {
  e.stopPropagation();
  document.getElementById('pAvatarPreview').innerHTML = personIcon({}).emoji||'👤';
  document.getElementById('pAvatarRemove').value = '1';
  const camera = document.getElementById('pAvatarCamera');
  const file = document.getElementById('pAvatarFile');
  if (camera) camera.value = '';
  if (file) file.value = '';
  // Hide the delete button
  e.target.closest('div[style*="color:#c97070"]')?.remove();
}
function previewCorpPhoto(input) {
  if (!input.files||!input.files[0]) return;
  const removeEl = document.getElementById('pCorpPhotoRemove');
  if (removeEl) removeEl.value = '';
  _rectCropTargetId = 'pCorpPhotoPreview';
  _rectCropInputId = 'pCorpPhoto';
  compressImage(input.files[0]).then(dataUrl => {
    input.dataset.compressed = dataUrl;
    showRectCrop(dataUrl, 'pCorpPhotoPreview', 'pCorpPhoto');
  });
}
function removeCorpPhoto() {
  document.getElementById('pCorpPhotoPreview').innerHTML = '';
  document.getElementById('pCorpPhotoRemove').value = '1';
  const camera = document.getElementById('pCorpPhotoCamera');
  const file = document.getElementById('pCorpPhotoFile');
  if (camera) camera.value = '';
  if (file) file.value = '';
}
function addFamilyRow() {
  const c = document.getElementById('familyContainer');
  const idx = c.children.length;
  c.insertAdjacentHTML('beforeend', `<div class="form-row" style="margin-bottom:6px;"><input placeholder="名前・続柄" class="fam-name"><input placeholder="メモ" class="fam-note"><span style="color:#c97070;cursor:pointer;font-size:18px;" onclick="this.parentElement.remove()">×</span></div>`);
}

let _saving = false;
// ===== お祝い演出判定 =====
const CELEBRATION_KEYWORDS = {
  '🎂': ['誕生日','バースデー','birthday'],
  '💒': ['結婚記念','ウェディング','婚約','プロポーズ'],
  '🎓': ['卒業','入学','入園'],
  '🏢': ['入社','就職','転職','昇進','昇格'],
  '👶': ['出産','安産','マタニティ'],
  '🎍': ['お正月','新年','元旦'],
  '🎎': ['ひな祭り','雛祭り'],
  '🎏': ['こどもの日','子供の日','端午'],
  '👘': ['七五三','成人','成人式'],
  '🎄': ['クリスマス'],
  '💝': ['バレンタイン'],
  '🍫': ['ホワイトデー'],
  '👔': ['父の日'],
  '💐': ['母の日'],
  '🎉': ['記念日','アニバーサリー','anniversary','祝','お祝い'],
  '🏆': ['優勝','受賞','合格','達成'],
  '🏠': ['引越','新居','新築','マイホーム'],
  '💎': ['還暦','古希','喜寿','傘寿','米寿','白寿','金婚','銀婚'],
};
const NEGATIVE_KEYWORDS = ['命日','法事','回忌','忌日','お見舞い','通夜','葬','供養','仏壇','墓参'];

function isCelebrationText(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  // ネガティブ判定が先
  for (const neg of NEGATIVE_KEYWORDS) {
    if (t.includes(neg)) return null;
  }
  // お祝いキーワード判定
  for (const [emoji, keywords] of Object.entries(CELEBRATION_KEYWORDS)) {
    for (const kw of keywords) {
      if (t.includes(kw.toLowerCase())) return emoji;
    }
  }
  return null;
}

function showCelebrationParticle(emoji) {
  if (!emoji) return;
  const chars = [emoji, '✨', '💫', '🌟', '⭐'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:9998;overflow:hidden;';
  document.body.appendChild(container);
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.textContent = chars[Math.floor(Math.random()*chars.length)];
      el.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;font-size:${16+Math.random()*14}px;`;
      container.appendChild(el);
      el.animate([
        { transform:'translateY(0) rotate(0deg)', opacity:0.9 },
        { transform:`translateY(${window.innerHeight+40}px) rotate(${Math.random()*360}deg)`, opacity:0 }
      ], { duration:2500+Math.random()*2000, easing:'ease-in' }).onfinish = () => el.remove();
    }, i * 100);
  }
  setTimeout(() => container.remove(), 6000);
}

// 記念日登録時にお祝い演出を呼び出す
function checkCelebrationOnSave(anniversaries) {
  if (!anniversaries?.length) return;
  for (const a of anniversaries) {
    const emoji = isCelebrationText(a.name);
    if (emoji) {
      setTimeout(() => showCelebrationParticle(emoji), 500);
      return; // 1回の保存で1演出まで
    }
  }
}

function conciergeWaitingHtml(msg, prefix) {
  const prefixHtml = prefix ? `<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">${prefix}</div>` : '';
  return `<div style="text-align:center;color:var(--sub);padding:20px;">
    ${prefixHtml}
    <div style="font-size:14px;margin-bottom:12px;">${msg || '世界中からお探しします・・・'}</div>
    <div style="display:inline-flex;gap:8px;margin-bottom:10px;">
      <span style="width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;animation:obDotBounce 1.4s ease-in-out infinite;"></span>
      <span style="width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;animation:obDotBounce 1.4s ease-in-out 0.2s infinite;"></span>
      <span style="width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;animation:obDotBounce 1.4s ease-in-out 0.4s infinite;"></span>
    </div>
    <div style="font-size:12px;color:var(--sub);animation:obFadeInOut 2s ease-in-out infinite;">少々お待ちください</div>
  </div>`;
}
// ===== Long Press Context Menu =====
let _longPressTimer = null;
let _longPressTarget = null;
let _lpSX = 0, _lpSY = 0;

function lpStart(e, type, id) {
  if (!e.touches || !e.touches[0]) return;
  _lpSX = e.touches[0].clientX;
  _lpSY = e.touches[0].clientY;
  clearTimeout(_longPressTimer);
  _longPressTimer = setTimeout(() => {
    if (navigator.vibrate) navigator.vibrate(30);
    showLongPressMenu(type, id);
  }, 700);
}
function lpEnd() { clearTimeout(_longPressTimer); }
function lpMove(e) {
  if (!e.touches || !e.touches[0]) return;
  if (Math.abs(e.touches[0].clientX - _lpSX) > 10 || Math.abs(e.touches[0].clientY - _lpSY) > 10) {
    clearTimeout(_longPressTimer);
  }
}

function initLongPress() {
  // PC: 右クリックのみ有効（タッチ長押しは一時無効化）
  document.addEventListener('contextmenu', e => {
    const item = e.target.closest('[data-lp-type]');
    if (!item) return;
    e.preventDefault();
    showLongPressMenu(item.dataset.lpType, item.dataset.lpId);
  });
}

function showLongPressMenu(type, id) {
  const existing = document.getElementById('longPressMenu');
  if (existing) existing.remove();

  const tabNames = { people:'友だち', wish:'お気に入り', received:'もらった', gave:'あげた', place:'行きたい' };
  const isPlace = type === 'place';
  const isPeople = type === 'people';
  const item = isPeople ? data.people.find(p=>p.id===id) : (isPlace ? data.place.find(i=>i.id===id) : data[type]?.find(i=>i.id===id));
  if (!item) return;
  const name = item.nickname || item.title || '不明';

  const overlay = document.createElement('div');
  overlay.id = 'longPressMenu';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,0.3);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease;';
  overlay.onclick = e => { if (e.target === overlay) closeLongPressMenu(); };

  const menu = document.createElement('div');
  menu.style.cssText = 'background:var(--card);border-radius:20px;padding:8px 0;min-width:240px;max-width:300px;box-shadow:0 12px 40px rgba(0,0,0,0.2);transform:scale(0.9);transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);';

  const header = `<div style="padding:12px 20px;font-size:13px;font-weight:600;color:var(--text);border-bottom:1px solid var(--border);">${esc(name)}</div>`;

  const btnStyle = 'display:flex;align-items:center;gap:12px;padding:14px 20px;width:100%;border:none;background:none;cursor:pointer;font-family:"Zen Maru Gothic",sans-serif;font-size:14px;color:var(--text);text-align:left;transition:background 0.15s;';

  let buttons = '';
  buttons += `<button style="${btnStyle}" onmousedown="this.style.background='var(--bg)'" onmouseup="this.style.background=''" onclick="closeLongPressMenu();${isPeople?`openPeopleModal('${id}')`:(isPlace?`openPlaceModal('${id}')`:`openItemModal('${id}')`)}"><span style="font-size:18px;">✏️</span>編集</button>`;
  buttons += `<button style="${btnStyle}" onmousedown="this.style.background='var(--bg)'" onmouseup="this.style.background=''" onclick="closeLongPressMenu();duplicateCard('${type}','${id}')"><span style="font-size:18px;">📋</span>複製</button>`;
  buttons += `<button style="${btnStyle}" onmousedown="this.style.background='var(--bg)'" onmouseup="this.style.background=''" onclick="closeLongPressMenu();shareCard('${type}','${id}')"><span style="font-size:18px;">📤</span>共有</button>`;
  buttons += `<button style="${btnStyle}" onmousedown="this.style.background='var(--bg)'" onmouseup="this.style.background=''" onclick="closeLongPressMenu();togglePin('${isPeople?'people':type}','${id}');render()"><span style="font-size:18px;">📌</span>${item.pinned?'ピン留め解除':'ピン留め'}</button>`;
  // まとめて選択（お気に入り・行きたいのみ。友だち・ギフトは対象外）
  if (['wish','place','items'].includes(type)) {
    buttons += `<div style="height:1px;background:var(--border);margin:4px 0;"></div>`;
    buttons += `<button style="${btnStyle}" onmousedown="this.style.background='var(--bg)'" onmouseup="this.style.background=''" onclick="closeLongPressMenu();selectModeStart('${type}')"><span style="font-size:18px;">☑️</span>まとめて選択</button>`;
  }
  buttons += `<div style="height:1px;background:var(--border);margin:4px 0;"></div>`;
  buttons += `<button style="${btnStyle}color:#c97070;" onmousedown="this.style.background='#fff0f0'" onmouseup="this.style.background=''" onclick="closeLongPressMenu();deleteCardFromMenu('${type}','${id}')"><span style="font-size:18px;">🗑</span>削除</button>`;

  menu.innerHTML = header + buttons;
  overlay.appendChild(menu);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; menu.style.transform = 'scale(1)'; });
}

function closeLongPressMenu() {
  const m = document.getElementById('longPressMenu');
  if (m) { m.style.opacity = '0'; setTimeout(() => m.remove(), 200); }
}

function duplicateCard(type, id) {
  const isPeople = type === 'people';
  const isPlace = type === 'place';
  const src = isPeople ? data.people.find(p=>p.id===id) : (isPlace ? data.place.find(i=>i.id===id) : data[type]?.find(i=>i.id===id));
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = genId();
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = new Date().toISOString();
  if (copy.nickname) copy.nickname += '（コピー）';
  if (copy.title) copy.title += '（コピー）';
  if (isPeople) data.people.push(copy);
  else if (isPlace) data.place.push(copy);
  else data[type].push(copy);
  saveData(); render();
  showToast('複製しました');
}

function shareCard(type, id) {
  const isPeople = type === 'people';
  const isPlace = type === 'place';
  const item = isPeople ? data.people.find(p=>p.id===id) : (isPlace ? data.place.find(i=>i.id===id) : data[type]?.find(i=>i.id===id));
  if (!item) return;
  const name = item.nickname || item.title || '';
  let text = name;
  if (item.relation) text += `（${item.relation}）`;
  if (item.interests?.length) text += `\n好き: ${item.interests.join(', ')}`;
  if (item.memo) text += `\n${item.memo}`;
  if (navigator.share) {
    navigator.share({ title: name, text: text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('コピーしました'));
  }
}

function deleteCardFromMenu(type, id) {
  const input = prompt('削除するには「削除」と入力してください');
  if (input !== '削除') { if (input !== null) showToast('「削除」と入力してください'); return; }
  const isPeople = type === 'people';
  const isPlace = type === 'place';
  if (isPeople) { data.people = data.people.filter(p=>p.id!==id); }
  else if (isPlace) { data.place = data.place.filter(i=>i.id!==id); }
  else { data[type] = data[type].filter(i=>i.id!==id); }
  saveData(); render();
  showToast('削除しました');
}

let _selectMode = false;
let _selectType = '';
let _selectedIds = new Set();

function selectModeStart(type) {
  _selectMode = true;
  _selectType = type;
  _selectedIds.clear();
  render();
  showSelectBar();
}

function selectModeEnd() {
  _selectMode = false;
  _selectType = '';
  _selectedIds.clear();
  const bar = document.getElementById('selectBar');
  if (bar) bar.remove();
  render();
}

function toggleSelectItem(id) {
  if (_selectedIds.has(id)) _selectedIds.delete(id);
  else _selectedIds.add(id);
  updateSelectBar();
  // チェックボックスのUI更新（全チェックボックスを走査）
  document.querySelectorAll('#cardList input[type="checkbox"]').forEach(cb => {
    const row = cb.closest('.list-item');
    if (!row) return;
    const rowId = row.dataset.lpId || row.dataset.id;
    if (!rowId) {
      const oc = row.getAttribute('onclick') || '';
      const m = oc.match(/'([a-z0-9_]+)'/);
      if (m && m[1] === id) cb.checked = _selectedIds.has(id);
    } else if (rowId === id) {
      cb.checked = _selectedIds.has(id);
    }
  });
  // 選択行のハイライト更新
  document.querySelectorAll('#cardList .list-item').forEach(row => {
    const rowId = row.dataset.lpId || row.dataset.id;
    if (rowId && _selectedIds.has(rowId)) {
      row.style.background = 'rgba(193,154,132,0.15)';
    } else if (rowId) {
      row.style.background = '';
    }
  });
}

function showSelectBar() {
  let bar = document.getElementById('selectBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selectBar';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:200;background:var(--card);border-top:1px solid var(--border);padding:12px 16px;display:flex;align-items:center;gap:8px;box-shadow:0 -4px 16px rgba(0,0,0,0.1);animation:slideUp 0.3s ease;';
    document.body.appendChild(bar);
  }
  updateSelectBar();
}

function updateSelectBar() {
  const bar = document.getElementById('selectBar');
  if (!bar) return;
  const count = _selectedIds.size;
  const btnS = 'padding:12px 18px;border-radius:12px;border:none;font-size:15px;cursor:pointer;font-family:"Zen Maru Gothic",sans-serif;font-weight:600;min-width:48px;';
  bar.innerHTML = `
    <div style="flex:1;font-size:16px;font-weight:700;color:var(--text);">${count}件選択</div>
    <button style="${btnS}background:var(--bg);color:var(--text);" onclick="selectAll()">全選択</button>
    <button style="${btnS}background:var(--accent);color:#fff;" onclick="selectActionPin()" ${count?'':'disabled opacity:0.4;'}>📌</button>
    <button style="${btnS}background:#4a90d9;color:#fff;" onclick="selectActionShare()" ${count?'':'disabled opacity:0.4;'}>📤</button>
    <button style="${btnS}background:#c97070;color:#fff;" onclick="selectActionDelete()" ${count?'':'disabled opacity:0.4;'}>🗑</button>
    <button style="${btnS}background:var(--border);color:var(--text);" onclick="selectModeEnd()">✕</button>
  `;
}

function selectAll() {
  const isPeople = _selectType === 'people';
  const isPlace = _selectType === 'place';
  const items = isPeople ? data.people.filter(p=>!p.isMemory) : (isPlace ? data.place : data[_selectType] || []);
  if (_selectedIds.size === items.length) {
    _selectedIds.clear();
  } else {
    items.forEach(i => _selectedIds.add(i.id));
  }
  render();
  showSelectBar();
}

function selectActionDelete() {
  if (!_selectedIds.size) return;
  const input = prompt(`${_selectedIds.size}件を削除するには「削除」と入力してください`);
  if (input !== '削除') { if (input !== null) showToast('「削除」と入力してください'); return; }
  const ids = [..._selectedIds];
  const isPeople = _selectType === 'people';
  const isPlace = _selectType === 'place';
  if (isPeople) data.people = data.people.filter(p => !ids.includes(p.id));
  else if (isPlace) data.place = data.place.filter(i => !ids.includes(i.id));
  else data[_selectType] = data[_selectType].filter(i => !ids.includes(i.id));
  saveData();
  showToast(`${ids.length}件を削除しました`);
  selectModeEnd();
}

function selectActionPin() {
  if (!_selectedIds.size) return;
  const ids = [..._selectedIds];
  const isPeople = _selectType === 'people';
  const isPlace = _selectType === 'place';
  const items = isPeople ? data.people : (isPlace ? data.place : data[_selectType] || []);
  const allPinned = ids.every(id => items.find(i=>i.id===id)?.pinned);
  ids.forEach(id => {
    const item = items.find(i => i.id === id);
    if (item) item.pinned = !allPinned;
  });
  saveData();
  showToast(allPinned ? 'ピン留めを解除しました' : 'ピン留めしました');
  selectModeEnd();
}

function selectActionShare() {
  if (!_selectedIds.size) return;
  const ids = [..._selectedIds];
  const isPeople = _selectType === 'people';
  const isPlace = _selectType === 'place';
  const items = isPeople ? data.people : (isPlace ? data.place : data[_selectType] || []);
  const texts = ids.map(id => {
    const item = items.find(i => i.id === id);
    return item ? (item.nickname || item.title || '') : '';
  }).filter(Boolean);
  const text = texts.join('\n');
  if (navigator.share) {
    navigator.share({ title: 'AWAI', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('コピーしました'));
  }
  selectModeEnd();
}

// ===== Double Tap to Pin（一時無効化） =====

// ===== Swipe Gestures =====
function initSwipeGestures() {
  let startX = 0, startY = 0, startTime = 0;
  const SWIPE_THRESHOLD = 80;
  const EDGE_WIDTH = 30;
  const tabs = ['people','wish','items','calendar','place','gift'];

  let _swipeTarget = null;
  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    _swipeTarget = e.target;
  });

  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const dt = Date.now() - startTime;
    if (dt > 500 || Math.abs(dy) > Math.abs(dx)) return;

    // 横スクロール可能な要素の中でのスワイプは無視
    if (_swipeTarget && _swipeTarget.closest('[style*="overflow-x"], [style*="flex-wrap"], .date-type-chip, .tabs')) return;
    // カテゴリチップエリアでのスワイプは無視
    if (_swipeTarget && _swipeTarget.closest('.label-bar, .cat-chips, [style*="gap:6px"], [style*="gap:4px"]')) return;

    // モーダルが開いている場合は無視
    const modal = document.querySelector('.modal-overlay.open');
    if (modal) return;
    if (document.getElementById('onboardingOverlay')?.style.display !== 'none' &&
        document.getElementById('onboardingOverlay')?.style.display !== '') return;

    // 左端からの右スワイプ → 戻る
    if (dx > SWIPE_THRESHOLD && startX < EDGE_WIDTH) {
      goBack();
      return;
    }

    // 左右スワイプでタブ切替
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      const idx = tabs.indexOf(currentTab);
      if (idx < 0) return;
      if (dx < -SWIPE_THRESHOLD && idx < tabs.length - 1) {
        // 左スワイプ → 次のタブ
        switchTab(tabs[idx + 1]);
      } else if (dx > SWIPE_THRESHOLD && startX > EDGE_WIDTH && idx > 0) {
        // 右スワイプ → 前のタブ（左端スワイプバック以外）
        switchTab(tabs[idx - 1]);
      }
    }
  });
}

function showToast(msg, duration, onclick) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  el.onclick = onclick || null;
  el.style.cursor = onclick ? 'pointer' : '';
  setTimeout(() => { el.classList.remove('show'); el.onclick = null; el.style.cursor = ''; }, duration || 2000);
}
function savePerson() {
  if (_saving) return;
  const personType = document.getElementById('pType').value;
  const isCorp = personType === 'corporate';
  const nickname = isCorp ? '' : document.getElementById('pNickname').value.trim();
  if (!isCorp && !nickname) { alert('呼び名を入力してください'); return; }

  // Collect anniversaries
  const annRows = document.querySelectorAll('.ann-row');
  const anniversaries = [];
  annRows.forEach(row => {
    const name = row.querySelector('.ann-name').value.trim();
    const dateTypeChips = row.querySelectorAll('.date-type-chips')[0];
    const activeChip = dateTypeChips?.querySelector('.date-type-chip.active');
    const dateType = activeChip ? (activeChip.textContent.includes('年月日')?'full':activeChip.textContent.includes('月日')?'monthday':'month') : 'monthday';
    const year = row.querySelector('.ann-year')?.value||'';
    const month = row.querySelector('.ann-month')?.value||'';
    const day = row.querySelector('.ann-day')?.value||'';
    let date = '';
    if (dateType==='full' && year && month) date = `${year}-${String(month).padStart(2,'0')}-${String(day||1).padStart(2,'0')}`;
    else if (dateType==='monthday' && month) date = `${String(month).padStart(2,'0')}-${String(day||1).padStart(2,'0')}`;
    else if (dateType==='month' && month) date = `${String(month).padStart(2,'0')}`;
    const repeat = row.querySelector('.ann-repeat')?.value||'yearly';
    const reminders = row.querySelector('.ann-reminders').value.split(/[,、\s]+/).map(Number).filter(n=>!isNaN(n));
    if (name||date) anniversaries.push({name:name||'記念日',date,dateType,repeat,reminders});
  });

  // Collect family
  const famNames = document.querySelectorAll('.fam-name');
  const famNotes = document.querySelectorAll('.fam-note');
  const family = [];
  famNames.forEach((el,i) => {
    if (el.value.trim()) family.push({name:el.value.trim(), note:famNotes[i]?.value.trim()||''});
  });

  if (isCorp) {
    const corpNickname = document.getElementById('pCorpNickname').value.trim();
    if (!corpNickname) { alert('呼び名を入力してください'); return; }
  }
  // Handle avatar
  const avatarRemoved = document.getElementById('pAvatarRemove')?.value === '1';
  const existingAvatar = editingId ? (data.people.find(x=>x.id===editingId)?.avatar||null) : null;
  let avatarData = avatarRemoved ? null : existingAvatar;
  if (!avatarRemoved) {
    const avatarImg = document.querySelector('#pAvatarPreview img');
    if (avatarImg && avatarImg.src.startsWith('data:')) avatarData = avatarImg.src;
  }

  // Handle corporate photo
  const corpPhotoRemoved = document.getElementById('pCorpPhotoRemove')?.value === '1';
  const existingCorpPhoto = editingId ? (data.people.find(x=>x.id===editingId)?.corpPhoto||null) : null;
  let corpPhotoData = corpPhotoRemoved ? null : existingCorpPhoto;
  if (!corpPhotoRemoved) {
    const corpPhotoImg = document.querySelector('#pCorpPhotoPreview img');
    if (corpPhotoImg && corpPhotoImg.src.startsWith('data:')) corpPhotoData = corpPhotoImg.src;
  }

  const person = {
    id: editingId || genId(),
    nickname: isCorp ? document.getElementById('pCorpNickname').value.trim() : nickname,
    corpNickname: isCorp ? document.getElementById('pCorpNickname').value.trim() : null,
    corpFullName: isCorp ? document.getElementById('pCorpName').value.trim()||null : null,
    fullName: isCorp ? null : document.getElementById('pFullName').value.trim()||null,
    relation: isCorp ? null : document.getElementById('pRelation').value.trim()||null,
    gender: isCorp ? null : document.getElementById('pGender')?.value||'unset',
    avatar: isCorp ? null : avatarData,
    corpPhoto: isCorp ? corpPhotoData : null,
    type: personType,
    companyLink: isCorp ? null : document.getElementById('pCompanyLink')?.value.trim()||null,
    position: isCorp ? null : document.getElementById('pPosition')?.value.trim()||null,
    industry: isCorp ? document.getElementById('pIndustry')?.value.trim()||null : null,
    address: isCorp ? document.getElementById('pAddress')?.value.trim()||null : null,
    chugen: document.getElementById('pChugen')?.value||null,
    chugenBudget: document.getElementById('pChugenBudget')?.value||null,
    seibo: document.getElementById('pSeibo')?.value||null,
    seiboBudget: document.getElementById('pSeiboBudget')?.value||null,
    anniversaries,
    sizes: {
      tops: document.getElementById('pSizeTops')?.value.trim()||null,
      bottoms: document.getElementById('pSizeBottoms')?.value.trim()||null,
      shoes: document.getElementById('pSizeShoes')?.value.trim()||null,
      ring: document.getElementById('pSizeRing')?.value.trim()||null,
    },
    smoking: document.getElementById('pSmoking')?.value.trim()||null,
    drinking: document.getElementById('pDrinking')?.value.trim()||null,
    interests: parseTags(document.getElementById('pInterests')?.value||''),
    brands: parseTags(document.getElementById('pBrands')?.value||''),
    oshi: parseTags(document.getElementById('pOshi')?.value||''),
    foodLike: parseTags(document.getElementById('pFoodLike')?.value||''),
    foodDislike: parseTags(document.getElementById('pFoodDislike')?.value||''),
    family,
    personality: parseTags(document.getElementById('pPersonality')?.value||''),
    memo: document.getElementById('pMemo').value.trim()||null,
    // Memory fields (記憶の人のみ)
    isMemory: editingId ? (data.people.find(p=>p.id===editingId)?.isMemory||false) : false,
    memoryType: document.getElementById('mMemoryType')?.value || (editingId ? data.people.find(p=>p.id===editingId)?.memoryType : null),
    memoryDate: (() => {
      const fmt = document.getElementById('mDateFormat')?.value;
      if (!fmt) return editingId ? data.people.find(p=>p.id===editingId)?.memoryDate||'' : '';
      const y=document.getElementById('mDateYear')?.value||'',m=document.getElementById('mDateMonth')?.value||'',d=document.getElementById('mDateDay')?.value||'';
      if(fmt==='full'&&y&&m)return `${y}-${String(m).padStart(2,'0')}-${String(d||1).padStart(2,'0')}`;
      if(fmt==='monthday'&&m)return `${String(m).padStart(2,'0')}-${String(d||1).padStart(2,'0')}`;
      if(fmt==='month'&&m)return `${String(m).padStart(2,'0')}`;
      return '';
    })(),
    memoryDateFormat: document.getElementById('mDateFormat')?.value || (editingId ? data.people.find(p=>p.id===editingId)?.memoryDateFormat : null),
    memoryDateType: document.getElementById('mDateType')?.value || (editingId ? data.people.find(p=>p.id===editingId)?.memoryDateType : null),
    memoryMessage: document.getElementById('mMessage')?.value.trim() || (editingId ? data.people.find(p=>p.id===editingId)?.memoryMessage : null),
    reminderMode: document.getElementById('mRemMode')?.value || (editingId ? data.people.find(p=>p.id===editingId)?.reminderMode : 'none'),
    reminderDays: document.getElementById('mRemDays')?.value ? parseInt(document.getElementById('mRemDays').value) : (editingId ? data.people.find(p=>p.id===editingId)?.reminderDays||0 : 0),
    counters: editingId ? (data.people.find(p=>p.id===editingId)?.counters||[]) : [],
    pinned: editingId ? (data.people.find(p=>p.id===editingId)?.pinned||false) : false,
    createdAt: editingId ? (data.people.find(p=>p.id===editingId)?.createdAt||new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  _saving = true;
  if (editingId) {
    const idx = data.people.findIndex(p=>p.id===editingId);
    if (idx>=0) data.people[idx] = person;
  } else {
    data.people.push(person);
  }
  saveData(); closeModal(); render();
  showToast(editingId ? '更新しました' : '登録しました ✓');
  checkCelebrationOnSave(person.anniversaries);
  _saving = false;
}

// ===== Save Item =====
function saveItem() {
  const title = document.getElementById('fTitle').value.trim();
  if (!title) { alert('名前を入力してください'); return; }
  const fileInput = getPhotoData('fImg');
  // Combine selected genre tags + typed tags
  const selectedItemTags = document.getElementById('fItemSelectedTags')?.value.split(',').filter(Boolean) || [];
  const typedTags = parseTags(document.getElementById('fTags')?.value||'');
  const tags = [...new Set([...selectedItemTags, ...typedTags])];
  function doSave(imgData) {
    const existingItem = editingId ? data[currentTab].find(i=>i.id===editingId) : null;
    const item = {
      id: editingId || genId(),
      title,
      purpose: document.getElementById('fPurpose')?.value||null,
      giftTarget: document.getElementById('fGiftTarget')?.value.trim()||null,
      person: document.getElementById('fPerson')?.value.trim()||(document.getElementById('fGiftTarget')?.value.trim())||null,
      labelIdx: existingItem?.labelIdx ?? null,
      itemCategory: document.getElementById('fItemCategory')?.value||null,
      occasion: document.getElementById('fOccasion')?.value.trim()||null,
      amount: document.getElementById('fAmount')?.value||null,
      date: document.getElementById('fDate')?.value||null,
      rating: parseInt(document.getElementById('fRating')?.value)||0,
      tags: tags.length?tags:null,
      url: document.getElementById('fUrl')?.value.trim()||null,
      memo: document.getElementById('fMemo')?.value.trim()||null,
      img: imgData,
      pinned: existingItem?.pinned||false,
      createdAt: existingItem?.createdAt||new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (editingId) {
      const idx = data[currentTab].findIndex(i=>i.id===editingId);
      if (idx>=0) data[currentTab][idx] = item;
    } else {
      data[currentTab].push(item);
    }
    saveData(); closeModal(); render();
    // Pickup toast
    if (tags.length && currentTab!=='people') {
      const matches = findMatchingPeople(tags);
      if (matches.length) {
        showToast('💡 喜びそうな人: ' + matches.map(m=>m.name).join(', '));
      }
    }
  }

  const removeFlag = document.getElementById('fImgRemove')?.value === '1';
  if (removeFlag) { doSave(null); return; }
  if (fileInput&&fileInput.files&&fileInput.files[0]) {
    compressImage(fileInput.files[0]).then(dataUrl => doSave(dataUrl));
  } else {
    doSave(editingId ? (data[currentTab].find(i=>i.id===editingId)?.img||null) : null);
  }
}

// ===== Edit / Delete =====
function editItem(tab, id) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab===tab));
  if (tab==='people') {
    const p = data.people.find(x=>x.id===id);
    if (p?.isMemory) openMemoryModal(id); else openPeopleModal(id);
  } else if (tab==='place') {
    const pl = data.place.find(x=>x.id===id);
    if (pl?.isClosed) openPlaceMemoryModal(id); else openPlaceModal(id);
  } else openItemModal(id);
}
function duplicateItem(tab, id) {
  const src = (tab==='groups' ? data.groups : tab==='people' ? data.people : data[tab])?.find(i=>i.id===id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = genId();
  copy.title = copy.title ? copy.title + '（コピー）' : undefined;
  copy.nickname = copy.nickname ? copy.nickname + '（コピー）' : undefined;
  copy.name = (tab==='groups' && copy.name) ? copy.name + '（コピー）' : copy.name;
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = new Date().toISOString();
  copy.pinned = false;
  if (tab==='groups') data.groups.push(copy);
  else if (tab==='people') data.people.push(copy);
  else data[tab].push(copy);
  saveData(); render();
  showToast('コピーを作成しました');
}

function deleteItem(tab, id) {
  const lockMethod = localStorage.getItem(LOCK_METHOD_KEY);
  const hasPin = !!localStorage.getItem(PIN_KEY);
  const hasBio = lockMethod === 'biometric';

  if (hasBio) {
    // 生体認証で確認
    navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: (JSON.parse(localStorage.getItem('awai_bio_cred') || '[]')).map(c => ({...c, id: new Uint8Array(c.id).buffer}))
      }
    }).then(() => {
      data[tab] = data[tab].filter(i=>i.id!==id);
      saveData(); openPersonId = null; openItemId = null; render();
      showToast('削除しました');
    }).catch(() => {
      // 生体認証失敗→パスコードフォールバック
      if (hasPin) deleteWithPin(tab, id);
      else deleteWithTyping(tab, id);
    });
  } else if (hasPin) {
    deleteWithPin(tab, id);
  } else {
    deleteWithTyping(tab, id);
  }
}

function deleteWithPin(tab, id) {
  const overlay = document.createElement('div');
  overlay.id = 'deleteConfirmOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:500;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s;';
  overlay.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:85%;max-width:320px;text-align:center;">
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;">削除の確認</div>
    <div style="font-size:14px;color:var(--sub);margin-bottom:16px;">パスコードを入力してください</div>
    <input type="password" id="deletePinInput" maxlength="4" inputmode="numeric" pattern="[0-9]*" style="width:120px;text-align:center;font-size:24px;letter-spacing:12px;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
    <div id="deletePinError" style="font-size:13px;color:#c97070;min-height:20px;"></div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
      <button onclick="document.getElementById('deleteConfirmOverlay').remove()" style="background:none;border:1px solid var(--border);border-radius:10px;padding:10px 20px;font-size:14px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">キャンセル</button>
      <button onclick="confirmDeletePin('${tab}','${id}')" style="background:#c97070;border:none;border-radius:10px;padding:10px 20px;font-size:14px;cursor:pointer;color:#fff;font-family:'Zen Maru Gothic',sans-serif;">削除する</button>
    </div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('deletePinInput')?.focus(), 100);
}

function confirmDeletePin(tab, id) {
  const input = document.getElementById('deletePinInput');
  const saved = localStorage.getItem(PIN_KEY);
  if (input.value === saved) {
    document.getElementById('deleteConfirmOverlay')?.remove();
    data[tab] = data[tab].filter(i=>i.id!==id);
    saveData(); openPersonId = null; openItemId = null; render();
    showToast('削除しました');
  } else {
    document.getElementById('deletePinError').textContent = 'パスコードが違います';
    input.value = '';
    input.focus();
  }
}

function deleteWithTyping(tab, id) {
  const overlay = document.createElement('div');
  overlay.id = 'deleteConfirmOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:500;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s;';
  overlay.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:85%;max-width:320px;text-align:center;">
    <div style="font-size:16px;font-weight:600;margin-bottom:16px;">削除の確認</div>
    <div style="font-size:14px;color:var(--sub);margin-bottom:16px;">「削除」と入力してください</div>
    <input type="text" id="deleteTypeInput" autocomplete="off" style="width:160px;text-align:center;font-size:18px;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
    <div id="deleteTypeError" style="font-size:13px;color:#c97070;min-height:20px;"></div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
      <button onclick="document.getElementById('deleteConfirmOverlay').remove()" style="background:none;border:1px solid var(--border);border-radius:10px;padding:10px 20px;font-size:14px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">キャンセル</button>
      <button onclick="confirmDeleteTyping('${tab}','${id}')" style="background:#c97070;border:none;border-radius:10px;padding:10px 20px;font-size:14px;cursor:pointer;color:#fff;font-family:'Zen Maru Gothic',sans-serif;">削除する</button>
    </div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('deleteTypeInput')?.focus(), 100);
}

function confirmDeleteTyping(tab, id) {
  const input = document.getElementById('deleteTypeInput');
  if (input.value === '削除') {
    document.getElementById('deleteConfirmOverlay')?.remove();
    data[tab] = data[tab].filter(i=>i.id!==id);
    saveData(); openPersonId = null; openItemId = null; render();
    showToast('削除しました');
  } else {
    document.getElementById('deleteTypeError').textContent = '「削除」と入力してください';
    input.value = '';
    input.focus();
  }
}

// ===== Open modal (scroll to top) =====
// ===== Modal draft save/restore =====
const DRAFT_KEY = 'awai_modal_draft';
let _modalDraftTimer = null;

function startDraftAutoSave() {
  clearInterval(_modalDraftTimer);
  _modalDraftTimer = setInterval(saveDraft, 2000);
}

function saveDraft() {
  const modal = document.querySelector('.modal-overlay.open .modal');
  if (!modal) return;
  const draft = { tab: currentTab, editingId, inputs: {} };
  modal.querySelectorAll('input,textarea,select').forEach(el => {
    if (el.id) draft.inputs[el.id] = el.value;
  });
  // Save active chips
  draft.activeChips = [];
  modal.querySelectorAll('.date-type-chip.active').forEach(el => {
    draft.activeChips.push(el.textContent.trim());
  });
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch(e) {}
}

function restoreDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft.inputs || Object.keys(draft.inputs).length === 0) return false;
    // Check if any input has actual content
    const hasContent = Object.values(draft.inputs).some(v => v && v.trim());
    if (!hasContent) return false;
    return draft;
  } catch(e) { return false; }
}

function applyDraft(draft) {
  if (!draft || !draft.inputs) return;
  setTimeout(() => {
    Object.entries(draft.inputs).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el && value) el.value = value;
    });
  }, 100);
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch(e) {}
  clearInterval(_modalDraftTimer);
}

function openModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  const modal = overlay.querySelector('.modal');
  if (modal) requestAnimationFrame(() => { modal.scrollTop = 0; });
  startDraftAutoSave();
  history.pushState({modal:true}, '');
}

// ===== Close modal =====
function closeModal() {
  stopQRCamera();
  clearDraft();
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('labelModalOverlay').classList.remove('open');
  editingId = null;
}

// ===== Label modal =====
function openLabelModal() {
  const modal = document.getElementById('labelModal');
  const labels = getLabels(currentTab);
  let html = `<h2>${MODAL_TITLES[currentTab]} のラベル管理</h2>`;
  labels.forEach((l,i) => {
    html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:16px;cursor:pointer;line-height:1;opacity:${i===0?'0.3':'1'};" onclick="${i>0?`moveLabel(${i},-1)`:''}" ${i===0?'':''}">▲</span>
        <span style="font-size:16px;cursor:pointer;line-height:1;opacity:${i===labels.length-1?'0.3':'1'};" onclick="${i<labels.length-1?`moveLabel(${i},1)`:''}" ${i===labels.length-1?'':''}">▼</span>
      </div>
      <span style="width:12px;height:12px;border-radius:50%;background:${l.color};flex-shrink:0;"></span>
      <span style="flex:1;font-size:14px;">${esc(l.name)}</span>
      <span style="font-size:13px;color:#c97070;cursor:pointer;" onclick="removeLabel(${i})">🗑</span>
    </div>`;
  });
  html += `<div style="border-top:1px dashed var(--border);padding-top:14px;margin-top:8px;">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px;">ラベルを追加</div>
    <div class="form-group"><label>ラベル名</label><input id="newLabelName" placeholder="例：洋服、お酒、旅行、お礼"></div>
    <div class="form-group"><label>色</label><div class="label-color-palette" id="labelColorPalette">
      ${LABEL_COLORS.map((c,i)=>`<div class="label-color-swatch ${i===0?'selected':''}" style="background:${c};" onclick="selectLabelColor(this,'${c}')"></div>`).join('')}
    </div><input type="hidden" id="newLabelColor" value="${LABEL_COLORS[0]}"></div>
    <button class="btn btn-primary" style="width:100%;" onclick="addLabel()">追加</button>
  </div>`;
  html += `<div style="margin-top:12px;"><button class="btn btn-secondary" style="width:100%;" onclick="closeModal()">閉じる</button></div>`;
  modal.innerHTML = html;
  document.getElementById('labelModalOverlay').classList.add('open');
}
function selectLabelColor(el, color) {
  document.querySelectorAll('.label-color-swatch').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('newLabelColor').value = color;
}
function addLabel() {
  const name = document.getElementById('newLabelName').value.trim();
  if (!name) return;
  const color = document.getElementById('newLabelColor').value;
  const lk = getLabelKey(currentTab);
  if (!data.labels[lk]) data.labels[lk] = [];
  data.labels[lk].push({name, color});
  autoLabelAll();
  saveData(); openLabelModal(); renderLabelBar();
}
function moveLabel(idx, dir) {
  const lk = getLabelKey(currentTab);
  const labels = data.labels[lk];
  if (!labels) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= labels.length) return;
  // Swap labels
  [labels[idx], labels[newIdx]] = [labels[newIdx], labels[idx]];
  // Update labelIdx on items
  const tabsToUpdate = lk==='gift' ? ['received','gave'] : [currentTab];
  tabsToUpdate.forEach(t => {
    (data[t]||[]).forEach(item => {
      if (item.labelIdx === idx) item.labelIdx = newIdx;
      else if (item.labelIdx === newIdx) item.labelIdx = idx;
    });
  });
  saveData(); openLabelModal(); renderLabelBar();
}

function removeLabel(idx) {
  if (!confirm('このラベルを削除しますか？')) return;
  const lk = getLabelKey(currentTab);
  data.labels[lk].splice(idx, 1);
  // Update both received and gave if shared
  const tabsToUpdate = lk==='gift' ? ['received','gave'] : [currentTab];
  tabsToUpdate.forEach(t => {
    (data[t]||[]).forEach(item => { if (item.labelIdx===idx) item.labelIdx=null; else if (item.labelIdx>idx) item.labelIdx--; });
  });
  saveData(); openLabelModal(); render();
}

// ===== AI Suggest =====
const AI_EDGE_FN = SUPABASE_URL + '/functions/v1/ai-concierge';

const FONTSIZE_KEY = 'awai_fontsize';

function loadFontSize() {
  const size = localStorage.getItem(FONTSIZE_KEY) || 'normal';
  document.body.dataset.fontsize = size;
}

function openSettings() {
  const modal = document.getElementById('settingsModal');
  const currentSize = localStorage.getItem(FONTSIZE_KEY) || 'normal';
  const emailLinked = _sbUser && _sbUser.email;
  const _sc = 'background:var(--card);border-radius:16px;padding:16px;margin-bottom:12px;box-shadow:0 1px 6px var(--shadow);';
  const _sl = 'font-size:15px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:8px;';
  const _sb2 = 'display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;cursor:pointer;transition:background 0.2s;';
  modal.innerHTML = `<h2 style="font-size:20px;margin-bottom:20px;">⚙️ 設定</h2>

    <!-- プロフィール -->
    <div style="${_sc}">
      <div style="${_sl}">👤 プロフィール</div>
      <div style="${_sb2}border:1px solid var(--border);" onclick="document.getElementById('settingsModalOverlay').classList.remove('open');openMyProfile()">
        <span style="font-size:24px;">✏️</span>
        <div><div style="font-size:14px;font-weight:500;">マイプロフィールを編集</div><div style="font-size:11px;color:var(--sub);">コンシェルジュAIが活用します</div></div>
        <span style="margin-left:auto;color:var(--sub);">→</span>
      </div>
    </div>

    <!-- 友だち -->
    <div style="${_sc}">
      <div style="${_sl}">🤝 友だち</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <div style="${_sb2}flex:1;border:1px solid var(--border);justify-content:center;" onclick="document.getElementById('settingsModalOverlay').classList.remove('open');openProfileShareScreen()">
          <span style="font-size:20px;">📤</span><span style="font-size:13px;">QR表示</span>
        </div>
        <div style="${_sb2}flex:1;border:1px solid var(--border);justify-content:center;" onclick="document.getElementById('settingsModalOverlay').classList.remove('open');openQRScanner()">
          <span style="font-size:20px;">📷</span><span style="font-size:13px;">QR読取</span>
        </div>
      </div>
      <div id="myShareCodeDisplay" style="padding:10px 14px;background:var(--accent-light);border-radius:12px;margin-bottom:10px;text-align:center;">
        <div style="font-size:11px;color:var(--sub);margin-bottom:4px;">あなたの共有コード</div>
        <span id="myShareCodeValue" style="font-size:22px;font-weight:700;letter-spacing:4px;color:var(--accent);">読込中...</span>
        <button onclick="navigator.clipboard.writeText(document.getElementById('myShareCodeValue').textContent.trim()).then(()=>showToast('コピーしました'))" style="margin-left:8px;background:none;border:1px solid var(--accent);border-radius:8px;padding:3px 10px;font-size:11px;color:var(--accent);cursor:pointer;">コピー</button>
      </div>
      <div style="display:flex;gap:8px;">
        <input id="friendSearchCode" placeholder="共有コードを入力" maxlength="6" style="flex:1;padding:10px 14px;font-size:14px;border:1px solid var(--border);border-radius:12px;text-transform:uppercase;">
        <button class="card-btn" onclick="doFriendSearch()" style="font-size:14px;padding:8px 16px;">検索</button>
      </div>
      <div id="friendSearchResult"></div>
    </div>

    <!-- 表示 -->
    <div style="${_sc}">
      <div style="${_sl}">🎨 表示</div>
      <div style="font-size:13px;color:var(--sub);margin-bottom:8px;">文字サイズ</div>
      <div style="display:flex;gap:8px;">
        <div class="fsz-btn" data-sz="normal" style="flex:1;padding:12px;text-align:center;border-radius:12px;border:2px solid ${currentSize==='normal'?'var(--accent)':'var(--border)'};cursor:pointer;font-size:14px;" onclick="setFontSize('normal')">標準</div>
        <div class="fsz-btn" data-sz="large" style="flex:1;padding:12px;text-align:center;border-radius:12px;border:2px solid ${currentSize==='large'?'var(--accent)':'var(--border)'};cursor:pointer;font-size:17px;" onclick="setFontSize('large')">大きめ</div>
        <div class="fsz-btn" data-sz="xlarge" style="flex:1;padding:12px;text-align:center;border-radius:12px;border:2px solid ${currentSize==='xlarge'?'var(--accent)':'var(--border)'};cursor:pointer;font-size:20px;" onclick="setFontSize('xlarge')">特大</div>
      </div>
    </div>

    <!-- セキュリティ -->
    <div style="${_sc}">
      <div style="${_sl}">🔒 セキュリティ</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        <div class="date-type-chip ${(localStorage.getItem(LOCK_METHOD_KEY)||'pin')==='pin'?'active':''}" onclick="setLockMethod('pin',this)" style="flex:1;text-align:center;">🔢 パスコード</div>
        <div class="date-type-chip ${localStorage.getItem(LOCK_METHOD_KEY)==='biometric'?'active':''}" onclick="setLockMethod('biometric',this)" style="flex:1;text-align:center;">🔐 生体認証</div>
      </div>
      <div id="lockPinSection" style="display:${localStorage.getItem(LOCK_METHOD_KEY)==='biometric'?'none':''};">
        <div style="display:flex;gap:8px;">
          <button class="card-btn" onclick="document.getElementById('settingsModalOverlay').classList.remove('open');openPinSetup()" style="font-size:14px;padding:8px 16px;">${localStorage.getItem(PIN_KEY)?'パスコード変更':'パスコード設定'}</button>
          ${localStorage.getItem(PIN_KEY)?`<button class="card-btn delete" onclick="removePinLock();document.getElementById('settingsModalOverlay').classList.remove('open');openSettings()" style="font-size:14px;padding:8px 16px;">解除</button>`:''}
        </div>
      </div>
      <div id="lockBioSection" style="display:${localStorage.getItem(LOCK_METHOD_KEY)==='biometric'?'':'none'};">
        <div style="display:flex;gap:8px;">
          <button class="card-btn" onclick="setupBiometricFromSettings()" style="font-size:14px;padding:8px 16px;">🔐 設定</button>
          <button class="card-btn delete" onclick="removeBiometric()" style="font-size:14px;padding:8px 16px;">解除</button>
        </div>
      </div>
      ${localStorage.getItem(PIN_KEY)?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="font-size:13px;color:var(--sub);margin-bottom:8px;">偽装モード</div>
        <div style="display:flex;gap:8px;">
          <button class="card-btn" onclick="document.getElementById('settingsModalOverlay').classList.remove('open');setupDummyPin()" style="font-size:13px;padding:6px 14px;">${localStorage.getItem(DUMMY_PIN_KEY)?'ダミーPIN変更':'ダミーPIN設定'}</button>
          ${localStorage.getItem(DUMMY_PIN_KEY)?`<button class="card-btn delete" onclick="removeDummyPin()" style="font-size:13px;padding:6px 14px;">解除</button>`:''}
        </div>
      </div>`:''}
    </div>

    <!-- 紹介 -->
    <div style="${_sc}">
      <div style="${_sl}">📲 友達に紹介</div>
      <div id="qrArea" style="text-align:center;padding:8px 0;"></div>
      <div style="text-align:center;margin-bottom:8px;">
        <button class="card-btn" onclick="shareApp()" style="font-size:14px;padding:10px 24px;">🔗 URLをシェア</button>
      </div>
      <div style="display:flex;justify-content:center;gap:16px;font-size:13px;color:var(--sub);">
        <span>紹介 <strong id="referralCount">0</strong>人</span>
        <span><strong id="referralPoints">0</strong>pt</span>
      </div>
    </div>
    <!-- ログイン -->
    <div style="${_sc}">
      <div style="${_sl}">📱 ログイン</div>
      <div style="font-size:13px;color:var(--sub);margin-bottom:10px;">ログインすると、スマホを変えてもデータが残ります</div>
      ${emailLinked?`
        <div style="padding:12px 14px;background:#f0f8ee;border:1px solid #c8d8c0;border-radius:14px;display:flex;align-items:center;gap:10px;">
          <span style="color:#6bab8a;font-size:20px;">✅</span>
          <div>
            <div style="font-size:14px;font-weight:500;">${_sbUser.email}</div>
            <div style="font-size:12px;color:#6bab8a;">ログイン中</div>
          </div>
        </div>
        <button class="card-btn delete" onclick="logoutAccount()" style="font-size:13px;padding:8px 14px;margin-top:10px;">ログアウト</button>
      `:`
        <button onclick="document.getElementById('settingsModalOverlay').classList.remove('open');loginWithGoogle()" style="width:100%;padding:14px;font-size:15px;border-radius:14px;border:1px solid #dadce0;background:#fff;color:#3c4043;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-family:'Zen Maru Gothic',sans-serif;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:10px;">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:20px;height:20px;"> Googleでログイン
        </button>
        <div style="display:flex;align-items:center;gap:10px;margin:10px 0;">
          <div style="flex:1;height:1px;background:var(--border);"></div>
          <span style="font-size:11px;color:var(--sub);">または</span>
          <div style="flex:1;height:1px;background:var(--border);"></div>
        </div>
        <input type="email" id="regEmail" placeholder="メールアドレス" style="width:100%;padding:10px 14px;font-size:14px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
        <input type="password" id="regPassword" placeholder="パスワード（6文字以上）" style="width:100%;padding:10px 14px;font-size:14px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
        <button class="card-btn" onclick="registerEmail()" style="font-size:14px;padding:10px 20px;">メールで登録</button>
      `}
    </div>

    <!-- バックアップ -->
    <div style="${_sc}">
      <div style="${_sl}">☁️ バックアップ</div>
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;margin-bottom:8px;">
        <span style="color:#6bab8a;font-size:20px;">✅</span>
        <div style="font-size:13px;">データは自動保存されています</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <button class="card-btn" onclick="createBackup()" style="flex:1;font-size:14px;padding:10px;">☁️ バックアップを作成</button>
      </div>
      <div id="backupListArea" style="font-size:12px;color:var(--sub);text-align:center;">読み込み中...</div>
    </div>


    <div style="text-align:center;margin:16px 0;">
      <span id="settingsVersionTap" style="font-size:12px;color:var(--sub);cursor:default;user-select:none;padding:8px 16px;" onclick="devModeTap()">AWAI v${APP_VERSION}</span>
    </div>
    <div class="form-btns">
      <button class="btn btn-secondary" onclick="document.getElementById('settingsModalOverlay').classList.remove('open')">閉じる</button>
      <button class="btn btn-primary" onclick="saveSettings()">保存</button>
    </div>`;
  document.getElementById('settingsModalOverlay').classList.add('open');
  setTimeout(showQR, 100);
  setTimeout(loadBackupList, 200);
}

// ===== Developer Memo =====
/*
 * Supabase テーブル作成SQL（SQL Editorで実行してください）:
 *
 * create table dev_memos (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users(id),
 *   sender text,
 *   title text,
 *   text text,
 *   priority text default 'low',
 *   img text,
 *   done boolean default false,
 *   admin_reply text,
 *   created_at timestamptz default now(),
 *   updated_at timestamptz default now()
 * );
 *
 * -- RLS設定
 * alter table dev_memos enable row level security;
 * create policy "dev_memos_select" on dev_memos for select to authenticated using (true);
 * create policy "dev_memos_insert" on dev_memos for insert to authenticated with check (true);
 * create policy "dev_memos_update" on dev_memos for update to authenticated using (true);
 * create policy "dev_memos_delete" on dev_memos for delete to authenticated using (true);
 */
const DEV_MEMO_KEY = 'awai_dev_memos';
const DEV_WEBHOOK_KEY = 'awai_dev_webhook';
const DEV_WEBHOOK_DEFAULT = 'https://chat.googleapis.com/v1/spaces/AAQAXCYwhPo/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=dQLnS3Scb2xvLZXNXdsllhGCBDIftkU1Q_BXv2ey4Ic';
let _devTapCount = 0;
let _devTapTimer = null;
let _devMemosCache = null; // Supabaseから取得したメモのキャッシュ

function sendDevNotify(memo, senderName) {
  const webhookUrl = localStorage.getItem(DEV_WEBHOOK_KEY) || DEV_WEBHOOK_DEFAULT;
  if (!webhookUrl) return;
  const priority = memo.priority === 'high' ? '🔴高' : memo.priority === 'medium' ? '🟡中' : '⚪低';
  const card = {
    cards: [{
      header: { title: '🛠 ' + (memo.title || '無題'), subtitle: senderName + ' · ' + priority },
      sections: [{
        widgets: [
          ...(memo.text ? [{ textParagraph: { text: memo.text } }] : []),
          { textParagraph: { text: '<font color="#999999">' + new Date().toLocaleString('ja-JP') + '</font>' } }
        ]
      }]
    }]
  };
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(card)
  }).catch(() => {});
}

function testDevWebhook() {
  const url = document.getElementById('devWebhookUrl').value.trim();
  if (!url) { alert('Webhook URLを入力してください'); return; }
  localStorage.setItem(DEV_WEBHOOK_KEY, url);
  sendDevNotify({ title: 'テスト通知', text: 'AWAI開発者メモからのテスト送信です。この通知が届いていれば正常です。', priority: 'low' }, 'AWAI System');
  showToast('テスト通知を送信しました');
}

function devModeTap() {
  _devTapCount++;
  clearTimeout(_devTapTimer);
  if (_devTapCount >= 3) {
    _devTapCount = 0;
    document.getElementById('settingsModalOverlay').classList.remove('open');
    openDevMemo();
    return;
  }
  _devTapTimer = setTimeout(() => { _devTapCount = 0; }, 1500);
}

function getDevMemosLocal() {
  try { return JSON.parse(localStorage.getItem(DEV_MEMO_KEY)) || []; } catch(e) { return []; }
}

function saveDevMemosLocal(memos) {
  try { localStorage.setItem(DEV_MEMO_KEY, JSON.stringify(memos)); } catch(e) {}
}

// Supabaseからメモを取得（全ユーザー分）。失敗時はlocalStorageフォールバック
async function fetchDevMemosFromSupabase() {
  if (!_sb || !_sbUser) return getDevMemosLocal();
  try {
    const { data: rows, error } = await _sb.from('dev_memos').select('*').eq('user_id', _sbUser.id).order('created_at', { ascending: true });
    if (error) throw error;
    const memos = (rows || []).map(r => ({
      _supaId: r.id,
      _userId: r.user_id,
      title: r.title || '',
      text: r.text || '',
      sender: r.sender || '',
      priority: r.priority || 'low',
      img: r.img || null,
      done: !!r.done,
      admin_reply: r.admin_reply || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
    _devMemosCache = memos;
    // localStorageにも自分のメモだけキャッシュ（フォールバック用）
    const myMemos = memos.filter(m => m._userId === _sbUser.id);
    saveDevMemosLocal(myMemos);
    return memos;
  } catch(e) {
    console.warn('dev_memos Supabase取得失敗、localStorageフォールバック:', e);
    return getDevMemosLocal();
  }
}

// Supabaseに1件保存（insert or update）
async function upsertDevMemoToSupabase(memo, supaId) {
  if (!_sb || !_sbUser) return null;
  try {
    const row = {
      user_id: _sbUser.id,
      sender: memo.sender,
      title: memo.title,
      text: memo.text,
      priority: memo.priority,
      img: memo.img,
      done: memo.done,
      updated_at: new Date().toISOString()
    };
    if (supaId) {
      const { data: updated, error } = await _sb.from('dev_memos').update(row).eq('id', supaId).select().single();
      if (error) throw error;
      return updated;
    } else {
      row.created_at = memo.createdAt || new Date().toISOString();
      const { data: inserted, error } = await _sb.from('dev_memos').insert(row).select().single();
      if (error) throw error;
      return inserted;
    }
  } catch(e) {
    console.warn('dev_memos Supabase保存失敗:', e);
    return null;
  }
}

async function openDevMemo() {
  const modal = document.getElementById('modal');
  modal.innerHTML = `<h2>🛠 開発者メモ</h2><div style="text-align:center;padding:32px;color:var(--sub);">読み込み中...</div>`;
  openModal();

  const memos = await fetchDevMemosFromSupabase();
  let html = `<h2>🛠 開発者メモ</h2>`;
  html += `<div style="display:flex;gap:8px;margin-bottom:16px;">
    <button class="btn btn-primary" onclick="openDevMemoEdit()" style="flex:1;padding:10px;">＋ 新規メモ</button>
    <button class="card-btn" onclick="closeModal();replayOnboarding()" style="padding:10px 14px;font-size:13px;">🔄 初回体験</button>
  </div>`;

  if (!memos.length) {
    html += `<div class="empty-msg">メモはまだありません</div>`;
  } else {
    memos.slice().reverse().forEach((m, ri) => {
      const i = memos.length - 1 - ri;
      const date = new Date(m.createdAt);
      const dateStr = date.toLocaleDateString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const priority = m.priority === 'high' ? '🔴' : m.priority === 'medium' ? '🟡' : '⚪';
      const statusIcon = m.done ? '✅' : '⬜';
      const isOwn = _sbUser && m._userId === _sbUser.id;
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px;${!isOwn ? 'border-left:3px solid #b0bec5;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:12px;color:var(--sub);">${dateStr}${m.sender ? ' · ' + esc(m.sender) : ''}</span>
          <span style="font-size:12px;">${priority} ${statusIcon}</span>
        </div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${esc(m.title||'無題')}</div>
        ${m.text ? `<div style="font-size:13px;color:var(--text);white-space:pre-wrap;margin-bottom:6px;">${esc(m.text)}</div>` : ''}
        ${m.img ? `<div style="margin-bottom:8px;"><img src="${m.img}" style="max-width:100%;border-radius:10px;cursor:pointer;" onclick="window.open(this.src,'_blank')"></div>` : ''}
        ${m.admin_reply ? `<div style="background:#e3f2fd;border:1px solid #bbdefb;border-radius:10px;padding:10px 12px;margin-top:6px;margin-bottom:6px;">
          <div style="font-size:11px;font-weight:600;color:#1565c0;margin-bottom:4px;">💬 管理者からの返信</div>
          <div style="font-size:13px;color:#1a237e;white-space:pre-wrap;">${esc(m.admin_reply)}</div>
        </div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:4px;">
          <button onclick="toggleDevMemoDone(${i})" style="display:flex;align-items:center;justify-content:center;gap:4px;padding:8px;border-radius:12px;border:1px solid ${m.done?'#a5d6a7':'var(--border)'};background:linear-gradient(135deg,${m.done?'#e8f5e9':'#faf8f6'},${m.done?'#d4ecd6':'#f3eeea'});color:var(--text);font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">${m.done?'⬜ 未完了':'✅ 完了'}</button>
          <button onclick="openDevMemoEdit(${i})" style="display:flex;align-items:center;justify-content:center;gap:4px;padding:8px;border-radius:12px;border:1px solid var(--border);background:linear-gradient(135deg,#faf8f6,#f3eeea);color:var(--text);font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">✏️ 編集</button>
          <button onclick="deleteDevMemo(${i})" style="display:flex;align-items:center;justify-content:center;gap:4px;padding:8px;border-radius:12px;border:1px solid #e8c0c0;background:linear-gradient(135deg,#fdf0f0,#f8e4e4);color:#c07070;font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">🗑 削除</button>
        </div>
      </div>`;
    });
  }

  html += `<div class="form-btns" style="margin-top:16px;"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>`;
  modal.innerHTML = html;
}

function openDevMemoEdit(idx) {
  const memos = _devMemosCache || getDevMemosLocal();
  const isEdit = idx !== undefined && idx !== null;
  const m = isEdit ? memos[idx] : null;
  const modal = document.getElementById('modal');

  const savedSender = localStorage.getItem('awai_dev_sender') || (getMyProfile().name || '');
  let html = `<h2>🛠 ${isEdit ? 'メモを編集' : '新規メモ'}</h2>`;
  html += `<div class="form-group"><label>あなたの名前</label><input id="devSender" placeholder="例：浅野" value="${esc(m?.sender || savedSender)}"></div>`;
  html += `<div class="form-group"><label>タイトル</label><input id="devTitle" placeholder="例：行きたい場所の閉じたボタン位置がずれる" value="${esc(m?.title||'')}"></div>`;
  html += `<div class="form-group"><label>内容</label><textarea id="devText" rows="5" placeholder="詳細や修正方針を書く">${esc(m?.text||'')}</textarea></div>`;

  // Priority
  const p = m?.priority || 'low';
  html += `<div class="form-group"><label>優先度</label>
    <div style="display:flex;gap:6px;margin-top:4px;">
      <div class="date-type-chip ${p==='high'?'active':''}" onclick="document.getElementById('devPriority').value='high';this.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));this.classList.add('active');" style="flex:1;text-align:center;">🔴 高</div>
      <div class="date-type-chip ${p==='medium'?'active':''}" onclick="document.getElementById('devPriority').value='medium';this.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));this.classList.add('active');" style="flex:1;text-align:center;">🟡 中</div>
      <div class="date-type-chip ${p==='low'?'active':''}" onclick="document.getElementById('devPriority').value='low';this.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));this.classList.add('active');" style="flex:1;text-align:center;">⚪ 低</div>
    </div><input type="hidden" id="devPriority" value="${p}">
  </div>`;

  // Screenshot
  html += `<div class="form-group">
    <input type="file" id="devImgFile" accept="image/*" style="display:none;" onchange="previewDevImg(this)">
    <input type="hidden" id="devImgRemove" value="">
    <button class="card-btn" onclick="document.getElementById('devImgFile').click()" style="font-size:14px;padding:8px 16px;">📷 スクリーンショット添付</button>
    ${m?.img ? `<button class="card-btn delete" onclick="document.getElementById('devImgPreview').innerHTML='';document.getElementById('devImgRemove').value='1'" style="font-size:13px;margin-left:8px;">✕ 削除</button>` : ''}
    <div id="devImgPreview" style="margin-top:8px;">${m?.img ? `<img src="${m.img}" style="max-width:100%;border-radius:10px;">` : ''}</div>
  </div>`;

  html += `<input type="hidden" id="devEditIdx" value="${isEdit ? idx : ''}">`;
  html += `<input type="hidden" id="devEditSupaId" value="${isEdit && m?._supaId ? m._supaId : ''}">`;
  html += `<div class="form-btns">
    <button class="btn btn-secondary" onclick="openDevMemo()">戻る</button>
    <button class="btn btn-primary" onclick="saveDevMemo()">保存</button>
  </div>`;
  modal.innerHTML = html;
}

function previewDevImg(input) {
  if (!input.files || !input.files[0]) return;
  document.getElementById('devImgRemove').value = '';
  _rectCropTargetId = 'devImgPreview';
  _rectCropInputId = 'devImg';
  compressImage(input.files[0]).then(dataUrl => {
    input.dataset.compressed = dataUrl;
    showRectCrop(dataUrl, 'devImgPreview', 'devImg');
  });
}

async function saveDevMemo() {
  const title = document.getElementById('devTitle').value.trim();
  const text = document.getElementById('devText').value.trim();
  if (!title && !text) { alert('タイトルまたは内容を入力してください'); return; }

  const memos = _devMemosCache || getDevMemosLocal();
  const idxStr = document.getElementById('devEditIdx').value;
  const isEdit = idxStr !== '';
  const idx = isEdit ? parseInt(idxStr) : -1;
  const supaId = document.getElementById('devEditSupaId')?.value || null;

  const removeImg = document.getElementById('devImgRemove')?.value === '1';
  const previewImg = document.querySelector('#devImgPreview img');
  let img = null;
  if (removeImg) {
    img = null;
  } else if (previewImg && previewImg.src.startsWith('data:')) {
    img = previewImg.src;
  } else if (isEdit && memos[idx]?.img) {
    img = memos[idx].img;
  }

  const sender = document.getElementById('devSender').value.trim() || '匿名';
  localStorage.setItem('awai_dev_sender', sender);

  const memo = {
    title,
    text,
    sender,
    priority: document.getElementById('devPriority').value || 'low',
    img,
    done: isEdit ? (memos[idx]?.done || false) : false,
    createdAt: isEdit ? memos[idx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // localStorageにも保存（フォールバック用）
  const localMemos = getDevMemosLocal();
  if (isEdit && supaId) {
    const localIdx = localMemos.findIndex(m => m._supaId === supaId);
    if (localIdx >= 0) localMemos[localIdx] = { ...memo, _supaId: supaId };
  } else {
    localMemos.push(memo);
  }
  saveDevMemosLocal(localMemos);

  // Supabaseに保存
  const result = await upsertDevMemoToSupabase(memo, supaId || null);
  if (result && !supaId) {
    const last = localMemos[localMemos.length - 1];
    if (last) last._supaId = result.id;
    saveDevMemosLocal(localMemos);
  }

  sendDevNotify(memo, sender);
  openDevMemo();
  const hasWebhook = !!localStorage.getItem(DEV_WEBHOOK_KEY);
  showToast(isEdit ? 'メモを更新しました' + (hasWebhook?' 📡':'') : 'メモを追加しました' + (hasWebhook?' 📡':''));
}

async function toggleDevMemoDone(idx) {
  const memos = _devMemosCache || getDevMemosLocal();
  if (memos[idx]) {
    memos[idx].done = !memos[idx].done;
    memos[idx].updatedAt = new Date().toISOString();
    if (memos[idx]._supaId && _sb && _sbUser) {
      try {
        await _sb.from('dev_memos').update({ done: memos[idx].done, updated_at: memos[idx].updatedAt }).eq('id', memos[idx]._supaId);
      } catch(e) { console.warn('done更新失敗:', e); }
    }
    const localMemos = getDevMemosLocal();
    const localIdx = localMemos.findIndex(m => m._supaId === memos[idx]._supaId);
    if (localIdx >= 0) { localMemos[localIdx].done = memos[idx].done; saveDevMemosLocal(localMemos); }
    openDevMemo();
  }
}

async function deleteDevMemo(idx) {
  if (!confirm('このメモを削除しますか？')) return;
  const memos = _devMemosCache || getDevMemosLocal();
  const memo = memos[idx];
  if (!memo) return;

  if (memo._supaId && _sb && _sbUser) {
    try {
      const { error } = await _sb.from('dev_memos').delete().eq('id', memo._supaId).eq('user_id', _sbUser.id);
      if (error) { alert('削除に失敗しました'); return; }
    } catch(e) { alert('削除に失敗しました'); return; }
  }
  const localMemos = getDevMemosLocal();
  const localIdx = memo._supaId ? localMemos.findIndex(m => m._supaId === memo._supaId) : idx;
  if (localIdx >= 0) { localMemos.splice(localIdx, 1); saveDevMemosLocal(localMemos); }
  if (_devMemosCache) { _devMemosCache.splice(idx, 1); }
  openDevMemo();
  showToast('メモを削除しました');
}

// ===== Partner Links (送客パートナー) =====
const PARTNERS = [
  { id: 'piary', name: 'PIARY（ピアリー）', url: 'https://www.piary.jp/gift/', icon: '🎁', desc: 'ギフト・内祝い', category: 'gift' },
  { id: 'ktourist', name: 'ケーツーリスト', url: 'https://k-tourist.com/', icon: '✈️', desc: '旅行・体験', category: 'travel' },
  { id: 'hikarika', name: 'ヒカリカ', url: 'https://hikarika.stores.jp/', icon: '💐', desc: 'お花・フラワーギフト', category: 'flower' }
];

function buildPartnerUrl(partner, personId) {
  const ref = _sbUser ? _sbUser.id.substring(0, 8) : 'unknown';
  return partner.url + '?ref=awai_' + ref + (personId ? '&pid=' + personId : '');
}

async function trackPartnerClick(partnerId, personId) {
  if (!_sb || !_sbUser) return;
  try {
    await _sb.from('user_data').upsert({
      user_id: _sbUser.id,
      data: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
      profile: JSON.parse(localStorage.getItem('awai_my_profile') || '{}'),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch(e) {}
}

function openPartnerLinks(personId) {
  const p = personId ? data.people.find(x=>x.id===personId) : null;
  const modal = document.getElementById('modal');
  let html = `<h2>🎁 ギフトを探す</h2>`;
  if (p) {
    html += `<div style="background:var(--bg);border-radius:12px;padding:12px;margin-bottom:16px;">
      <div style="font-size:15px;font-weight:600;">${esc(p.nickname)} さんへ</div>
      ${p.interests?.length ? '<div style="font-size:12px;color:var(--sub);margin-top:4px;">好き: ' + p.interests.slice(0,5).join(', ') + '</div>' : ''}
      ${p.foodLike?.length ? '<div style="font-size:12px;color:var(--sub);">食: ' + p.foodLike.slice(0,3).join(', ') + '</div>' : ''}
    </div>`;
  }
  html += `<div style="display:flex;flex-direction:column;gap:10px;">`;
  PARTNERS.forEach(pt => {
    const url = buildPartnerUrl(pt, personId);
    html += `<a href="${url}" target="_blank" rel="noopener" onclick="trackPartnerClick('${pt.id}','${personId||''}')" style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:14px;border:1px solid var(--border);background:var(--card);text-decoration:none;color:var(--text);transition:background 0.2s;">
      <span style="font-size:28px;flex-shrink:0;">${pt.icon}</span>
      <div>
        <div style="font-size:15px;font-weight:600;">${pt.name}</div>
        <div style="font-size:12px;color:var(--sub);">${pt.desc}</div>
      </div>
      <span style="margin-left:auto;font-size:14px;color:var(--accent);">→</span>
    </a>`;
  });
  html += `</div>`;
  html += `<div class="form-btns" style="margin-top:16px;"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>`;
  modal.innerHTML = html;
  openModal();
}

// ===== Referral =====
const REFERRAL_ID_KEY = 'awai_referral_id';
const REFERRAL_COUNT_KEY = 'awai_referral_count';

function getMyReferralId() {
  let id = localStorage.getItem(REFERRAL_ID_KEY);
  if (!id) { id = 'awai_' + genId(); localStorage.setItem(REFERRAL_ID_KEY, id); }
  return id;
}

function getAppUrl() {
  const base = 'https://awai.gift/';
  return base + '?ref=' + getMyReferralId();
}

function showQR() {
  const area = document.getElementById('qrArea');
  if (!area) return;
  const url = getAppUrl();
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    area.innerHTML = qr.createSvgTag(4, 0);
    area.querySelector('svg').style.maxWidth = '180px';
    area.querySelector('svg').style.margin = '0 auto';
    area.querySelector('svg').style.display = 'block';
  } catch(e) { area.innerHTML = '<div style="font-size:12px;color:var(--sub);">QRコード生成エラー</div>'; }
  // Update referral count
  const countEl = document.getElementById('referralCount');
  if (countEl) countEl.textContent = localStorage.getItem(REFERRAL_COUNT_KEY) || '0';
  // Load share code
  const scEl = document.getElementById('myShareCodeValue');
  if (scEl) {
    ensureShareCode().then(code => {
      if (scEl) scEl.textContent = code || '---';
    });
  }
  // Load referral points from Supabase
  const ptEl = document.getElementById('referralPoints');
  if (ptEl) {
    getReferralPoints().then(rp => {
      if (ptEl) ptEl.textContent = rp.points;
      if (countEl) countEl.textContent = rp.referral_count;
    });
  }
}

function buildPersonShareText(p) {
  let lines = [p.nickname || '名前なし'];
  if (p.relation) lines.push(p.relation);
  if (p.fullName) lines.push(p.fullName);
  if (p.anniversaries && p.anniversaries.length) {
    p.anniversaries.forEach(a => {
      lines.push('📅 ' + a.name + (a.date ? ' ' + a.date : ''));
    });
  }
  if (p.interests && p.interests.length) lines.push('💖 ' + p.interests.join(', '));
  if (p.brands && p.brands.length) lines.push('🎨 ' + p.brands.join(', '));
  if (p.foodLike && p.foodLike.length) lines.push('😋 好き: ' + p.foodLike.join(', '));
  if (p.foodDislike && p.foodDislike.length) lines.push('🙅 苦手: ' + p.foodDislike.join(', '));
  if (p.memo) lines.push(p.memo);
  return lines.join('\n');
}

function buildGroupShareText(g) {
  let lines = [g.name || 'グループ'];
  if (g.memberIds && g.memberIds.length) {
    const names = g.memberIds.map(mid => {
      const person = data.people.find(p => p.id === mid);
      return person ? person.nickname : null;
    }).filter(Boolean);
    if (names.length) lines.push('👥 ' + names.join(', '));
  }
  if (g.memo) lines.push(g.memo);
  return lines.join('\n');
}

function doShare(title, text, url) {
  if (navigator.share) {
    const shareData = { title, text };
    if (url) shareData.url = url;
    navigator.share(shareData).catch(() => {});
    return;
  }
  const existing = document.getElementById('shareSheet');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'shareSheet';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--card);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:480px;';
  sheet.innerHTML = `
    <div style="text-align:center;margin-bottom:16px;font-weight:700;font-size:16px;">📤 共有</div>
    <div style="font-size:13px;color:var(--sub);background:var(--bg);border-radius:12px;padding:12px;margin-bottom:20px;white-space:pre-wrap;max-height:120px;overflow-y:auto;">${text.replace(/</g,'&lt;')}</div>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="shareLineBtn" style="flex:1;padding:14px;border-radius:14px;border:none;background:#06C755;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">💬 LINEで送る</button>
      <button id="shareCopyBtn" style="flex:1;padding:14px;border-radius:14px;border:none;background:var(--accent);color:#fff;font-size:15px;font-weight:700;cursor:pointer;">🔗 コピー</button>
    </div>
    <button onclick="this.closest('#shareSheet').remove()" style="width:100%;margin-top:12px;padding:12px;border-radius:14px;border:1px solid var(--border);background:var(--card);font-size:14px;color:var(--sub);cursor:pointer;">キャンセル</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  sheet.querySelector('#shareLineBtn').onclick = () => {
    window.open('https://line.me/R/share?text=' + encodeURIComponent(text), '_blank');
    overlay.remove();
  };
  sheet.querySelector('#shareCopyBtn').onclick = () => {
    navigator.clipboard.writeText(text).then(() => {
      sheet.querySelector('#shareCopyBtn').textContent = '✅ コピーしました！';
      setTimeout(() => overlay.remove(), 1000);
    }).catch(() => { prompt('コピーしてください:', text); overlay.remove(); });
  };
}

function sharePerson(id) {
  const p = data.people.find(x => x.id === id);
  if (!p) return;
  doShare(p.nickname || '名前なし', buildPersonShareText(p));
}

function shareGroup(id) {
  const g = data.groups.find(x => x.id === id);
  if (!g) return;
  doShare(g.name || 'グループ', buildGroupShareText(g));
}

function buildShareText(item) {
  let lines = [item.title || '無題'];
  if (item.occasion) lines.push(item.occasion);
  if (item.person) lines.push('👤 ' + item.person);
  if (item.amount) lines.push('¥' + Number(item.amount).toLocaleString());
  if (item.tags && item.tags.length) lines.push(item.tags.map(t => '#' + t).join(' '));
  if (item.memo) lines.push(item.memo);
  if (item.url) lines.push(item.url);
  else if (item.mapUrl) lines.push(item.mapUrl);
  return lines.join('\n');
}

function shareItem(tab, id) {
  const items = data[tab] || [];
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (tab === 'place') {
    // Show share options for places
    const modal = document.getElementById('modal');
    modal.innerHTML = `<h2>📤 共有方法を選択</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
        <button onclick="closeModal();doShareItemDirect('${tab}','${id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;border-radius:14px;border:1px solid #bdd8f0;background:linear-gradient(135deg,#e8f2fc,#daeaf8);color:#4a7aaa;font-size:14px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📤 テキスト共有</button>
        <button onclick="closeModal();sendPlaceToFriend('${id}')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;border-radius:14px;border:1px solid #c8b8e8;background:linear-gradient(135deg,#f0eaf8,#e8e0f4);color:#7a6aaa;font-size:14px;font-weight:500;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📩 友だちに送る</button>
      </div>
      <div class="form-btns" style="margin-top:12px;"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>`;
    openModal();
    return;
  }
  const text = buildShareText(item);
  const url = item.url || item.mapUrl || null;
  doShare(item.title || '無題', text, url);
}
function doShareItemDirect(tab, id) {
  const items = data[tab] || [];
  const item = items.find(i => i.id === id);
  if (!item) return;
  const text = buildShareText(item);
  const url = item.url || item.mapUrl || null;
  doShare(item.title || '無題', text, url);
}

function shareApp() {
  const url = getAppUrl();
  if (navigator.share) {
    navigator.share({ title: 'AWAI — 友だちと記憶がここに', text: '友だちへの贈り物管理アプリ', url }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(url).then(() => alert('URLをコピーしました！')).catch(() => prompt('このURLをシェアしてください:', url));
  }
}

function checkReferral() {
  const params = new URLSearchParams(location.search);
  const ref = params.get('ref');
  if (ref && ref !== getMyReferralId()) {
    const key = 'awai_referred_by';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, ref);
      // Supabaseに紹介ポイントを記録
      updateReferralPoints(ref);
    }
  }
}

// ===== Feature 1: 友だち検索 (Share Code) =====
const SHARE_CODE_KEY = 'awai_share_code';
let _friendSearchResult = null;

async function generateShareCode() {
  if (!_sbUser) return null;
  // Check if already has a code
  const existing = localStorage.getItem(SHARE_CODE_KEY);
  if (existing) return existing;
  // Generate random 6-char alphanumeric
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  // Save to Supabase user_profiles
  try {
    const myName = getMyProfile().name || '名前なし';
    const { error } = await _sb.from('user_profiles').upsert({
      user_id: _sbUser.id,
      display_name: myName,
      share_code: code
    }, { onConflict: 'user_id' });
    if (error) { console.error('Share code save error:', error); return null; }
    localStorage.setItem(SHARE_CODE_KEY, code);
    return code;
  } catch(e) { console.error('generateShareCode error:', e); return null; }
}

async function ensureShareCode() {
  let code = localStorage.getItem(SHARE_CODE_KEY);
  if (code) {
    // Sync display_name to Supabase
    if (_sbUser) {
      const myName = getMyProfile().name || '名前なし';
      _sb.from('user_profiles').upsert({
        user_id: _sbUser.id,
        display_name: myName,
        share_code: code,
        referral_id: getMyReferralId()
      }, { onConflict: 'user_id' }).catch(() => {});
    }
    return code;
  }
  return await generateShareCode();
}

async function searchByShareCode(code) {
  if (!code || code.length < 3) { showToast('共有コードを入力してください'); return null; }
  try {
    const { data: rows, error } = await _sb.from('user_profiles').select('user_id, display_name, share_code').eq('share_code', code.toUpperCase()).limit(1);
    if (error) { showToast('検索エラー: ' + error.message); return null; }
    if (!rows || rows.length === 0) { showToast('該当するユーザーが見つかりませんでした'); return null; }
    const found = rows[0];
    if (found.user_id === (_sbUser && _sbUser.id)) { showToast('自分のコードです'); return null; }
    return found;
  } catch(e) { showToast('検索に失敗しました'); return null; }
}

function doFriendSearch() {
  const code = document.getElementById('friendSearchCode')?.value?.trim();
  if (!code) return;
  const resultEl = document.getElementById('friendSearchResult');
  resultEl.innerHTML = '<div style="text-align:center;color:var(--sub);padding:8px;">検索中...</div>';
  searchByShareCode(code).then(found => {
    if (!found) { resultEl.innerHTML = ''; return; }
    _friendSearchResult = found;
    resultEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:12px;margin-top:8px;">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:18px;">👤</div>
      <div style="flex:1;"><div style="font-weight:600;">${esc(found.display_name)}</div><div style="font-size:12px;color:var(--sub);">コード: ${esc(found.share_code)}</div></div>
      <button class="card-btn" onclick="addFriendByShareCode()" style="font-size:13px;padding:6px 14px;">友だちに追加</button>
    </div>`;
  });
}

function addFriendByShareCode() {
  if (!_friendSearchResult) return;
  // Check if already exists
  const existing = data.people.find(p => p.linkedUserId === _friendSearchResult.user_id);
  if (existing) { showToast('すでに追加済みです（' + existing.nickname + '）'); return; }
  const newPerson = {
    id: genId(),
    nickname: _friendSearchResult.display_name,
    relation: '友だち（AWAI）',
    linkedUserId: _friendSearchResult.user_id,
    linkedShareCode: _friendSearchResult.share_code,
    anniversaries: [],
    interests: [],
    brands: [],
    foodLike: [],
    foodDislike: [],
    createdAt: new Date().toISOString()
  };
  data.people.push(newPerson);
  save();
  showToast(_friendSearchResult.display_name + 'さんを追加しました');
  _friendSearchResult = null;
  const resultEl = document.getElementById('friendSearchResult');
  if (resultEl) resultEl.innerHTML = '<div style="color:#6bab8a;padding:8px;text-align:center;">✅ 追加しました</div>';
}

// ===== Feature 2: カード共有リクエスト =====
let _pendingShareRequests = [];

async function sendShareRequest(personId) {
  const p = data.people.find(x => x.id === personId);
  if (!p) return;
  const modal = document.getElementById('modal');
  modal.innerHTML = `<h2>📩 カード共有</h2>
    <div class="form-hint" style="margin-bottom:12px;">相手の共有コードを入力して、このカードを送信します</div>
    <div class="form-group"><label>送信するカード</label>
      <div style="padding:10px 14px;background:var(--accent-light);border-radius:12px;font-weight:600;">${esc(p.nickname || '名前なし')}</div>
    </div>
    <div class="form-group"><label>相手の共有コード</label>
      <input id="shareReqCode" placeholder="6桁の共有コード" maxlength="6" style="text-transform:uppercase;">
    </div>
    <div class="form-btns">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="doSendShareRequest('${personId}','person')">送信</button>
    </div>`;
  openModal();
}

async function doSendShareRequest(itemId, cardType) {
  const code = document.getElementById('shareReqCode')?.value?.trim()?.toUpperCase();
  if (!code || code.length < 3) { showToast('共有コードを入力してください'); return; }
  if (!_sbUser) { showToast('ログインが必要です'); return; }
  // Find recipient
  try {
    const { data: rows, error } = await _sb.from('user_profiles').select('user_id').eq('share_code', code).limit(1);
    if (error || !rows || !rows.length) { showToast('該当するユーザーが見つかりませんでした'); return; }
    const toUserId = rows[0].user_id;
    if (toUserId === _sbUser.id) { showToast('自分には送れません'); return; }
    // Build card data
    let cardData = {};
    if (cardType === 'person') {
      const p = data.people.find(x => x.id === itemId);
      if (!p) return;
      cardData = { nickname: p.nickname, relation: p.relation, fullName: p.fullName, anniversaries: p.anniversaries, interests: p.interests, brands: p.brands, foodLike: p.foodLike, foodDislike: p.foodDislike, memo: p.memo, sizes: p.sizes };
    } else if (cardType === 'place') {
      const items = data.place || [];
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      cardData = { title: item.title, memo: item.memo, tags: item.tags, address: item.address, phone: item.phone, url: item.url, mapUrl: item.mapUrl, googleMapUrl: item.googleMapUrl, placeCategory: item.placeCategory, rating: item.rating };
    }
    const { error: insertErr } = await _sb.from('share_requests').insert({
      from_user_id: _sbUser.id,
      to_user_id: toUserId,
      card_type: cardType,
      card_data: cardData,
      status: 'pending'
    });
    if (insertErr) { showToast('送信エラー: ' + insertErr.message); return; }
    showToast('共有リクエストを送信しました');
    closeModal();
  } catch(e) { showToast('送信に失敗しました'); console.error(e); }
}

async function checkShareRequests() {
  if (!_sbUser) return;
  try {
    const { data: rows, error } = await _sb.from('share_requests').select('*').eq('to_user_id', _sbUser.id).eq('status', 'pending');
    if (error || !rows) return;
    _pendingShareRequests = rows;
    if (rows.length > 0) {
      showShareRequestBanner(rows.length);
    } else {
      hideShareRequestBanner();
    }
  } catch(e) { console.error('checkShareRequests error:', e); }
}

function showShareRequestBanner(count) {
  let banner = document.getElementById('shareReqBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'shareReqBanner';
    banner.style.cssText = 'padding:10px 16px;background:linear-gradient(135deg,#e8f2fc,#daeaf8);border-bottom:1px solid #bdd8f0;font-size:14px;color:#4a7aaa;cursor:pointer;text-align:center;font-weight:600;';
    banner.onclick = () => openShareRequestsModal();
    const header = document.querySelector('.header');
    if (header) header.parentNode.insertBefore(banner, header.nextSibling);
    else document.body.prepend(banner);
  }
  banner.textContent = '📩 ' + count + '件の共有リクエストがあります';
  banner.style.display = '';
}

function hideShareRequestBanner() {
  const banner = document.getElementById('shareReqBanner');
  if (banner) banner.style.display = 'none';
}

function openShareRequestsModal() {
  const modal = document.getElementById('modal');
  let html = '<h2>📩 共有リクエスト</h2>';
  if (!_pendingShareRequests.length) {
    html += '<div class="empty-msg" style="padding:20px;text-align:center;">リクエストはありません</div>';
  } else {
    _pendingShareRequests.forEach((req, i) => {
      const cd = req.card_data || {};
      const name = cd.nickname || cd.title || '不明';
      const typeLabel = req.card_type === 'person' ? '👤 人物カード' : '📍 場所カード';
      html += `<div style="padding:12px;background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
        <div style="font-weight:600;margin-bottom:4px;">${typeLabel}</div>
        <div style="font-size:15px;margin-bottom:8px;">${esc(name)}</div>
        ${cd.memo ? '<div style="font-size:13px;color:var(--sub);margin-bottom:8px;">' + esc(cd.memo) + '</div>' : ''}
        <div style="display:flex;gap:8px;">
          <button class="card-btn" onclick="acceptShareRequest(${i})" style="font-size:13px;padding:6px 16px;background:var(--accent-light);border-color:var(--accent);">✅ 承認</button>
          <button class="card-btn delete" onclick="rejectShareRequest(${i})" style="font-size:13px;padding:6px 16px;">❌ 拒否</button>
        </div>
      </div>`;
    });
  }
  html += '<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>';
  modal.innerHTML = html;
  openModal();
}

async function acceptShareRequest(index) {
  const req = _pendingShareRequests[index];
  if (!req) return;
  const cd = req.card_data || {};
  if (req.card_type === 'person') {
    const newPerson = {
      id: genId(),
      nickname: cd.nickname || '名前なし',
      relation: cd.relation || '共有された人',
      fullName: cd.fullName || '',
      anniversaries: cd.anniversaries || [],
      interests: cd.interests || [],
      brands: cd.brands || [],
      foodLike: cd.foodLike || [],
      foodDislike: cd.foodDislike || [],
      memo: cd.memo || '',
      sizes: cd.sizes || {},
      createdAt: new Date().toISOString()
    };
    data.people.push(newPerson);
  } else if (req.card_type === 'place') {
    const newPlace = {
      id: genId(),
      title: cd.title || '無題',
      memo: cd.memo || '',
      tags: cd.tags || [],
      address: cd.address || '',
      phone: cd.phone || '',
      url: cd.url || '',
      mapUrl: cd.mapUrl || '',
      googleMapUrl: cd.googleMapUrl || '',
      placeCategory: cd.placeCategory || '',
      rating: cd.rating || 0,
      createdAt: new Date().toISOString()
    };
    if (!data.place) data.place = [];
    data.place.push(newPlace);
  }
  save();
  // Update status in Supabase
  try {
    await _sb.from('share_requests').update({ status: 'accepted' }).eq('id', req.id);
  } catch(e) { console.error(e); }
  _pendingShareRequests.splice(index, 1);
  showToast('カードを追加しました');
  if (_pendingShareRequests.length === 0) hideShareRequestBanner();
  else showShareRequestBanner(_pendingShareRequests.length);
  openShareRequestsModal();
  render();
}

async function rejectShareRequest(index) {
  const req = _pendingShareRequests[index];
  if (!req) return;
  try {
    await _sb.from('share_requests').update({ status: 'rejected' }).eq('id', req.id);
  } catch(e) { console.error(e); }
  _pendingShareRequests.splice(index, 1);
  showToast('リクエストを拒否しました');
  if (_pendingShareRequests.length === 0) hideShareRequestBanner();
  else showShareRequestBanner(_pendingShareRequests.length);
  openShareRequestsModal();
}

// ===== Feature 3: 場所カード友だちに送る =====
function sendPlaceToFriend(itemId) {
  const items = data.place || [];
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const modal = document.getElementById('modal');
  modal.innerHTML = `<h2>📍 場所を友だちに送る</h2>
    <div class="form-hint" style="margin-bottom:12px;">相手の共有コードを入力して送信します</div>
    <div class="form-group"><label>送信する場所</label>
      <div style="padding:10px 14px;background:var(--accent-light);border-radius:12px;font-weight:600;">${esc(item.title || '無題')}</div>
    </div>
    <div class="form-group"><label>相手の共有コード</label>
      <input id="shareReqCode" placeholder="6桁の共有コード" maxlength="6" style="text-transform:uppercase;">
    </div>
    <div class="form-btns">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="doSendShareRequest('${itemId}','place')">送信</button>
    </div>`;
  openModal();
}

// ===== Feature 4: 紹介ポイント (Supabase) =====
async function updateReferralPoints(referrerId) {
  // referrerId is the referral ID string (awai_xxxxx)
  // We need to find the user who has this referral ID
  // Since referral IDs are local, we store the mapping in user_profiles or handle via the ref param
  // For now, we record the referral and try to increment points
  if (!_sbUser) return;
  try {
    // First, get current points for the current user as referrer (by ref ID match)
    // The referrer's user_id can be looked up if they synced their referral_id
    // Simplified approach: we record it and let the referrer sync on their end
    localStorage.setItem('awai_referred_by', referrerId);
  } catch(e) { console.error('updateReferralPoints error:', e); }
}

async function syncReferralPoints() {
  if (!_sbUser) return;
  try {
    const localCount = parseInt(localStorage.getItem(REFERRAL_COUNT_KEY) || '0');
    const { data: row, error } = await _sb.from('referral_points').select('points, referral_count').eq('user_id', _sbUser.id).single();
    if (error && error.code !== 'PGRST116') return;
    if (row) {
      // Use the larger count
      const cloudCount = row.referral_count || 0;
      if (localCount > cloudCount) {
        await _sb.from('referral_points').update({
          referral_count: localCount,
          points: localCount * 5
        }).eq('user_id', _sbUser.id);
      } else if (cloudCount > localCount) {
        localStorage.setItem(REFERRAL_COUNT_KEY, cloudCount.toString());
      }
    } else if (localCount > 0) {
      await _sb.from('referral_points').insert({
        user_id: _sbUser.id,
        referral_count: localCount,
        points: localCount * 5
      });
    } else {
      await _sb.from('referral_points').insert({
        user_id: _sbUser.id,
        referral_count: 0,
        points: 0
      });
    }
  } catch(e) { console.error('syncReferralPoints error:', e); }
}

async function getReferralPoints() {
  if (!_sbUser) return { points: 0, referral_count: parseInt(localStorage.getItem(REFERRAL_COUNT_KEY) || '0') };
  try {
    const { data: row, error } = await _sb.from('referral_points').select('points, referral_count').eq('user_id', _sbUser.id).single();
    if (error || !row) return { points: 0, referral_count: parseInt(localStorage.getItem(REFERRAL_COUNT_KEY) || '0') };
    return { points: row.points || 0, referral_count: row.referral_count || 0 };
  } catch(e) { return { points: 0, referral_count: parseInt(localStorage.getItem(REFERRAL_COUNT_KEY) || '0') }; }
}

// ===== My Profile =====
const MY_PROFILE_KEY = 'awai_my_profile';
function getMyProfile() { try { return JSON.parse(localStorage.getItem(MY_PROFILE_KEY))||{}; } catch(e) { return {}; } }

function openMyProfile() {
  const modal = document.getElementById('modal');
  const p = getMyProfile();
  const sz = p.sizes||{};
  const anns = p.anniversaries||[{name:'🎂 誕生日',date:'',dateType:'monthday',reminders:[]}];

  let html = `<h2>👤 マイプロフィール</h2>`;
  html += `<div class="form-group"><label>名前</label><input id="myName" placeholder="自分の名前" value="${esc(p.name||'')}"></div>`;
  // Gender
  html += `<div class="form-group"><label>性別</label>
    <div style="display:flex;gap:6px;margin-top:4px;">
      ${['male','female','other','unset'].map(g => {
        const labels = {male:'男性',female:'女性',other:'その他',unset:'未設定'};
        const active = (p.gender||'unset')===g;
        return `<div class="date-type-chip ${active?'active':''}" onclick="selectMyGender('${g}',this)" style="flex:1;text-align:center;">${labels[g]}</div>`;
      }).join('')}
    </div><input type="hidden" id="myGender" value="${p.gender||'unset'}">
  </div>`;
  // Anniversaries (reuse annRowHTML with offset index to avoid ID collision)
  html += `<div class="form-group"><label>📅 記念日</label><div id="myAnnContainer">`;
  anns.forEach((a,i) => { html += annRowHTML(a, 500+i); });
  html += `</div><div class="add-btn" onclick="addMyAnnRow()">＋ 記念日を追加</div></div>`;
  // Sizes
  html += `<div class="form-group"><label>📏 サイズ</label><div class="profile-form-grid">
    <input id="mySizeTops" placeholder="服トップス" value="${esc(sz.tops||'')}">
    <input id="mySizeBottoms" placeholder="服ボトムス" value="${esc(sz.bottoms||'')}">
    <input id="mySizeShoes" placeholder="靴サイズ" value="${esc(sz.shoes||'')}">
    <input id="mySizeRing" placeholder="指輪サイズ" value="${esc(sz.ring||'')}">
  </div></div>`;
  // Smoking/Drinking
  html += `<div class="form-group"><label>🚬 嗜好品</label><div class="form-row">
    <input id="mySmoking" placeholder="タバコ（銘柄）" value="${esc(p.smoking||'')}">
    <input id="myDrinking" placeholder="お酒（種類）" value="${esc(p.drinking||'')}">
  </div></div>`;
  // Interests
  html += `<div class="form-group"><label>💖 好きなもの・趣味</label><input id="myInterests" placeholder="例：音楽, ゴルフ, ワイン" value="${(p.interests||[]).join(', ')}"></div>`;
  // Brands
  html += `<div class="form-group"><label>🎨 好きなブランド・色</label><input id="myBrands" placeholder="例：ZARA, 無印, ベージュ系" value="${(p.brands||[]).join(', ')}"></div>`;
  // Food
  html += `<div class="form-group"><label>🍽 食の好み</label>
    <input id="myFoodLike" placeholder="☺ 好きなもの（カンマ区切り）" value="${(p.foodLike||[]).join(', ')}" style="margin-bottom:6px;">
    <input id="myFoodDislike" placeholder="✗ 苦手なもの（カンマ区切り）" value="${(p.foodDislike||[]).join(', ')}">
  </div>`;
  // Memo
  html += `<div class="form-group"><label>📝 メモ</label><textarea id="myMemo" placeholder="自由にメモ">${esc(p.memo||'')}</textarea></div>`;

  html += `<div class="form-group" style="text-align:center;padding-top:8px;">
    <button class="card-btn" onclick="event.stopPropagation();openProfileShareScreen()" style="font-size:14px;padding:10px 24px;background:var(--accent-light);border-color:var(--accent);">🤍 プロフィールをQRで共有</button>
  </div>`;
  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="saveMyProfile()">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

let myAnnCounter = 500;
function addMyAnnRow() {
  myAnnCounter++;
  const c = document.getElementById('myAnnContainer');
  c.insertAdjacentHTML('beforeend', annRowHTML({name:'',date:'',dateType:'monthday',reminders:[]}, myAnnCounter));
}

function selectMyGender(g, el) {
  document.getElementById('myGender').value = g;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function saveMyProfile() {
  const annRows = document.getElementById('myAnnContainer').querySelectorAll('.ann-row');
  const anniversaries = [];
  annRows.forEach(row => {
    const name = row.querySelector('.ann-name').value.trim();
    const dateTypeChips = row.querySelectorAll('.date-type-chips')[0];
    const activeChip = dateTypeChips?.querySelector('.date-type-chip.active');
    const dateType = activeChip ? (activeChip.textContent.includes('年月日')?'full':activeChip.textContent.includes('月日')?'monthday':'month') : 'monthday';
    const year = row.querySelector('.ann-year')?.value||'';
    const month = row.querySelector('.ann-month')?.value||'';
    const day = row.querySelector('.ann-day')?.value||'';
    let date = '';
    if (dateType==='full' && year && month) date = `${year}-${String(month).padStart(2,'0')}-${String(day||1).padStart(2,'0')}`;
    else if (dateType==='monthday' && month) date = `${String(month).padStart(2,'0')}-${String(day||1).padStart(2,'0')}`;
    else if (dateType==='month' && month) date = `${String(month).padStart(2,'0')}`;
    const repeat = row.querySelector('.ann-repeat')?.value||'yearly';
    const reminders = row.querySelector('.ann-reminders').value.split(/[,、\s]+/).map(Number).filter(n=>!isNaN(n));
    if (name||date) anniversaries.push({name:name||'記念日',date,dateType,repeat,reminders});
  });

  const profile = {
    name: document.getElementById('myName').value.trim()||null,
    gender: document.getElementById('myGender').value||'unset',
    anniversaries,
    sizes: {
      tops: document.getElementById('mySizeTops').value.trim()||null,
      bottoms: document.getElementById('mySizeBottoms').value.trim()||null,
      shoes: document.getElementById('mySizeShoes').value.trim()||null,
      ring: document.getElementById('mySizeRing').value.trim()||null,
    },
    smoking: document.getElementById('mySmoking').value.trim()||null,
    drinking: document.getElementById('myDrinking').value.trim()||null,
    interests: parseTags(document.getElementById('myInterests').value),
    brands: parseTags(document.getElementById('myBrands').value),
    foodLike: parseTags(document.getElementById('myFoodLike').value),
    foodDislike: parseTags(document.getElementById('myFoodDislike').value),
    memo: document.getElementById('myMemo').value.trim()||null,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(MY_PROFILE_KEY, JSON.stringify(profile));
  sbSave();
  closeModal();
  showToast('プロフィールを保存しました ✓');
}

// ===== QR Profile Exchange =====
function openProfileShareScreen() {
  const p = getMyProfile();
  if (!p.name) { alert('先にマイプロフィールの名前を保存してください'); return; }
  closeModal();
  const modal = document.getElementById('modal');
  const sz = p.sizes||{};
  const hasSizes = sz.tops||sz.bottoms||sz.shoes||sz.ring;

  let html = `<h2>🤍 プロフィール共有</h2>`;
  html += `<p style="font-size:13px;color:var(--sub);text-align:center;margin-bottom:16px;">共有する情報を選んでください</p>`;
  html += `<div style="padding:0 4px;">`;
  html += `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);"><input type="checkbox" id="qsName" checked disabled><span>名前（${esc(p.name)}）</span><span style="font-size:11px;color:var(--sub);margin-left:auto;">必須</span></label>`;

  const birthday = (p.anniversaries||[]).find(a=>a.name&&a.name.includes('誕生日'));
  if (birthday?.date) {
    html += `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);"><input type="checkbox" id="qsBirthday" checked><span>誕生日（${birthday.date}）</span></label>`;
  }
  if (p.interests?.length) {
    html += `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);"><input type="checkbox" id="qsInterests" checked><span>好きなもの（${p.interests.join(', ')}）</span></label>`;
  }
  if (p.foodLike?.length || p.foodDislike?.length) {
    html += `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);"><input type="checkbox" id="qsFood" checked><span>食の好み</span></label>`;
  }
  if (p.brands?.length) {
    html += `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);"><input type="checkbox" id="qsBrands"><span>ブランド（${p.brands.join(', ')}）</span></label>`;
  }
  if (hasSizes) {
    html += `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);"><input type="checkbox" id="qsSizes"><span>サイズ</span></label>`;
  }
  if (p.smoking || p.drinking) {
    html += `<label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);"><input type="checkbox" id="qsHabits"><span>嗜好品</span></label>`;
  }
  html += `</div>`;
  html += `<div style="text-align:center;margin-top:20px;">
    <button class="btn btn-primary" onclick="generateProfileQR()" style="padding:14px 32px;">QRコードを表示</button>
  </div>`;
  html += `<div id="profileQRResult" style="text-align:center;margin-top:16px;"></div>`;
  html += `<div class="form-btns" style="margin-top:16px;"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function generateProfileQR() {
  const p = getMyProfile();
  const shareData = { n: p.name };

  const birthday = (p.anniversaries||[]).find(a=>a.name&&a.name.includes('誕生日'));
  if (document.getElementById('qsBirthday')?.checked && birthday?.date) shareData.b = birthday.date;
  if (document.getElementById('qsInterests')?.checked && p.interests?.length) shareData.i = p.interests;
  if (document.getElementById('qsFood')?.checked) {
    if (p.foodLike?.length) shareData.fl = p.foodLike;
    if (p.foodDislike?.length) shareData.fd = p.foodDislike;
  }
  if (document.getElementById('qsBrands')?.checked && p.brands?.length) shareData.br = p.brands;
  if (document.getElementById('qsSizes')?.checked) {
    const sz = p.sizes||{};
    const sizes = {};
    if (sz.tops) sizes.t = sz.tops;
    if (sz.bottoms) sizes.bo = sz.bottoms;
    if (sz.shoes) sizes.s = sz.shoes;
    if (sz.ring) sizes.r = sz.ring;
    if (Object.keys(sizes).length) shareData.sz = sizes;
  }
  if (document.getElementById('qsHabits')?.checked) {
    if (p.smoking) shareData.sm = p.smoking;
    if (p.drinking) shareData.dr = p.drinking;
  }

  const json = JSON.stringify(shareData);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const url = 'https://awai.gift/?p=' + encodeURIComponent(encoded);
  const area = document.getElementById('profileQRResult');
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    area.innerHTML = qr.createSvgTag(4, 0);
    area.querySelector('svg').style.maxWidth = '200px';
    area.querySelector('svg').style.margin = '0 auto';
    area.querySelector('svg').style.display = 'block';
    area.innerHTML += `<div style="font-size:12px;color:var(--sub);margin-top:12px;">相手のスマホのカメラでQRコードを読み取ってもらうだけでOKです</div>`;
  } catch(e) {
    area.innerHTML = '<div style="color:#c97070;font-size:13px;">データが多すぎてQRに収まりません。共有項目を減らしてください。</div>';
  }
}

let _qrStream = null;
let _qrAnimFrame = null;

function openQRScanner() {
  const modal = document.getElementById('modal');
  let html = `<h2>📷 QR読み取り</h2>`;
  html += `<p style="font-size:13px;color:var(--sub);text-align:center;margin-bottom:16px;">相手のQRコードをカメラで読み取ります</p>`;
  html += `<div id="qrCameraArea" style="text-align:center;">
    <video id="qrVideo" playsinline style="width:100%;max-width:320px;border-radius:12px;background:#000;display:none;"></video>
    <canvas id="qrCanvas" style="display:none;"></canvas>
    <div id="qrCameraMsg" style="font-size:13px;color:var(--sub);margin-top:8px;"></div>
    <button class="btn btn-primary" id="qrStartBtn" onclick="startQRCamera()" style="padding:14px 32px;margin-top:8px;">📷 カメラを起動</button>
  </div>`;
  html += `<div style="text-align:center;margin-top:16px;">
    <div class="form-hint">カメラが使えない場合は画像を選択：</div>
    <input type="file" id="qrScanInput" accept="image/*" style="display:none;" onchange="processQRImage(this)">
    <button class="card-btn" onclick="document.getElementById('qrScanInput').click()" style="margin-top:6px;">📁 画像を選択</button>
  </div>`;
  html += `<div style="text-align:center;margin-top:12px;">
    <div class="form-hint">または、QRコードのデータを貼り付け：</div>
    <textarea id="qrManualInput" placeholder='QRコードの内容を貼り付け' style="margin-top:8px;width:100%;height:60px;font-size:13px;"></textarea>
    <button class="card-btn" onclick="processQRManual()" style="margin-top:8px;">読み込む</button>
  </div>`;
  html += `<div id="qrScanResult" style="margin-top:16px;"></div>`;
  html += `<div class="form-btns" style="margin-top:16px;"><button class="btn btn-secondary" onclick="stopQRCamera();closeModal()">閉じる</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function startQRCamera() {
  const video = document.getElementById('qrVideo');
  const msg = document.getElementById('qrCameraMsg');
  const btn = document.getElementById('qrStartBtn');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg.innerHTML = 'このブラウザではカメラを利用できません。<br>画像選択または貼り付けをお使いください。';
    return;
  }
  btn.style.display = 'none';
  msg.textContent = 'カメラを起動中...';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      _qrStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      video.play();
      msg.textContent = 'QRコードをカメラに映してください';
      scanQRFromVideo();
    })
    .catch(err => {
      btn.style.display = '';
      msg.innerHTML = 'カメラへのアクセスが拒否されました。<br>画像選択または貼り付けをお使いください。';
    });
}

function scanQRFromVideo() {
  const video = document.getElementById('qrVideo');
  const canvas = document.getElementById('qrCanvas');
  if (!video || !canvas || video.readyState < 2) {
    _qrAnimFrame = requestAnimationFrame(scanQRFromVideo);
    return;
  }
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
  if (code && code.data) {
    stopQRCamera();
    handleQRData(code.data);
    return;
  }
  _qrAnimFrame = requestAnimationFrame(scanQRFromVideo);
}

function stopQRCamera() {
  if (_qrAnimFrame) { cancelAnimationFrame(_qrAnimFrame); _qrAnimFrame = null; }
  if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  const video = document.getElementById('qrVideo');
  if (video) { video.srcObject = null; video.style.display = 'none'; }
}

function processQRImage(input) {
  if (!input.files||!input.files[0]) return;
  const file = input.files[0];
  const area = document.getElementById('qrScanResult');
  const img = new Image();
  img.onload = function() {
    try {
      const maxDim = 1200;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale); h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { area.innerHTML = '<div style="font-size:13px;color:#c97070;text-align:center;">画像の処理に失敗しました。貼り付けをお試しください。</div>'; return; }
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        handleQRData(code.data);
      } else {
        area.innerHTML = '<div style="font-size:13px;color:#c97070;text-align:center;">QRコードを検出できませんでした。<br>もう一度撮影するか、貼り付けをお試しください。</div>';
      }
    } catch(e) {
      area.innerHTML = '<div style="font-size:13px;color:#c97070;text-align:center;">画像の処理に失敗しました。貼り付けをお試しください。</div>';
    }
    URL.revokeObjectURL(img.src);
  };
  img.onerror = function() {
    area.innerHTML = '<div style="font-size:13px;color:#c97070;text-align:center;">画像を読み込めませんでした。</div>';
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
}

function handleQRData(raw) {
  try {
    // UTF-8エンコードされたデータをデコード試行
    let decoded = raw;
    try { decoded = decodeURIComponent(escape(raw)); } catch(e) {}
    const d = JSON.parse(decoded);
    if (!d.n) { alert('AWAIのプロフィールデータではありません'); return; }
    showQRRegistration(d);
  } catch(e) {
    alert('AWAIのプロフィールデータではありません');
  }
}

function processQRManual() {
  const raw = document.getElementById('qrManualInput')?.value.trim();
  if (!raw) return;
  handleQRData(raw);
}

function showQRRegistration(d, useModal) {
  let info = `<div style="font-size:15px;font-weight:600;margin-bottom:8px;">${esc(d.n)} さんの情報を受け取りました</div>`;
  if (d.b) info += `<div style="font-size:13px;color:var(--sub);">誕生日：${d.b}</div>`;
  if (d.i) info += `<div style="font-size:13px;color:var(--sub);">好きなもの：${d.i.join(', ')}</div>`;
  if (d.fl) info += `<div style="font-size:13px;color:var(--sub);">好きな食べ物：${d.fl.join(', ')}</div>`;
  if (d.fd) info += `<div style="font-size:13px;color:var(--sub);">苦手な食べ物：${d.fd.join(', ')}</div>`;

  info += `<div style="margin-top:16px;"><label style="font-size:14px;font-weight:600;">あなたはこの人を何と呼びますか？</label>
    <input id="qrNickname" placeholder="${esc(d.n)}" style="width:100%;margin-top:8px;padding:12px;border:1px solid var(--border);border-radius:12px;font-size:15px;">
    </div>`;
  info += `<div style="text-align:center;margin-top:16px;">
    <button class="btn btn-primary" onclick="registerFromQR()" style="padding:14px 32px;">登録する</button>
  </div>`;

  if (useModal) {
    const modal = document.getElementById('modal');
    modal.innerHTML = `<h2>🤍 プロフィール受信</h2>${info}<div class="form-btns" style="margin-top:16px;"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>`;
    modal._qrData = d;
    openModal();
  } else {
    const area = document.getElementById('qrScanResult');
    area.innerHTML = info;
    area._qrData = d;
  }
}

function checkRefParam() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (!ref) return;
  // 自分の紹介IDなら無視
  if (ref === localStorage.getItem(REFERRAL_ID_KEY)) return;
  // 既に紹介済みなら無視
  if (localStorage.getItem('awai_referred_by')) return;
  // 紹介元を記録
  localStorage.setItem('awai_referred_by', ref);
  window.history.replaceState({}, '', window.location.pathname);
  // 紹介元にポイントを加算（Supabaseで）
  creditReferrer(ref);
}

async function creditReferrer(refId) {
  try {
    // referral_idからuser_profilesでuser_idを探す
    const { data: rows, error } = await _sb.from('user_profiles').select('user_id').eq('referral_id', refId).limit(1);
    if (error || !rows || !rows.length) {
      // user_profilesにreferral_idがない場合、referral_pointsテーブルで直接refIdを検索
      // 初回は見つからない可能性がある。紹介元がログインした時にsyncで拾う
      return;
    }
    const referrerUserId = rows[0].user_id;
    // referral_pointsをインクリメント
    const { data: rp, error: rpErr } = await _sb.from('referral_points').select('referral_count, points').eq('user_id', referrerUserId).single();
    if (rpErr && rpErr.code !== 'PGRST116') return;
    if (rp) {
      await _sb.from('referral_points').update({
        referral_count: (rp.referral_count || 0) + 1,
        points: ((rp.referral_count || 0) + 1) * 5
      }).eq('user_id', referrerUserId);
    } else {
      await _sb.from('referral_points').insert({
        user_id: referrerUserId,
        referral_count: 1,
        points: 5
      });
    }
  } catch(e) { console.error('creditReferrer error:', e); }
}

function checkProfileParam() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) checkRefParam(); // refパラメータがあれば紹介処理
  const p = params.get('p');
  if (!p) return;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(p))));
    const d = JSON.parse(json);
    if (!d.n) return;
    // URLパラメータをクリア（履歴を汚さない）
    window.history.replaceState({}, '', window.location.pathname);
    setTimeout(() => showQRRegistration(d, true), 500);
  } catch(e) {}
}

function registerFromQR() {
  const area = document.getElementById('qrScanResult');
  const modal = document.getElementById('modal');
  const d = area?._qrData || modal?._qrData;
  if (!d) return;
  const nickname = document.getElementById('qrNickname').value.trim();
  if (!nickname) { alert('呼び名を入力してください'); return; }

  const person = {
    id: genId(), nickname, type: 'individual', gender: 'unset',
    avatar: null, fullName: d.n !== nickname ? d.n : null,
    relation: null, companyLink: null, position: null,
    anniversaries: [], sizes: {},
    smoking: d.sm||null, drinking: d.dr||null,
    interests: d.i||[], brands: d.br||[],
    foodLike: d.fl||[], foodDislike: d.fd||[],
    personality: [], family: [], oshi: [],
    corpPhoto: null, memo: null
  };

  if (d.b) {
    const parts = d.b.split('-').map(Number);
    person.anniversaries = [{
      name: '🎂 誕生日',
      date: d.b,
      dateType: parts.length >= 3 ? 'full' : 'monthday',
      repeat: 'yearly',
      reminders: [30]
    }];
  }

  if (d.sz) {
    person.sizes = {
      tops: d.sz.t||null, bottoms: d.sz.bo||null,
      shoes: d.sz.s||null, ring: d.sz.r||null
    };
  }

  data.people.push(person);
  saveData();
  closeModal();
  currentTab = 'people';
  currentLabel = null;
  render();
  showToast(nickname + 'さんを登録しました ✓');
  checkCelebrationOnSave(person.anniversaries);
}

// ===== Help Popups =====
const HELP_TEXTS = {
  nickname: {
    title: '呼び名',
    desc: '自分がその人をどう呼んでいるかを入力します。',
    examples: ['さとうさん', 'みーちゃん', '部長', 'パパ'],
    tip: 'ニックネームでも敬称でも、自分が一番しっくりくる呼び方で。LINEの登録名より、自分が心の中で呼んでいる名前の方が思い出しやすいです。'
  },
  fullName: {
    title: '本名',
    desc: 'フルネームを入力します。任意です。',
    examples: ['佐藤 太郎', '田中 花子'],
    tip: '呼び名とは別に本名を記録しておくと、お中元・お歳暮の送り状や年賀状を書く時に便利です。'
  },
  relation: {
    title: '関係',
    desc: 'その人との関係を入力します。',
    examples: ['友人', '同僚', '取引先', '家族', '幼なじみ', 'ゴルフ仲間', 'ラウンジのお客さん'],
    tip: '仕事関係の人も、プライベートの友人も、全部ここで管理できます。'
  },
  anniversary: {
    title: '記念日',
    desc: '誕生日・結婚記念日・出会った日など、大切な日を登録します。',
    examples: ['🎂 誕生日', '💍 結婚記念日', '🤝 出会った日', '🎓 卒業記念日'],
    tip: '記念日を登録しておくと、近づいた時にAWAIがそっと教えてくれます。「あの人の誕生日、いつだっけ？」がなくなります。'
  },
  sizes: {
    title: 'サイズ',
    desc: '服・靴・指輪のサイズを記録します。',
    examples: ['服トップス：M', '靴：25.5cm', '指輪：9号'],
    tip: 'プレゼントを贈る時に「サイズ何だっけ？」と聞かずに済みます。さりげなく聞いた時にメモしておくと、いざという時に役立ちます。'
  },
  smoking: {
    title: '嗜好品',
    desc: 'タバコの銘柄やお酒の好みを記録します。',
    examples: ['タバコ：アイコス テリア', 'お酒：日本酒（辛口）', 'ワイン好き（赤）'],
    tip: '接待や食事会の手配、お中元・お歳暮の選択に直結します。「あの人、何飲む人だっけ？」がなくなります。'
  },
  interests: {
    title: '好きなもの・趣味',
    desc: 'その人の趣味や興味があることを記録します。カンマ区切りで複数登録できます。',
    examples: ['ゴルフ', '料理', 'ワイン', '旅行', 'K-POP', '釣り'],
    tip: 'ここに登録した情報は、お気に入りのタグと自動でマッチングされます。「この商品、あの人が喜びそう」とAWAIが教えてくれます。'
  },
  brands: {
    title: 'ブランド・色',
    desc: '好きなブランドや好みの色を記録します。',
    examples: ['ZARA', '無印良品', 'ベージュ系', '北欧デザイン'],
    tip: 'プレゼント選びの時に「この人の好みは？」がすぐわかります。'
  },
  oshi: {
    title: '推し活',
    desc: '推しのアーティスト・キャラクター・スポーツチーム等を記録します。',
    examples: ['Snow Man', '鬼滅の刃', '阪神タイガース', 'BTS'],
    tip: '推しのグッズやコンサートチケットはプレゼントの鉄板。知っているだけで「わかってる！」と思ってもらえます。'
  },
  food: {
    title: '食の好み',
    desc: '好きな食べ物と苦手な食べ物を記録します。',
    examples: ['好き：寿司, カレー, チョコ', '苦手：パクチー, 辛いもの, 生牡蠣'],
    tip: '食事に誘う時、お土産を選ぶ時、ギフトを贈る時。苦手なものを贈ってしまう失敗がなくなります。AIコンシェルジュも苦手を除外して提案します。'
  },
  family: {
    title: '家族構成',
    desc: 'その人の家族の名前と続柄を記録します。',
    examples: ['奥さん：花子', '長男：太郎（高校生）', '愛犬：ポチ'],
    tip: '家族の話ができると距離が一気に縮まります。「お子さん、もう高校生でしたよね」の一言が信頼になります。'
  },
  personality: {
    title: '個性',
    desc: 'その人の性格や特徴を記録します。',
    examples: ['気配り上手', '豪快', 'サプライズ好き', '照れ屋'],
    tip: 'AIコンシェルジュがギフト提案する時に参考にします。豪快な人には体験ギフト、繊細な人には丁寧な手仕事の品。'
  },
  memo: {
    title: 'メモ',
    desc: '何でも自由に書けるスペースです。検索にもヒットします。',
    examples: ['前回会った時にイタリア旅行の話をしていた', '犬アレルギーあり', '左利き'],
    tip: '会話の中で聞いた些細なことをメモしておくと、次に会った時に「覚えてくれてたんだ」と喜ばれます。AWAIの検索でも引っかかるので、あとで見つけやすいです。'
  },
  counter: {
    title: 'カウンター',
    desc: '友だちとの記録を数えます。名前は自由に決められます。',
    examples: ['一緒に食事した', '会った', '電話した', '旅行に行った'],
    tip: '2人だけが意味を知っているものを数える。50回目が自動で新しい記念日になります。ボタンを押すだけ。日付も自動で記録されます。'
  },
  itemTitle: {
    title: 'タイトル',
    desc: 'お気に入りの名前を入力します。',
    examples: ['ヴィンテージのワイングラス', '松阪牛のカタログギフト', '名入れ万年筆'],
    tip: '気になった商品をとりあえず登録しておくだけでOK。後から写真やURLを追加できます。'
  },
  placeTitle: {
    title: '場所の名前',
    desc: '行きたい場所やお店の名前を入力します。',
    examples: ['京都の古い喫茶店', 'あの人が好きだった寿司屋', '来月オープンのイタリアン'],
    tip: '誰かと「今度あそこ行こう」と言った場所を忘れないうちに。「誰と行きたい」を設定すると、その人のカードからもこの場所が見えます。'
  }
};

function showHelp(key) {
  const h = HELP_TEXTS[key];
  if (!h) return;
  const overlay = document.createElement('div');
  overlay.className = 'help-popup';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div class="help-popup-inner">
    <h3>❓ ${h.title}</h3>
    <p>${h.desc}</p>
    ${h.examples.length?`<div class="help-example"><strong>例：</strong><br>${h.examples.join('　/　')}</div>`:''}
    ${h.tip?`<p style="margin-top:10px;">💡 ${h.tip}</p>`:''}
    <div style="text-align:center;margin-top:14px;"><button onclick="this.closest('.help-popup').remove()" style="background:none;border:1px solid var(--border);border-radius:10px;padding:8px 24px;font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">閉じる</button></div>
  </div>`;
  document.body.appendChild(overlay);
}

function helpBtn(key) {
  return `<span class="help-btn" onclick="event.stopPropagation();showHelp('${key}')">？</span>`;
}

// ===== Counters =====
function toggleHidden(personId) {
  const p = data.people.find(x=>x.id===personId);
  if (!p) return;
  p.hidden = !p.hidden;
  saveData();
  openPersonId = null;
  render();
  showToast(p.hidden ? '非表示にしました' : '表示に戻しました');
}

function toggleItemHidden(tab, id) {
  const arr = tab==='groups' ? data.groups : data[tab];
  const item = arr?.find(x=>x.id===id);
  if (!item) return;
  item.hidden = !item.hidden;
  saveData(); render();
  showToast(item.hidden ? '非表示にしました' : '表示に戻しました');
}

function toggleAnnReminder(personId, annIdx, checked) {
  const p = data.people.find(x=>x.id===personId);
  if (!p || !p.anniversaries || !p.anniversaries[annIdx]) return;
  if (checked) {
    p.anniversaries[annIdx].reminders = [30];
  } else {
    p.anniversaries[annIdx].reminders = [];
  }
  saveData();
  render();
  if (openPersonId) setTimeout(() => {
    const detail = document.getElementById('personDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function toggleCounterSection(personId) {
  const body = document.getElementById('counterBody_' + personId);
  const toggle = document.getElementById('counterToggle_' + personId);
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = '';
    if (toggle) toggle.textContent = '▼';
  } else {
    body.style.display = 'none';
    if (toggle) toggle.textContent = '▶';
  }
}

function addCounter(personId, name) {
  const p = data.people.find(x=>x.id===personId);
  if (!p) return;
  if (!p.counters) p.counters = [];
  if (p.counters.some(c=>c.name===name)) return;
  p.counters.push({ name, count: 0, logs: [] });
  saveData(); render();
  if (openPersonId) setTimeout(() => {
    const detail = document.getElementById('personDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function promptAddCounter(personId) {
  const name = prompt('カウンター名を入力してください\n例：一緒に旅行した、電話した、ライブ行った');
  if (!name || !name.trim()) return;
  addCounter(personId, name.trim());
}

function incrementCounter(personId, counterIdx) {
  const p = data.people.find(x=>x.id===personId);
  if (!p || !p.counters || !p.counters[counterIdx]) return;
  const c = p.counters[counterIdx];
  const today = toLocalDateStr();

  // Show confirmation with date change option
  const overlay = document.createElement('div');
  overlay.id = 'counterConfirmOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:400;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s;';
  overlay.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:85%;max-width:320px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
    <div style="font-size:16px;font-weight:600;margin-bottom:8px;">${esc(c.name)}</div>
    <div style="font-size:28px;font-weight:700;color:var(--accent);margin-bottom:4px;">${(c.count||0)+1}回目</div>
    <div style="font-size:14px;color:var(--sub);margin-bottom:16px;">日付：<span id="counterDateDisplay">${today}</span></div>
    <input type="date" id="counterDateInput" value="${today}" style="display:none;width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:15px;margin-bottom:12px;font-family:'Zen Maru Gothic',sans-serif;">
    <div style="display:flex;gap:8px;justify-content:center;">
      <button onclick="document.getElementById('counterDateInput').style.display='';this.style.display='none';" style="background:none;border:1px solid var(--border);border-radius:10px;padding:8px 16px;font-size:13px;cursor:pointer;color:var(--sub);font-family:'Zen Maru Gothic',sans-serif;">日付を変更</button>
      <button onclick="confirmIncrement('${personId}',${counterIdx})" style="background:var(--accent);border:none;border-radius:10px;padding:8px 20px;font-size:14px;cursor:pointer;color:#fff;font-family:'Zen Maru Gothic',sans-serif;">OK</button>
    </div>
    <div style="margin-top:12px;"><span onclick="document.getElementById('counterConfirmOverlay').remove()" style="font-size:13px;color:var(--sub);cursor:pointer;">キャンセル</span></div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function confirmIncrement(personId, counterIdx) {
  const p = data.people.find(x=>x.id===personId);
  if (!p || !p.counters || !p.counters[counterIdx]) return;
  const c = p.counters[counterIdx];
  const dateInput = document.getElementById('counterDateInput');
  const date = dateInput ? dateInput.value : toLocalDateStr();
  c.count = (c.count||0) + 1;
  if (!c.logs) c.logs = [];
  c.logs.unshift(date);

  // Check milestones (50, 100, 150, ...)
  if (c.count % 50 === 0) {
    showToast('🎉 ' + c.name + ' ' + c.count + '回達成！');
  }

  document.getElementById('counterConfirmOverlay')?.remove();
  saveData(); render();
  if (openPersonId) setTimeout(() => {
    const detail = document.getElementById('personDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function removeCounter(personId, counterIdx) {
  if (!confirm('このカウンターを削除しますか？')) return;
  const p = data.people.find(x=>x.id===personId);
  if (!p || !p.counters) return;
  p.counters.splice(counterIdx, 1);
  saveData(); render();
}

function toggleCounterLog(personId, counterIdx) {
  const el = document.getElementById('counterLog_' + personId + '_' + counterIdx);
  if (!el) return;
  if (el.style.display === 'none') {
    const p = data.people.find(x=>x.id===personId);
    if (!p || !p.counters || !p.counters[counterIdx]) return;
    const logs = p.counters[counterIdx].logs || [];
    if (!logs.length) { el.innerHTML = '<span style="color:var(--sub);">まだ記録がありません</span>'; }
    else { el.innerHTML = logs.slice(0, 20).map(d => '<span style="display:inline-block;padding:2px 8px;margin:2px;background:var(--accent-light);border-radius:8px;">' + d + '</span>').join(''); }
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

// ===== Memory (記憶) =====
function moveToMemory(id) {
  if (!confirm('この人を記憶に移しますか？\n記録やリンクはそのまま残ります。')) return;
  const p = data.people.find(x=>x.id===id);
  if (!p) return;
  p.isMemory = true;
  p.memoryType = p.memoryType || 'person';
  p.reminderMode = p.reminderMode || 'none';
  saveData();
  openPersonId = null;
  currentLabel = 'memory';
  render();
  showToast('🤍 記憶に移しました');
}

function restoreFromMemory(id) {
  if (!confirm('この人を友だちに戻しますか？')) return;
  const p = data.people.find(x=>x.id===id);
  if (!p) return;
  p.isMemory = false;
  saveData();
  openPersonId = null;
  currentLabel = null;
  render();
  showToast('友だちに戻しました');
}

function closePlacePrompt(id) {
  if (!confirm('この場所を記憶に移しますか？\n記録やリンクはそのまま残ります。')) return;
  const item = data.place.find(x=>x.id===id);
  if (!item) return;
  item.isClosed = true;
  saveData();
  currentLabel = 'closed';
  render();
  showToast('🤍 記憶に移しました');
}

function reopenPlace(id) {
  if (!confirm('この場所を行きたい場所に戻しますか？')) return;
  const item = data.place.find(x=>x.id===id);
  if (!item) return;
  item.isClosed = false;
  saveData();
  currentLabel = null;
  render();
  showToast('行きたい場所に戻しました');
}

// ===== Memory (記憶) Modal =====
function openMemoryModal(id) {
  editingId = id||null;
  const modal = document.getElementById('modal');
  const isEdit = !!editingId;
  const p = isEdit ? data.people.find(i=>i.id===editingId) : null;

  let html = `<h2>🤍 記憶を${isEdit?'編集':'追加'}</h2>`;

  // Type: person or pet
  const memType = p?.memoryType||'person';
  html += `<div class="form-group"><label>種別</label>
    <div style="display:flex;gap:6px;margin-top:4px;">
      <div class="date-type-chip ${memType==='person'?'active':''}" onclick="selectMemoryType('person',this)" style="flex:1;text-align:center;">👤 友だち</div>
      <div class="date-type-chip ${memType==='pet'?'active':''}" onclick="selectMemoryType('pet',this)" style="flex:1;text-align:center;">🐾 ペット</div>
    </div><input type="hidden" id="mMemoryType" value="${memType}">
  </div>`;

  // Avatar
  html += `<div class="form-group" style="text-align:center;">
    <div id="pAvatarPreview" style="width:72px;height:72px;border-radius:50%;background:var(--accent-light);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:32px;overflow:hidden;cursor:pointer;" onclick="document.getElementById('pAvatarFile').click()">
      ${p?.avatar ? `<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover;">` : '🤍'}
    </div>
    <input type="file" id="pAvatarCamera" accept="image/*" capture="environment" style="display:none;" onchange="previewAvatar(this)">
    <input type="file" id="pAvatarFile" accept="image/*" style="display:none;" onchange="previewAvatar(this)">
    <input type="hidden" id="pAvatarRemove" value="">
    <div style="display:flex;gap:8px;justify-content:center;">
      <div style="font-size:12px;color:var(--accent);cursor:pointer;padding:4px 12px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('pAvatarCamera').click()">📷 カメラ</div>
      <div style="font-size:12px;color:var(--accent);cursor:pointer;padding:4px 12px;border:1px solid var(--border);border-radius:10px;" onclick="document.getElementById('pAvatarFile').click()">📁 ファイル</div>
      ${p?.avatar ? `<div style="font-size:12px;color:#c97070;cursor:pointer;padding:4px 12px;border:1px solid #c97070;border-radius:10px;" onclick="removeAvatar(event)">✕ 削除</div>` : ''}
    </div>
  </div>`;

  // Name
  html += `<div class="form-group"><label>呼び名 <span style="color:#c97070;font-size:11px;">* 必須</span></label><input id="mNickname" placeholder="例：さとうさん、みーちゃん" value="${esc(p?.nickname||'')}"></div>`;
  html += `<div class="form-group"><label>本名（任意）</label><input id="mFullName" placeholder="" value="${esc(p?.fullName||'')}"></div>`;

  // Memory date - same format as anniversaries (年月日/月日/月)
  const md = p?.memoryDate||'';
  const mdParts = md.split('-');
  const mdDateType = p?.memoryDateFormat||'monthday';
  let mdYear='', mdMonth='', mdDay='';
  if (mdDateType==='full' && mdParts.length>=3) { mdYear=mdParts[0]; mdMonth=parseInt(mdParts[1])||''; mdDay=parseInt(mdParts[2])||''; }
  else if (mdDateType==='monthday' && mdParts.length>=2) { mdMonth=parseInt(mdParts[mdParts.length-2])||''; mdDay=parseInt(mdParts[mdParts.length-1])||''; }
  else if (mdDateType==='month' && mdParts.length>=1) { mdMonth=parseInt(mdParts[0])||''; }

  const thisYear = new Date().getFullYear();
  let yearOpts = '<option value="">--</option>';
  for (let y=thisYear; y>=thisYear-100; y--) yearOpts += `<option value="${y}" ${mdYear==y?'selected':''}>${y}</option>`;

  html += `<div class="form-group"><label>🤍 記憶の日（任意）</label>
    <div class="form-hint" style="margin-bottom:6px;">命日・最後に会った日・大切な日など、自由に</div>
    <div style="display:flex;gap:4px;margin-bottom:8px;">
      <div class="date-type-chip ${mdDateType==='full'?'active':''}" onclick="selectMemDateFormat('full',this)" style="flex:1;text-align:center;font-size:12px;">年月日</div>
      <div class="date-type-chip ${mdDateType==='monthday'?'active':''}" onclick="selectMemDateFormat('monthday',this)" style="flex:1;text-align:center;font-size:12px;">月日</div>
      <div class="date-type-chip ${mdDateType==='month'?'active':''}" onclick="selectMemDateFormat('month',this)" style="flex:1;text-align:center;font-size:12px;">月のみ</div>
    </div><input type="hidden" id="mDateFormat" value="${mdDateType}">
    <div style="display:flex;gap:8px;">
      <select id="mDateYear" style="flex:1;display:${mdDateType==='full'?'':'none'};">${yearOpts}</select>
      <input id="mDateMonth" type="number" min="1" max="12" placeholder="月" value="${mdMonth}" style="flex:1;">
      <input id="mDateDay" type="number" min="1" max="31" placeholder="日" value="${mdDay}" style="flex:1;display:${mdDateType==='month'?'none':''};">
    </div>
  </div>`;

  // Date type: yearly or monthly
  const dateRepeat = p?.memoryDateType||'yearly';
  html += `<div class="form-group"><label>繰り返し</label>
    <div style="display:flex;gap:6px;margin-top:4px;">
      <div class="date-type-chip ${dateRepeat==='yearly'?'active':''}" onclick="selectMemDateType('yearly',this)" style="flex:1;text-align:center;">年1回</div>
      <div class="date-type-chip ${dateRepeat==='monthly'?'active':''}" onclick="selectMemDateType('monthly',this)" style="flex:1;text-align:center;">毎月</div>
    </div><input type="hidden" id="mDateType" value="${dateRepeat}">
  </div>`;

  // Reminder mode
  const remMode = p?.reminderMode||'none';
  const remDays = p?.reminderDays||7;
  html += `<div class="form-group"><label>通知</label>
    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">
      <div class="date-type-chip ${remMode==='custom'?'active':''}" onclick="selectRemMode('custom',this)" style="flex:1;text-align:center;font-size:12px;">自分で決める</div>
      <div class="date-type-chip ${remMode==='dayonly'?'active':''}" onclick="selectRemMode('dayonly',this)" style="flex:1;text-align:center;font-size:12px;">当日だけ</div>
      <div class="date-type-chip ${remMode==='none'?'active':''}" onclick="selectRemMode('none',this)" style="flex:1;text-align:center;font-size:12px;">しない</div>
    </div><input type="hidden" id="mRemMode" value="${remMode}">
    <div id="mRemDaysRow" style="display:${remMode==='custom'?'flex':'none'};gap:8px;align-items:center;margin-top:8px;">
      <input id="mRemDays" type="number" min="1" max="60" value="${remDays}" style="width:60px;text-align:center;">
      <span style="font-size:13px;color:var(--sub);">日前から通知</span>
    </div>
  </div>`;

  // Anniversaries (記念日を複数追加可能)
  const memAnns = p?.anniversaries||[];
  html += `<div class="form-group"><label>📅 大切な日</label><div id="memAnnContainer">`;
  if (memAnns.length) {
    memAnns.forEach((a,i) => { html += annRowHTML(a, 800+i); });
  } else {
    html += annRowHTML({name:'', date:'', dateType:'monthday', reminders:[]}, 800);
  }
  html += `</div><div class="add-btn" onclick="addMemAnnRow()">＋ 大切な日を追加</div></div>`;

  // Message
  html += `<div class="form-group"><label>ひとこと（任意）</label><input id="mMessage" placeholder="その人・その子への言葉" value="${esc(p?.memoryMessage||'')}"></div>`;

  // Memo with hint
  const petHint = 'メモ欄に種類・色・好きだったものなど覚えていることを書いておくと安心です';
  const personHint = '好きだったもの・口癖・思い出など';
  html += `<div class="form-group"><label>📝 メモ</label><textarea id="mMemo" placeholder="${memType==='pet'?petHint:personHint}">${esc(p?.memo||'')}</textarea></div>`;

  html += `<div class="form-btns"><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button><button class="btn btn-primary" onclick="saveMemory()">保存</button></div>`;
  modal.innerHTML = html;
  openModal();
}

function selectMemoryType(type, el) {
  document.getElementById('mMemoryType').value = type;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  // Update memo placeholder
  const memo = document.getElementById('mMemo');
  if (memo) memo.placeholder = type==='pet' ? 'メモ欄に種類・色・好きだったものなど覚えていることを書いておくと安心です' : '好きだったもの・口癖・思い出など';
}

let memAnnCounter = 800;
function addMemAnnRow() {
  memAnnCounter++;
  const c = document.getElementById('memAnnContainer');
  if (!c) return;
  c.insertAdjacentHTML('beforeend', annRowHTML({name:'',date:'',dateType:'monthday',reminders:[]}, memAnnCounter));
}

function selectMemDateFormat(fmt, el) {
  document.getElementById('mDateFormat').value = fmt;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('mDateYear').style.display = fmt==='full' ? '' : 'none';
  document.getElementById('mDateDay').style.display = fmt==='month' ? 'none' : '';
}

function selectMemDateType(type, el) {
  document.getElementById('mDateType').value = type;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
}

function selectRemMode(mode, el) {
  document.getElementById('mRemMode').value = mode;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  const daysRow = document.getElementById('mRemDaysRow');
  if (daysRow) daysRow.style.display = mode==='custom' ? 'flex' : 'none';
}

function saveMemory() {
  if (_saving) return;
  const nickname = document.getElementById('mNickname').value.trim();
  if (!nickname) { alert('名前を入力してください'); return; }

  const avatarRemoved = document.getElementById('pAvatarRemove')?.value === '1';
  const existingAvatar = editingId ? (data.people.find(x=>x.id===editingId)?.avatar||null) : null;
  let avatarData = avatarRemoved ? null : existingAvatar;
  if (!avatarRemoved) {
    const avatarImg = document.querySelector('#pAvatarPreview img');
    if (avatarImg && avatarImg.src.startsWith('data:')) avatarData = avatarImg.src;
  }

  const dateFormat = document.getElementById('mDateFormat').value;
  const year = document.getElementById('mDateYear')?.value||'';
  const month = document.getElementById('mDateMonth').value;
  const day = document.getElementById('mDateDay').value;
  let memoryDate = '';
  if (dateFormat==='full' && year && month) memoryDate = `${year}-${String(month).padStart(2,'0')}-${String(day||1).padStart(2,'0')}`;
  else if (dateFormat==='monthday' && month) memoryDate = `${String(month).padStart(2,'0')}-${String(day||1).padStart(2,'0')}`;
  else if (dateFormat==='month' && month) memoryDate = `${String(month).padStart(2,'0')}`;

  const remMode = document.getElementById('mRemMode').value;
  const person = {
    id: editingId || genId(),
    nickname,
    fullName: document.getElementById('mFullName').value.trim()||null,
    type: 'individual',
    isMemory: true,
    memoryType: document.getElementById('mMemoryType').value,
    memoryDate,
    memoryDateFormat: dateFormat,
    memoryDateType: document.getElementById('mDateType').value,
    memoryMessage: document.getElementById('mMessage').value.trim()||null,
    reminderMode: remMode,
    reminderDays: remMode==='custom' ? (parseInt(document.getElementById('mRemDays')?.value)||7) : 0,
    avatar: avatarData,
    gender: 'unset',
    relation: null, companyLink: null, position: null,
    anniversaries: [],
    sizes: {}, smoking: null, drinking: null,
    interests: [], brands: [], foodLike: [], foodDislike: [],
    personality: [], family: [], oshi: [], corpPhoto: null,
    memo: document.getElementById('mMemo').value.trim()||null
  };

  // Collect anniversaries from memAnnContainer
  const memAnnRows = document.getElementById('memAnnContainer')?.querySelectorAll('.ann-row')||[];
  const anniversaries = [];
  memAnnRows.forEach(row => {
    const name = row.querySelector('.ann-name').value.trim();
    const dateTypeChips = row.querySelectorAll('.date-type-chips')[0];
    const activeChip = dateTypeChips?.querySelector('.date-type-chip.active');
    const dt = activeChip ? (activeChip.textContent.includes('年月日')?'full':activeChip.textContent.includes('月日')?'monthday':'month') : 'monthday';
    const yr = row.querySelector('.ann-year')?.value||'';
    const mo = row.querySelector('.ann-month')?.value||'';
    const dy = row.querySelector('.ann-day')?.value||'';
    let date = '';
    if (dt==='full' && yr && mo) date = `${yr}-${String(mo).padStart(2,'0')}-${String(dy||1).padStart(2,'0')}`;
    else if (dt==='monthday' && mo) date = `${String(mo).padStart(2,'0')}-${String(dy||1).padStart(2,'0')}`;
    else if (dt==='month' && mo) date = `${String(mo).padStart(2,'0')}`;
    const repeat = row.querySelector('.ann-repeat')?.value||'yearly';
    const reminders = row.querySelector('.ann-reminders').value.split(/[,、\s]+/).map(Number).filter(n=>!isNaN(n));
    if (name||date) anniversaries.push({name:name||'大切な日',date,dateType:dt,repeat,reminders});
  });
  person.anniversaries = anniversaries;

  if (editingId) {
    const idx = data.people.findIndex(i=>i.id===editingId);
    if (idx>=0) {
      // Preserve existing fields not in this form
      const existing = data.people[idx];
      person.gender = existing.gender||'unset';
      person.relation = existing.relation||null;
      person.interests = existing.interests||[];
      person.brands = existing.brands||[];
      person.foodLike = existing.foodLike||[];
      person.foodDislike = existing.foodDislike||[];
      person.family = existing.family||[];
      person.sizes = existing.sizes||{};
      person.counters = existing.counters||[];
      person.pinned = existing.pinned;
      person.companyLink = existing.companyLink||null;
      data.people[idx] = person;
    }
  } else {
    data.people.push(person);
  }
  saveData(); closeModal(); render();
  showToast('保存しました ✓');
}

// ===== Onboarding =====
const OB_KEY = 'awai_onboarding_done';

// ===== Calendar =====
let _calYear, _calMonth;
function initCalDate() { const d=new Date(); _calYear=d.getFullYear(); _calMonth=d.getMonth(); }
initCalDate();

function renderCalendar(cardList) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const year = _calYear, month = _calMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  // Collect events for this month
  const events = {};
  // Anniversaries
  data.people.forEach(p => {
    (p.anniversaries||[]).forEach((a,ai) => {
      if (!a.date || a.calendarHidden) return;
      const parts = a.date.split('-').map(Number);
      let m,d;
      if (a.dateType==='full'&&parts.length>=3) { if(parts[1]-1!==month) return; m=parts[1]-1; d=parts[2]; }
      else if (parts.length>=2) { m=parts[parts.length-2]-1; d=parts[parts.length-1]; if(m!==month) return; }
      else return;
      const key = d;
      if (!events[key]) events[key]=[];
      events[key].push({type:'anniversary',emoji:(a.name||'').match(/[\p{Emoji}]/u)?.[0]||'📅',name:p.nickname,event:a.name,_personId:p.id,_annIdx:ai});
    });
  });
  // Gave/Received
  data.gave.forEach(item => {
    if (!item.date) return;
    const parts = item.date.split('-').map(Number);
    if (parts[0]===year && parts[1]-1===month) {
      const key=parts[2];
      if(!events[key])events[key]=[];
      events[key].push({type:'gave',emoji:'🎁',name:item.person||'',event:item.title});
    }
  });
  data.received.forEach(item => {
    if (!item.date) return;
    const parts = item.date.split('-').map(Number);
    if (parts[0]===year && parts[1]-1===month) {
      const key=parts[2];
      if(!events[key])events[key]=[];
      events[key].push({type:'received',emoji:'🎀',name:item.person||'',event:item.title});
    }
  });

  let html = '';
  // 手帳風ラッパー
  html += `<div style="background:var(--card);border-radius:20px;margin:8px 12px;padding:4px 0 16px;box-shadow:0 2px 12px var(--shadow);border-left:4px solid var(--accent);position:relative;overflow:hidden;">`;
  html += `<div style="position:absolute;top:0;right:0;width:30px;height:100%;background:linear-gradient(to left,rgba(0,0,0,0.02),transparent);pointer-events:none;"></div>`;
  // Month navigation
  html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 8px;">
    <button onclick="calPrev()" style="background:none;border:none;font-size:18px;cursor:pointer;padding:8px;color:var(--sub);">◀</button>
    <div style="font-family:'Shippori Mincho',serif;font-size:20px;font-weight:600;letter-spacing:2px;">${year}年 ${monthNames[month]}</div>
    <button onclick="calNext()" style="background:none;border:none;font-size:18px;cursor:pointer;padding:8px;color:var(--sub);">▶</button>
  </div>`;

  // Day headers
  const dayNames = ['日','月','火','水','木','金','土'];
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;padding:0 8px;margin-bottom:4px;">';
  dayNames.forEach((d,i) => {
    const color = i===0?'#c97070':i===6?'#7a9ad4':'var(--sub)';
    html += `<div style="font-size:11px;color:${color};font-weight:600;padding:4px 0;">${d}</div>`;
  });
  html += '</div>';

  // Calendar grid
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:0 8px;">';
  for (let i=0; i<firstDay; i++) html += '<div></div>';
  for (let d=1; d<=daysInMonth; d++) {
    const isToday = year===today.getFullYear() && month===today.getMonth() && d===today.getDate();
    const hasEvent = events[d];
    const dayColor = new Date(year,month,d).getDay()===0?'#c97070':new Date(year,month,d).getDay()===6?'#7a9ad4':'var(--text)';
    html += `<div onclick="calDayTap(${year},${month},${d})" style="text-align:center;padding:6px 2px;border-radius:12px;cursor:pointer;position:relative;${isToday?'background:var(--accent);color:#fff;font-weight:700;':'color:'+dayColor+';'}${hasEvent&&!isToday?'background:var(--accent-light);':''}">
      <div style="font-size:14px;">${d}</div>
      ${hasEvent?`<div style="display:flex;justify-content:center;gap:1px;margin-top:2px;">${hasEvent.slice(0,3).map(e=>`<span style="font-size:8px;">${e.emoji}</span>`).join('')}</div>`:''}
    </div>`;
  }
  html += '</div>';
  html += '</div>'; // 手帳風ラッパー閉じ

  // カレンダー/リスト切り替え＋年月ダイヤル（統一デザイン）
  html += `<div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;">
    <span onclick="toggleCalView()" style="font-size:12px;color:var(--accent);cursor:pointer;padding:6px 10px;border:1px solid var(--border);border-radius:10px;background:var(--card);font-family:'Zen Maru Gothic',sans-serif;">
      ${calViewMode==='calendar' ? '📋 リスト' : '📅 カレンダー'}
    </span>
    <span style="color:var(--border);">|</span>
    <span onclick="dialYear(1)" style="font-size:10px;color:var(--sub);cursor:pointer;user-select:none;">▲</span>
    <span id="dialYearVal" style="font-size:13px;font-weight:600;color:var(--text);min-width:36px;text-align:center;">${_calYear}</span>
    <span onclick="dialYear(-1)" style="font-size:10px;color:var(--sub);cursor:pointer;user-select:none;">▼</span>
    <span style="font-size:12px;color:var(--border);">/</span>
    <span onclick="dialMonth(1)" style="font-size:10px;color:var(--sub);cursor:pointer;user-select:none;">▲</span>
    <span id="dialMonthVal" style="font-size:13px;font-weight:600;color:var(--text);min-width:20px;text-align:center;">${_calMonth+1}</span>
    <span onclick="dialMonth(-1)" style="font-size:10px;color:var(--sub);cursor:pointer;user-select:none;">▼</span>
    <span onclick="calDialJump()" style="font-size:11px;color:var(--accent);cursor:pointer;padding:4px 8px;border:1px solid var(--accent);border-radius:8px;font-family:'Zen Maru Gothic',sans-serif;">移動</span>
  </div>`;

  // リスト表示モードの場合、全記念日をリストで表示して終了
  if (calViewMode === 'list') {
    const allAnns = [];
    data.people.forEach(p => {
      (p.anniversaries||[]).forEach((a,ai) => {
        if (!a.date || a.calendarHidden) return;
        const days = daysUntil(a.date, a.dateType);
        const emoji = (a.name||'').match(/[\p{Emoji}]/u)?.[0]||'📅';
        const label = (a.name||'').replace(/[\p{Emoji}]/gu,'').trim();
        allAnns.push({emoji, name:p.nickname, event:label, days:days!==null?days:9999, date:a.date, dateType:a.dateType, personId:p.id, annIdx:ai});
      });
    });
    allAnns.sort((a,b) => a.days - b.days);

    if (allAnns.length) {
      html += '<div style="padding:8px 16px 4px;font-size:13px;font-weight:600;color:var(--accent);">すべての記念日（近い順）</div>';
      allAnns.forEach(a => {
        const badge = a.days===0 ? '🎉 今日！' : a.days<=7 ? `あと${a.days}日` : a.days<=30 ? `あと${a.days}日` : `あと${a.days}日`;
        const badgeColor = a.days===0 ? 'var(--accent)' : a.days<=7 ? '#c97070' : a.days<=30 ? 'var(--accent)' : 'var(--sub)';
        html += `<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="jumpToPerson('${a.personId}')">
          <span style="font-size:22px;">${a.emoji}</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:500;">${esc(a.name)}</div>
            <div style="font-size:12px;color:var(--sub);">${esc(a.event)} · ${formatAnnDate(a.date,a.dateType)}</div>
          </div>
          <span style="font-size:13px;color:${badgeColor};font-weight:600;">${badge}</span>
        </div>`;
      });
    } else {
      html += '<div style="text-align:center;padding:24px;color:var(--sub);font-size:13px;">記念日はまだ登録されていません</div>';
    }

    cardList.innerHTML = html;
    setTimeout(initCalSwipe, 100);
    return;
  }

  // Event list for today or selected
  const todayEvents = events[today.getDate()] || [];
  // Upcoming events this month
  const upcoming = [];
  for (let d=today.getDate(); d<=daysInMonth; d++) {
    if (events[d]) events[d].forEach(e => upcoming.push({...e, day:d}));
  }

  // 非表示の記念日を収集
  const hiddenEvents = [];
  data.people.forEach(p => {
    (p.anniversaries||[]).forEach((a,ai) => {
      if (!a.date || !a.calendarHidden) return;
      const parts = a.date.split('-').map(Number);
      let em,ed;
      if (a.dateType==='full'&&parts.length>=3) { if(parts[1]-1!==month) return; em=parts[1]-1; ed=parts[2]; }
      else if (parts.length>=2) { em=parts[parts.length-2]-1; ed=parts[parts.length-1]; if(em!==month) return; }
      else return;
      hiddenEvents.push({emoji:(a.name||'').match(/[\p{Emoji}]/u)?.[0]||'📅',name:p.nickname,event:a.name,day:ed,_personId:p.id,_annIdx:ai});
    });
  });

  if (upcoming.length) {
    html += '<div style="padding:16px 16px 8px;font-size:13px;font-weight:600;color:var(--accent);">今月の予定</div>';
    upcoming.forEach(e => {
      const typeColor = e.type==='gave'?'#d48a7a':e.type==='received'?'#7a9ad4':'var(--accent)';
      const hasHideOption = e.type==='anniversary' && e._personId !== undefined;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">
        <span style="font-size:20px;">${e.emoji}</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:500;">${esc(e.name)} ${esc((e.event||'').replace(/[\p{Emoji}]/gu,'').trim())}</div><div style="font-size:11px;color:var(--sub);">${month+1}/${e.day}</div></div>
        <span style="font-size:12px;color:${typeColor};font-weight:600;">${e.type==='gave'?'あげた':e.type==='received'?'もらった':''}</span>
        ${hasHideOption?`<label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;flex-shrink:0;" onclick="event.stopPropagation();">
          <input type="checkbox" onchange="toggleCalendarHidden('${e._personId}',${e._annIdx},this.checked)"><span>👁‍🗨</span>
        </label>`:''}
      </div>`;
    });
  } else {
    html += '<div style="text-align:center;padding:24px;color:var(--sub);font-size:13px;">今月の予定はありません</div>';
  }

  // 非表示の記念日（折りたたみ）
  if (hiddenEvents.length) {
    const hid = 'hiddenCal_'+Math.random().toString(36).slice(2);
    html += `<div style="margin:8px 16px;padding:8px 12px;cursor:pointer;color:var(--sub);font-size:13px;text-align:center;border:1px dashed var(--border);border-radius:12px;" onclick="const b=document.getElementById('${hid}');const t=this;if(b.style.display==='none'){b.style.display='';t.textContent='▲ 非表示を閉じる (${hiddenEvents.length}件)';}else{b.style.display='none';t.textContent='▼ 非表示を表示 (${hiddenEvents.length}件)';}">▼ 非表示を表示 (${hiddenEvents.length}件)</div>`;
    html += `<div id="${hid}" style="display:none;opacity:0.5;">`;
    hiddenEvents.forEach(e => {
      html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);">
        <span style="font-size:20px;">${e.emoji}</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:500;">${esc(e.name)} ${esc((e.event||'').replace(/[\p{Emoji}]/gu,'').trim())}</div><div style="font-size:11px;color:var(--sub);">${month+1}/${e.day}</div></div>
        <label style="font-size:11px;color:var(--sub);display:flex;align-items:center;gap:2px;cursor:pointer;flex-shrink:0;" onclick="event.stopPropagation();">
          <input type="checkbox" checked onchange="toggleCalendarHidden('${e._personId}',${e._annIdx},this.checked)"><span>👁</span>
        </label>
      </div>`;
    });
    html += '</div>';
  }

  // Quick add buttons
  html += `<div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
    <button onclick="switchTab('people');openPeopleModal()" style="padding:12px;border-radius:14px;border:1px solid var(--border);background:var(--card);font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">👤 友だち追加</button>
    <button onclick="switchTab('gift');currentTab='gave';openItemModal();currentTab='gift'" style="padding:12px;border-radius:14px;border:1px solid var(--border);background:var(--card);font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">🎁 ギフト記録</button>
    <button onclick="switchTab('wish');openItemModal()" style="padding:12px;border-radius:14px;border:1px solid var(--border);background:var(--card);font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">✨ お気に入り</button>
    <button onclick="switchTab('place');openPlaceModal()" style="padding:12px;border-radius:14px;border:1px solid var(--border);background:var(--card);font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📍 行きたい場所</button>
  </div>`;

  cardList.innerHTML = html;
  setTimeout(initCalSwipe, 100);
}

async function toggleCalendarHidden(personId, annIdx, hidden) {
  const p = data.people.find(x=>x.id===personId);
  if (!p || !p.anniversaries || !p.anniversaries[annIdx]) return;
  p.anniversaries[annIdx].calendarHidden = !!hidden;
  saveData();
  await sbSave();
  render();
  showToast(hidden ? '記念日から非表示にしました' : '記念日に表示しました');
}

function toggleCalView() {
  calViewMode = calViewMode === 'calendar' ? 'list' : 'calendar';
  render();
}

function calPrev() {
  _calMonth--; if(_calMonth<0){_calMonth=11;_calYear--;}
  render();
  const cl = document.getElementById('cardList');
  if (cl) { cl.classList.remove('cal-page-left','cal-page-right'); void cl.offsetHeight; cl.classList.add('cal-page-right'); }
}
function calNext() {
  _calMonth++; if(_calMonth>11){_calMonth=0;_calYear++;}
  render();
  const cl = document.getElementById('cardList');
  if (cl) { cl.classList.remove('cal-page-left','cal-page-right'); void cl.offsetHeight; cl.classList.add('cal-page-left'); }
}

// カレンダースワイプで月切り替え
let _calSwipeX = 0, _calSwipeY = 0;
function initCalSwipe() {
  const el = document.getElementById('cardList');
  if (!el || currentTab !== 'calendar') return;
  el.addEventListener('touchstart', calSwipeStart, {passive:true});
  el.addEventListener('touchend', calSwipeEnd, {passive:true});
}
function calSwipeStart(e) { _calSwipeX = e.touches[0].clientX; _calSwipeY = e.touches[0].clientY; }
function calSwipeEnd(e) {
  if (currentTab !== 'calendar') return;
  const diff = e.changedTouches[0].clientX - _calSwipeX;
  if (Math.abs(diff) < 60) return; // 60px未満は無視
  if (diff > 0) calPrev(); // 右スワイプ→前月
  else calNext(); // 左スワイプ→次月
}
function calDayTap(y,m,d) {
  const dateStr = y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const modal = document.getElementById('modal');
  const events = [];
  data.people.forEach(p => {
    (p.anniversaries||[]).forEach(a => {
      if (!a.date || a.calendarHidden) return;
      const parts = a.date.split('-').map(Number);
      let em,ed;
      if (a.dateType==='full'&&parts.length>=3) { em=parts[1]-1; ed=parts[2]; }
      else if (parts.length>=2) { em=parts[parts.length-2]-1; ed=parts[parts.length-1]; }
      else return;
      if (em===m && ed===d) events.push({emoji:(a.name||'').match(/[\p{Emoji}]/u)?.[0]||'📅', text:p.nickname+' '+a.name, personId:p.id});
    });
  });
  data.gave.forEach(item => { const p=item.date?.split('-').map(Number); if(p&&p[0]===y&&p[1]-1===m&&p[2]===d) events.push({emoji:'🎁',text:(item.person||'')+' '+item.title,tab:'gave',id:item.id}); });
  data.received.forEach(item => { const p=item.date?.split('-').map(Number); if(p&&p[0]===y&&p[1]-1===m&&p[2]===d) events.push({emoji:'🎀',text:(item.person||'')+' '+item.title,tab:'received',id:item.id}); });

  let html = `<h2>${m+1}月${d}日</h2>`;

  if (events.length) {
    html += '<div style="margin-bottom:16px;">';
    events.forEach(e => {
      const onclick = e.personId ? `closeModal();jumpToPerson('${e.personId}')` : e.tab ? `closeModal();switchTab('gift');openAllRecordId='${e.tab}:${e.id}';render()` : '';
      html += `<div style="display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--border);${onclick?'cursor:pointer;':''}" ${onclick?`onclick="${onclick}"`:''}>
        <span style="font-size:22px;">${e.emoji}</span>
        <div style="font-size:14px;font-weight:500;flex:1;">${esc(e.text)}</div>
        ${onclick?'<span style="color:var(--accent);">→</span>':''}
      </div>`;
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--sub);font-size:14px;">この日の予定はありません</div>';
  }

  const _bs3 = 'display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;border-radius:14px;font-size:14px;font-weight:500;cursor:pointer;font-family:"Zen Maru Gothic",sans-serif;';
  html += `<div style="font-size:13px;color:var(--sub);margin-bottom:8px;text-align:center;">この日に登録する</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
    <button onclick="closeModal();switchTab('gift');currentTab='gave';openItemModal();document.getElementById('fDate')&&(document.getElementById('fDate').value='${dateStr}');currentTab='gift'" style="${_bs3}border:1px solid var(--pickup-border);background:linear-gradient(135deg,var(--pickup),#fff4e6);color:var(--text);">🎁 あげた</button>
    <button onclick="closeModal();switchTab('gift');currentTab='received';openItemModal();document.getElementById('fDate')&&(document.getElementById('fDate').value='${dateStr}');currentTab='gift'" style="${_bs3}border:1px solid #bdd8f0;background:linear-gradient(135deg,#e8f2fc,#daeaf8);color:#4a7aaa;">🎀 もらった</button>
    <button onclick="closeModal();switchTab('wish');openItemModal()" style="${_bs3}border:1px solid var(--border);background:linear-gradient(135deg,#faf8f6,#f3eeea);color:var(--text);">✨ お気に入り</button>
    <button onclick="closeModal();switchTab('place');openPlaceModal()" style="${_bs3}border:1px solid var(--border);background:linear-gradient(135deg,#faf8f6,#f3eeea);color:var(--text);">📍 行きたい場所</button>
  </div>`;

  html += `<div class="form-btns" style="margin-top:16px;"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>`;
  modal.innerHTML = html;
  openModal();
}

// ===== Notifications (お知らせ) =====
async function openNotifications() {
  const modal = document.getElementById('modal');
  modal.innerHTML = `<h2>🔔 お知らせ</h2><div style="text-align:center;padding:24px;color:var(--sub);">読み込み中...</div>`;
  openModal();
  let items = [];
  if (_sb) {
    try {
      const { data: rows } = await _sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
      items = rows || [];
    } catch(e) {}
  }
  let html = '<h2>🔔 お知らせ</h2>';
  // 仕掛け4: 記念日リマインダーを先頭に表示
  // 初回チュートリアル
  if (!localStorage.getItem('awai_reminder_tutorial_done') && getAiReminderCount() > 0) {
    html += `<div style="background:linear-gradient(135deg,#e8f2fc,#daeaf8);border:1px solid #bdd8f0;border-radius:14px;padding:14px;margin-bottom:12px;">
      <div style="font-weight:600;font-size:14px;margin-bottom:6px;">💡 通知タイミングは変更できます</div>
      <div style="font-size:13px;color:var(--text);line-height:1.6;">友だちカードの記念日セクションで 🔔 をタップすると、通知の日数を変えられます（7日前/14日前/30日前など）。</div>
      <div style="text-align:right;margin-top:8px;">
        <button onclick="localStorage.setItem('awai_reminder_tutorial_done','1');openNotifications();" style="padding:6px 14px;border-radius:8px;background:var(--accent);color:#fff;border:none;font-size:12px;cursor:pointer;">OK、わかりました</button>
      </div>
    </div>`;
  }
  html += renderAiReminders();
  html += renderSimilarNotifs();
  if (!items.length && !getAiReminderCount() && !renderSimilarNotifs()) {
    html += '<div style="text-align:center;padding:32px;color:var(--sub);">お知らせはまだありません</div>';
  } else {
    items.forEach(item => {
      const date = new Date(item.created_at).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'});
      html += `<div style="background:var(--card);border-radius:14px;padding:16px;margin-bottom:10px;box-shadow:0 1px 4px var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-size:15px;font-weight:600;">${esc(item.title)}</div>
          <span style="font-size:11px;color:var(--sub);">${date}</span>
        </div>
        ${item.body?`<div style="font-size:13px;color:var(--text);line-height:1.6;margin-bottom:8px;">${esc(item.body)}</div>`:''}
        ${item.link_url?`<a href="${esc(item.link_url)}" target="_blank" style="font-size:13px;color:var(--accent);text-decoration:underline;">${esc(item.link_label||'詳しく見る')}</a>`:''}
      </div>`;
    });
  }
  // Mark as read
  localStorage.setItem('awai_notif_read', new Date().toISOString());
  updateNotifBadge(0);
  html += '<div class="form-btns" style="margin-top:16px;"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>';
  modal.innerHTML = html;
}

async function checkNotifications() {
  if (!_sb) return;
  try {
    const lastRead = localStorage.getItem('awai_notif_read') || '2000-01-01';
    const { count } = await _sb.from('announcements').select('id', { count: 'exact', head: true }).gt('created_at', lastRead);
    let totalBadge = count || 0;
    // 仕掛け4: 記念日事前提案の件数も加算
    const aiReminders = getAiReminderCount();
    totalBadge += aiReminders;
    if (totalBadge > 0) updateNotifBadge(totalBadge);
  } catch(e) {}
}

// 仕掛け4: 記念日30日前を検知→自動提案準備
const AI_REMINDER_KEY = 'awai_ai_reminders';

function getAiReminderCount() {
  checkAiReminders();
  try {
    const reminders = JSON.parse(localStorage.getItem(AI_REMINDER_KEY) || '[]');
    return reminders.filter(r => !r.dismissed).length;
  } catch { return 0; }
}

function checkAiReminders() {
  try {
    const existing = JSON.parse(localStorage.getItem(AI_REMINDER_KEY) || '[]');
    const today = new Date();
    const newReminders = [...existing];

    data.people.forEach(p => {
      if (p.isMemory || !p.anniversaries?.length) return;
      p.anniversaries.forEach(a => {
        if (!a.date) return;
        const days = daysUntil(a.date, a.dateType);
        if (days === null || days <= 0) return;
        // ユーザー設定のリマインド日数を使う（未設定なら30日前）
        const reminderDays = (a.reminders && a.reminders.length) ? Math.max(...a.reminders) : 30;
        if (days <= reminderDays) {
          const key = `${p.id}_${a.name}_${a.date}`;
          if (!newReminders.some(r => r.key === key)) {
            newReminders.push({
              key,
              personId: p.id,
              personName: p.nickname,
              annivName: a.name,
              annivDate: a.date,
              daysLeft: days,
              dismissed: false,
              createdAt: today.toISOString()
            });
          }
        }
      });
    });

    // 過去のリマインダー（90日以上前）を削除
    const cleaned = newReminders.filter(r => {
      const age = (today - new Date(r.createdAt)) / (1000*60*60*24);
      return age < 90;
    });

    localStorage.setItem(AI_REMINDER_KEY, JSON.stringify(cleaned));
  } catch {}
}

function renderAiReminders() {
  try {
    const reminders = JSON.parse(localStorage.getItem(AI_REMINDER_KEY) || '[]');
    const active = reminders.filter(r => !r.dismissed);
    if (!active.length) return '';

    let html = '<div style="margin-bottom:16px;">';
    html += '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">🎁 ギフト準備リマインド</div>';
    active.forEach(r => {
      html += `<div style="background:var(--pickup);border:1px solid var(--pickup-border);border-radius:12px;padding:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:13px;font-weight:500;">${esc(r.personName)} の ${esc(r.annivName)}</div>
          <div style="font-size:12px;color:var(--sub);">あと${r.daysLeft}日 — 今のうちにギフトを準備しませんか？</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${(()=>{
            const st = r.ready ? 'ready' : (r.preparing ? 'preparing' : 'none');
            const styles = {
              none: 'background:var(--bg);color:var(--text);border:1px solid var(--border);',
              preparing: 'background:#FFF8E1;color:#F9A825;border:1px solid #FFF0B3;',
              ready: 'background:#4CAF50;color:#fff;border:1px solid #4CAF50;'
            };
            const labels = { none: '🎁 準備する', preparing: '🟡 準備中', ready: '✅ 準備OK' };
            return `<button onclick="event.stopPropagation();markGiftReady('${r.personId}','${r.key}')" style="padding:6px 10px;border-radius:8px;${styles[st]}font-size:11px;cursor:pointer;">${labels[st]}</button>`;
          })()}
          <button onclick="event.stopPropagation();openAiSuggestFromReminder('${r.personId}')" style="padding:6px 10px;border-radius:8px;background:var(--accent);color:#fff;border:none;font-size:11px;cursor:pointer;">💡 提案</button>
          <button onclick="event.stopPropagation();dismissAiReminder('${r.key}')" style="padding:6px 8px;border-radius:8px;background:none;border:none;font-size:11px;cursor:pointer;color:var(--sub);">✕</button>
        </div>
      </div>`;
    });
    html += '</div>';
    return html;
  } catch { return ''; }
}

function openAiSuggestFromReminder(personId) {
  closeModal();
  openAiSuggest(personId);
}

function toggleGiftStatus(personId, key) {
  const person = data.people.find(p=>p.id===personId);
  if (!person) return;
  if (!person.giftStatus) person.giftStatus = {};
  const current = person.giftStatus[key]?.status || 'none';
  // none → preparing → ready → none
  const next = current === 'none' ? 'preparing' : current === 'preparing' ? 'ready' : 'none';
  if (next === 'none') {
    delete person.giftStatus[key];
    showToast('🎁 リセットしました');
  } else {
    person.giftStatus[key] = { status: next, ready: next === 'ready', date: new Date().toISOString().split('T')[0] };
    showToast(next === 'preparing' ? '🟡 準備中！' : '✅ 準備OK！');
  }
  // リマインダー側も同期
  try {
    const reminders = JSON.parse(localStorage.getItem(AI_REMINDER_KEY) || '[]');
    const r = reminders.find(r => r.key === key);
    if (r) r.ready = !!person.giftStatus[key]?.ready;
    localStorage.setItem(AI_REMINDER_KEY, JSON.stringify(reminders));
  } catch {}
  saveData(); render();
}

function markGiftReady(personId, key) {
  try {
    const reminders = JSON.parse(localStorage.getItem(AI_REMINDER_KEY) || '[]');
    const r = reminders.find(r => r.key === key);
    if (r) {
      // none → preparing → ready → none
      const current = r.ready ? 'ready' : (r.preparing ? 'preparing' : 'none');
      const next = current === 'none' ? 'preparing' : current === 'preparing' ? 'ready' : 'none';
      r.ready = next === 'ready';
      r.preparing = next === 'preparing';
    }
    localStorage.setItem(AI_REMINDER_KEY, JSON.stringify(reminders));
    // 人物カードにも同期
    const person = data.people.find(p=>p.id===personId);
    if (person) {
      if (!person.giftStatus) person.giftStatus = {};
      const next = r?.ready ? 'ready' : (r?.preparing ? 'preparing' : 'none');
      if (next === 'none') {
        delete person.giftStatus[key];
      } else {
        person.giftStatus[key] = { status: next, ready: next === 'ready', date: new Date().toISOString().split('T')[0] };
      }
      saveData();
    }
    openNotifications();
    const next = r?.ready ? 'ready' : (r?.preparing ? 'preparing' : 'none');
    showToast(next === 'preparing' ? '🟡 準備中！' : next === 'ready' ? '✅ 準備OK！' : '🎁 リセットしました');
  } catch {}
}

function dismissAiReminder(key) {
  try {
    const reminders = JSON.parse(localStorage.getItem(AI_REMINDER_KEY) || '[]');
    const r = reminders.find(r => r.key === key);
    if (r) r.dismissed = true;
    localStorage.setItem(AI_REMINDER_KEY, JSON.stringify(reminders));
    // 通知モーダルを再描画
    openNotifications();
  } catch {}
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ===== Cloud Backup =====
async function createBackup() {
  if (!_sb || !_sbUser || !_sbUser.email) { alert('ログインが必要です'); return; }
  try {
    const dataObj = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const profileObj = JSON.parse(localStorage.getItem('awai_my_profile') || '{}');
    const { error } = await _sb.from('user_backups').insert({
      user_id: _sbUser.id,
      data: dataObj,
      profile: profileObj,
      memo: new Date().toLocaleString('ja-JP')
    });
    if (error) throw error;
    showToast('☁️ バックアップを作成しました');
    loadBackupList();
  } catch(e) { alert('バックアップに失敗しました'); }
}

async function loadBackupList() {
  const area = document.getElementById('backupListArea');
  if (!area || !_sb || !_sbUser || !_sbUser.email) {
    if (area) area.innerHTML = '<div style="font-size:12px;color:var(--sub);">ログインするとバックアップが使えます</div>';
    return;
  }
  try {
    const { data: rows, error } = await _sb.from('user_backups')
      .select('id,created_at,memo')
      .eq('user_id', _sbUser.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!rows || !rows.length) {
      area.innerHTML = '<div style="font-size:12px;color:var(--sub);">バックアップはまだありません</div>';
      return;
    }
    area.innerHTML = rows.map(r => {
      const date = new Date(r.created_at).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:13px;">${date}</span>
        <button class="card-btn" onclick="restoreBackup('${r.id}')" style="font-size:12px;padding:4px 12px;">↩ 戻す</button>
      </div>`;
    }).join('');
  } catch(e) { area.innerHTML = '<div style="font-size:12px;color:#c07070;">読み込みに失敗しました</div>'; }
}

async function restoreBackup(backupId) {
  if (!confirm('このバックアップに戻しますか？\n現在のデータは上書きされます。')) return;
  if (!_sb || !_sbUser) return;
  try {
    const { data: row, error } = await _sb.from('user_backups')
      .select('data,profile,user_id')
      .eq('id', backupId)
      .eq('user_id', _sbUser.id)
      .single();
    if (error) throw error;
    if (row.user_id !== _sbUser.id) { alert('自分のバックアップではありません'); return; }
    if (row.data) {
      TABS.forEach(t => { if (Array.isArray(row.data[t])) data[t] = row.data[t]; });
      if (row.data.labels) data.labels = {...data.labels, ...row.data.labels};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem('awai_data_updated', new Date().toISOString());
    }
    if (row.profile) {
      localStorage.setItem('awai_my_profile', JSON.stringify(row.profile));
    }
    saveData();
    await sbSave();
    render();
    showToast('☁️ バックアップから復元しました');
    document.getElementById('settingsModalOverlay').classList.remove('open');
  } catch(e) { alert('復元に失敗しました'); }
}

function replayOnboarding() {
  // データは消さずにオンボーディングを再表示
  document.getElementById('onboardingOverlay').style.display = '';
  obNext(1);
}

function showOnboarding() {
  document.getElementById('onboardingOverlay').style.display = '';
}

let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _deferredInstallPrompt = e; });

function obNext(step) {
  document.querySelectorAll('.ob-step').forEach(el => el.style.display = 'none');
  const next = document.getElementById('obStep' + step);
  if (next) {
    next.style.display = '';
    next.querySelectorAll(':scope > *').forEach(el => {
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '';
    });
  }
  // インストール案内ステップの表示制御
  if (step === 'install') {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const iosEl = document.getElementById('obInstallIos');
    const androidEl = document.getElementById('obInstallAndroid');
    const pwaEl = document.getElementById('obInstallPwa');
    const alreadyEl = document.getElementById('obInstallAlready');
    if (isStandalone) {
      // 既にインストール済み
      alreadyEl.style.display = '';
    } else if (_deferredInstallPrompt) {
      // Chromeのインストールプロンプトが使える
      pwaEl.style.display = '';
      androidEl.style.display = '';
    } else {
      const ua = navigator.userAgent;
      const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/.test(ua);
      if (isIos) { iosEl.style.display = ''; }
      else if (isAndroid) { androidEl.style.display = ''; }
      else { iosEl.style.display = ''; androidEl.style.display = ''; }
    }
  }
  // Step 3: 1回目コンシェルジュ提案を自動実行
  if (step === 3 || step === '3') {
    const nameEl = document.getElementById('obUserNameDisplay');
    if (nameEl) nameEl.textContent = window._obMyName || '';
    // 誕生日が入力されていたらメッセージに反映
    const bMonth = document.getElementById('obMyBirthMonth')?.value;
    const bDay = document.getElementById('obMyBirthDay')?.value;
    const subEl = document.getElementById('obStep3Sub');
    if (subEl && bMonth) {
      subEl.innerHTML = `${bMonth}月${bDay ? bDay + '日' : ''}のお誕生日に<br>ぴったりなものをお選びします`;
    }
    obRunAiSuggest1();
  }
  // Step 6: 2回目コンシェルジュ提案を自動実行（演出付き）
  if (step === 6 || step === '6') {
    const nameEl2 = document.getElementById('obUserNameDisplay2');
    if (nameEl2) nameEl2.textContent = window._obMyName || '';
    obRunAiSuggest2();
  }
  // Step 7: 友だちギフト予告アニメーション開始
  if (step === 7 || step === '7') {
    setTimeout(() => obPlayLineDemo(), 500);
  }
}

function obSelectGender(el, gender) {
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('obPersonGender').value = gender;
}

async function obLogin() {
  const email = document.getElementById('obEmail')?.value.trim();
  if (!email) { showToast('メールアドレスを入力してください'); return; }
  const msgDiv = document.getElementById('obLoginMsg');
  msgDiv.innerHTML = '送信中...';
  try {
    const { error } = await _sb.auth.signInWithOtp({ email });
    if (error) throw error;
    msgDiv.innerHTML = '<div style="color:#6bab8a;font-weight:600;">確認メールを送信しました。<br>メール内のリンクをタップしてください。</div>';
  } catch(e) {
    msgDiv.innerHTML = `<div style="color:#c97070;">${esc(e.message)}</div>`;
  }
}

function obPwaInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(result => {
    _deferredInstallPrompt = null;
    if (result.outcome === 'accepted') {
      const alreadyEl = document.getElementById('obInstallAlready');
      const pwaEl = document.getElementById('obInstallPwa');
      if (pwaEl) pwaEl.style.display = 'none';
      if (alreadyEl) alreadyEl.style.display = '';
    }
  });
}

function obSetDateType(target, type, el) {
  const prefix = target === 'my' ? 'obMy' : 'obPerson';
  document.getElementById(prefix + 'DateType').value = type;
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(prefix + 'BirthYear').style.display = type === 'full' ? '' : 'none';
  document.getElementById(prefix + 'BirthDay').style.display = type === 'month' ? 'none' : '';
}

function obBuildDate(prefix) {
  const dateType = document.getElementById(prefix + 'DateType').value;
  const year = document.getElementById(prefix + 'BirthYear').value;
  const month = document.getElementById(prefix + 'BirthMonth').value;
  const day = document.getElementById(prefix + 'BirthDay').value;
  if (!month) return null;
  let date = '';
  if (dateType === 'full' && year && month) {
    date = year + '-' + String(month).padStart(2,'0') + '-' + String(day||1).padStart(2,'0');
  } else if (dateType === 'monthday') {
    date = String(month).padStart(2,'0') + '-' + String(day||1).padStart(2,'0');
  } else if (dateType === 'month') {
    date = String(month).padStart(2,'0');
  }
  return { date, dateType };
}

function obSaveProfile() {
  const name = document.getElementById('obMyName').value.trim();
  if (!name) { alert('名前を入力してください'); return; }
  const profile = getMyProfile();
  profile.name = name;
  const bd = obBuildDate('obMy');
  if (bd) {
    profile.anniversaries = [{name:'🎂 誕生日', date: bd.date, dateType: bd.dateType, repeat:'yearly', reminders:[30]}];
  }
  const interests = document.getElementById('obMyInterests')?.value.trim();
  if (interests) {
    profile.interests = interests.split(/[,、\s]+/).filter(Boolean);
  }
  localStorage.setItem(MY_PROFILE_KEY, JSON.stringify(profile));
  sbSave();
  obNext(3); // コンシェルジュ提案へ（ここではもう使われない、互換用）
}

// パーソナライズされた気づきの質問を生成
function obBuildInsight(interests) {
  const qArea = document.getElementById('obInsightQuestions');
  if (!qArea) return;

  // 趣味に基づくパーソナライズ質問テンプレート
  const templates = {
    'ゴルフ': { q:'一緒にラウンドする仲間の好きな飲み物を知っていますか？', emoji:'⛳' },
    'ワイン': { q:'一緒にワインを飲みたい人の好きな銘柄を知っていますか？', emoji:'🍷' },
    '旅行': { q:'一緒に旅行したい人の行きたい場所を知っていますか？', emoji:'✈️' },
    '料理': { q:'手料理を食べてもらいたい人の苦手な食べ物を知っていますか？', emoji:'🍳' },
    'お酒': { q:'一緒に飲みたい人の好きなお酒の種類を知っていますか？', emoji:'🍶' },
    'スポーツ': { q:'応援している仲間の好きなチームを知っていますか？', emoji:'⚽' },
    '音楽': { q:'一緒にライブに行きたい人の好きなアーティストを知っていますか？', emoji:'🎵' },
    '映画': { q:'映画の趣味が合う人の最近のお気に入りを知っていますか？', emoji:'🎬' },
    'カフェ': { q:'一緒にカフェに行きたい人の好きなドリンクを知っていますか？', emoji:'☕' },
    '読書': { q:'本を薦め合える人の最近読んだ本を知っていますか？', emoji:'📚' },
    '釣り': { q:'一緒に釣りに行く仲間の好きな釣り場を知っていますか？', emoji:'🎣' },
    'キャンプ': { q:'一緒にキャンプしたい人の好きな料理を知っていますか？', emoji:'🏕️' },
    'ファッション': { q:'プレゼントしたい人の服のサイズを知っていますか？', emoji:'👕' },
    '花': { q:'花を贈りたい人の好きな花を知っていますか？', emoji:'💐' },
    'お菓子': { q:'お菓子を贈りたい人の好きな味を知っていますか？', emoji:'🍪' },
  };

  // デフォルト質問（趣味に関係なく共通）
  const defaultQuestions = [
    { q:'その方の好きな食べ物を知っていますか？', emoji:'🍽' },
    { q:'その方の洋服のサイズを知っていますか？', emoji:'👕' },
    { q:'その方へのプレゼントを覚えていますか？', emoji:'🎁' },
  ];

  // パーソナライズ質問を選択
  let questions = [];
  interests.forEach(i => {
    const key = Object.keys(templates).find(k => i.includes(k) || k.includes(i));
    if (key && questions.length < 2) questions.push(templates[key]);
  });
  // 足りない分はデフォルトから追加
  defaultQuestions.forEach(q => { if (questions.length < 3) questions.push(q); });

  let html = '';
  questions.forEach((q, idx) => {
    html += `<div style="background:var(--card);border-radius:16px;padding:16px;margin-bottom:10px;box-shadow:0 1px 6px var(--shadow);">
      <div style="font-size:15px;margin-bottom:10px;">${q.emoji} ${q.q}</div>
      <div style="display:flex;gap:8px;">
        <div class="date-type-chip" onclick="obAnswerInsight(this,${idx},'yes')" style="flex:1;text-align:center;font-size:14px;padding:10px;" data-answer="">知ってる</div>
        <div class="date-type-chip" onclick="obAnswerInsight(this,${idx},'no')" style="flex:1;text-align:center;font-size:14px;padding:10px;" data-answer="">知らない</div>
      </div>
    </div>`;
  });
  qArea.innerHTML = html;
  qArea._total = questions.length;
  qArea._yesCount = 0;
}

function obAnswerInsight(el, idx, answer) {
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c => {
    c.classList.remove('active');
    c.style.opacity = '0.5';
  });
  el.classList.add('active');
  el.style.opacity = '1';
  el.dataset.answer = answer;
}

function obShowInsightResult() {
  const qArea = document.getElementById('obInsightQuestions');
  const chips = qArea.querySelectorAll('.date-type-chip[data-answer]');
  let yes = 0, answered = 0;
  chips.forEach(c => {
    if (c.dataset.answer === 'yes') yes++;
    if (c.dataset.answer) answered++;
  });

  const total = Math.floor(answered / 2); // 2 chips per question
  const result = document.getElementById('obInsightResult');
  const btn = document.getElementById('obInsightBtn');

  let message = '';
  if (yes === 0) {
    message = `<div style="font-size:16px;font-weight:600;color:var(--accent);margin-bottom:8px;">意外と知らないことが多いかもしれません</div>
      <div style="font-size:14px;color:var(--sub);line-height:1.8;">大丈夫です。<br>AWAIは気づいたことを<br>少しずつ残していく場所です。</div>`;
  } else if (yes < total) {
    message = `<div style="font-size:16px;font-weight:600;color:var(--accent);margin-bottom:8px;">${total}つのうち${yes}つ知っていました</div>
      <div style="font-size:14px;color:var(--sub);line-height:1.8;">もっと知りたいと思った時、<br>AWAIがお手伝いします。</div>`;
  } else {
    message = `<div style="font-size:16px;font-weight:600;color:var(--accent);margin-bottom:8px;">よく知っていますね</div>
      <div style="font-size:14px;color:var(--sub);line-height:1.8;">その気持ちを忘れないように<br>AWAIに残していきましょう。</div>`;
  }

  result.innerHTML = message;
  result.style.display = '';
  btn.textContent = 'その方を登録する →';
  btn.onclick = () => obNext(3);
}

let _obPersonId = null;
let _obPersonName = '';

function obSavePerson() {
  const name = document.getElementById('obPersonName').value.trim();
  if (!name) { alert('名前を入力してください'); return; }
  const relation = document.getElementById('obPersonRelation')?.value.trim() || null;
  const person = {
    id: genId(), nickname: name, type: 'individual', gender: 'unset',
    avatar: null, fullName: null, relation: relation, companyLink: null,
    anniversaries: [], sizes: {}, smoking: null, drinking: null,
    interests: [], brands: [], foodLike: [], foodDislike: [],
    personality: [], family: [], memo: null, oshi: [], corpPhoto: null
  };
  const bd = obBuildDate('obPerson');
  if (bd) {
    person.anniversaries = [{name:'🎂 誕生日', date: bd.date, dateType: bd.dateType, repeat:'yearly', reminders:[30]}];
  }
  data.people.push(person);
  saveData();
  _obPersonId = person.id;
  _obPersonName = name;
  document.getElementById('obGiftPersonName').textContent = name;
  document.getElementById('obAiPersonName').textContent = name;
  obNext('3b');
}

function obSaveGifts() {
  const gaveTitle = document.getElementById('obLastGave').value.trim();
  const gaveWhen = document.getElementById('obLastGaveWhen').value.trim();
  const recvTitle = document.getElementById('obLastReceived').value.trim();
  const recvWhen = document.getElementById('obLastReceivedWhen').value.trim();

  if (gaveTitle) {
    data.gave.push({
      id: genId(), title: gaveTitle, person: _obPersonName,
      occasion: gaveWhen || null, date: null, rating: 0, tags: null,
      itemCategory: null, url: null, memo: null, img: null,
      pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }
  if (recvTitle) {
    data.received.push({
      id: genId(), title: recvTitle, person: _obPersonName,
      occasion: recvWhen || null, date: null, rating: 0, tags: null,
      itemCategory: null, url: null, memo: null, img: null,
      pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }
  saveData();
  document.getElementById('obAiPersonName').textContent = _obPersonName;
  obNext('3c');
}

function obBuildComplete() {
  const title = document.getElementById('obCompleteTitle');
  const msg = document.getElementById('obCompleteMsg');
  const summary = document.getElementById('obCompleteSummary');

  const month = document.getElementById('obPersonBirthMonth')?.value;
  const day = document.getElementById('obPersonBirthDay')?.value;
  const gaveTitle = document.getElementById('obLastGave')?.value.trim();
  const recvTitle = document.getElementById('obLastReceived')?.value.trim();
  const gaveWhen = document.getElementById('obLastGaveWhen')?.value.trim();
  const recvWhen = document.getElementById('obLastReceivedWhen')?.value.trim();

  // カウントダウン
  let countdownHtml = '';
  if (month && day) {
    const today = new Date();
    const thisYear = today.getFullYear();
    let next = new Date(thisYear, parseInt(month)-1, parseInt(day));
    if (next <= today) next = new Date(thisYear+1, parseInt(month)-1, parseInt(day));
    const diff = Math.ceil((next - today) / (1000*60*60*24));
    title.textContent = _obPersonName + 'さんの誕生日まで';
    countdownHtml = `<div style="text-align:center;margin:16px 0;">
      <div style="font-size:48px;font-weight:700;color:var(--accent);font-family:'Shippori Mincho',serif;">あと${diff}日</div>
    </div>`;
  } else {
    title.textContent = '準備ができました';
  }

  // ギフト記録サマリー
  let summaryHtml = countdownHtml;
  if (gaveTitle || recvTitle) {
    summaryHtml += '<div style="background:var(--card);border-radius:16px;padding:16px;box-shadow:0 1px 6px var(--shadow);margin-bottom:16px;">';
    if (gaveTitle) {
      summaryHtml += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${recvTitle?'border-bottom:1px solid var(--border);':''}">
        <span style="font-size:20px;">🎁</span>
        <div><div style="font-size:14px;font-weight:500;">あげた：${esc(gaveTitle)}</div>${gaveWhen?`<div style="font-size:12px;color:var(--sub);">${esc(gaveWhen)}</div>`:''}</div>
      </div>`;
    }
    if (recvTitle) {
      summaryHtml += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;">
        <span style="font-size:20px;">🎀</span>
        <div><div style="font-size:14px;font-weight:500;">もらった：${esc(recvTitle)}</div>${recvWhen?`<div style="font-size:12px;color:var(--sub);">${esc(recvWhen)}</div>`:''}</div>
      </div>`;
    }
    summaryHtml += '</div>';
  }

  msg.innerHTML = 'もう忘れません。';
  if (gaveTitle) msg.innerHTML += '<br>次は何にしよう？';
  summary.innerHTML = summaryHtml;
}

function obStartWithName() {
  const name = document.getElementById('obFirstName')?.value.trim();
  if (!name) { showToast('お名前を入力してください'); return; }
  window._obMyName = name;
  document.getElementById('obMyName').value = name;
  obNext('install');
}

function obShowEmailRegister() {
  const form = document.getElementById('obEmailForm');
  if (form.style.display === 'none') {
    form.style.display = '';
    form.style.opacity = '0';
    requestAnimationFrame(() => { form.style.transition = 'opacity 0.4s ease'; form.style.opacity = '1'; });
  } else {
    form.style.display = 'none';
  }
}

async function obCreateAccountWithEmail() {
  const email = document.getElementById('obEmail')?.value.trim();
  const name = document.getElementById('obFirstName')?.value.trim();
  if (!email) { showToast('メールアドレスを入力してください'); return; }
  if (!name) { showToast('お名前も入力してください'); return; }
  const msgDiv = document.getElementById('obEmailMsg');
  msgDiv.innerHTML = '<span style="color:var(--sub);">登録中...</span>';
  try {
    const autoPass = 'awai_' + email.split('@')[0] + '_' + Date.now();
    const { data: authData, error } = await _sb.auth.signUp({
      email, password: autoPass,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) {
      if (error.message?.includes('already registered')) {
        msgDiv.innerHTML = '<span style="color:var(--accent);">このメールアドレスは登録済みです</span>';
        setTimeout(() => showLoginScreen(), 1500);
        return;
      }
      throw error;
    }
    if (authData?.user) _sbUser = authData.user;
    msgDiv.innerHTML = '';
    window._obMyName = name;
    document.getElementById('obMyName').value = name;
    obNext('install');
  } catch(e) {
    msgDiv.innerHTML = '';
    window._obMyName = name;
    document.getElementById('obMyName').value = name;
    obNext('install');
  }
}

function obSaveStep2() {
  const name = document.getElementById('obMyName').value.trim();
  if (!name) { showToast('名前を入力してください'); return; }
  const profile = getMyProfile();
  profile.name = name;
  profile.gender = document.getElementById('obMyGender')?.value || 'unset';
  const bd = obBuildDate('obMy');
  if (bd) {
    profile.anniversaries = [{name:'🎂 誕生日', date: bd.date, dateType: bd.dateType, repeat:'yearly', reminders:[30]}];
  }
  localStorage.setItem(MY_PROFILE_KEY, JSON.stringify(profile));

  window._obMyName = name;
  window._obLike = document.getElementById('obLike')?.value.trim() || '';
  window._obGender = profile.gender;

  sbSave();
  obNext(3);
}

function obSaveSuggestions(resultDiv) {
  const suggestions = resultDiv._suggestions || [];
  const now = new Date().toISOString();
  suggestions.forEach(s => {
    // Amazon/楽天リンクを構築
    const amazonUrl = s.amazonUrl || (s.keyword ? `https://www.amazon.co.jp/s?k=${encodeURIComponent(s.keyword||s.name)}` : '');
    const rakutenUrl = s.rakuten?.url || '';
    const aiLinks = {};
    if (amazonUrl) aiLinks.amazon = amazonUrl;
    if (rakutenUrl) aiLinks.rakuten = rakutenUrl;
    if (s.webLinks) {
      if (s.webLinks.official) aiLinks.official = s.webLinks.official;
      if (s.webLinks.instagram) aiLinks.instagram = s.webLinks.instagram;
      if (s.webLinks.tabelog) aiLinks.tabelog = s.webLinks.tabelog;
    }
    data.wish.push({
      id: genId(), title: s.name || '提案アイテム',
      itemCategory: s.category || '', tags: [],
      price: s.rakuten?.price ? String(s.rakuten.price) : (s.budget ? String(s.budget) : ''),
      memo: (s.shop||'') + ' — ' + (s.reason||''),
      person: '', occasion: '',
      url: amazonUrl || rakutenUrl || '',
      aiLinks: Object.keys(aiLinks).length ? aiLinks : null,
      img: s.rakuten?.image || null,
      pinned: false, createdAt: now, updatedAt: now
    });
  });
  saveData();
}

function obSaveFirstSuggestions() {
  // 提案は見せるだけ。お気に入りへの自動登録はしない
  obNext(5); // 追加情報へ
}

function obSaveSecondSuggestions() {
  // 提案は見せるだけ。お気に入りへの自動登録はしない
  obNext(7); // 友だちギフト予告へ
}

function obWaitingDotsHtml(msg) {
  return `<div style="text-align:center;padding:30px;">
    ${msg ? '<div style="font-size:13px;color:var(--sub);margin-bottom:16px;">'+msg+'</div>' : ''}
    <div style="display:inline-flex;gap:8px;margin-bottom:12px;">
      <span style="width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;animation:obDotBounce 1.4s ease-in-out infinite;"></span>
      <span style="width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;animation:obDotBounce 1.4s ease-in-out 0.2s infinite;"></span>
      <span style="width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;animation:obDotBounce 1.4s ease-in-out 0.4s infinite;"></span>
    </div>
    <div style="font-size:12px;color:var(--sub);animation:obFadeInOut 2s ease-in-out infinite;">少々お待ちください</div>
  </div>`;
}

function obRenderSuggestions(suggestions) {
  let html = '';
  suggestions.forEach(s => {
    const price = s.budget ? `約¥${Number(s.budget).toLocaleString()}` : '';
    html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 1px 6px var(--shadow);">
      <div style="font-weight:600;font-size:14px;">${esc(s.name)}</div>
      <div style="font-size:12px;color:var(--sub);margin:4px 0;">${esc(s.shop||'')}${price ? ' | ' + price : ''}</div>
      <div style="font-size:13px;margin-top:6px;line-height:1.6;">${esc(s.reason||'')}</div>
    </div>`;
  });
  return html;
}

// 1回目：基本情報だけで提案
async function obRunAiSuggest1() {
  const like = window._obLike || '';
  const bMonth = document.getElementById('obMyBirthMonth')?.value;
  const bDay = document.getElementById('obMyBirthDay')?.value;
  const birthday = bMonth ? `${bMonth}月${bDay ? bDay + '日' : ''}` : '';
  const resultDiv = document.getElementById('obAiResult1');
  const nextBtn = document.getElementById('obAi1NextBtn');
  resultDiv.innerHTML = obWaitingDotsHtml();

  const prompt = `以下の方へのおすすめを3つ提案してください。

## プロフィール
好きなモノ: ${like || '未入力'}
${birthday ? 'お誕生日: ' + birthday : ''}

## 提案の方針
- 一般的に人気のある定番商品を中心に提案してください
- 有名ブランドやよく知られた商品でOKです
${birthday ? '- お誕生日のお祝いにふさわしいものを含めてください' : ''}
- 幅広いジャンルから3つ選んでください`;

  try {
    const result = await callAI(prompt, like ? '好きなモノ: '+like : '', true, true, true);
    if (result.suggestions?.length) {
      resultDiv.innerHTML = obRenderSuggestions(result.suggestions);
      resultDiv._suggestions = result.suggestions;
      window._obFirstSuggestions = result.suggestions;
    } else {
      resultDiv.innerHTML = '<div style="color:var(--sub);padding:12px;text-align:center;">提案を取得できませんでした</div>';
    }
  } catch(e) {
    resultDiv.innerHTML = '<div style="color:var(--sub);padding:12px;text-align:center;">ログイン後にお試しください</div>';
  }
  nextBtn.style.display = '';
}

// 2回目：追加情報で提案が激変する体験
async function obRunAiSuggest2() {
  const like = window._obLike || '';
  const budget = document.getElementById('obBudget')?.value.trim() || '';
  const scene = document.getElementById('obScene')?.value.trim() || '';
  const dislike = document.getElementById('obDislike')?.value.trim() || '';

  const resultDiv = document.getElementById('obAiResult2');
  const nextBtn = document.getElementById('obAi2NextBtn');

  // 入力内容に合わせた待機メッセージを動的に生成
  let waitMsg = '';
  if (scene && like) {
    waitMsg = `${scene}に合う${like}関連のものをお選びしています・・・`;
  } else if (scene) {
    waitMsg = `${scene}にぴったりなものをお選びしています・・・`;
  } else if (like && dislike) {
    waitMsg = `${like}がお好きで${dislike}が苦手なあなたに合うものをお選びしています・・・`;
  } else if (like) {
    waitMsg = `${like}がお好きなあなたに合うものをお選びしています・・・`;
  } else {
    waitMsg = 'あなたに合うものをお選びしています・・・';
  }
  resultDiv.innerHTML = obWaitingDotsHtml(waitMsg);

  // 1回目の提案を避けるリスト
  const avoidList = (window._obFirstSuggestions || []).map(s => s.name).join('、');

  const profileParts = [];
  if (like) profileParts.push(`好きなモノ: ${like}`);
  if (budget) profileParts.push(`予算: ${budget}`);
  if (scene) profileParts.push(`シーン: ${scene}`);
  if (dislike) profileParts.push(`苦手なもの: ${dislike}`);

  const prompt = `あなたはギフトの達人です。以下の方に「これは私のことをわかってくれている」と感動させる提案を3つしてください。

## プロフィール
${profileParts.join('\n')}

## 提案の方針（最重要）
- 苦手なものは絶対に避けてください
- 予算とシーンにぴったり合わせてください
- 大量生産品やAmazonで誰でも買えるものは避けてください
- 知る人ぞ知る名店、職人の手仕事、ストーリーのある商品、五感に訴える体験を選んでください
- 「好きなモノ」と「シーン」を掛け合わせた、この人だけの組み合わせを提案してください
- なぜこの人にこれが合うのか、理由を具体的に書いてください（「〇〇がお好きなあなたに」のように）
- 以下は前回提案済みなので絶対に避けてください: ${avoidList || 'なし'}
- 前回の提案とはジャンルもテイストも完全に変えてください`;

  try {
    const result = await callAI(prompt, profileParts.join('\n'), true, true, true);
    if (result.suggestions?.length) {
      // キラキラ演出
      showMiniCelebration('✨', '', '');
      // ゴールドの帯で特別感
      let html = '<div style="background:linear-gradient(135deg,#fdf6e3,#fff8e7);border:1px solid #e8d5a3;border-radius:16px;padding:16px;margin-bottom:12px;">';
      html += '<div style="text-align:center;font-size:12px;font-weight:600;color:#b8963e;margin-bottom:12px;">あなた専用にカスタマイズされました</div>';
      result.suggestions.forEach(s => {
        const price = s.budget ? `約¥${Number(s.budget).toLocaleString()}` : '';
        html += `<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(184,150,62,0.12);">
          <div style="font-weight:600;font-size:14px;color:#5a4a2a;">${esc(s.name)}</div>
          <div style="font-size:12px;color:#a09070;margin:4px 0;">${esc(s.shop||'')}${price ? ' | ' + price : ''}</div>
          <div style="font-size:13px;margin-top:6px;line-height:1.6;color:#5a4a2a;">${esc(s.reason||'')}</div>
        </div>`;
      });
      html += '</div>';
      resultDiv.innerHTML = html;
      resultDiv._suggestions = result.suggestions;
    } else {
      resultDiv.innerHTML = '<div style="color:var(--sub);padding:12px;text-align:center;">提案を取得できませんでした</div>';
    }
  } catch(e) {
    resultDiv.innerHTML = '<div style="color:var(--sub);padding:12px;text-align:center;">ログイン後にお試しください</div>';
  }
  nextBtn.style.display = '';
}

function obSavePersonNew() {
  const name = document.getElementById('obPersonName')?.value.trim();
  if (!name) { showToast('名前を入力してください'); return; }
  const gender = document.getElementById('obPersonGender')?.value || 'unset';
  const prefs = window._obPrefs || {};

  const person = {
    id: genId(), nickname: name, type: 'individual', gender: gender,
    avatar: null, fullName: null, relation: null, companyLink: null,
    anniversaries: [], sizes: {}, smoking: null, drinking: null,
    interests: prefs.like ? prefs.like.split(/[,、\s]+/).filter(Boolean) : [],
    brands: [],
    foodLike: prefs.taste ? prefs.taste.split(/[,、\s]+/).filter(Boolean) : [],
    foodDislike: prefs.dislike ? prefs.dislike.split(/[,、\s]+/).filter(Boolean) : [],
    personality: [], family: [], memo: null, oshi: [], corpPhoto: null
  };
  const bd = obBuildDate('obPerson');
  if (bd) {
    person.anniversaries = [{name:'🎂 誕生日', date: bd.date, dateType: bd.dateType, repeat:'yearly', reminders:[30]}];
  }
  data.people.push(person);
  saveData();
  obFinish();
}

function obSaveMyProfile() {
  const profile = getMyProfile();
  const foodLike = document.getElementById('obMyFoodLike')?.value.trim();
  const foodDislike = document.getElementById('obMyFoodDislike')?.value.trim();
  const brands = document.getElementById('obMyBrands')?.value.trim();
  const interests = document.getElementById('obMyInterests')?.value.trim();
  const memo = document.getElementById('obMyMemo')?.value.trim();

  if (foodLike) profile.foodLike = foodLike.split(/[,、\s]+/).filter(Boolean);
  if (foodDislike) profile.foodDislike = foodDislike.split(/[,、\s]+/).filter(Boolean);
  if (brands) profile.brands = brands.split(/[,、\s]+/).filter(Boolean);
  if (interests) profile.interests = interests.split(/[,、\s]+/).filter(Boolean);
  if (memo) profile.memo = memo;

  // 記念日追加
  const annivName = document.getElementById('obMyAnnivName')?.value.trim();
  const annivMonth = document.getElementById('obMyAnnivMonth')?.value;
  const annivDay = document.getElementById('obMyAnnivDay')?.value;
  if (annivName && annivMonth) {
    if (!profile.anniversaries) profile.anniversaries = [];
    const date = String(annivMonth).padStart(2,'0') + '-' + String(annivDay||1).padStart(2,'0');
    profile.anniversaries.push({ name: annivName, date: date, dateType: 'monthday', repeat: 'yearly', reminders: [30] });
  }

  localStorage.setItem(MY_PROFILE_KEY, JSON.stringify(profile));
  sbSave();

  // お礼メッセージ → フラッシュアニメーション → 友だちタブ
  obShowThankYouAndTransition();
}

function obShowThankYouAndTransition() {
  const overlay = document.getElementById('onboardingOverlay');
  const inner = overlay.querySelector(':scope > div');

  // お礼メッセージ
  inner.innerHTML = `<div style="text-align:center;opacity:0;transition:opacity 0.8s ease;" id="obThankYou">
    <div style="font-size:48px;margin-bottom:16px;">🕊️</div>
    <h2 style="font-family:'Shippori Mincho',serif;font-size:22px;margin-bottom:12px;">ご登録ありがとうございました</h2>
    <p style="color:var(--sub);font-size:14px;line-height:1.8;">あなた専用のコンシェルジュが<br>お待ちしています</p>
  </div>`;

  requestAnimationFrame(() => {
    document.getElementById('obThankYou').style.opacity = '1';
  });

  // 2秒後：季節アニメーション＋友だち登録メッセージにフェード
  setTimeout(() => {
    const ty = document.getElementById('obThankYou');
    ty.style.opacity = '0';

    setTimeout(() => {
      // 季節に合わせたアニメーション
      const month = new Date().getMonth() + 1;
      let seasonEmoji, seasonChars;
      if (month >= 3 && month <= 5) { seasonEmoji = '🌸'; seasonChars = ['🌸','🌺','💮','✨','🌿']; }
      else if (month >= 6 && month <= 8) { seasonEmoji = '⭐'; seasonChars = ['⭐','✨','💫','🌟','🎆']; }
      else if (month >= 9 && month <= 11) { seasonEmoji = '🍁'; seasonChars = ['🍁','🍂','✨','🌾','🍃']; }
      else { seasonEmoji = '❄️'; seasonChars = ['❄️','✨','⛄','🌟','💎']; }
      // バレンタイン特別
      if (month === 2 && new Date().getDate() <= 14) { seasonEmoji = '🎀'; seasonChars = ['🎀','💝','✨','💖','🌹']; }

      // 季節パーティクルを降らせる
      const pContainer = document.createElement('div');
      pContainer.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:99998;overflow:hidden;';
      document.body.appendChild(pContainer);
      for (let i = 0; i < 25; i++) {
        setTimeout(() => {
          const el = document.createElement('div');
          el.textContent = seasonChars[Math.floor(Math.random()*seasonChars.length)];
          el.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;font-size:${16+Math.random()*14}px;`;
          pContainer.appendChild(el);
          el.animate([
            { transform:'translateY(0) rotate(0deg)', opacity:0.9 },
            { transform:`translateY(${window.innerHeight+40}px) rotate(${Math.random()*360}deg)`, opacity:0 }
          ], { duration:3000+Math.random()*2000, easing:'ease-in' }).onfinish = () => el.remove();
        }, i * 120);
      }
      setTimeout(() => pContainer.remove(), 7000);

      ty.innerHTML = `<div style="font-size:56px;margin-bottom:16px;">${seasonEmoji}</div>
        <h2 style="font-family:'Shippori Mincho',serif;font-size:20px;margin-bottom:12px;line-height:1.6;">お友達を登録するところから<br>始めてみませんか</h2>`;
      ty.style.opacity = '1';
    }, 800);
  }, 2500);

  // 7秒後：ふわっと消えて本編へ
  setTimeout(() => {
    overlay.style.transition = 'opacity 1.2s ease';
    overlay.style.opacity = '0';

    setTimeout(() => {
      localStorage.setItem(OB_KEY, '1');
      overlay.style.display = 'none';
      overlay.style.opacity = '1';
      overlay.style.transition = '';
      loadData();
      currentTab = 'people';
      render();
      checkReminders();
    }, 1200);
  }, 7000);
}

function obFinish() {
  localStorage.setItem(OB_KEY, '1');
  document.getElementById('onboardingOverlay').style.display = 'none';
  loadData();
  render();
  checkReminders();
  showAnnPopup();
}

function obFinishWithFriend() {
  localStorage.setItem(OB_KEY, '1');
  document.getElementById('onboardingOverlay').style.display = 'none';
  loadData();
  currentTab = 'people';
  render();
  checkReminders();
  // FABボタンをパルスアニメーションで誘導
  setTimeout(() => {
    const fab = document.getElementById('fabBtn');
    if (fab) {
      fab.style.animation = 'fabPulseGuide 1s ease-in-out infinite';
      // ガイドメッセージ
      const guide = document.createElement('div');
      guide.id = 'fabGuide';
      guide.style.cssText = 'position:fixed;bottom:150px;right:20px;background:var(--card);border-radius:14px;padding:12px 16px;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:600;color:var(--text);z-index:161;animation:obFadeInOut 2s ease-in-out infinite;max-width:200px;text-align:center;';
      guide.textContent = 'まず友だちを登録しましょう';
      document.body.appendChild(guide);
      // FABクリックでガイド解除
      const origClick = fab.onclick;
      fab.addEventListener('click', function guideOff() {
        fab.style.animation = '';
        const g = document.getElementById('fabGuide');
        if (g) g.remove();
        fab.removeEventListener('click', guideOff);
        // メニュー内の「まとめて登録」もパルスさせる
        setTimeout(() => {
          const btns = document.querySelectorAll('#aiModal button');
          btns.forEach(b => {
            if (b.textContent.includes('まとめて登録')) {
              b.style.animation = 'fabPulseGuide 1.2s ease-in-out infinite';
              b.addEventListener('click', () => { b.style.animation = ''; }, { once: true });
            }
          });
        }, 300);
      }, { once: true });
    }
  }, 800);
}

function createSampleData() {
  // サンプルデータがなければ作成
  if (data.people.some(p=>p.id==='sample_person')) return;

  // 浅野さん（サンプル・開発者）
  data.people.push({
    id: 'sample_person', nickname: '浅野', fullName: '浅野',
    type: 'individual', gender: 'male', avatar: null, relation: 'AWAIの作り手',
    companyLink: null, position: null,
    anniversaries: [],
    sizes: {},
    smoking: null, drinking: null,
    interests: ['AI', 'アプリ開発', '経営', 'ゴルフ'],
    brands: [],
    oshi: [],
    foodLike: [],
    foodDislike: [],
    family: [],
    personality: ['行動が早い', '仕組みを作るのが好き'],
    memo: 'AWAIを作った人です。このカードを参考に、あなたの友だちを登録してみてください。\n\n各項目の？ボタンを押すと使い方のヒントが見れます。',
    counters: [],
    isSample: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });

  saveData();
}

// ===== Data Export / Import =====
function exportData() {
  try {
    const exportObj = {
      awai_data: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
      awai_my_profile: JSON.parse(localStorage.getItem('awai_my_profile') || 'null'),
      awai_season: localStorage.getItem(SEASON_KEY),
      awai_fontsize: localStorage.getItem(FONTSIZE_KEY),
      awai_pin: localStorage.getItem(PIN_KEY),
      awai_lock_method: localStorage.getItem(LOCK_METHOD_KEY),
      awai_elapsed_mode: localStorage.getItem('awai_elapsed_mode'),
      export_date: new Date().toISOString(),
      version: APP_VERSION
    };
    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = toLocalDateStr();
    a.href = url;
    a.download = 'awai_backup_' + dateStr + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    localStorage.setItem('awai_last_backup', new Date().toISOString());
    hideBackupBanner();
    showToast('バックアップを保存しました ✓');
  } catch(e) {
    console.error('Export error:', e);
    alert('バックアップに失敗しました: ' + e.message);
  }
}

function checkBackupReminder() {
  const banner = document.getElementById('backupBanner');
  if (!banner) return;
  const lastBackup = localStorage.getItem('awai_last_backup');
  if (!lastBackup) {
    // 一度もバックアップしていない＋データがある場合のみ表示
    const hasData = data.people.length > 0 || data.wish.length > 0 || data.place.length > 0;
    if (hasData) showBackupBanner('まだバックアップがありません');
    return;
  }
  const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince >= 3) {
    showBackupBanner(daysSince + '日間バックアップされていません');
  }
}

function showBackupBanner(msg) {
  const banner = document.getElementById('backupBanner');
  if (!banner) return;
  banner.innerHTML = `<div class="update-banner" style="background:linear-gradient(135deg,#fff3e0,#ffe0b2);border-color:#ffb74d;" onclick="exportData()">
    <span class="update-icon">💾</span>
    <span class="update-text" style="color:#e65100;">${msg}。タップしてバックアップしてください。</span>
    <span class="update-close" style="color:#ffb74d;" onclick="event.stopPropagation();this.parentElement.remove();">✕</span>
  </div>`;
}

function hideBackupBanner() {
  const banner = document.getElementById('backupBanner');
  if (banner) banner.innerHTML = '';
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.awai_data) {
        alert('AWAIのバックアップファイルではありません');
        return;
      }
      if (!confirm('現在のデータを上書きします。よろしいですか？')) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported.awai_data));
      if (imported.awai_my_profile) localStorage.setItem('awai_my_profile', JSON.stringify(imported.awai_my_profile));
      if (imported.awai_season) localStorage.setItem(SEASON_KEY, imported.awai_season);
      if (imported.awai_fontsize) localStorage.setItem(FONTSIZE_KEY, imported.awai_fontsize);
      if (imported.awai_pin) localStorage.setItem(PIN_KEY, imported.awai_pin);
      if (imported.awai_lock_method) localStorage.setItem(LOCK_METHOD_KEY, imported.awai_lock_method);
      if (imported.awai_elapsed_mode) localStorage.setItem('awai_elapsed_mode', imported.awai_elapsed_mode);
      loadData();
      renderList();
      showToast('データを復元しました ✓');
      document.getElementById('settingsModalOverlay').classList.remove('open');
    } catch(err) {
      console.error('Import error:', err);
      alert('ファイルの読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function saveSettings() {
  document.getElementById('settingsModalOverlay').classList.remove('open');
  showToast('保存しました');
}

function setFontSize(size) {
  document.body.dataset.fontsize = size;
  localStorage.setItem(FONTSIZE_KEY, size);
  document.querySelectorAll('.fsz-btn').forEach(b => {
    b.style.borderColor = b.dataset.sz===size ? 'var(--accent)' : 'var(--border)';
  });
}

function mdToHtml(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<div style="font-weight:600;margin-top:12px;margin-bottom:4px;">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:15px;margin-top:14px;margin-bottom:4px;">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-weight:700;font-size:16px;margin-top:14px;margin-bottom:6px;">$1</div>')
    .replace(/^\* (.+)$/gm, '<div style="padding-left:12px;">・$1</div>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:12px;">・$1</div>')
    .replace(/^\d+\. (.+)$/gm, (m, p1, offset, str) => `<div style="padding-left:12px;">${m.match(/^\d+/)[0]}. ${p1}</div>`)
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

let _lastAiSuggestions = [];
const AI_CACHE_KEY = 'awai_ai_cache';

// === 仕掛け1: 検索結果キャッシュ ===
function getAiCache(personId, scene, budget) {
  try {
    const cache = JSON.parse(localStorage.getItem(AI_CACHE_KEY) || '{}');
    const key = `${personId}_${scene||''}_${budget||''}`;
    const entry = cache[key];
    if (entry && Date.now() - entry.ts < 24*60*60*1000) return entry.data; // 24時間有効
    return null;
  } catch { return null; }
}

function setAiCache(personId, scene, budget, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(AI_CACHE_KEY) || '{}');
    const key = `${personId}_${scene||''}_${budget||''}`;
    // 古いキャッシュを50件まで制限
    const keys = Object.keys(cache);
    if (keys.length > 50) { keys.sort((a,b)=>cache[a].ts-cache[b].ts); delete cache[keys[0]]; }
    cache[key] = { ts: Date.now(), data };
    localStorage.setItem(AI_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// === 仕掛け3: 人物カードに提案履歴を保存 ===
function saveAiHistory(personId, suggestions, scene, budget) {
  const person = data.people.find(p=>p.id===personId);
  if (!person) return;
  if (!person.aiHistory) person.aiHistory = [];
  person.aiHistory.unshift({
    date: new Date().toISOString().split('T')[0],
    scene: scene || '',
    budget: budget || '',
    items: suggestions.map(s => ({
      name: s.name, shop: s.shop, reason: s.reason, budget: s.budget,
      category: s.category || null,
      rakutenUrl: s.rakuten?.url || null, amazonUrl: s.amazonUrl || null,
      webLinks: s.webLinks || null, image: s.rakuten?.image || null
    }))
  });
  // 最新10回分まで保持
  if (person.aiHistory.length > 10) person.aiHistory = person.aiHistory.slice(0, 10);
  saveData();
}

// === 仕掛け5: 類似の人に横展開 ===
function findSimilarPeople(personId) {
  const person = data.people.find(p=>p.id===personId);
  if (!person) return [];
  const myTags = [...(person.interests||[]), ...(person.brands||[]), ...(person.foodLike||[])];
  if (!myTags.length) return [];
  return data.people.filter(p => {
    if (p.id === personId || p.isMemory || p.type === 'corporate') return false;
    const theirTags = [...(p.interests||[]), ...(p.brands||[]), ...(p.foodLike||[])];
    return myTags.some(t => theirTags.includes(t));
  }).slice(0, 3);
}

// 仕掛け5改善: 類似の人に通知（5秒トースト＋タップで飛べる＋通知ベルに保存）
const SIMILAR_NOTIF_KEY = 'awai_similar_notifs';

function notifySimilarPeople(similarPeople, suggestions) {
  if (!similarPeople.length) return;
  const names = similarPeople.map(p => p.nickname).join('、');
  const firstPerson = similarPeople[0];

  // 5秒トースト＋タップでその人のコンシェルジュへ
  setTimeout(() => {
    showToast(`💡 ${names} さんにも合いそう！タップで提案`, 5000, () => {
      openAiSuggest(firstPerson.id);
    });
  }, 1500);

  // 通知ベルに保存（後で見返せる）
  try {
    const notifs = JSON.parse(localStorage.getItem(SIMILAR_NOTIF_KEY) || '[]');
    const itemNames = suggestions.slice(0, 3).map(s => s.name).join('、');
    similarPeople.forEach(sp => {
      const key = `similar_${sp.id}_${new Date().toISOString().split('T')[0]}`;
      if (!notifs.some(n => n.key === key)) {
        notifs.unshift({
          key,
          personId: sp.id,
          personName: sp.nickname,
          items: itemNames,
          dismissed: false,
          createdAt: new Date().toISOString()
        });
      }
    });
    // 最新20件まで
    if (notifs.length > 20) notifs.length = 20;
    localStorage.setItem(SIMILAR_NOTIF_KEY, JSON.stringify(notifs));
  } catch {}
}

function renderSimilarNotifs() {
  try {
    const notifs = JSON.parse(localStorage.getItem(SIMILAR_NOTIF_KEY) || '[]');
    const active = notifs.filter(n => !n.dismissed);
    if (!active.length) return '';
    let html = '<div style="margin-bottom:16px;">';
    html += '<div style="font-weight:600;font-size:14px;margin-bottom:8px;">💡 この人にも合いそう</div>';
    active.forEach(n => {
      html += `<div style="background:linear-gradient(135deg,#f3eefa,#ece0f8);border:1px solid #d4c8e8;border-radius:12px;padding:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:13px;font-weight:500;">${esc(n.personName)} さん</div>
          <div style="font-size:12px;color:var(--sub);">${esc(n.items)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="event.stopPropagation();closeModal();openAiSuggest('${n.personId}')" style="padding:6px 10px;border-radius:8px;background:var(--accent);color:#fff;border:none;font-size:11px;cursor:pointer;">💡 提案</button>
          <button onclick="event.stopPropagation();dismissSimilarNotif('${n.key}')" style="padding:6px 8px;border-radius:8px;background:none;border:none;font-size:11px;cursor:pointer;color:var(--sub);">✕</button>
        </div>
      </div>`;
    });
    html += '</div>';
    return html;
  } catch { return ''; }
}

function dismissSimilarNotif(key) {
  try {
    const notifs = JSON.parse(localStorage.getItem(SIMILAR_NOTIF_KEY) || '[]');
    const n = notifs.find(n => n.key === key);
    if (n) n.dismissed = true;
    localStorage.setItem(SIMILAR_NOTIF_KEY, JSON.stringify(notifs));
    openNotifications();
  } catch {}
}

// ===== AWAI Personality Engine =====
const AWAI_STATS_KEY = 'awai_personality_stats';

function getAwaiStats() {
  try {
    return JSON.parse(localStorage.getItem(AWAI_STATS_KEY) || '{}');
  } catch { return {}; }
}

function saveAwaiStats(stats) {
  localStorage.setItem(AWAI_STATS_KEY, JSON.stringify(stats));
}

function trackAppOpen() {
  const stats = getAwaiStats();
  if (!stats.createdAt) stats.createdAt = new Date().toISOString();
  if (!stats.openCount) stats.openCount = 0;
  // 1日1回だけカウント（同じ日に何回開いても1回）
  const today = new Date().toISOString().split('T')[0];
  if (stats.lastOpenDate !== today) {
    stats.openCount++;
    stats.lastOpenDate = today;
  }
  saveAwaiStats(stats);
}

function calcCardDepth(person) {
  if (!person || person.isMemory) return 0;
  let score = 0;
  // 基本情報 (10点)
  if (person.nickname) score += 5;
  if (person.relation) score += 5;
  // 好み (15点)
  const likeCount = (person.interests?.length||0) + (person.brands?.length||0) + (person.foodLike?.length||0);
  if (likeCount >= 5) score += 15;
  else if (likeCount >= 3) score += 10;
  else if (likeCount >= 1) score += 5;
  // 苦手 (5点)
  if (person.foodDislike?.length) score += 5;
  // 記念日 (15点)
  const annCount = person.anniversaries?.length || 0;
  if (annCount >= 3) score += 15;
  else if (annCount >= 1) score += annCount * 5;
  // 性格 (10点)
  if (person.personality?.length) score += 10;
  // サイズ (5点)
  if (person.sizes && Object.values(person.sizes).some(v=>v)) score += 5;
  // メモ (5点)
  if (person.memo) score += 5;
  // ギフト履歴 (20点)
  const giftCount = [...(data.gave||[]), ...(data.received||[])].filter(
    item => item.person && person.nickname && item.person.includes(person.nickname)
  ).length;
  if (giftCount >= 4) score += 20;
  else score += giftCount * 5;
  // コンシェルジュ利用 (10点)
  if (person.aiHistory?.length) score += 10;
  // 写真 (5点)
  if (person.avatar) score += 5;
  return Math.min(score, 100);
}

function getDeeplyCaredCount() {
  return data.people.filter(p => !p.isMemory && p.type !== 'corporate' && calcCardDepth(p) >= 50).length;
}

function getGiftCount() {
  return (data.gave?.length || 0);
}

function getAwaiStage() {
  const stats = getAwaiStats();
  const daysSinceCreation = stats.createdAt
    ? Math.floor((Date.now() - new Date(stats.createdAt).getTime()) / (1000*60*60*24))
    : 0;
  const openCount = stats.openCount || 0;
  const caredCount = getDeeplyCaredCount();
  const giftCount = getGiftCount();

  // 各条件で到達可能な最大ステージを計算
  const dayStage = daysSinceCreation >= 365 ? 4 : daysSinceCreation >= 180 ? 3 : daysSinceCreation >= 60 ? 2 : daysSinceCreation >= 14 ? 1 : 0;
  const caredStage = caredCount >= 30 ? 4 : caredCount >= 20 ? 3 : caredCount >= 10 ? 2 : caredCount >= 3 ? 1 : 0;
  const openStage = openCount >= 1000 ? 4 : openCount >= 500 ? 3 : openCount >= 200 ? 2 : openCount >= 50 ? 1 : 0;
  const giftStage = giftCount >= 50 ? 4 : giftCount >= 30 ? 3 : giftCount >= 10 ? 2 : giftCount >= 3 ? 1 : 0;

  // 全条件の最小値 = 実際のステージ（全てが揃って初めて上がる）
  const stage = Math.min(dayStage, caredStage, openStage, giftStage);

  const stages = [
    { icon: '🌱', name: 'はじまり', sub: 'AWAIとの出会い' },
    { icon: '🌿', name: 'なじみ', sub: 'AWAIが少しずつあなたを知り始めました' },
    { icon: '🌸', name: '信頼', sub: 'AWAIはあなたの大切な人を覚えています' },
    { icon: '🌳', name: '絆', sub: 'AWAIはあなたの想いを深く理解しています' },
    { icon: '💎', name: 'かけがえのない', sub: 'AWAIはあなたにとって、なくてはならない存在' },
  ];

  return {
    level: stage,
    ...stages[stage],
    days: daysSinceCreation,
    openCount,
    caredCount,
    giftCount,
    // 次のステージへの進捗
    nextRequirements: stage < 4 ? {
      days: [0, 14, 60, 180, 365][stage+1],
      cared: [0, 3, 10, 20, 30][stage+1],
      opens: [0, 50, 200, 500, 1000][stage+1],
      gifts: [0, 3, 10, 30, 50][stage+1],
    } : null
  };
}

function updateAwaiStageDisplay() {
  const stage = getAwaiStage();
  const iconEl = document.getElementById('awaiStageIcon');
  const subEl = document.getElementById('awaiSubtitle');
  if (iconEl) iconEl.textContent = stage.icon;
  if (subEl) subEl.textContent = stage.sub;

  // ステージアップ検知
  const stats = getAwaiStats();
  if (stats.lastStage !== undefined && stats.lastStage < stage.level) {
    setTimeout(() => {
      showToast(`${stage.icon} AWAIが「${stage.name}」に成長しました！`, 5000);
    }, 1000);
  }
  stats.lastStage = stage.level;
  saveAwaiStats(stats);
}

// ===== ② 口調の変化（コンシェルジュキャラクター） =====
function getAwaiTonePrompt() {
  const stage = getAwaiStage();
  const myProfile = getMyProfile();
  const userName = myProfile.name || '';
  const userGender = myProfile.gender || 'unset';

  const charBase = `あなたの名前は「AWAI（アワイ）」。30歳の女性で、都会的でキャリアのあるギフトコンシェルジュ。
温かみと愛嬌があるが、仕事ができて的確。センスがいい。
聞かれたら全力で答えるが、聞かれていないのにおせっかいはしない。
せかさない。同調的でない提案はしない。ユーザーの判断を尊重する。`;

  const tones = [
    // 🌱 はじまり
    `${charBase}
初対面。丁寧な敬語で話す。「〜ですね」「〜はいかがですか？」
まだ相手のことをよく知らないので、控えめに。`,
    // 🌿 なじみ
    `${charBase}
少し打ち解けた関係。丁寧だが柔らかい。「〜ですよ！」「〜いいと思います！」
相手の登録情報を活かした提案ができる。`,
    // 🌸 信頼
    `${charBase}
信頼関係ができている。親しみを込めた敬語。時々フランクに。「〜ですよね！」「〜かなり自信あります！」
${userName ? userName + 'さんと呼ぶ。' : ''}相手の好みを覚えていることを自然に示す。`,
    // 🌳 絆
    `${charBase}
深い信頼。頼れる相棒。「〜でいきましょう！」「間違いないです」「任せてください！」
${userName ? userName + 'さんと親しみを込めて呼ぶ。' : ''}自信のある提案。時々「〜ですね笑」と柔らかく崩す。`,
    // 💎 かけがえのない
    `${charBase}
かけがえのないパートナー。「お任せください！」「もう好みわかってますから」
${userName ? userName + 'さんへの感謝を時々伝える。' : ''}自信と愛嬌のバランス。「ちょっと偉そうですね笑」と自分でツッコむ余裕。`
  ];
  return tones[stage.level] || tones[0];
}

// ===== ③ 褒めるフィードバック =====
function awaiFeedback(action, detail) {
  const stage = getAwaiStage();
  if (stage.level < 1) return; // 🌿なじみ以上で発動
  const myProfile = getMyProfile();
  const userName = myProfile.name ? myProfile.name + 'さん' : '';

  let msg = '';
  if (action === 'addPerson') {
    const count = data.people.filter(p=>!p.isMemory).length;
    if (stage.level >= 3) {
      msg = `${userName ? userName + '、' : ''}大切な人が${count}人になりましたね`;
    } else {
      msg = `${detail || ''}さんのこと、覚えました！`;
    }
  } else if (action === 'addGift') {
    const person = detail || '';
    const personGifts = data.gave?.filter(g => g.person && person && g.person.includes(person)).length || 0;
    if (personGifts > 1) {
      msg = `${person}さんへの${personGifts}回目の贈り物ですね。素敵です`;
    } else {
      msg = `贈り物の記録、ありがとうございます`;
    }
  } else if (action === 'enrichCard') {
    if (stage.level >= 2) {
      msg = `情報が充実してきましたね。もっといい提案ができます！`;
    }
  }
  if (msg) setTimeout(() => showToast(msg, 3000), 500);
}

// ===== ④ 思い出を返す =====
function getAwaiMemory() {
  const today = new Date();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  const todayMD = `${mm}-${dd}`;
  const memories = [];
  const myProfile = getMyProfile();
  const userName = myProfile.name ? myProfile.name + 'さん' : '';

  // 1年前の今日のギフト
  (data.gave||[]).forEach(item => {
    if (!item.date || !item.person) return;
    if (item.date.slice(5) === todayMD && item.date.slice(0,4) !== String(today.getFullYear())) {
      const yearsAgo = today.getFullYear() - parseInt(item.date.slice(0,4));
      if (yearsAgo > 0) {
        memories.push(`${yearsAgo}年前の今日、${item.person}さんに「${item.title}」を贈りましたよね。素敵なチョイスでした`);
      }
    }
  });

  return memories;
}

function showAwaiMemory() {
  const stage = getAwaiStage();
  if (stage.level < 2) return; // 🌸信頼以上で発動
  const memories = getAwaiMemory();
  if (!memories.length) return;

  const shown = localStorage.getItem('awai_memory_shown_date');
  const today = new Date().toISOString().split('T')[0];
  if (shown === today) return;
  localStorage.setItem('awai_memory_shown_date', today);

  const memory = memories[Math.floor(Math.random() * memories.length)];
  const modal = document.getElementById('aiModal');
  modal.innerHTML = `<div style="text-align:center;padding:24px;">
    <div style="font-size:40px;margin-bottom:16px;">${stage.icon}</div>
    <div style="font-size:15px;font-family:'Shippori Mincho',serif;line-height:1.8;margin-bottom:20px;">${esc(memory)}</div>
    <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')" style="padding:10px 24px;">ありがとう</button>
  </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

function deleteAiHistory(personId, idx) {
  if (!confirm('この提案履歴を削除しますか？')) return;
  const person = data.people.find(p=>p.id===personId);
  if (!person || !person.aiHistory) return;
  person.aiHistory.splice(idx, 1);
  saveData(); render();
  showToast('提案履歴を削除しました');
}

async function callAI(prompt, context, structured, skipAuth, onboarding) {
  checkActionCelebration('first_ai');
  let token = '';
  if (!skipAuth) {
    if (!_sbUser) throw new Error('AIコンシェルジュを使うにはログインが必要です');
    const session = await _sb.auth.getSession();
    token = session?.data?.session?.access_token || '';
    if (!token) throw new Error('セッションが無効です。再ログインしてください');
  }
  const res = await fetch(AI_EDGE_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (token || ''),
      'apikey': SUPABASE_KEY
    },
    body: JSON.stringify({ message: prompt, context: context || '', structured: !!structured, tone: skipAuth ? '' : getAwaiTonePrompt(), onboarding: !!onboarding })
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('AI API error:', res.status, errText);
    throw new Error(`AIコンシェルジュ エラー (${res.status})`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  if (structured && json.suggestions) return json;
  return json.reply;
}

function renderAiCards(suggestions, personId, container) {
  const person = data.people.find(p=>p.id===personId);
  _lastAiSuggestions = suggestions;
  let html = '';
  suggestions.forEach((s, i) => {
    const hasRakuten = s.rakuten && s.rakuten.url;
    const rakutenImg = s.rakuten?.image ? `<div style="text-align:center;margin-bottom:12px;"><img src="${esc(s.rakuten.image)}" style="max-width:140px;max-height:140px;border-radius:12px;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,0.08);"></div>` : '';
    const price = s.rakuten?.price ? `¥${Number(s.rakuten.price).toLocaleString()}` : (s.budget ? `約¥${Number(s.budget).toLocaleString()}` : '');
    const _lb = 'display:inline-flex;align-items:center;gap:4px;padding:7px 14px;border-radius:10px;font-size:12px;text-decoration:none;font-weight:600;';
    const rakutenBtn = hasRakuten ? `<a href="${esc(s.rakuten.url)}" target="_blank" rel="noopener" style="${_lb}background:#BF0000;color:#fff;">🛒 楽天で見る</a>` : '';
    const amazonBtn = `<a href="${esc(s.amazonUrl)}" target="_blank" rel="noopener" style="${_lb}background:#FF9900;color:#000;">🛒 Amazonで見る</a>`;
    const _ls = 'display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;font-size:11px;text-decoration:none;font-weight:500;';
    let webLinksHtml = '';
    if (s.webLinks) {
      const wl = s.webLinks;
      if (wl.official) webLinksHtml += `<a href="${esc(wl.official)}" target="_blank" rel="noopener" style="${_ls}background:#4A90D9;color:#fff;">🔗 公式サイト</a>`;
      if (wl.instagram) webLinksHtml += `<a href="${esc(wl.instagram)}" target="_blank" rel="noopener" style="${_ls}background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;">📸 Instagram</a>`;
      if (wl.tabelog) webLinksHtml += `<a href="${esc(wl.tabelog)}" target="_blank" rel="noopener" style="${_ls}background:#F09000;color:#fff;">🍽 食べログ</a>`;
      if (wl.hotpepper) webLinksHtml += `<a href="${esc(wl.hotpepper)}" target="_blank" rel="noopener" style="${_ls}background:#E60012;color:#fff;">🔥 ホットペッパー</a>`;
      if (wl.gurunavi) webLinksHtml += `<a href="${esc(wl.gurunavi)}" target="_blank" rel="noopener" style="${_ls}background:#E2001A;color:#fff;">🍴 ぐるなび</a>`;
    }
    const _ab = 'padding:8px 14px;border-radius:10px;font-size:12px;cursor:pointer;font-family:"Zen Maru Gothic",sans-serif;font-weight:500;';
    const saveBtn = `<button onclick="saveAiSuggestion('wish','${personId}',${i})" style="${_ab}background:linear-gradient(135deg,var(--pickup),#fff4e6);border:1px solid var(--pickup-border);color:var(--text);">⭐ お気に入りに保存</button>`;
    const placeBtn = s.isPlace ? `<button onclick="saveAiSuggestion('place','${personId}',${i})" style="${_ab}background:linear-gradient(135deg,#e8f2fc,#daeaf8);border:1px solid #bdd8f0;color:#4a7aaa;">📍 行きたいに追加</button>` : '';

    html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 2px 8px var(--shadow);">
      ${rakutenImg}
      <div style="font-weight:700;font-size:17px;font-family:'Shippori Mincho',serif;line-height:1.4;margin-bottom:4px;">${esc(s.name)}</div>
      <div style="font-size:13px;color:var(--sub);margin-bottom:8px;">${esc(s.shop)}${price ? ' · ' + price : ''}</div>
      <div style="font-size:14px;margin-bottom:12px;line-height:1.7;color:var(--text);">${esc(s.reason)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${rakutenBtn}${amazonBtn}
      </div>
      ${webLinksHtml ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${webLinksHtml}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px;">
        ${saveBtn}${placeBtn}
      </div>
    </div>`;
  });

  // まとめて保存＋別の提案ボタン
  const _fb = 'display:flex;align-items:center;justify-content:center;gap:6px;padding:14px 20px;border-radius:14px;font-size:14px;font-weight:500;cursor:pointer;font-family:"Zen Maru Gothic",sans-serif;';
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;margin-bottom:24px;">
    <button onclick="saveAllAiSuggestions('${personId}')" style="${_fb}background:linear-gradient(135deg,var(--pickup),#fff4e6);border:1px solid var(--pickup-border);color:var(--text);">📥 まとめて保存</button>
    <button onclick="document.getElementById('aiSuggestBtn').dataset.forceNew='1';runAiSuggest('${personId}')" style="${_fb}background:linear-gradient(135deg,#f3eefa,#ece0f8);border:1px solid #d4c8e8;color:#7a60a0;">🔄 別の提案を探す</button>
  </div>`;
  container.innerHTML = html;
}

// 仕掛け2: 全部保存
function saveAllAiSuggestions(personId) {
  if (!_lastAiSuggestions.length) return;
  let count = 0;
  _lastAiSuggestions.forEach((s, i) => {
    saveAiSuggestion(s.isPlace ? 'place' : 'wish', personId, i, true);
    count++;
  });
  showToast(`📥 ${count}件まとめて保存しました`);
}

function saveAiSuggestion(tab, personId, idx, silent) {
  const s = _lastAiSuggestions[idx];
  if (!s) return;
  const person = data.people.find(p=>p.id===personId);
  const now = new Date().toISOString();

  function buildAiLinks(s) {
    const links = {};
    if (s.rakuten?.url) links.rakuten = s.rakuten.url;
    if (s.amazonUrl) links.amazon = s.amazonUrl;
    if (s.webLinks) {
      if (s.webLinks.official) links.official = s.webLinks.official;
      if (s.webLinks.instagram) links.instagram = s.webLinks.instagram;
      if (s.webLinks.tabelog) links.tabelog = s.webLinks.tabelog;
      if (s.webLinks.hotpepper) links.hotpepper = s.webLinks.hotpepper;
      if (s.webLinks.gurunavi) links.gurunavi = s.webLinks.gurunavi;
    }
    return Object.keys(links).length ? links : null;
  }

  if (tab === 'wish') {
    const item = {
      id: genId(),
      title: s.name,
      purpose: null,
      giftTarget: person?.nickname || null,
      person: person?.nickname || null,
      labelIdx: null,
      itemCategory: (!s.isPlace && s.category) ? s.category : null,
      occasion: null,
      amount: String(s.rakuten?.price || s.budget || ''),
      date: new Date().toISOString().split('T')[0],
      rating: 0,
      tags: null,
      url: s.rakuten?.url || s.amazonUrl || null,
      memo: `${s.shop} — ${s.reason}`,
      aiLinks: buildAiLinks(s),
      img: s.rakuten?.image || null,
      pinned: false,
      createdAt: now,
      updatedAt: now
    };
    data.wish.push(item);
    saveData(); if (!silent) render();
    if (!silent) showToast(`⭐ "${s.name}" をお気に入りに保存しました`);
    // 仕掛け5: 類似の人に横展開
    if (!silent) {
      const similar = findSimilarPeople(personId);
      if (similar.length) {
        notifySimilarPeople(similar, _lastAiSuggestions);
      }
    }
  } else if (tab === 'place') {
    const wl = s.webLinks || {};
    const item = {
      id: genId(),
      title: s.shop || s.name,
      withPeople: person ? [person.id] : [],
      withGroups: [],
      person: person?.nickname || null,
      labelIdx: null,
      address: null,
      mapUrl: wl.official || wl.tabelog || wl.hotpepper || null,
      url: wl.official || s.rakuten?.url || s.amazonUrl || null,
      googleMapUrl: `https://www.google.com/maps/search/${encodeURIComponent(s.shop || s.name)}`,
      phone: null,
      tags: null,
      placeCategory: (s.isPlace && s.category) ? s.category : null,
      rating: 0,
      memo: `${s.shop} — ${s.reason}`,
      aiLinks: buildAiLinks(s),
      img: null,
      pinned: false,
      createdAt: now,
      updatedAt: now
    };
    data.place.push(item);
    saveData(); if (!silent) render();
    if (!silent) showToast(`📍 "${s.shop || s.name}" を行きたいに保存しました`);
  }
}

function openAiSuggest(personId) {
  const person = data.people.find(p=>p.id===personId);
  if (!person) return;
  const modal = document.getElementById('aiModal');

  // Build profile summary for display (ローカル表示用・実名OK)
  const profile = [];
  profile.push(`呼び名: ${person.nickname}`);
  if (person.relation) profile.push(`関係: ${person.relation}`);
  if (person.interests?.length) profile.push(`好きなもの・趣味: ${person.interests.join(', ')}`);
  if (person.brands?.length) profile.push(`好きなブランド・色: ${person.brands.join(', ')}`);
  if (person.oshi?.length) profile.push(`推し活: ${person.oshi.join(', ')}`);
  if (person.foodLike?.length) profile.push(`食の好み（好き）: ${person.foodLike.join(', ')}`);
  if (person.foodDislike?.length) profile.push(`食の好み（苦手）: ${person.foodDislike.join(', ')}`);
  if (person.drinking) profile.push(`お酒: ${person.drinking}`);
  if (person.smoking) profile.push(`タバコ: ${person.smoking}`);
  if (person.personality?.length) profile.push(`個性: ${person.personality.join(', ')}`);
  if (person.sizes) {
    const sz = Object.entries(person.sizes).filter(([k,v])=>v).map(([k,v])=>`${k}:${v}`);
    if (sz.length) profile.push(`サイズ: ${sz.join(', ')}`);
  }
  if (person.family?.length) profile.push(`家族: ${person.family.map(f=>f.name+(f.note?' ('+f.note+')':'')).join(', ')}`);
  if (person.memo) profile.push(`メモ: ${person.memo}`);

  // Gift history
  const history = [];
  ['received','gave'].forEach(tab => {
    data[tab].forEach(item => {
      if (item.person && person.nickname && item.person.includes(person.nickname)) {
        history.push(`${tab==='gave'?'あげた':'もらった'}: ${item.title} (${item.date||'日付不明'})`);
      }
    });
  });
  if (history.length) profile.push(`贈り物の履歴:\n${history.join('\n')}`);

  // Upcoming anniversaries
  (person.anniversaries||[]).forEach(a => {
    const days = daysUntil(a.date, a.dateType);
    if (days!==null) profile.push(`記念日: ${a.name} ${formatAnnDate(a.date,a.dateType)} (あと${days}日)`);
  });

  modal.innerHTML = `<h2>💡 ${esc(person.nickname)} へのギフト コンシェルジュ</h2>
    <div style="background:var(--bg);border-radius:12px;padding:10px;font-size:12px;margin-bottom:12px;max-height:150px;overflow-y:auto;">
      <div style="font-size:11px;color:var(--sub);margin-bottom:4px;">プロフィール情報</div>
      ${profile.map(l=>`<div>${esc(l)}</div>`).join('')}
    </div>
    <div class="form-group"><label>場面・シチュエーション（任意）</label>
      <input id="aiScene" placeholder="例：誕生日、京都旅行のお土産、お礼">
      <div class="form-hint">空欄でもOK。場面を入れるとより具体的な提案になります</div>
    </div>
    <div class="form-group"><label>予算（任意）</label>
      <input id="aiBudget" placeholder="例：5000">
    </div>
    <div class="form-btns" style="margin-bottom:12px;">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
      <button class="btn btn-primary" id="aiSuggestBtn" onclick="runAiSuggest('${personId}')">✨ 提案をもらう</button>
    </div>
    <div id="aiResult" style="font-size:13px;line-height:1.8;white-space:pre-wrap;"></div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

// ===== 匿名化ユーティリティ =====
// 個人名をAIに送信せず、属性情報のみで提案を受ける
function buildAnonymizedProfile(person) {
  const profileLines = [];
  if (person.relation) profileLines.push(`関係: ${person.relation}`);
  if (person.gender) profileLines.push(`性別: ${person.gender === 'male' ? '男性' : person.gender === 'female' ? '女性' : '未設定'}`);
  if (person.interests?.length) profileLines.push(`好きなもの: ${person.interests.join(', ')}`);
  if (person.brands?.length) profileLines.push(`好きなブランド: ${person.brands.join(', ')}`);
  if (person.oshi?.length) profileLines.push(`推し活: ${person.oshi.join(', ')}`);
  if (person.foodLike?.length) profileLines.push(`好きな食べ物: ${person.foodLike.join(', ')}`);
  if (person.foodDislike?.length) profileLines.push(`苦手な食べ物: ${person.foodDislike.join(', ')}`);
  if (person.drinking) profileLines.push(`お酒: ${person.drinking}`);
  if (person.smoking) profileLines.push(`タバコ: ${person.smoking}`);
  if (person.personality?.length) profileLines.push(`性格: ${person.personality.join(', ')}`);
  // メモは個人名が含まれる可能性があるので匿名化
  if (person.memo) profileLines.push(`メモ: ${anonymizeText(person.memo)}`);
  const sizes = person.sizes ? Object.entries(person.sizes).filter(([k,v])=>v).map(([k,v])=>`${k}:${v}`) : [];
  if (sizes.length) profileLines.push(`サイズ: ${sizes.join(', ')}`);
  // 家族情報は関係性のみ（名前を除去）
  if (person.family?.length) profileLines.push(`家族: ${person.family.map(f=>(f.note||'家族')).join(', ')}`);
  return profileLines;
}

function anonymizeText(text) {
  if (!text) return text;
  let result = text;
  // 登録済みの人物名を「〇〇」に置換
  data.people.forEach(p => {
    if (p.nickname && p.nickname.length >= 2) {
      result = result.replace(new RegExp(escapeRegex(p.nickname), 'g'), '相手');
    }
    if (p.fullName && p.fullName.length >= 2) {
      result = result.replace(new RegExp(escapeRegex(p.fullName), 'g'), '相手');
    }
  });
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runAiSuggest(personId) {
  const person = data.people.find(p=>p.id===personId);
  if (!person) return;

  const resultDiv = document.getElementById('aiResult');
  const btn = document.getElementById('aiSuggestBtn');
  btn.disabled = true; btn.textContent = '探しています...';
  resultDiv.innerHTML = '' + conciergeWaitingHtml('登録情報をもとにお探しします・・・', 'あなたのコンシェルジュが') + '';

  // 匿名化されたプロフィールを構築（名前・個人特定情報を除去）
  const profileLines = buildAnonymizedProfile(person);

  const history = [];
  ['gave','received'].forEach(tab => {
    data[tab].forEach(item => {
      if (item.person && person.nickname && item.person.includes(person.nickname)) {
        history.push(`${tab==='gave'?'あげた':'もらった'}: ${item.title}`);
      }
    });
  });

  const scene = document.getElementById('aiScene')?.value.trim()||'';
  const budget = document.getElementById('aiBudget')?.value.trim()||'';

  // 匿名化プロンプト: 名前の代わりに「この方」を使用
  const prompt = `以下の方に心のこもった贈り物を3つ提案してください。

## 相手のプロフィール
${profileLines.join('\n')}
${history.length ? '\n## 過去の贈り物\n'+history.join('\n') : ''}
${scene ? '\n## 場面\n'+scene : ''}
${budget ? '\n## 予算\n約'+budget+'円' : ''}

苦手なものは絶対に避けてください。過去にあげたものと被らないでください。`;

  try {
    // 仕掛け1: キャッシュ確認（「別の提案を探す」時はスキップ）
    const forceNew = btn.dataset.forceNew === '1';
    btn.dataset.forceNew = '0';
    let result = null;
    if (!forceNew) {
      const cached = getAiCache(personId, scene, budget);
      if (cached) {
        result = cached;
        resultDiv.innerHTML = '';
      }
    }

    if (!result) {
      result = await callAI(prompt, profileLines.join('\n'), true);
      // キャッシュに保存
      if (result.suggestions) setAiCache(personId, scene, budget, result);
    }

    if (result.suggestions && result.suggestions.length) {
      renderAiCards(result.suggestions, personId, resultDiv);
      // 仕掛け3: 提案履歴を人物カードに保存
      saveAiHistory(personId, result.suggestions, scene, budget);
      // 仕掛け5: 類似の人に横展開
      const similar = findSimilarPeople(personId);
      if (similar.length) {
        notifySimilarPeople(similar, result.suggestions);
      }
    } else {
      const text = typeof result === 'string' ? result : (result.reply || '提案を生成できませんでした');
      resultDiv.innerHTML = `<div style="background:var(--pickup);border:1px solid var(--pickup-border);border-radius:14px;padding:14px;">
        <div style="font-weight:600;margin-bottom:8px;font-family:'Shippori Mincho',serif;">💡 ${esc(person.nickname)} への提案</div>
        <div>${mdToHtml(text)}</div>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <button class="btn btn-secondary" onclick="document.getElementById('aiSuggestBtn').dataset.forceNew='1';runAiSuggest('${personId}')" style="font-size:13px;padding:8px 20px;">🔄 別の提案を探す</button>
      </div>`;
    }
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#c97070;padding:12px;">エラー: ${esc(e.message)}</div>`;
  }
  btn.disabled = false; btn.textContent = '✨ 提案をもらう';
}

// ===== FAB Menu for People Tab =====
function openPeopleFabMenu() {
  const modal = document.getElementById('aiModal');
  modal.innerHTML = `<h2>友だちを追加</h2>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');openPeopleModal()" style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:14px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;text-align:left;">
        <span style="font-size:24px;">👤</span>
        <div><div style="font-size:14px;font-weight:500;">手動で追加</div><div style="font-size:11px;color:var(--sub);">名前や情報を入力して登録</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startOcr('line_friends')" style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:14px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;text-align:left;">
        <span style="font-size:24px;">📷</span>
        <div><div style="font-size:14px;font-weight:500;">まとめて登録</div><div style="font-size:11px;color:var(--sub);">スクリーンショットから名前を読み取り</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startOcr('business_card')" style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:14px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;text-align:left;">
        <span style="font-size:24px;">🪪</span>
        <div><div style="font-size:14px;font-weight:500;">名刺スキャン</div><div style="font-size:11px;color:var(--sub);">名刺の写真から自動入力</div></div>
      </button>
    </div>
    <div class="form-btns" style="margin-top:12px;">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

// ===== FAB Menu for Wish (お気に入り) Tab =====
function openWishFabMenu() {
  const modal = document.getElementById('aiModal');
  modal.innerHTML = `<h2>ほしいものを登録</h2>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');openItemModal()" class="fab-menu-btn">
        <span style="font-size:24px;">✏️</span>
        <div><div style="font-size:14px;font-weight:500;">手動で追加</div><div style="font-size:11px;color:var(--sub);">名前やカテゴリを入力して登録</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startItemOcr('item_ocr','wish','camera')" class="fab-menu-btn">
        <span style="font-size:24px;">📷</span>
        <div><div style="font-size:14px;font-weight:500;">カメラで撮影</div><div style="font-size:11px;color:var(--sub);">商品を撮影してAIが自動判定</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startItemOcr('item_ocr','wish','file')" class="fab-menu-btn">
        <span style="font-size:24px;">📁</span>
        <div><div style="font-size:14px;font-weight:500;">ファイルから選択</div><div style="font-size:11px;color:var(--sub);">スクリーンショットもOK！</div></div>
      </button>
    </div>
    <div class="form-btns" style="margin-top:12px;">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

// ===== FAB Menu for Place (行きたい) Tab =====
function openPlaceFabMenu() {
  const modal = document.getElementById('aiModal');
  modal.innerHTML = `<h2>行きたい場所を登録</h2>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');openPlaceModal()" class="fab-menu-btn">
        <span style="font-size:24px;">✏️</span>
        <div><div style="font-size:14px;font-weight:500;">手動で追加</div><div style="font-size:11px;color:var(--sub);">場所の名前や情報を入力して登録</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startItemOcr('place_ocr','place','camera')" class="fab-menu-btn">
        <span style="font-size:24px;">📷</span>
        <div><div style="font-size:14px;font-weight:500;">カメラで撮影</div><div style="font-size:11px;color:var(--sub);">お店や場所を撮影してAIが自動判定</div></div>
      </button>
      <button onclick="document.getElementById('aiModalOverlay').classList.remove('open');startItemOcr('place_ocr','place','file')" class="fab-menu-btn">
        <span style="font-size:24px;">📁</span>
        <div><div style="font-size:14px;font-weight:500;">ファイルから選択</div><div style="font-size:11px;color:var(--sub);">スクリーンショットもOK！</div></div>
      </button>
    </div>
    <div class="form-btns" style="margin-top:12px;">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

// ===== FAB Menu for Gift (ギフト) Tab =====
let _giftFabType = null; // 'received' or 'gave'
function openGiftFabMenu() {
  _giftFabType = null;
  const modal = document.getElementById('aiModal');
  modal.innerHTML = `<h2>ギフトを登録</h2>
    <div style="display:flex;gap:10px;margin-bottom:16px;">
      <button id="giftFabRecv" onclick="selectGiftFabType('received')" style="flex:1;padding:14px 8px;border-radius:14px;border:2px solid var(--border);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;font-size:15px;font-weight:600;transition:all 0.25s ease;text-align:center;">
        <div style="font-size:28px;margin-bottom:4px;">🎀</div>もらった
      </button>
      <button id="giftFabGave" onclick="selectGiftFabType('gave')" style="flex:1;padding:14px 8px;border-radius:14px;border:2px solid var(--border);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;font-size:15px;font-weight:600;transition:all 0.25s ease;text-align:center;">
        <div style="font-size:28px;margin-bottom:4px;">🎁</div>あげた
      </button>
    </div>
    <div id="giftFabActions" style="display:flex;flex-direction:column;gap:10px;opacity:0.35;pointer-events:none;transition:opacity 0.3s ease;">
      <button onclick="proceedGiftFab('manual')" class="fab-menu-btn">
        <span style="font-size:24px;">✏️</span>
        <div><div style="font-size:14px;font-weight:500;">手動で追加</div><div style="font-size:11px;color:var(--sub);">名前やカテゴリを入力して登録</div></div>
      </button>
      <button onclick="proceedGiftFab('camera')" class="fab-menu-btn">
        <span style="font-size:24px;">📷</span>
        <div><div style="font-size:14px;font-weight:500;">カメラで撮影</div><div style="font-size:11px;color:var(--sub);">商品を撮影してAIが自動判定</div></div>
      </button>
      <button onclick="proceedGiftFab('file')" class="fab-menu-btn">
        <span style="font-size:24px;">📁</span>
        <div><div style="font-size:14px;font-weight:500;">ファイルから選択</div><div style="font-size:11px;color:var(--sub);">スクリーンショットもOK！</div></div>
      </button>
    </div>
    <div class="form-btns" style="margin-top:12px;">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

function selectGiftFabType(type) {
  _giftFabType = type;
  const recv = document.getElementById('giftFabRecv');
  const gave = document.getElementById('giftFabGave');
  const actions = document.getElementById('giftFabActions');
  recv.style.borderColor = type === 'received' ? 'var(--accent)' : 'var(--border)';
  recv.style.background = type === 'received' ? 'var(--accent-light, rgba(193,154,132,0.12))' : 'var(--card)';
  recv.style.transform = type === 'received' ? 'scale(1.04)' : 'scale(1)';
  gave.style.borderColor = type === 'gave' ? 'var(--accent)' : 'var(--border)';
  gave.style.background = type === 'gave' ? 'var(--accent-light, rgba(193,154,132,0.12))' : 'var(--card)';
  gave.style.transform = type === 'gave' ? 'scale(1.04)' : 'scale(1)';
  actions.style.opacity = '1';
  actions.style.pointerEvents = 'auto';
}

function proceedGiftFab(method) {
  if (!_giftFabType) { showToast('「もらった」か「あげた」を選んでください'); return; }
  document.getElementById('aiModalOverlay').classList.remove('open');
  if (method === 'manual') {
    currentTab = _giftFabType;
    openItemModal();
  } else {
    startItemOcr('item_ocr', _giftFabType, method);
  }
}

// ===== Item/Place OCR =====
function startItemOcr(ocrMode, tabType, inputMethod) {
  const modal = document.getElementById('aiModal');
  const titles = {wish:'ほしいもの',received:'もらったギフト',gave:'あげたギフト',place:'行きたい場所'};
  const title = titles[tabType] || 'アイテム';
  const isPlace = tabType === 'place';
  const hint = inputMethod === 'camera' ? '撮影した写真からAIが自動で判定します' : 'スクリーンショットや写真からAIが自動で判定します';

  const fileInput = inputMethod === 'camera'
    ? `<input type="file" id="itemOcrFile" accept="image/*" capture="environment" style="display:none;" onchange="processItemOcrImage(this,'${ocrMode}','${tabType}')">`
    : `<input type="file" id="itemOcrFile" accept="image/*" multiple style="display:none;" onchange="processItemOcrImage(this,'${ocrMode}','${tabType}')">`;

  modal.innerHTML = `<h2>📷 ${title}を画像から登録</h2>
    <div style="font-size:13px;color:var(--sub);margin-bottom:12px;">${hint}</div>
    <div style="margin-bottom:12px;">
      <button onclick="document.getElementById('itemOcrFile').click()" style="width:100%;padding:16px;border-radius:14px;border:1px solid var(--accent);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;font-size:14px;font-weight:500;color:var(--accent);transition:all 0.2s ease;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">${inputMethod==='camera'?'📷 撮影する':'📁 ファイルを選ぶ'}</button>
    </div>
    ${fileInput}
    <div id="itemOcrPreview" style="text-align:center;margin-bottom:12px;"></div>
    <div id="itemOcrResult"></div>
    <div class="form-btns">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

async function processItemOcrImage(input, ocrMode, tabType) {
  const files = input.files;
  if (!files || !files.length) return;

  const previewDiv = document.getElementById('itemOcrPreview');
  const resultDiv = document.getElementById('itemOcrResult');

  const file = files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    previewDiv.innerHTML = `<img src="${base64}" style="max-width:200px;max-height:200px;border-radius:12px;margin:4px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">`;
    resultDiv.innerHTML = '' + conciergeWaitingHtml('読み取っています・・・') + '';

    try {
      if (!_sbUser) throw new Error('ログインが必要です');
      const session = await _sb.auth.getSession();
      const token = session?.data?.session?.access_token;

      const res = await fetch(OCR_EDGE_FN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (token || ''),
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({ image: base64, mode: ocrMode })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      if (json.result) {
        renderItemOcrResult(json.result, tabType);
      } else {
        resultDiv.innerHTML = '<div style="color:#c97070;padding:12px;line-height:1.6;">読み取れませんでした。別の画像でお試しください。</div>';
      }
    } catch (err) {
      resultDiv.innerHTML = `<div style="color:#c97070;padding:12px;">エラー: ${esc(err.message)}</div>`;
    }
  };
  reader.readAsDataURL(file);
}

function renderItemOcrResult(result, tabType) {
  const resultDiv = document.getElementById('itemOcrResult');
  const isPlace = tabType === 'place';
  const catData = isPlace ? _placeCatData : _itemCatData;
  const catEmoji = isPlace ? _placeCatEmoji : _itemCatEmoji;
  const catIdx = catData.indexOf(result.category);

  let html = '<div style="font-weight:600;margin-bottom:10px;">読み取り結果</div>';
  html += '<div style="background:var(--bg);border-radius:14px;padding:14px;font-size:13px;line-height:2;">';
  if (result.title) html += `<div>📌 <strong>${esc(result.title)}</strong></div>`;
  if (result.category) html += `<div>📂 ${catIdx >= 0 ? catEmoji[catIdx]+' ' : ''}${esc(result.category)}</div>`;
  if (result.genres?.length) html += `<div>🏷 ${result.genres.map(g => esc(g)).join(', ')}</div>`;
  if (result.price) html += `<div>💰 ¥${Number(result.price).toLocaleString()}</div>`;
  if (result.address) html += `<div>📍 ${esc(result.address)}</div>`;
  if (result.memo) html += `<div>📝 ${esc(result.memo)}</div>`;
  html += '</div>';

  html += `<div style="margin-top:14px;display:flex;gap:8px;">
    <button class="btn btn-primary" onclick="saveItemOcrResult('${tabType}')" style="flex:1;font-size:14px;padding:12px;">✅ この内容で登録</button>
    <button class="btn btn-secondary" onclick="editItemOcrResult('${tabType}')" style="flex:1;font-size:14px;padding:12px;">✏️ 編集して登録</button>
  </div>`;

  resultDiv.innerHTML = html;
  resultDiv._ocrResult = result;
}

function saveItemOcrResult(tabType) {
  const resultDiv = document.getElementById('itemOcrResult');
  const r = resultDiv._ocrResult;
  if (!r) return;
  const now = new Date().toISOString();
  const isPlace = tabType === 'place';

  if (isPlace) {
    const item = {
      id: genId(), title: r.title || '名称なし',
      placeCategory: r.category || '', tags: r.genres || [],
      address: r.address || '', memo: r.memo || '',
      withPeople: [], pinned: false, createdAt: now, updatedAt: now
    };
    data.place.push(item);
    saveData(); render();
    showToast(`📍 ${item.title} を登録しました`);
  } else {
    const tab = tabType; // wish, received, gave
    if (!data[tab]) data[tab] = [];
    const item = {
      id: genId(), title: r.title || '名称なし',
      itemCategory: r.category || '', tags: r.genres || [],
      price: r.price ? String(r.price) : '', memo: r.memo || '',
      person: '', occasion: '', url: '',
      pinned: false, createdAt: now, updatedAt: now
    };
    data[tab].push(item);
    saveData(); render();
    const labels = {wish:'ほしいもの',received:'もらったギフト',gave:'あげたギフト'};
    showToast(`✅ ${item.title} を${labels[tab]||''}に登録しました`);
  }
  document.getElementById('aiModalOverlay').classList.remove('open');
}

function editItemOcrResult(tabType) {
  const resultDiv = document.getElementById('itemOcrResult');
  const r = resultDiv._ocrResult;
  if (!r) return;
  document.getElementById('aiModalOverlay').classList.remove('open');

  const isPlace = tabType === 'place';
  if (isPlace) {
    // 一時データを作って編集モーダルを開く
    const tempId = genId();
    const now = new Date().toISOString();
    data.place.push({
      id: tempId, title: r.title || '', placeCategory: r.category || '',
      tags: r.genres || [], address: r.address || '', memo: r.memo || '',
      withPeople: [], pinned: false, createdAt: now, updatedAt: now
    });
    saveData();
    openPlaceModal(tempId);
  } else {
    const tab = tabType;
    if (!data[tab]) data[tab] = [];
    const tempId = genId();
    const now = new Date().toISOString();
    data[tab].push({
      id: tempId, title: r.title || '', itemCategory: r.category || '',
      tags: r.genres || [], price: r.price ? String(r.price) : '',
      memo: r.memo || '', person: '', occasion: '', url: '',
      pinned: false, createdAt: now, updatedAt: now
    });
    saveData();
    const origTab = currentTab;
    currentTab = tab;
    openItemModal(tempId);
    currentTab = origTab;
  }
}

// ===== Image OCR =====
const OCR_EDGE_FN = SUPABASE_URL + '/functions/v1/image-ocr';

function openOcrModal() {
  const modal = document.getElementById('aiModal');
  modal.innerHTML = `<h2>📷 画像から登録</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      <button onclick="startOcr('line_friends')" style="padding:16px 12px;border-radius:14px;border:1px solid var(--pickup-border);background:var(--pickup);color:var(--text);font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">
        <div style="font-size:24px;margin-bottom:6px;">💬</div>
        LINEスクショ<br><span style="font-size:11px;color:var(--sub);">友だち一括登録</span>
      </button>
      <button onclick="startOcr('business_card')" style="padding:16px 12px;border-radius:14px;border:1px solid var(--pickup-border);background:var(--pickup);color:var(--text);font-size:13px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">
        <div style="font-size:24px;margin-bottom:6px;">🪪</div>
        名刺スキャン<br><span style="font-size:11px;color:var(--sub);">法人カード自動入力</span>
      </button>
    </div>
    <div class="form-btns">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

function startOcr(mode) {
  const modal = document.getElementById('aiModal');
  const title = mode === 'line_friends' ? '📷 友だちをまとめて登録' : '🪪 名刺スキャン';
  const hint = mode === 'line_friends'
    ? `今お使いのスマホの連絡先を登録できます。`
    : '名刺の写真を撮影または選択してください。';

  modal.innerHTML = `<h2>${title}</h2>
    <div style="font-size:13px;color:var(--sub);margin-bottom:16px;">${hint}</div>
    ${mode==='line_friends' ? `
    <div style="background:var(--bg);border-radius:14px;padding:16px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;">📌 かんたん3ステップ</div>
      <div style="font-size:13px;line-height:2.2;color:var(--text);">
        <div>① まずスマホの連絡先アプリを開く</div>
        <div style="display:flex;gap:8px;margin:8px 0 12px;">
          <a href="content://com.android.contacts/contacts" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card);text-decoration:none;font-size:12px;color:var(--text);font-family:'Zen Maru Gothic',sans-serif;">📱 電話帳を開く</a>
        </div>
        <div>② その画面をスクリーンショット 📸</div>
        <div>③ 下のボタンからアップ！</div>
      </div>
      <div style="font-size:11px;color:var(--sub);margin-top:4px;">複数枚まとめてOK！</div>
    </div>
    <div style="margin-bottom:12px;">
      <button onclick="document.getElementById('ocrFile').click()" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--accent);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;font-size:14px;font-weight:500;color:var(--accent);">📁 スクショを選ぶ（複数枚OK）</button>
    </div>
    <input type="file" id="ocrFile" accept="image/*" multiple style="display:none;" onchange="processOcrImage(this,'${mode}')">` : `<div style="display:flex;gap:8px;margin-bottom:12px;">
      <button onclick="document.getElementById('ocrCamera').click()" style="flex:1;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;font-size:14px;font-weight:500;">📷 撮影する</button>
      <button onclick="document.getElementById('ocrFile').click()" style="flex:1;padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;font-size:14px;font-weight:500;">📁 写真を選ぶ</button>
    </div>
    <input type="file" id="ocrCamera" accept="image/*" capture="environment" style="display:none;" onchange="processOcrImage(this,'${mode}')">
    <input type="file" id="ocrFile" accept="image/*" style="display:none;" onchange="processOcrImage(this,'${mode}')">`}
    <div id="ocrPreview" style="text-align:center;margin-bottom:12px;"></div>
    <div id="ocrResult"></div>
    <div class="form-btns">
      <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
    </div>`;
  document.getElementById('aiModalOverlay').classList.add('open');
}

async function processOcrImage(input, mode) {
  const files = input.files;
  if (!files || !files.length) return;

  const resultDiv = document.getElementById('ocrResult');
  const previewDiv = document.getElementById('ocrPreview');

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    // プレビュー表示
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      previewDiv.innerHTML += `<img src="${base64}" style="max-width:150px;max-height:150px;border-radius:8px;margin:4px;">`;
      resultDiv.innerHTML = '' + conciergeWaitingHtml('読み取っています・・・') + '';

      try {
        if (!_sbUser) throw new Error('ログインが必要です');
        const session = await _sb.auth.getSession();
        const token = session?.data?.session?.access_token;

        const res = await fetch(OCR_EDGE_FN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (token || ''),
            'apikey': SUPABASE_KEY
          },
          body: JSON.stringify({ image: base64, mode })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        if (mode === 'line_friends' && json.result?.friends) {
          renderOcrFriends(json.result.friends);
        } else if (mode === 'business_card' && json.result) {
          renderOcrBusinessCard(json.result);
        } else {
          resultDiv.innerHTML = '<div style="color:#c97070;padding:12px;line-height:1.6;">読み取れませんでした。<br>📌 名刺はできるだけ近くで、明るい場所で撮影してみてください。<br>📌 スクショは文字がはっきり見える画像を選んでください。</div>';
        }
      } catch (err) {
        resultDiv.innerHTML = `<div style="color:#c97070;padding:12px;">エラー: ${esc(err.message)}</div>`;
      }
    };
    reader.readAsDataURL(file);
  }
}

function renderOcrFriends(friends) {
  const resultDiv = document.getElementById('ocrResult');
  if (!friends.length) {
    resultDiv.innerHTML = '<div style="color:var(--sub);padding:12px;">友だちの名前が見つかりませんでした。</div>';
    return;
  }
  let html = `<div style="font-weight:600;margin-bottom:8px;">${friends.length}人の名前を検出しました</div>`;
  html += '<div style="max-height:300px;overflow-y:auto;">';
  friends.forEach((f, i) => {
    const exists = data.people.some(p => p.nickname === f.name);
    html += `<label style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);font-size:13px;">
      <input type="checkbox" id="ocrF${i}" ${exists?'':'checked'}>
      <span>${esc(f.name)}</span>
      ${exists ? '<span style="font-size:11px;color:var(--sub);">（登録済み）</span>' : ''}
      ${f.note ? `<span style="font-size:11px;color:var(--sub);">${esc(f.note)}</span>` : ''}
    </label>`;
  });
  html += '</div>';
  html += `<div style="margin-top:12px;text-align:center;">
    <button class="btn btn-primary" onclick="saveOcrFriends()" style="font-size:14px;padding:10px 24px;">✅ チェックした人を一括登録</button>
  </div>`;
  resultDiv.innerHTML = html;
  // データを保持
  resultDiv._friends = friends;
}

function saveOcrFriends() {
  const resultDiv = document.getElementById('ocrResult');
  const friends = resultDiv._friends || [];
  let count = 0;
  const now = new Date().toISOString();
  friends.forEach((f, i) => {
    const cb = document.getElementById('ocrF' + i);
    if (cb && cb.checked) {
      const exists = data.people.some(p => p.nickname === f.name);
      if (!exists) {
        data.people.push({
          id: genId(),
          type: 'individual',
          nickname: f.name,
          fullName: '',
          relation: '',
          interests: [],
          brands: [],
          foodLike: [],
          foodDislike: [],
          personality: [],
          memo: f.note || '',
          anniversaries: [],
          pinned: false,
          createdAt: now,
          updatedAt: now
        });
        count++;
      }
    }
  });
  if (count) {
    saveData(); render();
    showToast(`👤 ${count}人の友だちを登録しました`);
    document.getElementById('aiModalOverlay').classList.remove('open');
  } else {
    showToast('登録する人が選択されていません');
  }
}

function renderOcrBusinessCard(card) {
  const resultDiv = document.getElementById('ocrResult');
  let html = '<div style="font-weight:600;margin-bottom:8px;">名刺の読み取り結果</div>';
  html += '<div style="background:var(--bg);border-radius:12px;padding:12px;font-size:13px;line-height:2;">';
  if (card.corpFullName) html += `<div>🏢 ${esc(card.corpFullName)}</div>`;
  if (card.fullName) html += `<div>👤 ${esc(card.fullName)}</div>`;
  if (card.position) html += `<div>📋 ${esc(card.position)}${card.department ? ' / ' + esc(card.department) : ''}</div>`;
  if (card.phone) html += `<div>📞 ${esc(card.phone)}</div>`;
  if (card.mobile) html += `<div>📱 ${esc(card.mobile)}</div>`;
  if (card.email) html += `<div>📧 ${esc(card.email)}</div>`;
  if (card.address) html += `<div>📍 ${esc(card.address)}</div>`;
  if (card.url) html += `<div>🔗 ${esc(card.url)}</div>`;
  if (card.industry) html += `<div>🏭 ${esc(card.industry)}</div>`;
  html += '</div>';
  html += `<div style="margin-top:12px;text-align:center;">
    <button class="btn btn-primary" onclick="saveOcrBusinessCard()" style="font-size:14px;padding:10px 24px;">✅ この内容で登録</button>
  </div>`;
  resultDiv.innerHTML = html;
  resultDiv._card = card;
}

function saveOcrBusinessCard() {
  const resultDiv = document.getElementById('ocrResult');
  const card = resultDiv._card;
  if (!card) return;
  const now = new Date().toISOString();
  const isCorp = card.type === 'corporate';

  const person = {
    id: genId(),
    type: isCorp ? 'corporate' : 'individual',
    nickname: card.nickname || card.corpFullName || card.fullName || '名前なし',
    corpFullName: card.corpFullName || '',
    corpNickname: card.nickname || '',
    fullName: card.fullName || '',
    position: card.position || '',
    department: card.department || '',
    phone: card.phone || card.mobile || '',
    email: card.email || '',
    address: card.address || '',
    url: card.url || '',
    industry: card.industry || '',
    relation: card.position ? card.position : '仕事関係',
    interests: [],
    brands: [],
    foodLike: [],
    foodDislike: [],
    personality: [],
    memo: [card.department, card.mobile ? '携帯:' + card.mobile : ''].filter(Boolean).join(' / '),
    anniversaries: [],
    pinned: false,
    createdAt: now,
    updatedAt: now
  };

  data.people.push(person);
  saveData(); render();
  showToast(`🪪 ${person.nickname} を登録しました`);
  document.getElementById('aiModalOverlay').classList.remove('open');
}

// ===== Card Search =====
function searchFromCard(tab, itemId) {
  const item = tab === 'place' ? data.place.find(i=>i.id===itemId) : data[tab]?.find(i=>i.id===itemId);
  if (!item) return;
  // 関連する人を探す
  let personId = null;
  if (item.withPeople?.length) personId = item.withPeople[0];
  else if (item.person) {
    const p = data.people.find(x=>x.nickname===item.person);
    if (p) personId = p.id;
  }
  if (personId) {
    openAiSuggest(personId);
    // シーン欄にアイテム情報をプリフィル
    setTimeout(() => {
      const sceneEl = document.getElementById('aiScene');
      if (sceneEl) sceneEl.value = `「${item.title}」に似たもの・関連するもの`;
    }, 100);
  } else {
    // 人が紐づいていない場合はキーワード検索
    const keyword = item.title || '';
    const modal = document.getElementById('aiModal');
    modal.innerHTML = `<h2>🔍 「${esc(keyword)}」で探す</h2>
      <div class="form-group"><label>探したいもの</label>
        <input id="aiCardSearch" value="${esc(keyword)}">
      </div>
      <div class="form-group"><label>予算（任意）</label>
        <input id="aiCardBudget" placeholder="例：5000" value="${item.amount||''}">
      </div>
      <div class="form-btns" style="margin-bottom:12px;">
        <button class="btn btn-secondary" onclick="document.getElementById('aiModalOverlay').classList.remove('open')">閉じる</button>
        <button class="btn btn-primary" id="aiCardSearchBtn" onclick="runCardSearch()">🔍 検索</button>
      </div>
      <div id="aiCardResult" style="font-size:13px;line-height:1.8;"></div>`;
    document.getElementById('aiModalOverlay').classList.add('open');
  }
}

async function runCardSearch() {
  const keyword = document.getElementById('aiCardSearch')?.value.trim();
  const budget = document.getElementById('aiCardBudget')?.value.trim();
  if (!keyword) return;
  const resultDiv = document.getElementById('aiCardResult');
  const btn = document.getElementById('aiCardSearchBtn');
  btn.disabled = true; btn.textContent = '検索中...';
  resultDiv.innerHTML = '' + conciergeWaitingHtml('世界中からお探しします・・・', 'あなたのコンシェルジュが') + '';

  const prompt = `「${keyword}」に関連するおすすめの商品・ギフト・体験を3つ提案してください。
${budget ? '予算: 約'+budget+'円' : ''}
知る人ぞ知る名店やブランド、体験型ギフトなどセンスの良い提案を心がけてください。`;

  try {
    const result = await callAI(prompt, '', true);
    if (result.suggestions && result.suggestions.length) {
      _lastAiSuggestions = result.suggestions;
      let html = '';
      result.suggestions.forEach((s, i) => {
        const hasRakuten = s.rakuten && s.rakuten.url;
        const rakutenImg = s.rakuten?.image ? `<div style="text-align:center;margin-bottom:10px;"><img src="${esc(s.rakuten.image)}" style="max-width:120px;max-height:120px;border-radius:8px;object-fit:cover;"></div>` : '';
        const price = s.rakuten?.price ? `¥${Number(s.rakuten.price).toLocaleString()}` : (s.budget ? `約¥${Number(s.budget).toLocaleString()}` : '');
        html += `<div style="background:var(--pickup);border:1px solid var(--pickup-border);border-radius:14px;padding:14px;margin-bottom:12px;">
          ${rakutenImg}
          <div style="font-weight:600;font-size:14px;font-family:'Shippori Mincho',serif;">${esc(s.name)}</div>
          <div style="font-size:12px;color:var(--sub);margin:4px 0;">${esc(s.shop)}${price ? ' | ' + price : ''}</div>
          <div style="font-size:13px;margin:8px 0;line-height:1.6;">${esc(s.reason)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
            ${hasRakuten ? `<a href="${esc(s.rakuten.url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:#BF0000;color:#fff;font-size:12px;text-decoration:none;font-weight:500;">🛒 楽天</a>` : ''}
            <a href="${esc(s.amazonUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;background:#FF9900;color:#000;font-size:12px;text-decoration:none;font-weight:500;">🛒 Amazon</a>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button onclick="saveAiSuggestionDirect('wish',${i})" style="padding:6px 12px;border-radius:8px;background:var(--pickup);border:1px solid var(--pickup-border);color:var(--text);font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">⭐ 保存</button>
            ${s.isPlace ? `<button onclick="saveAiSuggestionDirect('place',${i})" style="padding:6px 12px;border-radius:8px;background:var(--pickup);border:1px solid var(--pickup-border);color:var(--text);font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;">📍 行きたい</button>` : ''}
          </div>
        </div>`;
      });
      html += `<div style="text-align:center;margin-top:12px;">
        <button class="btn btn-secondary" onclick="runCardSearch()" style="font-size:13px;padding:8px 20px;">🔄 別の提案を探す</button>
      </div>`;
      resultDiv.innerHTML = html;
    } else {
      const text = typeof result === 'string' ? result : (result.reply || '');
      resultDiv.innerHTML = `<div style="background:var(--pickup);border:1px solid var(--pickup-border);border-radius:14px;padding:14px;">${mdToHtml(text)}</div>`;
    }
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:#c97070;padding:12px;">エラー: ${esc(e.message)}</div>`;
  }
  btn.disabled = false; btn.textContent = '🔍 検索';
}

function saveAiSuggestionDirect(tab, idx) {
  const s = _lastAiSuggestions[idx];
  if (!s) return;
  const now = new Date().toISOString();
  function buildLinks(s) {
    const links = {};
    if (s.rakuten?.url) links.rakuten = s.rakuten.url;
    if (s.amazonUrl) links.amazon = s.amazonUrl;
    if (s.webLinks) { Object.entries(s.webLinks).forEach(([k,v])=>{ if(v) links[k]=v; }); }
    return Object.keys(links).length ? links : null;
  }
  if (tab === 'wish') {
    data.wish.push({ id:genId(), title:s.name, person:null, itemCategory:(!s.isPlace&&s.category)?s.category:null, amount:String(s.rakuten?.price||s.budget||''), url:s.rakuten?.url||s.amazonUrl||null, memo:`${s.shop} — ${s.reason}`, aiLinks:buildLinks(s), img:s.rakuten?.image||null, tags:null, pinned:false, createdAt:now, updatedAt:now });
    saveData(); render();
    showToast(`⭐ "${s.name}" をお気に入りに保存しました`);
  } else if (tab === 'place') {
    const wl = s.webLinks || {};
    data.place.push({ id:genId(), title:s.shop||s.name, person:null, placeCategory:(s.isPlace&&s.category)?s.category:null, mapUrl:wl.official||wl.tabelog||null, url:wl.official||s.rakuten?.url||s.amazonUrl||null, googleMapUrl:`https://www.google.com/maps/search/${encodeURIComponent(s.shop||s.name)}`, memo:`${s.shop||s.name} — ${s.reason}`, aiLinks:buildLinks(s), tags:null, pinned:false, createdAt:now, updatedAt:now });
    saveData(); render();
    showToast(`📍 "${s.shop||s.name}" を行きたいに保存しました`);
  }
}

// ===== Init =====
// ===== PIN Lock =====
const PIN_KEY = 'awai_pin';
const LOCK_METHOD_KEY = 'awai_lock_method'; // 'pin' or 'biometric'
let pinBuffer = '';
let pinMode = 'unlock'; // unlock, set, confirm
let pinTemp = '';

function initPin() {
  const lockMethod = localStorage.getItem(LOCK_METHOD_KEY) || 'pin';
  if (lockMethod === 'biometric') {
    requestBiometric();
    return;
  }
  const savedPin = localStorage.getItem(PIN_KEY);
  if (!savedPin) {
    document.getElementById('pinOverlay').classList.add('hidden');
    return;
  }
  pinBuffer = '';
  updatePinDots();
  pinMode = 'unlock';
  document.getElementById('pinMessage').textContent = 'パスコードを入力';
  document.getElementById('pinError').textContent = '';
  document.getElementById('pinOverlay').classList.remove('hidden');
}

async function requestBiometric() {
  // WebAuthn非対応ブラウザはPINにフォールバック
  if (!window.PublicKeyCredential) {
    const savedPin = localStorage.getItem(PIN_KEY);
    if (savedPin) { initPin(); } else { document.getElementById('pinOverlay').classList.add('hidden'); }
    return;
  }
  const overlay = document.getElementById('pinOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('pinMessage').textContent = '認証してください';
  document.getElementById('pinError').textContent = '';
  document.querySelector('.pin-dots').style.display = 'none';
  document.querySelector('.pin-pad').style.display = 'none';

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 60000,
        userVerification: 'required',
        rpId: location.hostname,
        allowCredentials: (JSON.parse(localStorage.getItem('awai_bio_cred') || '[]')).map(c => ({...c, id: new Uint8Array(c.id).buffer}))
      }
    });
    if (credential) {
      overlay.classList.add('hidden');
      document.querySelector('.pin-dots').style.display = '';
      document.querySelector('.pin-pad').style.display = '';
      setTimeout(() => showAnnPopup(), 500);
    }
  } catch(e) {
    // Biometric failed or cancelled - fall back to PIN
    document.getElementById('pinError').textContent = '認証に失敗しました';
    document.querySelector('.pin-dots').style.display = '';
    document.querySelector('.pin-pad').style.display = '';
    const savedPin = localStorage.getItem(PIN_KEY);
    if (savedPin) {
      pinBuffer = '';
      updatePinDots();
      pinMode = 'unlock';
      document.getElementById('pinMessage').textContent = 'パスコードで解除';
    } else {
      overlay.classList.add('hidden');
    }
  }
}

async function setupBiometric() {
  try {
    if (!window.PublicKeyCredential) {
      alert('このブラウザは生体認証に対応していません');
      return false;
    }
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      alert('このデバイスは生体認証（Face ID/指紋）に対応していません');
      return false;
    }
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'AWAI', id: location.hostname },
        user: {
          id: new Uint8Array(16),
          name: 'awai-user',
          displayName: 'AWAIユーザー'
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required'
        },
        timeout: 60000
      }
    });
    if (credential) {
      localStorage.setItem('awai_bio_cred', JSON.stringify([{
        id: Array.from(new Uint8Array(credential.rawId)),
        type: 'public-key'
      }]));
      localStorage.setItem(LOCK_METHOD_KEY, 'biometric');
      alert('生体認証を設定しました');
      return true;
    }
  } catch(e) {
    console.error('Biometric setup error:', e);
    alert('生体認証の設定に失敗しました: ' + e.message);
  }
  return false;
}

function pinInput(n) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += n;
  updatePinDots();
  if (pinBuffer.length === 4) {
    setTimeout(checkPin, 200);
  }
}

function pinDelete() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
  document.getElementById('pinError').textContent = '';
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('pd' + i).classList.toggle('filled', i < pinBuffer.length);
  }
}

const DUMMY_PIN_KEY = 'awai_dummy_pin';
const PIN_FAIL_KEY = 'awai_pin_fails';
const PIN_LOCK_KEY = 'awai_pin_locked_until';

function checkPin() {
  const savedPin = localStorage.getItem(PIN_KEY);
  const dummyPin = localStorage.getItem(DUMMY_PIN_KEY);
  if (pinMode === 'unlock') {
    // Check lock
    const lockedUntil = localStorage.getItem(PIN_LOCK_KEY);
    if (lockedUntil && Date.now() < parseInt(lockedUntil)) {
      const mins = Math.ceil((parseInt(lockedUntil) - Date.now()) / 60000);
      document.getElementById('pinError').textContent = 'ロック中です。あと約' + mins + '分';
      pinBuffer = '';
      updatePinDots();
      return;
    }
    // Dummy PIN → show empty app
    if (dummyPin && pinBuffer === dummyPin) {
      localStorage.setItem(PIN_FAIL_KEY, '0');
      document.getElementById('pinOverlay').classList.add('hidden');
      showDummyMode();
      return;
    }
    // Normal PIN
    if (pinBuffer === savedPin) {
      localStorage.setItem(PIN_FAIL_KEY, '0');
      document.getElementById('pinOverlay').classList.add('hidden');
      hideDummyMode();
      setTimeout(() => showAnnPopup(), 500);
    } else {
      let fails = parseInt(localStorage.getItem(PIN_FAIL_KEY)||'0') + 1;
      localStorage.setItem(PIN_FAIL_KEY, String(fails));
      if (fails >= 10) {
        // 10回間違え → 緊急バックアップ＋レスキュー画面
        saveEmergencyBackup();
        showRescueScreen();
      } else if (fails >= 5) {
        // 5回間違え → 30分ロック
        const lockUntil = Date.now() + 30 * 60 * 1000;
        localStorage.setItem(PIN_LOCK_KEY, String(lockUntil));
        document.getElementById('pinError').textContent = '5回間違えました。30分後にお試しください';
        pinBuffer = '';
        updatePinDots();
      } else {
        document.getElementById('pinError').textContent = 'パスコードが違います（' + fails + '/5）';
        pinBuffer = '';
        updatePinDots();
      }
    }
  } else if (pinMode === 'set') {
    pinTemp = pinBuffer;
    pinBuffer = '';
    updatePinDots();
    pinMode = 'confirm';
    document.getElementById('pinMessage').textContent = '確認のためもう一度入力';
    document.getElementById('pinError').textContent = '';
  } else if (pinMode === 'confirm') {
    if (pinBuffer === pinTemp) {
      localStorage.setItem(PIN_KEY, pinBuffer);
      document.getElementById('pinOverlay').classList.add('hidden');
      alert('パスコードを設定しました');
    } else {
      document.getElementById('pinError').textContent = '一致しません。もう一度';
      pinBuffer = '';
      updatePinDots();
      pinMode = 'set';
      document.getElementById('pinMessage').textContent = '新しいパスコードを入力';
    }
  }
}

// ===== Dummy Mode (偽装モード) =====
let isDummyMode = false;

function showDummyMode() {
  isDummyMode = true;
  // Hide all data, show empty app
  document.getElementById('cardList').innerHTML = '<div class="empty-msg">👤 友だちを追加しましょう<br>下の ＋ ボタンから追加できます</div>';
  document.getElementById('reminderZone').innerHTML = '';
  document.getElementById('pickupZone').innerHTML = '';
  document.getElementById('annSection').innerHTML = '';
}

function hideDummyMode() {
  isDummyMode = false;
}

// ===== Emergency Backup & Rescue =====
function saveEmergencyBackup() {
  try {
    const backup = {
      awai_data: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
      awai_my_profile: JSON.parse(localStorage.getItem('awai_my_profile') || 'null'),
      awai_season: localStorage.getItem(SEASON_KEY),
      awai_fontsize: localStorage.getItem(FONTSIZE_KEY),
      emergency_date: new Date().toISOString(),
      version: APP_VERSION
    };
    localStorage.setItem('awai_emergency_backup', JSON.stringify(backup));
  } catch(e) { console.error('Emergency backup failed:', e); }
}

function showRescueScreen() {
  const overlay = document.getElementById('pinOverlay');
  overlay.innerHTML = `<div style="max-width:400px;margin:0 auto;padding:32px 24px;text-align:center;">
    <div style="font-size:36px;margin-bottom:16px;">🤍</div>
    <h2 style="font-size:20px;font-weight:600;margin-bottom:16px;font-family:'Shippori Mincho',serif;">パスコードを忘れても<br>大丈夫です。</h2>
    <p style="font-size:14px;color:var(--sub);line-height:1.8;margin-bottom:24px;">あなたのデータは安全に<br>保護されています。</p>
    <div style="background:var(--accent-light);border-radius:14px;padding:20px 16px;text-align:left;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">復元の手順：</div>
      <div style="font-size:13px;line-height:2;color:var(--text);">
        ① 下の「リセットして復元する」をタップ<br>
        ② AWAIが新しく開きます<br>
        ③ 「緊急バックアップが見つかりました」と<br>　 表示されるので「復元する」をタップ<br>
        ④ これだけで元通りです
      </div>
    </div>
    <button onclick="executeRescueReset()" style="width:100%;padding:16px;font-size:16px;background:var(--accent);color:#fff;border:none;border-radius:14px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;margin-bottom:12px;">リセットして復元する</button>
    <p style="font-size:13px;color:var(--sub);margin-top:16px;">まだ試したいパスコードがある方は<br>30分後にもう一度お試しください。</p>
    <button onclick="closeRescueScreen()" style="background:none;border:1px solid var(--border);border-radius:12px;padding:10px 24px;font-size:13px;cursor:pointer;color:var(--sub);font-family:'Zen Maru Gothic',sans-serif;margin-top:8px;">戻る</button>
  </div>`;
}

function closeRescueScreen() {
  location.reload();
}

function executeRescueReset() {
  if (!confirm('パスコードをリセットします。\n緊急バックアップから復元できます。')) return;
  // Remove PIN but keep emergency backup
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(DUMMY_PIN_KEY);
  localStorage.removeItem(LOCK_METHOD_KEY);
  localStorage.removeItem('awai_bio_cred');
  localStorage.removeItem(PIN_FAIL_KEY);
  localStorage.removeItem(PIN_LOCK_KEY);
  location.reload();
}

function checkEmergencyBackup() {
  const backup = localStorage.getItem('awai_emergency_backup');
  if (!backup) return;
  // Only show if current data is empty or very small
  const currentData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const hasData = (currentData.people?.length||0) + (currentData.wish?.length||0) + (currentData.place?.length||0);
  if (hasData > 2) {
    // Already has data, don't overwrite
    localStorage.removeItem('awai_emergency_backup');
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'emergencyRestoreOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:600;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div style="background:#fff;border-radius:16px;padding:28px 24px;width:90%;max-width:360px;text-align:center;">
    <div style="font-size:28px;margin-bottom:12px;">🤍</div>
    <div style="font-size:17px;font-weight:600;margin-bottom:8px;">緊急バックアップが<br>見つかりました</div>
    <div style="font-size:13px;color:var(--sub);margin-bottom:20px;line-height:1.6;">パスコードリセット前のデータを<br>復元できます。</div>
    <button onclick="restoreEmergencyBackup()" style="width:100%;padding:14px;font-size:15px;background:var(--accent);color:#fff;border:none;border-radius:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;margin-bottom:10px;">復元する</button>
    <button onclick="document.getElementById('emergencyRestoreOverlay').remove();localStorage.removeItem('awai_emergency_backup');" style="width:100%;padding:12px;font-size:13px;background:none;border:1px solid var(--border);border-radius:12px;cursor:pointer;color:var(--sub);font-family:'Zen Maru Gothic',sans-serif;">復元しない（データを破棄）</button>
  </div>`;
  document.body.appendChild(overlay);
}

function restoreEmergencyBackup() {
  try {
    const backup = JSON.parse(localStorage.getItem('awai_emergency_backup'));
    if (backup.awai_data) localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.awai_data));
    if (backup.awai_my_profile) localStorage.setItem('awai_my_profile', JSON.stringify(backup.awai_my_profile));
    if (backup.awai_season) localStorage.setItem(SEASON_KEY, backup.awai_season);
    if (backup.awai_fontsize) localStorage.setItem(FONTSIZE_KEY, backup.awai_fontsize);
    localStorage.removeItem('awai_emergency_backup');
    showToast('データを復元しました ✓');
    setTimeout(() => location.reload(), 500);
  } catch(e) {
    alert('復元に失敗しました: ' + e.message);
  }
}

function setupDummyPin() {
  const pin = prompt('ダミーPINを4桁で入力してください\n（通常PINとは別の番号にしてください）');
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) { alert('4桁の数字を入力してください'); return; }
  if (pin === localStorage.getItem(PIN_KEY)) { alert('通常のパスコードと同じ番号は設定できません'); return; }
  localStorage.setItem(DUMMY_PIN_KEY, pin);
  showToast('ダミーPINを設定しました');
  openSettings();
}

function removeDummyPin() {
  if (!confirm('ダミーPINを解除しますか？')) return;
  localStorage.removeItem(DUMMY_PIN_KEY);
  openSettings();
}

function openPinSetup() {
  pinBuffer = '';
  pinTemp = '';
  pinMode = 'set';
  updatePinDots();
  document.getElementById('pinMessage').textContent = '新しいパスコードを入力（4桁）';
  document.getElementById('pinError').textContent = '';
  document.getElementById('pinOverlay').classList.remove('hidden');
}

function setLockMethod(method, el) {
  el.parentElement.querySelectorAll('.date-type-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('lockPinSection').style.display = method==='biometric'?'none':'';
  document.getElementById('lockBioSection').style.display = method==='biometric'?'':'none';
}

async function setupBiometricFromSettings() {
  const ok = await setupBiometric();
  if (ok) {
    document.getElementById('settingsModalOverlay').classList.remove('open');
    openSettings();
  }
}

function removeBiometric() {
  if (confirm('生体認証を解除しますか？')) {
    localStorage.removeItem(LOCK_METHOD_KEY);
    localStorage.removeItem('awai_bio_cred');
    document.getElementById('settingsModalOverlay').classList.remove('open');
    openSettings();
  }
}

function removePinLock() {
  if (confirm('パスコードを解除しますか？')) {
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(LOCK_METHOD_KEY);
    alert('パスコードを解除しました');
  }
}

// Clear old service worker caches
if ('caches' in window) { caches.keys().then(ks => ks.forEach(k => caches.delete(k))); }
if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())); }

(function init() {
  try {
  initPin();
  loadData();
  loadFontSize();
  checkReferral();
  const savedSeason = localStorage.getItem(SEASON_KEY);
  setSeason(savedSeason || getAutoSeason());

  // AWAI Personality Engine
  trackAppOpen();
  setTimeout(updateAwaiStageDisplay, 500);
  setTimeout(showAwaiMemory, 3000);
  setTimeout(checkSpecialEvent, 1500);
  setTimeout(checkStartupCelebrations, 2500);
  initLongPress();
  initSwipeGestures();

  // カード外クリックで個別カードを閉じる（個別カードが開いている時だけ、背景クリックで閉じる）
  // 注意: list-itemのクリックと競合しないよう、cardListの外側のみ対象
  document.querySelector('.card-list')?.addEventListener('click', (e) => {
    if (!openPersonId && !openItemId && !openGroupId && !openAllRecordId) return;
    // cardListの直接クリック（子要素ではない）のみ閉じる
    if (e.target.id === 'cardList' || e.target.classList.contains('card-list')) {
      if (openPersonId) { openPersonId = null; render(); }
      else if (openItemId) { openItemId = null; render(); }
      else if (openGroupId) { openGroupId = null; render(); }
      else if (openAllRecordId) { openAllRecordId = null; render(); }
    }
  });

  // Supabase初期化（クラウド同期開始）
  sbInit();
  setTimeout(checkNotifications, 2000);

  // 全ての日付アイコンに今日の日付を表示
  const todayNum = new Date().getDate();
  document.querySelectorAll('.cal-date-num').forEach(el => el.textContent = todayNum);
  document.querySelectorAll('.ann-sort-date').forEach(el => el.textContent = todayNum);

  document.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
    el.classList.toggle('active', el.dataset.tab===currentTab);
  });

  document.getElementById('fabBtn').addEventListener('click', () => {
    if (currentTab==='people' && currentLabel==='memory') openMemoryModal();
    else if (currentTab==='people' && currentLabel==='groups') openGroupModal();
    else if (currentTab==='people') openPeopleFabMenu();
    else if (currentTab==='place' && currentLabel==='closed') openPlaceMemoryModal();
    else if (currentTab==='place') openPlaceFabMenu();
    else if (currentTab==='gift') openGiftFabMenu();
    else if (currentTab==='items') openItemsFabMenu();
    else if (currentTab==='calendar') { const t=new Date(); calDayTap(t.getFullYear(),t.getMonth(),t.getDate()); }
    else openWishFabMenu();
  });

  // 背景タップでモーダルを閉じる
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('settingsModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      document.getElementById('settingsModalOverlay').classList.remove('open');
    }
  });

  let _searchTimer;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); render(); }, 200);
  });

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('aiModalOverlay').addEventListener('click', e => {
    if (e.target===e.currentTarget) e.currentTarget.classList.remove('open');
  });
  document.getElementById('settingsModalOverlay').addEventListener('click', e => {
    if (e.target===e.currentTarget) e.currentTarget.classList.remove('open');
  });
  const labelOv = document.getElementById('labelModalOverlay');
  if (labelOv) labelOv.addEventListener('click', e => {
    if (e.target===e.currentTarget) e.currentTarget.classList.remove('open');
  });

  document.getElementById('seasonBtn').addEventListener('click', () => {
    document.getElementById('seasonModal').classList.add('open');
  });
  document.querySelectorAll('.season-option').forEach(el => {
    el.addEventListener('click', () => {
      setSeason(el.dataset.season);
      document.getElementById('seasonModal').classList.remove('open');
    });
  });
  document.getElementById('seasonModal').addEventListener('click', e => {
    if (e.target===e.currentTarget) e.currentTarget.classList.remove('open');
  });

  render();
  checkAppUpdate();

  // プライベートブラウズ検出
  try { localStorage.setItem('_test','1'); localStorage.removeItem('_test'); }
  catch(e) { alert('プライベートブラウズモードではデータを保存できません。通常モードでご利用ください。'); }

  // Onboarding check (初回起動 or 既存データなし)
  if (!localStorage.getItem(OB_KEY) && !data.people.length && !data.wish.length) {
    showOnboarding();
  }

  // PINがない場合のみ起動時にポップアップ（PINありの場合はPIN解除後に表示）
  if (!localStorage.getItem(PIN_KEY)) setTimeout(() => showAnnPopup(), 500);

  // URLからプロフィール交換パラメータを検出
  checkProfileParam();

  // iOS キーボード対策: 入力フォーカス時にスクロール＋モーダル高さ調整
  document.addEventListener('focusin', e => {
    if (e.target.matches('input,textarea,select')) {
      // チャット入力欄はスクロール制御をスキップ
      if (e.target.dataset.chatInput) return;
      // モーダル内の場合、モーダル自体をスクロール
      const modal = e.target.closest('.modal');
      if (modal) {
        setTimeout(() => {
          const rect = e.target.getBoundingClientRect();
          const modalRect = modal.getBoundingClientRect();
          const offset = rect.top - modalRect.top - modal.clientHeight / 3;
          modal.scrollTo({ top: modal.scrollTop + offset, behavior: 'smooth' });
        }, 400);
      } else {
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 400);
      }
    }
  });

  // visualViewport resize（iOS キーボード開閉時のモーダル高さ調整）
  if (window.visualViewport) {
    let _lastVH = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
      const vh = window.visualViewport.height;
      const modal = document.querySelector('.modal-overlay.open .modal');
      if (modal) {
        modal.style.maxHeight = (vh * 0.85) + 'px';
        // キーボードが閉じた時に元に戻す
        if (vh > _lastVH + 100) {
          modal.style.maxHeight = '';
        }
      }
      _lastVH = vh;
    });
  }

  // ブラウザ戻るボタンでナビゲーション
  window.addEventListener('popstate', e => {
    // モーダルが開いている場合 → モーダルを閉じる
    const overlay = document.getElementById('modalOverlay');
    if (overlay && overlay.classList.contains('open')) {
      closeModal();
      return;
    }
    // 個別カードが開いている場合 → 一覧に戻る
    if (openPersonId) {
      openPersonId = null;
      render();
      return;
    }
    if (openGroupId) {
      openGroupId = null;
      render();
      return;
    }
    if (openItemId) {
      openItemId = null;
      render();
      return;
    }
    if (openAllRecordId) {
      openAllRecordId = null;
      render();
      return;
    }
    // 前のタブ状態に戻る
    if (e.state && e.state.tab) {
      currentTab = e.state.tab;
      currentLabel = e.state.label || null;
      document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab===currentTab));
      render();
    }
  });

  // ページ復帰時に下書き復元
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const overlay = document.getElementById('modalOverlay');
      if (overlay && overlay.classList.contains('open')) {
        const draft = restoreDraft();
        if (draft) applyDraft(draft);
      }
    }
  });

  // ラベルバーのスクロール状態でフェード制御
  const labelBar = document.getElementById('labelBar');
  if (labelBar) {
    labelBar.addEventListener('scroll', () => {
      const wrap = labelBar.parentElement;
      const atEnd = labelBar.scrollLeft + labelBar.clientWidth >= labelBar.scrollWidth - 10;
      wrap.classList.toggle('scrolled-end', atEnd);
    });
    // ヒントアニメーションは初回のみ
    labelBar.addEventListener('animationend', () => { labelBar.classList.remove('hint-anim'); });
  }

  // Pull-to-refresh for iOS
  let _ptr_startY = 0, _ptr_pulling = false;
  const _ptr_el = document.createElement('div');
  _ptr_el.className = 'pull-indicator';
  _ptr_el.textContent = '↓ 引いて更新';
  document.body.appendChild(_ptr_el);
  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) { _ptr_startY = e.touches[0].clientY; _ptr_pulling = true; }
  }, {passive: true});
  document.addEventListener('touchmove', e => {
    if (!_ptr_pulling) return;
    const dy = e.touches[0].clientY - _ptr_startY;
    if (dy > 60) { _ptr_el.textContent = '↑ 離して更新'; _ptr_el.classList.add('visible'); }
    else if (dy > 0) { _ptr_el.textContent = '↓ 引いて更新'; _ptr_el.classList.add('visible'); }
    else { _ptr_el.classList.remove('visible'); }
  }, {passive: true});
  document.addEventListener('touchend', () => {
    if (_ptr_el.classList.contains('visible') && _ptr_el.textContent.includes('離して')) {
      _ptr_el.textContent = '更新中...';
      localStorage.setItem('awai_last_tab', currentTab);
      localStorage.setItem('awai_last_label', currentLabel === null ? '' : currentLabel);
      setTimeout(() => { location.reload(); }, 300);
    } else {
      _ptr_el.classList.remove('visible');
    }
    _ptr_pulling = false;
  }, {passive: true});

  // Re-lock when app goes to background and comes back (iOS Safari/PWA)
  // 30秒以上離れた場合のみ再ロック（一瞬の切り替えでは再ロックしない）
  let _lastHidden = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _lastHidden = Date.now();
    } else if (document.visibilityState === 'visible' && _lastHidden) {
      const elapsed = Date.now() - _lastHidden;
      if (elapsed >= 30000) {
        const lockMethod = localStorage.getItem(LOCK_METHOD_KEY) || 'pin';
        if (lockMethod === 'pin' && localStorage.getItem(PIN_KEY)) {
          initPin();
        } else if (lockMethod === 'biometric') {
          requestBiometric();
        }
      }
    }
  });

  } catch(e) { console.error('Init error:', e); alert('初期化エラー: ' + e.message); }
})();
