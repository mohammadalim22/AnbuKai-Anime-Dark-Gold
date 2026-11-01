/* =====================================================
   COMPLETE player.js

   Replace the entire old player.js with this file.
   Do not append this to the previous code.
   Do not add HTML script tags.

   Requires your existing:
   ALL, VIDEOS, EPN, SEASONS, LANGS, C, U, USERS,
   DP, esc, ls, av, save, toast, authView,
   closeSheet, closeM, ub, applyTheme.

   Hindi API integration follows its documented format.
   Live API, CORS and playback have not been verified.
   ===================================================== */

var SH = {};
var PG = 100;

var STREAM_API = 'https://anivexa-api-wi89.onrender.com';
var HINDI_API = 'https://anime-api-uzlk.vercel.app';

var STREAM_PROVIDERS = [
  'anikoto',
  'reanime',
  'kaa',
  'senshi',
  'anizone',
  'aniwaves'
];

var activeHls = null;
var activePlayback = null;
var playerRun = 0;
var playbackKey = '';

var hlsLibraryPromise = null;

var hindiChoices = new Map();
var hindiMetadata = new Map();
var hindiRequests = new Map();
var hindiCache = new Map();

var HINDI_CACHE_LIMIT = 50;

/* ================= GENERAL HELPERS ================= */

function hasVid(name) {
  var anime =
    typeof VIDEOS !== 'undefined' &&
    VIDEOS[name];

  return !!anime && Object.keys(anime).length > 0;
}

function vurl(name, season, episode, language, server) {
  var anime =
    typeof VIDEOS !== 'undefined' &&
    VIDEOS[name];

  var entry =
    anime &&
    anime[season] &&
    anime[season][episode] &&
    anime[season][episode][language];

  return entry && entry[server] || '';
}

function cu(url) {
  return encodeURI(url).replace(/[()']/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}

function safeStreamUrl(value, base) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return '';
  }

  try {
    var url = new URL(
      value,
      base || STREAM_API + '/'
    );

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return '';
    }

    return url.href;
  } catch (error) {
    return '';
  }
}

function getAnimeId(anime) {
  if (!anime) return null;

  var values = [
    anime[10],
    anime.id
  ];

  for (var i = 0; i < values.length; i++) {
    var id = Number(values[i]);

    if (Number.isInteger(id) && id > 0) {
      return id;
    }
  }

  return null;
}

