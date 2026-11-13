/* =====================================================
   COMPLETE player.js (Anivexa Sub/Dub + CoorenLabs Hindi)
   ===================================================== */

var SH = {};
var PG = 100;

var STREAM_API = 'https://anivexa-api-wi89.onrender.com'; // Sub & Dub (Anivexa)
var HINDI_API = 'https://coorenlabs-03iz.onrender.com';   // CoorenLabs Hindi API (Render)

var STREAM_PROVIDERS = [
  'anikoto', 'reanime', 'kaa', 'senshi', 'anizone', 'aniwaves'
];

var activeHls = null;
var activePlayback = null;
var playerRun = 0;
var playbackKey = '';
var hlsLibraryPromise = null;

var hindiChoices = new Map();
var hindiMetadata = new Map();
var hindiCache = new Map();
var hindiPending = new Map();

var HINDI_CACHE_LIMIT = 40;
var HINDI_TIMEOUT = 45000;

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

function isHindi(language) {
  return /^(hi|hindi)$/i.test(String(language));
}

function titleKey(title) {
  return String(title || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function animeKey(anime) {
  return String(getAnimeId(anime) || '') + '|' + String(anime[1]);
}

function playerLanguages() {
  var output = [['hi', 'Hindi']];
  var seen = new Set(['hi', 'hindi']);
  var existing = typeof LANGS !== 'undefined' ? LANGS : [['sub', 'Sub'], ['dub', 'Dub']];
  existing.forEach(function (item) {
    var key = String(item[0]).toLowerCase();
    if (!seen.has(key)) { seen.add(key); output.push(item); }
  });
  return output;
}

function stateKey() {
  return [SH.i, SH.s, SH.e, SH.l, SH.provider || 'auto', SH.src === null ? 'auto' : SH.src, SH.v].join('|');
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}


/* ================= SEASON CHAIN =================
   AniList keeps every season as its own entry (own ID). The Sub/Dub API
   needs that exact ID, so we walk PREQUEL / SEQUEL links to build
   Season 1..N and use the matching ID for the season the user selected. */
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
    headers: { 'Content-Type': 'appl
