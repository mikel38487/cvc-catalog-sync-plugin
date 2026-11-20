# Architecture

This document describes how `cvc-catalog-sync-plugin` 2.0.0 is put together: what
runs on the host, what runs in the browser, where a decision is made, and why the
pieces are split the way they are. It is written for someone who has to change the
plugin, not for the end user: the user-facing text is in [README.md](../README.md).

## One package, two halves, three functions

The plugin is a DSH bundle with a host half and a browser half in one npm package.

- The **host half** is plain ESM (`index.js`, `lib/**`). It is loaded by the DSH
  process, registers HTTP routes on the DSH web server, reads the provider
  configuration and the profile patch, and is the only place that ever sees an
  API key.
- The **browser half** is compiled from `src/client/**` into `client.js`. It
  renders the three surfaces — the settings page, the coefficient badges, the
  balance button and panel — and talks to the host only through the plugin's own
  HTTP routes.
- The **three functions** on top of that split are catalog sync, coefficients and
  balance. They are independent: each one can be off while the others work, and
  the settings page is the switchboard that stays present with all three off.

The bundle patch `cordis.patch.yml` inserts one row, `cvc-catalog-sync`, with the
three switches on. That row is also the configuration surface: the settings page
edits the same row through `ctx.configEditor`.

## Module map

```text
index.js                     apply(); the Config schema; feature gating;
                             handling of loader/volatile-update
lib/config.js                Config (schemastery), normalizeConfig(v1 + v2),
                             validateConfigInput
lib/providers.js             resolveRoutes(ctx, cfg) -> CVC routes on the
                             llm-pi-ai row; resolveKey(ctx, ref)
lib/cvc-api.js               fetchModels, fetchBalance, fetchLevels; timeouts,
                             error mapping, no key in messages
lib/cache.js                 createCatalogCache({ client, ttlMs, now });
                             get / peek / clear
lib/catalog-build.js         buildModels(catalog, levels, options): pure logic
                             ported from 1.0.0
lib/catalog-sync.js          plan and apply: diff, shrink guard, patch write,
                             allowlist, the cvc_catalog tool, the timer
lib/coefficients.js          indexCoefficients(catalog), GET /cvc/coefficients
lib/balance.js               snapshot, spend delta, GET /cvc/balance,
                             the cvc_balance tool
lib/http.js                  JSON helpers, 64 KB body limit, same-origin fence,
                             prefix route registration
lib/state.js                 GET /cvc/state, PUT /cvc/config, lastRun/status
lib/CONTRACT.js              the frozen contract the three feature modules and
                             the client follow (documentation in code)
client.js                    compiled browser bundle (never edited by hand)
src/client/index.js          apply() of the browser half: locale, styles,
                             feature toggles, slot registrations
src/client/store.js          {features, config, status, lastRun}; initial load
                             from GET /cvc/state; subscribe / refresh / save / run
src/client/settings.js       the settings page (React): switches, groups,
                             buttons, last-run block
src/client/config-form.js    pure form model: field paths, defaults, drafts,
                             v1 -> v2 reading, validation
src/client/coefficients.js   DOM observer and the ×N badges
src/client/balance.js        sidebar button and the draggable panel
src/client/panel-pos.js      pure part of the panel: position clamping and the
                             status dot state
src/client/css.js            all styles under the .cvc2- prefix
src/client/i18n.js           en/ru dictionaries of the page and surfaces
tools/build-client.mjs       builds client.js (tsdown + the __ModuleLoader__
                             wrapper)
tools/assert-pack.mjs        checks the contents of the npm tarball
test/*.mjs                   node --test suites
```

## Boot and gating

`apply(ctx, config)` in `index.js` does the following:

1. Reads and validates the row configuration through the `Config` schema.
   Every field is declared `.volatile()`, so DSH applies a changed row through
   `loader/volatile-update` instead of restarting the plugin.
2. Computes the feature set from `features.*` and mounts exactly the functions
   that are on:
   - catalog sync registers its timer, the `cvc_catalog` tool, `POST /cvc/run`
     and the catalog parts of `GET /cvc/state`;
   - coefficients registers `GET /cvc/coefficients` and the shared cache client;
   - balance registers `GET /cvc/balance` and the `cvc_balance` tool.
3. On a volatile update, normalises the new row and remounts the functions so
   their timers and routes see the new values. A function that goes off releases
   its routes, timer, tool and cache subscription in the same tick; its route
   starts answering `404`. When `providers` or `catalog` changed, the shared
   catalog cache is cleared, because the route or the key may be different.

The host half declares `inject = ['configEditor', 'tools', 'credentials']`, so
Loader defers the plugin instead of crashing when one of those services is not
up yet. The web server is injected separately and optionally: in a profile
without it the plugin still runs, but only its tools work and the HTTP routes are
not attached.

The settings page is not gated. It is registered on the browser side
unconditionally, because it is the only place where the switches can be turned
back on. `GET /cvc/state` and `PUT /cvc/config` therefore exist even when all
three functions are off; `POST /cvc/run` exists only with catalog sync on.

"What a disabled function does not do" is a testable contract, not a convention:
`test/gating.test.mjs` asserts that a disabled function registers no route, no
timer and no tool, and that a volatile update mounts and unmounts it.

## Configuration

The schema has five groups. Defaults:

| Group | Field | Default | Meaning |
| --- | --- | --- | --- |
| `features` | `catalogSync` | `true` | catalog sync on |
| | `coefficients` | `true` | badges on |
| | `balance` | `true` | balance on |
| `providers` | `match` | `['cheapvibecode.ru']` | host names that identify a CVC provider |
| | `entryId` | `'llm-pi-ai'` | patch row that owns the provider routes |
| | `apiKeyEnv` | `'CVC_DEEPSEEK_API_KEY'` | fallback credential name |
| | `baseURL` | `'https://ru.cheapvibecode.ru/v1'` | base used when the row has no route of its own |
| | `timeoutMs` | `20000` | per-request timeout |
| `catalog` | `provider` | `'cheapvibecode'` | route key whose `models` are written |
| | `autoSync` | `true` | startup run plus interval runs |
| | `intervalHours` | `24` | `0` turns the timer off |
| | `startupDelayMs` | `5000` | pause before the first automatic run |
| | `minModelRatio` | `0.8` | refuse a catalog below this share of the current count |
| | `keepModels` | `[]` | ids kept even when the catalog drops them |
| | `installerUrls` | `/idhw`, `/idhl` | level maps, first reachable wins |
| | `syncAllowlist` | `true` | keep `allowedModels` aligned |
| | `allowlistEntryId` | `'subagent-model-selection-settings'` | row that holds `allowedModels` |
| | `levelsCacheMinutes` | `360` | how long the level map is reused |
| `coefficients` | `refreshMinutes` | `10` | badge re-read interval |
| | `showFast` | `true` | include the fast multiplier in the tooltip |
| `balance` | `refreshSeconds` | `0` | `0` = on demand only; 15 or more = timer while the panel is open |
| | `showDelta` | `true` | show the spend between two readings |

