/* =====================================================
   COMPLETE player.js REPLACEMENT

   Requires the existing site's:
   ALL, VIDEOS, EPN, SEASONS, LANGS, C, U, USERS,
   DP, esc, ls, av, save, toast, authView,
   closeSheet, closeM, ub, applyTheme.

   Important:
   - A backend HTTP 500 is not repaired by frontend code.
   - Provider names below come from the existing project.
   - Their live availability has not been verified.
   - Anivexa episode-ID format is retained from your code.
   - Do not append this file to an older player version.
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
var hindiCache = new Map();
var hindiPending = new Map();

var HINDI_CACHE_LIMIT = 40;

/* ================= DATA HELPERS ================= */

function hasVid(name) {
  var item =
    typeof VIDEOS !== 'undefined' &&
    VIDEOS[name];

  return !!item && Object.keys(item).length > 0;
}

function vurl(name, season, episode, language, server) {
  var anime =
    typeof VIDEOS !== 'undefined' &&
    VIDEOS[name];

  var item =
    anime &&
    anime[season] &&
    anime[season][episode] &&
    anime[season][episode][language];

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

    if (Number.isInteger(id) && id > 0) {
      return id;
    }
  }

  return null;
}

function safeStreamUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    var url = new URL(
      value,
      base || STREAM_API + '/'
    );

    return /^https?:$/.test(url.protocol)
      ? url.href
      : '';
  } catch (error) {
    return '';
  }
}