function inferStreamType(url, hint) {
  hint = String(hint || '').toLowerCase();

  if (/\.m3u8(?:[?#]|$)/i.test(url)) {
    return 'hls';
  }

  if (
    hint === 'iframe' ||
    hint === 'embed'
  ) {
    return 'iframe';
  }

  if (/hls|mpegurl/.test(hint)) {
    return 'hls';
  }

  if (
    hint === 'video' ||
    hint.indexOf('video/') === 0 ||
    /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url)
  ) {
    return 'video';
  }

  return 'iframe';
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function providerOrder(server) {
  var first = Number(server) === 1
    ? 'reanime'
    : 'anikoto';

  return [first].concat(
    STREAM_PROVIDERS.filter(function (provider) {
      return provider !== first;
    })
  );
}

function titleKey(name) {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function hindiKey(anime) {
  return (
    String(getAnimeId(anime) || '') +
    '|' +
    String(anime[1])
  );
}

function isHindi(language) {
  return /^(hi|hindi)$/i.test(
    String(language)
  );
}

function playerLanguages() {
  var output = [
    ['hi', 'Hindi']
  ];

  var seen = new Set([
    'hi',
    'hindi'
  ]);

  var existing =
    typeof LANGS !== 'undefined'
      ? LANGS
      : [
          ['sub', 'Sub'],
          ['dub', 'Dub']
        ];

  existing.forEach(function (language) {
    var key = String(language[0]).toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      output.push(language);
    }
  });

  return output;
}

function playbackIdentity() {
  return [
    SH.i,
    SH.s,
    SH.e,
    SH.l,
    SH.v,
    SH.hsrc === null ? 'auto' : SH.hsrc
  ].join('|');
}

/* ================= NETWORK ================= */

async function fetchWithTimeout(url, options) {
  options = options || {};

  var controller = new AbortController();
  var settings = Object.assign({}, options);
  var timeout = settings.timeout || 15000;

  delete settings.timeout;

  settings.signal = controller.signal;

  var timer = setTimeout(function () {
    controller.abort();
  }, timeout);

  try {
    return await fetch(url, settings);
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(url, fresh) {
  var response = await fetchWithTimeout(url, {
    timeout: 15000,
    cache: fresh ? 'no-store' : 'default'
  });

  if (!response.ok) {
    throw new Error(
      'API HTTP ' + response.status
    );
  }

  var data;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error(
      'API returned non-JSON content'
    );
  }

  if (data && data.success === false) {
    throw new Error(
      String(
        data.message ||
        data.mmessage ||
        'API reported failure'
      )
    );
  }

  return data;
}

/* ================= STREAM RESPONSE ================= */

function normalizeStreams(data, base) {
  var results = [];
  var seen = new Set();

  function add(value, hint, special, label) {
    var url = safeStreamUrl(value, base);
    if (!url) return;

    var type = inferStreamType(url, hint);
    var key = type + ':' + url;

    if (seen.has(key)) return;

    seen.add(key);

    results.push({
      type: type,
      url: url,
      specialHls: !!special && type === 'hls',
      label: label || ''
    });
  }

  function visit(item, depth, inherited, label) {
    if (!item || depth > 5) return;

    if (typeof item === 'string') {
      add(item, '', inherited, label);
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(function (entry) {
        visit(
          entry,
          depth + 1,
          inherited,
          label
        );
      });

      return;
    }

    if (typeof item !== 'object') return;

    var special =
      inherited ||
      !!item.playlist_key ||
      !!item.playlistKey;

    var sourceLabel =
      item.server ||
      item.label ||
      label;

    [
      item.embedUrl,
      item.embed_url,
      item.embed,
      item.iframe
    ].forEach(function (embed) {
      if (typeof embed === 'string') {
        add(
          embed,
          'iframe',
          false,
          sourceLabel
        );
      } else if (
        embed &&
        typeof embed === 'object'
      ) {
        add(
          embed.url || embed.src,
          'iframe',
          false,
          sourceLabel
        );
      }
    });

    var url =
      item.url ||
      item.file ||
      item.src;

    if (url) {
      add(
        url,
        item.type ||
        item.format ||
        item.mimeType,
        special,
        sourceLabel
      );
    }

    [
      'streams',
      'sources',
      'data',
      'results',
      'stream'
    ].forEach(function (key) {
      if (item[key]) {
        visit(
          item[key],
          depth + 1,
          special,
          sourceLabel
        );
      }
    });
  }

  visit(data, 0, false, '');

  return results;
}

/* ================= ANIVEXA API ================= */

async function fetchProviderStreams(
  provider,
  anilistId,
  episode,
  audio,
  fresh
) {
  var episodeId = provider + '-' + episode;

  var url =
    STREAM_API +
    '/watch/' + encodeURIComponent(provider) +
    '/' + encodeURIComponent(anilistId) +
    '/' + encodeURIComponent(audio) +
    '/' + encodeURIComponent(episodeId);

  var data = await requestJson(url, fresh);

  var streams = normalizeStreams(
    data,
    STREAM_API + '/'
  );

  if (!streams.length) {
    throw new Error(
      provider + ': no usable streams'
    );
  }

  return streams.sort(function (a, b) {
    var priority = {
      iframe: 0,
      hls: 1,
      video: 2
    };

    return priority[a.type] - priority[b.type];
  });
}

/* ================= HINDI API ================= */

function hindiApi(path, params, ttl, fresh) {
  var url = new URL(HINDI_API + path);

  Object.keys(params || {}).forEach(function (key) {
    url.searchParams.set(
      key,
      params[key]
    );
  });

  var key = url.href;
  var cached = hindiCache.get(key);

  if (
    !fresh &&
    cached &&
    cached.until > Date.now()
  ) {
    return Promise.resolve(cached.data);
  }

  if (hindiRequests.has(key)) {
    return hindiRequests.get(key);
  }

  var request = requestJson(key, fresh).then(
    function (data) {
      if (ttl) {
        hindiCache.delete(key);

        hindiCache.set(key, {
          until: Date.now() + ttl,
          data: data
        });

        while (
          hindiCache.size > HINDI_CACHE_LIMIT
        ) {
          var oldest =
            hindiCache.keys().next().value;

          hindiCache.delete(oldest);
        }
      }

      return data;
    }
  );

  hindiRequests.set(key, request);

  request.then(
    function () {
      hindiRequests.delete(key);
    },
    function () {
      hindiRequests.delete(key);
    }
  );

  return request;
}

function hindiSearchRows(data) {
  var results = data && data.results;

  if (Array.isArray(results)) {
    return results;
  }

  if (
    results &&
    Array.isArray(results.results)
  ) {
    return results.results;
  }

  if (
    data &&
    Array.isArray(data.data)
  ) {
    return data.data;
  }

  return [];
}

function metadataFor(anime) {
  var choice = hindiChoices.get(
    hindiKey(anime)
  );

  if (!choice) return null;

  return hindiMetadata.get(
    choice.id + '|' + SH.s
  );
}

function chooseHindiMatch(key, id, title) {
  hindiChoices.set(key, {
    id: id,
    title: title
  });

  SH.hsrc = null;

  paint(true);
}

function showHindiMatches(anime, rows, session) {
  if (!playerIsCurrent(session.run)) return;

  destroyPlayer();

  var top = preparePlayerTop();
  if (!top) return;

  var box = document.createElement('div');

  box.className = 'nov';

  box.style.cssText =
    'max-height:100%;overflow:auto;padding:20px';

  var heading = document.createElement('span');

  heading.textContent =
    'Choose the correct Hindi catalogue title';

  box.appendChild(heading);

  rows.forEach(function (row) {
    var button = document.createElement('button');

    button.className = 'btn sm';

    button.style.cssText =
      'display:block;margin:8px auto;' +
      'max-width:100%;white-space:normal';

    button.textContent = String(row.title);

    button.onclick = function () {
      if (!playerIsCurrent(session.run)) return;

      chooseHindiMatch(
        hindiKey(anime),
        String(row.anime_id),
        String(row.title)
      );
    };

    box.appendChild(button);
  });

  top.appendChild(box);
  appendPlayerClose(top);

  updatePlaybackStatus(
    'Select the correct title and season. ' +
    'Do not select a different anime.'
  );
}

async function resolveHindiTitle(anime, session) {
  var key = hindiKey(anime);
  var choice = hindiChoices.get(key);

  if (choice) return choice;

  var data = await hindiApi(
    '/api/search',
    {
      s: String(anime[1]),
      page: 1
    },
    300000,
    false
  );

  if (!playerIsCurrent(session.run)) {
    return null;
  }

  var rows = hindiSearchRows(data).filter(
    function (row) {
      return (
        row &&
        row.title &&
        row.anime_id
      );
    }
  );

  var unique = new Map();

  rows.forEach(function (row) {
    unique.set(
      String(row.anime_id),
      row
    );
  });

  rows = Array.from(unique.values());

  var exact = rows.filter(function (row) {
    return (
      titleKey(row.title) ===
      titleKey(anime[1])
    );
  });

  if (exact.length === 1) {
    choice = {
      id: String(exact[0].anime_id),
      title: String(exact[0].title)
    };

    hindiChoices.set(key, choice);

    return choice;
  }

  if (!rows.length) {
    throw new Error(
      'No Hindi catalogue result for this title. ' +
      'An alternate title may be needed.'
    );
  }

  showHindiMatches(
    anime,
    rows.slice(0, 20),
    session
  );

  return null;
}

async function loadHindiMetadata(choice, session) {
  var season = session.state.s;

  var responses = await Promise.allSettled([
    hindiApi(
      '/api/info',
      {
        id: choice.id
      },
      300000,
      false
    ),

    hindiApi(
      '/api/episodes',
      {
        id: choice.id,
        season: season
      },
      300000,
      false
    )
  ]);

  if (!playerIsCurrent(session.run)) {
    return null;
  }

  var info = {};
  var episodes = [];

  var total = 0;
  var seasons = 0;
  var knownEpisodes = false;

  if (responses[0].status === 'fulfilled') {
    var infoResponse = responses[0].value;

    info =
      infoResponse.data ||
      infoResponse.results ||
      {};

    seasons = parseInt(info.seasons, 10) || 0;
  }

  if (responses[1].status === 'fulfilled') {
    var episodesResponse = responses[1].value;

    var body =
      episodesResponse.results ||
      episodesResponse.data ||
      {};

    if (Array.isArray(body.episodes)) {
      episodes = body.episodes;
      knownEpisodes = true;
    }

    total =
      parseInt(body.totalEpisodes, 10) ||
      episodes.length;
  }

  var language = String(
    info.language ||
    info.languages ||
    ''
  );

  var metadata = {
    seasons: seasons,
    total: total,
    episodes: episodes,
    knownEpisodes: knownEpisodes,
    language: language
  };

  hindiMetadata.set(
    choice.id + '|' + season,
    metadata
  );

  /*
   * Refresh controls without restarting the session.
   */
  paint();

  if (
    language &&
    !/hindi|\bhin\b/i.test(language)
  ) {
    throw new Error(
      'This catalogue entry does not list Hindi audio. ' +
      'No non-Hindi fallback was selected.'
    );
  }

  if (seasons && season > seasons) {
    throw new Error(
      'Selected season is not listed for this Hindi title'
    );
  }

  if (
    knownEpisodes &&
    !episodes.some(function (episode) {
      return (
        Number(episode.episode) ===
        session.state.e
      );
    })
  ) {
    throw new Error(
      'Selected episode is not listed for this Hindi season'
    );
  }

  return metadata;
}

function drawHindiSources(streams, session) {
  if (!playerIsCurrent(session.run)) return;

  var holder = document.getElementById(
    'hindi-source-tools'
  );

  if (!holder) return;

  holder.replaceChildren();

  var label = document.createElement('small');

  label.textContent =
    'Hindi catalogue sources. ' +
    'Embedded players may contain multiple audio tracks.';

  label.style.display = 'block';

  var select = document.createElement('select');

  select.className = 'sel';

  select.setAttribute(
    'aria-label',
    'Hindi source'
  );

  streams.forEach(function (stream, index) {
    var option = document.createElement('option');

    option.value = index;

    option.textContent =
      'Source ' + (index + 1) +
      (stream.label
        ? ' · ' + stream.label
        : '');

    select.appendChild(option);
  });

  select.value = String(session.sourceIndex);

  select.onchange = function () {
    SH.hsrc = Number(select.value);
    paint(true);
  };

  var rematch = document.createElement('button');

  rematch.className = 'btn sm';
  rematch.textContent = 'Change title match';

  rematch.onclick = function () {
    hindiChoices.delete(
      hindiKey(session.anime)
    );

    SH.hsrc = null;
    paint(true);
  };

  holder.append(
    label,
    select,
    rematch
  );
}

async function playHindi(session, tryStream) {
  showPlayerMessage(
    'Finding Hindi title...',
    String(session.anime[1])
  );

  var choice = await resolveHindiTitle(
    session.anime,
    session
  );

  if (
    !choice ||
    !playerIsCurrent(session.run)
  ) {
    return;
  }

  showPlayerMessage(
    'Checking Hindi season...',
    choice.title +
    ' · Season ' +
    session.state.s
  );

  await loadHindiMetadata(choice, session);

  if (!playerIsCurrent(session.run)) {
    return;
  }

  showPlayerMessage(
    'Loading Hindi sources...',
    choice.title +
    ' · Episode ' +
    session.state.e
  );

  var data = await hindiApi(
    '/api/stream',
    {
      id: choice.id,
      season: session.state.s,
      ep: session.state.e
    },
    0,
    true
  );

  if (!playerIsCurrent(session.run)) {
    return;
  }

  var streams = normalizeStreams(
    data,
    HINDI_API + '/'
  );

  if (!streams.length) {
    throw new Error(
      'Hindi API returned no usable sources'
    );
  }

  var index = session.state.hsrc === null
    ? Number(session.state.v)
    : Number(session.state.hsrc);

  /*
   * Always show available sources, including when
   * Server 02 was selected but only one source exists.
   */
  session.sourceIndex =
    index < streams.length ? index : 0;

  drawHindiSources(streams, session);

  if (index >= streams.length) {
    throw new Error(
      'Requested Hindi source is not available. ' +
      'Select a source from the list below the player.'
    );
  }

  var label =
    'Hindi · ' +
    (
      streams[index].label ||
      'Source ' + (index + 1)
    );

  if (
    await tryStream(
      streams[index],
      label
    )
  ) {
    return;
  }

  throw new Error(
    'This Hindi source failed. ' +
    'Choose another source from the list below the player.'
  );
}

/* ================= HLS LIBRARY ================= */

function loadHlsLibrary() {
  if (typeof Hls !== 'undefined') {
    return Promise.resolve();
  }

  if (hlsLibraryPromise) {
    return hlsLibraryPromise;
  }

  hlsLibraryPromise = new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    var finished = false;

    var timer = setTimeout(function () {
      finish(
        new Error('HLS library timed out')
      );
    }, 15000);

    function finish(error) {
      if (finished) return;
      finished = true;

      clearTimeout(timer);

      script.onload = null;
      script.onerror = null;

      if (error) {
        script.remove();
        hlsLibraryPromise = null;
        reject(error);
      } else {
        resolve();
      }
    }

    script.src =
      'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

    script.async = true;

    script.onload = function () {
      finish(
        typeof Hls === 'undefined'
          ? new Error('HLS unavailable')
          : null
      );
    };

    script.onerror = function () {
      finish(
        new Error('HLS download failed')
      );
    };

    document.head.appendChild(script);
  });

  return hlsLibraryPromise;
}

function warmHlsLibrary() {
  var video = document.createElement('video');

  if (
    !video.canPlayType('application/vnd.apple.mpegurl')
  ) {
    loadHlsLibrary().catch(function () {});
  }
}

/* ================= SESSION + CLEANUP ================= */

function playerIsCurrent(run) {
  var sheet = document.getElementById('sheet');

  return !!(
    run === playerRun &&
    activePlayback &&
    !activePlayback.cancelled &&
    sheet &&
    sheet.classList.contains('on') &&
    SH.play
  );
}

function destroyPlayer() {
  var top = document.getElementById('shtop');

  if (
    activePlayback &&
    activePlayback.mediaCleanup
  ) {
    activePlayback.mediaCleanup();
    activePlayback.mediaCleanup = null;
  }

  if (activeHls) {
    var previous = activeHls;
    activeHls = null;

    try {
      previous.destroy();
    } catch (error) {}
  }

  if (!top) return;

  var video = top.querySelector('video');

  if (video) {
    video.onended = null;

    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (error) {}
  }

  var iframe = top.querySelector('iframe');

  if (iframe) {
    iframe.remove();
  }
}

function stopPlayback() {
  playerRun++;
  playbackKey = '';

  if (activePlayback) {
    activePlayback.cancelled = true;

    if (activePlayback.cancelAttempt) {
      activePlayback.cancelAttempt();
    }
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

  button.setAttribute(
    'aria-label',
    'Close'
  );

  button.onclick = function () {
    stopPlayback();
    closeSheet();
  };

  top.appendChild(button);
}

function showPlayerMessage(title, detail, retry) {
  var top = preparePlayerTop();
  if (!top) return;

  var box = document.createElement('div');
  box.className = 'nov';

  var heading = document.createElement('span');
  heading.textContent = title;

  var description = document.createElement('small');
  description.textContent = detail || '';

  box.append(
    heading,
    description
  );

  if (retry) {
    var button = document.createElement('button');

    button.className = 'btn sm';
    button.textContent = 'Retry';

    button.onclick = function () {
      paint(true);
    };

    box.appendChild(button);
  }

  top.appendChild(box);
  appendPlayerClose(top);
}

function updatePlaybackStatus(text) {
  var status = document.getElementById(
    'playback-status'
  );

  if (status) {
    status.textContent = text;
  }
}

/* ================= MEDIA PLAYER ================= */

async function mountStream(stream, session, provider) {
  var run = session.run;

  if (!playerIsCurrent(run)) {
    throw new Error('Playback cancelled');
  }

  destroyPlayer();

  var top = preparePlayerTop();

  if (!top) {
    throw new Error(
      'Player container missing'
    );
  }

  if (stream.type === 'iframe') {
    var frame = document.createElement('iframe');

    frame.src = stream.url;
    frame.title = 'Video player';

    frame.allow =
      'autoplay; fullscreen; picture-in-picture';

    frame.allowFullscreen = true;

    frame.style.cssText =
      'width:100%;height:100%;border:0';

    top.appendChild(frame);
    appendPlayerClose(top);

    updatePlaybackStatus(
      'Source: ' + provider +
      ' · If playback fails inside, choose another source.' +
      (
        isHindi(session.state.l)
          ? ' Select Hindi audio inside the player if needed.'
          : ''
      )
    );

    /*
     * A cross-origin iframe cannot be verified
     * as successful video playback by this page.
     */
    return {
      verified: false
    };
  }

  var video = document.createElement('video');

  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';

  video.style.cssText =
    'width:100%;height:100%;background:#000';

  video.onended = function () {
    if (
      playerIsCurrent(run) &&
      U &&
      U.prefs.auto &&
      session.state.e < eN()
    ) {
      play(session.state.e + 1);
    }
  };

  top.appendChild(video);
  appendPlayerClose(top);

  return new Promise(function (resolve, reject) {
    var settled = false;
    var disposed = false;
    var lateReported = false;
    var localHls = null;

    var timer = setTimeout(function () {
      reportError(
        new Error('Stream loading timed out')
      );
    }, 20000);

    function clearWait() {
      clearTimeout(timer);

      if (
        session.cancelAttempt === cancelAttempt
      ) {
        session.cancelAttempt = null;
      }
    }

    function cleanup() {
      if (disposed) return;
      disposed = true;

      clearWait();

      video.removeEventListener(
        'loadeddata',
        onReady
      );

      video.removeEventListener(
        'error',
        onVideoError
      );

      if (
        localHls &&
        typeof Hls !== 'undefined'
      ) {
        localHls.off(
          Hls.Events.ERROR,
          onHlsError
        );
      }
    }

    session.mediaCleanup = cleanup;

    function cancelAttempt() {
      if (settled) return;

      settled = true;
      clearWait();

      reject(
        new Error('Playback cancelled')
      );
    }

    session.cancelAttempt = cancelAttempt;

    function reportError(error) {
      if (disposed) return;

      if (!playerIsCurrent(run)) {
        cancelAttempt();
        return;
      }

      if (!settled) {
        settled = true;
        clearWait();
        reject(error);
        return;
      }

      if (lateReported) return;
      lateReported = true;

      if (
        !isHindi(session.state.l) &&
        session.recoveries < 1
      ) {
        var excluded = session.excluded.slice();

        if (
          excluded.indexOf(stream.url) < 0
        ) {
          excluded.push(stream.url);
        }

        beginPlayback(
          session.anime,
          true,
          excluded,
          session.recoveries + 1
        );
      } else {
        destroyPlayer();

        showPlayerMessage(
          'Playback stopped',
          error.message +
          '. Choose another source or Retry.',
          true
        );

        updatePlaybackStatus(error.message);
      }
    }

    function onReady() {
      if (disposed || settled) return;

      if (!playerIsCurrent(run)) {
        cancelAttempt();
        return;
      }

      settled = true;
      clearWait();

      resolve({
        verified: true
      });
    }

    function onVideoError() {
      reportError(
        new Error(
          'Video failed' +
          (
            video.error
              ? ' (code ' + video.error.code + ')'
              : ''
          )
        )
      );
    }

    function onHlsError(event, data) {
      if (
        disposed ||
        !playerIsCurrent(run)
      ) {
        return;
      }

      var status =
        data.response &&
        data.response.code;

      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        data.fatal
      ) {
        reportError(
          new Error(
            status
              ? 'Media HTTP ' + status
              : 'HLS: ' + data.details
          )
        );
      }
    }

    video.addEventListener(
      'loadeddata',
      onReady
    );

    video.addEventListener(
      'error',
      onVideoError
    );

    (async function () {
      try {
        var nativeHls = video.canPlayType(
          'application/vnd.apple.mpegurl'
        );

        if (
          stream.type === 'hls' &&
          !nativeHls
        ) {
          await loadHlsLibrary();

          if (
            settled ||
            disposed ||
            !playerIsCurrent(run)
          ) {
            return;
          }

          if (!Hls.isSupported()) {
            throw new Error(
              'HLS unsupported'
            );
          }

          localHls = new Hls();
          activeHls = localHls;

          localHls.on(
            Hls.Events.ERROR,
            onHlsError
          );

          localHls.loadSource(stream.url);
          localHls.attachMedia(video);
        } else {
          video.src = stream.url;
          video.load();
        }

        var promise = video.play();

        if (
          promise &&
          promise.catch
        ) {
          promise.catch(function () {
            /*
             * User can press Play if autoplay
             * is blocked by the browser.
             */
          });
        }
      } catch (error) {
        reportError(error);
      }
    })();
  });
}

/* ================= HISTORY ================= */

function savePlaybackHistory(session) {
  if (
    !playerIsCurrent(session.run) ||
    session.historySaved ||
    !U
  ) {
    return;
  }

  session.historySaved = true;

  var state = session.state;
  var name = session.anime[1];

  U.hist = (U.hist || []).filter(
    function (item) {
      return !(
        item.n === name &&
        item.s === state.s &&
        item.e === state.e
      );
    }
  );

  U.hist.unshift({
    n: name,
    s: state.s,
    e: state.e
  });

  U.hist = U.hist.slice(0, 50);
  save();
}

/* ================= STREAM FALLBACK ================= */

async function startPlayback(session) {
  var anime = session.anime;
  var state = session.state;
  var run = session.run;

  var lastError = 'No usable stream returned';

  async function tryStream(stream, provider) {
    if (
      !playerIsCurrent(run) ||
      session.excluded.indexOf(stream.url) >= 0
    ) {
      return false;
    }

    if (
      stream.specialHls ||
      (
        provider === 'reanime' &&
        stream.type === 'hls'
      )
    ) {
      lastError =
        'Special HLS requires a supported embed ' +
        'or backend integration';

      return false;
    }

    updatePlaybackStatus(
      'Loading: ' + provider
    );

    try {
      var result = await mountStream(
        stream,
        session,
        provider
      );

      if (!playerIsCurrent(run)) {
        return false;
      }

      if (result.verified) {
        updatePlaybackStatus(
          'Source: ' + provider
        );

        savePlaybackHistory(session);
      }

      return true;
    } catch (error) {
      if (!playerIsCurrent(run)) {
        return false;
      }

      lastError = error.message;

      console.warn(
        'Playback:',
        provider,
        error.message
      );

      destroyPlayer();
      return false;
    }
  }

  var staticUrls = [
    vurl(
      anime[1],
      state.s,
      state.e,
      state.l,
      state.v
    ),

    vurl(
      anime[1],
      state.s,
      state.e,
      state.l,
      1 - state.v
    )
  ];

  var seen = new Set();

  for (var i = 0; i < staticUrls.length; i++) {
    if (!playerIsCurrent(run)) return;

    var url = safeStreamUrl(
      staticUrls[i]
    );

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);

    if (
      await tryStream(
        {
          url: url,
          type: inferStreamType(url),
          specialHls: false
        },
        'Saved source'
      )
    ) {
      return;
    }
  }

  /*
   * Hindi mode uses only the Hindi API after
   * any explicitly configured Hindi saved video.
   * It does not silently fall back to English/Sub.
   */
  if (isHindi(state.l)) {
    try {
      await playHindi(
        session,
        tryStream
      );
    } catch (error) {
      if (playerIsCurrent(run)) {
        destroyPlayer();

        showPlayerMessage(
          'Hindi source unavailable',
          error.message,
          true
        );

        updatePlaybackStatus(
          error.message +
          ' · Browser CORS/network failures may also ' +
          'prevent API access.'
        );
      }
    }

    return;
  }

  var anilistId = getAnimeId(anime);

  if (!anilistId) {
    if (playerIsCurrent(run)) {
      showPlayerMessage(
        'Video not found',
        'No AniList ID or working saved stream. ' +
        'You can also try the Hindi tab.',
        true
      );
    }

    return;
  }

  var providers = providerOrder(
    state.v
  );

  var audio = state.l === 'dub'
    ? 'dub'
    : 'sub';

  for (var p = 0; p < providers.length; p++) {
    var provider = providers[p];

    for (
      var attempt = 0;
      attempt < 2;
      attempt++
    ) {
      if (!playerIsCurrent(run)) return;

      destroyPlayer();

      showPlayerMessage(
        attempt
          ? 'Refreshing stream...'
          : 'Loading stream...',
        provider +
        ' · Attempt ' +
        (attempt + 1) +
        '/2'
      );

      updatePlaybackStatus(
        'Trying ' + provider
      );

      if (attempt) {
        await delay(900);

        if (!playerIsCurrent(run)) {
          return;
        }
      }

      try {
        var streams = await fetchProviderStreams(
          provider,
          anilistId,
          state.e,
          audio,
          attempt > 0
        );

        if (!playerIsCurrent(run)) {
          return;
        }

        var attempted = new Set();

        for (
          var j = 0;
          j < streams.length;
          j++
        ) {
          if (!playerIsCurrent(run)) {
            return;
          }

          if (
            attempted.has(streams[j].url)
          ) {
            continue;
          }

          attempted.add(
            streams[j].url
          );

          if (
            await tryStream(
              streams[j],
              provider
            )
          ) {
            return;
          }
        }
      } catch (error) {
        if (!playerIsCurrent(run)) {
          return;
        }

        lastError = error.message;

        if (
          /API HTTP (400|401|403|404|422)/.test(
            error.message
          )
        ) {
          break;
        }
      }
    }
  }

  if (playerIsCurrent(run)) {
    destroyPlayer();

    showPlayerMessage(
      'No playable stream found',
      lastError +
      '. Source/backend may need repair.',
      true
    );

    updatePlaybackStatus(
      lastError
    );
  }
}