Two behaviours sit in `lib/config.js` rather than in the consumers:

- **Legacy normalisation.** The flat 1.x keys (`entryId`, `provider`, `baseURL`,
  `apiKeyEnv`, `installerUrls`, `autoSync`, `intervalHours`, `startupDelayMs`,
  `minModelRatio`, `keepModels`, `syncAllowlist`, `allowlistEntryId`,
  `levelsCacheMinutes`, `timeoutMs`) stay in the schema as optional deprecated
  fields. `normalizeConfig` folds them into the groups, so a profile written for
  1.0.0 loads without edits. `GET /cvc/state` reports `configShape: 'legacy'`
  when any of them was the source, and the settings page suggests saving once.
- **Validation.** `validateConfigInput` checks the values the settings page
  sends and returns field names; `PUT /cvc/config` answers `400` with `fields`
  and does not write. The form validates the obvious cases before sending, but
  the host is the authority.

## Provider resolution

`lib/providers.js` answers one question: which `cheapvibecode.ru` routes exist on
the `llm-pi-ai` row, and how is each one's key named?

Resolution reads the rows of the profile through `ctx.configEditor.entries()`
and looks for the row named by `providers.entryId` (default `llm-pi-ai`) in three
passes: by exact id, by the adapter package name
(`@deepseek-ai/dsh-llm-pi-ai`), and by id with a group prefix (`include:llm-pi-ai`
and the like). A candidate is accepted only when it actually carries a
non-empty `providers` object, so a duplicate row with `config: {}` cannot end the
search. From the accepted row it keeps the routes whose `baseURL` is `https` and
whose parsed hostname equals a host from `providers.match` or ends with
`.host` — `cheapvibecode.ru` covers `ru.cheapvibecode.ru`, while a lookalike such as
`cheapvibecode.ru.example.com` or a plain-`http` URL never matches. A route added
later in the DSH settings appears on the next read without a plugin restart,
because the lookup runs against the live entries.

`apiKeyFor(route, cfg)` returns the route's own `apiKeyEnv` when it has one and
the global `providers.apiKeyEnv` otherwise. `resolveKey(ctx, ref)` resolves that
name through `ctx.credentials.resolve` and returns the value or an empty string;
the caller turns an empty string into a `no-key` error, so the plugin reports "API
key is not configured for this provider" instead of sending an empty `Bearer`.
Nothing else is accepted: the plugin does not read `.env` or the process
environment itself, that is the credential service's job.

The shared catalog cache targets `catalog.provider`. `pickRoute(routes, key)`
prefers the route whose key matches and falls back to the first discovered CVC
route when the key names nothing, so the cache still has a catalog to serve.
Catalog sync itself addresses `catalog.provider` directly: a row whose
`provider` names no CVC route fails the run with `no route "<key>" is
configured`, rather than writing models into a route the user did not name.

All three functions use this one module. Before 2.0.0 the catalog plugin, the
coefficient plugin and the balance plugin each had their own discovery code, and
a fix in one did not reach the others.

## Shared catalog cache

`lib/cache.js` is a small TTL cache around `fetchModels`, with one instance per
plugin process:

- `get({ force })` returns the cached catalog, or fetches it when the entry is
  missing, older than `ttlMs`, or `force` is set;
- concurrent callers share one in-flight request instead of starting two;
- a failed fetch does not drop the last good payload: `get` keeps serving it with
  `stale: true` and the error text, while the next caller retries. When there is
  no snapshot yet, the error is thrown;
- `refresh()` is `get({ force: true })`; `peek()` reads without fetching (used by
  status reporting), and `clear()` drops the entry and bumps a generation counter,
  so an answer that is still in flight cannot write itself back;
- `ttlMs` is a number or a function of the current configuration, so the cache
  lifetime follows `coefficients.refreshMinutes` without recreating the cache;
- `now` is injectable, so TTL behaviour is tested without sleeping.

Catalog sync and coefficients read the same cache. That is the point of the
module: one `GET /v1/models` populates both the `models` list written into the
patch and the multiplier map drawn in the picker. A badge refresh that lands
while the cache is fresh costs no catalog request at all.

## HTTP layer

`lib/http.js` owns the transport rules so that every route answers the same way:

| Rule | Answer |
| --- | --- |
| path outside the `/cvc` prefix | `404` |
| route of a disabled function | `404` |
| `Sec-Fetch-Site: cross-site` | `403` |
| `PUT` or `POST` without `application/json` | `415` |
| body over 64 KB | `413` |
| `POST /cvc/run` refused by the shrink guard or by a stale catalog | `409` with the run result |
| wrong method on a known path | `405` with an `allow` header |
| malformed JSON in the body | `400` |

The order matters: the fence runs before the path is looked at, so a cross-site
request never learns whether a route exists, and the content-type check runs
before dispatch, so a write cannot reach a handler without being declared JSON.
`409` on `/cvc/run` is a decision, not a failure: the guard refused to write a
catalog that is smaller than `minModelRatio` of the current count, or the catalog
is stale. Other run failures (no route, no key, network) answer `200` with
`ok: false` and the diagnostic body, the same shape the `cvc_catalog` tool
returns.

Routes are registered as one prefix (`/cvc`) on `ctx.webServer.attach`, and the
plugin keeps an internal table of sub-paths. One prefix registration per plugin is
deliberate: two `webServer.register` calls for the same prefix conflict, and with a
private table a disabled function simply removes its own sub-path and answers
`404` without touching the web server. `index.js` does not create a server. Answers carry `cache-control: no-store` and
`x-content-type-options: nosniff`. `lib/http.js` also exposes the JSON helper and
the body reader used by `lib/state.js`.

Rules the HTTP layer and `lib/cvc-api.js` keep everywhere:

- an unset credential is an error about the name (`credential "…" is not
  configured`), never an empty `Bearer`;
- a `401` or `403` from the provider is raised as `CvcApiError` with code
  `unauthorized` and the provider's own message, redacted;
- a network failure, a timeout and a broken JSON body are three different errors
  with three different codes; none of them contains the key.

## Provider API calls

`lib/cvc-api.js` is the only module that talks to the provider:

| Function | Request | Answer |
| --- | --- | --- |
| `fetchModels({ baseURL, key, timeoutMs })` | `GET {baseURL}/models` | the model list, from `{ data: [...] }` or a bare array; rows without a string `id` are dropped |
| `fetchBalance({ baseURL, key, timeoutMs })` | `GET {apiRoot}/v1/balance` | `{ units }` from `token_balance` |
| `fetchLevels({ urls, timeoutMs })` | `GET <installerUrl>`, no key, each URL in turn | the `reasoningLevels` map and the URL that answered |

The installer is tried in the order of `catalog.installerUrls`, and the first one
that answers with a parseable map wins. If none does, the error lists, per URL,
whether it timed out, failed at the network, answered a non-2xx status, returned an
unreadable body, or carried no `reasoningLevels` literal.