function inferStreamType(url, hint) {
  hint = String(hint || '').toLowerCase();

  if (/\.m3u8(?:[?#]|$)/i.test(url)) {
    return 'hls';
  }

  if (hint === 'iframe' || hint === 'embed') {
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

function isHindi(language) {
  return /^(hi|hindi)$/i.test(String(language));
}

function titleKey(title) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function animeKey(anime) {
  return (
    String(getAnimeId(anime) || '') +
    '|' +
    String(anime[1])
  );
}

function playerLanguages() {
  var output = [['hi', 'Hindi']];
  var seen = new Set(['hi', 'hindi']);

  var existing =
    typeof LANGS !== 'undefined'
      ? LANGS
      : [['sub', 'Sub'], ['dub', 'Dub']];

  existing.forEach(function (item) {
    var key = String(item[0]).toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      output.push(item);
    }
  });

  return output;
}

function stateKey() {
  return [
    SH.i,
    SH.s,
    SH.e,
    SH.l,
    SH.provider || 'auto',
    SH.src === null ? 'auto' : SH.src,
    SH.v
  ].join('|');
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/* ================= NETWORK ================= */

async function fetchWithTimeout(url, options) {
  options = options || {};

  var controller = new AbortController();
  var settings = Object.assign({}, options);
  var timeout = settings.timeout || 18000;

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

async function requestJson(url, retryServerError) {
  var maxAttempts = retryServerError ? 2 : 1;

  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt) {
      await wait(1200);
    }

    var response;

    try {
      response = await fetchWithTimeout(url, {
        timeout: 18000,
        cache: 'no-store'
      });
    } catch (error) {
      var networkError = new Error(
        (
          error.name === 'AbortError'
            ? 'API request timed out'
            : 'API request failed: network or CORS'
        ) +
        ' · ' +
        url
      );

      networkError.url = url;
      throw networkError;
    }

    if (!response.ok) {
      if (
        response.status >= 500 &&
        attempt + 1 < maxAttempts
      ) {
        continue;
      }

      var httpError = new Error(
        'API HTTP ' +
        response.status +
        ' · ' +
        url
      );

      httpError.status = response.status;
      httpError.url = url;

      throw httpError;
    }

    var data;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error(
        'API returned non-JSON content · ' + url
      );
    }

    if (data && data.success === false) {
      throw new Error(
        String(
          data.message ||
          data.mmessage ||
          'API reported failure'
        ) +
        ' · ' +
        url
      );
    }

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

    output.push({
      url: url,
      type: type,
      specialHls: !!special && type === 'hls',
      label: String(label || '')
    });
  }

  function visit(item, depth, inheritedSpecial, label) {
    if (!item || depth > 5) return;

    if (typeof item === 'string') {
      add(item, '', inheritedSpecial, label);
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(function (entry) {
        visit(
          entry,
          depth + 1,
          inheritedSpecial,
          label
        );
      });

      return;
    }

    if (typeof item !== 'object') return;

    var special =
      inheritedSpecial ||
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
      } else if (embed && typeof embed === 'object') {
        add(
          embed.url || embed.src,
          'iframe',
          false,
          sourceLabel
        );
      }
    });

    var url = item.url || item.file || item.src;

    if (url) {
      add(
        url,
        item.type || item.format || item.mimeType,
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

  return output;
}

async function fetchProviderStreams(
  provider,
  anilistId,
  episode,
  audio
) {
  /*
   * Retained from your existing integration.
   * If a provider needs a different real episode ID,
   * its API adapter must be corrected separately.
   */
  var episodeId = provider + '-' + episode;

  var url =
    STREAM_API +
    '/watch/' + encodeURIComponent(provider) +
    '/' + encodeURIComponent(anilistId) +
    '/' + encodeURIComponent(audio) +
    '/' + encodeURIComponent(episodeId);

  var data = await requestJson(url, false);

  var streams = normalizeStreams(
    data,
    STREAM_API + '/'
  );

  if (!streams.length) {
    throw new Error(
      provider + ': API returned no usable streams'
    );
  }

  return streams;
}

/* ================= HINDI API ================= */

function hindiApi(path, params, ttl, fresh) {
  var url = new URL(HINDI_API + path);

  Object.keys(params || {}).forEach(function (key) {
    url.searchParams.set(key, params[key]);
  });

  var key = url.href;
  var cached = hindiCache.get(key);

  if (
    !fresh &&
    cached &&
    cached.expires > Date.now()
  ) {
    return Promise.resolve(cached.data);
  }

  if (hindiPending.has(key)) {
    return hindiPending.get(key);
  }

  var promise = requestJson(key, true).then(
    function (data) {
      if (ttl) {
        hindiCache.delete(key);

        hindiCache.set(key, {
          expires: Date.now() + ttl,
          data: data
        });

        while (hindiCache.size > 40) {
          hindiCache.delete(
            hindiCache.keys().next().value
          );
        }
      }

      return data;
    }
  );

  hindiPending.set(key, promise);

  promise.then(
    function () {
      hindiPending.delete(key);
    },
    function () {
      hindiPending.delete(key);
    }
  );

  return promise;
}

function hindiRows(data) {
  if (Array.isArray(data)) return data;
  if (!data) return [];

  if (Array.isArray(data.results)) {
    return data.results;
  }

  if (
    data.results &&
    Array.isArray(data.results.results)
  ) {
    return data.results.results;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

function currentHindiMetadata(anime) {
  var choice = hindiChoices.get(animeKey(anime));

  return choice
    ? hindiMetadata.get(choice.id + '|' + SH.s)
    : null;
}

function showHindiSearch(session, rows, note) {
  if (!playerIsCurrent(session.run)) return;

  destroyPlayer();

  var top = preparePlayerTop();
  if (!top) return;

  var box = document.createElement('div');
  box.className = 'nov';

  box.style.cssText =
    'padding:18px;max-height:100%;overflow:auto';

  var heading = document.createElement('span');
  heading.textContent =
    note || 'Select the correct Hindi title';

  box.appendChild(heading);

  var input = document.createElement('input');

  input.type = 'search';
  input.value = String(session.anime[1] || '');
  input.placeholder = 'Search another title';

  input.style.cssText =
    'display:block;width:90%;max-width:360px;' +
    'margin:10px auto;padding:10px';

  var search = document.createElement('button');
  search.className = 'btn sm';
  search.textContent = 'Search Hindi catalogue';

  search.onclick = async function () {
    var text = input.value.trim();
    if (!text || !playerIsCurrent(session.run)) return;

    search.disabled = true;
    search.textContent = 'Searching...';

    try {
      var data = await hindiApi(
        '/api/search',
        { s: text, page: 1 },
        300000,
        false
      );

      if (!playerIsCurrent(session.run)) return;

      var results = hindiRows(data).filter(function (row) {
        return row && row.anime_id && row.title;
      });

      showHindiSearch(
        session,
        results,
        results.length
          ? 'Select the correct Hindi title'
          : 'No results. Try another spelling.'
      );
    } catch (error) {
      if (playerIsCurrent(session.run)) {
        updatePlaybackStatus(error.message);
        search.disabled = false;
        search.textContent = 'Search again';
      }
    }
  };

  box.append(input, search);

  rows.slice(0, 25).forEach(function (row) {
    var button = document.createElement('button');

    button.className = 'btn sm';
    button.textContent = String(row.title);

    button.style.cssText =
      'display:block;margin:9px auto;' +
      'max-width:95%;white-space:normal';

    button.onclick = function () {
      if (!playerIsCurrent(session.run)) return;

      hindiChoices.set(animeKey(session.anime), {
        id: String(row.anime_id),
        title: String(row.title)
      });

      SH.src = null;
      paint(true);
    };

    box.appendChild(button);
  });

  top.appendChild(box);
  appendPlayerClose(top);
}

async function resolveHindiTitle(session) {
  var key = animeKey(session.anime);
  var choice = hindiChoices.get(key);

  if (choice) return choice;

  var data = await hindiApi(
    '/api/search',
    {
      s: String(session.anime[1]),
      page: 1
    },
    300000,
    false
  );

  if (!playerIsCurrent(session.run)) return null;

  var rows = hindiRows(data).filter(function (row) {
    return row && row.title && row.anime_id;
  });

  var unique = new Map();

  rows.forEach(function (row) {
    unique.set(String(row.anime_id), row);
  });

  rows = Array.from(unique.values());

  var exact = rows.filter(function (row) {
    return (
      titleKey(row.title) ===
      titleKey(session.anime[1])
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

  showHindiSearch(
    session,
    rows,
    rows.length
      ? 'Select the correct Hindi title'
      : 'No exact match. Try another title.'
  );

  return null;
}

async function loadHindiMetadata(choice, session) {
  var results = await Promise.allSettled([
    hindiApi(
      '/api/info',
      { id: choice.id },
      300000,
      false
    ),

    hindiApi(
      '/api/episodes',
      {
        id: choice.id,
        season: session.state.s
      },
      300000,
      false
    )
  ]);

  if (!playerIsCurrent(session.run)) return;

  var meta = {
    seasons: 0,
    total: 0,
    episodes: [],
    knownEpisodes: false,
    language: ''
  };

  if (results[0].status === 'fulfilled') {
    var response = results[0].value;

    var info =
      response.data ||
      response.results ||
      response;

    meta.seasons = parseInt(info.seasons, 10) || 0;

    meta.language = String(
      info.language ||
      info.languages ||
      ''
    );
  } else {
    console.warn('Hindi info:', results[0].reason);
  }

  if (results[1].status === 'fulfilled') {
    var episodeResponse = results[1].value;

    var body =
      episodeResponse.results ||
      episodeResponse.data ||
      episodeResponse;

    if (Array.isArray(body.episodes)) {
      meta.episodes = body.episodes;
      meta.knownEpisodes = true;
    }

    meta.total =
      parseInt(body.totalEpisodes, 10) ||
      meta.episodes.length;
  } else {
    console.warn('Hindi episodes:', results[1].reason);
  }

  hindiMetadata.set(
    choice.id + '|' + session.state.s,
    meta
  );

  paint();

  if (
    meta.language &&
    !/hindi|\bhin\b/i.test(meta.language)
  ) {
    throw new Error(
      'This title does not list Hindi audio'
    );
  }

  if (
    meta.seasons &&
    session.state.s > meta.seasons
  ) {
    throw new Error(
      'This Hindi title does not list the selected season'
    );
  }

  if (
    meta.knownEpisodes &&
    !meta.episodes.some(function (episode) {
      return Number(episode.episode) === session.state.e;
    })
  ) {
    throw new Error(
      'This Hindi title does not list the selected episode'
    );
  }
}

/* ================= HLS LIBRARY ================= */

function loadHlsLibrary() {
  if (typeof Hls !== 'undefined') {
    return Promise.resolve();
  }

  if (hlsLibraryPromise) return hlsLibraryPromise;

  hlsLibraryPromise = new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    var finished = false;

    var timer = setTimeout(function () {
      finish(new Error('HLS library timed out'));
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
          ? new Error('HLS library unavailable')
          : null
      );
    };

    script.onerror = function () {
      finish(new Error('HLS library download failed'));
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
  if (activePlayback && activePlayback.mediaCleanup) {
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

  var top = document.getElementById('shtop');
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

  var frame = top.querySelector('iframe');

  if (frame) frame.remove();
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
  button.setAttribute('aria-label', 'Close');

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

  description.style.overflowWrap = 'anywhere';

  box.append(heading, description);

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

  label.textContent =
    'Actual sources returned by ' + provider + ':';

  var select = document.createElement('select');

  select.className = 'sel';
  select.setAttribute('aria-label', 'Playback source');

  streams.forEach(function (stream, index) {
    var option = document.createElement('option');

    option.value = index;

    option.textContent =
      'Source ' + (index + 1) +
      (stream.label ? ' · ' + stream.label : '') +
      ' · ' + stream.type;

    select.appendChild(option);
  });

  select.value = String(selected);

  select.onchange = function () {
    if (!isHindi(SH.l) && provider !== 'Saved source') {
      SH.provider = provider;
    }

    SH.src = Number(select.value);

    paint(true);
  };

  holder.append(label, select);

  if (isHindi(session.state.l)) {
    var change = document.createElement('button');

    change.className = 'btn sm';
    change.textContent = 'Change Hindi title';

    change.onclick = function () {
      hindiChoices.delete(animeKey(session.anime));
      SH.src = null;
      paint(true);
    };

    holder.appendChild(change);
  }
}

/* ================= STABLE MEDIA PLAYER ================= */

async function mountStream(stream, session, provider) {
  var run = session.run;

  if (!playerIsCurrent(run)) {
    throw new Error('Playback cancelled');
  }

  destroyPlayer();

  var top = preparePlayerTop();

  if (!top) throw new Error('Player container missing');

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
      'Provider: ' + provider +
      ' · Embedded player. If it fails inside, ' +
      'select another source/provider.' +
      (
        isHindi(session.state.l)
          ? ' Select Hindi audio inside if needed.'
          : ''
      )
    );

    return { verified: false };
  }

  var video = document.createElement('video');

  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';

  video.style.cssText =
    'width:100%;height:100%;background:#000';

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

    var startTimer = setTimeout(function () {
      fail(new Error('Initial video load timed out'));
    }, 30000);

    function clearStartTimer() {
      clearTimeout(startTimer);

      if (session.cancelAttempt === cancelAttempt) {
        session.cancelAttempt = null;
      }
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

      if (localHls && typeof Hls !== 'undefined') {
        localHls.off(Hls.Events.ERROR, hlsError);
      }
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

      if (!playerIsCurrent(run)) {
        cancelAttempt();
        return;
      }

      if (!settled) {
        settled = true;
        clearStartTimer();
        reject(error);
        return;
      }

      /*
       * Once video has started:
       * DO NOT rebuild the sheet or restart providers.
       * Show a final error and wait for the user's action.
       */
      if (!failedAfterStart) {
        failedAfterStart = true;

        destroyPlayer();

        showPlayerMessage(
          'Playback stopped',
          error.message +
          '. Choose another source/provider or Retry.',
          true
        );

        updatePlaybackStatus(
          'Provider: ' + provider + ' · ' + error.message
        );
      }
    }

    function ready() {
      if (disposed || settled) return;

      if (!playerIsCurrent(run)) {
        cancelAttempt();
        return;
      }

      settled = true;
      clearStartTimer();

      resolve({ verified: true });
    }

    function playing() {
      if (disposed || !playerIsCurrent(run)) return;

      clearTimeout(stallTimer);

      updatePlaybackStatus(
        'Provider: ' + provider + ' · Playing'
      );
    }

    function waiting() {
      if (
        disposed ||
        !playerIsCurrent(run) ||
        video.paused
      ) {
        return;
      }

      updatePlaybackStatus(
        'Provider: ' + provider +
        ' · Buffering; keeping the current video session.'
      );

      clearTimeout(stallTimer);

      /*
       * This timer only updates text.
       * It never restarts or changes the stream.
       */
      stallTimer = setTimeout(function () {
        if (disposed || !playerIsCurrent(run)) return;

        updatePlaybackStatus(
          'Provider: ' + provider +
          ' · Source/network is slow. ' +
          'You can select another source/provider.'
        );
      }, 15000);
    }

    function paused() {
      clearTimeout(stallTimer);

      if (
        !disposed &&
        playerIsCurrent(run) &&
        !video.ended
      ) {
        updatePlaybackStatus(
          'Provider: ' + provider +
          ' · Paused / press Play if autoplay was blocked.'
        );
      }
    }

    function ended() {
      if (
        playerIsCurrent(run) &&
        U &&
        U.prefs.auto &&
        session.state.e < eN()
      ) {
        play(session.state.e + 1);
      }
    }

    function videoError() {
      /*
       * Give Hls.js its own bounded media recovery path.
       * Native media errors have no Hls.js handler.
       */
      if (localHls) return;

      fail(new Error(
        'Video error' +
        (video.error ? ' ' + video.error.code : '')
      ));
    }

    function hlsError(event, data) {
      if (disposed || !playerIsCurrent(run)) return;

      console.warn('HLS:', provider, data);

      /*
       * Nonfatal segment/stall errors are handled by
       * Hls.js. Do not destroy playback for those.
       */
      if (!data.fatal) return;

      var status =
        data.response &&
        data.response.code;

      /*
       * Fatal authentication/missing-resource errors
       * are not fixed by endlessly restarting loading.
       */
      if (
        status === 401 ||
        status === 403 ||
        status === 404
      ) {
        fail(new Error('Media HTTP ' + status));
        return;
      }

      if (
        data.type === Hls.ErrorTypes.NETWORK_ERROR &&
        networkRecoveries < 1
      ) {
        networkRecoveries++;

        updatePlaybackStatus(
          'Provider: ' + provider +
          ' · Retrying the current media connection once.'
        );

        recoveryTimer = setTimeout(function () {
          if (
            disposed ||
            !playerIsCurrent(run) ||
            !localHls
          ) {
            return;
          }

          var position = Number.isFinite(video.currentTime)
            ? video.currentTime
            : -1;

          localHls.startLoad(position);
        }, 1000);

        return;
      }

      if (
        data.type === Hls.ErrorTypes.MEDIA_ERROR &&
        mediaRecoveries < 1
      ) {
        mediaRecoveries++;

        updatePlaybackStatus(
          'Provider: ' + provider +
          ' · Trying one media recovery.'
        );

        try {
          localHls.recoverMediaError();
        } catch (error) {
          fail(error);
        }

        return;
      }

      fail(new Error(
        'Fatal HLS error: ' + data.details
      ));
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
        var nativeHls = video.canPlayType(
          'application/vnd.apple.mpegurl'
        );

        if (stream.type === 'hls' && !nativeHls) {
          await loadHlsLibrary();

          if (
            disposed ||
            settled ||
            !playerIsCurrent(run)
          ) {
            return;
          }

          if (!Hls.isSupported()) {
            throw new Error('HLS unsupported in this browser');
          }

          localHls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            backBufferLength: 30
          });

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
            if (playerIsCurrent(run) && !disposed) {
              updatePlaybackStatus(
                'Provider: ' + provider +
                ' · Press Play to start.'
              );
            }
          });
        }
      } catch (error) {
        fail(error);
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

  U.hist = (U.hist || []).filter(function (item) {
    return !(
      item.n === name &&
      item.s === state.s &&
      item.e === state.e
    );
  });

  U.hist.unshift({
    n: name,
    s: state.s,
    e: state.e
  });

  U.hist = U.hist.slice(0, 50);
  save();
}

/* ================= SOURCE SELECTION ================= */

function playableSources(streams, provider) {
  return streams.filter(function (stream) {
    if (stream.specialHls) return false;

    /*
     * Retains the existing conservative ReAnime rule.
     * Custom/encrypted playlists need a separate adapter.
     */
    if (
      provider === 'reanime' &&
      stream.type === 'hls'
    ) {
      return false;
    }

    return true;
  });
}

async function trySources(streams, provider, session) {
  if (!playerIsCurrent(session.run)) return false;

  streams = playableSources(streams, provider);

  if (!streams.length) {
    session.lastError =
      provider + ': no supported ordinary stream/embed';
    return false;
  }

  var manual = session.state.src !== null;

  var first = manual
    ? Number(session.state.src)
    : 0;

  drawSources(
    streams,
    provider,
    session,
    first < streams.length ? first : 0
  );

  if (first >= streams.length || first < 0) {
    session.lastError =
      'Selected source is unavailable. Choose another source.';
    return false;
  }

  var indices = [first];

  if (!manual) {
    for (var i = 0; i < streams.length; i++) {
      if (i !== first) indices.push(i);
    }
  }

  for (var j = 0; j < indices.length; j++) {
    if (!playerIsCurrent(session.run)) return false;

    var index = indices[j];
    var stream = streams[index];

    drawSources(streams, provider, session, index);

    updatePlaybackStatus(
      'Trying ' + provider +
      ' · Source ' + (index + 1)
    );

    try {
      var result = await mountStream(
        stream,
        session,
        provider
      );

      if (!playerIsCurrent(session.run)) return false;

      if (result.verified) {
        savePlaybackHistory(session);
      }

      return true;
    } catch (error) {
      if (!playerIsCurrent(session.run)) return false;

      session.lastError =
        provider + ': ' + error.message;

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

  /*
   * Local saved video is used in Auto mode.
   * An explicitly selected provider is not overridden.
   */
  if (state.provider === 'auto') {
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
    var saved = [];

    staticUrls.forEach(function (value) {
      var url = safeStreamUrl(value);

      if (url && !seen.has(url)) {
        seen.add(url);

        saved.push({
          url: url,
          type: inferStreamType(url),
          specialHls: false,
          label: 'Saved video'
        });
      }
    });

    if (
      saved.length &&
      await trySources(saved, 'Saved source', session)
    ) {
      return;
    }
  }

  if (!playerIsCurrent(run)) return;

  if (isHindi(state.l)) {
    try {
      showPlayerMessage(
        'Finding Hindi title...',
        String(anime[1])
      );

      var choice = await resolveHindiTitle(session);

      if (!choice || !playerIsCurrent(run)) return;

      showPlayerMessage(
        'Checking Hindi season...',
        choice.title
      );

      await loadHindiMetadata(choice, session);

      if (!playerIsCurrent(run)) return;

      showPlayerMessage(
        'Loading Hindi sources...',
        choice.title +
        ' · S' + state.s +
        ' E' + state.e
      );

      var data = await hindiApi(
        '/api/stream',
        {
          id: choice.id,
          season: state.s,
          ep: state.e
        },
        0,
        true
      );

      if (!playerIsCurrent(run)) return;

      var hindiStreams = normalizeStreams(
        data,
        HINDI_API + '/'
      );

      if (
        await trySources(
          hindiStreams,
          'Hindi API',
          session
        )
      ) {
        return;
      }

      throw new Error(
        session.lastError ||
        'Hindi API returned no playable sources'
      );
    } catch (error) {
      if (!playerIsCurrent(run)) return;

      destroyPlayer();

      showPlayerMessage(
        'Hindi source unavailable',
        error.message,
        true
      );

      updatePlaybackStatus(
        error.message +
        ' · HTTP 500 requires investigation of the API backend.'
      );

      console.error('Hindi API:', error);
    }

    return;
  }

  var id = getAnimeId(anime);

  if (!id) {
    showPlayerMessage(
      'Video not found',
      'No AniList ID. Hindi mode can search by title.',
      true
    );

    return;
  }

  var providers = state.provider === 'auto'
    ? STREAM_PROVIDERS.slice()
    : [state.provider];

  var audio = state.l === 'dub'
    ? 'dub'
    : 'sub';

  for (var p = 0; p < providers.length; p++) {
    if (!playerIsCurrent(run)) return;

    var provider = providers[p];

    destroyPlayer();

    showPlayerMessage(
      'Loading provider...',
      provider +
      ' · ' + (p + 1) +
      '/' + providers.length
    );

    updatePlaybackStatus(
      'Requesting: ' + provider
    );

    try {
      var streams = await fetchProviderStreams(
        provider,
        id,
        state.e,
        audio
      );

      if (!playerIsCurrent(run)) return;

      if (await trySources(streams, provider, session)) {
        return;
      }
    } catch (error) {
      if (!playerIsCurrent(run)) return;

      session.lastError =
        provider + ': ' + error.message;

      console.warn(session.lastError);
    }
  }

  if (playerIsCurrent(run)) {
    destroyPlayer();

    showPlayerMessage(
      'No playable stream found',
      session.lastError +
      '. Choose another provider or check the backend.',
      true
    );

    updatePlaybackStatus(session.lastError);
  }
}

function beginPlayback(anime, force) {
  var key = stateKey();

  if (!force && key === playbackKey) return;

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
      provider: SH.provider || 'auto',
      src: SH.src === undefined ? null : SH.src
    },

    cancelled: false,
    historySaved: false,
    cancelAttempt: null,
    mediaCleanup: null,
    lastError: 'No usable stream returned'
  };

  activePlayback = session;

  var sources = document.getElementById('source-tools');

  if (sources) sources.replaceChildren();

  warmHlsLibrary();

  startPlayback(session).catch(function (error) {
    if (!playerIsCurrent(session.run)) return;

    destroyPlayer();

    showPlayerMessage(
      'Player error',
      error.message,
      true
    );

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

  var language = preferences.lang;

  if (
    !playerLanguages().some(function (item) {
      return item[0] === language;
    })
  ) {
    language = 'hi';
  }

  SH = {
    i: index,
    s: 1,
    e: 1,
    l: language,
    v: Number(preferences.srv) === 1 ? 1 : 0,
    provider: 'auto',
    src: null,
    play: 0,
    pg: 0
  };

  var banner = anime[4] || anime[3];

  var background = banner
    ? (
        'linear-gradient(to top,' +
        'rgba(12,12,20,.3),transparent),' +
        'url(' + cu(banner) + ') center/cover,#0c0c14'
      )
    : (
        'radial-gradient(85% 70% at 70% 0%,' +
        'rgba(' + color + ',.5),transparent 70%),#0c0c14'
      );

  var metadata = String(anime[2] || '').split(' • ');

  sheet.innerHTML =
    '<div class="sh-top" id="shtop" ' +
    'style="background:' + background + '">' +

      '<button class="sh-x" onclick="closeSheet()" ' +
      'aria-label="Close">✕</button>' +

    '</div>' +

    '<div class="sh-b">' +

      '<div class="chips">' +
        '<span class="r">★ ' + anime[0] + '</span>' +

        metadata.map(function (text) {
          return '<span>' + esc(text) + '</span>';
        }).join('') +

      '</div>' +

      '<h2>' + esc(anime[1]) + '</h2>' +

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
        'aria-live="polite" ' +
        'style="display:block;margin-bottom:8px;' +
        'overflow-wrap:anywhere"></small>' +

        '<button class="btn sm" onclick="paint(true)">' +
          '↻ Retry current selection' +
        '</button>' +

        '<div id="source-tools" ' +
        'style="margin-top:10px"></div>' +

      '</div>' +

      '<div id="np"></div>' +

      '<h4 id="eh" style="display:none">EPISODES</h4>' +

      '<div class="eps" id="eps"></div>' +
      '<div id="cm"></div>' +

    '</div>';

  sheet.classList.remove('pm');
  sheet.scrollTop = 0;
  sheet.classList.add('on');

  var overlay = document.getElementById('ov');

  if (overlay) overlay.classList.add('on');

  document.body.style.overflow = 'hidden';

  paint();
  warmHlsLibrary();
}

function play(episode) {
  if (episode) {
    var nextEpisode = Number(episode);

    if (nextEpisode !== SH.e) {
      SH.src = null;
    }

    SH.e = nextEpisode;
    SH.pg = Math.floor((SH.e - 1) / PG);
  }

  SH.play = 1;
  paint();
}

function eN() {
  var anime = ALL[SH.i];

  var meta = isHindi(SH.l)
    ? currentHindiMetadata(anime)
    : null;

  if (meta && meta.total > 0) {
    return meta.total;
  }

  return EPN[anime[1]] || 12;
}

function mlbtn() {
  var button = document.getElementById('ml');

  if (button) {
    button.textContent =
      U && U.list.indexOf(ALL[SH.i][1]) > -1
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

  if (index > -1) U.list.splice(index, 1);
  else U.list.push(name);

  save();
  decorate();
  mlbtn();
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
  if (
    value !== 'auto' &&
    STREAM_PROVIDERS.indexOf(value) < 0
  ) {
    return;
  }

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

  var meta = isHindi(SH.l)
    ? currentHindiMetadata(anime)
    : null;

  var seasons = meta && meta.seasons > 0
    ? meta.seasons
    : SEASONS[anime[1]] || 3;

  var page = Math.min(
    SH.pg || 0,
    Math.floor((count - 1) / PG)
  );

  document.getElementById('eh').style.display =
    SH.play ? '' : 'none';

  var tools = document.getElementById('playback-tools');

  if (tools) {
    tools.style.display = SH.play ? '' : 'none';
  }

  if (!SH.play) {
    ['ctl', 'eps', 'np', 'cm'].forEach(function (id) {
      document.getElementById(id).innerHTML = '';
    });

    mlbtn();
    return;
  }

  var needsPlayback =
    force === true ||
    stateKey() !== playbackKey;

  var seasonOptions = '';

  for (var s = 1; s <= seasons; s++) {
    seasonOptions +=
      '<option value="' + s + '"' +
      (s === SH.s ? ' selected' : '') +
      '>Season ' + s + '</option>';
  }

  var rangeOptions = '';

  if (count > PG) {
    for (var r = 0; r * PG < count; r++) {
      rangeOptions +=
        '<option value="' + r + '"' +
        (r === page ? ' selected' : '') +

        '>Ep ' + (r * PG + 1) +
        '–' + Math.min(count, (r + 1) * PG) +

        '</option>';
    }

    rangeOptions =
      '<select class="sel" ' +
      'onchange="SH.pg=+this.value;paint()" ' +
      'aria-label="Episode range">' +
      rangeOptions +
      '</select>';
  }

  var providerControl = '';

  if (isHindi(SH.l)) {
    providerControl =
      '<small style="display:block;margin:8px 0">' +
      'Provider: Hindi API. ' +
      'Sub/Dub providers are not used as Hindi fallback.' +
      '</small>';
  } else {
    var providerOptions =
      '<option value="auto"' +
      (SH.provider === 'auto' ? ' selected' : '') +
      '>Auto · try available providers</option>';

    STREAM_PROVIDERS.forEach(function (provider) {
      providerOptions +=
        '<option value="' + provider + '"' +
        (SH.provider === provider ? ' selected' : '') +
        '>' + provider + '</option>';
    });

    providerControl =
      '<label style="display:block;margin:8px 0">' +
        'Provider ' +
        '<select class="sel" ' +
        'aria-label="Provider" ' +
        'onchange="changePlayerProvider(this.value)">' +
          providerOptions +
        '</select>' +
      '</label>';
  }

  document.getElementById('ctl').innerHTML =
    '<select class="sel" ' +
    'aria-label="Season" ' +
    'onchange="SH.s=+this.value;SH.e=1;' +
    'SH.pg=0;SH.src=null;paint()">' +

      seasonOptions +

    '</select>' +

    '<div class="seg">' +

      playerLanguages().map(function (item, index) {
        return (
          '<button class="' +
          (item[0] === SH.l ? 'on' : '') +

          '" onclick="changePlayerLanguage(' +
          index + ')">' +

          esc(item[1]) +

          '</button>'
        );
      }).join('') +

    '</div>' +

    providerControl +
    rangeOptions;

  var episodeButtons = '';

  for (
    var episode = page * PG + 1;
    episode <= Math.min(count, page * PG + PG);
    episode++
  ) {
    episodeButtons +=
      '<button class="' +
      (episode === SH.e ? 'on' : '') +

      '" onclick="play(' + episode + ')">' +

      episode +

      '</button>';
  }

  document.getElementById('eps').innerHTML =
    episodeButtons;

  document.getElementById('np').innerHTML =
    '<div class="np">' +

      '<span>▶ S' + SH.s +
      ' · Episode ' + SH.e + '</span>' +

      '<div>' +

        '<button ' +
        (SH.e < 2 ? 'disabled ' : '') +
        'onclick="play(' + (SH.e - 1) + ')">' +
        '‹ Prev</button>' +

        '<button ' +
        (SH.e >= count ? 'disabled ' : '') +
        'onclick="play(' + (SH.e + 1) + ')">' +
        'Next ›</button>' +

      '</div>' +

    '</div>';

  mlbtn();

  if (needsPlayback) {
    cmt();
  }

  sheet.classList.add('pm');

  if (needsPlayback) {
    beginPlayback(anime, force === true);
  }
}

/* ================= CARDS ================= */

function decorate() {
  document.querySelectorAll('.card').forEach(
    function (card, index) {
      /*
       * Retains your existing card-to-ALL ordering.
       */
      var anime = ALL[index];
      if (!anime) return;

      var poster = card.querySelector('.poster');
      var bookmark = card.querySelector('.bm');

      var local = hasVid(anime[1]);

      var searchable =
        getAnimeId(anime) !== null ||
        !!String(anime[1] || '').trim();

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

          watch.textContent = '▶ Watch';

          watch.setAttribute(
            'aria-label',
            'Watch ' + String(anime[1] || 'anime')
          );

          watch.title = local
            ? 'Watch saved video'
            : 'Search providers; availability not verified';

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
          !!U && U.list.indexOf(anime[1]) > -1
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
    'akC:' + ALL[SH.i][1] +
    ':' + SH.s +
    ':' + SH.e
  );
}

function ago(time) {
  var seconds = (Date.now() - time) / 1000;

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
    '<h4>COMMENTS · S' + SH.s +
    ' E' + SH.e +
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

          av(USERS[comment.e] || {}, 34) +

          '<div>' +

            '<b>' + esc(comment.n) + '</b>' +
            '<small>' + ago(comment.t) + '</small>' +
            '<p>' + esc(comment.x) + '</p>' +

            '<button class="lk' +

            (
              U && likes.indexOf(U.email) > -1
                ? ' on'
                : ''
            ) +

            '" onclick="likeC(' + index + ')">' +

              '♥ ' + likes.length +

            '</button>' +

            (
              U && comment.e === U.email
                ? (
                    '<button class="lk" ' +
                    'onclick="delC(' + index + ')">' +
                    'Delete</button>'
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

  document.getElementById('cm').innerHTML = html;
}

function postC() {
  var input = document.getElementById('ct');

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

  ls(key, list.slice(0, 100));
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

  var position = comment.l.indexOf(U.email);

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

document.addEventListener('click', function (event) {
  if (
    !event.target.closest('.search') &&
    typeof sr !== 'undefined' &&
    sr
  ) {
    sr.className = '';
  }
});

document.querySelectorAll('.arr button').forEach(
  function (button) {
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
  }
);

var playerModalElement = document.getElementById('mw');

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

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    closeM();
  }
});

var existingSheet = document.getElementById('sheet');

if (existingSheet) {
  new MutationObserver(function () {
    if (!existingSheet.classList.contains('on')) {
      stopPlayback();
    }
  }).observe(existingSheet, {
    attributes: true,
    attributeFilter: ['class']
  });
}

window.addEventListener('pagehide', function () {
  stopPlayback();
});

/* ================= INITIALIZE ================= */

ub();
applyTheme();
decorate();