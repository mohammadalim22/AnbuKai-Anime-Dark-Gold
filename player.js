/* =====================================================
   COMPLETE player.js REPLACEMENT

   Uses the existing site's:
   ALL, VIDEOS, EPN, SEASONS, LANGS, C, U, USERS,
   DP, esc, ls, av, save, toast, authView,
   closeSheet, closeM, ub, applyTheme.

   API route format follows Anivexa documentation.
   No claim of live API/browser playback verification.
   ===================================================== */

var SH = {};
var PG = 100;

var STREAM_API = 'https://anivexa-api-wi89.onrender.com';

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

/* ================= GENERAL HELPERS ================= */

function hasVid(name) {
  if (typeof VIDEOS === 'undefined') return false;

  var anime = VIDEOS[name];

  return !!anime && Object.keys(anime).length > 0;
}

function vurl(name, season, episode, language, server) {
  if (typeof VIDEOS === 'undefined') return '';

  var anime = VIDEOS[name];

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

function safeStreamUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    /*
     * Resolve API-relative URLs against the API,
     * not against the GitHub Pages frontend.
     */
    var url = new URL(value, STREAM_API + '/');

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

function isHlsUrl(url) {
  return /\.m3u8(?:[?#]|$)/i.test(url);
}

function inferStreamType(url, hint) {
  hint = String(hint || '').toLowerCase();

  /* A playlist must never become an iframe. */
  if (isHlsUrl(url)) return 'hls';

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

/* ================= API ================= */

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

function normalizeStreams(data) {
  var result = [];
  var seen = new Set();

  function add(value, hint, specialHls) {
    var url = safeStreamUrl(value);
    if (!url) return;

    var type = inferStreamType(url, hint);
    var key = type + ':' + url;

    if (seen.has(key)) return;
    seen.add(key);

    result.push({
      type: type,
      url: url,
      specialHls: !!specialHls && type === 'hls'
    });
  }

  function visit(item, depth, inheritedSpecial) {
    if (!item || depth > 5) return;

    if (typeof item === 'string') {
      add(item, '', inheritedSpecial);
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(function (entry) {
        visit(entry, depth + 1, inheritedSpecial);
      });
      return;
    }

    if (typeof item !== 'object') return;

    var special =
      inheritedSpecial ||
      !!item.playlist_key ||
      !!item.playlistKey;

    /*
     * Anivexa may return embed, not only embedUrl.
     * Explicit embed URLs are preferred.
     */
    [
      item.embedUrl,
      item.embed_url,
      item.embed
    ].forEach(function (embed) {
      if (typeof embed === 'string') {
        add(embed, 'iframe', false);
      } else if (embed && typeof embed === 'object') {
        add(
          embed.url || embed.src,
          'iframe',
          false
        );
      }
    });

    var url = item.url || item.file || item.src;

    if (url) {
      add(
        url,
        item.type || item.format || item.mimeType,
        special
      );
    }

    ['streams', 'sources', 'data'].forEach(function (key) {
      if (item[key]) {
        visit(item[key], depth + 1, special);
      }
    });
  }

  visit(data, 0, false);

  /*
   * Explicit embeds first, then ordinary media.
   * Special HLS is handled separately below.
   */
  return result.sort(function (a, b) {
    var priority = {
      iframe: 0,
      hls: 1,
      video: 2
    };

    return priority[a.type] - priority[b.type];
  });
}

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

  var response = await fetchWithTimeout(url, {
    timeout: 15000,
    cache: fresh ? 'no-store' : 'default'
  });

  if (!response.ok) {
    throw new Error(
      provider + ': API HTTP ' + response.status
    );
  }

  var data;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error(
      provider + ': API did not return valid JSON'
    );
  }

  var streams = normalizeStreams(data);

  if (!streams.length) {
    throw new Error(
      provider + ': no usable stream URL returned'
    );
  }

  return streams;
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
      finish(new Error('HLS library loading timed out'));
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
      finish(new Error('Could not download HLS library'));
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

  /*
   * Remove event listeners before resetting media.
   * Resetting a video can otherwise trigger stale errors.
   */
  if (
    activePlayback &&
    activePlayback.mediaCleanup
  ) {
    activePlayback.mediaCleanup();
    activePlayback.mediaCleanup = null;
  }

  if (activeHls) {
    var oldHls = activeHls;
    activeHls = null;

    try {
      oldHls.destroy();
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

  var oldSession = activePlayback;

  if (oldSession) {
    oldSession.cancelled = true;

    if (oldSession.cancelAttempt) {
      oldSession.cancelAttempt();
    }
  }

  destroyPlayer();
  activePlayback = null;
}

/* ================= PLAYER UI ================= */

function preparePlayerTop() {
  var top = document.getElementById('shtop');
  if (!top) return null;

  top.className = 'sh-top pl';
  top.removeAttribute('style');
  top.replaceChildren();

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

  if (status) {
    status.textContent = text;
  }
}

/* ================= MEDIA MOUNT ================= */

async function mountStream(stream, session, provider) {
  var run = session.run;

  if (!playerIsCurrent(run)) {
    throw new Error('Playback cancelled');
  }

  destroyPlayer();

  var top = preparePlayerTop();

  if (!top) {
    throw new Error('Player container missing');
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
      ' · Embedded player · Error inside? Use Retry.'
    );

    /*
     * iframe.onload cannot prove video playback.
     * Do not report this as verified playback.
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
      session.state.e < session.episodeCount
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

      if (session.cancelAttempt === cancelAttempt) {
        session.cancelAttempt = null;
      }
    }

    function cleanup() {
      if (disposed) return;
      disposed = true;

      clearWait();

      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onVideoError);

      if (localHls && typeof Hls !== 'undefined') {
        localHls.off(Hls.Events.ERROR, onHlsError);
      }
    }

    session.mediaCleanup = cleanup;

    function cancelAttempt() {
      if (settled) return;

      settled = true;
      clearWait();

      reject(new Error('Playback cancelled'));
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

      if (!lateReported) {
        lateReported = true;

        if (session.recoveries < 1) {
          var excluded = session.excluded.slice();

          if (excluded.indexOf(stream.url) < 0) {
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
            '. Try Retry or another server.',
            true
          );

          updatePlaybackStatus(error.message);
        }
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
          'Video failed to load' +
          (video.error
            ? ' (code ' + video.error.code + ')'
            : '')
        )
      );
    }

    function onHlsError(event, data) {
      if (disposed || !playerIsCurrent(run)) return;

      var status =
        data.response && data.response.code;

      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        data.fatal
      ) {
        reportError(
          new Error(
            status
              ? 'Media server HTTP ' + status
              : 'HLS error: ' + data.details
          )
        );
      }
    }

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onVideoError);

    (async function () {
      try {
        var nativeHls = video.canPlayType(
          'application/vnd.apple.mpegurl'
        );

        if (stream.type === 'hls' && !nativeHls) {
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
              'HLS is not supported in this browser'
            );
          }

          localHls = new Hls();
          activeHls = localHls;

          localHls.on(Hls.Events.ERROR, onHlsError);

          localHls.loadSource(stream.url);
          localHls.attachMedia(video);
        } else {
          video.src = stream.url;
          video.load();
        }

        var promise = video.play();

        if (promise && promise.catch) {
          promise.catch(function () {
            /*
             * Browser autoplay rejection is not a
             * broken stream. User can press Play.
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

/* ================= STREAM FALLBACK ================= */

async function startPlayback(session) {
  var anime = session.anime;
  var state = session.state;
  var run = session.run;

  var lastError = 'No usable stream returned';

  async function tryStream(stream, provider) {
    if (!playerIsCurrent(run)) return false;

    if (session.excluded.indexOf(stream.url) >= 0) {
      return false;
    }

    /*
     * This player does not implement custom manifest
     * decryption. Prefer the provider's returned embed.
     */
    if (
      stream.specialHls ||
      (
        provider === 'reanime' &&
        stream.type === 'hls'
      )
    ) {
      lastError =
        'This ReAnime/special HLS source needs a ' +
        'supported embed or custom backend integration';

      return false;
    }

    updatePlaybackStatus(
      'Loading source: ' + provider
    );

    try {
      var result = await mountStream(
        stream,
        session,
        provider
      );

      if (!playerIsCurrent(run)) return false;

      if (result.verified) {
        updatePlaybackStatus('Source: ' + provider);
        savePlaybackHistory(session);
      }

      return true;
    } catch (error) {
      if (!playerIsCurrent(run)) return false;

      lastError = error.message;

      console.warn(
        'Playback failed:',
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

  var seenStatic = new Set();

  for (var i = 0; i < staticUrls.length; i++) {
    if (!playerIsCurrent(run)) return;

    var staticUrl = safeStreamUrl(staticUrls[i]);

    if (!staticUrl || seenStatic.has(staticUrl)) {
      continue;
    }

    seenStatic.add(staticUrl);

    var staticStream = {
      url: staticUrl,
      type: inferStreamType(staticUrl),
      specialHls: false
    };

    if (await tryStream(staticStream, 'Saved source')) {
      return;
    }
  }

  var anilistId = anime[10] || anime.id;

  if (!anilistId) {
    if (playerIsCurrent(run)) {
      showPlayerMessage(
        'Video not found',
        'No AniList ID or working saved stream was found.',
        true
      );
    }
    return;
  }

  var providers = providerOrder(state.v);
  var audio = state.l === 'dub' ? 'dub' : 'sub';

  for (var p = 0; p < providers.length; p++) {
    var provider = providers[p];

    /*
     * Two attempts:
     * 1. Normal request.
     * 2. Fresh response after a short wait.
     *
     * This does not bypass upstream caching or
     * repair a missing backend route.
     */
    for (var attempt = 0; attempt < 2; attempt++) {
      if (!playerIsCurrent(run)) return;

      destroyPlayer();

      showPlayerMessage(
        attempt === 0
          ? 'Loading stream...'
          : 'Refreshing stream...',
        provider +
        ' · Provider ' + (p + 1) +
        '/' + providers.length +
        ' · Attempt ' + (attempt + 1) + '/2'
      );

      updatePlaybackStatus(
        'Trying ' + provider +
        (attempt ? ' again' : '')
      );

      if (attempt > 0) {
        await delay(900);
        if (!playerIsCurrent(run)) return;
      }

      try {
        var streams = await fetchProviderStreams(
          provider,
          anilistId,
          state.e,
          audio,
          attempt > 0
        );

        if (!playerIsCurrent(run)) return;

        var attemptedUrls = new Set();

        for (var j = 0; j < streams.length; j++) {
          if (!playerIsCurrent(run)) return;

          var stream = streams[j];

          if (attemptedUrls.has(stream.url)) {
            continue;
          }

          attemptedUrls.add(stream.url);

          if (await tryStream(stream, provider)) {
            return;
          }
        }
      } catch (error) {
        if (!playerIsCurrent(run)) return;

        lastError = error.message;

        console.warn(
          'Provider failed:',
          provider,
          error.message
        );

        /*
         * Do not repeat a route/client error on the
         * API itself. Media failure still gets the
         * fresh-response retry above.
         */
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
      '. The source or backend may need repair.',
      true
    );

    updatePlaybackStatus(lastError);
  }
}

function beginPlayback(
  anime,
  force,
  excluded,
  recoveries
) {
  var key = [
    SH.i,
    SH.s,
    SH.e,
    SH.l,
    SH.v
  ].join('|');

  if (!force && playbackKey === key) {
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
      v: SH.v
    },

    episodeCount: eN(),
    cancelled: false,
    historySaved: false,

    excluded: excluded || [],
    recoveries: recoveries || 0,

    cancelAttempt: null,
    mediaCleanup: null
  };

  activePlayback = session;

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

function openSheet(i) {
  stopPlayback();

  var a = ALL[i];
  if (!a) return;

  var p = U ? U.prefs : DP();
  var c = C[i % 5];

  var m = String(a[2] || '').split(' • ');
  var sh = document.getElementById('sheet');

  if (!sh) return;

  var bn = a[4] || a[3];

  SH = {
    i: i,
    s: 1,
    e: 1,
    l: p.lang,
    v: Number(p.srv) === 1 ? 1 : 0,
    play: 0,
    pg: 0
  };

  var bg = bn
    ? (
        'linear-gradient(to top,' +
        'rgba(12,12,20,.3),transparent),' +
        'url(' + cu(bn) + ') center/cover,#0c0c14'
      )
    : (
        'radial-gradient(85% 70% at 70% 0%,' +
        'rgba(' + c + ',.5),transparent 70%),' +
        'radial-gradient(60% 50% at 0% 100%,' +
        'rgba(233,196,106,.2),transparent 70%),#0c0c14'
      );

  sh.innerHTML =
    '<div class="sh-top" id="shtop" ' +
    'style="background:' + bg + '">' +

      '<button class="sh-x" onclick="closeSheet()" ' +
      'aria-label="Close">✕</button>' +

    '</div>' +

    '<div class="sh-b">' +

      '<div class="chips">' +
        '<span class="r">★ ' + a[0] + '</span>' +

        m.map(function (text) {
          return '<span>' + esc(text) + '</span>';
        }).join('') +

      '</div>' +

      '<h2>' + esc(a[1]) + '</h2>' +

      (
        a[7]
          ? '<p class="ds">' + esc(a[7]) + '</p>'
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

      '<div id="playback-tools" style="display:none;' +
      'margin:10px 0">' +

        '<small id="playback-status" ' +
        'style="display:block;margin-bottom:8px;' +
        'overflow-wrap:anywhere" aria-live="polite"></small>' +

        '<button class="btn sm" onclick="paint(true)">' +
          '↻ Retry / Refresh stream' +
        '</button>' +

      '</div>' +

      '<div id="np"></div>' +

      '<h4 id="eh" style="display:none">' +
        'EPISODES' +
      '</h4>' +

      '<div class="eps" id="eps"></div>' +
      '<div id="cm"></div>' +

    '</div>';

  sh.classList.remove('pm');
  sh.scrollTop = 0;
  sh.classList.add('on');

  var overlay = document.getElementById('ov');

  if (overlay) {
    overlay.classList.add('on');
  }

  document.body.style.overflow = 'hidden';

  paint();
  warmHlsLibrary();
}

function play(k) {
  if (k) {
    SH.e = Number(k);
    SH.pg = Math.floor((SH.e - 1) / PG);
  }

  SH.play = 1;
  paint();
}

function eN() {
  return EPN[ALL[SH.i][1]] || 12;
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

  if (index > -1) {
    U.list.splice(index, 1);
  } else {
    U.list.push(name);
  }

  save();
  decorate();
  mlbtn();
}

/* ================= RENDER ================= */

function paint(force) {
  var a = ALL[SH.i];
  if (!a) return;

  var n = eN();
  var ns = SEASONS[a[1]] || 3;
  var sh = document.getElementById('sheet');

  if (!sh) return;

  var pg = Math.min(
    SH.pg || 0,
    Math.floor((n - 1) / PG)
  );

  document.getElementById('eh').style.display =
    SH.play ? '' : 'none';

  var tools = document.getElementById('playback-tools');

  if (tools) {
    tools.style.display = SH.play ? '' : 'none';
  }

  if (!SH.play) {
    ['ctl', 'eps', 'cm', 'np'].forEach(function (id) {
      document.getElementById(id).innerHTML = '';
    });

    mlbtn();
    return;
  }

  var key = [
    SH.i,
    SH.s,
    SH.e,
    SH.l,
    SH.v
  ].join('|');

  var needsPlayback =
    force === true || key !== playbackKey;

  var options = '';
  var ranges = '';

  for (var i = 1; i <= ns; i++) {
    options +=
      '<option value="' + i + '"' +
      (i === SH.s ? ' selected' : '') +
      '>Season ' + i + '</option>';
  }

  if (n > PG) {
    for (var z = 0; z * PG < n; z++) {
      ranges +=
        '<option value="' + z + '"' +
        (z === pg ? ' selected' : '') +

        '>Ep ' + (z * PG + 1) +
        '–' + Math.min(n, (z + 1) * PG) +

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
    'onchange="SH.s=+this.value;SH.e=1;SH.pg=0;paint()" ' +
    'aria-label="Season">' +

      options +

    '</select>' +

    '<div class="seg">' +

      LANGS.map(function (x) {
        return (
          '<button class="' +
          (x[0] === SH.l ? 'on' : '') +

          '" onclick="SH.l=\'' +
          x[0] +
          '\';paint()">' +

          x[1] +

          '</button>'
        );
      }).join('') +

    '</div>' +

    '<div class="seg">' +

      [0, 1].map(function (server) {
        return (
          '<button class="' +
          (server === SH.v ? 'on' : '') +

          '" onclick="SH.v=' +
          server +
          ';paint(true)">' +

          'Server 0' + (server + 1) +

          '</button>'
        );
      }).join('') +

    '</div>' +

    ranges;

  var episodes = '';

  for (
    i = pg * PG + 1;
    i <= Math.min(n, pg * PG + PG);
    i++
  ) {
    episodes +=
      '<button class="' +
      (i === SH.e ? 'on' : '') +

      '" onclick="play(' + i + ')">' +

      i +

      '</button>';
  }

  document.getElementById('eps').innerHTML = episodes;

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
        (SH.e >= n ? 'disabled ' : '') +

        'onclick="play(' + (SH.e + 1) + ')">' +
        'Next ›</button>' +

      '</div>' +

    '</div>';

  mlbtn();

  /*
   * Preserve an unfinished comment when only the
   * episode-list page changes.
   */
  if (needsPlayback) {
    cmt();
  }

  sh.classList.add('pm');

  if (needsPlayback) {
    beginPlayback(a, force === true);
  }
}

/* ================= CARDS ================= */

function decorate() {
  document.querySelectorAll('.card').forEach(
    function (card, i) {
      var a = ALL[i];
      if (!a) return;

      var poster = card.querySelector('.poster');
      var bookmark = card.querySelector('.bm');

      if (
        poster &&
        hasVid(a[1]) &&
        !card.querySelector('.wbtn')
      ) {
        poster.classList.add('hv');

        var watch = document.createElement('button');

        watch.className = 'wbtn';
        watch.textContent = '▶ Watch';

        watch.onclick = function (event) {
          event.stopPropagation();
          openSheet(i);
          play();
        };

        poster.appendChild(watch);
      }

      if (bookmark) {
        bookmark.classList.toggle(
          'on',
          !!U && U.list.indexOf(a[1]) > -1
        );

        bookmark.onclick = function (event) {
          event.stopPropagation();
          toggleList(a[1]);
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
    ? list.map(function (comment, i) {
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

            '" onclick="likeC(' + i + ')">' +

            '♥ ' + likes.length +

            '</button>' +

            (
              U && comment.e === U.email
                ? (
                    '<button class="lk" ' +
                    'onclick="delC(' + i + ')">' +
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

function likeC(i) {
  if (!U) {
    authView('in');
    return;
  }

  var key = ck();
  var list = ls(key) || [];
  var comment = list[i];

  if (!comment) return;

  comment.l = comment.l || [];

  var index = comment.l.indexOf(U.email);

  if (index > -1) {
    comment.l.splice(index, 1);
  } else {
    comment.l.push(U.email);
  }

  ls(key, list);
  cmt();
}

function delC(i) {
  if (!U) return;

  var key = ck();
  var list = ls(key) || [];

  if (!list[i] || list[i].e !== U.email) {
    return;
  }

  list.splice(i, 1);

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