`apiRoot(baseURL)` strips a trailing `/v1`, because a route is configured with the
OpenAI-compatible base (`…/v1`) while the balance endpoint lives one level up.
`redact(text, secret)` replaces the key with `***` in every message that can carry
provider text.

## The route contract

| Method | Path | Body | Answer |
| --- | --- | --- | --- |
| `GET` | `/cvc/state` | — | `{version, features, config, configShape, status, lastRun, patchPath, rowId}` |
| `PUT` | `/cvc/config` | `{config}` | `{ok, config, features}`, or `400` with `fields` |
| `POST` | `/cvc/run` | `{action: 'plan' \| 'apply', force?}` | the run result |
| `GET` | `/cvc/coefficients` | — | `{models: [{id, displayName, multiplier, fastMultiplier, contextWindow}], providers, fetchedAt, stale}` |
| `GET` | `/cvc/balance` | — | `{providers: [{provider, displayName, baseURL, apiKeyEnv, keySet, balanceUnits, spentSinceLast, balanceError}], fetchedAt}` |
| `GET` | `/cvc/health` | — | `{ok, version}` |

`PUT /cvc/config` and `POST /cvc/run` are writes: the first writes the plugin row,
the second writes the models and the allowlist. Both go through
`ctx.configEditor.edit()`, which preserves the rest of the patch file, its
comments and other plugins' rows. Saving the panel loses nothing it does not own:
`buildState` reports the effective configuration (the bundle layer with the profile
override on top) and `PUT` writes the row back only through that editor; a save
whose value equals the schema defaults removes the override instead of writing a
copy of the defaults into the patch.

## Where each decision is made

| Decision | Module | Why there |
| --- | --- | --- |
| is a function on? | `index.js` | the switch is a plugin-level fact, and mounting is a plugin-level effect |
| which routes are CVC? | `lib/providers.js` | one lookup for three functions; the alternative was three copies |
| how is a model built? | `lib/catalog-build.js` | pure function, fed by catalog + levels + options; testable without DSH |
| is the catalog too small? | `lib/catalog-sync.js` | the guard needs the current list, which only the apply path reads |
| what does a badge say? | `lib/coefficients.js` (host) and `src/client/coefficients.js` (drawing) | the host decides the number, the browser decides the pixel |
| is a balance reading an expense? | `lib/balance.js` | the previous reading is process state, and only the host holds it |
| how does the page look? | `src/client/settings.js` + `css.js` + `i18n.js` | the browser half owns the rendering and the wording |

## Catalog sync

A run is `plan` or `apply`; both build the same candidate list:

1. `lib/cvc-api.js` fetches `{baseURL}/models` with the route's key and the
   installer page (first reachable of `installerUrls`), then extracts the
   `reasoningLevels` literal linearly — no backtracking regular expression on
   downloaded text.
2. `lib/catalog-build.js` turns each catalog row into an `llm-pi-ai` model:
   `name` is the part of `display_name` after ` · `, `contextWindow` is
   `context_window`, `maxTokens` is `min(max_output_tokens, contextWindow)`,
   `input` gains `image` when the model accepts images, the `none` level becomes
   `off: none`, and `gpt-image*` plus models without text output are skipped.
   A field missing from the catalog falls back to the current patch entry, then
   to a default, so a manual edit is not lost.
3. `lib/catalog-sync.js` diffs the candidate list against the current models and
   reports added / removed / changed.
4. The shrink guard refuses an `apply` when the candidate count is below
   `minModelRatio` of the current count, unless `force: true`.
5. `apply` writes the models and, with `syncAllowlist`, the
   `subagent-model-selection-settings.allowedModels` list. Both writes read the
   current value inside the editor callback, so a concurrent edit is not
   overwritten. The write happens only when something actually changed;
   a second apply is a no-op.
6. Timer runs are the same code path with `apply` and no `force`.

The `cvc_catalog` tool exposes `status`, `plan` and `apply`; `status` answers
from the in-process last-run record and does not touch the network. The tool is
registered only while catalog sync is mounted, so with the function off it is not
in the tool list at all.

## Coefficients

`lib/coefficients.js` indexes the catalog into `{id → multiplier, fastMultiplier,
displayName, contextWindow}` and serves it on `GET /cvc/coefficients`. The answer
also carries the provider ids that own the cached catalog, because the browser
must not decorate a model id that belongs to another provider.

The browser half (`src/client/coefficients.js`) does not replace the model
selector. It watches the document for `[data-model-id]` nodes, reads
`data-provider-id` from the same node, and appends a `<span class="cvc2-badge">`
only when the provider is in the list and the model has a multiplier. Missing
multiplier means no badge — the plugin does not guess a price. The badge is
`pointer-events: none`, so clicks and keyboard selection stay with the selector.
The observer skips mutations inside its own badges, which is what keeps it from
looping; a `requestAnimationFrame` coalesces redraws while the user types in the
model search. Stopping the function disconnects the observer and removes every
badge it drew.

The slot `conversation.input.model.label` stays untouched: it is `single`, it is
already owned by the built-in badge, and a second registration would displace it.

## Balance

`lib/balance.js` reads every CVC route's balance with `GET {apiRoot}/v1/balance`:

- `apiRoot` is the route's `baseURL` with a trailing `/v1` removed, so the
  request goes to the host the route already names;
- `token_balance` becomes `balanceUnits`; `keySet` reports whether the credential
  was found, never the value;
- one provider's failure is recorded in its own `balanceError` and does not stop
  the other providers from answering;
- `spentSinceLast` is the drop between the previous and the current reading and
  lives in the memory of the process, so it is lost on restart;
- the `cvc_balance` tool returns the last snapshot without spending a request. Its
  rows are `{provider, displayName, keySet, balanceUnits}` — `keySet` is the
  boolean, and neither `baseURL` nor `apiKeyEnv` is repeated there, because the
  tool answers the agent rather than rendering a panel.

The browser panel draws the cards, the spend line, the status dot and the drag
handling. It stores its position in `localStorage` under `cvc:panel-pos`, not
`cvc-balance:panel-pos` — the old key belonged to the 1.1.0 panel, whose
coordinates can fall outside the viewport.

The `cvc_balance` tool is registered only while the balance function is mounted.
It speaks for the agent side; the panel is the human side. Coefficients register
no tool: the badges are read-only decoration, and there is nothing for a tool to
do.

## The browser half

`src/client/index.js` registers four surfaces:

| Surface | Slot | Always on? |
| --- | --- | --- |
| settings page | `settings.section` (id `cvc`, order 25) | yes |
| settings icon | `settings.section.icon` | yes |
| bundle block | `plugins.bundle.config` (key = package name) | yes |
| balance button and panel | `sidebar.footer.action` (id `cvc-balance`, order 5) | only with `features.balance` |
| coefficient badges | DOM observer, no slot | only with `features.coefficients` |

