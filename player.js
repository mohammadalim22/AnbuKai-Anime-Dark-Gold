document.addEventListener('click', function (e) {
  if (!e.target.closest('.search')) sr.className = '';
});

document.querySelectorAll('.arr button').forEach(function (b) {
  b.onclick = function () {
    var r = document.getElementById(b.dataset.r);
    if (r) r.scrollBy({ left: Number(b.dataset.d) * r.clientWidth * 0.9, behavior: 'smooth' });
  };
});

document.querySelectorAll('.bm').forEach(function (b) {
  b.onclick = function (e) {
    e.stopPropagation();
    b.classList.toggle('on');
  };
});

var SH = {};
var PG = 100;

// APIs
var STREAM_API = 'https://anivexa-api-wi89.onrender.com'; // Sub & Dub (Render)
var HINDI_API = 'https://anime-api-uzlk.vercel.app'; // Hindi (Vercel)

var STREAM_PROVIDERS = ['anikoto', 'reanime', 'kaa', 'senshi', 'anizone', 'aniwaves'];

var activeHls = null;
var playerRun = 0;

async function fetchWithTimeout(url, options) {
  options = options || {};
  var controller = new AbortController();
  var settings = Object.assign({}, options);
  var timeout = settings.timeout || 15000;
  delete settings.timeout;
  settings.signal = controller.signal;
  var timer = setTimeout(function () { controller.abort(); }, timeout);
  try { return await fetch(url, settings); } finally { clearTimeout(timer); }
}

function safeStreamUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    var url = new URL(value, STREAM_API + '/');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.href;
  } catch (error) { return ''; }
}

