/* ===== REPLACE YOUR ENTIRE SHARED JAVASCRIPT BLOCK WITH THIS ===== */

document.addEventListener('click', function (e) {
  if (!e.target.closest('.search')) sr.className = '';
});

document.querySelectorAll('.arr button').forEach(function (b) {
  b.onclick = function () {
    var r = document.getElementById(b.dataset.r);
    if (!r) return;

    r.scrollBy({
      left: Number(b.dataset.d) * r.clientWidth * 0.9,
      behavior: 'smooth'
    });
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

var activeHls = null;
var playerRun = 0;

var STREAM_API = 'https://anivexa-api-wi89.onrender.com';
var STREAM_PROVIDERS = [
  'anikoto',
  'reanime',
  'kaa',
  'senshi',
  'anizone',
  'aniwaves'
];

/* ===== PLAYER CLEANUP ===== */

function destroyPlayer() {
  if (activeHls) {
    try {
      activeHls.destroy();
    } catch (e) {
      console.warn(e);
    }
    activeHls = null;
  }

  var top = document.getElementById('shtop');
  if (!top) return;

  var video = top.querySelector('video');

  if (video) {
    video.onended = null;
    video.onerror = null;

    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (e) {}
  }
}

function stopPlayback() {
  playerRun++;
  destroyPlayer();
}

/*
 * Works with your existing closeSheet() function,
 * without requiring you to edit that function.
 */
var playerSheetObserver = new MutationObserver(function () {
  var sheet = document.getElementById('sheet');

  if (!sheet || !sheet.classList.contains('on')) {
    stopPlayback();
  }
});

var existingSheet = document.getElementById('sheet');

if (existingSheet) {
  playerSheetObserver.observe(existingSheet, {
    attributes: true,
    attributeFilter: ['class']
  });
}

/* ===== HLS LIBRARY ===== */

var hlsLibraryPromise = null;

function loadHlsLibrary() {
  if (typeof Hls !== 'undefined') {
    return Promise.resolve();
  }

  if (hlsLibraryPromise) return hlsLibraryPromise;

  hlsLibraryPromise = new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    var timer;

    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    script.async = true;

    function fail() {
      clearTimeout(timer);
      script.remove();
      hlsLibraryPromise = null;
      reject(new Error('Hls.js could not be loaded'));
    }

    script.onload = function () {
      clearTimeout(timer);

      if (typeof Hls !== 'undefined') {
        resolve();
      } else {
        fail();
      }
    };

    script.onerror = fail;
    timer = setTimeout(fail, 15000);

    document.head.appendChild(script);
  });

  return hlsLibraryPromise;
}

/* ===== API REQUEST ===== */

async function fetchWithTimeout(url, options) {
  options = options || {};

  var timeout = options.timeout || 15000;
  var controller = new AbortController();
  var id = setTimeout(function () {
    controller.abort();
  }, timeout);

  var fetchOptions = Object.assign({}, options);
  delete fetchOptions.timeout;
  fetchOptions.signal = controller.signal;

  try {
    return await fetch(url, fetchOptions);
  } finally {
    clearTimeout(id);
  }
}

/* ===== STREAM NORMALIZATION ===== */

function safeStreamUrl(value) {
  if (typeof value !== 'string') return '';

  try {
    var url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }

    return url.href;
  } catch (e) {
    return '';
  }
}

