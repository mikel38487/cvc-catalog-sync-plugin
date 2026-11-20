# Security policy

## Supported versions

| Version | DSH | Support |
| --- | --- | --- |
| 2.x | `>=0.2.2-rc.3 <0.4.0` | security fixes |
| 1.x | `>=0.2.2-rc.3 <0.4.0` | no longer maintained; update to 2.x |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

1. Use **Security → Report a vulnerability** on this repository (GitHub private
   vulnerability reporting).
2. Include the plugin version, the DSH version, the steps to reproduce, and the
   impact you expect.

You can expect an initial answer within 7 days and a fix or a mitigation plan
within 30 days for confirmed reports.

## What the plugin talks to

Everything the plugin fetches comes from the plugin's own configuration. There is
no telemetry, no analytics, and no other outbound host.

| Request | When | Data sent | Data received |
| --- | --- | --- | --- |
| `GET {baseURL}/models` | catalog sync needs a catalog; coefficients refresh their map | `Authorization: Bearer <key>` | model list, multipliers, modalities |
| `GET {apiRoot}/v1/balance` | the balance panel is opened or refreshed, or the interval fires | `Authorization: Bearer <key>` | `token_balance` |
| `GET <installerUrl>` (`/idhw`, `/idhl`) | a catalog run needs reasoning levels and the cached map expired | nothing, a plain download | the installer text, from which the `reasoningLevels` literal is read |

`apiRoot` is the provider route's `baseURL` with a trailing `/v1` removed, so the
balance request goes to the host the route already names. The installer URLs are
plain `GET`s without a key; they are the same files a user would download to
install CheapVibeCode by hand.

The browser half sends nothing to the provider. It reads the plugin's own
routes on the same origin as the DSH web UI:

- `GET /cvc/state`, `PUT /cvc/config`, `POST /cvc/run` — the settings page;
- `GET /cvc/coefficients` — the model badges;
- `GET /cvc/balance` — the balance button and panel;
- `GET /cvc/health` — a version probe.

A request with `Sec-Fetch-Site: cross-site` is refused with `403`, a write
(`PUT` or `POST`) without `application/json` with `415`, and a body over 64 KB
with `413`.

## The API key

The key is resolved on the host through `ctx.credentials` by the name the route
declares (`apiKeyEnv`), and only two things ever leave the host about it:

- the `Authorization` header of the requests listed above;
- the boolean `keySet: true|false` in the answers of the settings routes, the
  balance route and the `cvc_balance` tool. The keys themselves never leave the
  host.

The value does not enter the browser, the JSON answers or the logs. Errors are
reported in two ways, both without the key:

- the catalog and the installer requests raise `CvcApiError` with the provider's
  own message, passed through `redact(text, key)` in `lib/cvc-api.js`, which
  replaces the key with `***` before the text is stored, logged or shown;
- the balance request reports a per-provider error as a code plus the HTTP status
  (`unauthorized (HTTP 403)`), deliberately without the upstream body, because that
  body could echo the request headers.

The key is only ever placed in the `Authorization` header of the requests above.

A `401` or `403` from the provider is treated as a normal failed request: the
answer says which provider failed and why, the panel keeps showing the previous
numbers, and nothing is retried in a loop. A `403` from the browser fence
(`Sec-Fetch-Site: cross-site`) and a `403` from the provider are different
things and are reported separately.

## What the plugin writes

| Target | Written by | Condition |
| --- | --- | --- |
| `llm-pi-ai.providers.<provider>.models` in the profile patch | catalog sync | an apply run, only when the built list differs from the current one |
| `subagent-model-selection-settings.allowedModels` | catalog sync | `syncAllowlist` on, an apply run, only when the list changes |
| the plugin's own row config | the settings page | the **Save** button |
| `localStorage` key `cvc:panel-pos` | the balance panel | the user drags the panel |

Coefficients write nothing: they only read. The balance function writes nothing
either; its "spend since the previous reading" delta lives in the memory of the
DSH process and disappears on restart.

Writes to the patch go through `ctx.configEditor.edit()`, which keeps the rest of
the file, its comments and other plugins' rows. The plugin has no other file
access: it does not read the profile directory, does not scan the disk, and does
not spawn processes.

## The browser half

- It is shipped compiled as `client.js`; the sources are in `src/client/**` and
  CI rebuilds the file on every push, so the committed artefact cannot drift from
  the sources silently.
- It renders the settings page, the coefficient badges and the balance panel. It
  does not read the conversation, the prompt, the model output or the DOM outside
  the two attributes it needs: `data-model-id` and `data-provider-id` on the model
  rows the DSH selector draws.
- The balance panel uses `localStorage` for one key (`cvc:panel-pos`) and does not
  write anywhere else.
- A switched-off function registers no route and no UI. A browser tab left open
  from an older version that still calls `/cvc-catalog-sync`, `/cvc-model-coeff`
  or `/cvc-balance` gets `404`.

## Dependencies

