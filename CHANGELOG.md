# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The package name, the composition row id (`cvc-catalog-sync`) and the locale
namespace stay the same across the major versions, because a profile refers to
them by name. Everything else about the configuration surface is versioned: the
row config moved from a flat list of keys to groups, and the HTTP routes moved
under one prefix.

## [Unreleased]

Nothing yet.

## [2.0.0] - 2026-11-21

The plugin stops being "catalog sync with a settings page" and becomes three
functions in one package: catalog sync, price coefficients, and balance. Each
function has its own switch in the settings page, and none of them is mounted
while its switch is off — no HTTP route, no timer, no tool, no UI element.

The release also replaces two separately installed plugins. Users who had
`cvc-model-coeff-plugin` and `cvc-balance-plugin` in their profile no longer need
them; the functions they provided are part of this package, and the two
repositories are archived. The originals stay in their own git history and are
still reachable for anyone reading old profiles.

See [docs/UPGRADING.md](docs/UPGRADING.md) for the steps.

### Added

- Three function switches — `features.catalogSync`, `features.coefficients`,
  `features.balance` — all on by default, all applied without a restart. The
  plugin declares every configuration field as volatile, so DSH reloads the row
  through `loader/volatile-update` and the browser half mounts or unmounts the
  function in the running page.
- A price-multiplier badge (`×0.1` … `×10`) beside every model of the
  CheapVibeCode route in the composer's model menu and on the current-model
  button. The colour follows the host theme and the tooltip names the fast-mode
  multiplier when it differs. A model without a multiplier in the catalog gets
  no badge, and models with the same id under other providers stay undecorated.
- A **CVC balance** button in the sidebar footer with a status dot (all
  providers answered / only some / none), and a draggable panel with one card per
  route: display name, route key, `baseURL`, the credential name and whether the
  key was found, the balance in provider units, and the spend since the previous
  reading. The panel position is remembered in `localStorage` under
  `cvc:panel-pos`; the panel offers **Refresh** and **Reset position**.
- The `cvc_balance` tool for the agent: `status` returns the last snapshot in
  this process without spending a request.
- One shared catalog cache for the three functions. A catalog fetch serves both
  the model list written into the patch and the badges, so a badge refresh does
  not add a second request while the cache is fresh.
- HTTP routes under a single prefix, `/cvc`: `GET /cvc/state`, `PUT
  /cvc/config`, `POST /cvc/run`, `GET /cvc/coefficients`, `GET /cvc/balance`,
  `GET /cvc/health`. The routes reject cross-site requests (`403`), a `PUT`
  without `application/json` (`415`) and a body over 64 KB (`413`).
- A `Config` schema on `@deepseek-ai/schemastery` with the groups `features`,
  `providers`, `catalog`, `coefficients` and `balance`, plus validation for
  values written from the settings page (a `400` answer carries the offending
  field names).
- `GET /cvc/state` reports `configShape`, so a configuration left in the 1.x
  shape is visibly marked as `legacy` and the settings page offers to save once
  to convert it.
- The settings page gains the switch block and the parameter groups **Catalog**,
  **Coefficients**, **Balance** and **Advanced**, with the unsaved-changes marker
  and the last-run summary kept from 1.0.0 (counts, level source, added /
  removed / changed models, allowlist changes, warnings, patch path).
- `README.ru.md` as a full Russian counterpart of `README.md`, `CHANGELOG.md`,
  and the documents `docs/ARCHITECTURE.md`, `docs/UPGRADING.md`,
  `docs/COMPATIBILITY.md`, and a one-picture detail page `docs/DETAIL.md` with
  `docs/preview.svg`.

### Changed

- The row config is grouped: `features.*`, `providers.*` (`match`, `entryId`,
  `apiKeyEnv`, `baseURL`, `timeoutMs`), `catalog.*` (`provider`, `autoSync`,
  `intervalHours`, `startupDelayMs`, `minModelRatio`, `keepModels`,
  `installerUrls`, `syncAllowlist`, `allowlistEntryId`, `levelsCacheMinutes`),
  `coefficients.*` (`refreshMinutes`, `showFast`) and `balance.*`
  (`refreshSeconds`, `showDelta`).
- Providers are found by the host names in `providers.match` (default
  `cheapvibecode.ru`) instead of a single hard-coded host, so a route pointing at
  another CVC host is picked up as well.
- The browser half is compiled from `src/client/**` into `client.js` by
  `tools/build-client.mjs`, and the compiled file is committed. The package
  installs from npm and from git without running a build on the user's machine,
  and no `allowBuilds` permission is needed. CI rebuilds the file and fails when
  the committed copy differs from the sources.