function inferStreamType(url, hint) {
  hint = String(hint || '').toLowerCase();

  if (hint === 'iframe' || hint === 'embed') return 'iframe';

  if (
    hint.indexOf('hls') !== -1 ||
    hint.indexOf('mpegurl') !== -1 ||
    /\.m3u8(?:[?#]|$)/i.test(url)
  ) {
    return 'hls';
  }

  if (
    hint.indexOf('video/') === 0 ||
    hint === 'video' ||
    /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url)
  ) {
    return 'video';
  }

  return 'iframe';
}

function normalizeStreams(data) {
  var result = [];
  var seen = new Set();

  function add(value, type) {
    var url = safeStreamUrl(value);
    if (!url) return;

    var key = type + ':' + url;
    if (seen.has(key)) return;

    seen.add(key);
    result.push({ type: type, url: url });
  }

  function visitObject(item) {
    if (!item) return;

    if (typeof item === 'string') {
      add(item, inferStreamType(item));
      return;
    }

    if (typeof item !== 'object') return;

    if (item.embedUrl) {
      add(item.embedUrl, 'iframe');
    }

    var url = item.url || item.file || item.src;

    if (url) {
      add(url, inferStreamType(url, item.type || item.format));
    }
  }

  if (Array.isArray(data)) {
    data.forEach(visitObject);
  } else if (data && typeof data === 'object') {
    visitObject(data);

    ['streams', 'sources'].forEach(function (key) {
      if (Array.isArray(data[key])) {
        data[key].forEach(visitObject);
      }
    });

    if (data.data && data.data !== data) {
      normalizeStreams(data.data).forEach(function (item) {
        add(item.url, item.type);
      });
    }
  }

  return result.sort(function (a, b) {
    var priority = { iframe: 0, hls: 1, video: 2 };
    return priority[a.type] - priority[b.type];
  });
}

async function fetchProviderStreams(provider, id, episode, audio) {
  /*
   * Retains the endpoint format from your original code.
   * If your API requires real episode IDs, this URL builder
   * must be changed using that API's actual response format.
   */
  var epId = provider + '-' + episode;

  var apiUrl =
    STREAM_API +
    '/watch/' + encodeURIComponent(provider) +
    '/' + encodeURIComponent(id) +
    '/' + encodeURIComponent(audio) +
    '/' + encodeURIComponent(epId);

  var response = await fetchWithTimeout(apiUrl, {
    timeout: 15000
  });

  if (!response.ok) {
    throw new Error(provider + ': API HTTP ' + response.status);
  }

  var data = await response.json();

  console.log('Stream API response:', provider, data);

  return normalizeStreams(data);
}

/* ===== EXISTING VIDEO HELPERS ===== */

function hasVid(n) {
  var a = VIDEOS[n];
  return !!a && Object.keys(a).length > 0;
}

function vurl(n, s, e, l, v) {
  var a = VIDEOS[n];
  var x = a && a[s] && a[s][e] && a[s][e][l];
  return x && x[v] || '';
}

function cu(u) {
  return encodeURI(u).replace(/[()']/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}

/* ===== PLAYER UI ===== */

function playerIsCurrent(run) {
  var sheet = document.getElementById('sheet');

  return (
    run === playerRun &&
    sheet &&
    sheet.classList.contains('on') &&
    SH.play
  );
}

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

  var text = document.createElement('small');
  text.textContent = detail || '';

  box.append(heading, text);

  if (retry) {
    var button = document.createElement('button');
    button.className = 'btn sm';
    button.textContent = 'Retry';

    button.onclick = function () {
      paint();
    };

    box.appendChild(button);
  }

  top.appendChild(box);
  appendPlayerClose(top);
}

/*
 * Resolves after video playback starts.
 * Rejects when loading fails or takes too long.
 *
 * An iframe's cross-origin playback state cannot be
 * reliably checked from this page.
 */
async function mountStream(stream, run, autoNext) {
  if (!playerIsCurrent(run)) {
    throw new Error('Playback cancelled');
  }

  destroyPlayer();

  var top = preparePlayerTop();
  if (!top) throw new Error('Player container missing');

  if (stream.type === 'iframe') {
    var frame = document.createElement('iframe');

    frame.src = stream.url;
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    frame.title = 'Video player';
    frame.style.cssText = 'width:100%;height:100%;border:0';

    top.appendChild(frame);
    appendPlayerClose(top);

    return;
  }

  var video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'width:100%;height:100%;background:#000';

  video.onended = function () {
    if (
      playerIsCurrent(run) &&
      autoNext &&
      U &&
      U.prefs.auto
    ) {
      play(SH.e + 1);
    }
  };

  top.appendChild(video);
  appendPlayerClose(top);

  return new Promise(function (resolve, reject) {
    var settled = false;
    var localHls = null;

    var timer = setTimeout(function () {
      fail(new Error('Stream loading timed out'));
    }, 25000);

    var cancelled = setInterval(function () {
      if (!playerIsCurrent(run)) {
        fail(new Error('Playback cancelled'));
      }
    }, 250);

    function clearChecks() {
      clearTimeout(timer);
      clearInterval(cancelled);
    }

    function succeed() {
      if (settled) return;
      settled = true;
      clearChecks();
      resolve();
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      clearChecks();

      if (localHls) {
        localHls.destroy();

        if (activeHls === localHls) {
          activeHls = null;
        }
      }

      reject(error);
    }

    video.addEventListener('loadeddata', succeed, { once: true });

    video.addEventListener('error', function () {
      var error = new Error(
        'Video failed to load' +
        (video.error ? ' (code ' + video.error.code + ')' : '')
      );

      if (!settled) {
        fail(error);
      } else if (playerIsCurrent(run)) {
        destroyPlayer();
        showPlayerMessage(
          'Playback stopped',
          'The media request failed. Try Retry or another server.',
          true
        );
      }
    });

    async function start() {
      try {
        if (
          stream.type === 'hls' &&
          !video.canPlayType('application/vnd.apple.mpegurl')
        ) {
          await loadHlsLibrary();

          if (settled || !playerIsCurrent(run)) {
            fail(new Error('Playback cancelled'));
            return;
          }

          if (!Hls.isSupported()) {
            throw new Error('HLS is not supported in this browser');
          }

          localHls = new Hls();
          activeHls = localHls;

          localHls.on(Hls.Events.ERROR, function (_, data) {
            if (!playerIsCurrent(run)) return;

            console.error('HLS error:', data);

            var status = data.response && data.response.code;

            if (status === 401 || status === 403 || data.fatal) {
              var error = new Error(
                status
                  ? 'Media server returned HTTP ' + status
                  : 'HLS failed: ' + data.details
              );

              if (!settled) {
                fail(error);
              } else {
                destroyPlayer();
                showPlayerMessage(
                  'Playback stopped',
                  error.message + '. Try Retry or another server.',
                  true
                );
              }
            }
          });

          localHls.loadSource(stream.url);
          localHls.attachMedia(video);
        } else {
          video.src = stream.url;
          video.load();
        }

        var promise = video.play();

        if (promise && promise.catch) {
          promise.catch(function () {
            // Autoplay rejection is not a broken stream.
          });
        }
      } catch (error) {
        fail(error);
      }
    }

    start();
  });
}

/* ===== SHEET ===== */

function openSheet(i) {
  stopPlayback();

  var a = ALL[i];
  var p = U ? U.prefs : DP();
  var c = C[i % 5];
  var m = a[2].split(' • ');
  var sh = document.getElementById('sheet');
  var bn = a[4] || a[3];

  SH = {
    i: i,
    s: 1,
    e: 1,
    l: p.lang,
    v: p.srv,
    play: 0,
    pg: 0
  };

  var bg = bn
    ? 'linear-gradient(to top,rgba(12,12,20,.3),transparent),url(' +
      cu(bn) + ') center/cover,#0c0c14'
    : 'radial-gradient(85% 70% at 70% 0%,rgba(' + c +
      ',.5),transparent 70%),radial-gradient(60% 50% at 0% 100%,' +
      'rgba(233,196,106,.2),transparent 70%),#0c0c14';

  sh.innerHTML =
    '<div class="sh-top" id="shtop" style="background:' + bg + '">' +
      '<button class="sh-x" onclick="closeSheet()" aria-label="Close">✕</button>' +
    '</div>' +
    '<div class="sh-b">' +
      '<div class="chips"><span class="r">★ ' + a[0] + '</span>' +
      m.map(function (text) {
        return '<span>' + esc(text) + '</span>';
      }).join('') +
      '</div>' +
      '<h2>' + esc(a[1]) + '</h2>' +
      (a[7] ? '<p class="ds">' + esc(a[7]) + '</p>' : '') +
      '<div class="acts">' +
        '<button class="btn" onclick="play()">▶ Watch Now</button>' +
        '<button class="btn g" id="ml" onclick="toggleList(ALL[SH.i][1])"></button>' +
      '</div>' +
      '<div id="ctl"></div>' +
      '<div id="np"></div>' +
      '<h4 id="eh" style="display:none">EPISODES</h4>' +
      '<div class="eps" id="eps"></div>' +
      '<div id="cm"></div>' +
    '</div>';

  sh.classList.remove('pm');
  sh.scrollTop = 0;
  sh.classList.add('on');

  document.getElementById('ov').classList.add('on');
  document.body.style.overflow = 'hidden';

  paint();
}

function play(k) {
  if (k) {
    SH.e = k;
    SH.pg = Math.floor((k - 1) / PG);
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

function toggleList(n) {
  if (!U) {
    authView('in');
    toast('Login to use My List');
    return;
  }

  var k = U.list.indexOf(n);

  if (k > -1) U.list.splice(k, 1);
  else U.list.push(n);

  save();
  decorate();
  mlbtn();
}

/* ===== STREAM SELECTION AND FALLBACK ===== */

async function startPlayback(a, state, run, episodeCount) {
  var lastError = 'No playable stream was returned.';
  var tried = new Set();

  async function tryStream(stream) {
    if (!playerIsCurrent(run)) return false;
    if (tried.has(stream.url)) return false;

    tried.add(stream.url);

    try {
      await mountStream(stream, run, state.e < episodeCount);
      return playerIsCurrent(run);
    } catch (error) {
      lastError = error.message;
      console.warn('Stream failed:', stream.url, error);
      return false;
    }
  }

  var staticUrls = [
    vurl(a[1], state.s, state.e, state.l, state.v),
    vurl(a[1], state.s, state.e, state.l, 1 - state.v)
  ];

  for (var i = 0; i < staticUrls.length; i++) {
    var staticUrl = safeStreamUrl(staticUrls[i]);

    if (staticUrl) {
      if (await tryStream({
        url: staticUrl,
        type: inferStreamType(staticUrl)
      })) {
        return true;
      }
    }

    if (!playerIsCurrent(run)) return false;
  }

  var anilistId = a[10] || a.id;

  if (!anilistId) {
    if (playerIsCurrent(run)) {
      showPlayerMessage(
        'Video not found',
        'This anime has no AniList ID or playable static URL.',
        true
      );
    }

    return false;
  }

  var providers = STREAM_PROVIDERS.slice();

  // Server 02 starts from the next provider.
  if (Number(state.v) === 1) {
    providers.push(providers.shift());
  }

  for (var p = 0; p < providers.length; p++) {
    if (!playerIsCurrent(run)) return false;

    destroyPlayer();

    showPlayerMessage(
      'Loading stream...',
      'Trying ' + providers[p] +
      ' (' + (p + 1) + '/' + providers.length + ')'
    );

    try {
      var streams = await fetchProviderStreams(
        providers[p],
        anilistId,
        state.e,
        state.l === 'dub' ? 'dub' : 'sub'
      );

      if (!playerIsCurrent(run)) return false;

      for (var j = 0; j < streams.length; j++) {
        if (await tryStream(streams[j])) return true;
        if (!playerIsCurrent(run)) return false;
      }
    } catch (error) {
      lastError = error.message;
      console.warn('Provider failed:', providers[p], error);
    }
  }

  if (playerIsCurrent(run)) {
    destroyPlayer();

    showPlayerMessage(
      'No playable stream found',
      lastError + '. Check the API response and media request in Network.',
      true
    );
  }

  return false;
}

/* ===== RENDER ===== */

async function paint() {
  var run = ++playerRun;
  destroyPlayer();

  var a = ALL[SH.i];
  if (!a) return;

  var n = eN();
  var ns = SEASONS[a[1]] || 3;
  var sh = document.getElementById('sheet');

  var pg = Math.min(
    SH.pg || 0,
    Math.floor((n - 1) / PG)
  );

  document.getElementById('eh').style.display = SH.play ? '' : 'none';

  if (!SH.play) {
    document.getElementById('ctl').innerHTML = '';
    document.getElementById('eps').innerHTML = '';
    document.getElementById('cm').innerHTML = '';
    document.getElementById('np').innerHTML = '';
    mlbtn();
    return;
  }

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
        '>Ep ' + (z * PG + 1) + '–' +
        Math.min(n, (z + 1) * PG) + '</option>';
    }

    ranges =
      '<select class="sel" onchange="SH.pg=+this.value;paint()" ' +
      'aria-label="Episode range">' + ranges + '</select>';
  }

  document.getElementById('ctl').innerHTML =
    '<select class="sel" ' +
    'onchange="SH.s=+this.value;SH.e=1;SH.pg=0;paint()" ' +
    'aria-label="Season">' + options + '</select>' +
    '<div class="seg">' +
    LANGS.map(function (x) {
      return (
        '<button class="' + (x[0] === SH.l ? 'on' : '') +
        '" onclick="SH.l=\'' + x[0] + '\';paint()">' +
        x[1] + '</button>'
      );
    }).join('') +
    '</div>' +
    '<div class="seg">' +
    [0, 1].map(function (v) {
      return (
        '<button class="' + (v === SH.v ? 'on' : '') +
        '" onclick="SH.v=' + v + ';paint()">' +
        'Server 0' + (v + 1) + '</button>'
      );
    }).join('') +
    '</div>' + ranges;

  var episodes = '';

  for (i = pg * PG + 1; i <= Math.min(n, pg * PG + PG); i++) {
    episodes +=
      '<button class="' + (i === SH.e ? 'on' : '') +
      '" onclick="play(' + i + ')">' + i + '</button>';
  }

  document.getElementById('eps').innerHTML = episodes;

  document.getElementById('np').innerHTML =
    '<div class="np">' +
      '<span>▶ S' + SH.s + ' · Episode ' + SH.e + '</span>' +
      '<div>' +
        '<button ' + (SH.e < 2 ? 'disabled ' : '') +
        'onclick="play(' + (SH.e - 1) + ')">‹ Prev</button>' +
        '<button ' + (SH.e >= n ? 'disabled ' : '') +
        'onclick="play(' + (SH.e + 1) + ')">Next ›</button>' +
      '</div>' +
    '</div>';

  mlbtn();
  cmt();
  sh.classList.add('pm');

  var state = {
    i: SH.i,
    s: SH.s,
    e: SH.e,
    l: SH.l,
    v: SH.v
  };

  var started = await startPlayback(a, state, run, n);

  if (!started || !playerIsCurrent(run)) return;

  if (U) {
    U.hist = U.hist.filter(function (h) {
      return !(
        h.n === a[1] &&
        h.s === state.s &&
        h.e === state.e
      );
    });

    U.hist.unshift({
      n: a[1],
      s: state.s,
      e: state.e
    });

    U.hist = U.hist.slice(0, 50);
    save();
  }
}

/* ===== CARDS ===== */

function decorate() {
  document.querySelectorAll('.card').forEach(function (card, i) {
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

      watch.onclick = function (e) {
        e.stopPropagation();
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

      bookmark.onclick = function (e) {
        e.stopPropagation();
        toggleList(a[1]);
      };
    }
  });
}

document.getElementById('mw').addEventListener('click', function (e) {
  if (e.target.id === 'mw') closeM();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeM();
});

/* ===== COMMENTS ===== */

function ck() {
  return 'akC:' + ALL[SH.i][1] + ':' + SH.s + ':' + SH.e;
}

function ago(t) {
  var s = (Date.now() - t) / 1000;

  return s < 60
    ? 'just now'
    : s < 3600
      ? Math.floor(s / 60) + 'm ago'
      : s < 86400
        ? Math.floor(s / 3600) + 'h ago'
        : Math.floor(s / 86400) + 'd ago';
}

function cmt() {
  var list = ls(ck()) || [];

  var html =
    '<h4>COMMENTS · S' + SH.s + ' E' + SH.e +
    ' <span class="cnt">' + list.length + '</span></h4>';

  html += U
    ? '<div class="cbox">' + av(U, 36) +
      '<textarea id="ct" maxlength="500" rows="2" ' +
      'placeholder="Write a comment..."></textarea>' +
      '<button class="btn sm" onclick="postC()">Post</button></div>'
    : '<button class="lnk" onclick="authView(\'in\')">' +
      'Login to join the discussion</button>';

  html += list.length
    ? list.map(function (comment, i) {
        var likes = comment.l || [];

        return (
          '<div class="cmt">' +
          av(USERS[comment.e] || {}, 34) +
          '<div><b>' + esc(comment.n) + '</b>' +
          '<small>' + ago(comment.t) + '</small>' +
          '<p>' + esc(comment.x) + '</p>' +
          '<button class="lk' +
          (U && likes.indexOf(U.email) > -1 ? ' on' : '') +
          '" onclick="likeC(' + i + ')">♥ ' +
          likes.length + '</button>' +
          (U && comment.e === U.email
            ? '<button class="lk" onclick="delC(' + i +
              ')">Delete</button>'
            : '') +
          '</div></div>'
        );
      }).join('')
    : '<p class="mu" style="margin-top:10px">' +
      'No comments yet. Be the first!</p>';

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

  if (index > -1) comment.l.splice(index, 1);
  else comment.l.push(U.email);

  ls(key, list);
  cmt();
}

function delC(i) {
  if (!U) return;

  var key = ck();
  var list = ls(key) || [];

  if (!list[i] || list[i].e !== U.email) return;

  list.splice(i, 1);
  ls(key, list);
  cmt();
}

/* ===== INITIALIZE ===== */

ub();
applyTheme();
decorate();
