/**
 * Контракт каркаса 2.0.0 для портов трёх функций.
 *
 * Читают: catalog-porter (lib/catalog-sync.js), ports-porter
 * (lib/coefficients.js, lib/balance.js), client-builder (src/client/**).
 * Держит его architect; менять сигнатуры — только через lead.
 *
 * @module cvc-catalog-sync-plugin/lib/CONTRACT
 */

/**
 * `deps` каждой функции — замороженный объект:
 *
 * - `ctx` — контекст плагина;
 * - `config(): NormalizedConfig` — актуальный нормализованный конфиг 2.x
 *   (те же группы, что в схеме: features/providers/catalog/coefficients/balance);
 * - `features(): {catalogSync, coefficients, balance}` — переключатели;
 * - `log(level, message)` — 'info' | 'warn' | 'error', префикс уже внутри;
 * - `route(path, handler): () => void` — подмаршрут `/cvc/<path>` в общей
 *   таблице; handler(req, res) как у Node HTTP, лучше `async`; выключение
 *   функции снимает маршрут само;
 * - `http` — `lib/http.js`: `sendJson`, `readJsonBody`, `methodNotAllowed`,
 *   `isJsonRequest`, `isCrossSite`, `HttpError`, `BODY_LIMIT`, `CVC_PREFIX`;
 * - `api` — `lib/cvc-api.js`: `fetchModels`, `fetchBalance`, `fetchLevels`,
 *   `parseReasoningLevels`, `apiRoot`, `CvcApiError`;
 * - `providers` — `lib/providers.js`: `resolveRoutes`, `resolveKey`,
 *   `apiKeyFor`, `pickRoute`, `hostOf`, `matchesProvider`;
 * - `cache` — общий кэш каталога `lib/cache.js` (`get({force})`, `refresh`,
 *   `peek`, `clear`, `ttl`); данные — результат `loadCatalog()`:
 *   `{ models, providers: [{provider, displayName}], fetchedAt }`;
 * - `store` — реестр состояния `lib/state.js` (`setLastRun`, `setRunning`,
 *   `setError`, `lastRun`, `snapshot`);
 * - `routes()` — маршруты CheapVibeCode по текущему конфигу
 *   (`[{provider, displayName, baseURL, apiKeyEnv, api, models, entryId}]`);
 * - `key(ref)` — ключ по ссылке через credentials (пустая строка, если нет);
 * - `apiKeyFor(route)` — имя записи ключа с учётом запасного имени;
 * - `version`, `rowId` (см. `lib/state.js`, `index.js`).
 *
 * Правила:
 * 1. `register(ctx, deps)` вызывается при включении функции, возвращает
 *    disposer; всё зарегистрированное (маршруты, таймеры, инструменты) снимается им.
 * 2. `tool(deps)` возвращает описание инструмента DSH или `null`; индекс
 *    регистрирует его только при включённой функции.
 * 3. Секреты: ключ не уходит ни в ответ маршрута, ни в текст ошибки — в
 *    браузер только `keySet: true|false`.
 * 4. Конфиг читается только через `deps.config()`, не замыкается: правка
 *    настроек перемонтирует функцию без перезапуска плагина.
 * 5. Время (таймеры) работает; после выключения функции таймеры сняты.
 */
export const CONTRACT = 'lib/CONTRACT.js'

/**
 * Маршруты, которые каркас уже держит, и их владельцы.
 * Заглушки отвечают 501 (run) или пустой заготовкой; порт заменяет тела.
 */
export const ROUTES = Object.freeze({
  state: 'lib/state.js (каркас, установлен index.js)',
  config: 'lib/state.js (каркас, установлен index.js)',
  health: 'index.js (каркас)',
  run: 'lib/catalog-sync.js: POST {action: plan|apply, force?}',
  coefficients: 'lib/coefficients.js: GET',
  balance: 'lib/balance.js: GET',
})