function beginPlayback(
  anime,
  force,
  excluded,
  recoveries
) {
  var key = playbackIdentity();

  if (
    !force &&
    playbackKey === key
  ) {
    return;
  }

  stopPlayback();
  playbackKey = key;

  var session = {
    run: playerRun,
    anime: anime,

    state: {
      i: SH.i,
      s: SH.s,
      e: SH.e,
      l: SH.l,
      v: SH.v,

      hsrc:
        SH.hsrc === undefined
          ? null
          : SH.hsrc
    },

    cancelled: false,
    historySaved: false,

    excluded: excluded || [],
    recoveries: recoveries || 0,

    cancelAttempt: null,
    mediaCleanup: null
  };

  activePlayback = session;

  var holder = document.getElementById(
    'hindi-source-tools'
  );

  if (holder) {
    holder.replaceChildren();
  }

  warmHlsLibrary();

  startPlayback(session).catch(
    function (error) {
      if (
        !playerIsCurrent(session.run)
      ) {
        return;
      }

      destroyPlayer();

      showPlayerMessage(
        'Player error',
        error.message,
        true
      );

      console.error(error);
    }
  );
}

/* ================= SHEET ================= */

function openSheet(i) {
  stopPlayback();

  var anime = ALL[i];
  if (!anime) return;

  var preferences = U
    ? U.prefs
    : DP();

  var color = C[i % 5];

  var metadata = String(
    anime[2] || ''
  ).split(' • ');

  var sheet = document.getElementById(
    'sheet'
  );

  if (!sheet) return;

  var banner =
    anime[4] ||
    anime[3];

  var language = preferences.lang;

  var validLanguage = playerLanguages().some(
    function (entry) {
      return entry[0] === language;
    }
  );

  if (!validLanguage) {
    language = 'hi';
  }

  SH = {
    i: i,
    s: 1,
    e: 1,
    l: language,
    v: Number(preferences.srv) === 1 ? 1 : 0,
    hsrc: null,
    play: 0,
    pg: 0
  };

  var background = banner
    ? (
        'linear-gradient(to top,' +
        'rgba(12,12,20,.3),transparent),' +
        'url(' + cu(banner) + ') center/cover,#0c0c14'
      )
    : (
        'radial-gradient(85% 70% at 70% 0%,' +
        'rgba(' + color + ',.5),transparent 70%),' +
        'radial-gradient(60% 50% at 0% 100%,' +
        'rgba(233,196,106,.2),transparent 70%),#0c0c14'
      );

  sheet.innerHTML =
    '<div class="sh-top" id="shtop" ' +
    'style="background:' + background + '">' +

      '<button class="sh-x" onclick="closeSheet()" ' +
      'aria-label="Close">✕</button>' +

    '</div>' +

    '<div class="sh-b">' +

      '<div class="chips">' +

        '<span class="r">★ ' +
        anime[0] +
        '</span>' +

        metadata.map(function (text) {
          return (
            '<span>' +
            esc(text) +
            '</span>'
          );
        }).join('') +

      '</div>' +

      '<h2>' +
      esc(anime[1]) +
      '</h2>' +

      (
        anime[7]
          ? '<p class="ds">' + esc(anime[7]) + '</p>'
          : ''
      ) +

      '<div class="acts">' +

        '<button class="btn" onclick="play()">' +
          '▶ Watch Now' +
        '</button>' +

        '<button class="btn g" id="ml" ' +
        'onclick="toggleList(ALL[SH.i][1])"></button>' +

      '</div>' +

      '<div id="ctl"></div>' +

      '<div id="playback-tools" ' +
      'style="display:none;margin:10px 0">' +

        '<small id="playback-status" ' +
        'style="display:block;margin-bottom:8px;' +
        'overflow-wrap:anywhere" ' +
        'aria-live="polite"></small>' +

        '<button class="btn sm" onclick="paint(true)">' +
          '↻ Retry / Refresh stream' +
        '</button>' +

        '<div id="hindi-source-tools" ' +
        'style="margin-top:10px"></div>' +

      '</div>' +

      '<div id="np"></div>' +

      '<h4 id="eh" style="display:none">' +
        'EPISODES' +
      '</h4>' +

      '<div class="eps" id="eps"></div>' +
      '<div id="cm"></div>' +

    '</div>';

  sheet.classList.remove('pm');
  sheet.scrollTop = 0;
  sheet.classList.add('on');

  var overlay = document.getElementById(
    'ov'
  );

  if (overlay) {
    overlay.classList.add('on');
  }

  document.body.style.overflow = 'hidden';

  paint();
  warmHlsLibrary();
}

