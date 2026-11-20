# Compatibility

This document lists what the plugin expects from DSH, what happens when one of
those expectations stops holding, and what to change in the code. It is the
maintainer's checklist for a DSH update; the user-facing requirements are in
[README.md](../README.md).

## Version range

| What | Range |
| --- | --- |
| DSH | `>=0.2.2-rc.3 <0.4.0` |
| Node.js, plugin runtime | `>=20` |
| Node.js, building `client.js` | `>=22.18` (`tsdown`) |

The development line used for the merge and for the live checks was DSH
`0.2.2-rc.5`: `@deepseek-ai/schemastery` 3.19.0 resolves from the installation
directory, and a volatile field edit arrives as `loader/volatile-update` without a
second `apply`. That covers the mechanics this plugin depends on. Every other slot
and service listed in this document was exercised by the test suites against
fakes of the shapes named here, not against a second DSH release.

The DSH range is declared in `dsh.engines.dsh` of `package.json`. That is the
field the plugin market reads and shows on the plugin card. The plugin has no
`peerDependencies` entry on a `@deepseek-ai/dsh-*` package, so the host-side
install check — which only reads such peers — does not constrain the version. If
you want the install to be refused on an unsupported DSH, add a peer on
`@deepseek-ai/dsh-llm` with the same range; that is what the two old private
plugins did.

Node 22.18 is needed only to rebuild the browser half. The published package
contains the compiled `client.js`, so users on Node 20 never run the build, and
installing from npm or from git starts no build script at all.

## Client modules declared in the manifest

`package.json` declares `dsh.client.inject`:

