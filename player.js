<script>
/* =====================================================
   PLAYER + SHEET + COMMENTS
   Replace the previously shared code block with this.
   Requires your existing HTML, data and utility functions.
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
var activeSession = null;
var sessionNumber = 0;
var currentPlaybackKey = '';

var streamCache = new Map();
var pendingRequests = new Map();

var CACHE_TTL = 60000;
var CACHE_LIMIT = 40;

var hlsLibraryPromise = null;

/* ================= URL HELPERS ================= */

function safeStreamUrl(value) {
  if (typeof value !== 'string') return '';

  try {
    var url = new URL(value);

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

function streamType(url, hint) {
  hint = String(hint || '').toLowerCase();

  if (hint === 'iframe' || hint === 'embed') {
    return 'iframe';
  }

  if (
    /hls|mpegurl/.test(hint) ||
    /\.m3u8(?:[?#]|$)/i.test(url)
  ) {
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

function normalizeStreams(data) {
  var results = [];
  var seen = new Set();

  function add(value, type) {
    var url = safeStreamUrl(value);
    if (!url) return;

    var key = type + ':' + url;
    if (seen.has(key)) return;

    seen.add(key);

    results.push({
      url: url,
      type: type
    });
  }

  function visit(item, depth) {
    if (!item || depth > 4) return;

    if (typeof item === 'string') {
      add(item, streamType(item));
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(function (entry) {
        visit(entry, depth + 1);
      });

      return;
    }

    if (typeof item !== 'object') return;

    if (item.embedUrl) {
      add(item.embedUrl, 'iframe');
    }

    var url = item.url || item.file || item.src;

    if (url) {
      add(
        url,
        streamType(url, item.type || item.format)
      );
    }

    ['streams', 'sources', 'data'].forEach(function (key) {
      if (item[key]) {
        visit(item[key], depth + 1);
      }
    });
  }

  visit(data, 0);

  return results;
}

/* ================= API + CACHE ================= */

async function fetchWithTimeout(url, options) {
  options = options || {};

  var controller = new AbortController();
  var timeout = options.timeout || 12000;

  var settings = Object.assign({}, options);
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

function streamCacheKey(provider, id, episode, audio) {
  return [provider, id, episode, audio].join(':');
}

function cacheStreams(key, streams) {
  streamCache.delete(key);

  streamCache.set(key, {
    expires: Date.now() + CACHE_TTL,
    streams: streams
  });

  while (streamCache.size > CACHE_LIMIT) {
    var oldest = streamCache.keys().next().value;
    streamCache.delete(oldest);
  }
}

function fetchProviderStreams(
  provider,
  anilistId,
  episode,
  audio
) {
  var key = streamCacheKey(
    provider,
    anilistId,
    episode,
    audio
  );

  var cached = streamCache.get(key);

  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.streams);
  }

  if (cached) {
    streamCache.delete(key);
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  var request = (async function () {
    /*
     * Original API endpoint format retained.
     * Your API must actually support this episode-ID format.
     */
    var episodeId = provider + '-' + episode;

    var url =
      STREAM_API +
      '/watch/' + encodeURIComponent(provider) +
      '/' + encodeURIComponent(anilistId) +
      '/' + encodeURIComponent(audio) +
      '/' + encodeURIComponent(episodeId);

    var response = await fetchWithTimeout(url, {
      timeout: 12000
    });

    if (!response.ok) {
      throw new Error(
        provider + ': API HTTP ' + response.status
      );
    }

    var data = await response.json();
    var streams = normalizeStreams(data);

    if (!streams.length) {
      throw new Error(
        provider + ': no usable streams returned'
      );
    }

    cacheStreams(key, streams);

    return streams;
  })();

  pendingRequests.set(key, request);

  request.then(
    function () {
      pendingRequests.delete(key);
    },
    function () {
      pendingRequests.delete(key);
    }
  );

  return request;
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
    var completed = false;

    var timer = setTimeout(function () {
      finish(new Error('HLS library loading timed out'));
    }, 12000);

    function finish(error) {
      if (completed) return;
      completed = true;

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

function prepareHlsLibrary() {
  var video = document.createElement('video');

  if (
    !video.canPlayType('application/vnd.apple.mpegurl')
  ) {
    loadHlsLibrary().catch(function () {});
  }
}

/* ================= CLEANUP ================= */

function destroyPlayer() {
  if (activeHls) {
    try {
      activeHls.destroy();
    } catch (error) {}

    activeHls = null;
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

  var iframe = top.querySelector('iframe');

  if (iframe) {
    iframe.remove();
  }
}

function stopPlayback() {
  sessionNumber++;
  currentPlaybackKey = '';

  var oldSession = activeSession;
  activeSession = null;

  if (oldSession) {
    oldSession.cancelled = true;

    if (oldSession.cancelAttempt) {
      oldSession.cancelAttempt();
    }

    if (oldSession.wake) {
      oldSession.wake();
    }
  }

  destroyPlayer();
}

function isCurrentSession(session) {
  var sheet = document.getElementById('sheet');

  return (
    activeSession === session &&
    !session.cancelled &&
    session.id === sessionNumber &&
    SH.play &&
    sheet &&
    sheet.classList.contains('on')
  );
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

function addPlayerClose(top) {
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
  addPlayerClose(top);
}

/* ================= MEDIA PLAYBACK ================= */

async function mountStream(stream, session, lateFailure) {
  if (!isCurrentSession(session)) {
    throw new Error('Playback cancelled');
  }

  destroyPlayer();

  var top = preparePlayerTop();

  if (!top) {
    throw new Error('Player container missing');
  }

  if (stream.type === 'iframe') {
    var iframe = document.createElement('iframe');

    iframe.src = stream.url;
    iframe.title = 'Video player';

    iframe.allow =
      'autoplay; fullscreen; picture-in-picture';

    iframe.allowFullscreen = true;

    iframe.style.cssText =
      'width:100%;height:100%;border:0';

    top.appendChild(iframe);
    addPlayerClose(top);

    /*
     * An embedded cross-origin player's playback
     * cannot be verified by this page.
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
      isCurrentSession(session) &&
      U &&
      U.prefs.auto &&
      session.state.e < session.episodeCount
    ) {
      play(session.state.e + 1);
    }
  };

  top.appendChild(video);
  addPlayerClose(top);

  return new Promise(function (resolve, reject) {
    var settled = false;
    var lateErrorReported = false;
    var localHls = null;

    var timer = setTimeout(function () {
      reportError(new Error('Video loading timed out'));
    }, 16000);

    function cleanupWait() {
      clearTimeout(timer);

      if (session.cancelAttempt === cancelAttempt) {
        session.cancelAttempt = null;
      }
    }

    function cancelAttempt() {
      if (settled) return;

      settled = true;
      cleanupWait();

      reject(new Error('Playback cancelled'));
    }

    session.cancelAttempt = cancelAttempt;

    function reportError(error) {
      if (!isCurrentSession(session)) {
        cancelAttempt();
        return;
      }

      if (!settled) {
        settled = true;
        cleanupWait();

        if (localHls) {
          localHls.destroy();

          if (activeHls === localHls) {
            activeHls = null;
          }
        }

        reject(error);
        return;
      }

      if (!lateErrorReported) {
        lateErrorReported = true;
        lateFailure(error);
      }
    }

    video.addEventListener(
      'loadeddata',
      function () {
        if (settled) return;

        if (!isCurrentSession(session)) {
          cancelAttempt();
          return;
        }

        settled = true;
        cleanupWait();

        resolve({
          verified: true
        });
      },
      { once: true }
    );

    video.addEventListener('error', function () {
      reportError(
        new Error(
          'Video failed to load' +
          (video.error
            ? ' (code ' + video.error.code + ')'
            : '')
        )
      );
    });

    (async function () {
      try {
        var nativeHls = video.canPlayType(
          'application/vnd.apple.mpegurl'
        );

        if (stream.type === 'hls' && !nativeHls) {
          await loadHlsLibrary();

          if (
            settled ||
            !isCurrentSession(session)
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

          localHls.on(
            Hls.Events.ERROR,
            function (event, data) {
              if (!isCurrentSession(session)) return;

              var status =
                data.response && data.response.code;

              if (
                status === 401 ||
                status === 403 ||
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
          );

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
             * Autoplay rejection is not a stream error.
             * The user can press Play manually.
             */
          });
        }
      } catch (error) {
        reportError(error);
      }
    })();
  });
}

/* ================= STREAM SEARCH ================= */

function providerOrder(server) {
  var providers = STREAM_PROVIDERS.slice();

  if (Number(server) === 1) {
    providers.push(providers.shift());
  }

  return providers;
}

function rememberHistory(session) {
  if (
    session.historySaved ||
    !isCurrentSession(session) ||
    !U
  ) {
    return;
  }

  session.historySaved = true;

  var state = session.state;

  U.hist = (U.hist || []).filter(function (item) {
    return !(
      item.n === session.name &&
      item.s === state.s &&
      item.e === state.e
    );
  });

  U.hist.unshift({
    n: session.name,
    s: state.s,
    e: state.e
  });

  U.hist = U.hist.slice(0, 50);
  save();
}

async function searchAndPlay(session) {
  var queue = [];
  var providerIndex = 0;
  var runningWorkers = 0;
  var lastError = 'No usable stream returned';

  var triedUrls = new Set(session.skipUrls || []);

  function notify() {
    if (session.wake) {
      var wake = session.wake;
      session.wake = null;
      wake();
    }
  }

  async function worker() {
    runningWorkers++;

    try {
      while (
        providerIndex < session.providers.length &&
        isCurrentSession(session) &&
        !session.finished
      ) {
        /*
         * Limit how many unused provider responses
         * are kept ready.
         */
        while (
          queue.length >= 2 &&
          isCurrentSession(session) &&
          !session.finished
        ) {
          await new Promise(function (resolve) {
            setTimeout(resolve, 100);
          });
        }

        if (
          !isCurrentSession(session) ||
          session.finished
        ) {
          return;
        }

        var provider =
          session.providers[providerIndex++];

        if (!provider) return;

        var key = streamCacheKey(
          provider,
          session.anilistId,
          session.state.e,
          session.audio
        );

        try {
          var streams = await fetchProviderStreams(
            provider,
            session.anilistId,
            session.state.e,
            session.audio
          );

          if (
            isCurrentSession(session) &&
            !session.finished
          ) {
            queue.push({
              provider: provider,
              key: key,
              streams: streams
            });
          }
        } catch (error) {
          lastError = error.message;

          console.warn(
            'Provider failed:',
            provider,
            error.message
          );
        }

        notify();
      }
    } finally {
      runningWorkers--;
      notify();
    }
  }

  if (session.anilistId) {
    worker();
    worker();
  }

  var candidates = session.staticStreams.map(
    function (stream) {
      return {
        stream: stream,
        provider: 'Saved source',
        cacheKey: null
      };
    }
  );

  while (isCurrentSession(session)) {
    if (!candidates.length) {
      if (queue.length) {
        var batch = queue.shift();

        candidates = batch.streams.map(
          function (stream) {
            return {
              stream: stream,
              provider: batch.provider,
              cacheKey: batch.key
            };
          }
        );
      } else if (runningWorkers > 0) {
        showPlayerMessage(
          'Loading stream...',
          'Searching available providers...'
        );

        await new Promise(function (resolve) {
          session.wake = resolve;
        });

        continue;
      } else {
        break;
      }
    }

    var candidate = candidates.shift();

    if (!candidate) continue;

    var stream = candidate.stream;

    if (triedUrls.has(stream.url)) {
      continue;
    }

    triedUrls.add(stream.url);

    showPlayerMessage(
      'Loading video...',
      'Source: ' + candidate.provider
    );

    try {
      var result = await mountStream(
        stream,
        session,
        function (error) {
          if (!isCurrentSession(session)) return;

          if (candidate.cacheKey) {
            streamCache.delete(candidate.cacheKey);
          }

          if (session.recoveryCount >= 2) {
            destroyPlayer();

            showPlayerMessage(
              'Playback stopped',
              error.message +
                '. Try Retry or another server.',
              true
            );

            return;
          }

          startPlaybackSession(
            session.anime,
            true,
            Array.from(triedUrls),
            session.recoveryCount + 1
          );
        }
      );

      if (!isCurrentSession(session)) return;

      session.finished = true;

      if (result.verified) {
        rememberHistory(session);
      }

      return;
    } catch (error) {
      if (!isCurrentSession(session)) return;

      lastError = error.message;

      console.warn(
        'Stream failed:',
        candidate.provider,
        error.message
      );

      if (candidate.cacheKey) {
        streamCache.delete(candidate.cacheKey);
      }

      destroyPlayer();
    }
  }

  if (isCurrentSession(session)) {
    session.finished = true;
    destroyPlayer();

    showPlayerMessage(
      'No playable stream found',
      lastError +
        '. Try Retry or another server.',
      true
    );
  }
}

function startPlaybackSession(
  anime,
  force,
  skipUrls,
  recoveryCount
) {
  var key = [
    SH.i,
    SH.s,
    SH.e,
    SH.l,
    SH.v
  ].join('|');

  if (!force && currentPlaybackKey === key) {
    return;
  }

  stopPlayback();
  currentPlaybackKey = key;

  prepareHlsLibrary();

  var state = {
    i: SH.i,
    s: SH.s,
    e: SH.e,
    l: SH.l,
    v: SH.v
  };

  var staticStreams = [
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
  ].map(function (value) {
    var url = safeStreamUrl(value);

    return url
      ? {
          url: url,
          type: streamType(url)
        }
      : null;
  }).filter(Boolean);

  var anilistId = anime[10] || anime.id || null;

  var session = {
    id: sessionNumber,
    anime: anime,
    name: anime[1],
    anilistId: anilistId,
    state: state,
    audio: state.l === 'dub' ? 'dub' : 'sub',
    episodeCount: eN(),

    providers: anilistId
      ? providerOrder(state.v)
      : [],

    staticStreams: staticStreams,
    skipUrls: skipUrls || [],
    recoveryCount: recoveryCount || 0,

    cancelled: false,
    finished: false,
    historySaved: false,

    wake: null,
    cancelAttempt: null
  };

  activeSession = session;

  searchAndPlay(session).catch(function (error) {
    if (!isCurrentSession(session)) return;

    console.error('Player error:', error);

    showPlayerMessage(
      'Player error',
      error.message,
      true
    );
  });
}

/* ================= EXISTING DATA HELPERS ================= */

function hasVid(name) {
  var anime = VIDEOS[name];

  return (
    !!anime &&
    Object.keys(anime).length > 0
  );
}

function vurl(name, season, episode, language, server) {
  var anime = VIDEOS[name];

  var entry =
    anime &&
    anime[season] &&
    anime[season][episode] &&
    anime[season][episode][language];

  return entry && entry[server] || '';
}

function cu(url) {
  return encodeURI(url).replace(
    /[()']/g,
    function (character) {
      return (
        '%' +
        character.charCodeAt(0).toString(16)
      );
    }
  );
}

/* ================= SHEET ================= */

function openSheet(index) {
  stopPlayback();

  var anime = ALL[index];
  var preferences = U ? U.prefs : DP();

  var color = C[index % 5];
  var metadata = anime[2].split(' • ');

  var sheet = document.getElementById('sheet');
  var banner = anime[4] || anime[3];

  SH = {
    i: index,
    s: 1,
    e: 1,
    l: preferences.lang,
    v: preferences.srv,
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

      '<button class="sh-x" ' +
      'onclick="closeSheet()" aria-label="Close">✕</button>' +

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

  document.getElementById('ov').classList.add('on');

  document.body.style.overflow = 'hidden';

  paint();
  prepareHlsLibrary();
}

function play(episode) {
  if (episode) {
    SH.e = episode;
    SH.pg = Math.floor((episode - 1) / PG);
  }

  SH.play = 1;
  paint();
}

function eN() {
  return EPN[ALL[SH.i][1]] || 12;
}

function mlbtn() {
  var button = document.getElementById('ml');

  if (!button) return;

  button.textContent =
    U && U.list.indexOf(ALL[SH.i][1]) > -1
      ? '✓ In My List'
      : '+ My List';
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

/* ================= RENDER CONTROLS ================= */

function paint(force) {
  var anime = ALL[SH.i];
  if (!anime) return;

  var episodeCount = eN();
  var seasonCount = SEASONS[anime[1]] || 3;

  var sheet = document.getElementById('sheet');

  var page = Math.min(
    SH.pg || 0,
    Math.floor((episodeCount - 1) / PG)
  );

  document.getElementById('eh').style.display =
    SH.play ? '' : 'none';

  if (!SH.play) {
    ['ctl', 'eps', 'cm', 'np'].forEach(function (id) {
      document.getElementById(id).innerHTML = '';
    });

    mlbtn();
    return;
  }

  var seasons = '';
  var ranges = '';

  for (var season = 1; season <= seasonCount; season++) {
    seasons +=
      '<option value="' + season + '"' +
      (season === SH.s ? ' selected' : '') +
      '>Season ' + season + '</option>';
  }

  if (episodeCount > PG) {
    for (
      var range = 0;
      range * PG < episodeCount;
      range++
    ) {
      ranges +=
        '<option value="' + range + '"' +
        (range === page ? ' selected' : '') +
        '>Ep ' + (range * PG + 1) +
        '–' +
        Math.min(episodeCount, (range + 1) * PG) +
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

      seasons +

    '</select>' +

    '<div class="seg">' +

      LANGS.map(function (language) {
        return (
          '<button class="' +
          (language[0] === SH.l ? 'on' : '') +

          '" onclick="SH.l=\'' +
          language[0] +
          '\';paint()">' +

          language[1] +

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
          ';paint()">' +

          'Server 0' + (server + 1) +

          '</button>'
        );
      }).join('') +

    '</div>' +

    ranges;

  var episodes = '';

  for (
    var episode = page * PG + 1;
    episode <= Math.min(
      episodeCount,
      page * PG + PG
    );
    episode++
  ) {
    episodes +=
      '<button class="' +
      (episode === SH.e ? 'on' : '') +

      '" onclick="play(' + episode + ')">' +

      episode +

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
        (SH.e >= episodeCount ? 'disabled ' : '') +
        'onclick="play(' + (SH.e + 1) + ')">' +
        'Next ›</button>' +

      '</div>' +

    '</div>';

  mlbtn();
  cmt();

  sheet.classList.add('pm');

  if (force === true) {
    var anilistId = anime[10] || anime.id || '';
    var audio = SH.l === 'dub' ? 'dub' : 'sub';

    STREAM_PROVIDERS.forEach(function (provider) {
      streamCache.delete(
        streamCacheKey(
          provider,
          anilistId,
          SH.e,
          audio
        )
      );
    });
  }

  /*
   * Unchanged playback key means no video restart.
   * Episode range changes only redraw the controls.
   */
  startPlaybackSession(anime, force === true);
}

/* ================= CARDS ================= */

function decorate() {
  document.querySelectorAll('.card').forEach(
    function (card, index) {
      var anime = ALL[index];
      if (!anime) return;

      var poster = card.querySelector('.poster');
      var bookmark = card.querySelector('.bm');

      if (
        poster &&
        hasVid(anime[1]) &&
        !card.querySelector('.wbtn')
      ) {
        poster.classList.add('hv');

        var watch = document.createElement('button');

        watch.className = 'wbtn';
        watch.textContent = '▶ Watch';

        watch.onclick = function (event) {
          event.stopPropagation();
          openSheet(index);
          play();
        };

        poster.appendChild(watch);
      }

      if (bookmark) {
        bookmark.classList.toggle(
          'on',
          !!U && U.list.indexOf(anime[1]) > -1
        );

        bookmark.onclick = function (event) {
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
  var comments = ls(ck()) || [];

  var html =
    '<h4>COMMENTS · S' + SH.s +
    ' E' + SH.e +

    ' <span class="cnt">' +
    comments.length +
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

  html += comments.length
    ? comments.map(function (comment, index) {
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
  var comments = ls(key) || [];

  comments.unshift({
    e: U.email,
    n: U.name,
    x: text,
    t: Date.now(),
    l: []
  });

  ls(key, comments.slice(0, 100));
  cmt();
}

function likeC(index) {
  if (!U) {
    authView('in');
    return;
  }

  var key = ck();
  var comments = ls(key) || [];
  var comment = comments[index];

  if (!comment) return;

  comment.l = comment.l || [];

  var position = comment.l.indexOf(U.email);

  if (position > -1) {
    comment.l.splice(position, 1);
  } else {
    comment.l.push(U.email);
  }

  ls(key, comments);
  cmt();
}

function delC(index) {
  if (!U) return;

  var key = ck();
  var comments = ls(key) || [];

  if (
    !comments[index] ||
    comments[index].e !== U.email
  ) {
    return;
  }

  comments.splice(index, 1);

  ls(key, comments);
  cmt();
}

/* ================= EVENT HANDLERS ================= */

document.addEventListener('click', function (event) {
  if (!event.target.closest('.search')) {
    if (typeof sr !== 'undefined' && sr) {
      sr.className = '';
    }
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

document.querySelectorAll('.bm').forEach(
  function (button) {
    button.onclick = function (event) {
      event.stopPropagation();
      button.classList.toggle('on');
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

var playerSheetElement = document.getElementById('sheet');

if (playerSheetElement) {
  new MutationObserver(function () {
    if (
      !playerSheetElement.classList.contains('on')
    ) {
      stopPlayback();
    }
  }).observe(playerSheetElement, {
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

</script>