function play(episode) {
  if (episode) {
    SH.e = Number(episode);

    SH.pg = Math.floor(
      (SH.e - 1) / PG
    );
  }

  SH.play = 1;
  paint();
}

function eN() {
  var anime = ALL[SH.i];

  var metadata = isHindi(SH.l)
    ? metadataFor(anime)
    : null;

  if (
    metadata &&
    metadata.total > 0
  ) {
    return metadata.total;
  }

  return EPN[anime[1]] || 12;
}

function mlbtn() {
  var button = document.getElementById(
    'ml'
  );

  if (button) {
    button.textContent =
      U &&
      U.list.indexOf(ALL[SH.i][1]) > -1
        ? '✓ In My List'
        : '+ My List';
  }
}

function toggleList(name) {
  if (!U) {
    authView('in');
    toast('Login to use My List');
    return;
  }

  var index = U.list.indexOf(name);

  if (index > -1) {
    U.list.splice(index, 1);
  } else {
    U.list.push(name);
  }

  save();
  decorate();
  mlbtn();
}

function changePlayerLanguage(index) {
  var available = playerLanguages();

  if (!available[index]) return;

  SH.l = available[index][0];
  SH.hsrc = null;

  paint();
}

/* ================= RENDER ================= */

function paint(force) {
  var anime = ALL[SH.i];
  if (!anime) return;

  var count = eN();

  var metadata = isHindi(SH.l)
    ? metadataFor(anime)
    : null;

  var seasonCount =
    metadata && metadata.seasons > 0
      ? metadata.seasons
      : SEASONS[anime[1]] || 3;

  var sheet = document.getElementById(
    'sheet'
  );

  if (!sheet) return;

  var page = Math.min(
    SH.pg || 0,
    Math.floor((count - 1) / PG)
  );

  document.getElementById('eh').style.display =
    SH.play ? '' : 'none';

  var tools = document.getElementById(
    'playback-tools'
  );

  if (tools) {
    tools.style.display =
      SH.play ? '' : 'none';
  }

  if (!SH.play) {
    ['ctl', 'eps', 'cm', 'np'].forEach(
      function (id) {
        document.getElementById(id).innerHTML = '';
      }
    );

    mlbtn();
    return;
  }

  var needsPlayback =
    force === true ||
    playbackIdentity() !== playbackKey;

  var options = '';
  var ranges = '';

  for (
    var season = 1;
    season <= seasonCount;
    season++
  ) {
    options +=
      '<option value="' +
      season +
      '"' +

      (season === SH.s
        ? ' selected'
        : '') +

      '>Season ' +
      season +
      '</option>';
  }

  if (count > PG) {
    for (
      var range = 0;
      range * PG < count;
      range++
    ) {
      ranges +=
        '<option value="' +
        range +
        '"' +

        (range === page
          ? ' selected'
          : '') +

        '>Ep ' +
        (range * PG + 1) +

        '–' +

        Math.min(
          count,
          (range + 1) * PG
        ) +

        '</option>';
    }

    ranges =
      '<select class="sel" ' +
      'onchange="SH.pg=+this.value;paint()" ' +
      'aria-label="Episode range">' +

      ranges +

      '</select>';
  }

  document.getElementById('ctl').innerHTML =
    '<select class="sel" ' +

    'onchange="SH.s=+this.value;' +
    'SH.e=1;SH.pg=0;SH.hsrc=null;paint()" ' +

    'aria-label="Season">' +

      options +

    '</select>' +

    '<div class="seg">' +

      playerLanguages().map(
        function (language, index) {
          return (
            '<button class="' +

            (
              language[0] === SH.l
                ? 'on'
                : ''
            ) +

            '" onclick="changePlayerLanguage(' +
            index +
            ')">' +

            esc(language[1]) +

            '</button>'
          );
        }
      ).join('') +

    '</div>' +

    '<div class="seg">' +

      [0, 1].map(function (server) {
        return (
          '<button class="' +

          (
            server === SH.v
              ? 'on'
              : ''
          ) +

          '" onclick="SH.v=' +
          server +
          ';SH.hsrc=null;paint(true)">' +

          'Server 0' +
          (server + 1) +

          '</button>'
        );
      }).join('') +

    '</div>' +

    ranges;

  var episodes = '';

  for (
    var episode = page * PG + 1;
    episode <= Math.min(
      count,
      page * PG + PG
    );
    episode++
  ) {
    episodes +=
      '<button class="' +

      (
        episode === SH.e
          ? 'on'
          : ''
      ) +

      '" onclick="play(' +
      episode +
      ')">' +

      episode +

      '</button>';
  }

  document.getElementById('eps').innerHTML =
    episodes;

  document.getElementById('np').innerHTML =
    '<div class="np">' +

      '<span>▶ S' +
      SH.s +
      ' · Episode ' +
      SH.e +
      '</span>' +

      '<div>' +

        '<button ' +

        (
          SH.e < 2
            ? 'disabled '
            : ''
        ) +

        'onclick="play(' +
        (SH.e - 1) +
        ')">‹ Prev</button>' +

        '<button ' +

        (
          SH.e >= count
            ? 'disabled '
            : ''
        ) +

        'onclick="play(' +
        (SH.e + 1) +
        ')">Next ›</button>' +

      '</div>' +

    '</div>';

  mlbtn();

  if (needsPlayback) {
    cmt();
  }

  sheet.classList.add('pm');

  if (needsPlayback) {
    beginPlayback(
      anime,
      force === true
    );
  }
}

