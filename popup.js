(() => {
  const $ = (id) => document.getElementById(id);

  const views = { loading: $('view-loading'), off: $('view-off'), problem: $('view-problem'), player: $('view-player') };
  const el = {
    status: $('status'), statusText: $('status-text'), loadingText: $('loading-text'),
    offTitle: $('off-title'), offText: $('off-text'),
    problemTitle: $('problem-title'), problemText: $('problem-text'),
    glow: $('glow'), coverImg: $('cover-img'),
    title: $('title'), artist: $('artist'), now: $('now'),
    seek: $('seek'), seekWrap: $('seek-wrap'), tCur: $('t-cur'), tDur: $('t-dur'),
    play: $('btn-play'), prev: $('btn-prev'), next: $('btn-next'),
    icoPlay: $('ico-play'), icoPause: $('ico-pause'),
    like: $('btn-like'), mute: $('btn-mute'), volume: $('volume'),
    volWaves: $('vol-waves'), volX: $('vol-x'), toast: $('toast')
  };

  const STATUS_TEXT = { connected: 'Подключено', searching: '', disconnected: 'Не подключено', error: 'Ошибка' };
  const TOAST_TEXT = {
    BUTTON_NOT_FOUND: 'Не нашли кнопку в плеере. Возможно, интерфейс Яндекс Музыки изменился (см. README).',
    NO_CONTROL: 'Плеер не отвечает. Запустите любой трек на вкладке Яндекс Музыки.',
    NO_AUDIO: 'Звук ещё не загружен. Запустите трек на вкладке Яндекс Музыки.',
    NO_DURATION: 'Перемотка недоступна для этого трека.',
    NOT_APPLIED: 'Плеер не отреагировал на команду. Попробуйте ещё раз.',
    DEFAULT: 'Не получилось выполнить команду. Попробуйте ещё раз.'
  };

  let dragging = false;
  let volDragging = false;
  let busy = false;
  let pollTimer = null;
  let volTimer = null;
  let toastTimer = null;
  let current = null;

  const log = (...a) => console.log('[ymc popup]', ...a);

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) {
            log('sendMessage error:', chrome.runtime.lastError.message);
            resolve({ status: 'ERROR', code: 'NO_BACKGROUND' });
          } else {
            resolve(res || { status: 'ERROR', code: 'EMPTY' });
          }
        });
      } catch (e) {
        log('sendMessage threw:', e);
        resolve({ status: 'ERROR', code: 'NO_BACKGROUND' });
      }
    });
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function setRange(input, value01) {
    input.value = String(Math.round(value01 * Number(input.max)));
    input.style.setProperty('--p', (value01 * 100).toFixed(1) + '%');
  }

  function toast(code) {
    el.toast.textContent = TOAST_TEXT[code] || TOAST_TEXT.DEFAULT;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), 3500);
  }

  function setStatus(state) {
    el.status.dataset.state = state;
    el.statusText.textContent = STATUS_TEXT[state];
  }

  function show(name) {
    Object.entries(views).forEach(([k, v]) => (v.hidden = k !== name));
  }

  function showIcon(node, visible) {
    node.style.display = visible ? 'block' : 'none';
  }

  function setPlayIcon(playing) {
    showIcon(el.icoPlay, !playing);
    showIcon(el.icoPause, playing);
    el.play.setAttribute('aria-label', playing ? 'Пауза' : 'Играть');
  }

  function renderPlayer(state) {
    current = state;
    el.title.textContent = state.track.title || 'Ничего не играет';
    el.title.title = state.track.title || '';
    el.artist.textContent = state.track.artist || '';
    el.now.textContent = state.playing === true ? 'Играет' : state.playing === false && state.track.title ? 'На паузе' : '';

    const cover = state.track.cover;
    if (cover) {
      if (el.coverImg.dataset.src !== cover) {
        el.coverImg.dataset.src = cover;
        el.coverImg.onerror = () => {
          if (state.track.coverFallback && el.coverImg.src !== state.track.coverFallback) {
            el.coverImg.src = state.track.coverFallback;
          } else {
            el.coverImg.hidden = true;
            el.glow.style.backgroundImage = '';
          }
        };
        el.coverImg.onload = () => {
          el.coverImg.hidden = false;
          el.glow.style.backgroundImage = `url("${el.coverImg.src}")`;
        };
        el.coverImg.src = cover;
      }
    } else {
      el.coverImg.dataset.src = '';
      el.coverImg.removeAttribute('src');
      el.coverImg.hidden = true;
      el.glow.style.backgroundImage = '';
    }

    setPlayIcon(state.playing === true);

    const caps = state.caps || {};
    el.play.disabled = !caps.play;
    el.prev.disabled = !caps.prev;
    el.next.disabled = !caps.next;
    el.like.hidden = !caps.like;
    el.mute.hidden = !caps.mute;
    el.volume.hidden = !caps.volume;
    el.seekWrap.style.visibility = caps.seek ? 'visible' : 'hidden';

    if (!dragging) {
      const frac = state.duration > 0 ? Math.min(1, state.position / state.duration) : 0;
      setRange(el.seek, frac);
      el.tCur.textContent = fmt(state.position);
    }
    el.tDur.textContent = state.duration > 0 ? fmt(state.duration) : '0:00';

    el.like.setAttribute('aria-pressed', state.liked === true ? 'true' : 'false');

    if (!volDragging && state.volume !== null && state.volume !== undefined) setRange(el.volume, state.muted ? 0 : state.volume);
    showIcon(el.volX, !!state.muted);
    showIcon(el.volWaves, !state.muted);
  }

  function render(res) {
    switch (res.status) {
      case 'CONNECTED':
        setStatus('connected');
        show('player');
        renderPlayer(res.state);
        break;
      case 'DISCONNECTED':
        setStatus('disconnected');
        show('off');
        if (res.reason === 'closed') {
          el.offTitle.textContent = 'Откройте Яндекс Музыку в браузере';
          el.offText.textContent = 'Вкладка с плеером закрыта. Запустите её в фоне — вход в аккаунт сохранится, повторно входить не нужно.';
        } else {
          el.offTitle.textContent = 'Яндекс Музыка не подключена';
          el.offText.textContent = 'Войдите в аккаунт один раз на сайте Яндекс Музыки. Дальше вкладку можно запускать в фоне прямо отсюда.';
        }
        break;
      default: {
        setStatus('error');
        show('problem');
        if (res.code === 'PLAYER_NOT_FOUND') {
          el.problemTitle.textContent = 'Не удалось обнаружить плеер';
          el.problemText.textContent =
            res.loggedIn === false
              ? 'Похоже, вы не вошли в аккаунт. Войдите на сайте Яндекс Музыки и запустите любой трек.'
              : 'Запустите любой трек на вкладке Яндекс Музыки. Если плеер уже играет — интерфейс сайта мог измениться (см. README).';
        } else if (res.code === 'NO_CONTENT') {
          el.problemTitle.textContent = 'Нет связи со вкладкой';
          el.problemText.textContent = 'Обновите вкладку Яндекс Музыки (F5) и проверьте снова.';
        } else {
          el.problemTitle.textContent = 'Что-то пошло не так';
          el.problemText.textContent = 'Закройте и снова откройте popup. Если не помогло — перезагрузите расширение.';
        }
      }
    }
  }

  async function tick() {
    if (document.hidden) return schedule(2000);
    if (!busy) {
      const res = await send({ type: 'YMC_GET_STATE' });
      if (!busy) render(res);
      schedule(res.status === 'CONNECTED' ? 1000 : 3000);
    } else {
      schedule(500);
    }
  }

  function schedule(ms) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, ms);
  }

  async function refreshNow(text) {
    clearTimeout(pollTimer);
    el.loadingText.textContent = text || 'Подключаемся…';
    show('loading');
    await tick();
  }

  async function command(cmd, payload) {
    busy = true;
    try {
      const res = await send({ type: 'YMC_CMD', cmd, payload });
      render(res);
      if (res.status === 'CONNECTED' && res.ok === false) toast(res.cmdCode);
    } finally {
      busy = false;
    }
  }

  el.play.addEventListener('click', () => {
    if (current && (current.playing === true || current.playing === false)) setPlayIcon(!current.playing);
    command('toggle');
  });
  el.prev.addEventListener('click', () => command('prev'));
  el.next.addEventListener('click', () => command('next'));
  el.like.addEventListener('click', () => command('like'));
  el.mute.addEventListener('click', () => command('mute'));

  el.seek.addEventListener('pointerdown', () => (dragging = true));
  el.seek.addEventListener('input', () => {
    const frac = Number(el.seek.value) / Number(el.seek.max);
    el.seek.style.setProperty('--p', (frac * 100).toFixed(1) + '%');
    if (current) el.tCur.textContent = fmt(frac * current.duration);
  });
  el.seek.addEventListener('change', async () => {
    await command('seek', { fraction: Number(el.seek.value) / Number(el.seek.max) });
    dragging = false;
  });

  el.volume.addEventListener('pointerdown', () => (volDragging = true));
  el.volume.addEventListener('input', () => {
    const v = Number(el.volume.value) / 100;
    el.volume.style.setProperty('--p', (v * 100).toFixed(0) + '%');
    clearTimeout(volTimer);
    volTimer = setTimeout(() => send({ type: 'YMC_CMD', cmd: 'volume', payload: { value: v } }), 80);
  });
  el.volume.addEventListener('change', () => setTimeout(() => (volDragging = false), 300));

  async function openOrFocus() {
    await send({ type: 'YMC_OPEN' });
    window.close();
  }

  async function startInBackground() {
    clearTimeout(pollTimer);
    el.loadingText.textContent = 'Запускаем Яндекс Музыку в фоне…';
    show('loading');
    setStatus('searching');
    await send({ type: 'YMC_OPEN_BG' });
    await tick();
  }

  $('btn-open').addEventListener('click', openOrFocus);
  $('btn-show-tab').addEventListener('click', openOrFocus);
  $('btn-open-tab').addEventListener('click', openOrFocus);
  $('btn-open-bg').addEventListener('click', startInBackground);
  $('btn-retry').addEventListener('click', () => refreshNow());

  (async function init() {
    try {
      const { lastState } = await chrome.storage.local.get('lastState');
      if (lastState && lastState.hasPlayer) {
        setStatus('connected');
        show('player');
        renderPlayer(lastState);
      } else {
        setStatus('searching');
        show('loading');
      }
    } catch (e) {
      log('cache read failed', e);
    }
    tick();
  })();
})();
