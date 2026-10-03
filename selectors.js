var PLAYER_ROOT_SELECTORS = [
  '[data-test-id="PLAYERBAR_DESKTOP"]',
  '[class*="PlayerBarDesktop"]',
  '[class*="PlayerBar"]',
  '[class*="player-controls"]',
  '.bar-below',
  '[class*="Player_root"]'
];

var PLAY_BUTTON_SELECTORS = [
  '[data-test-id="PLAY_BUTTON"]',
  '[data-test-id="PLAYERBAR_DESKTOP_PLAY_BUTTON"]',
  '[data-test-id="PLAYERBAR_PLAY_BUTTON"]',
  'button[aria-label="Пауза"]',
  'button[aria-label="Играть"]',
  'button[aria-label="Воспроизвести"]',
  'button[aria-label="Слушать"]',
  'button[aria-label="Pause"]',
  'button[aria-label="Play"]',
  'button[class*="PlayButton"]',
  '.player-controls__btn_play'
];

var NEXT_BUTTON_SELECTORS = [
  '[data-test-id="NEXT_TRACK_BUTTON"]',
  '[data-test-id="PLAYERBAR_DESKTOP_NEXT_BUTTON"]',
  'button[aria-label="Следующий трек"]',
  'button[aria-label="Следующий"]',
  'button[aria-label="Next"]',
  '.player-controls__btn_next'
];

var PREVIOUS_BUTTON_SELECTORS = [
  '[data-test-id="PREVIOUS_TRACK_BUTTON"]',
  '[data-test-id="PLAYERBAR_DESKTOP_PREVIOUS_BUTTON"]',
  'button[aria-label="Предыдущий трек"]',
  'button[aria-label="Предыдущий"]',
  'button[aria-label="Previous"]',
  '.player-controls__btn_prev'
];

var LIKE_BUTTON_SELECTORS = [
  '[data-test-id="LIKE_BUTTON"]',
  '[data-test-id="PLAYERBAR_DESKTOP_LIKE_BUTTON"]',
  'button[aria-label="Нравится"]',
  'button[aria-label="Мне нравится"]',
  'button[aria-label="Like"]',
  '.player-controls__like .d-like',
  '.player-controls .d-like'
];

var TRACK_TITLE_SELECTORS = [
  '[data-test-id="TRACK_TITLE"]',
  '[class*="PlayerBar"] [class*="Meta_title"]',
  '[class*="Meta_title"]',
  '.player-controls__track .track__title',
  '.player-controls__track-name .track__title'
];

var ARTIST_SELECTORS = [
  '[data-test-id="SEPARATED_ARTIST_TITLE"]',
  '[class*="PlayerBar"] [class*="Meta_artistCaption"]',
  '[class*="Meta_artistCaption"]',
  '.player-controls__track .d-artists a',
  '.player-controls__artist .d-artists a'
];

var COVER_SELECTORS = [
  '[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img',
  '[class*="PlayerBar"] [class*="cover" i] img',
  '[class*="PlayerBar"] img[src*="avatars.yandex.net"]',
  '.player-controls__track .entity-cover__image',
  '.player-controls__track img'
];

var LOGIN_SELECTORS = [
  'a[href*="passport.yandex"]',
  '[data-test-id*="LOGIN" i]',
  'button[class*="Login"]'
];

var YMC_ATTR_PATTERNS = {
  play: { label: /^(играть|воспроизвести|слушать|пауза|приостановить|play|pause)$/i, testId: /(^|_)(play|pause)(_|$)/i },
  next: { label: /следующ|вперёд|вперед|^next/i, testId: /(^|_)next(_|$)/i },
  prev: { label: /предыдущ|^prev/i, testId: /(^|_)(prev|previous)(_|$)/i },
  like: { label: /нравится|лайк|^like|в избранное/i, testId: /(^|_)like(_|$)/i }
};

var YMC_PAUSE_LABEL = /пауза|приостановить|pause/i;
var YMC_PLAY_LABEL = /играть|воспроизвести|слушать|play/i;
var YMC_LIKED_LABEL = /убрать|удалить|не нравится|unlike|remove/i;