/* ================= CARDS ================= */

function decorate() {
  document.querySelectorAll('.card').forEach(
    function (card, index) {
      var anime = ALL[index];
      if (!anime) return;

      var poster = card.querySelector(
        '.poster'
      );

      var bookmark = card.querySelector(
        '.bm'
      );

      var local = hasVid(
        anime[1]
      );

      /*
       * Hindi API can search by title, so an AniList
       * ID is not required just to offer Watch.
       * This does not verify stream availability.
       */
      var canSearch =
        getAnimeId(anime) !== null ||
        !!String(anime[1] || '').trim();

      var showWatch =
        local || canSearch;

      if (poster) {
        var watch = poster.querySelector(
          '.wbtn'
        );

        poster.classList.toggle(
          'hv',
          showWatch
        );

        if (showWatch) {
          if (!watch) {
            watch = document.createElement(
              'button'
            );

            watch.className = 'wbtn';
            watch.type = 'button';

            poster.appendChild(watch);
          }

          watch.textContent = '▶ Watch';

          watch.setAttribute(
            'aria-label',
            'Watch ' +
            String(anime[1] || 'anime')
          );

          watch.title = local
            ? 'Watch available video'
            : (
                'Search providers; ' +
                'availability not verified'
              );

          watch.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();

            openSheet(index);
            play();
          };
        } else if (watch) {
          watch.remove();
        }
      }

      if (bookmark) {
        bookmark.classList.toggle(
          'on',
          !!U &&
          U.list.indexOf(anime[1]) > -1
        );

        bookmark.onclick = function (event) {
          event.preventDefault();
          event.stopPropagation();

          toggleList(anime[1]);
        };
      }
    }
  );
}

