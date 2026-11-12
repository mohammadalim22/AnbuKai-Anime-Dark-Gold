/* =====================================================
   COMPLETE player.js (Anivexa + YouTube + AnimeSalt)
   - Added YouTube (Trailer/Full Video via AniList) & AnimeSalt (Web Scraping)
   - Castle TV & MX Player added but will show error (Requires Backend)
   ===================================================== */

var SH = {};
var PG = 100;

var STREAM_API = 'https://anivexa-api-wi89.onrender.com'; // Anivexa API Base

// প্রোভাইডার লিস্টে YouTube এবং AnimeSalt যুক্ত করা হলো
var STREAM_PROVIDERS = [
  'anikoto', 'reanime', 'kaa', 'senshi', 'anizone', 'aniwaves', 
  'youtube', 'animesalt', 'castletv', 'mxplayer'
];

var activeHls = null;
var activePlayback = null;
var playerRun = 0;
var playbackKey = '';
var hlsLibraryPromise = null;

/* ================= DATA HELPERS ================= */

function hasVid(name) {
  var item = typeof VIDEOS !== 'undefined' && VIDEOS[name];
  return !!item && Object.keys(item).length > 0;
}

function vurl(name, season, episode, language, server) {
  var anime = typeof VIDEOS !== 'undefined' && VIDEOS[name];
  var item = anime && anime[season] && anime[season][episode] && anime[season][episode][language];
  return item && item[server] || '';
}

function cu(url) {
  return encodeURI(url).replace(/[()']/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}

function getAnimeId(anime) {
  if (!anime) return null;
  var values = [anime[10], anime.id];
  for (var i = 0; i < values.length; i++) {
    var id = Number(values[i]);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

function safeStreamUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    var url = new URL(value, base || STREAM_API + '/');
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch (error) { return ''; }
}

function inferStreamType(url, hint) {
  hint = String(hint || '').toLowerCase();
  if (/\.m3u8(?:[?#]|$)/i.test(url)) return 'hls';
  if (hint === 'iframe' || hint === 'embed') return 'iframe';
  if (/hls|mpegurl/.test(hint)) return 'hls';
  if (hint === 'video' || hint.indexOf('video/') === 0 || /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url)) return 'video';
  return 'iframe';
}

function titleKey(title) {
  return String(title || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function playerLanguages() {
  var base = typeof LANGS !== 'undefined' ? LANGS : [['sub', 'Sub'], ['dub', 'Dub']];
  var out = base.filter(function (item) { return item[0] === 'sub' || item[0] === 'dub'; });
  return out.length ? out : [['sub', 'Sub'], ['dub', 'Dub']];
}

function stateKey() {
  return [SH.i, SH.s, SH.e, SH.l, SH.provider || 'auto', SH.src === null ? 'auto' : SH.src, SH.v].join('|');
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}


/* ================= SEASON CHAIN ================= */
var SEASON_FORMATS = /^(TV|TV_SHORT|ONA)$/;
var SEASON_FIELDS = 'id type format episodes status seasonYear startDate{year} title{romaji english} nextAiringEpisode{episode}';
var SEASON_QUERY = 'query($id:Int){Media(id:$id,type:ANIME){' + SEASON_FIELDS + ' relations{edges{relationType(version:2) node{' + SEASON_FIELDS + '}}}}}';
var seasonChainCache = new Map();
var seasonNodeCache = new Map();
var chainToken = 0;

var seasonChainStamp = new Map();
var seasonCooldown = 0;
var titleIdCache = new Map();

try {
  var savedChains = JSON.parse(localStorage.getItem('akSeasons2') || '{}');
  Object.keys(savedChains).forEach(function (key) {
    var entry = savedChains[key];
    if (entry && Array.isArray(entry.c) && Date.now() - entry.t < 3 * 864e5) {
      seasonChainCache.set(Number(key), entry.c);
      seasonChainStamp.set(Number(key), entry.t);
    }
  });
} catch (error) {}

function saveSeasonChains() {
  try {
    if (seasonChainCache.size > 200) return;
    var out = {};
    seasonChainCache.forEach(function (chain, key) { out[key] = { t: seasonChainStamp.get(key) || Date.now(), c: chain }; });
    localStorage.setItem('akSeasons2', JSON.stringify(out));
  } catch (error) {}
}

function anilistBusy() {
  return Date.now() < Math.max(seasonCooldown, window.akBlockUntil || 0);
}

function fetchSeasonNode(id) {
  if (seasonNodeCache.has(id)) return seasonNodeCache.get(id);
  if (anilistBusy()) return Promise.reject(new Error('AniList busy'));
  var promise = fetchWithTimeout('https://graphql.anilist.co', {
    method: 'POST',
    timeout: 8000,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: SEASON_QUERY, variables: { id: id } })
  }).then(function (response) {
    if (response.status === 429) seasonCooldown = Date.now() + 60000;
    if (!response.ok) throw new Error('AniList HTTP ' + response.status);
    return response.json();
  }).then(function (json) {
    if (!json || !json.data || !json.data.Media) throw new Error('AniList: no data');
    return json.data.Media;
  });
  seasonNodeCache.set(id, promise);
  promise.catch(function () { seasonNodeCache.delete(id); });
  return promise;
}

function seasonYearOf(node) {
  return node.seasonYear || (node.startDate && node.startDate.year) || 9999;
}

function seasonSummary(node) {
  var episodes = node.episodes || (node.nextAiringEpisode ? node.nextAiringEpisode.episode - 1 : 0) || 0;
  return {
    id: node.id,
    title: (node.title && (node.title.english || node.title.romaji)) || '',
    episodes: episodes,
    year: node.seasonYear || (node.startDate && node.startDate.year) || 0
  };
}

function seasonRelations(node, type, seen, latestFirst) {
  var edges = (node && node.relations && node.relations.edges) || [];
  return edges.filter(function (edge) {
    var n = edge && edge.node;
    return edge.relationType === type && n && n.type === 'ANIME' && SEASON_FORMATS.test(n.format || '') && !seen.has(n.id);
  }).map(function (edge) { return edge.node; }).sort(function (a, b) {
    var fa = a.format === 'TV' ? 0 : 1;
    var fb = b.format === 'TV' ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return latestFirst ? seasonYearOf(b) - seasonYearOf(a) : seasonYearOf(a) - seasonYearOf(b);
  });
}

async function buildSeasonChain(baseId, getNode) {
  var base = await getNode(baseId);
  if (!base || !SEASON_FORMATS.test(base.format || '')) return { chain: [seasonSummary(base)], complete: true };

  var seen = new Set([base.id]);
  var before = [];
  var after = [];
  var complete = true;
  var cur = base;
  var hop;

  for (hop = 0; hop < 8; hop++) {
    var prev = seasonRelations(cur, 'PREQUEL', seen, true)[0];
    if (!prev) break;
    seen.add(prev.id);
    before.unshift(seasonSummary(prev));
    try { cur = await getNode(prev.id); } catch (error) { complete = false; break; }
  }

  cur = base;
  for (hop = 0; hop < 8; hop++) {
    var next = seasonRelations(cur, 'SEQUEL', seen, false)[0];
    if (!next) break;
    seen.add(next.id);
    after.push(seasonSummary(next));
    try { cur = await getNode(next.id); } catch (error) { complete = false; break; }
  }

  return { chain: before.concat([seasonSummary(base)], after), complete: complete };
}

async function loadSeasonChain(baseId) {
  var cached = seasonChainCache.get(baseId);
  if (cached) return cached;
  var result = await buildSeasonChain(baseId, fetchSeasonNode);
  if (result.complete) {
    result.chain.forEach(function (item) { seasonChainCache.set(item.id, result.chain); seasonChainStamp.set(item.id, Date.now()); });
    saveSeasonChains();
  }
  return result.chain;
}

function applySeasonChain(token, chain, baseId) {
  if (!SH || SH.chainTok !== token) return;
  var index = -1;
  if (Array.isArray(chain)) {
    for (var i = 0; i < chain.length; i++) { if (chain[i].id === baseId) { index = i; break; } }
  }
  if (index < 0) {
    var current = typeof ALL !== 'undefined' ? ALL[SH.i] : null;
    var name = current ? String(current[1]) : '';
    var match = name.match(/(?:season|part|cour)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+season/i);
    chain = [{ id: baseId, title: name, episodes: 0, year: 0, num: match ? Number(match[1] || match[2]) : 0 }];
    index = 0;
  }
  SH.chain = chain;
  SH.chainReady = true;
  SH.baseS = index + 1;
  if (!SH.sTouched) SH.s = index + 1;
  if (SH.play) paint(true); else paint();
}

async function resolveAnimeIdByTitle(title) {
  var key = titleKey(title);
  if (!key) return null;
  if (titleIdCache.has(key)) return titleIdCache.get(key);
  if (anilistBusy()) return null;
  try {
    var response = await fetchWithTimeout('https://graphql.anilist.co', {
      method: 'POST',
      timeout: 8000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query($s:String){Media(search:$s,type:ANIME,sort:SEARCH_MATCH){id}}', variables: { s: String(title) } })
    });
    if (response.status === 429) { seasonCooldown = Date.now() + 60000; return null; }
    var json = await response.json();
    var found = json && json.data && json.data.Media && json.data.Media.id;
    if (found) { titleIdCache.set(key, found); return found; }
  } catch (error) {}
  return null;
}

function startSeasonChainByTitle(anime) {
  var token = ++chainToken;
  SH.chainTok = token;
  resolveAnimeIdByTitle(anime[1]).then(function (found) {
    if (!SH || SH.chainTok !== token) return;
    if (found) { anime[10] = found; startSeasonChain(found); } else { applySeasonChain(token, null, null); }
  });
}

function startSeasonChain(baseId) {
  var token = ++chainToken;
  SH.chainTok = token;
  var cached = seasonChainCache.get(baseId);
  if (cached) { applySeasonChain(token, cached, baseId); return; }
  var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 9000); });
  Promise.race([loadSeasonChain(baseId), timeout]).then(
    function (chain) { applySeasonChain(token, chain, baseId); },
    function () { applySeasonChain(token, null, baseId); }
  );
}

/* ================= NETWORK ================= */

async function fetchWithTimeout(url, options) {
  options = options || {};
  var controller = new AbortController();
  var settings = Object.assign({}, options);
  var timeout = settings.timeout || 18000;
  delete settings.timeout;
  settings.signal = controller.signal;
  var timer = setTimeout(function () { controller.abort(); }, timeout);
  try { return await fetch(url, settings); } finally { clearTimeout(timer); }
}

async function requestJson(url, retryServerError, timeout) {
  var maxAttempts = retryServerError ? 2 : 1;
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt) await wait(1200);
    var response;
    try {
      response = await fetchWithTimeout(url, { timeout: timeout || 18000, cache: 'no-store' });
    } catch (error) {
      var networkError = new Error((error.name === 'AbortError' ? 'API request timed out' : 'API request failed: network or CORS') + ' · ' + url);
      networkError.url = url;
      throw networkError;
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt + 1 < maxAttempts) continue;
      var httpError = new Error('API HTTP ' + response.status + ' · ' + url);
      httpError.status = response.status;
      httpError.url = url;
      throw httpError;
    }

    var data;
    try { data = await response.json(); } catch (error) { throw new Error('API returned non-JSON content · ' + url); }
    if (data && data.success === false) { throw new Error(String(data.message || data.mmessage || 'API reported failure') + ' · ' + url); }
    return data;
  }
}

