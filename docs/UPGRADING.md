# Upgrading to 2.0.0

Version 2.0.0 turns one function (catalog sync) into three switchable functions
(catalog sync, price coefficients, balance) and absorbs two plugins that used to
be installed separately. The package name, the row id and the locale namespace do
not change, so an existing profile keeps working; what changes is the shape of the
row configuration and the set of HTTP routes.

There are two upgrade paths:

- [from cvc-catalog-sync-plugin 1.0.0](#from-cvc-catalog-sync-plugin-100);
- [from the two private plugins](#from-the-two-private-plugins).

Both end with a check list. Do not skip the check list: a switched-off function
is silent by design, and the check list is how you see that all three are alive.

## Before you start

1. Copy the profile patch. It is the only state the plugin writes, and the
   profile is not a git repository:

   ```powershell
   Copy-Item ~\.dsh\profiles\<profile>\cordis.patch.yml ~\.dsh\profiles\<profile>\cordis.patch.yml.bak-before-2.0.0
   ```

2. Note the running DSH version (`Settings → About`, or the version in the
   window title). 2.0.0 supports `>=0.2.2-rc.3 <0.4.0`.
   Installing from npm and running the plugin need Node 20 or newer; rebuilding
   `client.js` from `src/client/**` needs Node `^22.18` or `>=24.11`, and the
   published package already contains the compiled file, so an ordinary upgrade
   never runs the build.

## From cvc-catalog-sync-plugin 1.0.0

1. Update the package to `2.0.0`:

   ```text
   update the npm bundle cvc-catalog-sync-plugin
   ```

   or, by hand, change the dependency in
   `~/.dsh/profiles/<profile>/package.json` from `^1.0.0` to `^2.0.0` and let the
   profile install it.

2. Leave the row id alone. The row is `cvc-catalog-sync`, provided by the bundle
   patch; 2.0.0 inserts the same id with the three switches turned on. Nothing in
   the profile has to be renamed.

3. Start DSH, then open **Settings → CVC**. The page reads both configuration
   shapes. A 1.0.0 row shows the hint that the stored configuration is in the 1.x
   shape (`GET /cvc/state` reports `configShape: 'legacy'`).

4. Press **Save** once. This is the migration: the page builds the grouped config
   from the flat keys and writes it back through `PUT /cvc/config`. The flat keys
   (`entryId`, `provider`, `baseURL`, `apiKeyEnv`, `installerUrls`, `autoSync`,
   `intervalHours`, `startupDelayMs`, `minModelRatio`, `keepModels`,
   `syncAllowlist`, `allowlistEntryId`, `levelsCacheMinutes`, `timeoutMs`) are
   accepted by the host as deprecated fields, so nothing is lost if you keep them
   in the file — but after the save they are no longer needed, and the page
   removes them on the next write.

5. Check the switches. Catalog sync, model coefficients and balance are on by
   default. Coefficients and balance need the same `cheapvibecode.ru` route the
   catalog sync already used; there is nothing else to configure.

6. Old HTTP routes are gone. `/cvc-catalog-sync/*` is not served in 2.0.0; the
   page and any script of yours must use `/cvc/*`. A browser tab left open from
   1.0.0 will show an empty settings page until the tab is reloaded.

7. If you had extra keys in the row from 1.0.0 that the new schema does not know
   (for example `timeoutMs` is now inside `providers`), they are preserved by the
   page on save: the form writes only the fields it owns and keeps the rest of the
   row. The host's schema still normalises the row, so an unknown key is visible
   in `GET /cvc/state` but does not break the load.

## From the two private plugins

This path is for a profile that has `cvc-balance-plugin` (1.1.0) and/or
`cvc-model-coeff-plugin` (1.0.0). Both are archived; their functions live in this
package now.

1. Install `cvc-catalog-sync-plugin@2.0.0` as usual. If `cvc-catalog-sync-plugin`
   was not installed, this is a fresh install: add the package to
   `~/.dsh/profiles/<profile>/package.json` and to `dsh.profile.bundles`, or ask
   the DSH agent to install the npm bundle.
2. Remove the two old packages from the profile:

   ```sh
   dsh plugin --profile <profile> remove cvc-balance-plugin
   dsh plugin --profile <profile> remove cvc-model-coeff-plugin
   ```

   This removes the dependency and the row of each plugin from the bundle list.
   If a row was written by hand into `cordis.patch.yml`, delete it there as well:
   look for `id: cvc-balance` and `id: cvc-model-coeff`.
3. Remove the `allowBuilds` entries of those two packages from
   `pnpm-workspace.yaml` of the profile. They were needed because the private
   packages built `lib/` through `prepare`; this package ships its compiled
   client half and runs no build script on install, so it never asks for that
   permission. Leaving an unused entry is harmless, removing it is cleaner.
4. Restart DSH once, then hard-reload the tab (`Ctrl+Shift+R`). The old browser
   halves are unmounted with their packages; the new button and badges are mounted
   by this package.
5. Check that nothing is duplicated. If two balance buttons or two badges appear,
   a row of the old plugin is still in the profile patch: `grep` the patch for
   `cvc-balance` / `cvc-model-coeff` and remove those rows, then restart.
6. `cvc-model-coeff-plugin` had no settings page; its only parameter is now
   **Coefficients → Badge refresh, minutes** (`coefficients.refreshMinutes`,
   default 10) and **Show fast mode** (`coefficients.showFast`).
   `cvc-balance-plugin` had no settings page either; its behaviour is now
   **Balance → Balance refresh, seconds** (`balance.refreshSeconds`, default 0 —
   only on demand) and **Show spend since the last reading**
   (`balance.showDelta`).

## Migration table

| 1.x key | 2.0.0 location | Note |
| --- | --- | --- |
| `entryId` | `providers.entryId` | patch row that owns the provider routes |
| `provider` | `catalog.provider` | route key whose `models` are written |
| `baseURL` | `providers.baseURL` | also the base of the balance request |
| `apiKeyEnv` | `providers.apiKeyEnv` | fallback name when the route has none of its own |
| `timeoutMs` | `providers.timeoutMs` | default changed from 30000 to 20000 |
| `autoSync` | `catalog.autoSync` | |
| `intervalHours` | `catalog.intervalHours` | 0 turns the timer off |
| `startupDelayMs` | `catalog.startupDelayMs` | |
| `minModelRatio` | `catalog.minModelRatio` | |
| `keepModels` | `catalog.keepModels` | |
| `installerUrls` | `catalog.installerUrls` | |
| `syncAllowlist` | `catalog.syncAllowlist` | |
| `allowlistEntryId` | `catalog.allowlistEntryId` | |
| `levelsCacheMinutes` | `catalog.levelsCacheMinutes` | |
| — | `features.catalogSync` | new, default `true` |
| — | `features.coefficients` | new, default `true` |
| — | `features.balance` | new, default `true` |
| — | `providers.match` | new, default `['cheapvibecode.ru']` |
| — | `coefficients.refreshMinutes` | new, default 10 |
| — | `coefficients.showFast` | new, default `true` |
| — | `balance.refreshSeconds` | new, default 0 (on demand only) |
| — | `balance.showDelta` | new, default `true` |

The defaults are listed in [ARCHITECTURE.md](ARCHITECTURE.md) under
"Configuration" and in the README. A value equal to the default is not written
into the patch by the settings page, so the patch stays short.

## Check list

1. `GET /cvc/health` answers `{"ok":true,"version":"2.0.0"}`.
2. `GET /cvc/state` answers with `features` all `true` and `configShape: 'v2'`.
3. **Settings → CVC** opens, shows three switches and no unsaved-changes marker.
4. The model picker shows `×N` badges on CheapVibeCode rows and none on other
   providers' rows.
5. The sidebar footer has a **CVC balance** button; the dot is green when the
   provider answers, and the panel shows the balance after **Refresh**.
6. **Check catalog** in the settings page returns a diff with a non-zero catalog
   count and the level source (`installer` or `cache`), and writes nothing.
7. Only one row per function exists in `cordis.patch.yml`: `cvc-catalog-sync`,
   and no `cvc-balance` / `cvc-model-coeff`.

## Rollback

1. Stop DSH.
2. Restore the patch copy taken before the upgrade:

   ```powershell
   Copy-Item ~\.dsh\profiles\<profile>\cordis.patch.yml.bak-before-2.0.0 ~\.dsh\profiles\<profile>\cordis.patch.yml -Force
   ```

3. Set the dependency back to `^1.0.0` and, if needed, reinstall the two private
   packages.
4. Start DSH.

The models the plugin wrote stay in the patch until the old version or the next
run rewrites them; they are ordinary `llm-pi-ai` model entries and DSH accepts
them either way.

---

# Обновление до 2.0.0

Версия 2.0.0 превращает одну функцию (синхронизацию каталога) в три отключаемые
функции (синхронизация каталога, коэффициенты цен, баланс) и вбирает в себя два
плагина, которые раньше ставились отдельно. Имя пакета, id строки и пространство
имён локали не меняются, поэтому существующий профиль продолжает работать;
меняются форма конфигурации строки и набор HTTP-маршрутов.

Путей обновления два:

- [с cvc-catalog-sync-plugin 1.0.0](#с-cvc-catalog-sync-plugin-100);
- [с двух приватных плагинов](#с-двух-приватных-плагинов).

Оба заканчиваются списком проверки. Не пропускайте его: выключенная функция
молчит по своему устройству, и именно список проверки показывает, что все три
живы.

## Перед началом

1. Скопируйте профильный патч. Это единственное состояние, которое пишет
   плагин, а профиль не под git:

   ```powershell
   Copy-Item ~\.dsh\profiles\<профиль>\cordis.patch.yml ~\.dsh\profiles\<профиль>\cordis.patch.yml.bak-before-2.0.0
   ```

2. Запомните работающую версию DSH (**Настройки → О программе** или версия в
   заголовке окна). 2.0.0 поддерживает `>=0.2.2-rc.3 <0.4.0`.
   Установка из npm и работа плагина требуют Node 20 или новее; пересборка
   `client.js` из `src/client/**` — Node `^22.18` или `>=24.11`, но собранный
   файл уже лежит в опубликованном пакете, поэтому обычное обновление сборку не
   запускает.

## С cvc-catalog-sync-plugin 1.0.0

1. Обновите пакет до `2.0.0`:

   ```text
   update the npm bundle cvc-catalog-sync-plugin
   ```

   или вручную: поменяйте зависимость в
   `~/.dsh/profiles/<профиль>/package.json` с `^1.0.0` на `^2.0.0` и дайте
   профилю установить её.

2. Id строки не трогайте. Строка — `cvc-catalog-sync`, её предоставляет патч
   бандла; 2.0.0 вставляет тот же id с тремя включёнными переключателями. В
   профиле ничего переименовывать не нужно.

3. Запустите DSH и откройте **Настройки → CVC**. Страница читает обе формы
   конфигурации. Строка от 1.0.0 показывает подсказку, что сохранённый конфиг в
   форме 1.x (`GET /cvc/state` сообщает `configShape: 'legacy'`).

4. Нажмите **Сохранить** один раз. Это и есть миграция: страница собирает
   группированный конфиг из плоских ключей и записывает его обратно через
   `PUT /cvc/config`. Плоские ключи (`entryId`, `provider`, `baseURL`,
   `apiKeyEnv`, `installerUrls`, `autoSync`, `intervalHours`, `startupDelayMs`,
   `minModelRatio`, `keepModels`, `syncAllowlist`, `allowlistEntryId`,
   `levelsCacheMinutes`, `timeoutMs`) хост принимает как устаревшие поля,
   поэтому ничего не теряется, если оставить их в файле, — но после сохранения
   они больше не нужны, и страница убирает их при следующей записи.

5. Проверьте переключатели. Синхронизация каталога, коэффициенты моделей и
   баланс включены по умолчанию. Коэффициентам и балансу нужен тот же маршрут
   `cheapvibecode.ru`, которым уже пользовалась синхронизация; больше настраивать
   нечего.

6. Старые HTTP-маршруты удалены. `/cvc-catalog-sync/*` в 2.0.0 не обслуживается;
   страница и ваши скрипты должны обращаться к `/cvc/*`. Вкладка браузера,
   оставшаяся от 1.0.0, покажет пустую страницу настроек, пока её не перезагрузить.

7. Если в строке от 1.0.0 остались лишние ключи, которых новая схема не знает
   (например, `timeoutMs` теперь внутри `providers`), страница сохранит их: форма
   пишет только свои поля и оставляет остальное содержимое строки. Схема хоста
   строку всё равно нормализует, поэтому незнакомый ключ виден в
   `GET /cvc/state`, но загрузку не ломает.

## С двух приватных плагинов

Этот путь — для профиля, где стоят `cvc-balance-plugin` (1.1.0) и/или
`cvc-model-coeff-plugin` (1.0.0). Оба заархивированы; их функции теперь в этом
пакете.

1. Поставьте `cvc-catalog-sync-plugin@2.0.0` обычным способом. Если
   `cvc-catalog-sync-plugin` не был установлен, это чистая установка: добавьте
   пакет в `~/.dsh/profiles/<профиль>/package.json` и в `dsh.profile.bundles` либо
   попросите агента DSH поставить npm-бандл.
2. Удалите два старых пакета из профиля:

   ```sh
   dsh plugin --profile <профиль> remove cvc-balance-plugin
   dsh plugin --profile <профиль> remove cvc-model-coeff-plugin
   ```

   Команда убирает зависимость и строку плагина из списка бандлов. Если строка
   была вписана в `cordis.patch.yml` руками, удалите её и там: ищите
   `id: cvc-balance` и `id: cvc-model-coeff`.
3. Уберите записи `allowBuilds` этих двух пакетов из `pnpm-workspace.yaml`
   профиля. Они были нужны, потому что приватные пакеты собирали `lib/` через
   `prepare`; этот пакет поставляет собранную браузерную половину и никакого
   скрипта сборки при установке не запускает, поэтому такого разрешения не
   просит. Оставленная без дела запись безвредна, удалённая — чище.
4. Перезапустите DSH один раз, затем сделайте жёсткую перезагрузку вкладки
   (`Ctrl+Shift+R`). Старые браузерные половины снимаются вместе со своими
   пакетами; новую кнопку и бейджи монтирует этот пакет.
5. Проверьте, что ничего не задвоилось. Если видите две кнопки баланса или два
   бейджа, в профильном патче осталась строка старого плагина: найдите в патче
   `cvc-balance` / `cvc-model-coeff`, удалите эти строки и перезапустите DSH.
6. У `cvc-model-coeff-plugin` страницы настроек не было; его единственный
   параметр теперь — **Коэффициенты → Обновление бейджей, минут**
   (`coefficients.refreshMinutes`, по умолчанию 10) и **Показывать быстрый
   режим** (`coefficients.showFast`). У `cvc-balance-plugin` страницы настроек
   тоже не было; его поведение теперь — **Баланс → Обновление баланса, секунд**
   (`balance.refreshSeconds`, по умолчанию 0 — только по запросу) и
   **Показывать расход с прошлого замера** (`balance.showDelta`).

## Таблица переноса

| Ключ 1.x | Место в 2.0.0 | Примечание |
| --- | --- | --- |
| `entryId` | `providers.entryId` | строка патча, которой принадлежат маршруты провайдеров |
| `provider` | `catalog.provider` | ключ маршрута, чьи `models` записываются |
| `baseURL` | `providers.baseURL` | он же база запроса баланса |
| `apiKeyEnv` | `providers.apiKeyEnv` | запасное имя, если у маршрута нет своего ключа |
| `timeoutMs` | `providers.timeoutMs` | умолчание изменилось с 30000 на 20000 |
| `autoSync` | `catalog.autoSync` | |
| `intervalHours` | `catalog.intervalHours` | 0 выключает таймер |
| `startupDelayMs` | `catalog.startupDelayMs` | |
| `minModelRatio` | `catalog.minModelRatio` | |
| `keepModels` | `catalog.keepModels` | |
| `installerUrls` | `catalog.installerUrls` | |
| `syncAllowlist` | `catalog.syncAllowlist` | |
| `allowlistEntryId` | `catalog.allowlistEntryId` | |
| `levelsCacheMinutes` | `catalog.levelsCacheMinutes` | |
| — | `features.catalogSync` | новое, по умолчанию `true` |
| — | `features.coefficients` | новое, по умолчанию `true` |
| — | `features.balance` | новое, по умолчанию `true` |
| — | `providers.match` | новое, по умолчанию `['cheapvibecode.ru']` |
| — | `coefficients.refreshMinutes` | новое, по умолчанию 10 |
| — | `coefficients.showFast` | новое, по умолчанию `true` |
| — | `balance.refreshSeconds` | новое, по умолчанию 0 (только по запросу) |
| — | `balance.showDelta` | новое, по умолчанию `true` |

Умолчания перечислены в [ARCHITECTURE.md](ARCHITECTURE.md), раздел
«Конфигурация», и в README. Значение, равное умолчанию, страница настроек в патч
не пишет, поэтому патч остаётся коротким.

## Список проверки

1. `GET /cvc/health` отвечает `{"ok":true,"version":"2.0.0"}`.
2. `GET /cvc/state` отвечает с `features` все `true` и `configShape: 'v2'`.
3. **Настройки → CVC** открывается, показывает три переключателя и не показывает
   несохранённых изменений.
4. В выборе модели у строк CheapVibeCode есть бейджи `×N`, у строк других
   провайдеров их нет.
5. В футере сайдбара есть кнопка **CVC баланс**; точка зелёная, когда провайдер
   отвечает, а панель после **Обновить** показывает остаток.
6. **Проверить каталог** на странице настроек возвращает разницу с ненулевым
   числом моделей и источником уровней (`installer` или `cache`) и ничего не
   записывает.
7. В `cordis.patch.yml` на каждую функцию приходится по одной строке:
   `cvc-catalog-sync`, и нет `cvc-balance` / `cvc-model-coeff`.

## Откат

1. Остановите DSH.
2. Восстановите копию патча, снятую до обновления:

   ```powershell
   Copy-Item ~\.dsh\profiles\<профиль>\cordis.patch.yml.bak-before-2.0.0 ~\.dsh\profiles\<профиль>\cordis.patch.yml -Force
   ```

3. Верните зависимость на `^1.0.0` и, если нужно, переустановите два приватных
   пакета.
4. Запустите DSH.

Записанные плагином модели остаются в патче, пока старая версия или следующий
прогон их не перепишут; это обычные записи моделей `llm-pi-ai`, и DSH принимает
их в любом случае.