/* ================= COMMENTS ================= */

function ck() {
  return (
    'akC:' +
    ALL[SH.i][1] +
    ':' + SH.s +
    ':' + SH.e
  );
}

function ago(time) {
  var seconds =
    (Date.now() - time) / 1000;

  return seconds < 60
    ? 'just now'
    : seconds < 3600
      ? Math.floor(seconds / 60) + 'm ago'
      : seconds < 86400
        ? Math.floor(seconds / 3600) + 'h ago'
        : Math.floor(seconds / 86400) + 'd ago';
}

function cmt() {
  var list = ls(ck()) || [];

  var html =
    '<h4>COMMENTS · S' +
    SH.s +

    ' E' +
    SH.e +

    ' <span class="cnt">' +
    list.length +
    '</span></h4>';

  html += U
    ? (
        '<div class="cbox">' +
        av(U, 36) +

        '<textarea id="ct" maxlength="500" rows="2" ' +
        'placeholder="Write a comment..."></textarea>' +

        '<button class="btn sm" onclick="postC()">' +
        'Post</button></div>'
      )
    : (
        '<button class="lnk" onclick="authView(\'in\')">' +
        'Login to join the discussion</button>'
      );

  html += list.length
    ? list.map(function (comment, index) {
        var likes = comment.l || [];

        return (
          '<div class="cmt">' +

          av(
            USERS[comment.e] || {},
            34
          ) +

          '<div>' +

            '<b>' +
            esc(comment.n) +
            '</b>' +

            '<small>' +
            ago(comment.t) +
            '</small>' +

            '<p>' +
            esc(comment.x) +
            '</p>' +

            '<button class="lk' +

            (
              U &&
              likes.indexOf(U.email) > -1
                ? ' on'
                : ''
            ) +

            '" onclick="likeC(' +
            index +
            ')">' +

            '♥ ' +
            likes.length +

            '</button>' +

            (
              U &&
              comment.e === U.email
                ? (
                    '<button class="lk" ' +
                    'onclick="delC(' +
                    index +
                    ')">Delete</button>'
                  )
                : ''
            ) +

          '</div></div>'
        );
      }).join('')
    : (
        '<p class="mu" style="margin-top:10px">' +
        'No comments yet. Be the first!</p>'
      );

  document.getElementById('cm').innerHTML =
    html;
}