/* ================= STREAM NORMALIZATION ================= */

function normalizeStreams(data, base) {
  var output = [];
  var seen = new Set();

  function add(value, hint, special, label) {
    var url = safeStreamUrl(value, base);
    if (!url) return;
    var type = inferStreamType(url, hint);
    var key = type + ':' + url;
    if (seen.has(key)) return;
    seen.add(key);
    output.push({ url: url, type: type, specialHls: !!special && type === 'hls', label: String(label || '') });
  }

  function visit(item, depth, inheritedSpecial, label) {
    if (!item || depth > 5) return;
    if (typeof item === 'string') { add(item, '', inheritedSpecial, label); return; }
    if (Array.isArray(item)) { item.forEach(function (entry) { visit(entry, depth + 1, inheritedSpecial, label); }); return; }
    if (typeof item !== 'object') return;

    var special = inheritedSpecial || !!item.playlist_key || !!item.playlistKey;
    var sourceLabel = item.server || item.label || label;

    [item.embedUrl, item.embed_url, item.embed, item.iframe].forEach(function (embed) {
      if (typeof embed === 'string') add(embed, 'iframe', false, sourceLabel);
      else if (embed && typeof embed === 'object') add(embed.url || embed.src, 'iframe', false, sourceLabel);
    });

    var url = item.proxiedUrl || item.url || item.file || item.src;
    if (url) add(url, item.type || item.format || item.mimeType, special, sourceLabel);

    ['streams', 'sources', 'data', 'results', 'stream'].forEach(function (key) {
      if (item[key]) visit(item[key], depth + 1, special, sourceLabel);
    });
  }

  visit(data, 0, false, '');
  return output;
}

// ==================== NEW CUSTOM PROVIDERS LOGIC ====================

async function fetchYouTubeStream(anilistId) {
  // AniList API থেকে ট্রেইলার বা ভিডিও আইডি বের করা
  const query = `query($id:Int){Media(id:$id){trailer{id site}}}`;
  const res = await fetchWithTimeout('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: query, variables: { id: anilistId } })
  });
  const json = await res.json();
  const trailer = json?.data?.Media?.trailer;
  
  if (trailer && trailer.site === 'youtube' && trailer.id) {
    return [{ url: `https://www.youtube.com/embed/${trailer.id}?autoplay=1`, type: 'iframe', label: 'YouTube Trailer' }];
  }
  throw new Error("YouTube video not found for this anime.");
}

