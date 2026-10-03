⚠️ ПОСЛЕ СКАЧИВАНИЯ ПРОЕКТА СОЗДАЙТЕ В КОРНЕВОЙ ПАПКЕ ПРОЕКТА ПАПКУ С НАЗВАНИЕМ icons И ПОМЕСТИТЕ В НЕЁ НЕОБХОДИМЫЕ ФАЙЛЫ ИКОНОК. 
⚠️ AFTER DOWNLOADING THE PROJECT, CREATE A FOLDER NAMED icons IN THE ROOT PROJECT DIRECTORY AND PLACE THE REQUIRED ICON FILES INSIDE IT.

Для стабильной работы расширения рекомендуется открыть и держать Яндекс Музыку фоновом режиме.
For stable extension performance, it is recommended to open and keep Yandex Music in the background.

# Пульт для Яндекс Музыки

Расширение для Firefox и всех WebExtension поддерживающих браузеров: управление Яндекс Музыкой из popup на любой вкладке. HTML, CSS, JavaScript, без сборки.

## Установка

1. `chrome://extensions` → Developer mode → Load unpacked → папка проекта.
2. Откройте https://music.yandex.ru/, войдите в аккаунт, запустите трек.
3. После каждого обновления расширения: перезагрузить его на `chrome://extensions` и **обновить вкладку Яндекс Музыки (F5)**. Часть перехватчиков ставится при загрузке страницы.

## Как пользоваться без постоянно открытой вкладки

Публичного API у Яндекс Музыки нет, поэтому расширение управляет веб-плеером в открытой вкладке. Чтобы она не мешала:

- В popup кнопка **«Запустить в фоне»** открывает Музыку закреплённой неактивной вкладкой. Вход в аккаунт сохраняется в браузере, повторять его не нужно.
- Если Chrome выгрузил вкладку из памяти, расширение само перезагрузит её при открытии popup.
- Если сайт перекинул на страницу входа, вкладка будет показана.

Закрытую вкладку заменить нечем: без неё воспроизведение останавливается.

## Приложение Яндекс Музыки для ПК

Расширение не может напрямую общаться с десктопным приложением. Для этого нужен Native Messaging: маленькая программа на компьютере, которую расширение вызывает по имени. Она может отправлять системные медиаклавиши (play/pause/next/prev), но не получает название трека и обложку. В проект это не включено.

## Архитектура

```
popup.js → background.js → content.js ⇄ main.js
```

- `popup.*` — интерфейс, опрос состояния раз в секунду, пока popup открыт.
- `background.js` — выбор вкладки, запуск в фоне, перезагрузка выгруженных вкладок, внедрение скриптов в уже открытые вкладки, кэш последнего трека.
- `content.js` — чтение состояния и команды.
- `main.js` — работает в мире страницы: `<audio>`, `navigator.mediaSession`, обработчики медиаклавиш, `window.externalAPI` (если есть).
- `selectors.js` — все селекторы.

Порядок источников:

| Что | Порядок |
|---|---|
| Название, исполнитель, обложка | externalAPI → mediaSession → DOM |
| Играет / Пауза | `<audio>` → mediaSession.playbackState → externalAPI → подпись кнопки |
| Play/Pause | externalAPI → обработчик медиаклавиши страницы → кнопка в плеере → `<audio>` |
| Next, Prev | externalAPI → обработчик медиаклавиши → кнопка в плеере |
| Like | externalAPI → кнопка в плеере |
| Seek, громкость, mute | `<audio>` |

Для Play/Pause каждый способ проверяется по факту: если состояние плеера не изменилось, пробуется следующий. Если не сработал ни один, popup покажет сообщение.

Кнопки ищутся только внутри блока плеера (`PLAYER_ROOT_SELECTORS`). Если блок не найден, используются только селекторы по `data-test-id`. Ссылки не нажимаются.

## Permissions

| Permission | Зачем |
|---|---|
| host `music.yandex.ru/.com/.by/.kz/.uz` | content scripts и поиск вкладок |
| `storage` | последняя вкладка и последний трек |
| `scripting` | подключение к вкладке, открытой до установки |

## Если кнопки перестали работать

1. На вкладке Музыки: правый клик по кнопке → Inspect, посмотреть `data-test-id`, `aria-label`, класс.
2. Добавить селектор в начало нужного массива в `selectors.js`.
3. Перезагрузить расширение и обновить вкладку Музыки.

Логи: консоль вкладки Музыки (фильтр `ymc`), service worker на `chrome://extensions`, popup (правый клик → Inspect).

## Ограничения

- Данная версия расширения предназначена для Mozilla Firefox и браузеров на его основе, поддерживающих WebExtensions.
Mozilla Firefox
Firefox Developer Edition
Firefox ESR
Другие Firefox-based браузеры с поддержкой WebExtensions.
- Селекторы нового интерфейса не проверялись на живом аккаунте. Play/Pause, Next и Prev должны работать и без них через медиаклавиши страницы, если она их регистрирует.
- Состояние лайка определяется по `aria-pressed`, подписи или классу. Если определить нельзя, кнопка работает, но выглядит ненажатой.
- Перемотка и громкость работают, когда найден `<audio>`.
- Расширение неофициальное.

## 👤 Author

**gr1f888**

This project was created and developed by **gr1f888** with the assistance of **Claude Code**.

AI was used as a development tool for generating, debugging, improving, and structuring parts of the project. The concept, requirements, testing, evaluation, and final decisions were made by the author.

## © Copyright

Copyright © 2026 **gr1f888**. All rights reserved.

The source code and materials in this repository are provided for viewing and reference purposes.

You may not claim this project or its source code as your own, redistribute it as your own project, or remove the original author attribution without permission.

For permission to reuse, modify, redistribute, or incorporate the source code into another project, please contact the author.