The page is registered in two seats with the same component: the settings section
and the plugin page block. In the plugin list the block asks for `view: 'summary'`
and renders one line, because the full form does not fit there. The three feature
switches are buttons with `role="switch"` and `aria-checked`, so a screen reader
announces them as on/off controls rather than as buttons.

Status reads left to right as follows. The **last run** block under the buttons
shows the catalog size, the current and next model count, the level source, the
added / removed / changed models, allowlist changes, warnings and the patch path.
The balance dot is `warn` while a refresh is running, `err` when the request
failed and no provider row exists, neutral when no CVC route is configured at all,
`ok` when every provider returned a number, `warn` when only some did, and `err`
when none did.

`store.js` is the single client-side source of truth. It starts with the schema
defaults (all three functions on), loads `GET /cvc/state`, publishes changes to
subscribers, and updates itself from the answer of `PUT /cvc/config` and
`POST /cvc/run` without a second round trip. A feature change is detected by a
short key of the three booleans, which is what wakes the toggles that mount and
unmount the balance button and the badge observer. `refresh()` collapses
concurrent calls into one request: the page and the balance button may both ask.
`coefficients()` and `balance()` return `{ok, status, body, error}` instead of
throwing: a `404` from a function that was switched off a moment ago is an
expected answer, not an exception.

All class names live under `.cvc2-`. The prefix is deliberate: 1.0.0 used
`.cvc-sync`, the private plugins used `.cvc-coeff` and `.cvc-panel`, and a plugin
row left over during an upgrade must not inherit the new styles.

## Why not Remote namespaces

The browser-side Remote table is generated when DSH is built, from the host
packages in `@deepseek-ai/dsh-api-remotes`. A third-party plugin cannot add a
namespace to it, so `ctx.remote.<something>` would be `undefined` in the browser.
That is why every function here owns plain HTTP routes and the browser calls them
with `fetch`, the same way `dshmarket` does. The plugin also does not spawn a
process: a permanently installed plugin runs in the ordinary Node process, where
`fetch` is available directly.

## Why a peer dependency on schemastery

The row configuration is validated by a `Config` schema. `@deepseek-ai/schemastery`
is the schema library DSH itself uses, so it is already present in every DSH
installation, and it is declared as an optional peer dependency: the profile takes
it from the DSH package tree, and a missing peer does not break installation. The
alternative — bundling a second copy — would validate with a different instance
than the host and confuse error messages.

## Build

`index.js` and `lib/**` are loaded as they are; there is no build step for the
host half. The browser half is compiled because it is several ESM modules that
must become one `window.__ModuleLoader__.load({ id, factory })` artifact:

- `tools/build-client.mjs` runs `tsdown` over `src/client/index.js`, marks
  `react` and `@deepseek-ai/*` as external, and wraps the result in the loader
  call under the package name;
- the compiled `client.js` is committed, so npm and git installs work without a
  build on the user's machine and without `allowBuilds`;
- CI runs `npm run build` and `git diff --exit-code client.js`, so a change in
  `src/client/**` that was not rebuilt fails the pipeline.

`tsdown` requires Node 22.18 or newer for building; the plugin itself runs on
Node 20 or newer, and the published package contains the compiled file.

## Tests

`npm test` runs `node --test test/*.mjs`. The suites follow the module map, so a
failure names the layer that broke:

| File | Covers |
| --- | --- |
| `config.test.mjs` | schema defaults, v1 -> v2 normalisation, rejected values, defaults matching the schema |
| `providers.test.mjs` | route lookup by `baseURL`, field precedence, no route found |
| `cvc-api.test.mjs` | the provider client: addresses, timeouts, 401/403, broken JSON, the key never appearing in an error |
| `http.test.mjs` | the fence, the body limit, 415, 404 for a disabled function |
| `state.test.mjs` | patch layers, reset to defaults, `GET /cvc/state` assembly, the last-run registry |
| `gating.test.mjs` | a disabled function registers nothing; `loader/volatile-update` mounts and unmounts |
| `api.test.mjs` | the HTTP contract through a live `apply()`: state, config, run |
| `catalog-build.test.mjs` | model building: names, context, vision, levels, keepModels, image models |
| `catalog-sync.test.mjs` | plan and apply on a fake `configEditor`, idempotency, the shrink guard, `force`, the allowlist |
| `catalog-tool.test.mjs` | the `cvc_catalog` tool contract |
| `coefficients.test.mjs` | catalog indexing, id matching, multiplier formatting, no multiplier means no badge |
| `balance.test.mjs` | snapshot, the spend delta, a rising balance is not spend, one provider failing |
| `client-store.test.mjs` | initial load, feature changes, save, run |
| `client-render.test.mjs` | the settings page on a fake React |

Shared fakes (React, DOM, `configEditor`) live in `test/helpers/`.

---

# Архитектура

Этот документ описывает устройство `cvc-catalog-sync-plugin` 2.0.0: что
работает на хосте, что в браузере, где принимается каждое решение и почему части
разделены именно так. Он написан для того, кто будет плагин менять, а не для
пользователя: пользовательский текст — в [README.ru.md](../README.ru.md).

## Один пакет, две половины, три функции

Плагин — это бандл DSH: хост-половина и браузерная половина в одном npm-пакете.

- **Хост-половина** — обычный ESM (`index.js`, `lib/**`). Её загружает процесс
  DSH, она регистрирует HTTP-маршруты на веб-сервере DSH, читает конфигурацию
  провайдеров и профильный патч и только она вообще видит ключ API.
- **Браузерная половина** собирается из `src/client/**` в `client.js`. Она
  рисует три поверхности — страницу настроек, бейджи коэффициентов, кнопку и
  панель баланса — и общается с хостом только через собственные HTTP-маршруты
  плагина.
- **Три функции** поверх этого разделения — синхронизация каталога,
  коэффициенты и баланс. Они независимы: каждая может быть выключена, пока
  работают остальные, а страница настроек — это коммутатор, который остаётся на
  месте при всех трёх выключенных.

Патч бандла `cordis.patch.yml` вставляет одну строку `cvc-catalog-sync` с тремя
включёнными переключателями. Эта же строка — поверхность конфигурации: страница
настроек правит её через `ctx.configEditor`.

## Карта модулей