async function fetchAnimeSaltStream(animeTitle, episode) {
  // AnimeSalt থেকে ডেটা স্ক্র্যাপ করা (CORS Proxy ব্যবহার করে)
  const proxy = 'https://api.allorigins.win/raw?url=';
  const searchUrl = `https://animesalt.cc/?s=${encodeURIComponent(animeTitle)}`;
  
  const res = await fetch(proxy + encodeURIComponent(searchUrl));
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // সাইটের HTML স্ট্রাকচার অনুযায়ী সিলেক্টর (এটি ভবিষ্যতে পরিবর্তন হতে পারে)
  const links = Array.from(doc.querySelectorAll('.title a, article a')).map(a => a.href);
  if (links.length === 0) throw new Error("Anime not found on AnimeSalt.");

  // প্রথম লিঙ্কটি নেওয়া হচ্ছে
  const animeUrl = links[0];
  
  // এপিসোড পেজে যাওয়া (ধরে নিচ্ছি সাইটে /episode-1/ ফরম্যাটে লিঙ্ক থাকে)
  const epUrl = animeUrl.endsWith('/') ? animeUrl + `episode-${episode}/` : animeUrl + `/episode-${episode}/`;
  
  const epRes = await fetch(proxy + encodeURIComponent(epUrl));
  const epHtml = await epRes.text();
  const epDoc = parser.parseFromString(epHtml, "text/html");

  // iframe বের করা
  const iframe = epDoc.querySelector('iframe');
  if (iframe && iframe.src) {
    return [{ url: iframe.src, type: 'iframe', label: 'AnimeSalt Embed' }];
  }
  throw new Error("Video iframe not found on AnimeSalt.");
}

async function fetchProviderStreams(provider, anilistId, episode, audio) {
  const animeTitle = ALL[SH.i] ? ALL[SH.i][1] : "Unknown";

  // ১. YouTube প্রোভাইডার
  if (provider === 'youtube') {
    return await fetchYouTubeStream(anilistId);
  }

  // ২. AnimeSalt প্রোভাইডার
  if (provider === 'animesalt') {
    return await fetchAnimeSaltStream(animeTitle, episode);
  }

  // ৩. Castle TV এবং MX Player (ব্যাকএন্ড ছাড়া সম্ভব নয়)
  if (provider === 'castletv' || provider === 'mxplayer') {
    throw new Error(`${provider} requires a Backend Server for decryption. Frontend cannot scrape it.`);
  }

  // ৪. আপনার পুরোনো Anivexa API
  var episodeId = provider + '-' + episode;
  var url = STREAM_API + '/watch/' + encodeURIComponent(provider) + '/' + encodeURIComponent(anilistId) + '/' + encodeURIComponent(audio) + '/' + encodeURIComponent(episodeId);
  var data = await requestJson(url, false);
  var streams = normalizeStreams(data, STREAM_API + '/');
  if (!streams.length) throw new Error(provider + ': API returned no usable streams');
  return streams;
}

// ===================================================================

/* ================= HLS LIBRARY ================= */
function loadHlsLibrary() {
  if (typeof Hls !== 'undefined') return Promise.resolve();
  if (hlsLibraryPromise) return hlsLibraryPromise;
  hlsLibraryPromise = new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () { finish(new Error('HLS library timed out')); }, 15000);
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); hlsLibraryPromise = null; reject(error); } else { resolve(); }
    }
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    script.async = true;
    script.onload = function () { finish(typeof Hls === 'undefined' ? new Error('HLS library unavailable') : null); };
    script.onerror = function () { finish(new Error('HLS library download failed')); };
    document.head.appendChild(script);
  });
  return hlsLibraryPromise;
}

function warmHlsLibrary() {
  var video = document.createElement('video');
  if (!video.canPlayType('application/vnd.apple.mpegurl')) loadHlsLibrary().catch(function () {});
}

/* ================= SESSION + CLEANUP ================= */
function playerIsCurrent(run) {
  var sheet = document.getElementById('sheet');
  return !!(run === playerRun && activePlayback && !activePlayback.cancelled && sheet && sheet.classList.contains('on') && SH.play);
}

function destroyPlayer() {
  if (activePlayback && activePlayback.mediaCleanup) {
    activePlayback.mediaCleanup();
    activePlayback.mediaCleanup = null;
  }
  if (activeHls) {
    var previous = activeHls;
    activeHls = null;
    try { previous.destroy(); } catch (error) {}
  }
  var top = document.getElementById('shtop');
  if (!top) return;
  var video = top.querySelector('video');
  if (video) {
    video.onended = null;
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (error) {}
  }
  var frame = top.querySelector('iframe');
  if (frame) frame.remove();
}

function stopPlayback() {
  playerRun++;
  playbackKey = '';
  if (activePlayback) {
    activePlayback.cancelled = true;
    if (activePlayback.cancelAttempt) activePlayback.cancelAttempt();
  }
  destroyPlayer();
  activePlayback = null;
}

/* ================= PLAYER UI ================= */
function preparePlayerTop() {
  var top = document.getElementById('shtop');
  if (top) {
    top.className = 'sh-top pl';
    top.removeAttribute('style');
    top.replaceChildren();
  }
  return top;
}

function appendPlayerClose(top) {
  var button = document.createElement('button');
  button.className = 'sh-x';
  button.textContent = '✕';
  button.setAttribute('aria-label', 'Close');
  button.onclick = function () { stopPlayback(); closeSheet(); };
  top.appendChild(button);
}

function showPlayerMessage(title, detail, retry) {
  var top = preparePlayerTop();
  if (!top) return;
  var box = document.createElement('div');
  box.className = 'nov';
  var heading = document.createElement('span');
  heading.textContent = t(title);
  var description = document.createElement('small');
  description.textContent = detail || '';
  description.style.overflowWrap = 'anywhere';
  box.append(heading, description);
  if (retry) {
    var button = document.createElement('button');
    button.className = 'btn sm';
    button.textContent = t('Retry');
    button.onclick = function () { paint(true); };
    box.appendChild(button);
  }
  top.appendChild(box);
  appendPlayerClose(top);
}

function updatePlaybackStatus(text) {
  var status = document.getElementById('playback-status');
  if (status) status.textContent = text;
}

function drawSources(streams, provider, session, selected) {
  if (!playerIsCurrent(session.run)) return;
  var holder = document.getElementById('source-tools');
  if (!holder) return;
  holder.replaceChildren();

  var label = document.createElement('small');
  label.style.display = 'block';
  label.textContent = t('Actual sources returned by {p}:', { p: provider });

  var select = document.createElement('select');
  select.className = 'sel';
  select.setAttribute('aria-label', 'Playback source');

  streams.forEach(function (stream, index) {
    var option = document.createElement('option');
    option.value = index;
    option.textContent = t('Source {n}', { n: index + 1 }) + (stream.label ? ' · ' + stream.label : '') + ' · ' + stream.type;
    select.appendChild(option);
  });

  select.value = String(selected);
  select.onchange = function () {
    if (provider !== 'Saved source') SH.provider = provider;
    SH.src = Number(select.value);
    paint(true);
  };

  holder.append(label, select);
}