function isHlsUrl(url) { return /\.m3u8(?:[?#]|$)/i.test(url); }

function inferStreamType(url, hint) {
  hint = String(hint || '').toLowerCase();
  if (isHlsUrl(url)) return 'hls';
  if (hint === 'iframe' || hint === 'embed') return 'iframe';
  if (/hls|mpegurl/.test(hint)) return 'hls';
  if (hint === 'video' || hint.indexOf('video/') === 0 || /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url)) return 'video';
  return 'iframe';
}

function providerOrder(server) {
  var first = Number(server) === 1 ? 'reanime' : 'anikoto';
  return [first].concat(STREAM_PROVIDERS.filter(function (provider) { return provider !== first; }));
}

// ==========================================
// 1. SUB & DUB LOGIC (Anivexa API)
// ==========================================
async function fetchProviderStreams(provider, anilistId, episode, audio) {
  var episodeId = provider + '-' + episode;
  var url = STREAM_API + '/watch/' + encodeURIComponent(provider) + '/' + encodeURIComponent(anilistId) + '/' + encodeURIComponent(audio) + '/' + encodeURIComponent(episodeId);
  var response = await fetchWithTimeout(url, { timeout: 15000 });
  if (!response.ok) throw new Error(provider + ': API HTTP ' + response.status);
  var data = await response.json();
  return normalizeStreams(data);
}

// ==========================================
// 2. HINDI LOGIC (Vercel API)
// ==========================================
async function getHindiStream(animeTitle, season, episode) {
  try {
    // ধাপ ১: অ্যানিমের নাম দিয়ে সার্চ করা
    var searchUrl = HINDI_API + '/api/search?s=' + encodeURIComponent(animeTitle) + '&page=1';
    var searchRes = await fetchWithTimeout(searchUrl, { timeout: 15000 });
    if (!searchRes.ok) throw new Error('Search failed');
    
    var searchData = await searchRes.json();
    if (!searchData.success || !searchData.results || !searchData.results.results || searchData.results.results.length === 0) {
      throw new Error('Anime not found in Hindi library');
    }
    
    // ধাপ ২: প্রথম রেজাল্ট থেকে anime_id নেওয়া
    var animeId = searchData.results.results[0].anime_id;
    
    // ধাপ ৩: anime_id দিয়ে স্ট্রিম লিংক আনা
    var streamUrl = HINDI_API + '/api/stream?id=' + encodeURIComponent(animeId) + '&season=' + season + '&ep=' + episode;
    var streamRes = await fetchWithTimeout(streamUrl, { timeout: 15000 });
    if (!streamRes.ok) throw new Error('Stream fetch failed');
    
    var streamData = await streamRes.json();
    if (streamData.success && streamData.results && streamData.results.length > 0) {
      // এম্বেড লিংক রিটার্ন করা
      return streamData.results[0].embed;
    }
    
    return null;
  } catch (error) {
    console.error('Hindi API Error:', error);
    return null;
  }
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================
function normalizeStreams(data) {
  var result = [];
  var seen = new Set();
  function add(value, hint) {
    var url = safeStreamUrl(value);
    if (!url) return;
    var type = inferStreamType(url, hint);
    var key = type + ':' + url;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ type: type, url: url });
  }
  function visit(item) {
    if (!item) return;
    if (typeof item === 'string') { add(item); return; }
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (typeof item !== 'object') return;
    if (item.embedUrl) add(item.embedUrl, 'iframe');
    if (item.embed) add(item.embed, 'iframe');
    var url = item.url || item.file || item.src;
    if (url) add(url, item.type || item.format);
    ['streams', 'sources', 'data', 'results'].forEach(function (key) {
      if (item[key]) visit(item[key]);
    });
  }
  visit(data);
  return result.sort(function (a, b) { return { iframe: 0, hls: 1, video: 2 }[a.type] - { iframe: 0, hls: 1, video: 2 }[b.type]; });
}

function playerIsCurrent(run) {
  var sheet = document.getElementById('sheet');
  return !!(run === playerRun && sheet && sheet.classList.contains('on') && SH.play);
}

function destroyPlayer() {
  var top = document.getElementById('shtop');
  if (activeHls) { try { activeHls.destroy(); } catch (e) {} activeHls = null; }
  if (!top) return;
  var video = top.querySelector('video');
  if (video) { video.onended = null; try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {} }
  var iframe = top.querySelector('iframe');
  if (iframe) iframe.remove();
}

function stopPlayback() {
  playerRun++;
  destroyPlayer();
}

function preparePlayerTop() {
  var top = document.getElementById('shtop');
  if (!top) return null;
  top.className = 'sh-top pl';
  top.removeAttribute('style');
  top.replaceChildren();
  return top;
}

function showPlayerMessage(title, detail) {
  var top = preparePlayerTop();
  if (!top) return;
  var box = document.createElement('div');
  box.className = 'nov';
  box.innerHTML = '<b>⏳</b><span>' + title + '</span><small>' + (detail || '') + '</small>';
  top.appendChild(box);
}

async function mountStream(stream, run) {
  if (!playerIsCurrent(run)) throw new Error('Playback cancelled');
  destroyPlayer();
  var top = preparePlayerTop();
  if (!top) throw new Error('Player container missing');

  if (stream.type === 'iframe') {
    var frame = document.createElement('iframe');
    frame.src = stream.url;
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    frame.style.cssText = 'width:100%;height:100%;border:0';
    top.appendChild(frame);
    return;
  }

  var video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'width:100%;height:100%;background:#000';
  video.onended = function () {
    if (playerIsCurrent(run) && U && U.prefs.auto && SH.e < eN()) play(SH.e + 1);
  };
  top.appendChild(video);

  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () { fail(new Error('Stream loading timed out')); }, 25000);
    function succeed() { if (settled) return; settled = true; clearTimeout(timer); resolve(); }
    function fail(err) { if (settled) return; settled = true; clearTimeout(timer); reject(err); }

    video.addEventListener('loadeddata', succeed, { once: true });
    video.addEventListener('error', function () { fail(new Error('Video failed to load')); });

    if (stream.type === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        var hls = new Hls();
        activeHls = hls;
        hls.loadSource(stream.url);
        hls.attachMedia(video);
      } else {
        fail(new Error('HLS is not supported in this browser'));
      }
    } else {
      video.src = stream.url;
      video.load();
    }
    video.play().catch(function () {});
  });
}

function openSheet(i) {
  stopPlayback();
  var a = ALL[i];
  var p = U ? U.prefs : DP();
  var c = C[i % 5];
  var m = a[2].split(' • ');
  var sh = document.getElementById('sheet');
  var bn = a[4] || a[3];

  SH = { i: i, s: 1, e: 1, l: p.lang, v: p.srv, play: 0, pg: 0 };

  var bg = bn ? 'linear-gradient(to top,rgba(12,12,20,.3),transparent),url(' + cu(bn) + ') center/cover,#0c0c14' : 'radial-gradient(85% 70% at 70% 0%,rgba(' + c + ',.5),transparent 70%),radial-gradient(60% 50% at 0% 100%,rgba(233,196,106,.2),transparent 70%),#0c0c14';

  sh.innerHTML = '<div class="sh-top" id="shtop" style="background:' + bg + '"><button class="sh-x" onclick="closeSheet()" aria-label="Close">✕</button></div><div class="sh-b"><div class="chips"><span class="r">★ ' + a[0] + '</span>' + m.map(function (text) { return '<span>' + esc(text) + '</span>'; }).join('') + '</div><h2>' + esc(a[1]) + '</h2>' + (a[7] ? '<p class="ds">' + esc(a[7]) + '</p>' : '') + '<div class="acts"><button class="btn" onclick="play()">▶ Watch Now</button><button class="btn g" id="ml" onclick="toggleList(ALL[SH.i][1])"></button></div><div id="ctl"></div><div id="np"></div><h4 id="eh" style="display:none">EPISODES</h4><div class="eps" id="eps"></div><div id="cm"></div></div>';

  sh.classList.remove('pm');
  sh.scrollTop = 0;
  sh.classList.add('on');
  document.getElementById('ov').classList.add('on');
  document.body.style.overflow = 'hidden';
  paint();
}

