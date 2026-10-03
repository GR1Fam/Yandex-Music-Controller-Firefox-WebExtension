(() => {
  if (window.__ymcContent) return;
  window.__ymcContent = true;

  const log = (...a) => console.log('[ymc]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PREFIX = Math.random().toString(36).slice(2, 8);
  const pending = new Map();
  let seq = 0;
  let bridgeMissAt = 0;

  function bridge(type, payload, timeout = 600) {
    if (bridgeMissAt && Date.now() - bridgeMissAt < 5000) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = PREFIX + ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        bridgeMissAt = Date.now();
        resolve(null);
      }, timeout);
      pending.set(id, (result) => {
        clearTimeout(timer);
        bridgeMissAt = 0;
        resolve(result);
      });
      window.postMessage({ src: 'YMC_REQ', id, type, payload: payload || {} }, '*');
    });
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.src === 'YMC_RES') {
      const cb = pending.get(ev.data.id);
      if (cb) {
        pending.delete(ev.data.id);
        cb(ev.data.result);
      }
    } else if (ev.data.src === 'YMC_EVT') {
      schedulePush();
    }
  });

  function queryFirst(selectors, root) {
    for (const sel of selectors) {
      try {
        const el = (root || document).querySelector(sel);
        if (el) return el;
      } catch (e) {
        log('bad selector', sel);
      }
    }
    return null;
  }

  function queryAllFirstHit(selectors, root) {
    for (const sel of selectors) {
      try {
        const list = (root || document).querySelectorAll(sel);
        if (list.length) return [...list];
      } catch (e) {
        log('bad selector', sel);
      }
    }
    return [];
  }

  function getPlayerRoot() {
    return queryFirst(PLAYER_ROOT_SELECTORS) || null;
  }

  function toClickable(el) {
    if (!el) return null;
    if (el.matches && el.matches('button,a,[role="button"]')) return el;
    return (el.closest && el.closest('button,[role="button"]')) || el;
  }

  function isLink(el) {
    return !!el && el.tagName === 'A' && !!el.getAttribute('href');
  }

  function findByAttrs(root, pattern) {
    if (!root || !pattern) return null;
    const nodes = root.querySelectorAll('button,[role="button"]');
    for (const n of nodes) {
      const label = (n.getAttribute('aria-label') || '') + '|' + (n.getAttribute('title') || '');
      const text = (n.textContent || '').trim();
      const testId = n.getAttribute('data-test-id') || '';
      if (testId && pattern.testId.test(testId)) return n;
      if (label.split('|').some((s) => s && pattern.label.test(s.trim()))) return n;
      if (text && text.length < 30 && pattern.label.test(text)) return n;
    }
    return null;
  }

  function findButton(selectors, pattern) {
    const root = getPlayerRoot();
    let el = null;
    if (root) el = queryFirst(selectors, root) || findByAttrs(root, pattern);
    else el = queryFirst(selectors.filter((s) => s.includes('data-test-id')));
    el = toClickable(el);
    return el && !isLink(el) ? el : null;
  }

  const findPlayButton = () => findButton(PLAY_BUTTON_SELECTORS, YMC_ATTR_PATTERNS.play);
  const findNextButton = () => findButton(NEXT_BUTTON_SELECTORS, YMC_ATTR_PATTERNS.next);
  const findPreviousButton = () => findButton(PREVIOUS_BUTTON_SELECTORS, YMC_ATTR_PATTERNS.prev);
  const findLikeButton = () => findButton(LIKE_BUTTON_SELECTORS, YMC_ATTR_PATTERNS.like);

  function cleanText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function findTrackTitle() {
    const el = queryFirst(TRACK_TITLE_SELECTORS, getPlayerRoot() || document) || queryFirst(TRACK_TITLE_SELECTORS);
    return el ? cleanText(el.textContent) : '';
  }

  function findArtist() {
    const root = getPlayerRoot() || document;
    let nodes = queryAllFirstHit(ARTIST_SELECTORS, root);
    if (!nodes.length) nodes = queryAllFirstHit(ARTIST_SELECTORS);
    return [...new Set(nodes.map((n) => cleanText(n.textContent)).filter(Boolean))].join(', ');
  }

  function findCover() {
    const el = queryFirst(COVER_SELECTORS, getPlayerRoot() || document) || queryFirst(COVER_SELECTORS);
    if (!el) return '';
    let src = el.currentSrc || el.src || '';
    if (!src && el.style && el.style.backgroundImage) {
      const m = /url\(["']?(.*?)["']?\)/.exec(el.style.backgroundImage);
      if (m) src = m[1];
    }
    if (src.startsWith('//')) src = 'https:' + src;
    return src;
  }

  function upscaleCover(url) {
    return url ? url.replace(/\/(\d+)x\1(?=($|\?))/, '/400x400') : '';
  }

  function domPlaying(btn) {
    if (!btn) return null;
    const use = btn.querySelector && btn.querySelector('use');
    const hay =
      (btn.getAttribute('aria-label') || '') +
      ' ' +
      (btn.getAttribute('title') || '') +
      ' ' +
      (use ? use.getAttribute('href') || use.getAttribute('xlink:href') || '' : '');
    if (YMC_PAUSE_LABEL.test(hay)) return true;
    if (YMC_PLAY_LABEL.test(hay)) return false;
    return null;
  }

  function domLiked(btn) {
    if (!btn) return null;
    const pressed = btn.getAttribute('aria-pressed') ?? btn.getAttribute('aria-checked');
    if (pressed === 'true') return true;
    if (pressed === 'false') return false;
    const label = (btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('title') || '');
    if (YMC_LIKED_LABEL.test(label)) return true;
    const cls = String(btn.className && btn.className.baseVal !== undefined ? btn.className.baseVal : btn.className || '');
    if (/(^|[\s_-])(active|liked|checked|pressed)([\s_-]|$)/i.test(cls)) return true;
    return null;
  }

  function detectLoggedIn() {
    for (const sel of LOGIN_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && /войти|log\s?in|sign\s?in/i.test(cleanText(el.textContent))) return false;
      } catch (_) {}
    }
    return null;
  }

  async function getPlayerState() {
    const res = await bridge('snapshot');
    const snap = (res && res.ok && res.snap) || {};
    const audio = snap.audio || null;
    const media = snap.media || null;
    const session = snap.session || { state: 'none', actions: [] };
    const ext = snap.ext || null;
    const actions = session.actions || [];

    const playBtn = findPlayButton();
    const nextBtn = findNextButton();
    const prevBtn = findPreviousButton();
    const likeBtn = findLikeButton();

    const title = (ext && ext.track && ext.track.title) || (media && media.title) || findTrackTitle() || '';
    const artist = (ext && ext.track && ext.track.artist) || (media && media.artist) || findArtist() || '';
    const rawCover = (ext && ext.track && ext.track.cover) || (media && media.cover) || findCover() || '';

    let playing = null;
    if (audio) playing = !audio.paused;
    else if (session.state === 'playing') playing = true;
    else if (session.state === 'paused') playing = false;
    else if (ext && typeof ext.playing === 'boolean') playing = ext.playing;
    else playing = domPlaying(playBtn);

    const position = audio ? audio.currentTime : ext && ext.progress ? ext.progress.position : 0;
    const duration = audio && audio.duration ? audio.duration : ext && ext.progress ? ext.progress.duration : 0;

    let liked = ext && ext.track ? ext.track.liked : null;
    if (liked === null || liked === undefined) liked = domLiked(likeBtn);

    const volume = audio ? audio.volume : ext && typeof ext.volume === 'number' ? ext.volume : null;
    const hasExt = !!(ext && ext.available);
    const hasPlayAction = actions.includes('play') || actions.includes('pause');

    const caps = {
      play: hasExt || hasPlayAction || !!playBtn || !!audio,
      next: hasExt || actions.includes('nexttrack') || !!nextBtn,
      prev: hasExt || actions.includes('previoustrack') || !!prevBtn,
      like: hasExt || !!likeBtn,
      seek: !!(audio && duration > 0),
      volume: !!audio || (hasExt && volume !== null),
      mute: !!audio
    };

    return {
      hasPlayer: !!(title || playBtn || audio || hasExt || hasPlayAction),
      track: { title, artist, cover: upscaleCover(rawCover), coverFallback: rawCover },
      playing,
      position: position || 0,
      duration: duration || 0,
      volume,
      muted: audio ? audio.muted : false,
      liked: liked === undefined ? null : liked,
      caps,
      loggedIn: detectLoggedIn(),
      source: audio ? 'audio' : hasExt ? 'externalAPI' : session.state !== 'none' ? 'session' : 'dom'
    };
  }

  async function waitForPlaying(expected, ms) {
    const steps = Math.ceil(ms / 100);
    for (let i = 0; i < steps; i++) {
      await sleep(100);
      const s = await getPlayerState();
      if (s.playing === expected) return true;
    }
    return false;
  }

  async function togglePlayback() {
    const st = await getPlayerState();
    const reliable = st.source === 'audio';
    const known = st.playing === true || st.playing === false;
    const expected = known ? !st.playing : undefined;
    const want = st.playing === true ? 'pause' : 'play';

    const attempts = [
      async () => {
        const r = await bridge('ext', { method: 'togglePause' });
        return !!(r && r.ok);
      },
      async () => {
        if (!known) return false;
        const r = await bridge('media', { action: want });
        return !!(r && r.ok);
      },
      async () => {
        const b = findPlayButton();
        if (!b) return false;
        b.click();
        return true;
      },
      async () => {
        if (!known) {
          const r = await bridge('audio', { op: 'play' });
          return !!(r && r.ok);
        }
        const r = await bridge('audio', { op: want });
        return !!(r && r.ok);
      }
    ];

    let performed = false;
    for (const attempt of attempts) {
      if (!(await attempt())) continue;
      performed = true;
      if (!reliable || expected === undefined) return { ok: true, expected };
      if (await waitForPlaying(expected, 700)) return { ok: true, expected };
    }
    return { ok: false, code: performed ? 'NOT_APPLIED' : 'NO_CONTROL', expected };
  }

  async function viaChain(extMethod, mediaAction, finder) {
    let r = await bridge('ext', { method: extMethod });
    if (r && r.ok) return { ok: true };
    if (mediaAction) {
      r = await bridge('media', { action: mediaAction });
      if (r && r.ok) return { ok: true };
    }
    const btn = finder && finder();
    if (btn) {
      btn.click();
      return { ok: true };
    }
    return { ok: false, code: 'BUTTON_NOT_FOUND' };
  }

  async function execute(cmd, payload) {
    switch (cmd) {
      case 'toggle':
        return togglePlayback();
      case 'next':
        return viaChain('next', 'nexttrack', findNextButton);
      case 'prev':
        return viaChain('prev', 'previoustrack', findPreviousButton);
      case 'like':
        return viaChain('toggleLike', null, findLikeButton);
      case 'seek': {
        const snap = await bridge('snapshot');
        const d = snap && snap.snap && snap.snap.audio ? snap.snap.audio.duration : 0;
        if (!d) return { ok: false, code: 'NO_DURATION' };
        const frac = Math.min(1, Math.max(0, Number(payload && payload.fraction) || 0));
        const r = await bridge('audio', { op: 'seek', value: frac * d });
        return r && r.ok ? { ok: true } : { ok: false, code: (r && r.code) || 'NO_AUDIO' };
      }
      case 'volume': {
        const v = Math.min(1, Math.max(0, Number(payload && payload.value) || 0));
        let r = await bridge('audio', { op: 'volume', value: v });
        if (r && r.ok) return { ok: true };
        r = await bridge('ext', { method: 'setVolume', args: [v] });
        return r && r.ok ? { ok: true } : { ok: false, code: 'NO_AUDIO' };
      }
      case 'mute': {
        const r = await bridge('audio', { op: 'mute' });
        return r && r.ok ? { ok: true } : { ok: false, code: 'NO_AUDIO' };
      }
      default:
        return { ok: false, code: 'UNKNOWN_COMMAND' };
    }
  }

  async function runCommand(cmd, payload) {
    let result;
    try {
      result = await execute(cmd, payload);
    } catch (e) {
      log('command failed', cmd, e);
      result = { ok: false, code: 'EXCEPTION' };
    }
    await sleep(180);
    const state = await getPlayerState();
    return { ok: result.ok, code: result.code, state };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'YMC_PING') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'YMC_GET_STATE') {
      getPlayerState()
        .then((state) => sendResponse({ ok: true, state }))
        .catch((e) => {
          log('state failed', e);
          sendResponse({ ok: false, code: 'STATE_FAILED' });
        });
      return true;
    }
    if (msg.type === 'YMC_CMD') {
      runCommand(msg.cmd, msg.payload)
        .then(sendResponse)
        .catch((e) => {
          log('cmd failed', e);
          sendResponse({ ok: false, code: 'EXCEPTION' });
        });
      return true;
    }
  });

  let pushTimer = null;
  let lastSig = '';
  let pushing = false;
  let observer = null;

  function schedulePush() {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushState();
    }, 1000);
  }

  async function pushState() {
    if (pushing) return;
    pushing = true;
    try {
      const state = await getPlayerState();
      const sig = [state.track.title, state.track.artist, state.playing].join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      await chrome.runtime.sendMessage({ type: 'YMC_STATE_PUSH', state });
    } catch (e) {
      log('push skipped', e && e.message);
      if (observer) observer.disconnect();
    } finally {
      pushing = false;
    }
  }

  try {
    observer = new MutationObserver(schedulePush);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (e) {
    log('observer unavailable', e);
  }

  schedulePush();
})();