/* ================= STABLE MEDIA PLAYER ================= */
async function mountStream(stream, session, provider) {
  var run = session.run;
  if (!playerIsCurrent(run)) throw new Error('Playback cancelled');
  destroyPlayer();
  var top = preparePlayerTop();
  if (!top) throw new Error('Player container missing');

  session.currentStream = stream; 

  if (stream.type === 'iframe') {
    var frame = document.createElement('iframe');
    frame.src = stream.url;
    frame.title = 'Video player';
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    frame.style.cssText = 'width:100%;height:100%;border:0';
    top.appendChild(frame);
    appendPlayerClose(top);
    updatePlaybackStatus('Provider: ' + provider + ' · Embedded player.');
    return { verified: false };
  }

  var video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'width:100%;height:100%;background:#000';
  top.appendChild(video);
  appendPlayerClose(top);

  return new Promise(function (resolve, reject) {
    var settled = false;
    var disposed = false;
    var failedAfterStart = false;
    var localHls = null;
    var networkRecoveries = 0;
    var mediaRecoveries = 0;
    var recoveryTimer = null;
    var stallTimer = null;

    var startTimer = setTimeout(function () { fail(new Error('Initial video load timed out')); }, 30000);

    function clearStartTimer() {
      clearTimeout(startTimer);
      if (session.cancelAttempt === cancelAttempt) session.cancelAttempt = null;
    }

    function cleanup() {
      if (disposed) return;
      disposed = true;
      clearStartTimer();
      clearTimeout(recoveryTimer);
      clearTimeout(stallTimer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('playing', playing);
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('stalled', waiting);
      video.removeEventListener('pause', paused);
      video.removeEventListener('error', videoError);
      video.removeEventListener('ended', ended);
      if (localHls && typeof Hls !== 'undefined') localHls.off(Hls.Events.ERROR, hlsError);
    }

    session.mediaCleanup = cleanup;

    function cancelAttempt() {
      if (settled) return;
      settled = true;
      clearStartTimer();
      reject(new Error('Playback cancelled'));
    }
    session.cancelAttempt = cancelAttempt;

    function fail(error) {
      if (disposed) return;
      if (!playerIsCurrent(run)) { cancelAttempt(); return; }
      if (!settled) { settled = true; clearStartTimer(); reject(error); return; }
      if (!failedAfterStart) {
        failedAfterStart = true;
        destroyPlayer();
        showPlayerMessage('Playback stopped', error.message, true);
        updatePlaybackStatus('Provider: ' + provider + ' · ' + error.message);
      }
    }

    function ready() {
      if (disposed || settled) return;
      if (!playerIsCurrent(run)) { cancelAttempt(); return; }
      settled = true;
      clearStartTimer();
      resolve({ verified: true });
    }

    function playing() {
      if (disposed || !playerIsCurrent(run)) return;
      clearTimeout(stallTimer);
      updatePlaybackStatus('Provider: ' + provider + ' · Playing');
    }

    function waiting() {
      if (disposed || !playerIsCurrent(run) || video.paused) return;
      updatePlaybackStatus('Provider: ' + provider + ' · Buffering; keeping the current video session.');
      clearTimeout(stallTimer);
      stallTimer = setTimeout(function () {
        if (disposed || !playerIsCurrent(run)) return;
        updatePlaybackStatus('Provider: ' + provider + ' · Source/network is slow. You can select another source/provider.');
      }, 15000);
    }

    function paused() {
      clearTimeout(stallTimer);
      if (!disposed && playerIsCurrent(run) && !video.ended) {
        updatePlaybackStatus('Provider: ' + provider + ' · Paused / press Play if autoplay was blocked.');
      }
    }

    function ended() {
      if (playerIsCurrent(run) && U && U.prefs.auto && session.state.e < eN()) play(session.state.e + 1);
    }

    function videoError() {
      if (localHls) return;
      fail(new Error('Video error' + (video.error ? ' ' + video.error.code : '')));
    }

    function hlsError(event, data) {
      if (disposed || !playerIsCurrent(run)) return;
      console.warn('HLS:', provider, data);
      if (!data.fatal) return;
      var status = data.response && data.response.code;
      if (status === 401 || status === 403 || status === 404) { fail(new Error('Media HTTP ' + status)); return; }
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 1) {
        networkRecoveries++;
        updatePlaybackStatus('Provider: ' + provider + ' · Retrying the current media connection once.');
        recoveryTimer = setTimeout(function () {
          if (disposed || !playerIsCurrent(run) || !localHls) return;
          var position = Number.isFinite(video.currentTime) ? video.currentTime : -1;
          localHls.startLoad(position);
        }, 1000);
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
        mediaRecoveries++;
        updatePlaybackStatus('Provider: ' + provider + ' · Trying one media recovery.');
        try { localHls.recoverMediaError(); } catch (error) { fail(error); }
        return;
      }
      fail(new Error('Fatal HLS error: ' + data.details));
    }

    video.addEventListener('loadeddata', ready);
    video.addEventListener('playing', playing);
    video.addEventListener('waiting', waiting);
    video.addEventListener('stalled', waiting);
    video.addEventListener('pause', paused);
    video.addEventListener('error', videoError);
    video.addEventListener('ended', ended);

    (async function () {
      try {
        var nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
        if (stream.type === 'hls' && !nativeHls) {
          await loadHlsLibrary();
          if (disposed || settled || !playerIsCurrent(run)) return;
          if (!Hls.isSupported()) throw new Error('HLS unsupported in this browser');
          localHls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: 30 });
          activeHls = localHls;
          localHls.on(Hls.Events.ERROR, hlsError);
          localHls.loadSource(stream.url);
          localHls.attachMedia(video);
        } else {
          video.src = stream.url;
          video.load();
        }
        var promise = video.play();
        if (promise && promise.catch) {
          promise.catch(function () {
            if (playerIsCurrent(run) && !disposed) updatePlaybackStatus('Provider: ' + provider + ' · Press Play to start.');
          });
        }
      } catch (error) { fail(error); }
    })();
  });
}

/* ================= DOWNLOAD ================= */
var dl = { busy: false, ctl: null };

function fmtMB(bytes) { return (bytes / 1048576).toFixed(1) + ' MB'; }

function dlFileName(title, s, e, ext) {
  var base = String(title || 'anime').replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'anime';
  return base + ' S' + s + ' E' + e + '.' + ext;
}

function dlUi(pct, text, isError) {
  var el = document.getElementById('dl-status');
  if (!el) return;
  if (pct === null) { el.innerHTML = ''; return; }
  var width = pct === -2 ? 100 : Math.max(0, Math.min(100, pct));
  el.innerHTML = '<div class="dlbar' + (pct === -2 ? ' ind' : '') + (isError ? ' err' : '') + '"><i style="width:' + width + '%"></i></div><span' + (isError ? ' class="err"' : '') + '>' + esc(text) + '</span>';
}

function dlButton(busy) {
  var button = document.getElementById('dl-btn');
  if (!button) return;
  button.classList.toggle('busy', busy);
  button.textContent = busy ? '✕ ' + t('Cancel') : '⬇ ' + t('Download');
}

function saveBlob(blob, name) {
  var link = document.createElement('a');
  var url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(function () { link.remove(); URL.revokeObjectURL(url); }, 60000);
}

async function downloadFile(url, signal, progress) {
  var response = await fetch(url, { signal: signal });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  var total = Number(response.headers.get('content-length')) || 0;
  var type = response.headers.get('content-type') || 'video/mp4';
  var ext = /webm/i.test(url + type) ? 'webm' : 'mp4';
  if (!response.body || !response.body.getReader) {
    return { blob: await response.blob(), ext: ext };
  }
  var reader = response.body.getReader();
  var chunks = [];
  var got = 0;
  for (;;) {
    var part = await reader.read();
    if (part.done) break;
    chunks.push(part.value);
    got += part.value.length;
    progress(total ? got / total * 100 : -2, fmtMB(got));
  }
  return { blob: new Blob(chunks, { type: type }), ext: ext };
}