function play(k) {
  if (k) { SH.e = Number(k); SH.pg = Math.floor((SH.e - 1) / PG); }
  SH.play = 1;
  paint();
}

function eN() { return EPN[ALL[SH.i][1]] || 12; }

function mlbtn() {
  var b = document.getElementById('ml');
  if (b) b.textContent = U && U.list.indexOf(ALL[SH.i][1]) > -1 ? '✓ In My List' : '+ My List';
}

function toggleList(n) {
  if (!U) { authView('in'); toast('Login to use My List'); return; }
  var k = U.list.indexOf(n);
  if (k > -1) U.list.splice(k, 1); else U.list.push(n);
  save();
  decorate();
  mlbtn();
}

// ==========================================
// 4. MAIN PLAYER LOGIC (paint)
// ==========================================
async function paint() {
  var a = ALL[SH.i];
  if (!a) return;
  var n = eN();
  var ns = SEASONS[a[1]] || 3;
  var sh = document.getElementById('sheet');
  var pg = Math.min(SH.pg || 0, Math.floor((n - 1) / PG));

  document.getElementById('eh').style.display = SH.play ? '' : 'none';

  if (!SH.play) {
    ['ctl', 'eps', 'cm', 'np'].forEach(function (id) { document.getElementById(id).innerHTML = ''; });
    mlbtn();
    return;
  }

  var options = '';
  var ranges = '';

  for (var i = 1; i <= ns; i++) {
    options += '<option value="' + i + '"' + (i === SH.s ? ' selected' : '') + '>Season ' + i + '</option>';
  }

  if (n > PG) {
    for (var z = 0; z * PG < n; z++) {
      ranges += '<option value="' + z + '"' + (z === pg ? ' selected' : '') + '>Ep ' + (z * PG + 1) + '–' + Math.min(n, (z + 1) * PG) + '</option>';
    }
    ranges = '<select class="sel" onchange="SH.pg=+this.value;paint()" aria-label="Episode range">' + ranges + '</select>';
  }

  document.getElementById('ctl').innerHTML = '<select class="sel" onchange="SH.s=+this.value;SH.e=1;SH.pg=0;paint()" aria-label="Season">' + options + '</select><div class="seg">' + LANGS.map(function (x) { return '<button class="' + (x[0] === SH.l ? 'on' : '') + '" onclick="SH.l=\'' + x[0] + '\';paint()">' + x[1] + '</button>'; }).join('') + '</div><div class="seg">' + [0, 1].map(function (v) { return '<button class="' + (v === SH.v ? 'on' : '') + '" onclick="SH.v=' + v + ';paint()">Server 0' + (v + 1) + '</button>'; }).join('') + '</div>' + ranges;

  var episodes = '';
  for (i = pg * PG + 1; i <= Math.min(n, pg * PG + PG); i++) {
    episodes += '<button class="' + (i === SH.e ? 'on' : '') + '" onclick="play(' + i + ')">' + i + '</button>';
  }
  document.getElementById('eps').innerHTML = episodes;

  document.getElementById('np').innerHTML = '<div class="np"><span>▶ S' + SH.s + ' · Episode ' + SH.e + '</span><div><button ' + (SH.e < 2 ? 'disabled ' : '') + 'onclick="play(' + (SH.e - 1) + ')">‹ Prev</button><button ' + (SH.e >= n ? 'disabled ' : '') + 'onclick="play(' + (SH.e + 1) + ')">Next ›</button></div></div>';

  mlbtn();
  cmt();
  sh.classList.add('pm');

  var run = ++playerRun;
  destroyPlayer();

  // ==========================================
  // 🚨 হিন্দি বাটনে ক্লিক করলে এই অংশটি কাজ করবে 🚨
  // ==========================================
  if (SH.l === 'hindi') {
    showPlayerMessage('Searching Hindi library...', 'Trying ' + a[1] + ' on Hindi API');
    var hindiUrl = await getHindiStream(a[1], SH.s, SH.e);
    
    if (!playerIsCurrent(run)) return;
    
    if (hindiUrl) {
      try {
        await mountStream({ type: 'iframe', url: hindiUrl }, run);
        return;
      } catch (err) {
        console.warn('Hindi embed failed:', err);
      }
    }
    
    if (playerIsCurrent(run)) {
      destroyPlayer();
      showPlayerMessage('Hindi stream not found', 'This anime is not available in Hindi on the library.');
    }
    return;
  }

  // ==========================================
  // 🚨 Sub এবং Dub-এর জন্য আগের Anivexa লজিক (কোনো পরিবর্তন নেই) 🚨
  // ==========================================
  var providers = providerOrder(SH.v);
  var audio = SH.l === 'dub' ? 'dub' : 'sub';
  var lastError = '';

  for (var p = 0; p < providers.length; p++) {
    if (!playerIsCurrent(run)) return;
    destroyPlayer();
    showPlayerMessage('Loading stream...', 'Trying ' + providers[p] + ' (' + (p + 1) + '/' + providers.length + ')');
    try {
      var streams = await fetchProviderStreams(providers[p], a[10] || a.id, SH.e, audio);
      if (!playerIsCurrent(run)) return;
      for (var j = 0; j < streams.length; j++) {
        if (!playerIsCurrent(run)) return;
        try {
          await mountStream(streams[j], run);
          if (playerIsCurrent(run)) return;
        } catch (err) {
          lastError = err.message;
        }
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (playerIsCurrent(run)) {
    destroyPlayer();
    showPlayerMessage('No playable stream found', lastError || 'Please try another server or anime.');
  }
}

function decorate() {
  document.querySelectorAll('.card').forEach(function (card, i) {
    var a = ALL[i];
    if (!a) return;
    var poster = card.querySelector('.poster');
    var bookmark = card.querySelector('.bm');
    if (poster && hasVid(a[1]) && !card.querySelector('.wbtn')) {
      poster.classList.add('hv');
      var watch = document.createElement('button');
      watch.className = 'wbtn';
      watch.textContent = '▶ Watch';
      watch.onclick = function (event) { event.stopPropagation(); openSheet(i); play(); };
      poster.appendChild(watch);
    }
    if (bookmark) {
      bookmark.classList.toggle('on', !!U && U.list.indexOf(a[1]) > -1);
      bookmark.onclick = function (event) { event.stopPropagation(); toggleList(a[1]); };
    }
  });
}

document.getElementById('mw').addEventListener('click', function (e) { if (e.target.id === 'mw') closeM(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeM(); });

/* ---- comments ---- */
function ck() { return 'akC:' + ALL[SH.i][1] + ':' + SH.s + ':' + SH.e; }
function ago(t) { var s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; }
function cmt() {
  var L = ls(ck()) || [];
  var h = '<h4>COMMENTS · S' + SH.s + ' E' + SH.e + ' <span class="cnt">' + L.length + '</span></h4>';
  h += U ? '<div class="cbox">' + av(U, 36) + '<textarea id="ct" maxlength="500" rows="2" placeholder="Write a comment..."></textarea><button class="btn sm" onclick="postC()">Post</button></div>' : '<button class="lnk" onclick="authView(\'in\')">Login to join the discussion</button>';
  h += L.length ? L.map(function (c, i) {
    var l = c.l || [];
    return '<div class="cmt">' + av(USERS[c.e] || {}, 34) + '<div><b>' + esc(c.n) + '</b><small>' + ago(c.t) + '</small><p>' + esc(c.x) + '</p><button class="lk' + (U && l.indexOf(U.email) > -1 ? ' on' : '') + '" onclick="likeC(' + i + ')">♥ ' + l.length + '</button>' + (U && c.e === U.email ? '<button class="lk" onclick="delC(' + i + ')">Delete</button>' : '') + '</div></div>';
  }).join('') : '<p class="mu" style="margin-top:10px">No comments yet. Be the first!</p>';
  document.getElementById('cm').innerHTML = h;
}
function postC() { var t = document.getElementById('ct'), x = t.value.trim(); if (!x || !U) return; var k = ck(), L = ls(k) || []; L.unshift({ e: U.email, n: U.name, x: x, t: Date.now(), l: [] }); ls(k, L.slice(0, 100)); cmt(); }
function likeC(i) { if (!U) { authView('in'); return; } var k = ck(), L = ls(k) || [], c = L[i]; if (!c) return; c.l = c.l || []; var j = c.l.indexOf(U.email); if (j > -1) c.l.splice(j, 1); else c.l.push(U.email); ls(k, L); cmt(); }
function delC(i) { if (!U) return; var k = ck(), L = ls(k) || []; if (!L[i] || L[i].e !== U.email) return; L.splice(i, 1); ls(k, L); cmt(); }

ub();
applyTheme();
decorate();