```text
index.js                     apply(); схема Config; гейтинг функций; обработка
                             loader/volatile-update
lib/config.js                Config (schemastery), normalizeConfig(v1 + v2),
                             validateConfigInput
lib/providers.js             resolveRoutes(ctx, cfg) -> маршруты CVC в строке
                             llm-pi-ai; resolveKey(ctx, ref)
lib/cvc-api.js               fetchModels, fetchBalance, fetchLevels; таймауты,
                             ошибки, ключа в сообщениях нет
lib/cache.js                 createCatalogCache({ client, ttlMs, now });
                             get / peek / clear
lib/catalog-build.js         buildModels(catalog, levels, options): чистая
                             логика, перенесённая из 1.0.0
lib/catalog-sync.js          план и применение: дифф, guard, запись патча,
                             allowlist, инструмент cvc_catalog, таймер
lib/coefficients.js          indexCoefficients(catalog), GET /cvc/coefficients
lib/balance.js               снимок, дельта расхода, GET /cvc/balance,
                             инструмент cvc_balance
lib/http.js                  JSON-помощники, лимит тела 64 КБ, same-origin
                             фенс, регистрация prefix-маршрута
lib/state.js                 GET /cvc/state, PUT /cvc/config, lastRun/status
lib/CONTRACT.js              замороженный контракт, которому следуют три
                             модуля функций и клиент (документация в коде)
client.js                    собранный браузерный бандл (руками не правится)
src/client/index.js          apply() браузерной половины: локаль, стили,
                             переключатели функций, регистрации слотов
src/client/store.js          {features, config, status, lastRun}; начальная
                             загрузка из GET /cvc/state; subscribe / refresh /
                             save / run
src/client/settings.js       страница настроек (React): переключатели, группы,
                             кнопки, блок последнего прогона
src/client/config-form.js    чистая модель формы: пути полей, умолчания,
                             черновики, чтение v1 -> v2, проверка
src/client/coefficients.js   наблюдатель DOM и бейджи ×N
src/client/balance.js        кнопка в сайдбаре и перетаскиваемая панель
src/client/panel-pos.js      чистая часть панели: прижатие позиции и состояние
                             точки
src/client/css.js            все стили под префиксом .cvc2-
src/client/i18n.js           словари en/ru страницы и поверхностей
tools/build-client.mjs       сборка client.js (tsdown + обёртка __ModuleLoader__)
tools/assert-pack.mjs        проверка состава npm-тарбола
test/*.mjs                   наборы node --test
```

## Запуск и гейтинг

`apply(ctx, config)` в `index.js` делает следующее:

1. Читает и проверяет конфигурацию строки через схему `Config`. Каждое поле
   объявлено `.volatile()`, поэтому изменённую строку DSH применяет через
   `loader/volatile-update`, а не перезапуском плагина.
2. Вычисляет набор функций из `features.*` и монтирует ровно те, что включены:
   - синхронизация каталога регистрирует таймер, инструмент `cvc_catalog`,
     `POST /cvc/run` и относящуюся к каталогу часть `GET /cvc/state`;
   - коэффициенты регистрируют `GET /cvc/coefficients` и клиент общего кэша;
   - баланс регистрирует `GET /cvc/balance` и инструмент `cvc_balance`.
3. При volatile-обновлении нормализует новую строку и перемонтирует функции,
   чтобы их таймеры и маршруты увидели новые значения. Выключенная функция
   освобождает свои маршруты, таймер, инструмент и подписку на кэш в том же
   такте; её маршрут начинает отвечать `404`. Если изменились `providers` или
   `catalog`, общий кэш каталога очищается: маршрут или ключ могли стать другими.

Хост-половина объявляет `inject = ['configEditor', 'tools', 'credentials']`,
поэтому Loader откладывает запуск плагина, а не падает, когда одного из этих
сервисов ещё нет. Веб-сервер подключается отдельно и необязательно: в профиле
без него плагин работает, но доступны только его инструменты, а HTTP-маршруты не
регистрируются.

Страница настроек не гейтится. Она регистрируется в браузере всегда, потому что
это единственное место, где переключатели можно включить обратно. Поэтому
`GET /cvc/state` и `PUT /cvc/config` существуют даже при всех трёх выключенных
функциях; `POST /cvc/run` существует только при включённой синхронизации.

«Чего выключенная функция не делает» — это проверяемый контракт, а не
соглашение: `test/gating.test.mjs` утверждает, что выключенная функция не
регистрирует ни маршрута, ни таймера, ни инструмента, и что volatile-обновление
монтирует и снимает её.

## Конфигурация

В схеме пять групп. Умолчания:

| Группа | Поле | Умолчание | Смысл |
| --- | --- | --- | --- |
| `features` | `catalogSync` | `true` | синхронизация каталога включена |
| | `coefficients` | `true` | бейджи включены |
| | `balance` | `true` | баланс включён |
| `providers` | `match` | `['cheapvibecode.ru']` | хосты, по которым узнаётся провайдер CVC |
| | `entryId` | `'llm-pi-ai'` | строка патча с маршрутами провайдеров |
| | `apiKeyEnv` | `'CVC_DEEPSEEK_API_KEY'` | запасное имя ключа |
| | `baseURL` | `'https://ru.cheapvibecode.ru/v1'` | база, когда у строки нет своего маршрута |
| | `timeoutMs` | `20000` | таймаут одного запроса |
| `catalog` | `provider` | `'cheapvibecode'` | ключ маршрута, чьи `models` записываются |
| | `autoSync` | `true` | прогон при старте и по интервалу |
| | `intervalHours` | `24` | `0` выключает таймер |
| | `startupDelayMs` | `5000` | пауза перед первым автоматическим прогоном |
| | `minModelRatio` | `0.8` | не принимать каталог меньше этой доли от текущего числа |
| | `keepModels` | `[]` | id, сохраняемые даже при исчезновении из каталога |
| | `installerUrls` | `/idhw`, `/idhl` | карты уровней, побеждает первый доступный |
| | `syncAllowlist` | `true` | держать `allowedModels` в соответствии |
| | `allowlistEntryId` | `'subagent-model-selection-settings'` | строка, где лежит `allowedModels` |
| | `levelsCacheMinutes` | `360` | сколько времени переиспользуется карта уровней |
| `coefficients` | `refreshMinutes` | `10` | период повторного чтения бейджей |
| | `showFast` | `true` | добавлять быстрый множитель в подсказку |
| `balance` | `refreshSeconds` | `0` | `0` — только по запросу; 15 и больше — таймер, пока панель открыта |
| | `showDelta` | `true` | показывать расход между двумя замерами |

Два поведения живут в `lib/config.js`, а не в потребителях:

- **Нормализация старого вида.** Плоские ключи 1.x (`entryId`, `provider`,
  `baseURL`, `apiKeyEnv`, `installerUrls`, `autoSync`, `intervalHours`,
  `startupDelayMs`, `minModelRatio`, `keepModels`, `syncAllowlist`,
  `allowlistEntryId`, `levelsCacheMinutes`, `timeoutMs`) остаются в схеме
  необязательными устаревшими полями. `normalizeConfig` раскладывает их по
  группам, поэтому профиль, написанный для 1.0.0, загружается без правок.
  `GET /cvc/state` сообщает `configShape: 'legacy'`, если источником было хоть
  одно из них, и страница настроек предлагает сохранить один раз.
- **Проверка.** `validateConfigInput` проверяет значения, которые присылает
  страница настроек, и возвращает имена полей; `PUT /cvc/config` отвечает `400`
  с `fields` и ничего не записывает. Форма проверяет очевидные случаи до
  отправки, но истина — на хосте.

