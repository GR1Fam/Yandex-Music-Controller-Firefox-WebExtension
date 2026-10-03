const HOSTS = ['music.yandex.ru', 'music.yandex.com', 'music.yandex.by', 'music.yandex.kz', 'music.yandex.uz'];
const URL_PATTERNS = HOSTS.map((h) => `https://${h}/*`);
const HOME_URL = 'https://music.yandex.ru/';

const log = (...a) => console.log('[ymc bg]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function waitComplete(tabId, ms = 12000) {
  return new Promise((resolve) => {
    let finished = false;
    let timer;
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    function finish() {
      if (finished) return;
      finished = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(finish, ms);
    chrome.tabs
      .get(tabId)
      .then((t) => {
        if (t && t.status === 'complete') finish();
      })
      .catch(finish);
  });
}

async function pickTab() {
  const tabs = await chrome.tabs.query({ url: URL_PATTERNS });
  if (!tabs.length) return null;
  const { lastTabId } = await chrome.storage.local.get('lastTabId');
  const score = (t) => (t.audible ? 1e15 : 0) + (t.id === lastTabId ? 1e14 : 0) + (t.lastAccessed || 0);
  tabs.sort((a, b) => score(b) - score(a));
  return tabs[0];
}

function sendToTab(tabId, msg, ms = 3000) {
  return withTimeout(chrome.tabs.sendMessage(tabId, msg), ms);
}

async function prepareTab(tab) {
  try {
    if (tab.discarded) {
      await chrome.tabs.reload(tab.id);
      await waitComplete(tab.id);
      await sleep(500);
    } else if (tab.status === 'loading') {
      await waitComplete(tab.id);
    }
  } catch (e) {
    log('prepare failed', e && e.message);
  }
}

async function ensureContent(tab) {
  await prepareTab(tab);
  try {
    await sendToTab(tab.id, { type: 'YMC_PING' }, 800);
    return true;
  } catch (e) {
    log('ping failed, injecting', e && e.message);
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['main.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selectors.js', 'content.js'] });
    await sleep(150);
    await sendToTab(tab.id, { type: 'YMC_PING' }, 1000);
    return true;
  } catch (e) {
    log('inject failed', e && e.message);
    return false;
  }
}

async function rememberTab(tabId, state) {
  const data = { lastTabId: tabId, everConnected: true };
  if (state) data.lastState = state;
  await chrome.storage.local.set(data);
}

async function connect() {
  const tab = await pickTab();
  if (!tab) {
    const { everConnected } = await chrome.storage.local.get('everConnected');
    return { error: { status: 'DISCONNECTED', reason: everConnected ? 'closed' : 'never' } };
  }
  const ok = await ensureContent(tab);
  if (!ok) return { error: { status: 'ERROR', code: 'NO_CONTENT' } };
  return { tab };
}

function wrapState(state, extra) {
  if (!state || !state.hasPlayer) {
    return { status: 'ERROR', code: 'PLAYER_NOT_FOUND', state, loggedIn: state ? state.loggedIn : null, ...extra };
  }
  return { status: 'CONNECTED', state, ...extra };
}

async function handleGetState() {
  const c = await connect();
  if (c.error) return c.error;
  try {
    const res = await sendToTab(c.tab.id, { type: 'YMC_GET_STATE' });
    if (!res || !res.ok) return { status: 'ERROR', code: 'NO_CONTENT' };
    if (res.state && res.state.hasPlayer) await rememberTab(c.tab.id, res.state);
    return wrapState(res.state);
  } catch (e) {
    log('get state failed', e && e.message);
    return { status: 'ERROR', code: 'NO_CONTENT' };
  }
}

async function handleCmd(msg) {
  const c = await connect();
  if (c.error) return c.error;
  try {
    const res = await sendToTab(c.tab.id, { type: 'YMC_CMD', cmd: msg.cmd, payload: msg.payload }, 6000);
    if (!res) return { status: 'ERROR', code: 'NO_CONTENT' };
    if (res.state && res.state.hasPlayer) await rememberTab(c.tab.id, res.state);
    return wrapState(res.state, { ok: !!res.ok, cmdCode: res.code });
  } catch (e) {
    log('cmd failed', e && e.message);
    return { status: 'ERROR', code: 'NO_CONTENT' };
  }
}

async function handleOpen() {
  const tab = await pickTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return { status: 'CONNECTED', opened: 'focused' };
  }
  await chrome.tabs.create({ url: HOME_URL });
  return { status: 'DISCONNECTED', opened: 'created' };
}

async function handleOpenBackground() {
  const existing = await pickTab();
  if (existing) return { status: 'CONNECTED', opened: 'exists' };
  const created = await chrome.tabs.create({ url: HOME_URL, active: false, pinned: true });
  await waitComplete(created.id);
  await sleep(800);
  const found = await pickTab();
  if (!found) {
    await chrome.tabs.update(created.id, { active: true });
    return { status: 'DISCONNECTED', opened: 'login' };
  }
  return { status: 'DISCONNECTED', opened: 'background' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'YMC_STATE_PUSH') {
    if (sender.tab && msg.state && msg.state.hasPlayer) rememberTab(sender.tab.id, msg.state).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  const handlers = {
    YMC_GET_STATE: () => handleGetState(),
    YMC_CMD: () => handleCmd(msg),
    YMC_OPEN: () => handleOpen(),
    YMC_OPEN_BG: () => handleOpenBackground()
  };
  const handler = handlers[msg.type];
  if (!handler) return;

  handler()
    .then(sendResponse)
    .catch((e) => {
      log('handler crashed', msg.type, e);
      sendResponse({ status: 'ERROR', code: 'INTERNAL' });
    });
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { lastTabId } = await chrome.storage.local.get('lastTabId');
  if (tabId === lastTabId) await chrome.storage.local.remove(['lastTabId', 'lastState']);
});
