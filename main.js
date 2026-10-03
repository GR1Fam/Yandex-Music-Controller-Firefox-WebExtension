(() => {
  if (window.__ymcMain) return;
  window.__ymcMain = true;

  const SRC_REQ = 'YMC_REQ';
  const SRC_RES = 'YMC_RES';
  const SRC_EVT = 'YMC_EVT';
  const MEDIA_EVENTS = ['play', 'pause', 'ended', 'loadedmetadata', 'emptied', 'volumechange', 'durationchange'];
  const EXT_WHITELIST = ['togglePause', 'next', 'prev', 'toggleLike', 'toggleMute', 'setVolume', 'setPosition'];
  const MEDIA_ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack'];

  const tracked = new Set();
  const lastPlayed = new WeakMap();
  const handlers = {};
  let evtTimer = null;

  function emit() {
    clearTimeout(evtTimer);
    evtTimer = setTimeout(() => window.postMessage({ src: SRC_EVT, type: 'media' }, '*'), 150);
  }

  function track(el) {
    if (!(el instanceof HTMLMediaElement) || tracked.has(el)) return;
    tracked.add(el);
    MEDIA_EVENTS.forEach((name) => {
      el.addEventListener(
        name,
        () => {
          if (name === 'play') lastPlayed.set(el, Date.now());
          emit();
        },
        { passive: true }
      );
    });
  }

  try {
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      try {
        track(this);
        lastPlayed.set(this, Date.now());
      } catch (_) {}
      return origPlay.apply(this, arguments);
    };
  } catch (e) {
    console.log('[ymc main] play hook failed', e);
  }

  try {
    const proto = window.MediaSession && window.MediaSession.prototype;
    if (proto && typeof proto.setActionHandler === 'function') {
      const origSet = proto.setActionHandler;
      proto.setActionHandler = function (action, fn) {
        try {
          if (typeof fn === 'function') handlers[action] = fn;
          else delete handlers[action];
        } catch (_) {}
        return origSet.apply(this, arguments);
      };
    }
  } catch (e) {
    console.log('[ymc main] session hook failed', e);
  }

  function candidates() {
    document.querySelectorAll('audio').forEach(track);
    for (const el of [...tracked]) {
      if (!el.isConnected && !el.currentSrc && !el.src) tracked.delete(el);
    }
    return [...tracked];
  }

  function pickAudio() {
    const list = candidates().filter(
      (a) => (a.currentSrc || a.src || a.duration > 0) && !(a instanceof HTMLVideoElement && a.muted)
    );
    if (!list.length) return null;
    list.sort((a, b) => {
      const pa = a.paused ? 0 : 1;
      const pb = b.paused ? 0 : 1;
      if (pa !== pb) return pb - pa;
      const aa = a instanceof HTMLAudioElement ? 1 : 0;
      const ab = b instanceof HTMLAudioElement ? 1 : 0;
      if (aa !== ab) return ab - aa;
      return (lastPlayed.get(b) || 0) - (lastPlayed.get(a) || 0);
    });
    return list[0];
  }

  function readMediaSession() {
    try {
      const ms = navigator.mediaSession;
      const m = ms && ms.metadata;
      const session = { state: (ms && ms.playbackState) || 'none', actions: Object.keys(handlers) };
      if (!m || (!m.title && !m.artist)) return { session, media: null };
      let cover = '';
      let best = 0;
      for (const art of m.artwork || []) {
        const size = parseInt(String(art.sizes || '').split('x')[0], 10) || 1;
        if (art.src && size >= best) {
          best = size;
          cover = art.src;
        }
      }
      return { session, media: { title: m.title || '', artist: m.artist || '', album: m.album || '', cover } };
    } catch (_) {
      return { session: { state: 'none', actions: [] }, media: null };
    }
  }

  function ext() {
    const e = window.externalAPI;
    return e && typeof e === 'object' ? e : null;
  }

  function extCall(method, ...args) {
    const e = ext();
    if (!e || typeof e[method] !== 'function') return { ok: false };
    try {
      return { ok: true, value: e[method](...args) };
    } catch (err) {
      return { ok: false };
    }
  }

  function readExt() {
    if (!ext()) return null;
    const out = { available: true };
    try {
      const t = extCall('getCurrentTrack').value;
      if (t && typeof t === 'object') {
        let cover = typeof t.cover === 'string' ? t.cover : '';
        if (cover.includes('%%')) cover = 'https://' + cover.replace('%%', '400x400');
        out.track = {
          title: String(t.title || ''),
          artist: Array.isArray(t.artists) ? t.artists.map((a) => a && a.title).filter(Boolean).join(', ') : '',
          cover,
          liked: typeof t.liked === 'boolean' ? t.liked : null
        };
      }
      const p = extCall('getProgress').value;
      if (p && typeof p === 'object') out.progress = { position: Number(p.position) || 0, duration: Number(p.duration) || 0 };
      const playing = extCall('isPlaying');
      if (playing.ok && typeof playing.value === 'boolean') out.playing = playing.value;
      const vol = extCall('getVolume');
      if (vol.ok && typeof vol.value === 'number') out.volume = vol.value;
    } catch (_) {}
    return out;
  }

  function snapshot() {
    const a = pickAudio();
    const ms = readMediaSession();
    return {
      audio: a
        ? {
            paused: a.paused,
            currentTime: a.currentTime || 0,
            duration: Number.isFinite(a.duration) ? a.duration : 0,
            volume: a.volume,
            muted: a.muted
          }
        : null,
      media: ms.media,
      session: ms.session,
      ext: readExt()
    };
  }

  function audioOp(op, value) {
    const a = pickAudio();
    if (!a) return { ok: false, code: 'NO_AUDIO' };
    switch (op) {
      case 'play':
        a.play().catch((e) => console.log('[ymc main] play rejected', e));
        return { ok: true };
      case 'pause':
        a.pause();
        return { ok: true };
      case 'seek': {
        const d = Number.isFinite(a.duration) ? a.duration : 0;
        if (!d) return { ok: false, code: 'NO_DURATION' };
        a.currentTime = Math.min(Math.max(0, value), d);
        return { ok: true };
      }
      case 'volume':
        a.volume = Math.min(1, Math.max(0, value));
        if (a.volume > 0) a.muted = false;
        return { ok: true };
      case 'mute':
        a.muted = !a.muted;
        return { ok: true };
      default:
        return { ok: false, code: 'BAD_OP' };
    }
  }

  function mediaAction(action) {
    if (!MEDIA_ACTIONS.includes(action)) return { ok: false, code: 'BAD_ACTION' };
    const fn = handlers[action];
    if (typeof fn !== 'function') return { ok: false, code: 'NO_HANDLER' };
    try {
      fn({ action });
      return { ok: true };
    } catch (e) {
      console.log('[ymc main] handler threw', e);
      return { ok: false, code: 'HANDLER_FAILED' };
    }
  }

  function handle(type, payload) {
    switch (type) {
      case 'ping':
        return { ok: true };
      case 'snapshot':
        return { ok: true, snap: snapshot() };
      case 'ext':
        if (!EXT_WHITELIST.includes(payload.method)) return { ok: false, code: 'BAD_METHOD' };
        return extCall(payload.method, ...(Array.isArray(payload.args) ? payload.args : [])).ok
          ? { ok: true }
          : { ok: false, code: 'NO_EXTERNAL_API' };
      case 'media':
        return mediaAction(payload.action);
      case 'audio':
        return audioOp(payload.op, payload.value);
      default:
        return { ok: false, code: 'UNKNOWN' };
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.src !== SRC_REQ) return;
    const { id, type, payload } = ev.data;
    let result;
    try {
      result = handle(type, payload || {});
    } catch (err) {
      console.log('[ymc main] error', err);
      result = { ok: false, code: 'EXCEPTION' };
    }
    window.postMessage({ src: SRC_RES, id, result }, '*');
  });
})();