- The host half uses the global `fetch` of the DSH process for every provider
  request; the plugin spawns no process and needs no `ctx.shell`.
- `SECURITY.md` describes the threat model of all three functions, not just the
  catalog.
- The test suite is grouped by module and runs through `node --test test/*.mjs`;
  every one of the 32 test scenarios of 1.0.0 is carried over rather than dropped.

### Fixed

- Invalid values coming from the settings form are now rejected with a `400` and
  the offending field names instead of being folded into defaults by
  normalisation alone.
- The provider lookup is one module for all three functions. Before, a route added
  under a renamed key worked in one surface and not in the others, because each
  plugin had its own copy of the discovery code.
- The installer parser no longer scans the downloaded text with a backtracking
  regular expression; it finds the `const reasoningLevels = {…}` literal
  linearly. The change was first shipped in 1.0.0 after a review of the input
  parsing; it is repeated here because the code was moved.

### Removed

- The old HTTP prefixes `/cvc-catalog-sync`, `/cvc-model-coeff` and
  `/cvc-balance` are no longer served. A browser tab or a script that still calls
  them gets `404`.
- The client occupies only the slots it owns: `conversation.input.model.label`
  stays with its owner, never used by this plugin. The balance function uses
  `sidebar.footer.action`, and the settings page uses `settings.section`,
  `settings.section.icon` and `plugins.bundle.config`.
- The `prepare`-based local build is gone with the two private plugins: this
  package ships its compiled client half and does not run a build script on
  install.
- `cvc-model-coeff-plugin` and `cvc-balance-plugin` are archived; their
  repositories stay online, read-only.

### Upgrading from 1.0.0 / from 1.1.0 of the private plugins

The short version: keep the package name and the row id, let the old flat
configuration load as it is, remove the two old rows from the profile, and save
the settings page once to convert the configuration to the grouped shape.

1. Install or update the package to `2.0.0`. The profile does not need a new row:
   the package name `cvc-catalog-sync-plugin` and the row id `cvc-catalog-sync`
   are unchanged, and the bundle patch of the package inserts the row with the
   three switches turned on.
2. A flat 1.x configuration in the row keeps working. It is normalised into the
   groups on load, and `GET /cvc/state` reports `configShape: 'legacy'`. The
   settings page shows a hint; pressing **Save** once rewrites the row in the
   grouped shape.
3. If `cvc-balance-plugin` is installed, remove its row from the profile patch
   (id `cvc-balance`) and remove the package from `dsh.profile.bundles`. The
   balance function of 2.0.0 reads the same routes and shows the same numbers
   under `GET /cvc/balance`; the old browser half would keep its own button next
   to the new one.
4. If `cvc-model-coeff-plugin` is installed, remove its row (id `cvc-model-coeff`)
   and the package from `dsh.profile.bundles` the same way. The old badge and the
   new badge would both be drawn on the same model rows.
5. Remove the `allowBuilds` entries those two packages needed. This package has
   no install-time build script, so it does not ask for such a permission.
6. Restart DSH once after editing the profile by hand, then hard-reload the tab.
   Later changes of the switches do not need a restart.
7. Check the result: `GET /cvc/health` answers
   `{"ok":true,"version":"2.0.0"}`; the settings page shows three switches on;
   `docs/UPGRADING.md` has the same steps with the commands.

## [1.0.0] - 2026-11-20

First public release.

### Added

- Catalog sync: `GET {baseURL}/models` plus the `reasoningLevels` map of the
  official installer, built into `llm-pi-ai.providers.<provider>.models` by the
  installer's own rules, written through `ctx.configEditor.edit()` and applied
  by `dsh-hmr`.
- The `subagent-model-selection-settings.allowedModels` sync.
- The shrink guard `minModelRatio` and the `keepModels` list.
- The `cvc_catalog` tool with `status`, `plan` and `apply` (and `force`).
- The settings page in two seats, **Settings → CVC** and the bundle page in
  **Plugins**, with Save / Check / Apply / Reset.
- A timer for the automatic run: startup delay and interval.

### Changed

- Input parsing was hardened in the same release: the installer text is scanned
  linearly, slash trimming no longer uses a regular expression, and the settings
  routes were narrowed to the ones the page needs.

[Unreleased]: https://github.com/mikel38487/cvc-catalog-sync-plugin/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/mikel38487/cvc-catalog-sync-plugin/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/mikel38487/cvc-catalog-sync-plugin/releases/tag/v1.0.0