The package ships no bundled runtime dependencies. The host half imports one peer
dependency, `@deepseek-ai/schemastery` (`>=3.18.4 <4`), which is resolved from the
DSH installation and is declared optional so that a profile install does not fail
when the host provides it already. The browser half uses `react` from the DSH
client loader and nothing else. Build tooling (`tsdown`, `typescript`,
`schemastery` for tests) is a development dependency and is not installed for
users of the published package.

## Out of scope

Vulnerabilities in DSH itself, in the CheapVibeCode API, in the installers the
plugin downloads, or in the models the catalog describes — report those to their
maintainers.

## Hardening in this repository

- CI on every push and pull request: `npm ci`, the test suite on Node 20, 22 and
  24, a rebuild of `client.js` on Node 22 with `git diff --exit-code`, and a check
  of the npm tarball contents (`tools/assert-pack.mjs`) so a missing or unexpected
  file fails before publishing.
- Dependabot alerts, security updates, and weekly version updates for npm and
  GitHub Actions.
- CodeQL code scanning (`security-and-quality`) on every push and pull request,
  plus a weekly scheduled run.
- GitHub secret scanning with push protection.
- OpenSSF Scorecard results published to the code-scanning dashboard.
- Third-party actions pinned to commit SHAs.
- npm releases with provenance through npm Trusted Publishing from GitHub
  Actions: the publish workflow runs only for a published release, checks that
  the tag matches `package.json`, runs the tests and the build check, and refuses
  to publish an already existing version.

## Accepted findings

OpenSSF Scorecard reports posture items that a single-maintainer plugin cannot
satisfy by design; they are accepted, not ignored:

| Check | Why it stays |
| --- | --- |
| Code-Review | one maintainer; there is no second reviewer |
| Branch-Protection | `main` blocks deletion and force-push; required reviews or status checks would lock out direct maintenance |
| Maintained | young repository |
| CII-Best-Practices | no OpenSSF badge application yet |
| Fuzzing | no fuzz target; robustness is covered by edge-case tests |

Everything actionable is enabled: Dependabot, CodeQL, secret scanning with push
protection, pinned actions, and provenance on npm releases.

---

# Политика безопасности

## Поддерживаемые версии

| Версия | DSH | Поддержка |
| --- | --- | --- |
| 2.x | `>=0.2.2-rc.3 <0.4.0` | исправления безопасности |
| 1.x | `>=0.2.2-rc.3 <0.4.0` | не поддерживается; обновитесь до 2.x |

## Как сообщить об уязвимости

Не открывайте публичный issue для проблемы безопасности.

1. Используйте **Security → Report a vulnerability** в этом репозитории
   (приватный advisory GitHub).
2. Укажите версию плагина, версию DSH, шаги воспроизведения и ожидаемое
   влияние.

Первый ответ — в течение 7 дней, исправление или план смягчения для
подтверждённой проблемы — в течение 30 дней.

## К чему обращается плагин

Всё, что плагин забирает из сети, задано его собственной конфигурацией.
Телеметрии и аналитики нет, других внешних адресов тоже.

| Запрос | Когда | Что уходит | Что приходит |
| --- | --- | --- | --- |
| `GET {baseURL}/models` | синхронизации нужен каталог; коэффициенты обновляют карту | `Authorization: Bearer <ключ>` | список моделей, множители, модальности |
| `GET {apiRoot}/v1/balance` | панель баланса открыта или обновлена, либо сработал интервал | `Authorization: Bearer <ключ>` | `token_balance` |
| `GET <адрес установщика>` (`/idhw`, `/idhl`) | прогону каталога нужны уровни, а кэш карты истёк | ничего, обычная загрузка | текст установщика, из которого читается литерал `reasoningLevels` |

`apiRoot` — это `baseURL` маршрута провайдера без хвостового `/v1`, поэтому
запрос баланса идёт на тот же хост, который уже назван в маршруте. Адреса
установщиков запрашиваются обычным `GET` без ключа: это те же файлы, которые
пользователь скачал бы, устанавливая CheapVibeCode руками.

Браузерная половина провайдеру не отправляет ничего. Она читает собственные
маршруты плагина на том же origin, что и веб-интерфейс DSH:

- `GET /cvc/state`, `PUT /cvc/config`, `POST /cvc/run` — страница настроек;
- `GET /cvc/coefficients` — бейджи моделей;
- `GET /cvc/balance` — кнопка и панель баланса;
- `GET /cvc/health` — проверка версии.

Запрос с `Sec-Fetch-Site: cross-site` отклоняется с `403`, запись (`PUT` или
`POST`) без `application/json` — с `415`, тело больше 64 КБ — с `413`.

## Ключ

Ключ разрешается на хосте через `ctx.credentials` по имени, которое объявляет
маршрут (`apiKeyEnv`), и наружу из хоста выходят только две вещи:

- заголовок `Authorization` перечисленных выше запросов;
- булев `keySet: true|false` в ответах маршрутов настроек, маршрута баланса и
  инструмента `cvc_balance`. Сами ключи хост не покидают.

Само значение не попадает в браузер, в JSON-ответы и в логи. Ошибки сообщаются
двумя способами, и ни в одном нет ключа:

- запросы каталога и установщика поднимают `CvcApiError` с собственным сообщением
  провайдера, прошедшим через `redact(text, key)` в `lib/cvc-api.js`, который
  заменяет ключ на `***`, прежде чем текст будет сохранён, залогирован или
  показан;