function postC() {
  var input = document.getElementById(
    'ct'
  );

  if (!input || !U) return;

  var text = input.value.trim();

  if (!text) return;

  var key = ck();
  var list = ls(key) || [];

  list.unshift({
    e: U.email,
    n: U.name,
    x: text,
    t: Date.now(),
    l: []
  });

  ls(
    key,
    list.slice(0, 100)
  );

  cmt();
}

function likeC(index) {
  if (!U) {
    authView('in');
    return;
  }

  var key = ck();
  var list = ls(key) || [];
  var comment = list[index];

  if (!comment) return;

  comment.l = comment.l || [];

  var position = comment.l.indexOf(
    U.email
  );

  if (position > -1) {
    comment.l.splice(position, 1);
  } else {
    comment.l.push(U.email);
  }

  ls(key, list);
  cmt();
}

function delC(index) {
  if (!U) return;

  var key = ck();
  var list = ls(key) || [];

  if (
    !list[index] ||
    list[index].e !== U.email
  ) {
    return;
  }

  list.splice(index, 1);

  ls(key, list);
  cmt();
}

/* ================= EVENTS ================= */

document.addEventListener(
  'click',
  function (event) {
    if (
      !event.target.closest('.search') &&
      typeof sr !== 'undefined' &&
      sr
    ) {
      sr.className = '';
    }
  }
);

document.querySelectorAll(
  '.arr button'
).forEach(function (button) {
  button.onclick = function () {
    var row = document.getElementById(
      button.dataset.r
    );

    if (!row) return;

    row.scrollBy({
      left:
        Number(button.dataset.d) *
        row.clientWidth *
        0.9,

      behavior: 'smooth'
    });
  };
});

var playerModalElement =
  document.getElementById('mw');

if (playerModalElement) {
  playerModalElement.addEventListener(
    'click',
    function (event) {
      if (event.target.id === 'mw') {
        closeM();
      }
    }
  );
}

document.addEventListener(
  'keydown',
  function (event) {
    if (event.key === 'Escape') {
      closeM();
    }
  }
);

var existingSheet =
  document.getElementById('sheet');

if (existingSheet) {
  new MutationObserver(function () {
    if (
      !existingSheet.classList.contains('on')
    ) {
      stopPlayback();
    }
  }).observe(
    existingSheet,
    {
      attributes: true,
      attributeFilter: ['class']
    }
  );
}

window.addEventListener(
  'pagehide',
  function () {
    stopPlayback();
  }
);

/* ================= INITIALIZE ================= */

ub();
applyTheme();
decorate();