## Поиск провайдеров

`lib/providers.js` отвечает на один вопрос: какие маршруты `cheapvibecode.ru`
есть в строке `llm-pi-ai` и как называется ключ каждого?

Поиск читает строки профиля через `ctx.configEditor.entries()` и ищет строку,
названную `providers.entryId` (по умолчанию `llm-pi-ai`), в три прохода: по
точному id, по имени пакета адаптера (`@deepseek-ai/dsh-llm-pi-ai`) и по id с
префиксом группы (`include:llm-pi-ai` и подобные). Кандидат принимается, только
если он действительно несёт непустой объект `providers`, поэтому строка-дубль с
`config: {}` не может закончить поиск. Из принятой строки остаются маршруты, чей
`baseURL` — `https` и чей разобранный hostname равен хосту из `providers.match`
или оканчивается на `.хост`: `cheapvibecode.ru` покрывает
`ru.cheapvibecode.ru`, а похожий `cheapvibecode.ru.example.com` и обычный `http`
не совпадают никогда. Маршрут, добавленный позже в настройках DSH, появляется
при следующем чтении без перезапуска плагина: поиск идёт по живым строкам.

`apiKeyFor(route, cfg)` возвращает собственный `apiKeyEnv` маршрута, если он
есть, иначе общий `providers.apiKeyEnv`. `resolveKey(ctx, ref)` разрешает это имя
через `ctx.credentials.resolve` и возвращает значение или пустую строку;
вызывающий превращает пустую строку в ошибку `no-key`, поэтому плагин сообщает
«API key is not configured for this provider», а не отправляет пустой `Bearer`.
Другого не принимается: плагин не читает `.env` и переменные окружения сам — это
работа сервиса ключей.

Общий кэш каталога нацелен на `catalog.provider`. `pickRoute(routes, key)`
предпочитает маршрут с совпавшим ключом и откатывается к первому найденному
маршруту CVC, если ключ ни на что не указывает, — чтобы кэшу было что отдать.
Сама синхронизация каталога адресует `catalog.provider` напрямую: строка, чей
`provider` не называет ни одного маршрута CVC, валит прогон с `no route "<key>"
is configured`, а не пишет модели в маршрут, который пользователь не называл.

Все три функции используют этот один модуль. До 2.0.0 у плагина каталога, у
плагина коэффициентов и у плагина баланса был свой код поиска, и исправление в
одном не доходило до остальных.

## Общий кэш каталога

`lib/cache.js` — небольшой TTL-кэш вокруг `fetchModels`, один экземпляр на
процесс плагина:

- `get({ force })` возвращает кэшированный каталог или забирает его, когда
  записи нет, она старше `ttlMs` или передан `force`;
- параллельные вызовы делят один запрос вместо двух;
- неудачный запрос не теряет последний удачный ответ: `get` продолжает его
  отдавать с `stale: true` и текстом ошибки, а следующий вызов повторяет
  попытку. Если снимка ещё нет, ошибка пробрасывается;
- `refresh()` — это `get({ force: true })`; `peek()` читает без запроса (им
  пользуется отчёт о состоянии), а `clear()` выбрасывает запись и увеличивает
  счётчик поколения, поэтому ещё летящий ответ не может записать себя обратно;
- `ttlMs` — число или функция от текущего конфига, поэтому время жизни кэша
  следует за `coefficients.refreshMinutes` без пересоздания кэша;
- `now` инъектируется, поэтому поведение TTL проверяется без сна.

Синхронизация каталога и коэффициенты читают один и тот же кэш. В этом и смысл
модуля: один `GET /v1/models` наполняет и список `models`, записываемый в патч, и
карту множителей, рисуемую в селекторе. Обновление бейджей, попавшее в свежий
кэш, не стоит ни одного запроса к каталогу.

## HTTP-слой

`lib/http.js` держит правила транспорта, чтобы все маршруты отвечали одинаково:

| Правило | Ответ |
| --- | --- |
| путь вне префикса `/cvc` | `404` |
| маршрут выключенной функции | `404` |
| `Sec-Fetch-Site: cross-site` | `403` |
| `PUT` или `POST` без `application/json` | `415` |
| тело больше 64 КБ | `413` |
| `POST /cvc/run` отклонён guard-ом от усыхания или устаревшим каталогом | `409` с результатом прогона |
| неверный метод на известном пути | `405` с заголовком `allow` |
| битый JSON в теле | `400` |

Порядок важен: фенс срабатывает раньше разбора пути, поэтому межсайтовый запрос
никогда не узнаёт, существует ли маршрут, а проверка content-type идёт до
диспетчеризации, поэтому запись не может дойти до обработчика, не объявив себя
JSON. `409` на `/cvc/run` — это решение, а не сбой: guard отказался записывать
каталог меньше `minModelRatio` от текущего числа, либо каталог устарел. Прочие
неудачи прогона (нет маршрута, нет ключа, сеть) отвечают `200` с `ok: false` и
диагностическим телом — той же формой, что возвращает инструмент `cvc_catalog`.

Маршруты регистрируются одним префиксом (`/cvc`) через `ctx.webServer.attach`, и
плагин держит собственную таблицу подпутей. Одна регистрация префикса на плагин
намеренна: две регистрации одного префикса на веб-сервере конфликтуют, а с
собственной таблицей выключенная функция просто убирает свой подпуть и отвечает
`404`, не трогая веб-сервер. Свой сервер `index.js` не создаёт. Ответы несут `cache-control: no-store` и
`x-content-type-options: nosniff`. `lib/http.js` также отдаёт JSON-помощник и
чтение тела, которыми пользуется `lib/state.js`.

Правила, которые соблюдают HTTP-слой и `lib/cvc-api.js` везде:

- незаданный ключ — это ошибка про имя (`credential "…" is not configured`), а не
  пустой `Bearer`;
- `401` или `403` провайдера поднимается как `CvcApiError` с кодом
  `unauthorized` и собственным сообщением провайдера, прошедшим redact;
- сетевая ошибка, таймаут и битое тело JSON — три разные ошибки с тремя разными
  кодами; ни в одной из них нет ключа.

## Запросы к API провайдера

`lib/cvc-api.js` — единственный модуль, который общается с провайдером:

| Функция | Запрос | Ответ |
| --- | --- | --- |
| `fetchModels({ baseURL, key, timeoutMs })` | `GET {baseURL}/models` | список моделей из `{ data: [...] }` или голого массива; строки без строкового `id` отбрасываются |
| `fetchBalance({ baseURL, key, timeoutMs })` | `GET {apiRoot}/v1/balance` | `{ units }` из `token_balance` |
| `fetchLevels({ urls, timeoutMs })` | `GET <адрес установщика>`, без ключа, по очереди | карта `reasoningLevels` и ответивший адрес |

