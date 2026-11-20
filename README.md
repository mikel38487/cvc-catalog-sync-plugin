# CVC catalog, coefficients and balance

[![CI](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/ci.yml)
[![CodeQL](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/codeql.yml/badge.svg)](https://github.com/mikel38487/cvc-catalog-sync-plugin/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/cvc-catalog-sync-plugin.svg)](https://www.npmjs.com/package/cvc-catalog-sync-plugin)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

One plugin for three things a CheapVibeCode route needs in a DSH profile:

1. **Catalog sync** keeps `llm-pi-ai.providers.<provider>.models` and the subagent
   model allowlist in step with `GET /v1/models` and with the reasoning levels
   published by the official CheapVibeCode installer.
2. **Coefficients** put the price multiplier (`×0.1` … `×10`) beside every model
   of that provider in the model picker.
3. **Balance** adds a sidebar button and a panel with the remaining balance and
   the spend since the previous reading.

Each of the three has its own switch in the settings page. A switched-off
function leaves nothing behind: no route, no timer, no tool, no UI element.
Version 2.0.0 replaces two earlier plugins (`cvc-model-coeff-plugin` and
`cvc-balance-plugin`) and absorbs their features into this package, so one
plugin row in the profile patch is enough.

## Requirements

- DeepSeek Harness `>=0.2.2-rc.3 <0.4.0`;
- Node.js 20 or newer;
- a provider route in `llm-pi-ai` whose `baseURL` points at a
  `cheapvibecode.ru` host (default `https://ru.cheapvibecode.ru/v1`), with its
  credential named by `apiKeyEnv` (default `CVC_DEEPSEEK_API_KEY`).

If there is no such route, the catalog and the balance have nobody to read:
plan and apply report that no route was found, and the balance panel says so.
The settings page itself still works, because it is also the switchboard.

## Install

Ask the DSH agent to install the bundle from npm:

```text
install the npm bundle cvc-catalog-sync-plugin
```

By hand: add `"cvc-catalog-sync-plugin": "^2.0.0"` to the dependencies of
`~/.dsh/profiles/<profile>/package.json`, add the package name to
`dsh.profile.bundles`, and let the profile install it. The bundle ships a
compiled `client.js`, so nothing is built during installation and no
`allowBuilds` permission is needed. For a local checkout use
`"cvc-catalog-sync-plugin": "link:<absolute path>"` instead.

The package keeps the name `cvc-catalog-sync-plugin` and the composition row id
`cvc-catalog-sync`, so the profile does not need to be rewritten for the
upgrade. See [docs/UPGRADING.md](docs/UPGRADING.md) for the steps that do
change.

## Where the settings are

The same form appears in two places:

- **Settings → CVC** — a section of the settings navigation with its own icon
  (`settings.section` + `settings.section.icon`, id `cvc`, order 25);
- **Plugins → CVC catalog sync → bundle page** — a configuration block between
  the bundle description and its component rows (`plugins.bundle.config`, keyed
  by the package name). In the collapsed list the block renders as a one-line
  summary.

One group of switches at the top (**Features**) and then the parameter groups:
**Catalog**, **Coefficients**, **Balance** and **Advanced**. The switches decide
which of the first three groups has any effect; the **Advanced** group holds the
provider lookup (`providers.*`) and the level cache, and stays visible with every
function off, because it configures the lookup all three share.

| Switch | What it controls |
|---|---|
| Catalog sync | startup and timer runs, the `cvc_catalog` tool, `POST /cvc/run` and what the check and apply buttons can do |
| Coefficients | `GET /cvc/coefficients` and the badges in the model picker |
| Balance | `GET /cvc/balance`, the `cvc_balance` tool, the sidebar button and the panel |

The settings page and `GET /cvc/state` are not gated: they exist with all three
functions off, because the page is the switch. The check and apply buttons stay on
the page when catalog sync is off, but the run route behind them answers `404` and
the page reports the failed run.

A change is applied through `PUT /cvc/config` and takes effect immediately:
the plugin declares every configuration field as volatile, so DSH reloads the
row without a restart. Turning a function off unmounts it, turning it on
mounts it again, in the same page session.

The three switches are named **Catalog sync**, **Model coefficients** and
**Balance**, and the settings page spells out what a switched-off feature
leaves behind: its route answers `404`, its timer is not created, its interface
element disappears. The page itself always stays, because it is the switch.

Buttons:

| Button | Effect |
|---|---|
| **Save** | Validates the form and writes the row config into the profile patch through `configEditor.edit()`. A value equal to the schema defaults removes the override, so the patch keeps only real changes. |
| **Check catalog** | Fetches the catalog and the level map, shows the diff, writes nothing. |
| **Apply catalog** | Same fetch, then writes the models and the subagent allowlist. Asks for confirmation first. |
| **Reset** | Puts the defaults into the form; press Save to remove the override. |

Check and apply use the **saved** settings, so press Save first; the page marks
unsaved changes. Below the buttons the page shows the last run: catalog,
current and next model counts, the level source, added, removed and changed
models, allowlist changes, warnings and the patch path.

## Configuration

Override the row in the profile patch by id `cvc-catalog-sync` — or use the
settings page, which writes the same row. Only the fields you want to change
need to be present:

```yaml
- id: cvc-catalog-sync
  name: 'cvc-catalog-sync-plugin'
  config:
    features:
      catalogSync: true
      coefficients: true
      balance: true
    providers:
      match: ['cheapvibecode.ru']       # host names that identify the provider
      entryId: llm-pi-ai                # patch row that owns the provider routes
      apiKeyEnv: CVC_DEEPSEEK_API_KEY   # fallback credential name, never the value
      baseURL: https://ru.cheapvibecode.ru/v1
      timeoutMs: 20000
    catalog:
      provider: cheapvibecode           # route key whose models are written
      autoSync: true                    # startup run plus interval runs
      intervalHours: 24                 # 0 turns the timer off; below a minute is raised
      startupDelayMs: 5000
      minModelRatio: 0.8                # refuse a smaller catalog
      keepModels: []                    # ids kept even when the catalog drops them
      installerUrls:                    # reasoning-level maps, first reachable wins
        - https://ru.cheapvibecode.ru/idhw
        - https://ru.cheapvibecode.ru/idhl
      syncAllowlist: true
      allowlistEntryId: subagent-model-selection-settings
      levelsCacheMinutes: 360
    coefficients:
      refreshMinutes: 10
      showFast: true
    balance:
      refreshSeconds: 0                 # 0 means refresh on demand only; minimum 15
      showDelta: true
```

The defaults are the same as in the table in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); a value written to the patch
overrides them, and removing the field restores the default.

A configuration written for version 1.x still loads: the flat keys (`entryId`,
`provider`, `baseURL`, `apiKeyEnv`, `installerUrls`, `autoSync`,
`intervalHours`, `startupDelayMs`, `minModelRatio`, `keepModels`,
`syncAllowlist`, `allowlistEntryId`, `levelsCacheMinutes`, `timeoutMs`) are
accepted as deprecated fields and folded into the groups. `GET /cvc/state`
reports `configShape: legacy` in that case, and the settings page suggests
saving once to move to the new shape.

## The catalog

The CVC catalog (`GET /v1/models`) changes often and does **not** carry
reasoning levels: only a boolean `supports_reasoning`. The levels live as a
`const reasoningLevels = {...}` literal inside the official installers (`/idhw`
for PowerShell, `/idhl` for bash). DSH's built-in "get models" action neither
saves anything nor returns levels, so a catalog refresh otherwise means
hand-editing `~/.dsh/profiles/<profile>/cordis.patch.yml`.

What a run does:

1. On activation, after `startupDelayMs`, and every `intervalHours` (when
   `autoSync` is on) it fetches `{baseURL}/models` with the route's credential
   and the installer's `reasoningLevels` map.
2. It builds `llm-pi-ai.providers.<provider>.models` by the installer's own
   rules: `name` is `display_name` after ` · `, `contextWindow` is
   `context_window`, `maxTokens` is `min(max_output_tokens, contextWindow)`,
   `input` gains `image` when the model accepts it, the `none` level becomes
   `off: none`, and `gpt-image*` and models without text output are skipped.
3. It writes the result through `ctx.configEditor.edit()`, which preserves the
   rest of the patch file, its comments and other plugins' rows, and applies the
   change through `dsh-hmr` without restarting DSH.
4. With `syncAllowlist` on, `subagent-model-selection-settings.allowedModels`
   is pruned and extended to the same model ids; entries of other providers are
   left alone.

It writes only when the catalog or the allowlist actually changed. A response
below `minModelRatio` of the current model count is refused, so a partial or
empty catalog cannot wipe a working list.

### The cvc_catalog tool

| Action | Effect |
|---|---|
| `status` | Last run in this process; no network |
| `plan` | Fetch, build, return the diff, write nothing |
| `apply` | Fetch and write (refused by the size guard or by a stale catalog unless `force: true`) |

Check and apply run the same steps. A run reports the catalog size, the current and
next model count, the level source, added / removed / changed models, allowlist
changes and warnings. When the API answers `409`, the reason is a refusal by the
guard or by a stale catalog, not a server failure: the page shows the reason and
suggests `force` where the tool offers it.

## The coefficients

The multiplier comes from the same `GET /v1/models` response and is a factor on
the provider's base price, not a currency amount. The model menu and the
composer's current-model button gain a badge to the right of the name: `×0.1`,
`×3`, `×10`. The colour comes from the host theme: green up to 0.5, plain text
up to 1.5, warning up to 4, error above that. The tooltip names the fast-mode
multiplier when it differs.

Only models of a provider whose `baseURL` points at `cheapvibecode.ru` get the
badge; the same model id under another provider stays undecorated. A model
without a multiplier in the catalog gets no badge: the plugin does not guess a
price. The badge is not a control, and the `conversation.input.model.label` slot
is left to whoever owns it, so selection stays with the built-in picker.

The browser asks `GET /cvc/coefficients` every `refreshMinutes`. The answer is
served from the shared catalog cache, so a badge refresh does not cost an extra
catalog request when the cache is still fresh. **Show fast mode** controls whether
the tooltip adds the fast-mode multiplier; with it off the badge shows only the
regular multiplier.

## The balance

The sidebar footer gains a **CVC balance** button with a small status dot: green
when every provider answered, yellow when only some did (or while a refresh is
running), red when none did, neutral when no provider is configured. The colours
are theme tokens, so the dot stays readable in the light theme.

Clicking the button opens a panel with one card per route: display name, route
key, `baseURL`, the credential name and whether the key was found, the remaining
balance in provider units, and the spend since the previous reading (when
`showDelta` is on). The panel can be dragged, remembers its position in
`localStorage` under `cvc:panel-pos`, and offers **Refresh** and **Reset
position**. It stays inside the viewport and does not write into
`document.body`.

`refreshSeconds` is `0` by default: the panel reads the balance when it is opened
or refreshed by hand. A positive value of 15 or more turns on a timer that
re-reads the balance while the panel is open; the timer stops when the panel is
closed. A value between 1 and 14 is raised to 15, and the form refuses it with a
validation error rather than silently changing the number.

An error on one provider is shown on that card and does not prevent the others
from answering. The API key itself never leaves the host: the answer carries
`keySet: true|false` and the numbers.

### The cvc_balance tool

`status` returns the last snapshot in this process without spending a request: for
each route a `keySet` flag and the remaining units. It is meant for the agent, so
the human side is the panel, and the tool exists only while the balance function
is on.

## HTTP contract

All routes live under one prefix, `/cvc`, and are served by the DSH web server
on the same origin as the UI.

| Method | Path | Body | Answer |
|---|---|---|---|
| GET | `/cvc/state` | — | `{version, features, config, configShape, status, lastRun, patchPath, rowId}` |
| PUT | `/cvc/config` | `{config}` | `{ok, config, features}`; on error `400` with `fields` |
| POST | `/cvc/run` | `{action: 'plan' \| 'apply', force?}` | the run result |
| GET | `/cvc/coefficients` | — | `{models, providers, fetchedAt, stale}`; `404` when the function is off |
| GET | `/cvc/balance` | — | `{providers, fetchedAt}`; `404` when the function is off |
| GET | `/cvc/health` | — | `{ok, version}` |

Cross-site requests (`Sec-Fetch-Site: cross-site`) get `403`, a write request
(`PUT` or `POST`) without `application/json` gets `415`, a body over 64 KB gets
`413`, an unknown path gets `404`, and a wrong method on a known path gets `405`.

## Compatibility

The plugin leans on a few UI surfaces of DSH that are not part of a stable public
API: the `settings.section` and `settings.section.icon` slots, the
`plugins.bundle.config` block, the `sidebar.footer.action` button, and the
`data-model-id` / `data-provider-id` attributes the model selector writes. The
balance panel does not use `shell.overlay`; it is positioned inside the sidebar
slot. [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) lists each surface with its
failure mode and the client modules the manifest declares via
`dsh.client.inject`.

## Limits

- Levels are scraped from the installer, not from an API. If both installer URLs
  are unreachable, existing levels are preserved and only new models fall back
  to the full `supports_reasoning` row; the run reports `levelsSource: none`.
- The CVC catalog is not filtered by key: `/v1/models` lists every model, while
  availability is decided per request (`403 This model is not enabled for the
  API key`). The plugin therefore cannot hide models your key cannot call.
- The DSH schema constrains the **keys** of `reasoningEfforts`
  (`off/minimal/low/medium/high/xhigh/max`); values are arbitrary wire
  spellings. That is why the installer's `thinking` level travels as
  `high: thinking`, and the plugin reproduces it.
- A model whose catalog entry declares no modalities keeps the current entry's
  `input`; a declared `supports_vision: false` drops `image`.
- A route configured with `modelOverrides` is refused with an explicit error:
  DSH does not accept `modelOverrides` beside a `models` list, so such a route
  must be converted to an explicit list first.
- The coefficient badge is drawn in the composer model menu and on the
  current-model button. The `/model` command uses its own popup without the same
  row attributes, so it stays undecorated.
- Badge matching folds case, dots and underscores in a model id to a dash, because
  the CheapVibeCode catalog and the DSH adapter may spell the same model
  differently. When that still leaves more than one candidate, no badge is drawn.
- The balance is shown in the provider's own units, exactly as `/v1/balance`
  reports them; the plugin does not convert them to money.
- Automatic runs write through the same editor, but only when the HMR service of
  the host exposes a usable transaction context. On a host where it does not, the
  timer computes the diff and logs a warning instead of writing; run
  `cvc_catalog action=apply` or the **Apply catalog** button in that case.
- No background work while off: with all three functions switched off the plugin
  starts no timer and makes no provider request.

## Verify and roll back

```powershell
# plan without writing
cvc_catalog action=plan
# copy the patch before the first apply
Copy-Item ~\.dsh\profiles\desktop\cordis.patch.yml ~\.dsh\profiles\desktop\cordis.patch.yml.bak-manual
cvc_catalog action=apply
```

The profile is not a git repository, so a file copy is the rollback.

## Development

```powershell
npm install
npm test                    # node --test test/*.mjs
npm run build               # rebuilds client.js from src/client/**
node tools/assert-pack.mjs  # checks the npm tarball contents
```

`index.js` and `lib/**` are plain ESM and run without a build step. The browser
half is compiled from `src/client/**` into `client.js`; the compiled file is
committed, so the package works from npm and from git without running a build
on the user's machine. CI rebuilds it and fails when the committed file differs
from the sources, and a separate job checks that the tarball contains the files
the package promises.

The build uses `tsdown`, whose own `engines` field requires Node `^22.18` or
`>=24.11`, so CI builds on Node 22. Installing from npm and running the plugin
work on Node 20 or newer: the compiled `client.js` is in the package, and
installing from npm does not run a build script.

Because a locally linked bundle is linked by directory rather than copied,
editing its files does not load new code by itself: DSH picks the new module up
after a profile reconcile (any patch-file change) or an application restart.

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Upgrading: [docs/UPGRADING.md](docs/UPGRADING.md).
Compatibility: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).
Previews: [docs/DETAIL.md](docs/DETAIL.md) shows the settings page, the badges and
the panel in one picture.

## Security

See [SECURITY.md](SECURITY.md). The plugin contacts only the provider hosts and
installer URLs from its own configuration, the API key is resolved on the host
by name and never reaches the browser, and npm releases carry provenance from
GitHub Actions.

## Moved from

The coefficient and balance functions come from two earlier plugins,
`cvc-model-coeff-plugin` and `cvc-balance-plugin`. Both repositories stay online
as archives and should be removed from the profile when this plugin is
installed; [docs/UPGRADING.md](docs/UPGRADING.md) has the exact steps.

## License

MIT © 2026 mikel38487