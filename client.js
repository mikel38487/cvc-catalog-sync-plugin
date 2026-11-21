/**
 * Клиентская половина cvc-catalog-sync-plugin: собранный бандл.
 *
 * Файл создаётся `node tools/build-client.mjs` из `src/client/*`; править
 * его руками нельзя — следующая сборка перезапишет. Исходники и правила лежат
 * в репозитории рядом.
 *
 * @module cvc-catalog-sync-plugin/client
 */
window.__ModuleLoader__.load({
  id: "cvc-catalog-sync-plugin",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // \0rolldown/runtime.js
    var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __copyProps = (to, from, except, desc) => {
    	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
    		key = keys[i];
    		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
    			get: ((k) => from[k]).bind(null, key),
    			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    		});
    	}
    	return to;
    };
    var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
    	value: mod,
    	enumerable: true
    }) : target, mod));
    let react = require("react");
    react = __toESM(react, 1);
    // src/client/css.js
    /**
    * Стили клиентской половины под общим префиксом `.cvc2-`.
    *
    * Префикс отделяет плагин от 1.0.0 и от двух прежних приватных плагинов: их
    * классы (`.cvc-sync`, `.cvc-coeff`, `.cvc-panel`) остались в истории и не
    * должны конфликтовать, если в профиле временно живёт старая строка.
    *
    * Цвета — только токены темы `--dsw-alias-*`: собственные значения ломают
    * светлую тему и подсветку контраста. Никаких `!important` и селекторов по
    * тегам вне своего корня, чтобы не задеть интерфейс харнесса.
    *
    * @module cvc-catalog-sync-plugin/client/css
    */
    /** Готовое содержимое тега `<style>`. */
    const CSS = `
    .cvc2-page { display: flex; flex-direction: column; gap: 14px; max-width: 780px; padding: 4px 2px 28px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.45; }
    .cvc2-page h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .cvc2-page .cvc2-embedded-title { margin: 0; font-size: 14px; font-weight: 600; }
    .cvc2-page .cvc2-desc { margin: 0; color: var(--dsw-alias-label-secondary); }
    .cvc2-page .cvc2-group { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 4px 16px 8px; }
    .cvc2-page .cvc2-group > h3 { margin: 10px 0 2px; font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
    .cvc2-page .cvc2-field { display: grid; grid-template-columns: minmax(170px, 220px) minmax(0, 1fr); gap: 6px 16px; padding: 10px 0; border-top: 1px dashed var(--dsw-alias-border-l1); align-items: start; }
    .cvc2-page .cvc2-group > .cvc2-field:first-of-type { border-top: 0; }
    .cvc2-page .cvc2-label { font-weight: 500; }
    .cvc2-page .cvc2-hint { margin-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
    .cvc2-page .cvc2-control { min-width: 0; }
    .cvc2-page input[type="text"], .cvc2-page input[type="number"], .cvc2-page textarea, .cvc2-page select {
      box-sizing: border-box; width: 100%; padding: 7px 9px; border-radius: 8px;
      border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-primary); font: inherit;
    }
    .cvc2-page input:focus-visible, .cvc2-page textarea:focus-visible, .cvc2-page select:focus-visible, .cvc2-page button:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px;
    }
    .cvc2-page textarea { min-height: 64px; resize: vertical; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; }
    .cvc2-page .cvc2-row { display: flex; align-items: center; gap: 10px; }
    .cvc2-page .cvc2-switch { position: relative; width: 38px; height: 22px; flex: none; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); cursor: pointer; padding: 0; transition: background .12s ease, border-color .12s ease; }
    .cvc2-page .cvc2-switch[data-on="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
    .cvc2-page .cvc2-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform .12s ease; }
    .cvc2-page .cvc2-switch[data-on="true"]::after { transform: translateX(16px); }
    .cvc2-page .cvc2-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .cvc2-page .cvc2-btn { border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-weight: 500; padding: 7px 14px; cursor: pointer; }
    .cvc2-page .cvc2-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
    .cvc2-page .cvc2-btn:disabled { opacity: .5; cursor: default; }
    .cvc2-page .cvc2-btn[data-primary="true"] { background: var(--dsw-alias-button-primary-fill); border-color: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-inverted); }
    .cvc2-page .cvc2-note { flex: 1 1 220px; min-width: 0; font-size: 12px; }
    .cvc2-page .cvc2-note[data-kind="ok"] { color: var(--dsw-alias-state-success-primary); }
    .cvc2-page .cvc2-note[data-kind="warn"] { color: var(--dsw-alias-state-warn-primary); }
    .cvc2-page .cvc2-note[data-kind="error"] { color: var(--dsw-alias-state-error-primary); }
    .cvc2-page .cvc2-status { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); padding: 10px 14px; font-size: 12px; }
    .cvc2-page .cvc2-status h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); text-transform: uppercase; letter-spacing: .02em; }
    .cvc2-page .cvc2-line { display: flex; flex-wrap: wrap; gap: 4px 10px; }
    .cvc2-page .cvc2-line b { font-weight: 600; }
    .cvc2-page .cvc2-mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
    .cvc2-page .cvc2-warn { color: var(--dsw-alias-state-warn-primary); }
    .cvc2-page .cvc2-error { color: var(--dsw-alias-state-error-primary); }
    .cvc2-page .cvc2-ok { color: var(--dsw-alias-state-success-primary); }
    .cvc2-page .cvc2-muted { color: var(--dsw-alias-label-secondary); }
    .cvc2-page .cvc2-features-note { margin: 2px 0 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
    @media (max-width: 560px) { .cvc2-page .cvc2-field { grid-template-columns: 1fr; } }

    .cvc2-badge {
      display: inline-flex; align-items: center; margin-left: 6px; padding: 0 5px;
      border-radius: 4px; border: 1px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
      font-size: 11px; font-weight: 500; line-height: 16px; letter-spacing: 0;
      white-space: nowrap; pointer-events: none; vertical-align: baseline;
    }
    .cvc2-badge[data-tier="cheap"] { color: var(--dsw-alias-state-success-primary); }
    .cvc2-badge[data-tier="mid"] { color: var(--dsw-alias-label-secondary); }
    .cvc2-badge[data-tier="pricey"] { color: var(--dsw-alias-state-warn-primary); }
    .cvc2-badge[data-tier="expensive"] { color: var(--dsw-alias-state-error-primary); }

    .cvc2-bal-root { font-size: 12px; color: var(--dsw-alias-label-primary); }
    .cvc2-bal-btn { display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 8px; background: transparent; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; color: inherit; cursor: pointer; font: inherit; text-align: left; }
    .cvc2-bal-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
    .cvc2-bal-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-label-secondary); }
    .cvc2-bal-dot[data-state="ok"] { background: var(--dsw-alias-state-success-primary); }
    .cvc2-bal-dot[data-state="warn"] { background: var(--dsw-alias-state-warn-primary); }
    .cvc2-bal-dot[data-state="err"] { background: var(--dsw-alias-state-error-primary); }
    .cvc2-bal-panel { position: fixed; z-index: 60; right: 16px; bottom: 64px; width: min(400px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; padding: 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-3); border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); cursor: grab; touch-action: none; }
    .cvc2-bal-panel[data-dragging="true"] { cursor: grabbing; user-select: none; }
    .cvc2-bal-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .cvc2-bal-title { font-weight: 600; font-size: 13px; }
    .cvc2-bal-close { margin-left: auto; flex: 0 0 auto; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; padding: 0; background: transparent; border: 1px solid transparent; border-radius: 5px; color: inherit; cursor: pointer; font: inherit; font-size: 15px; line-height: 1; opacity: .7; }
    .cvc2-bal-close:hover { opacity: 1; background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l1); }
    .cvc2-bal-actions { display: flex; gap: 6px; margin-bottom: 8px; }
    .cvc2-bal-muted { color: var(--dsw-alias-label-secondary); }
    .cvc2-bal-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px; margin-bottom: 8px; }
    .cvc2-bal-row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
    .cvc2-bal-big { font-size: 19px; font-weight: 650; }
    .cvc2-bal-bad { color: var(--dsw-alias-state-error-primary); }
    .cvc2-bal-msg { padding: 6px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); margin-top: 6px; }
    .cvc2-bal-refresh, .cvc2-bal-reset { background: transparent; border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; color: inherit; cursor: pointer; font: inherit; padding: 3px 8px; }
    .cvc2-bal-refresh:disabled, .cvc2-bal-reset:disabled { opacity: .5; cursor: default; }
    `;
    // src/client/i18n.js
    /**
    * Словари страницы настроек и поверхностей плагина: английский и русский.
    *
    * Ключи плоские и совпадают с тем, что показывает интерфейс. Подстановок нет:
    * строки с числами и именами собираются в месте вывода, чтобы словарь можно
    * было читать и сравнивать построчно. Английские подписи — sentence case.
    *
    * @module cvc-catalog-sync-plugin/client/i18n
    */
    /** Пространство имён локали и id секции настроек. */
    const NS = "cvc-catalog-sync";
    /** Словари по коду языка: ровно те коды, которые принимает `ctx.locale.register`. */
    const DICTIONARIES = {
    	en: {
    		nav: "CVC",
    		title: "CVC catalog, coefficients and balance",
    		summary: "Catalog sync, model coefficients and the CheapVibeCode balance.",
    		desc: "One plugin for the CheapVibeCode route: keeps the model catalog in the profile patch in sync with /v1/models, shows the price multiplier next to each model and puts the remaining balance in the sidebar. Every feature can be turned off here without restarting the harness.",
    		groupFeatures: "Features",
    		featuresNote: "A disabled feature registers nothing: its route answers 404, its timer stops and its interface element disappears. The page itself always stays, because it is the switch.",
    		featureCatalogSync: "Catalog sync",
    		featureCatalogSyncHint: "Fetch the catalog at startup and on the interval, write only on a real difference.",
    		featureCoefficients: "Model coefficients",
    		featureCoefficientsHint: "Badge ×N next to the model name in the model picker.",
    		featureBalance: "Balance",
    		featureBalanceHint: "Sidebar button with the remaining balance and the spend since the previous reading.",
    		groupCatalog: "Catalog",
    		groupCoefficients: "Coefficients",
    		groupBalance: "Balance",
    		groupAdvanced: "Advanced",
    		provider: "Provider route",
    		providerHint: "Route key inside llm-pi-ai.providers whose models are written.",
    		autoSync: "Automatic sync",
    		autoSyncHint: "Fetch the catalog at startup and on the interval; writes only on a real difference.",
    		intervalHours: "Interval, hours",
    		intervalHoursHint: "0 turns the timer off; anything below a minute is raised to a minute.",
    		startupDelayMs: "Startup delay, ms",
    		startupDelayMsHint: "Pause after activation before the first run.",
    		minModelRatio: "Catalog shrink guard",
    		minModelRatioHint: "Refuse a catalog smaller than this share of the current model count (0 to 1).",
    		keepModels: "Keep model ids",
    		keepModelsHint: "One id per line; kept even when the catalog drops it.",
    		installerUrls: "Installer URLs",
    		installerUrlsHint: "One URL per line; the first reachable one provides the reasoning levels.",
    		syncAllowlist: "Sync subagent list",
    		syncAllowlistHint: "Keep allowedModels of the allowlist row aligned with this route.",
    		allowlistEntryId: "Allowlist row",
    		allowlistEntryIdHint: "Patch row that stores allowedModels.",
    		entryId: "Profile row",
    		entryIdHint: "Patch row that names this provider route.",
    		match: "Provider hosts",
    		matchHint: "One host per line; a route whose baseURL host name matches one of them is this provider.",
    		apiKeyEnv: "Fallback credential name",
    		apiKeyEnvHint: "Used when the route has no credential of its own; the key itself never enters this page.",
    		baseURL: "API base URL",
    		baseURLHint: "The models request goes to {baseURL}/models.",
    		timeoutMs: "Request timeout, ms",
    		timeoutMsHint: "Timeout for one catalog, installer or balance request.",
    		levelsCacheMinutes: "Levels cache, minutes",
    		levelsCacheMinutesHint: "How long the reasoning-level map is reused.",
    		refreshMinutes: "Badge refresh, minutes",
    		refreshMinutesHint: "How often the coefficient map is re-read while the harness is open.",
    		showFast: "Show fast mode",
    		showFastHint: "Include the fast-mode multiplier in the badge tooltip.",
    		refreshSeconds: "Balance refresh, seconds",
    		refreshSecondsHint: "0 refreshes only on the button; the smallest interval is 15 seconds.",
    		showDelta: "Show spend since the last reading",
    		showDeltaHint: "Show how much was spent between two readings.",
    		save: "Save",
    		saving: "Saving…",
    		saved: "Settings saved.",
    		check: "Check catalog",
    		checking: "Checking…",
    		checked: "Catalog checked; nothing was written.",
    		apply: "Apply catalog",
    		applying: "Applying…",
    		applied: "Catalog written into the profile patch.",
    		confirmApply: "Write the catalog into the profile patch now?",
    		confirmYes: "Yes, apply",
    		confirmNo: "Cancel",
    		reset: "Reset to defaults",
    		resetDone: "Defaults restored in the form; press Save to remove the override.",
    		statusTitle: "Last run",
    		never: "No run in this process yet.",
    		catalogCount: "Catalog",
    		currentCount: "Current",
    		nextCount: "Next",
    		levels: "Levels",
    		noDiff: "No differences",
    		added: "Added",
    		removed: "Removed",
    		changed: "Changed",
    		allowlistAdded: "Allowlist added",
    		allowlistPruned: "Allowlist pruned",
    		warnings: "Warnings",
    		runError: "Error",
    		patch: "Patch",
    		legacyHint: "The stored configuration uses the 1.x shape. Press Save once to move it into the grouped shape.",
    		dirty: "Unsaved changes",
    		checkUsesSaved: "Check and apply use the saved settings.",
    		loading: "Loading…",
    		errLoad: "Could not read settings",
    		errSave: "Could not save settings",
    		errRun: "Run failed",
    		errFields: "Check the fields",
    		errNumber: "must be a number inside the allowed range",
    		errRatio: "must be between 0 and 1",
    		errUrl: "must be an http(s) URL",
    		errEmpty: "must not be empty",
    		errSeconds: "must be 0 or at least 15",
    		errMinutes: "must be at least 1",
    		switchOn: "On",
    		switchOff: "Off",
    		balanceTitle: "CheapVibeCode",
    		balanceButton: "CVC balance",
    		balanceRefresh: "Refresh",
    		balanceResetPos: "Reset position",
    		balanceClose: "Close",
    		balanceLoading: "refreshing…",
    		balanceNone: "No provider with cheapvibecode.ru in its baseURL.",
    		balanceUnits: "Remaining, units",
    		balanceSpent: "Spent since last reading",
    		balanceKeyMissing: "key not found",
    		balanceError: "Balance error",
    		balanceStale: "Showing the previous reading",
    		balanceDragHint: "Drag the panel to move it",
    		balanceRelease: "Release to pin the panel"
    	},
    	ru: {
    		nav: "CVC",
    		title: "CVC: каталог, коэффициенты и баланс",
    		summary: "Синхронизация каталога, коэффициенты моделей и баланс CheapVibeCode.",
    		desc: "Один плагин для маршрута CheapVibeCode: держит каталог моделей в профильном патче в соответствии с /v1/models, показывает множитель цены рядом с моделью и выносит остаток баланса в сайдбар. Каждую функцию можно выключить здесь же, без перезапуска харнесса.",
    		groupFeatures: "Функции",
    		featuresNote: "Выключенная функция не регистрирует ничего: маршрут отвечает 404, таймер не создаётся, элемент интерфейса исчезает. Сама страница остаётся всегда — это и есть переключатель.",
    		featureCatalogSync: "Синхронизация каталога",
    		featureCatalogSyncHint: "Забирать каталог при старте и по интервалу; писать только при реальной разнице.",
    		featureCoefficients: "Коэффициенты моделей",
    		featureCoefficientsHint: "Бейдж ×N рядом с именем модели в выборе модели.",
    		featureBalance: "Баланс",
    		featureBalanceHint: "Кнопка в сайдбаре с остатком и расходом с прошлого замера.",
    		groupCatalog: "Каталог",
    		groupCoefficients: "Коэффициенты",
    		groupBalance: "Баланс",
    		groupAdvanced: "Дополнительно",
    		provider: "Маршрут провайдера",
    		providerHint: "Ключ маршрута в llm-pi-ai.providers, чьи models записываются.",
    		autoSync: "Автоматическая синхронизация",
    		autoSyncHint: "Забирать каталог при старте и по интервалу; писать только при реальной разнице.",
    		intervalHours: "Интервал, часов",
    		intervalHoursHint: "0 выключает таймер; значения меньше минуты поднимаются до минуты.",
    		startupDelayMs: "Задержка старта, мс",
    		startupDelayMsHint: "Пауза после активации перед первым прогоном.",
    		minModelRatio: "Защита от усыхания каталога",
    		minModelRatioHint: "Не принимать каталог меньше этой доли от текущего числа моделей (0…1).",
    		keepModels: "Сохранять модели",
    		keepModelsHint: "По одному id на строку; сохраняются, даже если каталог их убрал.",
    		installerUrls: "Адреса установщиков",
    		installerUrlsHint: "По одному на строку; уровни берутся из первого доступного.",
    		syncAllowlist: "Синхронизировать список сабагентов",
    		syncAllowlistHint: "Держать allowedModels строки списка в соответствии с маршрутом.",
    		allowlistEntryId: "Строка списка",
    		allowlistEntryIdHint: "Строка патча, где лежит allowedModels.",
    		entryId: "Строка профиля",
    		entryIdHint: "Строка патча, которой принадлежат маршруты провайдеров.",
    		match: "Хосты провайдера",
    		matchHint: "По одному хосту на строку; маршрут, в baseURL которого есть хост, считается этим провайдером.",
    		apiKeyEnv: "Запасное имя ключа",
    		apiKeyEnvHint: "Используется, если у маршрута нет своего ключа; сам ключ на страницу не попадает.",
    		baseURL: "Базовый адрес API",
    		baseURLHint: "Запрос моделей идёт на {baseURL}/models.",
    		timeoutMs: "Таймаут запроса, мс",
    		timeoutMsHint: "Таймаут одного запроса каталога, установщика или баланса.",
    		levelsCacheMinutes: "Кэш уровней, минут",
    		levelsCacheMinutesHint: "Сколько времени переиспользуется карта уровней.",
    		refreshMinutes: "Обновление бейджей, минут",
    		refreshMinutesHint: "Как часто карта коэффициентов перечитывается, пока харнесс открыт.",
    		showFast: "Показывать быстрый режим",
    		showFastHint: "Добавлять множитель быстрого режима в подсказку бейджа.",
    		refreshSeconds: "Обновление баланса, секунд",
    		refreshSecondsHint: "0 — только по кнопке; минимальный интервал — 15 секунд.",
    		showDelta: "Показывать расход с прошлого замера",
    		showDeltaHint: "Показывать, сколько потрачено между двумя замерами.",
    		save: "Сохранить",
    		saving: "Сохраняю…",
    		saved: "Настройки сохранены.",
    		check: "Проверить каталог",
    		checking: "Проверяю…",
    		checked: "Каталог проверен, ничего не записано.",
    		apply: "Применить каталог",
    		applying: "Применяю…",
    		applied: "Каталог записан в профильный патч.",
    		confirmApply: "Записать каталог в профильный патч сейчас?",
    		confirmYes: "Да, применить",
    		confirmNo: "Отмена",
    		reset: "Сбросить к умолчаниям",
    		resetDone: "Умолчания подставлены в форму; нажмите «Сохранить», чтобы убрать переопределение.",
    		statusTitle: "Последний прогон",
    		never: "В этом процессе прогонов ещё не было.",
    		catalogCount: "Каталог",
    		currentCount: "Сейчас",
    		nextCount: "Будет",
    		levels: "Уровни",
    		noDiff: "Различий нет",
    		added: "Добавлено",
    		removed: "Удалено",
    		changed: "Изменено",
    		allowlistAdded: "В список добавлено",
    		allowlistPruned: "Из списка убрано",
    		warnings: "Предупреждения",
    		runError: "Ошибка",
    		patch: "Патч",
    		legacyHint: "Сохранённый конфиг в форме 1.x. Нажмите «Сохранить» один раз, чтобы перейти на группированный вид.",
    		dirty: "Есть несохранённые изменения",
    		checkUsesSaved: "Проверка и применение используют сохранённые настройки.",
    		loading: "Загружаю…",
    		errLoad: "Не удалось прочитать настройки",
    		errSave: "Не удалось сохранить настройки",
    		errRun: "Прогон не удался",
    		errFields: "Проверьте поля",
    		errNumber: "должно быть числом в допустимом диапазоне",
    		errRatio: "должно быть от 0 до 1",
    		errUrl: "должен быть адресом http(s)",
    		errEmpty: "не может быть пустым",
    		errSeconds: "должно быть 0 или не меньше 15",
    		errMinutes: "должно быть не меньше 1",
    		switchOn: "Вкл",
    		switchOff: "Выкл",
    		balanceTitle: "CheapVibeCode",
    		balanceButton: "CVC баланс",
    		balanceRefresh: "Обновить",
    		balanceResetPos: "Сбросить позицию",
    		balanceClose: "Закрыть",
    		balanceLoading: "обновление…",
    		balanceNone: "Провайдеры с baseURL, содержащим cheapvibecode.ru, не найдены.",
    		balanceUnits: "Остаток, единицы",
    		balanceSpent: "Расход с прошлого замера",
    		balanceKeyMissing: "ключ не найден",
    		balanceError: "Ошибка баланса",
    		balanceStale: "Показан прошлый замер",
    		balanceDragHint: "Панель можно перетащить",
    		balanceRelease: "Отпустите, чтобы закрепить"
    	}
    };
    // src/client/config-form.js
    /**
    * Модель формы настроек: пути полей, умолчания, чтение и запись конфига.
    *
    * Конфиг 2.0.0 сгруппирован (`features`, `providers`, `catalog`, `coefficients`,
    * `balance`), но в установке с 1.0.0 в патче лежат плоские ключи. Страница
    * читает оба вида, а сохраняет всегда новый: одно нажатие «Сохранить» — это и
    * есть миграция строки конфига, о которой предупреждает `configShape: 'legacy'`.
    *
    * Всё в этом модуле — чистые функции без React и без сети: иначе форму нельзя
    * проверить тестом отдельно от рендера.
    *
    * @module cvc-catalog-sync-plugin/client/config-form
    */
    /** Ключи функций, которые включает и выключает страница. */
    const FEATURE_KEYS = Object.freeze([
    	"catalogSync",
    	"coefficients",
    	"balance"
    ]);
    /**
    * Переключатели функций в порядке показа.
    *
    * @type {ReadonlyArray<{key: string, labelKey: string, hintKey: string}>}
    */
    const FEATURE_ITEMS = Object.freeze([
    	{
    		key: "catalogSync",
    		labelKey: "featureCatalogSync",
    		hintKey: "featureCatalogSyncHint"
    	},
    	{
    		key: "coefficients",
    		labelKey: "featureCoefficients",
    		hintKey: "featureCoefficientsHint"
    	},
    	{
    		key: "balance",
    		labelKey: "featureBalance",
    		hintKey: "featureBalanceHint"
    	}
    ]);
    /** Группы параметров в порядке показа. */
    const GROUPS = Object.freeze([
    	{
    		id: "catalog",
    		titleKey: "groupCatalog"
    	},
    	{
    		id: "coefficients",
    		titleKey: "groupCoefficients"
    	},
    	{
    		id: "balance",
    		titleKey: "groupBalance"
    	},
    	{
    		id: "advanced",
    		titleKey: "groupAdvanced"
    	}
    ]);
    /** Поля в порядке показа и в порядке записи конфига. */
    const FIELD_LIST = Object.freeze([
    	{
    		id: "provider",
    		group: "catalog",
    		path: ["catalog", "provider"],
    		legacy: "provider",
    		kind: "text",
    		labelKey: "provider",
    		hintKey: "providerHint"
    	},
    	{
    		id: "autoSync",
    		group: "catalog",
    		path: ["catalog", "autoSync"],
    		legacy: "autoSync",
    		kind: "switch",
    		labelKey: "autoSync",
    		hintKey: "autoSyncHint"
    	},
    	{
    		id: "intervalHours",
    		group: "catalog",
    		path: ["catalog", "intervalHours"],
    		legacy: "intervalHours",
    		kind: "number",
    		min: 0,
    		step: 1,
    		labelKey: "intervalHours",
    		hintKey: "intervalHoursHint"
    	},
    	{
    		id: "startupDelayMs",
    		group: "catalog",
    		path: ["catalog", "startupDelayMs"],
    		legacy: "startupDelayMs",
    		kind: "number",
    		min: 0,
    		step: 500,
    		labelKey: "startupDelayMs",
    		hintKey: "startupDelayMsHint"
    	},
    	{
    		id: "minModelRatio",
    		group: "catalog",
    		path: ["catalog", "minModelRatio"],
    		legacy: "minModelRatio",
    		kind: "number",
    		min: .05,
    		max: 1,
    		step: .05,
    		labelKey: "minModelRatio",
    		hintKey: "minModelRatioHint"
    	},
    	{
    		id: "keepModels",
    		group: "catalog",
    		path: ["catalog", "keepModels"],
    		legacy: "keepModels",
    		kind: "list",
    		labelKey: "keepModels",
    		hintKey: "keepModelsHint"
    	},
    	{
    		id: "installerUrls",
    		group: "catalog",
    		path: ["catalog", "installerUrls"],
    		legacy: "installerUrls",
    		kind: "list",
    		labelKey: "installerUrls",
    		hintKey: "installerUrlsHint"
    	},
    	{
    		id: "syncAllowlist",
    		group: "catalog",
    		path: ["catalog", "syncAllowlist"],
    		legacy: "syncAllowlist",
    		kind: "switch",
    		labelKey: "syncAllowlist",
    		hintKey: "syncAllowlistHint"
    	},
    	{
    		id: "allowlistEntryId",
    		group: "catalog",
    		path: ["catalog", "allowlistEntryId"],
    		legacy: "allowlistEntryId",
    		kind: "text",
    		labelKey: "allowlistEntryId",
    		hintKey: "allowlistEntryIdHint"
    	},
    	{
    		id: "refreshMinutes",
    		group: "coefficients",
    		path: ["coefficients", "refreshMinutes"],
    		legacy: null,
    		kind: "number",
    		min: 1,
    		step: 1,
    		labelKey: "refreshMinutes",
    		hintKey: "refreshMinutesHint"
    	},
    	{
    		id: "showFast",
    		group: "coefficients",
    		path: ["coefficients", "showFast"],
    		legacy: null,
    		kind: "switch",
    		labelKey: "showFast",
    		hintKey: "showFastHint"
    	},
    	{
    		id: "refreshSeconds",
    		group: "balance",
    		path: ["balance", "refreshSeconds"],
    		legacy: null,
    		kind: "number",
    		min: 0,
    		step: 5,
    		labelKey: "refreshSeconds",
    		hintKey: "refreshSecondsHint"
    	},
    	{
    		id: "showDelta",
    		group: "balance",
    		path: ["balance", "showDelta"],
    		legacy: null,
    		kind: "switch",
    		labelKey: "showDelta",
    		hintKey: "showDeltaHint"
    	},
    	{
    		id: "entryId",
    		group: "advanced",
    		path: ["providers", "entryId"],
    		legacy: "entryId",
    		kind: "text",
    		labelKey: "entryId",
    		hintKey: "entryIdHint"
    	},
    	{
    		id: "match",
    		group: "advanced",
    		path: ["providers", "match"],
    		legacy: null,
    		kind: "list",
    		labelKey: "match",
    		hintKey: "matchHint"
    	},
    	{
    		id: "apiKeyEnv",
    		group: "advanced",
    		path: ["providers", "apiKeyEnv"],
    		legacy: "apiKeyEnv",
    		kind: "text",
    		labelKey: "apiKeyEnv",
    		hintKey: "apiKeyEnvHint"
    	},
    	{
    		id: "baseURL",
    		group: "advanced",
    		path: ["providers", "baseURL"],
    		legacy: "baseURL",
    		kind: "text",
    		labelKey: "baseURL",
    		hintKey: "baseURLHint"
    	},
    	{
    		id: "timeoutMs",
    		group: "advanced",
    		path: ["providers", "timeoutMs"],
    		legacy: "timeoutMs",
    		kind: "number",
    		min: 1,
    		step: 1e3,
    		labelKey: "timeoutMs",
    		hintKey: "timeoutMsHint"
    	},
    	{
    		id: "levelsCacheMinutes",
    		group: "advanced",
    		path: ["catalog", "levelsCacheMinutes"],
    		legacy: "levelsCacheMinutes",
    		kind: "number",
    		min: 0,
    		step: 10,
    		labelKey: "levelsCacheMinutes",
    		hintKey: "levelsCacheMinutesHint"
    	}
    ].map((field) => Object.freeze(field)));
    /** Поля выбранной группы. */
    function fieldsOfGroup(groupId) {
    	return FIELD_LIST.filter((field) => field.group === groupId);
    }
    /**
    * Умолчания схемы 2.0.0 (§2 спеки).
    *
    * Копия нужна как запасной источник: если хост пришлёт `state.defaults`,
    * страница возьмёт его, иначе — эти значения. Дублирование намеренное:
    * страница должна работать и без дополнительного поля в ответе.
    */
    const DEFAULT_CONFIG = Object.freeze({
    	features: Object.freeze({
    		catalogSync: true,
    		coefficients: true,
    		balance: true
    	}),
    	providers: Object.freeze({
    		match: Object.freeze(["cheapvibecode.ru"]),
    		entryId: "llm-pi-ai",
    		apiKeyEnv: "CVC_DEEPSEEK_API_KEY",
    		baseURL: "https://ru.cheapvibecode.ru/v1",
    		timeoutMs: 2e4
    	}),
    	catalog: Object.freeze({
    		provider: "cheapvibecode",
    		autoSync: true,
    		intervalHours: 24,
    		startupDelayMs: 5e3,
    		minModelRatio: .8,
    		keepModels: Object.freeze([]),
    		installerUrls: Object.freeze(["https://ru.cheapvibecode.ru/idhw", "https://ru.cheapvibecode.ru/idhl"]),
    		syncAllowlist: true,
    		allowlistEntryId: "subagent-model-selection-settings",
    		levelsCacheMinutes: 360
    	}),
    	coefficients: Object.freeze({
    		refreshMinutes: 10,
    		showFast: true
    	}),
    	balance: Object.freeze({
    		refreshSeconds: 0,
    		showDelta: true
    	})
    });
    /** Обычный объект (не массив и не `null`). */
    function isPlainObject(value) {
    	return value !== null && typeof value === "object" && !Array.isArray(value);
    }
    /** Прочитать путь в объекте, `undefined` на любом промахе. */
    function getPath(object, path) {
    	let current = object;
    	for (const key of path) {
    		if (!isPlainObject(current)) return void 0;
    		current = current[key];
    	}
    	return current;
    }
    /** Записать путь в объект, создавая недостающие группы. */
    function setPath(object, path, value) {
    	let current = object;
    	for (let index = 0; index < path.length - 1; index += 1) {
    		const key = path[index];
    		if (!isPlainObject(current[key])) current[key] = {};
    		current = current[key];
    	}
    	current[path[path.length - 1]] = value;
    }
    /** Глубокая копия значения без функций и без ссылок на исходный объект. */
    function clone(value) {
    	if (Array.isArray(value)) return value.map((item) => clone(item));
    	if (isPlainObject(value)) {
    		const copy = {};
    		for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    		return copy;
    	}
    	return value;
    }
    /**
    * Привести одно значение к типу поля.
    *
    * Строки-списки из текстового поля приходят массивом, но защита от строки
    * нужна: конфиг мог быть собран руками в YAML, где список — одна строка.
    *
    * @param {{ kind: string }} field - описание поля.
    * @param {unknown} raw - значение из конфига или из формы.
    * @returns {string | number | boolean | string[]} нормализованное значение.
    */
    function coerceValue(field, raw) {
    	if (field.kind === "switch") return raw === true;
    	if (field.kind === "number") {
    		if (typeof raw === "number") return raw;
    		if (typeof raw === "string" && raw.trim() !== "") {
    			const parsed = Number(raw);
    			return Number.isFinite(parsed) ? parsed : NaN;
    		}
    		return NaN;
    	}
    	if (field.kind === "list") {
    		if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter((item) => item.length > 0);
    		if (typeof raw === "string") return raw.split(/[\n,]+/).map((item) => item.trim()).filter((item) => item.length > 0);
    		return [];
    	}
    	return typeof raw === "string" ? raw : raw === void 0 || raw === null ? "" : String(raw);
    }
    /**
    * Прочитать поле конфига: сначала новый вид, затем плоский ключ 1.x, затем
    * умолчание схемы.
    *
    * @param {Record<string, unknown> | null | undefined} config - конфиг из стора.
    * @param {{ id: string, path: string[], legacy: string | null, kind: string }} field - поле.
    * @returns {unknown} значение для формы.
    */
    function readField(config, field) {
    	const source = isPlainObject(config) ? config : {};
    	const nested = getPath(source, field.path);
    	if (nested !== void 0) return coerceValue(field, nested);
    	const legacy = field.legacy === null ? void 0 : source[field.legacy];
    	if (legacy !== void 0) return coerceValue(field, legacy);
    	return coerceValue(field, getPath(DEFAULT_CONFIG, field.path));
    }
    /**
    * Прочитать все функции из конфига и стора.
    *
    * Стор отдаёт `features` отдельным полем ответа, но в конфиге они тоже есть:
    * если поля `features` в ответе нет, значения берутся оттуда.
    *
    * @param {Record<string, unknown> | null | undefined} features - `features` из ответа.
    * @param {Record<string, unknown> | null | undefined} config - конфиг.
    * @returns {{ catalogSync: boolean, coefficients: boolean, balance: boolean }} значения.
    */
    function readFeatures(features, config) {
    	const fromConfig = isPlainObject(config) && isPlainObject(config.features) ? config.features : {};
    	const fromState = isPlainObject(features) ? features : {};
    	const result = {};
    	for (const key of FEATURE_KEYS) if (typeof fromState[key] === "boolean") result[key] = fromState[key];
    	else if (typeof fromConfig[key] === "boolean") result[key] = fromConfig[key];
    	else result[key] = DEFAULT_CONFIG.features[key];
    	return result;
    }
    /**
    * Собрать черновик формы из конфига.
    *
    * @param {Record<string, unknown> | null | undefined} config - конфиг из стора.
    * @param {Record<string, unknown> | null | undefined} [features] - функции из ответа.
    * @returns {{ features: Record<string, boolean>, values: Record<string, unknown> }} черновик.
    */
    function createDraft(config, features) {
    	const values = {};
    	for (const field of FIELD_LIST) values[field.id] = readField(config, field);
    	return {
    		features: readFeatures(features, config),
    		values
    	};
    }
    /** Черновик с умолчаниями схемы. */
    function defaultsDraft() {
    	return createDraft(DEFAULT_CONFIG, DEFAULT_CONFIG.features);
    }
    /**
    * Собрать тело запроса `PUT /cvc/config` из черновика.
    *
    * Неизвестные ключи основы сохраняются: страница не должна выкидывать поля,
    * которых не знает. Плоские ключи 1.x, которыми управляет форма, удаляются —
    * иначе хост увидит и старое, и новое значение одного параметра.
    *
    * @param {{ features: Record<string, boolean>, values: Record<string, unknown> }} draft - черновик.
    * @param {Record<string, unknown> | null | undefined} [base] - текущий конфиг как основа.
    * @returns {Record<string, unknown>} конфиг 2.0.0.
    */
    function draftToConfig(draft, base) {
    	const next = clone(isPlainObject(base) && Object.keys(base).length > 0 ? base : DEFAULT_CONFIG);
    	for (const group of GROUPS) if (!isPlainObject(next[group.id])) next[group.id] = {};
    	for (const field of FIELD_LIST) {
    		const value = coerceValue(field, draft.values[field.id]);
    		setPath(next, field.path, field.kind === "number" && Number.isNaN(value) ? null : value);
    		if (field.legacy !== null) delete next[field.legacy];
    	}
    	const features = {};
    	for (const key of FEATURE_KEYS) features[key] = draft.features[key] === true;
    	next.features = features;
    	return next;
    }
    /** Сравнить черновик с конфигом по нормализованным значениям. */
    function isDirty(draft, config, features) {
    	const current = createDraft(config, features);
    	return JSON.stringify(current) !== JSON.stringify(draft);
    }
    /** Записать значение поля в черновик, не меняя остальные. */
    function withField(draft, fieldId, value) {
    	return {
    		...draft,
    		values: {
    			...draft.values,
    			[fieldId]: value
    		}
    	};
    }
    /** Включить или выключить функцию в черновике. */
    function withFeature(draft, key, value) {
    	return {
    		...draft,
    		features: {
    			...draft.features,
    			[key]: value === true
    		}
    	};
    }
    /** Похоже ли значение на адрес http(s). */
    function isHttpUrl(value) {
    	if (typeof value !== "string" || value.trim() === "") return false;
    	try {
    		const url = new URL(value);
    		return url.protocol === "http:" || url.protocol === "https:";
    	} catch {
    		return false;
    	}
    }
    /**
    * Проверить черновик перед сохранением.
    *
    * Проверка не заменяет хостовую: сервер всё равно валидирует по схеме и отвечает
    * 400 со списком полей. Здесь ловятся очевидные опечатки, чтобы не гонять
    * заведомо неверный запрос и показать ошибку рядом с полем.
    *
    * @param {{ features: Record<string, boolean>, values: Record<string, unknown> }} draft - черновик.
    * @returns {Array<{ field: string, code: string }>} ошибки в порядке полей.
    */
    function validateDraft(draft) {
    	const errors = [];
    	for (const field of FIELD_LIST) {
    		const value = draft.values[field.id];
    		if (field.kind === "number") {
    			const number = coerceValue(field, value);
    			if (!Number.isFinite(number)) {
    				errors.push({
    					field: field.id,
    					code: "errNumber"
    				});
    				continue;
    			}
    			if (field.id === "minModelRatio" && (number <= 0 || number > 1)) {
    				errors.push({
    					field: field.id,
    					code: "errRatio"
    				});
    				continue;
    			}
    			if (field.id === "refreshSeconds" && number !== 0 && number < 15) {
    				errors.push({
    					field: field.id,
    					code: "errSeconds"
    				});
    				continue;
    			}
    			if (field.id === "refreshMinutes" && number < 1) {
    				errors.push({
    					field: field.id,
    					code: "errMinutes"
    				});
    				continue;
    			}
    			const min = field.min === void 0 ? -1e400 : field.min;
    			const max = field.max === void 0 ? 1e400 : field.max;
    			if (number < min || number > max) errors.push({
    				field: field.id,
    				code: "errNumber"
    			});
    			continue;
    		}
    		if (field.kind === "list") {
    			const list = coerceValue(field, value);
    			if (field.id === "installerUrls" && list.some((item) => !isHttpUrl(item))) errors.push({
    				field: field.id,
    				code: "errUrl"
    			});
    			if (field.id === "match" && list.length === 0) errors.push({
    				field: field.id,
    				code: "errEmpty"
    			});
    			continue;
    		}
    		if (field.kind === "text") {
    			const text = coerceValue(field, value);
    			if (field.id === "baseURL" && !isHttpUrl(text)) errors.push({
    				field: field.id,
    				code: "errUrl"
    			});
    			if ((field.id === "provider" || field.id === "entryId") && text.trim() === "") errors.push({
    				field: field.id,
    				code: "errEmpty"
    			});
    		}
    	}
    	return errors;
    }
    // src/client/store.js
    /**
    * Стор клиентской половины: состояние плагина на стороне браузера.
    *
    * Источники — маршруты хост-половины под префиксом `/cvc`:
    *
    * - `GET /cvc/state` — `{version, features, config, configShape, status, lastRun,
    *   patchPath, rowId}`; единственный источник начальной загрузки;
    * - `PUT /cvc/config` — `{config}`; ответ `{ok, config, features}` обновляет
    *   стор без дополнительного запроса.
    *
    * Подписки синхронные и возвращают отписку: поверхности (бейджи, кнопка
    * баланса) должны снимать свои регистрации из `ctx.effect`.
    *
    * @module cvc-catalog-sync-plugin/client/store
    */
    /** Префикс маршрутов хост-половины (§4 спеки). */
    const API_PREFIX = "/cvc";
    /** Начальное состояние до первого ответа `GET /cvc/state`. */
    function initialState() {
    	return {
    		loaded: false,
    		loading: false,
    		error: "",
    		version: "",
    		features: readFeatures(null, null),
    		config: null,
    		configShape: "v2",
    		status: null,
    		lastRun: null,
    		patchPath: "",
    		rowId: ""
    	};
    }
    /**
    * Разобрать ответ `GET /cvc/state`.
    *
    * Ответ не доверяется целиком: пропущенное поле не должно превращаться в
    * `undefined` среди значений по умолчанию, иначе переключатель покажет
    * включённую функцию выключенной. `features` берутся из ответа, а при его
    * отсутствии — из групп конфига.
    *
    * @param {unknown} payload - тело ответа.
    * @param {object} [previous] - прежнее состояние (для `lastRun`).
    * @returns {object} новое состояние.
    */
    function applyState(payload, previous) {
    	const body = payload !== null && typeof payload === "object" ? payload : {};
    	const config = body.config !== null && typeof body.config === "object" ? body.config : null;
    	const status = body.status !== null && typeof body.status === "object" ? body.status : null;
    	const lastRun = body.lastRun !== null && typeof body.lastRun === "object" ? body.lastRun : status;
    	return {
    		loaded: true,
    		loading: false,
    		error: "",
    		version: typeof body.version === "string" ? body.version : "",
    		features: readFeatures(body.features, config),
    		config,
    		configShape: body.configShape === "legacy" ? "legacy" : "v2",
    		status,
    		lastRun: lastRun ?? previous?.lastRun ?? null,
    		patchPath: typeof body.patchPath === "string" ? body.patchPath : "",
    		rowId: typeof body.rowId === "string" ? body.rowId : ""
    	};
    }
    /**
    * Разобрать ответ `PUT /cvc/config`.
    *
    * Хост присылает действующий конфиг после нормализации, поэтому стор берёт его,
    * а не черновик формы: иначе форма и хост разошлись бы молча.
    *
    * @param {unknown} payload - тело ответа.
    * @param {object} previous - прежнее состояние.
    * @returns {object} новое состояние.
    */
    function applySaved(payload, previous) {
    	const body = payload !== null && typeof payload === "object" ? payload : {};
    	const config = body.config !== null && typeof body.config === "object" ? body.config : previous.config;
    	return {
    		...previous,
    		loaded: true,
    		error: "",
    		config,
    		features: readFeatures(body.features, config),
    		configShape: "v2"
    	};
    }
    /**
    * Собрать HTTP-вызов к хост-половине.
    *
    * Тело ошибки разбирается: хост отвечает 400 со списком полей, и без него
    * сообщение «HTTP 400» ничего не говорит пользователю.
    *
    * @param {typeof fetch} fetchImpl - реализация `fetch`.
    * @param {string} [prefix] - префикс маршрутов.
    * @returns {(method: string, path: string, body?: unknown) => Promise<any>} вызов.
    */
    function createApi(fetchImpl, prefix = API_PREFIX) {
    	return async function call(method, path, body) {
    		const init = {
    			method,
    			headers: { accept: "application/json" }
    		};
    		if (body !== void 0) {
    			init.headers["content-type"] = "application/json";
    			init.body = JSON.stringify(body);
    		}
    		const response = await fetchImpl(prefix + path, init);
    		let payload = null;
    		try {
    			payload = await response.json();
    		} catch {
    			payload = null;
    		}
    		if (!response.ok) {
    			const fields = Array.isArray(payload?.fields) ? payload.fields.filter((item) => typeof item === "string") : [];
    			const detail = fields.length > 0 ? `${payload?.error ?? "invalid"}: ${fields.join("; ")}` : typeof payload?.error === "string" && payload.error.length > 0 ? payload.error : `HTTP ${response.status}`;
    			const error = new Error(detail);
    			error.status = response.status;
    			error.fields = fields;
    			error.payload = payload;
    			throw error;
    		}
    		return payload;
    	};
    }
    /**
    * Прочитать JSON-маршрут без исключений.
    *
    * Поверхности (бейджи, баланс) не должны падать от 404 выключенной функции или
    * от битого JSON: им нужен результат, а не исключение. Ошибка возвращается
    * строкой, чтобы её можно было показать в панели.
    *
    * @param {typeof fetch} fetchImpl - реализация `fetch`.
    * @param {string} path - путь после префикса (`/coefficients`, `/balance`).
    * @param {string} [prefix] - префикс маршрутов.
    * @returns {Promise<{ok: boolean, status: number, body: any, error: string}>} результат.
    */
    async function readRoute(fetchImpl, path, prefix = API_PREFIX) {
    	let response;
    	try {
    		response = await fetchImpl(prefix + path, { headers: { accept: "application/json" } });
    	} catch (error) {
    		return {
    			ok: false,
    			status: 0,
    			body: null,
    			error: error instanceof Error ? error.message : String(error)
    		};
    	}
    	let body = null;
    	try {
    		body = await response.json();
    	} catch {
    		body = null;
    	}
    	if (!response.ok) return {
    		ok: false,
    		status: response.status,
    		body,
    		error: `HTTP ${response.status}`
    	};
    	if (body === null || typeof body !== "object") return {
    		ok: false,
    		status: response.status,
    		body: null,
    		error: "invalid JSON"
    	};
    	return {
    		ok: true,
    		status: response.status,
    		body,
    		error: ""
    	};
    }
    /**
    * Создать стор.
    *
    * Стор не регистрирует ничего побочного: ни таймеров, ни слушателей окна —
    * этим занимается `index.js` внутри `ctx.effect`, иначе остановка плагина
    * оставила бы висеть работу.
    *
    * @param {object} [options]
    * @param {typeof fetch} [options.fetch] - реализация `fetch`.
    * @param {string} [options.prefix] - префикс маршрутов.
    * @param {(payload: unknown) => unknown} [options.onFeatures] - наблюдатель
    *   изменений набора функций; вызывается после каждого обновления, если набор
    *   действительно изменился.
    * @returns {object} стор.
    */
    function createStore(options = {}) {
    	const fetchImpl = options.fetch ?? globalThis.fetch;
    	const call = createApi(fetchImpl, options.prefix ?? "/cvc");
    	const listeners = /* @__PURE__ */ new Set();
    	let state = initialState();
    	let inflight = null;
    	/** Оповестить подписчиков; ошибка одного не мешает остальным. */
    	function emit() {
    		for (const listener of [...listeners]) try {
    			listener(state);
    		} catch {}
    	}
    	/** Короткий отпечаток набора функций для сравнения. */
    	function featuresKey(value) {
    		return `${value.coefficients ? 1 : 0}${value.balance ? 1 : 0}${value.catalogSync ? 1 : 0}`;
    	}
    	/** Заменить состояние, оповестив подписчиков и наблюдателя функций. */
    	function commit(next) {
    		const before = featuresKey(state.features);
    		state = next;
    		emit();
    		if (featuresKey(state.features) !== before && typeof options.onFeatures === "function") try {
    			options.onFeatures(state.features, state);
    		} catch {}
    	}
    	return {
    		/** Текущее состояние. */
    		getState() {
    			return state;
    		},
    		/**
    		* Подписка на изменение состояния.
    		*
    		* @param {(state: object) => void} listener - получатель.
    		* @returns {() => void} отписка.
    		*/
    		subscribe(listener) {
    			listeners.add(listener);
    			return () => {
    				listeners.delete(listener);
    			};
    		},
    		/**
    		* Перечитать состояние с хоста.
    		*
    		* Параллельные вызовы схлопываются в один запрос: страница и кнопка
    		* баланса могут обновлять состояние одновременно.
    		*
    		* @returns {Promise<object>} новое состояние.
    		*/
    		refresh() {
    			if (inflight !== null) return inflight;
    			state = {
    				...state,
    				loading: true
    			};
    			emit();
    			inflight = (async () => {
    				try {
    					commit(applyState(await call("GET", "/state"), state));
    					return state;
    				} catch (error) {
    					state = {
    						...state,
    						loading: false,
    						error: error instanceof Error ? error.message : String(error)
    					};
    					emit();
    					throw error;
    				} finally {
    					inflight = null;
    				}
    			})();
    			return inflight;
    		},
    		/**
    		* Сохранить конфиг и обновить состояние из ответа.
    		*
    		* @param {Record<string, unknown>} config - полный конфиг.
    		* @returns {Promise<object>} новое состояние.
    		*/
    		async save(config) {
    			commit(applySaved(await call("PUT", "/config", { config }), state));
    			return state;
    		},
    		/**
    		* Запустить прогон каталога.
    		*
    		* Ответ прогона сразу становится `lastRun`: страница не должна ждать
    		* повторного `GET /cvc/state`, чтобы показать итог.
    		*
    		* @param {'plan' | 'apply'} action - режим.
    		* @param {boolean} [force] - обойти защиту от усыхания каталога.
    		* @returns {Promise<object>} результат прогона.
    		*/
    		async run(action, force) {
    			const body = { action };
    			if (force === true) body.force = true;
    			const value = await call("POST", "/run", body);
    			const result = value !== null && typeof value === "object" ? value : {
    				ok: false,
    				error: "empty result"
    			};
    			commit({
    				...state,
    				lastRun: result,
    				status: result
    			});
    			return result;
    		},
    		/**
    		* Прочитать коэффициенты.
    		*
    		* @returns {Promise<{ok: boolean, status: number, body: any, error: string}>} результат.
    		*/
    		async coefficients() {
    			return readRoute(fetchImpl, "/coefficients", options.prefix ?? "/cvc");
    		},
    		/**
    		* Прочитать баланс.
    		*
    		* @returns {Promise<{ok: boolean, status: number, body: any, error: string}>} результат.
    		*/
    		async balance() {
    			return readRoute(fetchImpl, "/balance", options.prefix ?? "/cvc");
    		}
    	};
    }
    // src/client/settings.js
    /**
    * Страница настроек плагина: три переключателя функций и группы параметров.
    *
    * Разметка выросла из страницы 1.0.0: те же поля, тот же порядок кнопок и тот
    * же блок «последний прогон». Добавлены переключатели функций, поэтому страница
    * одновременно и настройка, и единственный выключатель плагина.
    *
    * Данные страница берёт только из стора (`GET /cvc/state`, ответ
    * `PUT /cvc/config`); своих запросов она не делает.
    *
    * @module cvc-catalog-sync-plugin/client/settings
    */
    const h$2 = react.default.createElement;
    /** Текст ошибки из исключения. */
    function messageOf(error) {
    	return error instanceof Error ? error.message : String(error);
    }
    /** Поле формы: подпись, подсказка и контрол. */
    function Field({ label, hint, children }) {
    	return h$2("div", { className: "cvc2-field" }, h$2("div", null, h$2("div", { className: "cvc2-label" }, label), hint ? h$2("div", { className: "cvc2-hint" }, hint) : null), h$2("div", { className: "cvc2-control" }, children));
    }
    /** Текстовая строка. */
    function TextInput({ value, onChange, placeholder }) {
    	return h$2("input", {
    		type: "text",
    		value: value ?? "",
    		placeholder,
    		spellCheck: false,
    		autoComplete: "off",
    		onChange: (event) => onChange(event.target.value)
    	});
    }
    /** Числовое поле: пустое значение не ломает форму, а уходит в проверку. */
    function NumberInput({ value, onChange, min, max, step }) {
    	return h$2("input", {
    		type: "number",
    		value: Number.isFinite(value) ? String(value) : "",
    		min,
    		max,
    		step,
    		onChange: (event) => {
    			const raw = event.target.value;
    			onChange(raw === "" ? NaN : Number(raw));
    		}
    	});
    }
    /** Список строк: по одной на строку, как в 1.0.0. */
    function ListInput({ value, onChange }) {
    	return h$2("textarea", {
    		value: Array.isArray(value) ? value.join("\n") : "",
    		spellCheck: false,
    		onChange: (event) => onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))
    	});
    }
    /**
    * Переключатель с ролью `switch`.
    *
    * `aria-checked` обязателен: без него экранный диктор читает кнопку как
    * «кнопка», а не как «переключатель, включено/выключено».
    */
    function Switch({ checked, onChange, label, feature }) {
    	return h$2("div", { className: "cvc2-row" }, h$2("button", {
    		type: "button",
    		role: "switch",
    		"aria-checked": checked === true,
    		"aria-label": label,
    		className: "cvc2-switch",
    		"data-on": checked === true,
    		"data-feature": feature,
    		onClick: () => onChange(checked !== true)
    	}), h$2("span", { className: "cvc2-muted" }, checked === true ? label : " "));
    }
    /** Список как одна строка, без пустых значений. */
    function joinList(list) {
    	return Array.isArray(list) && list.length > 0 ? list.join(", ") : "";
    }
    /**
    * Итог последнего прогона.
    *
    * Поля проверяются по одному: ответ мог прийти от прежней версии хоста или
    * быть неполным, и тогда блок не должен падать на `undefined.length`.
    */
    function StatusBlock({ t, value }) {
    	if (value === null || value === void 0) return null;
    	const lines = [];
    	const added = Array.isArray(value.added) ? value.added : [];
    	const removed = Array.isArray(value.removed) ? value.removed : [];
    	const changed = Array.isArray(value.changed) ? value.changed : [];
    	const warnings = Array.isArray(value.warnings) ? value.warnings : [];
    	const allowlist = value.allowlist !== null && typeof value.allowlist === "object" ? value.allowlist : {};
    	const allowlistAdded = Array.isArray(allowlist.added) ? allowlist.added : [];
    	const allowlistPruned = Array.isArray(allowlist.pruned) ? allowlist.pruned : [];
    	lines.push(h$2("div", {
    		className: "cvc2-line",
    		key: "counts"
    	}, h$2("span", null, h$2("b", null, t("catalogCount")), ` ${value.catalogModels ?? "—"}`), h$2("span", null, h$2("b", null, t("currentCount")), ` ${value.currentModels ?? "—"}`), h$2("span", null, h$2("b", null, t("nextCount")), ` ${value.nextModels ?? "—"}`), h$2("span", null, h$2("b", null, t("levels")), " ", h$2("span", { className: "cvc2-mono" }, value.levelsSource || "—"))));
    	const empty = added.length === 0 && removed.length === 0 && changed.length === 0;
    	lines.push(h$2("div", {
    		className: empty ? "cvc2-ok" : "",
    		key: "diff"
    	}, empty ? t("noDiff") : [
    		added.length ? `${t("added")}: ${joinList(added)}` : "",
    		removed.length ? `${t("removed")}: ${joinList(removed)}` : "",
    		changed.length ? `${t("changed")}: ${changed.map((row) => `${row?.id ?? "?"} (${joinList(row?.fields)})`).join(", ")}` : ""
    	].filter(Boolean).join(" · ")));
    	if (allowlistAdded.length > 0) lines.push(h$2("div", { key: "al-add" }, `${t("allowlistAdded")}: ${joinList(allowlistAdded)}`));
    	if (allowlistPruned.length > 0) lines.push(h$2("div", { key: "al-prune" }, `${t("allowlistPruned")}: ${joinList(allowlistPruned)}`));
    	for (const [index, warning] of warnings.entries()) lines.push(h$2("div", {
    		className: "cvc2-warn",
    		key: `warn-${index}`
    	}, String(warning)));
    	if (value.error) lines.push(h$2("div", {
    		className: "cvc2-error",
    		key: "error"
    	}, `${t("runError")}: ${value.error}`));
    	if (value.at) lines.push(h$2("div", {
    		className: "cvc2-muted",
    		key: "at"
    	}, String(value.at)));
    	if (value.applied === true) lines.push(h$2("div", {
    		className: "cvc2-ok",
    		key: "applied"
    	}, "✓"));
    	return h$2("div", {
    		className: "cvc2-status",
    		"data-cvc": "status"
    	}, h$2("h3", null, t("statusTitle")), ...lines);
    }
    /** Короткая строка для страницы плагина: там под форму нет места. */
    function BundleSummary({ t }) {
    	return h$2("span", { className: "cvc2-muted" }, t("summary"));
    }
    /** Значок секции в навигации настроек: каталог, коэффициент и баланс вместе. */
    function NavIcon({ size = 16 }) {
    	return h$2("svg", {
    		width: size,
    		height: size,
    		viewBox: "0 0 64 64",
    		"aria-hidden": true,
    		style: { display: "block" }
    	}, h$2("path", {
    		d: "M14 16h22a8 8 0 0 1 8 8v4",
    		fill: "none",
    		stroke: "currentColor",
    		strokeWidth: 5,
    		strokeLinecap: "round"
    	}), h$2("path", {
    		d: "M46 24h4v26H22",
    		fill: "none",
    		stroke: "currentColor",
    		strokeWidth: 5,
    		strokeLinecap: "round",
    		strokeLinejoin: "round"
    	}), h$2("path", {
    		d: "M14 16v32h14",
    		fill: "none",
    		stroke: "currentColor",
    		strokeWidth: 5,
    		strokeLinecap: "round",
    		strokeLinejoin: "round"
    	}), h$2("path", {
    		d: "M36 40h6",
    		fill: "none",
    		stroke: "currentColor",
    		strokeWidth: 5,
    		strokeLinecap: "round"
    	}), h$2("path", {
    		d: "M26 34h8",
    		fill: "none",
    		stroke: "currentColor",
    		strokeWidth: 5,
    		strokeLinecap: "round"
    	}));
    }
    /** Контрол поля по его виду. */
    function Control({ field, draft, t, setValue }) {
    	const value = draft.values[field.id];
    	if (field.kind === "switch") return h$2(Switch, {
    		checked: value === true,
    		label: t(field.labelKey),
    		onChange: (next) => setValue(field.id, next)
    	});
    	if (field.kind === "number") return h$2(NumberInput, {
    		value,
    		min: field.min,
    		max: field.max,
    		step: field.step,
    		onChange: (next) => setValue(field.id, next)
    	});
    	if (field.kind === "list") return h$2(ListInput, {
    		value,
    		onChange: (next) => setValue(field.id, next)
    	});
    	return h$2(TextInput, {
    		value,
    		onChange: (next) => setValue(field.id, next)
    	});
    }
    /** Человеческое описание ошибок проверки. */
    function describeErrors(t, errors) {
    	return errors.map((error) => {
    		const field = FIELD_LIST.find((item) => item.id === error.field);
    		return `${field === void 0 ? error.field : t(field.labelKey)}: ${t(error.code)}`;
    	}).join("; ");
    }
    /**
    * Страница настроек.
    *
    * @param {object} props
    * @param {(key: string) => string} props.t - перевод по ключу словаря.
    * @param {object} props.store - стор клиентской половины.
    * @param {boolean} [props.embedded] - блок на странице плагина, без описания.
    */
    function SettingsPage({ t, store, embedded = false }) {
    	const [snapshot, setSnapshot] = react.default.useState(() => store.getState());
    	const [draft, setDraft] = react.default.useState(() => createDraft(snapshot.config, snapshot.features));
    	const [busy, setBusy] = react.default.useState("");
    	const [note, setNote] = react.default.useState(null);
    	const [run, setRun] = react.default.useState(null);
    	const [confirming, setConfirming] = react.default.useState(false);
    	react.default.useEffect(() => {
    		const off = store.subscribe((next) => setSnapshot(next));
    		return () => off();
    	}, [store]);
    	react.default.useEffect(() => {
    		if (isDirty(draft, snapshot.config, snapshot.features)) return;
    		setDraft(createDraft(snapshot.config, snapshot.features));
    	}, [snapshot.config, snapshot.features]);
    	const setValue = react.default.useCallback((fieldId, value) => {
    		setDraft((current) => withField(current, fieldId, value));
    	}, []);
    	const dirty = isDirty(draft, snapshot.config, snapshot.features);
    	const disabled = busy !== "";
    	const onSave = react.default.useCallback(async () => {
    		const errors = validateDraft(draft);
    		if (errors.length > 0) {
    			setNote({
    				kind: "error",
    				text: `${t("errFields")}: ${describeErrors(t, errors)}`
    			});
    			return;
    		}
    		setBusy("save");
    		setNote(null);
    		try {
    			await store.save(draftToConfig(draft, snapshot.config));
    			const next = store.getState();
    			setSnapshot(next);
    			setDraft(createDraft(next.config, next.features));
    			setNote({
    				kind: "ok",
    				text: t("saved")
    			});
    		} catch (error) {
    			setNote({
    				kind: "error",
    				text: `${t("errSave")}: ${messageOf(error)}`
    			});
    		} finally {
    			setBusy("");
    		}
    	}, [
    		draft,
    		snapshot.config,
    		store,
    		t
    	]);
    	const onRun = react.default.useCallback(async (action) => {
    		setBusy(action);
    		setNote(null);
    		setConfirming(false);
    		try {
    			const value = await store.run(action);
    			setRun(value);
    			setSnapshot(store.getState());
    			if (value?.ok === true) setNote({
    				kind: "ok",
    				text: action === "apply" ? t("applied") : t("checked")
    			});
    			else setNote({
    				kind: "error",
    				text: `${t("runError")}: ${value?.error ?? ""}`
    			});
    		} catch (error) {
    			setNote({
    				kind: "error",
    				text: `${t("errRun")}: ${messageOf(error)}`
    			});
    		} finally {
    			setBusy("");
    		}
    	}, [store, t]);
    	const onReset = react.default.useCallback(() => {
    		setDraft(defaultsDraft());
    		setNote({
    			kind: "warn",
    			text: t("resetDone")
    		});
    	}, [t]);
    	if (snapshot.config === null) return h$2("div", {
    		className: "cvc2-page",
    		"data-cvc": "page"
    	}, h$2(embedded ? "h3" : "h2", { className: embedded ? "cvc2-embedded-title" : void 0 }, t("title")), h$2("p", { className: "cvc2-desc" }, note?.text ?? (snapshot.error ? `${t("errLoad")}: ${snapshot.error}` : t("loading"))));
    	const status = run ?? snapshot.lastRun ?? snapshot.status;
    	const groups = GROUPS.map((group) => {
    		const fields = fieldsOfGroup(group.id);
    		if (fields.length === 0) return null;
    		return h$2("div", {
    			className: "cvc2-group",
    			"data-group": group.id,
    			key: group.id
    		}, h$2("h3", null, t(group.titleKey)), fields.map((field) => h$2(Field, {
    			label: t(field.labelKey),
    			hint: t(field.hintKey),
    			key: field.id
    		}, h$2("div", { "data-field": field.id }, h$2(Control, {
    			field,
    			draft,
    			t,
    			setValue
    		})))));
    	});
    	return h$2("div", {
    		className: "cvc2-page",
    		"data-cvc": "page"
    	}, h$2(embedded ? "h3" : "h2", { className: embedded ? "cvc2-embedded-title" : void 0 }, t("title")), embedded ? null : h$2("p", { className: "cvc2-desc" }, t("desc")), h$2("div", {
    		className: "cvc2-group",
    		"data-group": "features",
    		key: "features"
    	}, h$2("h3", null, t("groupFeatures")), h$2("p", { className: "cvc2-features-note" }, t("featuresNote")), FEATURE_ITEMS.map((item) => h$2(Field, {
    		label: t(item.labelKey),
    		hint: t(item.hintKey),
    		key: item.key
    	}, h$2("div", { "data-field": `feature.${item.key}` }, h$2(Switch, {
    		checked: draft.features[item.key] === true,
    		feature: item.key,
    		label: t(item.labelKey),
    		onChange: (next) => setDraft((current) => withFeature(current, item.key, next))
    	}))))), ...groups, h$2(StatusBlock, {
    		t,
    		value: status,
    		key: "status"
    	}), h$2("div", {
    		className: "cvc2-actions",
    		"data-cvc": "actions",
    		key: "actions"
    	}, h$2("button", {
    		type: "button",
    		className: "cvc2-btn",
    		"data-primary": true,
    		"data-action": "save",
    		disabled: disabled || !dirty,
    		onClick: onSave
    	}, busy === "save" ? t("saving") : t("save")), h$2("button", {
    		type: "button",
    		className: "cvc2-btn",
    		"data-action": "check",
    		disabled,
    		onClick: () => onRun("plan")
    	}, busy === "plan" ? t("checking") : t("check")), h$2("button", {
    		type: "button",
    		className: "cvc2-btn",
    		"data-action": "apply",
    		disabled,
    		onClick: () => setConfirming(true)
    	}, busy === "apply" ? t("applying") : t("apply")), h$2("button", {
    		type: "button",
    		className: "cvc2-btn",
    		"data-action": "reset",
    		disabled,
    		onClick: onReset
    	}, t("reset")), h$2("span", {
    		className: "cvc2-note",
    		"data-kind": note?.kind ?? "",
    		"data-cvc": "note"
    	}, note?.text ?? "")), confirming ? h$2("div", {
    		className: "cvc2-status",
    		key: "confirm"
    	}, h$2("div", null, t("confirmApply")), h$2("div", {
    		className: "cvc2-actions",
    		style: { marginTop: "8px" }
    	}, h$2("button", {
    		type: "button",
    		className: "cvc2-btn",
    		"data-primary": true,
    		onClick: () => onRun("apply")
    	}, t("confirmYes")), h$2("button", {
    		type: "button",
    		className: "cvc2-btn",
    		onClick: () => setConfirming(false)
    	}, t("confirmNo")))) : null, h$2("p", {
    		className: "cvc2-hint",
    		key: "dirty"
    	}, [
    		t("checkUsesSaved"),
    		dirty ? `${t("dirty")}` : "",
    		snapshot.configShape === "legacy" ? t("legacyHint") : ""
    	].filter(Boolean).join(" · ")), h$2("p", {
    		className: "cvc2-hint cvc2-mono",
    		key: "patch",
    		"data-cvc": "patch"
    	}, `${t("patch")}: ${snapshot.patchPath || "—"}`));
    }
    // src/client/coefficients.js
    /** Атрибут, по которому бейдж находит свой узел и не дублируется. */
    const BADGE_ATTR = "data-cvc2-coeff";
    /**
    * Карта коэффициентов и список провайдеров из ответа маршрута.
    *
    * Записи без числового множителя отбрасываются: бейдж «×(нет)» бессмыслен.
    *
    * @param {unknown} payload - тело `GET /cvc/coefficients`.
    * @returns {{ models: Map<string, {id: string, multiplier: number, fastMultiplier: number | null}>, providers: string[] }} карта.
    */
    function indexPayload(payload) {
    	const raw = Array.isArray(payload?.models) ? payload.models : [];
    	const models = /* @__PURE__ */ new Map();
    	for (const model of raw) {
    		if (typeof model?.id !== "string" || model.id.length === 0) continue;
    		if (!Number.isFinite(model.multiplier)) continue;
    		models.set(model.id, {
    			id: model.id,
    			multiplier: model.multiplier,
    			fastMultiplier: Number.isFinite(model.fastMultiplier) ? model.fastMultiplier : null
    		});
    	}
    	return {
    		models,
    		providers: Array.isArray(payload?.providers) ? payload.providers.filter((id) => typeof id === "string" && id.length > 0) : []
    	};
    }
    /** Сколько знаков после запятой показывается полностью. */
    const SHOWN_DECIMALS = 3;
    /**
    * Значение огрублённое до `SHOWN_DECIMALS` знаков.
    *
    * Экспоненциальную запись (`1e-7`) раскладываем в обычную десятичную:
    * бейдж должен читаться как число, а не как степень.
    * @param {number} value
    * @returns {string} например `0.001`, `2.5`, `10`.
    */
    function plainNumber(value) {
    	const rounded = Number(value.toFixed(SHOWN_DECIMALS));
    	const text = String(rounded);
    	if (!/e/i.test(text)) return text;
    	const [mantissa, exponent] = text.split(/e/i);
    	const power = Number(exponent);
    	const digits = mantissa.replace("-", "").replace(".", "");
    	const sign = mantissa.startsWith("-") ? "-" : "";
    	if (power >= 0) return `${sign}${digits}${"0".repeat(power)}`;
    	return `${sign}0.${"0".repeat(Math.abs(power) - 1)}${digits}`;
    }
    /**
    * Подпись множителя для бейджа и подсказки.
    *
    * До трёх знаков после запятой — точное значение: `×1`, `×0.1`, `×0.001`.
    * Если значение точнее, оно не округляется в «похожее» число, а показывается
    * огрублённым с тильдой: `0.125` → `×~0.125`, `0.0005` → `×~0.001` (иначе
    * `×0` врал бы: модель не бесплатная).
    *
    * @param {number} value - множитель.
    * @returns {string} подпись бейджа; пустая строка для нечисла.
    */
    function formatMultiplier(value) {
    	if (!Number.isFinite(value)) return "";
    	const exact = Number(value.toFixed(10));
    	const rounded = Number(value.toFixed(SHOWN_DECIMALS));
    	const shown = plainNumber(rounded);
    	return `×${Math.abs(exact - rounded) > 1e-9 ? "~" : ""}${shown}`;
    }
    /** Класс цены по тем же порогам, что и заметка в Obsidian. */
    function tierOf(multiplier) {
    	if (multiplier <= .5) return "cheap";
    	if (multiplier <= 1.5) return "mid";
    	if (multiplier <= 4) return "pricey";
    	return "expensive";
    }
    /**
    * Подсказка бейджа: множитель цены и, если разрешено, быстрый режим.
    *
    * @param {{multiplier: number, fastMultiplier: number | null}} entry - запись коэффициента.
    * @param {boolean} showFast - добавлять ли вторую строку.
    * @returns {string} текст `title`.
    */
    function badgeHint(entry, showFast) {
    	const lines = [formatMultiplier(entry.multiplier)];
    	if (showFast === true && entry.fastMultiplier !== null) lines.push(`fast ${formatMultiplier(entry.fastMultiplier)}`);
    	return lines.join(" · ");
    }
    /**
    * Расставить бейджи по уже нарисованным именам моделей.
    *
    * Идемпотентна: повторный вызов на том же дереве не добавляет второй бейдж.
    * Бейдж ставится только строке провайдера, который отдал каталог: одинаковый
    * id у чужого провайдера остаётся без коэффициента. Если `data-provider-id`
    * нет, бейдж не ставится — угадывать провайдера нельзя.
    *
    * Узел без известного коэффициента остаётся без нового бейджа, а уже стоящий
    * бейдж снимается: каталог мог обновиться и модель из него ушла.
    *
    * @param {ParentNode} root - корень, в котором ищем строки моделей.
    * @param {{models: Map<string, object>, providers: string[]}} index - карта.
    * @param {{showFast?: boolean}} [options] - настройки подписи.
    * @returns {number} сколько бейджей стоит после прохода.
    */
    function decorate(root, index, options = {}) {
    	const names = typeof root?.querySelectorAll === "function" ? root.querySelectorAll("[data-model-id]") : [];
    	const allowed = new Set(index.providers.map((id) => String(id).toLowerCase()));
    	let placed = 0;
    	for (const node of names) {
    		const providerId = node.getAttribute("data-provider-id");
    		const allowedProvider = providerId !== null && allowed.has(providerId.toLowerCase());
    		const modelId = node.getAttribute("data-model-id");
    		const found = allowedProvider && typeof modelId === "string" ? index.models.get(modelId) ?? null : null;
    		const existing = node.querySelector(`[${BADGE_ATTR}]`);
    		if (found === null) {
    			existing?.remove();
    			continue;
    		}
    		const badge = existing ?? node.ownerDocument.createElement("span");
    		badge.setAttribute(BADGE_ATTR, "");
    		badge.className = "cvc2-badge";
    		badge.dataset.tier = tierOf(found.multiplier);
    		badge.textContent = formatMultiplier(found.multiplier);
    		badge.title = badgeHint(found, options.showFast !== false);
    		if (existing === null) node.appendChild(badge);
    		placed += 1;
    	}
    	return placed;
    }
    /** Снять все бейджи с дерева. */
    function clearBadges(root) {
    	if (typeof root?.querySelectorAll !== "function") return;
    	for (const badge of root.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove();
    }
    /**
    * Следить за селектором и дописывать коэффициенты по мере отрисовки строк.
    *
    * Меню селектора рисуется порталом вне корня слота, поэтому наблюдается весь
    * документ. Пропускаются только мутации внутри самого бейджа: иначе наблюдатель
    * зациклится на собственной записи. Добавление и удаление бейджа снаружи —
    * обычная причина перерисовать; `decorate` идемпотентна.
    *
    * Кадр откладывается до `requestAnimationFrame`: список моделей перерисовывается
    * при каждом нажатии клавиши в поиске, и синхронный проход на каждую мутацию
    * складывал бы лишние.
    *
    * @param {Document} documentRef - документ.
    * @param {() => { index: {models: Map<string, object>, providers: string[]}, showFast: boolean }} getState - текущее состояние.
    * @returns {() => void} остановка наблюдения; бейджи при этом снимаются.
    */
    function watch(documentRef, getState) {
    	let scheduled = false;
    	let stopped = false;
    	const run = () => {
    		scheduled = false;
    		if (stopped) return;
    		const state = getState();
    		decorate(documentRef, state.index, { showFast: state.showFast });
    	};
    	const schedule = () => {
    		if (scheduled || stopped) return;
    		scheduled = true;
    		const view = documentRef.defaultView;
    		if (view !== null && view !== void 0 && typeof view.requestAnimationFrame === "function") view.requestAnimationFrame(run);
    		else run();
    	};
    	const target = documentRef.body ?? documentRef.documentElement;
    	const Observer = globalThis.MutationObserver;
    	if (typeof Observer !== "function" || target === null || target === void 0) {
    		run();
    		return () => {
    			stopped = true;
    			clearBadges(documentRef);
    		};
    	}
    	const observer = new Observer((records) => {
    		for (const record of records) {
    			const node = record.target;
    			if (typeof node?.closest === "function" && node.closest(`[data-cvc2-coeff]`) !== null) continue;
    			schedule();
    			return;
    		}
    	});
    	observer.observe(target, {
    		subtree: true,
    		childList: true,
    		attributes: true,
    		attributeFilter: ["data-model-id"]
    	});
    	schedule();
    	return () => {
    		stopped = true;
    		observer.disconnect();
    		scheduled = false;
    		clearBadges(documentRef);
    	};
    }
    /**
    * Подключить наблюдатель на время жизни плагина.
    *
    * Вызывается из `index.js` внутри `ctx.effect` и только пока
    * `features.coefficients` включён: возвращённая функция ставит наблюдение и
    * таймер, а возвращаемое ей замыкание снимает всё вместе с бейджами. Стили
    * ставит `index.js` один раз на весь плагин — здесь их дублировать не нужно.
    *
    * @param {object} deps
    * @param {object} deps.store - стор клиентской половины.
    * @param {Document} deps.document - документ браузера.
    * @param {() => number} [deps.getRefreshMs] - период повторного чтения, мс.
    * @returns {() => void} остановка.
    */
    function startCoefficients({ store, document: documentRef, getRefreshMs }) {
    	let index = {
    		models: /* @__PURE__ */ new Map(),
    		providers: []
    	};
    	let showFast = true;
    	let stopped = false;
    	let timer = 0;
    	let lastLoad = 0;
    	/** Период опроса по текущему конфигу: 10 минут, если хост не сказал иного. */
    	const period = () => {
    		const requested = typeof getRefreshMs === "function" ? getRefreshMs() : 0;
    		return Number.isFinite(requested) && requested > 0 ? Math.max(1e3, requested) : 6e5;
    	};
    	const reload = async () => {
    		lastLoad = Date.now();
    		const result = await store.coefficients();
    		if (stopped || !result.ok) return;
    		index = indexPayload(result.body);
    		showFast = store.getState()?.config?.coefficients?.showFast !== false;
    		decorate(documentRef, index, { showFast });
    	};
    	const stopWatch = watch(documentRef, () => ({
    		index,
    		showFast
    	}));
    	reload();
    	const view = documentRef.defaultView;
    	if (view !== null && view !== void 0 && typeof view.setInterval === "function") timer = view.setInterval(() => {
    		if (Date.now() - lastLoad >= period()) reload();
    	}, Math.min(period(), 6e4));
    	return () => {
    		stopped = true;
    		if (timer !== 0) view.clearInterval(timer);
    		stopWatch();
    	};
    }
    // src/client/panel-pos.js
    /**
    * Чистая часть панели баланса: позиция в `localStorage` и состояние точки.
    *
    * Модуль без React: положение панели и цвет точки проверяются тестом без
    * рендера, а `balance.js` добавляет к ним сам компонент.
    *
    * @module cvc-catalog-sync-plugin/client/panel-pos
    */
    /**
    * Ключ `localStorage` с позицией панели.
    *
    * Пространство имён другое, чем в 1.1.0 (`cvc-balance:panel-pos`): панель другая
    * по разметке, и координаты прежней панели могут оказаться за пределами экрана.
    * Новая стартует из угла и запоминает своё.
    */
    const POS_KEY = "cvc:panel-pos";
    /**
    * Прочитать запомненную позицию панели.
    *
    * Чтение защищено: `localStorage` бросает в песочнице, а испорченное значение
    * не должно утянуть панель за собой. Нечисловая координата отбрасывается так
    * же, как отсутствующая.
    *
    * @param {Storage | null | undefined} storage - хранилище.
    * @returns {{left: number, top: number} | null} позиция.
    */
    function loadPos(storage) {
    	try {
    		const raw = storage?.getItem(POS_KEY);
    		if (typeof raw !== "string" || raw.length === 0) return null;
    		const { left, top } = JSON.parse(raw) ?? {};
    		if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    		return {
    			left,
    			top
    		};
    	} catch {
    		return null;
    	}
    }
    /**
    * Запомнить позицию панели, проглотив отказ хранилища.
    *
    * @param {Storage | null | undefined} storage - хранилище.
    * @param {{left: number, top: number}} pos - позиция.
    * @returns {boolean} удалось ли записать.
    */
    function savePos(storage, pos) {
    	try {
    		storage?.setItem(POS_KEY, JSON.stringify(pos));
    		return true;
    	} catch {
    		return false;
    	}
    }
    /**
    * Забыть позицию панели.
    *
    * @param {Storage | null | undefined} storage - хранилище.
    */
    function clearPos(storage) {
    	try {
    		storage?.removeItem(POS_KEY);
    	} catch {}
    }
    /**
    * Прижать позицию к окну, чтобы перетянутую за край панель всегда можно было
    * вернуть назад.
    *
    * @param {{left: number, top: number}} pos - желаемая позиция.
    * @param {{width: number, height: number}} size - размер панели.
    * @param {{width: number, height: number}} viewport - размер окна.
    * @returns {{left: number, top: number}} позиция внутри окна.
    */
    function clampPos(pos, size, viewport) {
    	const maxLeft = Math.max(8, viewport.width - size.width - 8);
    	const maxTop = Math.max(8, viewport.height - size.height - 8);
    	return {
    		left: Math.min(Math.max(pos.left, 8), maxLeft),
    		top: Math.min(Math.max(pos.top, 8), maxTop)
    	};
    }
    /**
    * Состояние точки у кнопки: всё прочитано, прочитано частично, ничего.
    *
    * @param {{busy: boolean, providers: object[] | null, error: string}} input - данные панели.
    * @returns {'' | 'ok' | 'warn' | 'err'} значение `data-state` точки.
    */
    function dotState({ busy, providers, error }) {
    	if (busy) return "warn";
    	if (Array.isArray(providers) && providers.length === 0) return error.length > 0 ? "err" : "";
    	if (!Array.isArray(providers)) return "";
    	const ok = providers.filter((provider) => provider?.balanceUnits !== null && provider?.balanceUnits !== void 0).length;
    	if (ok === providers.length) return "ok";
    	return ok > 0 ? "warn" : "err";
    }
    /** Число с разделителями разрядов или прочерк. */
    function formatUnits(value, locale = "ru-RU") {
    	if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    	try {
    		return new Intl.NumberFormat(locale).format(value);
    	} catch {
    		return String(value);
    	}
    }
    /** ISO-время в местные часы, пустая строка при неверном значении. */
    function formatTime(iso, locale = "ru-RU") {
    	if (typeof iso !== "string" || iso.length === 0) return "";
    	const date = new Date(iso);
    	if (Number.isNaN(date.getTime())) return "";
    	try {
    		return date.toLocaleTimeString(locale, {
    			hour: "2-digit",
    			minute: "2-digit",
    			second: "2-digit"
    		});
    	} catch {
    		return "";
    	}
    }
    // src/client/balance.js
    /**
    * Баланс: кнопка в сайдбаре и перетаскиваемая панель с остатком.
    *
    * Кнопка регистрируется в слоте `sidebar.footer.action` (`id: 'cvc-balance'`,
    * `order: 5`) и живёт только пока `features.balance` включён — регистрацию
    * держит `index.js`. Данные приходят с `GET /cvc/balance`; маршрут отвечает
    * 404, когда функция выключена.
    *
    * Панель рисуется внутри того же слота: в DSH нет публичного слота оверлея,
    * а `position: fixed` с `shell.leading` превратил бы панель в кнопку ящика.
    * Поэтому панель позиционируется от слота, но тянется как оверлей.
    *
    * Чистая часть — позиция, прижатие к окну, состояние точки — живёт в
    * `panel-pos.js`, чтобы проверяться без React.
    *
    * @module cvc-catalog-sync-plugin/client/balance
    */
    const h$1 = react.default.createElement;
    /**
    * Панель баланса вместе с кнопкой.
    *
    * Кнопка и панель в одном компоненте: точка состояния отражает последнее
    * чтение без второй регистрации. Кнопка и панель — обычный React внутри
    * слота, поэтому перетаскивание принадлежит плагину, а не харнессу.
    *
    * @param {object} props
    * @param {object} props.store - стор клиентской половины.
    * @param {(key: string) => string} props.t - перевод по ключу.
    */
    function BalanceWidget({ store, t }) {
    	const [open, setOpen] = react.default.useState(false);
    	const [data, setData] = react.default.useState(null);
    	const [busy, setBusy] = react.default.useState(false);
    	const [error, setError] = react.default.useState("");
    	const [pos, setPos] = react.default.useState(() => loadPos(globalThis.localStorage));
    	const [dragging, setDragging] = react.default.useState(false);
    	const nodeRef = react.default.useRef(null);
    	const dragRef = react.default.useRef(null);
    	const load = react.default.useCallback(async () => {
    		setBusy(true);
    		setError("");
    		const result = await store.balance();
    		setBusy(false);
    		if (result.ok) setData(result.body);
    		else setError(result.error);
    	}, [store]);
    	react.default.useEffect(() => {
    		if (open && data === null) load();
    	}, [
    		open,
    		data,
    		load
    	]);
    	react.default.useEffect(() => {
    		if (!open) return void 0;
    		const seconds = Number(store.getState()?.config?.balance?.refreshSeconds);
    		if (!Number.isFinite(seconds) || seconds < 15) return void 0;
    		if (typeof globalThis.setInterval !== "function") return void 0;
    		const timer = globalThis.setInterval(() => {
    			load();
    		}, seconds * 1e3);
    		return () => globalThis.clearInterval(timer);
    	}, [
    		open,
    		store,
    		load
    	]);
    	/** Прижать текущую позицию к окну. Возвращает тот же объект, если не двигали. */
    	const reclamp = react.default.useCallback((current) => {
    		if (current === null) return null;
    		const node = nodeRef.current;
    		if (node === null || typeof node.getBoundingClientRect !== "function") return current;
    		const rect = node.getBoundingClientRect();
    		const viewport = {
    			width: globalThis.innerWidth ?? 0,
    			height: globalThis.innerHeight ?? 0
    		};
    		if (viewport.width === 0 || viewport.height === 0) return current;
    		const clamped = clampPos(current, rect, viewport);
    		return clamped.left === current.left && clamped.top === current.top ? current : clamped;
    	}, []);
    	react.default.useEffect(() => {
    		if (!open) return void 0;
    		setPos(reclamp);
    		const view = globalThis;
    		if (typeof view.addEventListener !== "function") return void 0;
    		const reflow = () => setPos(reclamp);
    		view.addEventListener("resize", reflow);
    		return () => view.removeEventListener("resize", reflow);
    	}, [open, reclamp]);
    	const endDrag = () => {
    		if (dragRef.current === null) return;
    		dragRef.current = null;
    		setDragging(false);
    	};
    	const onPointerDown = (event) => {
    		if (event.button !== 0) return;
    		if (typeof event.target?.closest === "function" && event.target.closest("button") !== null) return;
    		const node = nodeRef.current;
    		if (node === null) return;
    		const rect = node.getBoundingClientRect();
    		dragRef.current = {
    			startLeft: rect.left,
    			startTop: rect.top,
    			startX: event.clientX,
    			startY: event.clientY,
    			moved: false
    		};
    		try {
    			event.currentTarget.setPointerCapture(event.pointerId);
    		} catch {}
    	};
    	const onPointerMove = (event) => {
    		const drag = dragRef.current;
    		if (drag === null) return;
    		if (!drag.moved && Math.abs(event.clientX - drag.startX) < 4 && Math.abs(event.clientY - drag.startY) < 4) return;
    		const node = nodeRef.current;
    		if (node === null) return;
    		dragRef.current = {
    			...drag,
    			moved: true
    		};
    		setDragging(true);
    		const next = clampPos({
    			left: drag.startLeft + (event.clientX - drag.startX),
    			top: drag.startTop + (event.clientY - drag.startY)
    		}, node.getBoundingClientRect(), {
    			width: globalThis.innerWidth ?? 0,
    			height: globalThis.innerHeight ?? 0
    		});
    		dragRef.current = {
    			...dragRef.current,
    			startLeft: next.left,
    			startTop: next.top,
    			startX: event.clientX,
    			startY: event.clientY
    		};
    		setPos(next);
    	};
    	const onPointerUp = (event) => {
    		const drag = dragRef.current;
    		if (drag === null) return;
    		try {
    			event.currentTarget.releasePointerCapture(event.pointerId);
    		} catch {}
    		endDrag();
    		if (!drag.moved) return;
    		const node = nodeRef.current;
    		if (node === null) return;
    		const rect = node.getBoundingClientRect();
    		const next = clampPos({
    			left: rect.left,
    			top: rect.top
    		}, rect, {
    			width: globalThis.innerWidth ?? 0,
    			height: globalThis.innerHeight ?? 0
    		});
    		setPos(next);
    		savePos(globalThis.localStorage, next);
    	};
    	const resetPos = () => {
    		dragRef.current = null;
    		setDragging(false);
    		setPos(null);
    		clearPos(globalThis.localStorage);
    	};
    	const providers = Array.isArray(data?.providers) ? data.providers : [];
    	const state = dotState({
    		busy,
    		providers,
    		error
    	});
    	const button = h$1("button", {
    		type: "button",
    		className: "cvc2-bal-btn",
    		"data-cvc": "balance-toggle",
    		title: t("balanceButton"),
    		"aria-expanded": open === true,
    		onClick: () => {
    			endDrag();
    			setOpen((value) => !value);
    		}
    	}, h$1("span", {
    		className: "cvc2-bal-dot",
    		"data-state": state,
    		"data-cvc": "balance-dot"
    	}), h$1("span", null, t("balanceButton")));
    	if (!open) return h$1("div", { className: "cvc2-bal-root" }, button);
    	const style = pos === null ? void 0 : {
    		left: `${pos.left}px`,
    		top: `${pos.top}px`,
    		right: "auto",
    		bottom: "auto"
    	};
    	const rows = [];
    	rows.push(h$1("div", {
    		className: "cvc2-bal-head",
    		key: "head"
    	}, h$1("span", { className: "cvc2-bal-title" }, t("balanceTitle")), h$1("span", { className: "cvc2-bal-muted" }, busy ? t("balanceLoading") : formatTime(data?.fetchedAt)), h$1("button", {
    		type: "button",
    		className: "cvc2-bal-close",
    		title: t("balanceClose"),
    		"aria-label": t("balanceClose"),
    		onClick: () => {
    			endDrag();
    			setOpen(false);
    		}
    	}, "×")));
    	rows.push(h$1("div", {
    		className: "cvc2-bal-actions",
    		key: "actions"
    	}, h$1("button", {
    		type: "button",
    		className: "cvc2-bal-refresh",
    		disabled: busy,
    		onClick: () => {
    			load();
    		}
    	}, t("balanceRefresh")), h$1("button", {
    		type: "button",
    		className: "cvc2-bal-reset",
    		disabled: pos === null,
    		title: t("balanceResetPos"),
    		onClick: resetPos
    	}, t("balanceResetPos"))));
    	if (error.length > 0) rows.push(h$1("div", {
    		className: "cvc2-bal-msg cvc2-bal-bad",
    		key: "err"
    	}, error));
    	if (data?.stale === true) rows.push(h$1("div", {
    		className: "cvc2-bal-msg",
    		key: "stale"
    	}, t("balanceStale")));
    	if (providers.length === 0 && !busy && error.length === 0) rows.push(h$1("div", {
    		className: "cvc2-bal-muted",
    		key: "none"
    	}, t("balanceNone")));
    	providers.forEach((provider, index) => {
    		const card = [];
    		card.push(h$1("div", {
    			className: "cvc2-bal-row",
    			key: "name"
    		}, h$1("span", { className: "cvc2-bal-title" }, provider?.displayName ?? provider?.provider ?? "—"), h$1("span", { className: "cvc2-bal-muted" }, provider?.provider ?? "")));
    		if (provider?.baseURL) card.push(h$1("div", {
    			className: "cvc2-bal-row cvc2-bal-muted",
    			key: "url"
    		}, h$1("span", null, provider.baseURL), h$1("span", null, provider?.keySet === true ? `${provider?.apiKeyEnv ?? ""} ✓` : t("balanceKeyMissing"))));
    		if (provider?.balanceUnits !== null && provider?.balanceUnits !== void 0) card.push(h$1("div", {
    			className: "cvc2-bal-row",
    			key: "bal"
    		}, h$1("span", null, t("balanceUnits")), h$1("span", { className: "cvc2-bal-big" }, formatUnits(provider.balanceUnits))));
    		if (typeof provider?.spentSinceLast === "number" && provider.spentSinceLast > 0) card.push(h$1("div", {
    			className: "cvc2-bal-row cvc2-bal-muted",
    			key: "spent"
    		}, h$1("span", null, t("balanceSpent")), h$1("span", null, formatUnits(provider.spentSinceLast))));
    		if (provider?.balanceError) card.push(h$1("div", {
    			className: "cvc2-bal-msg cvc2-bal-bad",
    			key: "be"
    		}, String(provider.balanceError)));
    		rows.push(h$1("div", {
    			className: "cvc2-bal-card",
    			key: `card-${index}`,
    			"data-cvc": "balance-card"
    		}, card));
    	});
    	return h$1("div", { className: "cvc2-bal-root" }, button, h$1("div", {
    		className: "cvc2-bal-panel",
    		"data-cvc": "balance-panel",
    		"data-dragging": dragging === true,
    		style,
    		ref: nodeRef,
    		onPointerDown,
    		onPointerMove,
    		onPointerUp,
    		onPointerCancel: endDrag,
    		onLostPointerCapture: endDrag,
    		title: dragging ? t("balanceRelease") : t("balanceDragHint")
    	}, rows));
    }
    // src/client/index.js
    /**
    * Клиентская половина cvc-catalog-sync-plugin 2.0.0: три поверхности и
    * переключатель между ними.
    *
    * Что регистрируется:
    *
    * - `settings.section` (id `cvc`, order 25) и `settings.section.icon` — страница
    *   настроек; она существует всегда, это и есть переключатель;
    * - `plugins.bundle.config` (`key: 'cvc-catalog-sync-plugin'`) — тот же блок на
    *   странице плагина, `view: 'summary'` даёт короткую строку;
    * - `sidebar.footer.action` (id `cvc-balance`, order 5) — кнопка и панель
    *   баланса, только при `features.balance`;
    * - наблюдатель `[data-model-id]` и бейджи коэффициентов, только при
    *   `features.coefficients`.
    *
    * Слот `conversation.input.model.label` не занимается: он `single` и уже занят
    * штатным бейджем.
    *
    * Выключение функции снимает её регистрацию сразу, включение возвращает — без
    * перезагрузки страницы. Смена набора функций приходит из стора после
    * `GET /cvc/state` и `PUT /cvc/config`.
    *
    * @module cvc-catalog-sync-plugin/client
    */
    const h = react.default.createElement;
    /** Слот кнопки баланса. */
    const BALANCE_SLOT = "sidebar.footer.action";
    /** Позиция страницы в навигации настроек. */
    const SECTION_ORDER = 25;
    /** Позиция кнопки баланса среди кнопок подвала сайдбара. */
    const BALANCE_ORDER = 5;
    /** Ключ блока на странице плагина: имя пакета. */
    const BUNDLE_KEY = "cvc-catalog-sync-plugin";
    /**
    * Сервисы, без которых половина не может зарегистрировать ничего.
    *
    * Это Cordis-inject: он и делает `ctx.slots` подключённым свойством. Половина
    * с одним только `apply` получает пустой `ctx.get('slots')`, и регистрация
    * молча исчезает.
    */
    const inject = ["slots", "locale"];
    /**
    * Поставить целевое состояние эффекта: функция «включить/выключить».
    *
    * Эффект в Cordis исполняется один раз (`ctx.effect`), поэтому поверхность,
    * которая должна появляться и исчезать по переключателю, держит собственный
    * `enabled` и умеет применять его повторно. Возвращённое — отписка и `stop`.
    *
    * @template {(...args: any[]) => (() => void)} T
    * @param {T} mount - поставить поверхность, вернуть её остановку.
    * @returns {{ set: (enabled: boolean) => void, stop: () => void }} переключатель.
    */
    function createToggle(mount) {
    	let dispose = null;
    	let stopped = false;
    	return {
    		set(enabled) {
    			if (stopped) return;
    			if (enabled === true && dispose === null) dispose = mount() ?? null;
    			else if (enabled !== true && dispose !== null) {
    				const current = dispose;
    				dispose = null;
    				current();
    			}
    		},
    		stop() {
    			if (stopped) return;
    			stopped = true;
    			if (dispose !== null) {
    				const current = dispose;
    				dispose = null;
    				current();
    			}
    		}
    	};
    }
    /**
    * Точка входа клиентской половины.
    *
    * @param {object} ctx - клиентский контекст Cordis.
    * @param {object} [env] - подмена окружения для тестов.
    * @param {Document} [env.document] - документ.
    * @param {typeof fetch} [env.fetch] - `fetch`.
    * @param {object} [env.store] - готовый стор вместо созданного по умолчанию.
    */
    function apply(ctx, env = {}) {
    	const documentRef = env.document ?? globalThis.document;
    	const fetchImpl = env.fetch ?? globalThis.fetch;
    	const mounted = [];
    	const balance = createToggle(() => ctx.slots.inject(BALANCE_SLOT, () => ctx.slots.register({
    		name: BALANCE_SLOT,
    		id: "cvc-balance",
    		order: 5,
    		label: () => t("balanceButton")
    	}, () => h(BalanceWidget, {
    		store,
    		t
    	}))));
    	const coefficients = createToggle(() => startCoefficients({
    		store,
    		document: documentRef,
    		getRefreshMs: () => {
    			const minutes = Number(store.getState().config?.coefficients?.refreshMinutes);
    			return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1e3 : 6e5;
    		}
    	}));
    	mounted.push(balance, coefficients);
    	let applied = null;
    	/** Поставить или снять поверхности по набору функций. */
    	const applyFeatures = (features) => {
    		const key = `${features?.balance === true ? 1 : 0}${features?.coefficients === true ? 1 : 0}`;
    		if (key === applied) return;
    		applied = key;
    		balance.set(features?.balance === true);
    		coefficients.set(features?.coefficients === true);
    	};
    	const store = env.store ?? createStore({
    		fetch: fetchImpl,
    		onFeatures: (features) => applyFeatures(features)
    	});
    	ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), "cvc: dictionaries");
    	const t = ctx.locale.bind(NS);
    	ctx.effect(() => {
    		const style = documentRef.createElement("style");
    		style.dataset.plugin = BUNDLE_KEY;
    		style.textContent = CSS;
    		documentRef.head.appendChild(style);
    		return () => style.remove();
    	}, "cvc: styles");
    	ctx.effect(() => ctx.slots.inject("settings.section.icon", () => ctx.slots.register({
    		name: "settings.section.icon",
    		id: NS
    	}, (owner = {}) => h(NavIcon, { size: owner.size ?? 16 }))), "cvc: settings icon");
    	ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
    		name: "settings.section",
    		id: NS,
    		order: 25,
    		label: () => t("nav"),
    		locale: NS,
    		inject: () => ({
    			t,
    			store
    		})
    	}, (owner = {}) => h(SettingsPage, {
    		...owner,
    		t,
    		store
    	}))), "cvc: settings section");
    	ctx.effect(() => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    		name: "plugins.bundle.config",
    		key: BUNDLE_KEY,
    		locale: NS,
    		inject: () => ({
    			t,
    			store
    		})
    	}, (owner = {}) => owner.view === "summary" ? h(BundleSummary, { t }) : h(SettingsPage, {
    		...owner,
    		t,
    		store,
    		embedded: true
    	}))), "cvc: bundle block");
    	ctx.effect(() => {
    		applyFeatures(store.getState().features);
    		const off = store.subscribe((next) => applyFeatures(next.features));
    		const pending = store.refresh();
    		if (pending !== null && typeof pending.catch === "function") pending.catch(() => {});
    		return () => {
    			off();
    			for (const toggle of mounted) toggle.stop();
    		};
    	}, "cvc: feature surfaces");
    	return { store };
    }
    exports.BALANCE_ORDER = BALANCE_ORDER;
    exports.BALANCE_SLOT = BALANCE_SLOT;
    exports.BUNDLE_KEY = BUNDLE_KEY;
    exports.CSS = CSS;
    exports.DICTIONARIES = DICTIONARIES;
    exports.NS = NS;
    exports.SECTION_ORDER = SECTION_ORDER;
    exports.apply = apply;
    exports.createStore = createStore;
    exports.createToggle = createToggle;
    exports.inject = inject;

    return module.exports
  },
})