function parsePlaylist(text, base) {
  var out = { variants: [], segs: [], map: null, seq: 0, unsupported: '' };
  var key = null;
  var pendingStream = null;
  var index = 0;
  text.split(/\r?\n/).forEach(function (raw) {
    var line = raw.trim();
    if (!line) return;
    if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
      var bw = /BANDWIDTH=(\d+)/.exec(line);
      var rs = /RESOLUTION=\d+x(\d+)/.exec(line);
      pendingStream = { bw: bw ? Number(bw[1]) : 0, h: rs ? Number(rs[1]) : 0 };
      return;
    }
    if (line.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) { out.seq = parseInt(line.split(':')[1], 10) || 0; return; }
    if (line.indexOf('#EXT-X-KEY:') === 0) {
      var method = (/METHOD=([^,]+)/.exec(line) || [])[1];
      if (method === 'NONE') key = null;
      else if (method === 'AES-128') {
        var uri = /URI="([^"]+)"/.exec(line);
        var iv = /IV=0x([0-9a-f]+)/i.exec(line);
        key = uri ? { uri: new URL(uri[1], base).href, iv: iv ? iv[1] : null } : null;
      } else out.unsupported = method || 'unknown';
      return;
    }
    if (line.indexOf('#EXT-X-MAP:') === 0) {
      var mu = /URI="([^"]+)"/.exec(line);
      if (mu) out.map = new URL(mu[1], base).href;
      return;
    }
    if (line.charAt(0) === '#') return;
    var abs = new URL(line, base).href;
    if (pendingStream) { pendingStream.url = abs; out.variants.push(pendingStream); pendingStream = null; return; }
    out.segs.push({ url: abs, key: key, n: out.seq + index });
    index++;
  });
  return out;
}