Установщик пробуется в порядке `catalog.installerUrls`, и побеждает первый, что
ответил разбираемой картой. Если не ответил ни один, ошибка перечисляет по
каждому адресу, был ли таймаут, сетевая ошибка, не-2xx статус, нечитаемое тело
или отсутствие литерала `reasoningLevels`.

`apiRoot(baseURL)` снимает хвостовой `/v1`, потому что маршрут настраивается
OpenAI-совместимой базой (`…/v1`), а эндпоинт баланса живёт на уровень выше.
`redact(text, secret)` заменяет ключ на `***` во всех сообщениях, куда может
попасть текст провайдера.

## Контракт маршрутов

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| `GET` | `/cvc/state` | — | `{version, features, config, configShape, status, lastRun, patchPath, rowId}` |
| `PUT` | `/cvc/config` | `{config}` | `{ok, config, features}` либо `400` с `fields` |
| `POST` | `/cvc/run` | `{action: 'plan' \| 'apply', force?}` | результат прогона |
| `GET` | `/cvc/coefficients` | — | `{models: [{id, displayName, multiplier, fastMultiplier, contextWindow}], providers, fetchedAt, stale}` |
| `GET` | `/cvc/balance` | — | `{providers: [{provider, displayName, baseURL, apiKeyEnv, keySet, balanceUnits, spentSinceLast, balanceError}], fetchedAt}` |
| `GET` | `/cvc/health` | — | `{ok, version}` |

`PUT /cvc/config` и `POST /cvc/run` — записи: первая пишет строку плагина, вторая
пишет модели и список сабагентов. Обе идут через `ctx.configEditor.edit()`,
который сохраняет остальной файл патча, комментарии и строки чужих плагинов.
Сохранение через страницу ничего чужого не теряет: `buildState` отдаёт
действующий конфиг (слой бандла с наложенным переопределением профиля), а `PUT`
пишет строку обратно только этим редактором; сохранение со значением, равным
умолчаниям схемы, удаляет переопределение, а не записывает копию умолчаний в
патч.

## Где принимается какое решение

| Решение | Модуль | Почему там |
| --- | --- | --- |
| включена ли функция? | `index.js` | переключатель — факт уровня плагина, а монтирование — эффект уровня плагина |
| какие маршруты CVC? | `lib/providers.js` | один поиск на три функции; альтернатива — три копии |
| как строится модель? | `lib/catalog-build.js` | чистая функция от каталога, уровней и настроек; проверяется без DSH |
| не слишком ли мал каталог? | `lib/catalog-sync.js` | guard нуждается в текущем списке, а его читает только путь применения |
| что говорит бейдж? | `lib/coefficients.js` (хост) и `src/client/coefficients.js` (рисование) | хост решает, что за число, браузер — как это выглядит |
| расход ли это? | `lib/balance.js` | прошлый замер — состояние процесса, и держит его только хост |
| как выглядит страница? | `src/client/settings.js` + `css.js` + `i18n.js` | рендеринг и формулировки принадлежат браузерной половине |

## Синхронизация каталога

Прогон бывает `plan` или `apply`; оба собирают один и тот же список-кандидат:

1. `lib/cvc-api.js` забирает `{baseURL}/models` ключом маршрута и страницу
   установщика (первый доступный из `installerUrls`), затем извлекает литерал
   `reasoningLevels` линейно — без возвратной регулярки на скачанном тексте.
2. `lib/catalog-build.js` превращает каждую строку каталога в модель
   `llm-pi-ai`: `name` — часть `display_name` после ` · `, `contextWindow` —
   `context_window`, `maxTokens` — `min(max_output_tokens, contextWindow)`,
   `input` получает `image`, когда модель принимает картинки, уровень `none`
   становится `off: none`, а `gpt-image*` и модели без текстового вывода
   пропускаются. Поле, которого нет в каталоге, берётся из текущей записи патча,
   затем из умолчания, поэтому ручная правка не теряется.
3. `lib/catalog-sync.js` сравнивает список-кандидат с текущими моделями и
   сообщает добавленные, удалённые и изменённые.
4. Guard от усыхания отклоняет `apply`, если число кандидатов ниже
   `minModelRatio` от текущего числа, кроме случая `force: true`.
5. `apply` пишет модели и, при `syncAllowlist`, список
   `subagent-model-selection-settings.allowedModels`. Обе записи читают текущее
   значение внутри колбэка редактора, поэтому параллельная правка не
   затирается. Запись выполняется только при реальном изменении; второй `apply`
   ничего не делает.
6. Прогоны по таймеру — тот же путь с `apply` и без `force`.

Инструмент `cvc_catalog` открывает `status`, `plan` и `apply`; `status` отвечает
по записи о последнем прогоне в процессе и сети не касается. Инструмент
регистрируется только пока синхронизация каталога смонтирована: при выключенной
функции его нет в списке инструментов вовсе.

## Коэффициенты

`lib/coefficients.js` индексирует каталог в `{id → multiplier, fastMultiplier,
displayName, contextWindow}` и отдаёт это на `GET /cvc/coefficients`. Ответ
несёт ещё и id провайдеров, которым принадлежит кэшированный каталог, потому что
браузер не должен украшать id модели чужого провайдера.

Браузерная половина (`src/client/coefficients.js`) не заменяет селектор модели.
Она наблюдает документ за узлами `[data-model-id]`, читает `data-provider-id` из
того же узла и дописывает `<span class="cvc2-badge">`, только когда провайдер
есть в списке и у модели есть множитель. Нет множителя — нет бейджа: цену
плагин не угадывает. Бейдж с `pointer-events: none`, поэтому клики и выбор с
клавиатуры остаются у селектора. Наблюдатель пропускает мутации внутри своих
бейджей — это и не даёт ему зациклиться; `requestAnimationFrame` схлопывает
перерисовки, пока пользователь печатает в поиске моделей. Остановка функции
отключает наблюдателя и снимает все нарисованные бейджи.

Слот `conversation.input.model.label` не трогается: он `single`, его уже держит
штатный бейдж, и вторая регистрация вытеснила бы его.

## Баланс

`lib/balance.js` читает баланс каждого маршрута CVC через
`GET {apiRoot}/v1/balance`:

- `apiRoot` — это `baseURL` маршрута без хвостового `/v1`, поэтому запрос идёт
  на тот хост, который маршрут уже называет;
- `token_balance` становится `balanceUnits`; `keySet` сообщает, найден ли ключ,
  а не его значение;
- отказ одного провайдера записывается в его собственный `balanceError` и не
  мешает остальным ответить;
- `spentSinceLast` — падение между прошлым и текущим замером, и живёт он в
  памяти процесса, поэтому теряется при перезапуске;
- инструмент `cvc_balance` возвращает последний снимок, не тратя запрос. Его
  строки — `{provider, displayName, keySet, balanceUnits}`, где `keySet` — булев
  факт наличия ключа; `baseURL` и `apiKeyEnv` там не повторяются, потому что
  инструмент отвечает агенту, а не рисует панель.