- запрос баланса сообщает ошибку провайдера кодом и HTTP-статусом
  (`unauthorized (HTTP 403)`), намеренно без тела апстрима: тело может повторять
  заголовки запроса.

Ключ помещается только в заголовок `Authorization` запросов выше.

`401` или `403` от провайдера — обычный неудачный запрос: ответ говорит, какой
провайдер отказал и почему, панель продолжает показывать прошлые цифры, а цикл
повторов не запускается. `403` от браузерного фенса (`Sec-Fetch-Site:
cross-site`) и `403` от провайдера — разные вещи и сообщаются раздельно.

## Что плагин записывает

| Куда | Кто пишет | Условие |
| --- | --- | --- |
| `llm-pi-ai.providers.<провайдер>.models` в профильном патче | синхронизация каталога | прогон с применением, только если собранный список отличается от текущего |
| `subagent-model-selection-settings.allowedModels` | синхронизация каталога | `syncAllowlist` включён, прогон с применением, список изменился |
| конфиг собственной строки плагина | страница настроек | кнопка **Сохранить** |
| ключ `localStorage` `cvc:panel-pos` | панель баланса | пользователь перетащил панель |

Коэффициенты не пишут ничего: они только читают. Баланс тоже ничего не
записывает; дельта «с прошлого замера» живёт в памяти процесса DSH и исчезает
при перезапуске.

Запись в патч идёт через `ctx.configEditor.edit()`, который сохраняет остальной
файл, комментарии и строки чужих плагинов. Другого доступа к файлам у плагина
нет: он не читает каталог профиля, не сканирует диск и не запускает процессы.

## Браузерная половина

- Она поставляется собранной в `client.js`; исходники — в `src/client/**`, и CI
  пересобирает файл на каждый push, поэтому закоммиченный артефакт не может
  молча разойтись с исходниками.
- Она рисует страницу настроек, бейджи коэффициентов и панель баланса. Она не
  читает переписку, запрос, вывод модели и DOM за пределами двух нужных ей
  атрибутов: `data-model-id` и `data-provider-id` на строках моделей, которые
  рисует селектор DSH.
- Панель баланса использует `localStorage` для одного ключа (`cvc:panel-pos`) и
  больше никуда не пишет.
- Выключенная функция не регистрирует ни маршрута, ни элемента интерфейса.
  Вкладка, оставшаяся с прежней версией и всё ещё вызывающая
  `/cvc-catalog-sync`, `/cvc-model-coeff` или `/cvc-balance`, получает `404`.

## Зависимости

В пакете нет встроенных runtime-зависимостей. Хост-половина импортирует одну
peer-зависимость, `@deepseek-ai/schemastery` (`>=3.18.4 <4`), которая
разрешается из установки DSH и объявлена необязательной, чтобы установка в
профиль не падала, когда хост её уже предоставляет. Браузерная половина берёт
`react` из загрузчика клиента DSH и больше ничего. Сборочный инструментарий
(`tsdown`, `typescript`, `schemastery` для тестов) — dev-зависимость, и
пользователям опубликованного пакета он не устанавливается.

## Вне области

Уязвимости самого DSH, API CheapVibeCode, установщиков, которые скачивает
плагин, и описанных в каталоге моделей — о них сообщайте их авторам.

## Что включено в репозитории

- CI на каждый push и pull request: `npm ci`, набор тестов на Node 20, 22 и 24,
  пересборка `client.js` на Node 22 с `git diff --exit-code` и проверка состава
  npm-тарбола (`tools/assert-pack.mjs`), чтобы пропавший или лишний файл падал
  до публикации.
- Dependabot: оповещения, security updates и еженедельные обновления npm и
  GitHub Actions.
- CodeQL (`security-and-quality`) на каждый push и pull request, плюс
  еженедельный прогон по расписанию.
- Secret scanning с push protection.
- OpenSSF Scorecard с публикацией в code scanning.
- Сторонние actions закреплены по SHA коммита.
- Публикация в npm с provenance через Trusted Publishing из GitHub Actions:
  workflow публикации запускается только для опубликованного релиза, сверяет
  тег с `package.json`, гоняет тесты и проверку сборки и отказывается публиковать
  уже существующую версию.

## Принятые замечания

OpenSSF Scorecard сообщает о зрелости репозитория пункты, которые плагин с одним
сопровождающим не может выполнить по определению. Они приняты, а не
проигнорированы:

| Проверка | Почему остаётся |
| --- | --- |
| Code-Review | один сопровождающий, второго ревьюера нет |
| Branch-Protection | в `main` запрещены удаление и force-push; обязательные ревью или статус-чеки заблокировали бы прямое сопровождение |
| Maintained | репозиторий молодой |
| CII-Best-Practices | заявки на бейдж OpenSSF ещё нет |
| Fuzzing | фазз-цели нет; устойчивость покрыта тестами крайних случаев |

Всё, что можно включить, включено: Dependabot, CodeQL, secret scanning с push
protection, закреплённые actions и provenance у релизов npm.