function pickVariant(variants, target) {
  var withHeight = variants.filter(function (v) { return v.h; });
  if (withHeight.length) {
    var fit = withHeight.filter(function (v) { return v.h <= target; }).sort(function (a, b) { return b.h - a.h; });
    return fit[0] || withHeight.sort(function (a, b) { return a.h - b.h; })[0];
  }
  var sorted = variants.slice().sort(function (a, b) { return a.bw - b.bw; });
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

async function downloadHls(url, signal, progress) {
  var base = url;
  var playlist = null;
  var pref = U && U.prefs && U.prefs.q;
  var target = pref && pref !== 'Auto' ? parseInt(pref, 10) : 720;
  if (U && U.prefs && U.prefs.saver) target = Math.min(target, 480);

  for (var hop = 0; hop < 3; hop++) {
    var response = await fetch(base, { signal: signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    playlist = parsePlaylist(await response.text(), base);
    if (!playlist.variants.length) break;
    base = pickVariant(playlist.variants, target).url;
  }
  if (playlist.unsupported) throw new Error('Unsupported encryption: ' + playlist.unsupported);
  if (!playlist.segs.length) throw new Error('No video segments found');

  var keyCache = {};
  function getKey(k) {
    if (!keyCache[k.uri]) {
      keyCache[k.uri] = fetch(k.uri, { signal: signal }).then(function (r) {
        if (!r.ok) throw new Error('Key HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(function (buf) { return crypto.subtle.importKey('raw', buf, 'AES-CBC', false, ['decrypt']); });
    }
    return keyCache[k.uri];
  }
  function ivFor(seg) {
    var iv = new Uint8Array(16);
    if (seg.key.iv) {
      var hex = seg.key.iv.padStart(32, '0');
      for (var i = 0; i < 16; i++) iv[i] = parseInt(hex.substr(i * 2, 2), 16);
    } else {
      var n = seg.n;
      for (var j = 15; j >= 12; j--) { iv[j] = n & 255; n = Math.floor(n / 256); }
    }
    return iv;
  }
  async function getSegment(seg) {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var r = await fetch(seg.url, { signal: signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var buf = await r.arrayBuffer();
        if (seg.key) buf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivFor(seg) }, await getKey(seg.key), buf);
        return buf;
      } catch (error) {
        if (signal.aborted || attempt === 2) throw error;
        await wait(800);
      }
    }
  }

  var initBuffer = null;
  if (playlist.map) {
    var mr = await fetch(playlist.map, { signal: signal });
    if (!mr.ok) throw new Error('HTTP ' + mr.status);
    initBuffer = await mr.arrayBuffer();
  }

  var parts = new Array(playlist.segs.length);
  var next = 0;
  var done = 0;
  var bytes = 0;
  async function worker() {
    while (next < playlist.segs.length) {
      var i = next++;
      var buf = await getSegment(playlist.segs[i]);
      parts[i] = buf;
      bytes += buf.byteLength;
      done++;
      progress(done / playlist.segs.length * 100, done + '/' + playlist.segs.length + ' · ' + fmtMB(bytes));
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  var fragmented = !!playlist.map;
  var all = (initBuffer ? [initBuffer] : []).concat(parts);
  return { blob: new Blob(all, { type: fragmented ? 'video/mp4' : 'video/mp2t' }), ext: fragmented ? 'mp4' : 'ts' };
}

async function downloadCurrent() {
  if (dl.busy) { if (dl.ctl) dl.ctl.abort(); return; }
  
  var anime = ALL[SH.i];
  if (!anime) return;
  
  var title = anime[1];
  var season = SH.s;
  var episode = SH.e;

  dl.busy = true;
  dl.ctl = new AbortController();
  dlButton(true);
  dlUi(-2, t('Finding source') + '…');
  var progress = function (pct, text) { dlUi(pct, t('Downloading') + ' · ' + text); };
  var stream = null;
  var directUrl = null;

  try {
    var session = activePlayback;
    if (session && session.currentStream) {
        stream = session.currentStream;
    } 
    
    if (!stream) {
        dlUi(-2, t('Fetching source...'));
        var id = getAnimeId(anime);
        if (SH.chain && !hasVid(anime[1])) {
            var seasonEntry = SH.chain[season - 1];
            if (seasonEntry && seasonEntry.id) id = seasonEntry.id;
        }
        if (!id) throw new Error(t("Anime ID not found."));
        
        var audio = SH.l === 'dub' ? 'dub' : 'sub';
        var provider = SH.provider === 'auto' ? STREAM_PROVIDERS[0] : SH.provider;
        
        var streams = await fetchProviderStreams(provider, id, episode, audio);
        
        if (streams && streams.length > 0) {
            var directStream = streams.find(function(s) { return s.type === 'video' || s.type === 'hls'; });
            stream = directStream || streams[0];
        }
    }

    if (!stream) throw new Error(t('No downloadable source found.'));

    if (stream.type === 'iframe') {
         directUrl = stream.url;
         throw new Error(t('This provider uses an embedded player. Direct download is blocked.'));
    }

    var result;
    if (stream.type === 'hls') {
        result = await downloadHls(stream.url, dl.ctl.signal, progress);
    } else {
        result = await downloadFile(stream.url, dl.ctl.signal, progress);
    }
    
    saveBlob(result.blob, dlFileName(title, season, episode, result.ext));
    dlUi(100, t('Saved to your Downloads ✓'));
    toast(t('Saved to your Downloads ✓'));

  } catch (error) {
    console.warn('Download Error:', error);
    
    if (error.name === 'AbortError') {
        dlUi(0, t('Download cancelled'), true);
    } else {
        dlUi(0, t('Download failed') + ': ' + error.message, true);
        
        var urlToOpen = directUrl || (stream ? stream.url : null);
        if (urlToOpen) {
            setTimeout(function() {
                if (confirm(t("Direct download is blocked by the server (Error 403). Do you want to open the video in a new tab to watch or download?"))) {
                    window.open(urlToOpen, '_blank');
                }
            }, 100);
        }
    }
  } finally {
    dl.busy = false;
    dl.ctl = null;
    dlButton(false);
  }
}

/* ================= HISTORY ================= */
function savePlaybackHistory(session) {
  if (!playerIsCurrent(session.run) || session.historySaved || !U) return;
  session.historySaved = true;
  var state = session.state;
  var name = session.anime[1];
  U.hist = (U.hist || []).filter(function (item) {
    return !(item.n === name && item.s === state.s && item.e === state.e);
  });
  U.hist.unshift({ n: name, s: state.s, e: state.e });
  U.hist = U.hist.slice(0, 50);
  save();
}

/* ================= SOURCE SELECTION ================= */
function playableSources(streams, provider) {
  return streams.filter(function (stream) {
    if (stream.specialHls) return false;
    if (provider === 'reanime' && stream.type === 'hls') return false;
    return true;
  });
}

async function trySources(streams, provider, session) {
  if (!playerIsCurrent(session.run)) return false;
  streams = playableSources(streams, provider);
  if (!streams.length) { session.lastError = provider + ': no supported ordinary stream/embed'; return false; }

  var manual = session.state.src !== null;
  var first = manual ? Number(session.state.src) : 0;
  drawSources(streams, provider, session, first < streams.length ? first : 0);

  if (first >= streams.length || first < 0) { session.lastError = 'Selected source is unavailable. Choose another source.'; return false; }
  var indices = [first];
  if (!manual) { for (var i = 0; i < streams.length; i++) { if (i !== first) indices.push(i); } }

  for (var j = 0; j < indices.length; j++) {
    if (!playerIsCurrent(session.run)) return false;
    var index = indices[j];
    var stream = streams[index];
    drawSources(streams, provider, session, index);
    updatePlaybackStatus('Trying ' + provider + ' · Source ' + (index + 1));

    try {
      var result = await mountStream(stream, session, provider);
      if (!playerIsCurrent(session.run)) return false;
      if (result.verified) savePlaybackHistory(session);
      return true;
    } catch (error) {
      if (!playerIsCurrent(session.run)) return false;
      session.lastError = provider + ': ' + error.message;
      console.warn(session.lastError);
      destroyPlayer();
    }
  }
  return false;
}

/* ================= PLAYBACK FLOW ================= */
async function startPlayback(session) {
  var anime = session.anime;
  var state = session.state;
  var run = session.run;

  if (state.provider === 'auto') {
    var staticUrls = [
      vurl(anime[1], state.s, state.e, state.l, state.v),
      vurl(anime[1], state.s, state.e, state.l, 1 - state.v)
    ];
    var seen = new Set();
    var saved = [];
    staticUrls.forEach(function (value) {
      var url = safeStreamUrl(value);
      if (url && !seen.has(url)) {
        seen.add(url);
        saved.push({ url: url, type: inferStreamType(url), specialHls: false, label: 'Saved video' });
      }
    });
    if (saved.length && await trySources(saved, 'Saved source', session)) return;
  }

  if (!playerIsCurrent(run)) return;

  if (!SH.chainReady) {
    showPlayerMessage('Finding seasons...', String(anime[1]));
    return;
  }

  var id = getAnimeId(anime);
  if (SH.chain && !hasVid(anime[1])) {
    var seasonEntry = SH.chain[state.s - 1];
    if (seasonEntry && seasonEntry.id) id = seasonEntry.id;
  }
  if (!id) {
    showPlayerMessage('Finding AniList ID...', String(anime[1]));
    id = await resolveAnimeIdByTitle(anime[1]);
    if (!playerIsCurrent(run)) return;
    if (id) anime[10] = id;
  }
  if (!id) {
    showPlayerMessage('Video not found', t('No AniList ID yet (AniList may be busy). Press Retry in a minute.'), true);
    return;
  }

  var providers = state.provider === 'auto' ? STREAM_PROVIDERS.slice() : [state.provider];
  var audio = state.l === 'dub' ? 'dub' : 'sub';
  session.animeId = id;
  session.audio = audio;

  for (var p = 0; p < providers.length; p++) {
    if (!playerIsCurrent(run)) return;
    var provider = providers[p];
    destroyPlayer();
    showPlayerMessage('Loading provider...', provider + ' · ' + (p + 1) + '/' + providers.length);
    updatePlaybackStatus('Requesting: ' + provider);

    try {
      var streams = await fetchProviderStreams(provider, id, state.e, audio);
      if (!playerIsCurrent(run)) return;
      if (await trySources(streams, provider, session)) return;
    } catch (error) {
      if (!playerIsCurrent(run)) return;
      session.lastError = provider + ': ' + error.message;
      console.warn(session.lastError);
    }
  }

  if (playerIsCurrent(run)) {
    destroyPlayer();
    showPlayerMessage('No playable stream found', session.lastError + '. Choose another provider or check the backend.', true);
    updatePlaybackStatus(session.lastError);
  }
}

function beginPlayback(anime, force) {
  var key = stateKey();
  if (!force && key === playbackKey) return;
  stopPlayback();
  playbackKey = key;

  var session = {
    run: playerRun, anime: anime,
    state: { i: SH.i, s: SH.s, e: SH.e, l: SH.l, v: SH.v, provider: SH.provider || 'auto', src: SH.src === undefined ? null : SH.src },
    cancelled: false, historySaved: false, cancelAttempt: null, mediaCleanup: null, currentStream: null,
    lastError: 'No usable stream returned'
  };
  activePlayback = session;

  var sources = document.getElementById('source-tools');
  if (sources) sources.replaceChildren();

  warmHlsLibrary();
  startPlayback(session).catch(function (error) {
    if (!playerIsCurrent(session.run)) return;
    destroyPlayer();
    showPlayerMessage('Player error', error.message, true);
    console.error(error);
  });
}

/* ================= SHEET ================= */
function openSheet(index) {
  stopPlayback();
  var anime = ALL[index];
  if (!anime) return;
  var preferences = U ? U.prefs : DP();
  var color = C[index % 5];
  var sheet = document.getElementById('sheet');
  if (!sheet) return;

  var language = preferences.lang === 'dub' ? 'dub' : 'sub';

  SH = { i: index, s: 1, e: 1, l: language, v: Number(preferences.srv) === 1 ? 1 : 0, provider: 'auto', src: null, play: 0, pg: 0, chain: null, chainReady: false, chainTok: 0, baseS: 1, sTouched: 0 };

  var banner = anime[4] || anime[3];
  var background = banner ? 'linear-gradient(to top,rgba(12,12,20,.3),transparent),url(' + cu(banner) + ') center/cover,#0c0c14' : 'radial-gradient(85% 70% at 70% 0%,rgba(' + color + ',.5),transparent 70%),#0c0c14';
  var metadata = String(anime[2] || '').split(' • ');

  sheet.innerHTML = '<div class="sh-top" id="shtop" style="background:' + background + '"><button class="sh-x" onclick="closeSheet()" aria-label="Close">✕</button></div>'
    + '<div class="rtn" id="rtn" style="display:none;margin:10px 10px 0"><span class="rtn-i" aria-hidden="true">⚡</span><p>' + esc(t('No video on the first try? Please try again — it will play 100% on the second attempt.')) + '</p></div>'
    + '<div class="sh-b"><div class="chips"><span class="r">★ ' + anime[0] + '</span>' + metadata.map(function (text) { return '<span>' + esc(text) + '</span>'; }).join('') + '</div>'
    + '<h2>' + esc(anime[1]) + '</h2>' + (anime[7] ? '<p class="ds">' + esc(anime[7]) + '</p>' : '')
    + '<div class="acts"><button class="btn" onclick="play()">▶ ' + esc(t('Watch Now')) + '</button><button class="btn g" id="ml" onclick="toggleList(ALL[SH.i][1])"></button></div>'
    + '<div id="ctl"></div>'
    + '<div id="playback-tools" style="display:none;margin:10px 0">'
    +   '<small id="playback-status" aria-live="polite" style="display:block;margin-bottom:8px;overflow-wrap:anywhere"></small>'
    +   '<div class="prow"><button class="btn sm" onclick="paint(true)">↻ ' + esc(t('Retry current selection')) + '</button>'
    +   '<button class="btn sm dlb" id="dl-btn" onclick="downloadCurrent()">⬇ ' + esc(t('Download')) + '</button></div>'
    +   '<div id="dl-status" class="dls" aria-live="polite"></div>'
    +   '<div id="source-tools" style="margin-top:10px"></div>'
    + '</div>'
    + '<div id="np"></div><h4 id="eh" style="display:none">' + esc(t('EPISODES')) + '</h4><div class="eps" id="eps"></div><div id="cm"></div></div>';

  sheet.classList.remove('pm');
  sheet.scrollTop = 0;
  sheet.classList.add('on');
  var overlay = document.getElementById('ov');
  if (overlay) overlay.classList.add('on');
  document.body.style.overflow = 'hidden';

  var baseAnimeId = getAnimeId(anime);
  if (hasVid(anime[1])) { SH.chainReady = true; } else if (baseAnimeId) { startSeasonChain(baseAnimeId); } else { startSeasonChainByTitle(anime); }

  paint();
  warmHlsLibrary();
}

function play(episode) {
  if (episode) {
    var nextEpisode = Number(episode);
    if (nextEpisode !== SH.e) SH.src = null;
    SH.e = nextEpisode;
    SH.pg = Math.floor((SH.e - 1) / PG);
  }
  SH.play = 1;
  paint();
}

function eN() {
  var anime = ALL[SH.i];
  if (SH.chain && !hasVid(anime[1])) {
    var entry = SH.chain[SH.s - 1];
    if (entry && entry.episodes > 0) return entry.episodes;
    if (entry && entry.id !== getAnimeId(anime)) return 12;
  }
  return EPN[anime[1]] || 12;
}

function mlbtn() {
  var button = document.getElementById('ml');
  if (button) button.textContent = U && U.list.indexOf(ALL[SH.i][1]) > -1 ? t('✓ In My List') : t('+ My List');
}

function toggleList(name) {
  if (!U) { authView('in'); toast(t('Login to use My List')); return; }
  var index = U.list.indexOf(name);
  if (index > -1) U.list.splice(index, 1); else U.list.push(name);
  save(); decorate(); mlbtn();
}

function changePlayerLanguage(index) {
  var item = playerLanguages()[index];
  if (!item) return;
  SH.l = item[0];
  SH.provider = 'auto';
  SH.src = null;
  paint();
}

function changePlayerProvider(value) {
  if (value !== 'auto' && STREAM_PROVIDERS.indexOf(value) < 0) return;
  SH.provider = value;
  SH.src = null;
  paint(true);
}

/* ================= RENDER ================= */
function paint(force) {
  var anime = ALL[SH.i];
  if (!anime) return;
  var sheet = document.getElementById('sheet');
  if (!sheet) return;

  var count = eN();
  var seasons;
  if (hasVid(anime[1])) seasons = SEASONS[anime[1]] || 3;
  else seasons = SH.chain ? SH.chain.length : 1;
  if (SH.s > seasons) { SH.s = Math.max(1, seasons); count = eN(); }
  var page = Math.min(SH.pg || 0, Math.floor((count - 1) / PG));

  document.getElementById('eh').style.display = SH.play ? '' : 'none';
  var tools = document.getElementById('playback-tools');
  if (tools) tools.style.display = SH.play ? '' : 'none';
  var tip = document.getElementById('rtn');
  if (tip) tip.style.display = SH.play ? '' : 'none';

  if (!SH.play) {
    ['ctl', 'eps', 'np', 'cm'].forEach(function (id) { document.getElementById(id).innerHTML = ''; });
    mlbtn();
    return;
  }

  var needsPlayback = force === true || stateKey() !== playbackKey;
  var seasonOptions = '';
  var chainActive = !hasVid(anime[1]) && SH.chain;
  for (var s = 1; s <= seasons; s++) {
    var seasonEntry = chainActive ? SH.chain[s - 1] : null;
    var seasonLabel = (seasonEntry && seasonEntry.num) || s;
    seasonOptions += '<option value="' + s + '"' + (s === SH.s ? ' selected' : '') + '>' + esc(t('Season {n}', { n: seasonLabel })) + '</option>';
  }
  var seasonInfo = '';
  if (chainActive && SH.chain[SH.s - 1]) {
    var playing = SH.chain[SH.s - 1];
    seasonInfo = '<small class="mu" style="display:block;width:100%;margin:2px 0 6px">' + esc(t('Playing: {title} · AniList #{id}', { title: playing.title || anime[1], id: playing.id })) + '</small>';
  }

  var rangeOptions = '';
  if (count > PG) {
    for (var r = 0; r * PG < count; r++) { rangeOptions += '<option value="' + r + '"' + (r === page ? ' selected' : '') + '>Ep ' + (r * PG + 1) + '–' + Math.min(count, (r + 1) * PG) + '</option>'; }
    rangeOptions = '<select class="sel" onchange="SH.pg=+this.value;paint()" aria-label="Episode range">' + rangeOptions + '</select>';
  }

  var providerOptions = '<option value="auto"' + (SH.provider === 'auto' ? ' selected' : '') + '>' + esc(t('Auto · try available providers')) + '</option>';
  STREAM_PROVIDERS.forEach(function (provider) { providerOptions += '<option value="' + provider + '"' + (SH.provider === provider ? ' selected' : '') + '>' + provider + '</option>'; });
  var providerControl = '<label style="display:block;margin:8px 0">' + esc(t('Provider')) + ' <select class="sel" aria-label="Provider" onchange="changePlayerProvider(this.value)">' + providerOptions + '</select></label>';

  document.getElementById('ctl').innerHTML = '<select class="sel" aria-label="Season" onchange="SH.s=+this.value;SH.sTouched=1;SH.e=1;SH.pg=0;SH.src=null;paint()">' + seasonOptions + '</select><div class="seg">' + playerLanguages().map(function (item, index) { return '<button class="' + (item[0] === SH.l ? 'on' : '') + '" onclick="changePlayerLanguage(' + index + ')">' + esc(t(item[1])) + '</button>'; }).join('') + '</div>' + providerControl + seasonInfo + rangeOptions;

  var episodeButtons = '';
  for (var episode = page * PG + 1; episode <= Math.min(count, page * PG + PG); episode++) { episodeButtons += '<button class="' + (episode === SH.e ? 'on' : '') + '" onclick="play(' + episode + ')">' + episode + '</button>'; }
  document.getElementById('eps').innerHTML = episodeButtons;

  document.getElementById('np').innerHTML = '<div class="np"><span>▶ ' + esc(t('S{s} · Episode {e}', { s: SH.s, e: SH.e })) + '</span><div><button ' + (SH.e < 2 ? 'disabled ' : '') + 'onclick="play(' + (SH.e - 1) + ')">‹ ' + esc(t('Prev')) + '</button><button ' + (SH.e >= count ? 'disabled ' : '') + 'onclick="play(' + (SH.e + 1) + ')">' + esc(t('Next')) + ' ›</button></div></div>';

  mlbtn();
  if (needsPlayback) cmt();
  sheet.classList.add('pm');
  if (needsPlayback) beginPlayback(anime, force === true);
}

/* ================= CARDS ================= */
function decorate() {
  document.querySelectorAll('.card').forEach(function (card, index) {
    var anime = ALL[index];
    if (!anime) return;
    var poster = card.querySelector('.poster');
    var bookmark = card.querySelector('.bm');
    var local = hasVid(anime[1]);
    var searchable = getAnimeId(anime) !== null || !!String(anime[1] || '').trim();
    var showWatch = local || searchable;

    if (poster) {
      var watch = poster.querySelector('.wbtn');
      poster.classList.toggle('hv', showWatch);
      if (showWatch) {
        if (!watch) {
          watch = document.createElement('button');
          watch.className = 'wbtn';
          watch.type = 'button';
          poster.appendChild(watch);
        }
        watch.textContent = t('▶ Watch');
        watch.setAttribute('aria-label', 'Watch ' + String(anime[1] || 'anime'));
        watch.title = local ? 'Watch saved video' : 'Search providers; availability not verified';
        watch.onclick = function (event) { event.preventDefault(); event.stopPropagation(); openSheet(index); play(); };
      } else if (watch) { watch.remove(); }
    }

    if (bookmark) {
      bookmark.classList.toggle('on', !!U && U.list.indexOf(anime[1]) > -1);
      bookmark.onclick = function (event) { event.preventDefault(); event.stopPropagation(); toggleList(anime[1]); };
    }
  });
}

/* ================= COMMENTS ================= */
function ck() { return 'akC:' + ALL[SH.i][1] + ':' + SH.s + ':' + SH.e; }
function ago(time) {
  var seconds = (Date.now() - time) / 1000;
  return seconds < 60 ? t('just now') : seconds < 3600 ? t('{n}m ago', { n: Math.floor(seconds / 60) }) : seconds < 86400 ? t('{n}h ago', { n: Math.floor(seconds / 3600) }) : t('{n}d ago', { n: Math.floor(seconds / 86400) });
}

function cmt() {
  var list = ls(ck()) || [];
  var html = '<h4>' + esc(t('COMMENTS')) + ' · S' + SH.s + ' E' + SH.e + ' <span class="cnt">' + list.length + '</span></h4>';
  html += U ? '<div class="cbox">' + av(U, 36) + '<textarea id="ct" maxlength="500" rows="2" placeholder="' + esc(t('Write a comment...')) + '"></textarea><button class="btn sm" onclick="postC()">' + esc(t('Post')) + '</button></div>' : '<button class="lnk" onclick="authView(\'in\')">' + esc(t('Login to join the discussion')) + '</button>';
  html += list.length ? list.map(function (comment, index) {
    var likes = comment.l || [];
    return '<div class="cmt">' + av(USERS[comment.e] || {}, 34) + '<div><b>' + esc(comment.n) + '</b><small>' + ago(comment.t) + '</small><p>' + esc(comment.x) + '</p><button class="lk' + (U && likes.indexOf(U.email) > -1 ? ' on' : '') + '" onclick="likeC(' + index + ')">♥ ' + likes.length + '</button>' + (U && comment.e === U.email ? '<button class="lk" onclick="delC(' + index + ')">' + esc(t('Delete')) + '</button>' : '') + '</div></div>';
  }).join('') : '<p class="mu" style="margin-top:10px">' + esc(t('No comments yet. Be the first!')) + '</p>';
  document.getElementById('cm').innerHTML = html;
}

function postC() {
  var input = document.getElementById('ct');
  if (!input || !U) return;
  var text = input.value.trim();
  if (!text) return;
  var key = ck();
  var list = ls(key) || [];
  list.unshift({ e: U.email, n: U.name, x: text, t: Date.now(), l: [] });
  ls(key, list.slice(0, 100));
  cmt();
}

function likeC(index) {
  if (!U) { authView('in'); return; }
  var key = ck();
  var list = ls(key) || [];
  var comment = list[index];
  if (!comment) return;
  comment.l = comment.l || [];
  var position = comment.l.indexOf(U.email);
  if (position > -1) comment.l.splice(position, 1);
  else comment.l.push(U.email);
  ls(key, list);
  cmt();
}

function delC(index) {
  if (!U) return;
  var key = ck();
  var list = ls(key) || [];
  if (!list[index] || list[index].e !== U.email) return;
  list.splice(index, 1);
  ls(key, list);
  cmt();
}

/* ================= EVENTS ================= */
document.addEventListener('click', function (event) {
  if (!event.target.closest('.search') && typeof sr !== 'undefined' && sr) sr.className = '';
});

document.querySelectorAll('.arr button').forEach(function (button) {
  button.onclick = function () {
    var row = document.getElementById(button.dataset.r);
    if (!row) return;
    row.scrollBy({ left: Number(button.dataset.d) * row.clientWidth * 0.9, behavior: 'smooth' });
  };
});

var playerModalElement = document.getElementById('mw');
if (playerModalElement) {
  playerModalElement.addEventListener('click', function (event) { if (event.target.id === 'mw') closeM(); });
}

document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeM(); });

var existingSheet = document.getElementById('sheet');
if (existingSheet) {
  new MutationObserver(function () { if (!existingSheet.classList.contains('on')) stopPlayback(); }).observe(existingSheet, { attributes: true, attributeFilter: ['class'] });
}

window.addEventListener('pagehide', function () { stopPlayback(); });

/* ================= INITIALIZE ================= */
ub();
applyTheme();
decorate();