Панель в браузере рисует карточки, строку расхода, точку состояния и
перетаскивание. Позицию она хранит в `localStorage` под ключом `cvc:panel-pos`, а
не `cvc-balance:panel-pos`: старый ключ принадлежал панели 1.1.0, и её
координаты могут оказаться за пределами окна.

Инструмент `cvc_balance` регистрируется только пока функция баланса
смонтирована. Он говорит за сторону агента; панель — сторона человека.
Коэффициенты инструмента не регистрируют: бейджи — только чтение, и делать
инструменту нечего.

## Браузерная половина

`src/client/index.js` регистрирует четыре поверхности:

| Поверхность | Слот | Всегда включена? |
| --- | --- | --- |
| страница настроек | `settings.section` (id `cvc`, order 25) | да |
| значок настроек | `settings.section.icon` | да |
| блок бандла | `plugins.bundle.config` (ключ — имя пакета) | да |
| кнопка и панель баланса | `sidebar.footer.action` (id `cvc-balance`, order 5) | только при `features.balance` |
| бейджи коэффициентов | наблюдатель DOM, без слота | только при `features.coefficients` |

Страница регистрируется в двух местах одним компонентом: секцией настроек и
блоком на странице плагина. В списке плагинов блок просит `view: 'summary'` и
рисует одну строку, потому что полная форма там не помещается. Три переключателя
функций — кнопки с `role="switch"` и `aria-checked`, поэтому экранный диктор
объявляет их переключателями вкл/выкл, а не кнопками.

Состояние читается слева направо так. Блок **последнего прогона** под кнопками
показывает размер каталога, текущее и будущее число моделей, источник уровней,
добавленные, удалённые и изменённые модели, правки списка сабагентов,
предупреждения и путь патча. Точка баланса: `warn`, пока идёт обновление;
`err`, когда запрос упал и строк провайдеров нет; нейтральная, когда маршрут CVC
не настроен вовсе; `ok`, когда все провайдеры вернули число; `warn`, когда только
часть; `err`, когда ни один.

`store.js` — единственный источник истины на клиенте. Он стартует с умолчаний
схемы (все три функции включены), загружает `GET /cvc/state`, публикует
изменения подписчикам и обновляется из ответа `PUT /cvc/config` и
`POST /cvc/run` без второго запроса. Смену набора функций он замечает по
короткому ключу из трёх булевых значений — это и будит переключатели, которые
монтируют и снимают кнопку баланса и наблюдатель бейджей. `refresh()`
схлопывает параллельные вызовы в один запрос: страница и кнопка баланса могут
спросить одновременно. `coefficients()` и `balance()` возвращают
`{ok, status, body, error}` вместо выброса: `404` от функции, выключенной
мгновение назад, — ожидаемый ответ, а не исключение.

Все имена классов живут под `.cvc2-`. Префикс намеренный: 1.0.0 использовал
`.cvc-sync`, приватные плагины — `.cvc-coeff` и `.cvc-panel`, и оставшаяся при
обновлении строка плагина не должна унаследовать новые стили.

## Почему не Remote-неймспейсы

Таблица Remote на стороне браузера генерируется при сборке DSH из хост-пакетов
в `@deepseek-ai/dsh-api-remotes`. Сторонний плагин не может добавить в неё свой
неймспейс, поэтому `ctx.remote.<что-то>` в браузере был бы `undefined`. Именно
поэтому каждая функция здесь владеет обычными HTTP-маршрутами, а браузер
вызывает их через `fetch` — так же, как `dshmarket`. Плагин не запускает и
дочерний процесс: постоянно установленный плагин выполняется в обычном
Node-процессе, где `fetch` доступен напрямую.

## Почему schemastery — peer-зависимость

Конфигурацию строки проверяет схема `Config`. `@deepseek-ai/schemastery` — та
самая библиотека схем, которую использует сам DSH, поэтому она уже есть в любой
установке DSH, и объявлена она необязательной peer-зависимостью: профиль берёт её
из дерева пакетов DSH, а отсутствие peer не ломает установку. Альтернатива —
вложить вторую копию — проверяла бы другой копией, чем хост, и путала бы
сообщения об ошибках.

## Сборка

`index.js` и `lib/**` загружаются как есть; шага сборки у хост-половины нет.
Браузерная половина собирается, потому что это несколько ESM-модулей, которые
должны стать одним артефактом `window.__ModuleLoader__.load({ id, factory })`:

- `tools/build-client.mjs` прогоняет `tsdown` по `src/client/index.js`, помечает
  `react` и `@deepseek-ai/*` внешними и заворачивает результат в вызов
  загрузчика под именем пакета;
- собранный `client.js` коммитится, поэтому установка из npm и из git работает
  без сборки на машине пользователя и без `allowBuilds`;
- CI выполняет `npm run build` и `git diff --exit-code client.js`, поэтому
  изменение в `src/client/**`, которое не пересобрали, валит пайплайн.

`tsdown` требует Node 22.18 или новее для сборки; сам плагин работает на Node 20
или новее, а опубликованный пакет содержит собранный файл.

## Тесты

`npm test` запускает `node --test test/*.mjs`. Наборы идут по карте модулей,
поэтому падение называет слой, который сломался:

| Файл | Что покрывает |
| --- | --- |
| `config.test.mjs` | умолчания схемы, нормализацию v1 -> v2, отказ невалидных значений, совпадение умолчаний со схемой |
| `providers.test.mjs` | поиск маршрутов по `baseURL`, приоритет полей, отсутствие маршрута |
| `cvc-api.test.mjs` | клиент провайдера: адреса, таймауты, 401/403, битый JSON, отсутствие ключа в тексте ошибки |
| `http.test.mjs` | фенс, лимит тела, 415, 404 при выключенной функции |
| `state.test.mjs` | слои патча, сброс к умолчаниям, сборку `GET /cvc/state`, реестр последнего прогона |
| `gating.test.mjs` | выключенная функция не регистрирует ничего; `loader/volatile-update` монтирует и снимает |
| `api.test.mjs` | HTTP-контракт на живом `apply()`: state, config, run |
| `catalog-build.test.mjs` | сборку моделей: имена, контекст, зрение, уровни, keepModels, image-модели |
| `catalog-sync.test.mjs` | план и применение на поддельном `configEditor`, идемпотентность, guard, `force`, allowlist |
| `catalog-tool.test.mjs` | контракт инструмента `cvc_catalog` |
| `coefficients.test.mjs` | индексацию каталога, сопоставление id, форматирование множителя, отсутствие множителя — нет бейджа |
| `balance.test.mjs` | снимок, дельту расхода, рост баланса — не расход, отказ одного провайдера |
| `client-store.test.mjs` | начальную загрузку, смену функций, сохранение, прогон |
| `client-render.test.mjs` | страницу настроек на поддельном React |

Общие подделки (React, DOM, `configEditor`) лежат в `test/helpers/`.