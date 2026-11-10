/* =====================================================
   i18n.js  -  Website language: Japanese / English / Bangla
   - t('English text', {vars}) -> translated text (use in JS)
   - Static + dynamic text anywhere on the page is translated
     automatically by a MutationObserver (exact-match dictionary).
   - Choice is saved in localStorage ('akLang').
   Load this file BEFORE auth.js / player.js.
   ===================================================== */
(function () {
  // [English, Japanese, Bangla]
  var D = [
    /* ---- navigation / home ---- */
    ['Home', 'ホーム', 'হোম'],
    ['Anime', 'アニメ', 'অ্যানিমে'],
    ['Movies', '映画', 'মুভি'],
    ['My List', 'マイリスト', 'আমার লিস্ট'],
    ['Login', 'ログイン', 'লগইন'],
    ['Contact', 'お問い合わせ', 'যোগাযোগ'],
    ['Your Anime World', 'あなたのアニメワールド', 'তোমার অ্যানিমে জগৎ'],
    ['YOUR ANIME WORLD', 'あなたのアニメワールド', 'তোমার অ্যানিমে জগৎ'],
    ['Enter Website →', 'サイトに入る →', 'ওয়েবসাইটে ঢোকো →'],
    ['Don’t show this intro again', 'このイントロを再表示しない', 'এই ইন্ট্রো আর দেখাবে না'],
    ['Search anime...', 'アニメを検索...', 'অ্যানিমে খোঁজো...'],
    ['Search', '検索', 'খোঁজো'],
    ['Trending Now', '急上昇', 'এখন ট্রেন্ডিং'],
    ['TRENDING', 'トレンド', 'ট্রেন্ডিং'],
    ['Top Rated', '高評価', 'সেরা রেটিং'],
    ['TOP 10', 'トップ10', 'টপ ১০'],
    ['Popular', '人気', 'জনপ্রিয়'],
    ['FAN FAVORITES', 'ファンのお気に入り', 'ফ্যানদের পছন্দ'],
    ['All', 'すべて', 'সব'],
    ['Action', 'アクション', 'অ্যাকশন'],
    ['Adventure', '冒険', 'অ্যাডভেঞ্চার'],
    ['Romance', 'ロマンス', 'রোমান্স'],
    ['Fantasy', 'ファンタジー', 'ফ্যান্টাসি'],
    ['Comedy', 'コメディ', 'কমেডি'],
    ['Horror', 'ホラー', 'হরর'],
    ['Sci-Fi', 'SF', 'সায়েন্স ফিকশন'],
    ['Mystery', 'ミステリー', 'রহস্য'],
    ['Sports', 'スポーツ', 'খেলাধুলা'],
    ['ONGOING', '放送中', 'চলমান'],
    ['COMPLETED', '完結', 'সমাপ্ত'],
    ['NEW', '新着', 'নতুন'],
    ['No results found', '見つかりません', 'কিছু পাওয়া যায়নি'],
    ['Watch Now', '今すぐ見る', 'এখনই দেখো'],
    ['▶ Watch Now', '▶ 今すぐ見る', '▶ এখনই দেখো'],
    ['▶ Watch', '▶ 再生', '▶ দেখো'],
    ['+ My List', '+ マイリスト', '+ আমার লিস্ট'],
    ['✓ In My List', '✓ マイリスト登録済み', '✓ লিস্টে আছে'],
    ['EPISODES', 'エピソード', 'পর্বসমূহ'],
    ['Exit AnbuKai?', 'AnbuKaiを終了しますか？', 'AnbuKai থেকে বের হবে?'],
    ['Do you really want to exit?', '本当に終了しますか？', 'সত্যিই বের হতে চাও?'],
    ['Cancel', 'キャンセル', 'বাতিল'],
    ['Exit', '終了', 'বের হও'],
    ['#{n} SPOTLIGHT', 'スポットライト #{n}', 'স্পটলাইট #{n}'],
    ['Season {n}', 'シーズン{n}', 'সিজন {n}'],

    /* ---- player ---- */
    ['Sub', 'サブ', 'সাব'],
    ['Dub', '吹替', 'ডাব'],
    ['Provider', 'プロバイダー', 'প্রোভাইডার'],
    ['Auto · try available providers', '自動・利用可能なプロバイダーを試す', 'অটো · সব প্রোভাইডার চেষ্টা করবে'],
    ['Playing: {title} · AniList #{id}', '再生中: {title} · AniList #{id}', 'চলছে: {title} · AniList #{id}'],
    ['S{s} · Episode {e}', 'S{s} · 第{e}話', 'S{s} · পর্ব {e}'],
    ['Prev', '前へ', 'আগের'],
    ['Next', '次へ', 'পরের'],
    ['Retry', '再試行', 'আবার চেষ্টা'],
    ['Retry current selection', '現在の選択を再試行', 'আবার চেষ্টা করো'],
    ['Download', 'ダウンロード', 'ডাউনলোড'],
    ['No video on the first try? Please try again — it will play 100% on the second attempt.',
      '最初に動画が表示されない場合は、もう一度お試しください。2回目は100%再生されます。',
      'প্রথমবার ভিডিও না এলে আবার চেষ্টা করুন — দ্বিতীয়বার ১০০% ভিডিও চলবে।'],
    ['Actual sources returned by {p}:', '{p} から取得したソース:', '{p} থেকে পাওয়া সোর্স:'],
    ['Source {n}', 'ソース {n}', 'সোর্স {n}'],
    ['Loading provider...', 'プロバイダーを読み込み中...', 'প্রোভাইডার লোড হচ্ছে...'],
    ['Finding seasons...', 'シーズンを検索中...', 'সিজন খোঁজা হচ্ছে...'],
    ['Finding AniList ID...', 'AniList IDを検索中...', 'AniList ID খোঁজা হচ্ছে...'],
    ['Video not found', '動画が見つかりません', 'ভিডিও পাওয়া যায়নি'],
    ['No AniList ID yet (AniList may be busy). Press Retry in a minute.', 'AniList IDがまだありません。1分後に再試行してください。', 'AniList ID পাওয়া যায়নি। এক মিনিট পরে আবার চেষ্টা করো।'],
    ['No playable stream found', '再生できるストリームがありません', 'চালানোর মতো স্ট্রিম পাওয়া যায়নি'],
    ['Playback stopped', '再生が停止しました', 'প্লেব্যাক থেমে গেছে'],
    ['Player error', 'プレーヤーエラー', 'প্লেয়ার এরর'],
    ['Press Watch Now first, then download.', '先に「今すぐ見る」を押してからダウンロードしてください。', 'আগে “এখনই দেখো” চাপো, তারপর ডাউনলোড করো।'],
    ['Embedded players cannot be downloaded. Choose another source.', '埋め込みプレーヤーはダウンロードできません。別のソースを選んでください。', 'এম্বেড প্লেয়ার ডাউনলোড হয় না। অন্য সোর্স বেছে নাও।'],
    ['Finding a downloadable source', 'ダウンロード可能なソースを検索中', 'ডাউনলোডযোগ্য সোর্স খোঁজা হচ্ছে'],
    ['No downloadable source found for this episode.', 'このエピソードにはダウンロード可能なソースがありません。', 'এই পর্বের জন্য ডাউনলোডযোগ্য সোর্স পাওয়া যায়নি।'],
    ['Downloading', 'ダウンロード中', 'ডাউনলোড হচ্ছে'],
    ['Saved to your Downloads ✓', 'ダウンロードに保存しました ✓', 'ডাউনলোডে সেভ হয়েছে ✓'],
    ['Download cancelled', 'ダウンロードをキャンセルしました', 'ডাউনলোড বাতিল হয়েছে'],
    ['Download failed', 'ダウンロード失敗', 'ডাউনলোড ব্যর্থ'],
    ['Login to use My List', 'マイリストを使うにはログインしてください', 'লিস্ট ব্যবহার করতে লগইন করো'],

    /* ---- comments ---- */
    ['COMMENTS', 'コメント', 'মন্তব্য'],
    ['Post', '投稿', 'পোস্ট'],
    ['Write a comment...', 'コメントを書く...', 'মন্তব্য লেখো...'],
    ['Login to join the discussion', 'ログインして議論に参加', 'আলোচনায় যোগ দিতে লগইন করো'],
    ['No comments yet. Be the first!', 'まだコメントはありません。最初の投稿者になろう！', 'এখনও কোনো মন্তব্য নেই। প্রথম হও!'],
    ['Delete', '削除', 'মুছো'],
    ['just now', 'たった今', 'এইমাত্র'],
    ['{n}m ago', '{n}分前', '{n} মিনিট আগে'],
    ['{n}h ago', '{n}時間前', '{n} ঘণ্টা আগে'],
    ['{n}d ago', '{n}日前', '{n} দিন আগে'],

    /* ---- auth ---- */
    ['Create account', 'アカウント作成', 'অ্যাকাউন্ট খোলো'],
    ['Welcome back', 'おかえりなさい', 'স্বাগতম'],
    ['Continue with Google', 'Googleで続ける', 'Google দিয়ে চালিয়ে যাও'],
    ['or continue with email', 'またはメールで続ける', 'অথবা ইমেইল দিয়ে'],
    ['Your name', 'お名前', 'তোমার নাম'],
    ['Email', 'メール', 'ইমেইল'],
    ['Password (min 6 characters)', 'パスワード（6文字以上）', 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)'],
    ['Sign up', '登録', 'সাইন আপ'],
    ['Already have an account?', 'アカウントをお持ちですか？', 'আগেই অ্যাকাউন্ট আছে?'],
    ['New here?', '初めてですか？', 'নতুন?'],
    ['Enter a valid email', '有効なメールを入力してください', 'সঠিক ইমেইল দাও'],
    ['Password must be at least 6 characters', 'パスワードは6文字以上です', 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে'],
    ['This email is already registered', 'このメールは登録済みです', 'এই ইমেইল আগেই নিবন্ধিত'],
    ['Incorrect email or password', 'メールまたはパスワードが違います', 'ইমেইল বা পাসওয়ার্ড ভুল'],
    ['Logged out', 'ログアウトしました', 'লগআউট হয়েছে'],
    ['Delete your account?', 'アカウントを削除しますか？', 'অ্যাকাউন্ট মুছে ফেলবে?'],
    ['Demo mode: add FIREBASE_CONFIG for real Google login', 'デモモード: 本物のGoogleログインにはFIREBASE_CONFIGを設定', 'ডেমো মোড: আসল Google লগইনের জন্য FIREBASE_CONFIG দাও'],

    /* ---- profile ---- */
    ['Member since {d}', '{d}から会員', '{d} থেকে মেম্বার'],
    ['Watched', '視聴済み', 'দেখা হয়েছে'],
    ['Watch time', '視聴時間', 'দেখার সময়'],
    ['PROFILE', 'プロフィール', 'প্রোফাইল'],
    ['Save', '保存', 'সেভ'],
    ['Saved ✓', '保存しました ✓', 'সেভ হয়েছে ✓'],
    ['Change avatar / photo', 'アバター / 写真を変更', 'অ্যাভাটার / ছবি বদলাও'],
    ['WEBSITE LANGUAGE', 'サイトの言語', 'ওয়েবসাইটের ভাষা'],
    ['Language changed', '言語を変更しました', 'ভাষা বদলানো হয়েছে'],
    ['PLAYBACK', '再生設定', 'প্লেব্যাক'],
    ['Default language', '既定の音声', 'ডিফল্ট ভাষা'],
    ['Default server', '既定のサーバー', 'ডিফল্ট সার্ভার'],
    ['Server 01', 'サーバー01', 'সার্ভার ০১'],
    ['Server 02', 'サーバー02', 'সার্ভার ০২'],
    ['Quality', '画質', 'কোয়ালিটি'],
    ['Auto', '自動', 'অটো'],
    ['Autoplay next episode', '次のエピソードを自動再生', 'পরের পর্ব নিজে চালু হবে'],
    ['Data saver', 'データ節約', 'ডেটা সেভার'],
    ['APP', 'アプリ', 'অ্যাপ'],
    ['Theme', 'テーマ', 'থিম'],
    ['Dark', 'ダーク', 'ডার্ক'],
    ['Light', 'ライト', 'লাইট'],
    ['New episode notification', '新エピソード通知', 'নতুন পর্বের নোটিফিকেশন'],
    ['MY LIST', 'マイリスト', 'আমার লিস্ট'],
    ['Your list is empty', 'リストは空です', 'তোমার লিস্ট খালি'],
    ['WATCH HISTORY', '視聴履歴', 'দেখার ইতিহাস'],
    ['Nothing watched yet', 'まだ何も見ていません', 'এখনও কিছু দেখা হয়নি'],
    ['Clear history', '履歴を消去', 'ইতিহাস মুছো'],
    ['ACCOUNT', 'アカウント', 'অ্যাকাউন্ট'],
    ['Logout', 'ログアウト', 'লগআউট'],
    ['Delete account', 'アカウント削除', 'অ্যাকাউন্ট মুছো'],
    ['Choose your avatar', 'アバターを選択', 'অ্যাভাটার বেছে নাও'],
    ['From gallery', 'ギャラリーから', 'গ্যালারি থেকে'],
    ['Google photo', 'Googleの写真', 'Google ছবি'],
    ['Male', '男性', 'ছেলে'],
    ['Female', '女性', 'মেয়ে'],
    ['Adjust your photo', '写真を調整', 'ছবি ঠিক করো'],
    ['Drag to center your face, use the slider to zoom', 'ドラッグで位置調整、スライダーでズーム', 'টেনে মুখ মাঝে আনো, স্লাইডারে জুম করো'],
    ['Save photo', '写真を保存', 'ছবি সেভ করো'],
    ['Your list', 'あなたのリスト', 'তোমার লিস্ট']
  ];

  var MAP = { ja: {}, bn: {} };
  D.forEach(function (r) { MAP.ja[r[0]] = r[1]; MAP.bn[r[0]] = r[2]; });

  /* regex rules for dynamic strings: [regex, dictionary key, variable name] */
  var RULES = [
    [/^Season (\d+)$/, 'Season {n}', 'n'],
    [/^#(\d+) SPOTLIGHT$/, '#{n} SPOTLIGHT', 'n']
  ];

  var lang = 'en';
  try { lang = localStorage.getItem('akLang') || 'en'; } catch (e) {}
  if (lang !== 'ja' && lang !== 'bn') lang = 'en';

  function fmt(s, v) {
    if (!v) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; });
  }

  window.t = function (key, vars) {
    var m = MAP[lang];
    return fmt((m && m[key]) || key, vars);
  };

  /* translate one raw string, or return null if there is nothing to translate */
  function tr(s) {
    if (lang === 'en') return null;
    var k = s.trim();
    if (!k) return null;
    var m = MAP[lang];
    if (m[k]) return s.replace(k, function () { return m[k]; });
    if (k.indexOf(' • ') > 0) {
      var out = k.split(' • ').map(function (p) { return m[p] || p; }).join(' • ');
      return out !== k ? s.replace(k, function () { return out; }) : null;
    }
    for (var i = 0; i < RULES.length; i++) {
      var hit = RULES[i][0].exec(k);
      if (hit) {
        var v = {}; v[RULES[i][2]] = hit[1];
        var res = fmt(m[RULES[i][1]] || '', v);
        return res ? s.replace(k, function () { return res; }) : null;
      }
    }
    return null;
  }

  var store = new WeakMap();
  var busy = false;
  var obs = null;
  var SKIP = /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT|CODE)$/;

  function doText(n) {
    var p = n.parentNode;
    if (!p || SKIP.test(p.nodeName)) return;
    var v = n.nodeValue, rec = store.get(n);
    if (rec && v === rec.t) {
      var r0 = tr(rec.o);
      if (r0 !== null) { n.nodeValue = r0; rec.t = r0; } else { n.nodeValue = rec.o; store.delete(n); }
      return;
    }
    if (rec) store.delete(n);
    var r = tr(v);
    if (r !== null && r !== v) { store.set(n, { o: v, t: r }); n.nodeValue = r; }
  }

  var ATTRS = ['placeholder', 'aria-label', 'title'];
  function doAttrs(el) {
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      var key = '_o_' + a;
      var cur = el.getAttribute(a);
      var rec = el[key];
      if (rec && cur === rec.t) cur = rec.o; else if (rec) el[key] = null;
      var r = tr(cur);
      if (r !== null) { el[key] = { o: cur, t: r }; el.setAttribute(a, r); }
      else if (el[key]) { el.setAttribute(a, el[key].o); el[key] = null; }
    });
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP.test(root.nodeName)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(doText);
    var els = root.querySelectorAll('[placeholder],[aria-label],[title]');
    for (var i = 0; i < els.length; i++) doAttrs(els[i]);
  }

  function run(fn) {
    busy = true;
    try { fn(); } finally { if (obs) obs.takeRecords(); busy = false; }
  }

  function start() {
    if (obs || !document.documentElement) return;
    obs = new MutationObserver(function (list) {
      if (busy) return;
      run(function () {
        list.forEach(function (m) {
          if (m.type === 'characterData') doText(m.target);
          else m.addedNodes.forEach(function (n) { walk(n); });
        });
      });
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function setLang(l) {
    if (l !== 'ja' && l !== 'bn') l = 'en';
    lang = l;
    try { localStorage.setItem('akLang', l); } catch (e) {}
    document.documentElement.lang = l;
    run(function () { walk(document.body); });
    try { document.dispatchEvent(new CustomEvent('ak-lang', { detail: l })); } catch (e) {}
  }

  window.I18N = {
    get: function () { return lang; },
    set: setLang,
    langs: [
      ['ja', '日本語', 'Japanese', '🇯🇵'],
      ['en', 'English', 'English', '🇬🇧'],
      ['bn', 'বাংলা', 'Bangla', '🇧🇩']
    ]
  };

  start();
  function first() { document.documentElement.lang = lang; if (lang !== 'en') run(function () { walk(document.body); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first); else first();
})();