# CVC catalog sync

[![CI](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/ci.yml)
[![CodeQL](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/codeql.yml/badge.svg)](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/cvc-catalog-sync-plugin.svg)](https://www.npmjs.com/package/cvc-catalog-sync-plugin)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Keeps the CheapVibeCode route's model list in the DSH profile patch in sync with
the provider catalog and with the reasoning levels published by the official
CheapVibeCode installer.

## Install

Requires DSH `>=0.2.2-rc.3 <0.4.0`, a `cheapvibecode` route in `llm-pi-ai` with
its credential named by `apiKeyEnv` (default `CVC_DEEPSEEK_API_KEY`), and Node.js
20 or newer.

Ask the DSH agent to install the bundle from npm:

```text
install the npm bundle cvc-catalog-sync-plugin
```

By hand: add `"cvc-catalog-sync-plugin": "^1.0.0"` to the dependencies of
`~/.dsh/profiles/<profile>/package.json` and the package name to
`dsh.profile.bundles`, then let the profile install it. For a local checkout use
`"cvc-catalog-sync-plugin": "link:<absolute path>"` instead.

After activation the settings appear in **Settings → CVC catalog** and on the
plugin's own page in **Plugins**, between the description and the component rows.

## Why it exists

The CVC catalog (`GET /v1/models`) changes often, and it does **not** carry
reasoning levels: only a boolean `supports_reasoning`. The levels live as a
`const reasoningLevels = {...}` literal inside the official installers
(`/idhw` for PowerShell, `/idhl` for bash). DSH's built-in "get models" action
neither saves anything nor returns levels, so a catalog refresh otherwise means
hand-editing `~/.dsh/profiles/<profile>/cordis.patch.yml`.

## What it does

1. On activation (after a short delay) and every `intervalHours`, it fetches
   `{baseURL}/models` with the route's credential and the installer's
   `reasoningLevels` map.
2. It builds `llm-pi-ai.providers.<provider>.models` with the installer's own
   rules: `name` is `display_name` after ` · `, `contextWindow` is
   `context_window`, `maxTokens` is `min(max_output_tokens, contextWindow)`,
   `input` gains `image` when the model accepts it, `none` becomes
   `off: none`, and `gpt-image*` / non-text-output models are skipped.
3. It writes the result through `ctx.configEditor.edit()`, which preserves the
   rest of the patch file, its comments and other plugins' rows, and applies the
   change through `dsh-hmr` without restarting DSH.
4. When `syncAllowlist` is on, the `subagent-model-selection-settings` list is
   pruned and extended to the same model ids, leaving other providers' entries
   untouched.

It writes only when the catalog or the subagent allowlist actually changed. A
response below `minModelRatio` of the current model count is refused, so a
partial or empty catalog cannot wipe a working list.

## Tool

`cvc_catalog` — the manual entry point:

| Action | Effect |
|---|---|
| `status` | Last run in this process; no network |
| `plan` | Fetch, build, return the diff, write nothing |
| `apply` | Fetch and write (refused by the size guard unless `force: true`) |

## Settings page

The plugin puts the same settings form in two places:

- **Settings → CVC catalog** — a section in the settings navigation with its own
  icon (`settings.section` + `settings.section.icon`);
- **Plugins → CVC catalog sync → bundle page** — a configuration block between
  the bundle description and its component rows (`plugins.bundle.config`, keyed
  by the package name), the same seat `dshmarket` and `dsh-free-search` use.

Both edit every option from the configuration block below, read the current
values back from the profile patch, and offer three actions:

| Action | Effect |
|---|---|
| **Save** | Validates the form and writes the row config into the profile patch through `configEditor.edit()`. Values equal to the bundle defaults remove the override, so the patch keeps only real changes. |
| **Check catalog** | Fetches the catalog and the reasoning-level map, shows the diff, writes nothing. |
| **Apply catalog** | Same fetch, then writes the models and the subagent allowlist. Asks for confirmation first. |

The page also shows the last run: catalog / current / next model counts, the
level source, added / removed / changed models, allowlist changes, warnings and
the patch path. Check and apply use the **saved** settings, so press Save first;
the page marks unsaved changes.

The page talks to the host through `/cvc-catalog-sync` (`state`, `config`, `run`)
on the DSH web server. The browser never receives the API key: the host resolves
the credential by name. Writes require `application/json` and reject cross-site
requests.

## Configuration

Override the row in the profile patch by id `cvc-catalog-sync` — or use the
settings page, which writes the same row:

```yaml
- id: cvc-catalog-sync
  name: 'cvc-catalog-sync-plugin'
  config:
    entryId: llm-pi-ai               # profile patch row that owns the routes
    provider: cheapvibecode          # route key inside llm-pi-ai.providers
    apiKeyEnv: CVC_DEEPSEEK_API_KEY  # credential reference, never the value
    baseURL: https://ru.cheapvibecode.ru/v1
    installerUrls:                   # reasoning-level maps, first reachable wins
      - https://ru.cheapvibecode.ru/idhw
      - https://ru.cheapvibecode.ru/idhl
    autoSync: true                   # startup + interval runs
    intervalHours: 24                # 0 disables the timer; below 1 minute it is raised
    startupDelayMs: 5000
    minModelRatio: 0.8               # refuse a smaller catalog
    keepModels: []                   # ids to keep even when the catalog drops them
    syncAllowlist: true
    allowlistEntryId: subagent-model-selection-settings
    levelsCacheMinutes: 360
    timeoutMs: 30000
```

A route configured with `modelOverrides` is refused with an explicit error: DSH
does not accept `modelOverrides` beside a `models` list, so such a route must be
converted to an explicit list first.

Because a local bundle is linked by directory rather than copied, editing its
files does not load new code by itself: DSH picks the new module up after a
profile reconcile (any patch-file change) or an application restart.

## Limits

- Levels are scraped from the installer, not from an API. If both installer URLs
  are unreachable, existing levels are preserved and only new models fall back to
  the full `supports_reasoning` row; the run reports `levelsSource: none`.
- The CVC catalog is not filtered by key: `/v1/models` lists every model, while
  availability is decided per request (`403 This model is not enabled for the
  API key`). The plugin therefore cannot hide models your key cannot call.
- The DSH schema constrains the **keys** of `reasoningEfforts`
  (`off/minimal/low/medium/high/xhigh/max`); values are arbitrary wire
  spellings. That is why the installer's `thinking` level travels as
  `high: thinking`, and the plugin reproduces it.
- A model whose catalog entry declares no modalities keeps the current entry's
  `input`; a declared `supports_vision: false` drops `image`.

## Verify and roll back

```powershell
# plan without writing
cvc_catalog action=plan
# copy the patch before the first apply
Copy-Item ~\.dsh\profiles\desktop\cordis.patch.yml ~\.dsh\profiles\desktop\cordis.patch.yml.bak-manual
cvc_catalog action=apply
```

`git` is not used for the profile; a file copy is the rollback.

## Tests

```powershell
node --test test/self-test.mjs test/integration.mjs test/settings-api.mjs test/client-render.mjs
```

- `self-test.mjs` — pure functions: catalog parsing, level mapping, model build, diff.
- `integration.mjs` — the tool against a fake `ctx` with the real `configEditor`
  contract: apply, guard, allowlist repair, edits made under the lock.
- `settings-api.mjs` — the HTTP settings route: state, validation, save, run,
  cross-site refusal.
- `client-render.mjs` — renders the settings page with a fake React, so a render
  error fails here instead of leaving an empty settings slot.

## Security

See [SECURITY.md](SECURITY.md). Zero runtime dependencies; the plugin contacts
only the configured `baseURL` and installer URLs; the API key never reaches the
browser; npm releases carry provenance from GitHub Actions.

## License

MIT © 2026 mikel38487

---

# Синхронизация каталога CVC

Держит список моделей маршрута CheapVibeCode в профильном патче DSH в
соответствии с каталогом провайдера и с уровнями мышления из официального
установщика CheapVibeCode.

## Зачем

Каталог CVC (`GET /v1/models`) меняется часто и **не содержит** уровней
мышления — только булев `supports_reasoning`. Уровни лежат литералом
`const reasoningLevels = {...}` внутри установщиков (`/idhw` для PowerShell,
`/idhl` для bash). Штатное действие DSH «получить список моделей» ничего не
сохраняет и уровней не возвращает, поэтому обновление каталога иначе — ручная
правка `~/.dsh/profiles/<профиль>/cordis.patch.yml`.

## Что делает

1. При активации (после короткой задержки) и каждые `intervalHours` забирает
   `{baseURL}/models` ключом маршрута и карту `reasoningLevels` установщика.
2. Собирает `llm-pi-ai.providers.<provider>.models` по правилам самого
   установщика: `name` — хвост `display_name` после ` · `, `contextWindow` —
   `context_window`, `maxTokens` — `min(max_output_tokens, contextWindow)`,
   `input` получает `image`, если модель его принимает, `none` превращается в
   `off: none`, а `gpt-image*` и модели без текстового вывода пропускаются.
3. Пишет результат через `ctx.configEditor.edit()`: сохраняются остальные
   строки патча, комментарии и чужие плагины, а изменение применяется через
   `dsh-hmr` без перезапуска DSH.
4. При включённом `syncAllowlist` список `subagent-model-selection-settings`
   приводится к тем же id моделей; записи других провайдеров не трогаются.

Запись выполняется только при реальном изменении каталога или списка
`allowedModels`. Ответ меньше `minModelRatio` от текущего числа моделей
отклоняется: частичный или пустой каталог не должен стирать рабочий список.

## Инструмент

`cvc_catalog` — ручная точка входа:

| Действие | Что делает |
|---|---|
| `status` | Последний прогон в этом процессе; без сети |
| `plan` | Забрать, собрать, показать разницу, ничего не записывать |
| `apply` | Забрать и записать (защита от усыхания каталога, обходится `force: true`) |

## Настройка

Страница **Настройки → Каталог CVC** редактирует все параметры из блока ниже;
та же форма открывается на странице плагина в **«Плагины»** — блоком между
описанием и списком компонентов. Кнопки: **Сохранить** (проверяет
форму и пишет строку в патч; значения, равные умолчаниям бандла, убирают
переопределение), **Проверить каталог** (дифф без записи) и **Применить каталог**
(запись моделей и списка сабагентов, с подтверждением). Там же — итог последнего
прогона: счётчики, источник уровней, добавленные/удалённые/изменённые модели,
правки списка, предупреждения и путь патча.

Проверка и применение используют **сохранённые** настройки — сначала
«Сохранить»; несохранённые изменения страница помечает.

Страница общается с хостом через `/cvc-catalog-sync` (`state`, `config`, `run`)
на веб-сервере DSH. Ключ в браузер не попадает: хост сам разрешает его по имени.
Запись требует `application/json`, межсайтовые запросы отклоняются.

Переопределение строки в профильном патче по id `cvc-catalog-sync` делает то же
самое руками — блок конфигурации в примере выше. Маршрут, настроенный через
`modelOverrides`, плагин отклоняет с понятной ошибкой: DSH не принимает
`modelOverrides` рядом с `models`, такой маршрут нужно сначала перевести на явный
список.

Локальный бандл подключён ссылкой на каталог, а не копией: правка файлов сама
новый код не поднимает — DSH подхватит модуль после реконсиляции профиля
(любое изменение патча) или перезапуска приложения.

## Ограничения

- Уровни вытаскиваются из установщика, а не из API. Если оба URL недоступны,
  текущие уровни сохраняются, а новые модели получают полный ряд по
  `supports_reasoning`; прогон сообщает `levelsSource: none`.
- Каталог CVC не фильтруется по ключу: `/v1/models` показывает всё, а
  доступность решается конкретным запросом (`403 This model is not enabled for
  the API key`). Скрыть модели, которые ключ не обслуживает, плагин не может.
- Схема DSH ограничивает **ключи** `reasoningEfforts`
  (`off/minimal/low/medium/high/xhigh/max`), а значения — произвольное проводное
  написание. Поэтому уровень `thinking` из установщика едет как `high: thinking`,
  и плагин повторяет это правило.
- Модель, у которой каталог не объявил модальности, сохраняет текущий `input`;
  явный `supports_vision: false` убирает `image`.

## Проверка и откат

```powershell
cvc_catalog action=plan
Copy-Item ~\.dsh\profiles\desktop\cordis.patch.yml ~\.dsh\profiles\desktop\cordis.patch.yml.bak-manual
cvc_catalog action=apply
```

Профиль не под git; откат — копия файла.