| Module | Needed for | If it is missing |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-ui-settings` | the settings page and its navigation icon | no settings page and no bundle block; catalog sync, coefficients and balance still run on the host, but cannot be switched from the UI |
| `@deepseek-ai/dsh-client-ui-sidebar` | the balance button and panel | no button and no panel; catalog sync and coefficients are unaffected |
| `@deepseek-ai/dsh-client-ui-model-selection` | the coefficient badges | no badges; catalog sync and balance are unaffected |

The client half also exports `inject = ['slots', 'locale']` itself. That export is
what makes `ctx.slots` and `ctx.locale` connected properties of the Cordis
context. A client half that exports only `apply` gets `ctx.slots === undefined`
and its registrations silently disappear — this is a Cordis contract, not a DSH
choice, and it is the reason the `inject` export must not be removed.

## UI surfaces the plugin leans on

These are host-side slots and DOM attributes, not a stable public API. Each row
names the surface, what the plugin does with it, and the symptom when it changes.

| Surface | Used for | Symptom if it changes |
| --- | --- | --- |
| `settings.section` | the **Settings → CVC** page (id `cvc`, order 25) | the section disappears from settings navigation; everything else keeps working, and the plugin can still be configured by editing the profile patch |
| `settings.section.icon` | the icon of that section | the section shows without the plugin icon, or the icon slot rejects the registration |
| `plugins.bundle.config` | the configuration block on the bundle page in **Plugins** (key = package name, `view: 'summary'` for the one-line form) | the block is not drawn on the plugin page; the settings section is still there |
| `sidebar.footer.action` | the **CVC balance** button and its panel (id `cvc-balance`, order 5) | no balance button; the balance route still answers `GET /cvc/balance`, and the `cvc_balance` tool still works |
| `data-model-id` on a model row | the key the badge looks up in the coefficient map | no badges, because the badge does not know which model the row belongs to |
| `data-provider-id` on the same row | the check that the row belongs to a CVC provider | no badges; the plugin never decorates a model of another provider |
| `conversation.input.model.label` | **not used** — deliberately left to its owner | nothing: the plugin does not register there, so a change to that slot cannot break it |
| `shell.overlay` | **not used** — DSH, in the supported range, exposes no public overlay slot; the balance panel is positioned inside `sidebar.footer.action` with `position: fixed` | nothing today. If a real overlay slot appears, moving the panel there would be the cleaner option, and the panel code is the only part to change |
| `--dsw-alias-*` CSS variables | all colours of the page, badges and panel | styling loses contrast but stays readable; the variables are also what keeps the light theme working |

## Host services the plugin uses

| Service | Used by | What it provides | If it changes |
| --- | --- | --- | --- |
| `ctx.webServer.register` | `lib/http.js` | route registration under `/cvc` | no HTTP routes: the settings page cannot load or save, badges and balance stay empty |
| `ctx.configEditor` (`entries`, `configuration`, `edit`, `documentPath`) | `lib/state.js`, `lib/catalog-sync.js` | reading the patch layers and writing the plugin row, `llm-pi-ai.models`, `allowedModels` | saves and catalog applies fail; nothing is written |
| `ctx.credentials.resolve` | `lib/providers.js` | resolving a key by name | catalog, balance and installer runs fail with a "credential is not configured" error; no key is ever read another way |
| `ctx.settings.configure({ auto: false })` | `index.js` | keeping the plugin row out of the automatic settings form | the row may be rendered twice |
| `loader/volatile-update` | `index.js` | applying a changed row without a restart | switches stop taking effect live; the plugin would need a restart after each change |
| `ctx.slots.inject` / `ctx.slots.register` | `src/client/index.js` | registering the page, the bundle block and the balance button | the affected surface is not registered; the rest keeps working |
| `ctx.locale.register` / `ctx.locale.bind` | `src/client/index.js` | the en/ru dictionaries, including the section label | the interface falls back to dictionary keys or loses the section title |
| `window.__ModuleLoader__.load` | `tools/build-client.mjs` | the wrapper the DSH client loader expects | the browser half does not load; `client.js` is not registered |

## What to do when DSH changes

1. Start with the console of the DSH web UI. Each surface fails independently, so
   the first error names the slot or service that moved.
2. Check `dsh.client.inject` in `package.json` against the client modules the
   current DSH ships. A module that was merged or renamed must be updated there,
   and the corresponding import in `src/client/**` must follow.
3. Check the slot names against the DSH client packages of that version
   (`dsh-client-ui-settings`, `dsh-client-ui-sidebar`,
   `dsh-client-ui-model-selection`). A renamed slot is a one-line change in
   `src/client/index.js`; nothing in the host half depends on it.
4. If `ctx.configEditor` changes, `lib/state.js` and `lib/catalog-sync.js` are the
   only files to touch. Keep the rule that the current value is read inside the
   edit callback: it is what makes the write safe next to a concurrent edit.
5. If the model selector stops writing `data-model-id` or `data-provider-id`, the
   badges need another way to identify a row. Do not guess by visible text: the
   same model id can belong to another provider.
6. If the theme tokens are renamed, `src/client/css.js` is the only file with
   colours. Keep using tokens; hard-coded colours would break the light theme.
7. Run the tests after the change. `test/client-render.test.mjs` mounts the page
   on a fake React and fails when a registration shape changes;
   `test/gating.test.mjs` fails when the volatile path stops mounting or
   unmounting a function.

## Deliberate non-dependencies

- **No Remote namespaces.** The browser-side Remote table is built into DSH from
  its own packages, so a third-party plugin cannot add an entry. The plugin owns
  HTTP routes instead and uses `fetch`, the same way `dshmarket` does.
- **No `ctx.shell`.** The catalog and the balance are read with the host
  process's ordinary `fetch`. The plugin does not spawn a process.
- **No build on install.** `client.js` is committed. `prepare` is not used, so
  pnpm does not ask for `allowBuilds` and the profile does not need a build
  permission for this package.
- **No `modelOverrides` support.** DSH does not accept `modelOverrides` beside a
  `models` list; a route configured that way is refused with an explicit error
  instead of being silently rewritten.

## Compatibility history

| Plugin version | DSH range | Notes |
| --- | --- | --- |
| 2.0.0 | `>=0.2.2-rc.3 <0.4.0` | three functions, routes under `/cvc`, grouped config |
| 1.0.0 | `>=0.2.2-rc.3 <0.4.0` | catalog sync only, flat config, routes under `/cvc-catalog-sync` |

The private `cvc-model-coeff-plugin` 1.0.0 and `cvc-balance-plugin` 1.1.0 were
built for the 0.1.x line; their functions are ported here and the repositories are
archived.

---

# Совместимость

Этот документ перечисляет, что плагин ожидает от DSH, что происходит, когда
ожидание перестаёт выполняться, и что менять в коде. Это памятка сопровождающего
к обновлению DSH; требования для пользователя — в [README.ru.md](../README.ru.md).

## Диапазон версий

| Что | Диапазон |
| --- | --- |
| DSH | `>=0.2.2-rc.3 <0.4.0` |
| Node.js, работа плагина | `>=20` |
| Node.js, сборка `client.js` | `>=22.18` (`tsdown`) |

Линия разработки, на которой шло слияние и живые проверки, — DSH `0.2.2-rc.5`:
`@deepseek-ai/schemastery` 3.19.0 разрешается из каталога установки, а правка
volatile-поля приходит событием `loader/volatile-update` без повторного `apply`.
Это покрывает механику, от которой плагин зависит. Все остальные слоты и
сервисы из этого документа проверены наборами тестов на подделках с описанными
здесь формами, а не на втором релизе DSH.

Диапазон DSH объявлен в `dsh.engines.dsh` файла `package.json`. Именно это поле
читает маркет плагинов и показывает на карточке. Peer-зависимости на пакет
`@deepseek-ai/dsh-*` у плагина нет, поэтому хостовая проверка установки — а она
читает только такие peer-и — версию не ограничивает. Если нужно, чтобы установка
на неподдерживаемом DSH отклонялась, добавьте peer на `@deepseek-ai/dsh-llm` с
тем же диапазоном: так делали оба старых приватных плагина.

Node 22.18 нужен только для пересборки браузерной половины. Опубликованный
пакет содержит собранный `client.js`, поэтому пользователь на Node 20 сборку не
запускает, а установка из npm и из git вообще не запускает скриптов сборки.

## Клиентские модули, объявленные в манифесте

`package.json` объявляет `dsh.client.inject`:

| Модуль | Зачем нужен | Если его нет |
| --- | --- | --- |
| `@deepseek-ai/dsh-client-ui-settings` | страница настроек и её значок в навигации | нет страницы настроек и блока бандла; синхронизация каталога, коэффициенты и баланс на хосте работают, но переключить их из интерфейса нечем |
| `@deepseek-ai/dsh-client-ui-sidebar` | кнопка и панель баланса | нет кнопки и панели; синхронизация каталога и коэффициенты не затронуты |
| `@deepseek-ai/dsh-client-ui-model-selection` | бейджи коэффициентов | нет бейджей; синхронизация каталога и баланс не затронуты |

Сама клиентская половина ещё экспортирует `inject = ['slots', 'locale']`. Этот
экспорт и делает `ctx.slots` и `ctx.locale` подключёнными свойствами контекста
Cordis. Половина, экспортирующая только `apply`, получает `ctx.slots ===
undefined`, и её регистрации молча исчезают — это контракт Cordis, а не выбор
DSH, и поэтому экспорт `inject` нельзя убирать.

## Поверхности интерфейса, на которые опирается плагин

Это слоты хоста и атрибуты DOM, а не стабильный публичный API. В каждой строке —
поверхность, что с ней делает плагин и что будет видно, если она изменится.

| Поверхность | Для чего | Симптом при изменении |
| --- | --- | --- |
| `settings.section` | страница **Настройки → CVC** (id `cvc`, order 25) | раздел исчезает из навигации настроек; всё остальное работает, а настроить плагин можно правкой профильного патча |
| `settings.section.icon` | значок этого раздела | раздел показывается без значка плагина либо слот отклоняет регистрацию |
| `plugins.bundle.config` | блок конфигурации на странице бандла в **«Плагинах»** (ключ — имя пакета, `view: 'summary'` для однострочного вида) | блок не рисуется на странице плагина; раздел настроек остаётся |
| `sidebar.footer.action` | кнопка **CVC баланс** и её панель (id `cvc-balance`, order 5) | нет кнопки баланса; маршрут `GET /cvc/balance` по-прежнему отвечает, инструмент `cvc_balance` работает |
| `data-model-id` на строке модели | ключ, по которому бейдж ищет модель в карте коэффициентов | нет бейджей: бейдж не знает, какой модели принадлежит строка |
| `data-provider-id` на той же строке | проверка, что строка принадлежит провайдеру CVC | нет бейджей; модель чужого провайдера плагин не украшает никогда |
| `conversation.input.model.label` | **не используется** — намеренно оставлен владельцу | ничего: плагин туда не регистрируется, и изменение слота его не ломает |
| `shell.overlay` | **не используется** — в поддерживаемом диапазоне DSH нет публичного слота оверлея; панель баланса позиционируется внутри `sidebar.footer.action` через `position: fixed` | сегодня — ничего. Если настоящий слот оверлея появится, перенести панель туда будет чище, и менять придётся только код панели |
| CSS-переменные `--dsw-alias-*` | все цвета страницы, бейджей и панели | оформление теряет контраст, но остаётся читаемым; эти же переменные обеспечивают работу светлой темы |

## Сервисы хоста, которые использует плагин

| Сервис | Кем используется | Что даёт | Если изменится |
| --- | --- | --- | --- |
| `ctx.webServer.register` | `lib/http.js` | регистрацию маршрутов под `/cvc` | нет HTTP-маршрутов: страница настроек не загрузится и не сохранит, бейджи и баланс останутся пустыми |
| `ctx.configEditor` (`entries`, `configuration`, `edit`, `documentPath`) | `lib/state.js`, `lib/catalog-sync.js` | чтение слоёв патча и запись строки плагина, `llm-pi-ai.models`, `allowedModels` | сохранение и применение каталога падают; ничего не записывается |
| `ctx.credentials.resolve` | `lib/providers.js` | разрешение ключа по имени | прогоны каталога, баланса и установщика падают с ошибкой «credential is not configured»; другим способом ключ не читается никогда |
| `ctx.settings.configure({ auto: false })` | `index.js` | не показывать строку плагина в автоматической форме настроек | строка может отрисоваться дважды |
| `loader/volatile-update` | `index.js` | применение изменённой строки без перезапуска | переключатели перестают действовать на лету; после каждого изменения нужен перезапуск |
| `ctx.slots.inject` / `ctx.slots.register` | `src/client/index.js` | регистрацию страницы, блока бандла и кнопки баланса | соответствующая поверхность не регистрируется; остальное работает |
| `ctx.locale.register` / `ctx.locale.bind` | `src/client/index.js` | словари en/ru, включая подпись раздела | интерфейс покажет ключи словаря или потеряет заголовок раздела |
| `window.__ModuleLoader__.load` | `tools/build-client.mjs` | обёртку, которую ждёт загрузчик клиента DSH | браузерная половина не загрузится; `client.js` не зарегистрируется |

## Что делать при обновлении DSH

1. Начните с консоли веб-интерфейса DSH. Каждая поверхность отказывает
   независимо, поэтому первая ошибка называет слот или сервис, который переехал.
2. Сверьте `dsh.client.inject` в `package.json` с клиентскими модулями, которые
   поставляет текущий DSH. Объединённый или переименованный модуль надо поправить
   там же, а за ним — соответствующий импорт в `src/client/**`.
3. Сверьте имена слотов с клиентскими пакетами DSH этой версии
   (`dsh-client-ui-settings`, `dsh-client-ui-sidebar`,
   `dsh-client-ui-model-selection`). Переименованный слот — правка в одну строку в
   `src/client/index.js`; хост-половина от него не зависит.
4. Если изменится `ctx.configEditor`, трогать нужно только `lib/state.js` и
   `lib/catalog-sync.js`. Сохраняйте правило «текущее значение читается внутри
   колбэка правки»: именно оно делает запись безопасной рядом с параллельной
   правкой.
5. Если селектор моделей перестанет писать `data-model-id` или
   `data-provider-id`, бейджам нужен другой способ опознать строку. Не угадывайте
   по видимому тексту: тот же id модели может принадлежать другому провайдеру.
6. Если переименуют токены темы, `src/client/css.js` — единственный файл с
   цветами. Продолжайте использовать токены; жёстко заданные цвета сломают
   светлую тему.
7. Прогоните тесты после правки. `test/client-render.test.mjs` монтирует
   страницу на поддельном React и падает, когда меняется форма регистрации;
   `test/gating.test.mjs` падает, когда volatile-путь перестаёт монтировать и
   снимать функцию.

## Намеренные не-зависимости

- **Никаких Remote-неймспейсов.** Браузерная таблица Remote собирается внутри
  DSH из его собственных пакетов, поэтому сторонний плагин не может добавить туда
  запись. Вместо этого плагин владеет HTTP-маршрутами и использует `fetch` — так
  же, как `dshmarket`.
- **Никакого `ctx.shell`.** Каталог и баланс читаются обычным `fetch` процесса
  хоста. Плагин не запускает дочерний процесс.
- **Никакой сборки при установке.** `client.js` коммитится. `prepare` не
  используется, поэтому pnpm не просит `allowBuilds` и профилю не нужно
  разрешение на сборку этого пакета.
- **Никакой поддержки `modelOverrides`.** DSH не принимает `modelOverrides`
  рядом с `models`; маршрут, настроенный так, отклоняется с понятной ошибкой, а
  не переписывается молча.

## История совместимости

| Версия плагина | Диапазон DSH | Примечания |
| --- | --- | --- |
| 2.0.0 | `>=0.2.2-rc.3 <0.4.0` | три функции, маршруты под `/cvc`, группированный конфиг |
| 1.0.0 | `>=0.2.2-rc.3 <0.4.0` | только синхронизация каталога, плоский конфиг, маршруты под `/cvc-catalog-sync` |

Приватные `cvc-model-coeff-plugin` 1.0.0 и `cvc-balance-plugin` 1.1.0 были
собраны под линию 0.1.x; их функции перенесены сюда, а репозитории
заархивированы.