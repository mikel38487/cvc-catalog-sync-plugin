/**
 * Баланс ключа CheapVibeCode: снимок по всем маршрутам, дельта «с прошлого
 * замера» и инструмент `cvc_balance`.
 *
 * Запрос идёт через `deps.api.fetchBalance({ baseURL, key, timeoutMs,
 * fetchImpl })` — тот единственный модуль, который говорит с провайдером:
 * таймаут, разбор `token_balance`, ошибка с кодом и вырезание ключа из текста.
 * `fetchImpl` инъектируется (каркас передаёт его в `deps`, в тестах — подделка),
 * поэтому в самом модуле сети нет по построению.
 *
 * Обнаружение провайдеров перенесено в `lib/providers.js` каркаса, и это
 * осознанное изменение против 1.1.0: там поиск шёл через
 * `llm.listConfigurableProviders()` и `settings.describe()`, потому что иначе
 * до строки композиции было не добраться. В 2.0.0 маршруты провайдера — это
 * запись профильного патча, и каркас читает её напрямую
 * (`configEditor.entries()`), поэтому здесь достаточно `deps.routes()`.
 *
 * Ключ остаётся на хосте: в ответе только `keySet: true|false`. Текст ошибки
 * составляется из кода и статуса, без тела апстрима, — тело может содержать
 * что угодно, включая ключ.
 *
 * @module cvc-catalog-sync-plugin/lib/balance
 */

/** Путь маршрута в общей таблице каркаса. */
export const ROUTE_PATH = 'balance'

/** Имя инструмента, который каркас регистрирует вместе с функцией. */
export const TOOL_NAME = 'cvc_balance'

/**
 * Нормализовать baseURL маршрута до `apiRoot`.
 *
 * Маршрут задаётся OpenAI-совместимой базой (`…/v1`), а `/v1/balance` живёт
 * уровнем выше, поэтому хвостовой `/v1` отбрасывается. В ответе показывается
 * именно этот адрес: он без секрета и совпадает с тем, куда ушёл запрос.
 *
 * @param {unknown} baseURL — настроенный `baseURL` маршрута.
 * @returns {string}
 */
export function apiRootOf(baseURL) {
  return String(baseURL ?? '').trim().replace(/\/+$/, '').replace(/\/v1$/, '')
}

/**
 * Текст ошибки одного провайдера: только код и, если он пришёл, статус HTTP.
 *
 * Тело ответа апстрима сюда намеренно не попадает: оно может содержать ключ
 * или эхо заголовка `Authorization`, а это панель показывает пользователю.
 *
 * @param {unknown} error — ошибка `CvcApiError` или любая другая.
 * @returns {string}
 */
export function balanceErrorText(error) {
  const source = /** @type {any} */ (error)
  const code = typeof source?.code === 'string' && source.code.length > 0 ? source.code : 'unavailable'
  const status = source?.status
  return typeof status === 'number' && Number.isFinite(status) ? `${code} (HTTP ${status})` : code
}

/**
 * Учёт прошлого замера: «сколько юнитов ушло с прошлого раза».
 *
 * Живёт в памяти процесса и теряется при перезапуске — после перезапуска
 * прошлого замера нет, и вычитать не из чего. Рост баланса (пополнение) не
 * считается расходом и даёт `null`, а не отрицательное число. Прошлый замер
 * обновляется только успешным чтением: ошибка апстрима не должна стирать базу
 * для следующей дельты. Ключ учёта — `provider`, поэтому два маршрута с одним
 * id получают общую строку истории (как и в 1.1.0).
 *
 * @returns {{ observe: (provider: string, units: number) => number | null, reset: () => void, peek: () => Map<string, number> }}
 */
export function createBalanceTracker() {
  /** @type {Map<string, number>} */
  const lastBalanceByProvider = new Map()
  return {
    /**
     * Отметить замер и посчитать расход с прошлого.
     * @param {string} provider
     * @param {number} units
     * @returns {number | null} расход или `null`, если сравнить не с чем.
     */
    observe(provider, units) {
      const previous = lastBalanceByProvider.get(provider)
      lastBalanceByProvider.set(provider, units)
      if (typeof previous !== 'number' || !Number.isFinite(previous)) return null
      return units < previous ? previous - units : null
    },
    reset() {
      lastBalanceByProvider.clear()
    },
    peek() {
      return lastBalanceByProvider
    },
  }
}

/**
 * Строка ответа по одному маршруту.
 *
 * Ошибка маршрута (нет ключа, отказ апстрима, нечитаемый ответ) остаётся его
 * собственной строкой: остальные маршруты отвечают, а прошлый замер не
 * перезаписывается.
 *
 * @param {ReturnType<typeof createBalanceTracker>} tracker — учёт прошлых замеров.
 * @param {object} deps — зависимости каркаса.
 * @param {{ provider?: unknown, displayName?: unknown, baseURL?: unknown, apiKeyEnv?: unknown }} route — маршрут CVC.
 * @returns {Promise<{provider: string, displayName: string, baseURL: string, apiKeyEnv: string, keySet: boolean, balanceUnits: number | null, spentSinceLast: number | null, balanceError: string}>}
 */
export async function readRoute(tracker, deps, route) {
  const profile = route !== null && typeof route === 'object' ? route : {}
  const provider = typeof profile.provider === 'string' ? profile.provider : ''
  const apiKeyEnv = deps.apiKeyFor(profile)
  const row = {
    provider,
    displayName: typeof profile.displayName === 'string' && profile.displayName.trim().length > 0
      ? profile.displayName.trim()
      : provider,
    baseURL: apiRootOf(profile.baseURL),
    apiKeyEnv,
    keySet: false,
    balanceUnits: null,
    spentSinceLast: null,
    balanceError: '',
  }

  let key = ''
  try {
    key = await deps.key(apiKeyEnv)
  } catch {
    // Сервис credentials недоступен — это «ключа нет», а не падение панели.
    key = ''
  }
  if (typeof key !== 'string' || key.trim().length === 0) {
    row.balanceError = `Ключ не найден: ${apiKeyEnv || '(apiKeyEnv не задан)'}`
    return row
  }
  row.keySet = true

  let units
  try {
    const result = await deps.api.fetchBalance({
      baseURL: profile.baseURL,
      key,
      timeoutMs: deps.config().providers.timeoutMs,
      fetchImpl: typeof deps.fetchImpl === 'function' ? deps.fetchImpl : undefined,
    })
    units = result?.units
  } catch (error) {
    row.balanceError = balanceErrorText(error)
    return row
  }

  if (typeof units !== 'number' || !Number.isFinite(units)) {
    row.balanceError = 'invalid-payload'
    return row
  }

  row.balanceUnits = units
  row.spentSinceLast = tracker.observe(provider, units)
  return row
}

/**
 * Собрать снимок баланса по всем маршрутам CheapVibeCode текущего конфига.
 *
 * Маршруты читаются последовательно: ключей обычно один-два, а параллельные
 * запросы к одному хосту с разными ключами ничего не ускоряют. Ошибка чтения
 * маршрутов не бросает — снимок остаётся пустым, а причина едет в поле `note`,
 * чтобы панель деградировала, а не падала с 500.
 *
 * @param {object} deps — зависимости каркаса.
 * @param {ReturnType<typeof createBalanceTracker>} tracker — учёт прошлых замеров.
 * @returns {Promise<{providers: Array<object>, fetchedAt: string, note?: string}>}
 */
export async function snapshot(deps, tracker) {
  let routes = []
  let note = ''
  try {
    const found = deps.routes()
    if (Array.isArray(found)) routes = found
  } catch (error) {
    note = 'provider routes are unreadable'
    deps.log('warn', `balance: provider routes are unreadable (${typeof /** @type {any} */ (error)?.code === 'string' ? /** @type {any} */ (error).code : 'unavailable'})`)
  }
  const providers = []
  for (const route of routes) {
    providers.push(await readRoute(tracker, deps, route))
  }
  const payload = { providers, fetchedAt: new Date().toISOString() }
  if (note.length > 0) payload.note = note
  return payload
}

/**
 * Состояние функции на набор `deps`: учёт замеров и последний снимок.
 *
 * `deps` — замороженный объект, созданный один раз на процесс плагина
 * (`index.js`, `createFeatureDeps`), поэтому `WeakMap` по нему даёт ровно
 * «память процесса»: функция может быть выключена и включена заново, но
 * прошлый замер и последнее чтение остаются. В тестах каждый набор `deps`
 * получает своё состояние, поэтому кейсы не протекают друг в друга.
 *
 * @type {WeakMap<object, { tracker: ReturnType<typeof createBalanceTracker>, last: { providers: Array<object>, fetchedAt: string } | null, inflight: Promise<any> | null }>}
 */
const FEATURE_STATE = new WeakMap()

/**
 * Состояние функции для набора `deps`; создаётся при первом обращении.
 * @param {object} deps
 */
export function stateFor(deps) {
  let state = FEATURE_STATE.get(deps)
  if (state === undefined) {
    state = { tracker: createBalanceTracker(), last: null, inflight: null }
    FEATURE_STATE.set(deps, state)
  }
  return state
}

/**
 * Прочитать снимок, не открывая второе чтение поверх идущего.
 *
 * Два «Обновить» подряд (две вкладки, кнопка и панель) получают один и тот же
 * ответ: лишний запрос к апстриму — лишняя квота, а два параллельных замера
 * посчитали бы дельту от одной и той же базы дважды.
 *
 * @param {object} deps
 * @param {ReturnType<typeof stateFor>} state
 * @returns {Promise<{providers: Array<object>, fetchedAt: string}>}
 */
export function readSnapshot(deps, state) {
  if (state.inflight !== null) return state.inflight
  const run = (async () => {
    try {
      const payload = await snapshot(deps, state.tracker)
      state.last = payload
      return payload
    } finally {
      if (state.inflight === run) state.inflight = null
    }
  })()
  state.inflight = run
  return run
}

/**
 * Подключить функцию баланса: маршрут `GET /cvc/balance`.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx — контекст плагина.
 * @param {object} deps — общие зависимости каркаса (см. `lib/CONTRACT.js`).
 * @returns {() => void} disposer, снимающий маршрут.
 */
export function register(ctx, deps) {
  const state = stateFor(deps)
  const disposeRoute = deps.route(ROUTE_PATH, async (req, res) => {
    if (String(req.method ?? 'GET').toUpperCase() !== 'GET') {
      deps.http.methodNotAllowed(res, ['GET'])
      return
    }
    const payload = await readSnapshot(deps, state)
    const failed = payload.providers.filter((row) => row.balanceError.length > 0)
    if (failed.length > 0) {
      // В лог уходят только id маршрутов: тел ответа апстрима в логе быть не должно.
      deps.log('warn', `balance: ${failed.length} of ${payload.providers.length} route(s) failed (${failed.map((row) => row.provider || '?').join(', ')})`)
    }
    deps.http.sendJson(res, 200, payload)
  })

  return () => {
    disposeRoute()
  }
}

/**
 * Значение инструмента `cvc_balance` (`action: 'status'`).
 *
 * Сети не касается: отдаёт последний снимок, который снял маршрут. Маршруты,
 * которых в текущем конфиге больше нет, из ответа убираются — панель не должна
 * показывать баланс удалённого провайдера.
 *
 * В строках оставлено только то, что нужно агенту для ответа на вопрос «сколько
 * осталось»: `provider`, `displayName`, `keySet`, `balanceUnits`,
 * `spentSinceLast`, `balanceError`. `baseURL` и `apiKeyEnv` сюда не попадают:
 * это подробности конфигурации, а не состояние ключа.
 *
 * @param {object} deps
 * @param {ReturnType<typeof stateFor>} state
 * @param {unknown} args — аргументы инструмента (`{action?: 'status'}`).
 * @returns {object} значение инструмента.
 */
export function toolStatus(deps, state, args) {
  const action = args !== null && typeof args === 'object' ? /** @type {any} */ (args).action : undefined
  if (action !== undefined && action !== 'status') {
    return {
      ok: false,
      action: typeof action === 'string' ? action : 'unknown',
      error: 'cvc_balance supports only action "status": it returns the last readings and does not spend an API request',
    }
  }
  if (state.last === null) {
    return {
      ok: true,
      action: 'status',
      providers: [],
      fetchedAt: null,
      note: 'No balance reading yet. Open the CVC balance panel, or read GET /cvc/balance, then call this tool again.',
    }
  }
  const current = new Set()
  try {
    for (const route of deps.routes()) {
      if (typeof route?.provider === 'string') current.add(route.provider)
    }
  } catch {
    // Нечитаемые маршруты: показываем последний снимок как есть.
  }
  const rows = current.size === 0
    ? state.last.providers
    : state.last.providers.filter((row) => current.has(row.provider))
  const providers = rows.map((row) => ({
    provider: row.provider,
    displayName: row.displayName,
    keySet: row.keySet,
    balanceUnits: row.balanceUnits,
    spentSinceLast: row.spentSinceLast,
    balanceError: row.balanceError,
  }))
  return { ok: true, action: 'status', providers, fetchedAt: state.last.fetchedAt }
}

/**
 * Текст инструмента для модели: «провайдер — остаток».
 *
 * @param {any} value — результат `execute`.
 * @returns {string}
 */
export function renderToolText(value) {
  if (value?.ok !== true) return String(value?.error ?? 'balance is unavailable')
  const rows = Array.isArray(value.providers) ? value.providers : []
  if (rows.length === 0) {
    return typeof value.note === 'string' && value.note.length > 0
      ? value.note
      : 'No CheapVibeCode balance reading yet.'
  }
  const lines = rows.map((row) => {
    const units = typeof row.balanceUnits === 'number' ? row.balanceUnits : 'no reading'
    const spent = typeof row.spentSinceLast === 'number' && row.spentSinceLast > 0 ? `, spent ${row.spentSinceLast}` : ''
    return `${row.displayName ?? row.provider}: ${units}${spent}`
  })
  const at = typeof value.fetchedAt === 'string' ? ` (last readings at ${value.fetchedAt})` : ''
  return `${lines.join('\n')}${at}`
}

/**
 * Описание инструмента `cvc_balance` (только чтение).
 *
 * Форма — `ToolDefinition` DSH: `name`, `description`, JSON Schema `parameters`,
 * `output.schema` + `output.render`, `execute(args, exec)`. Действий записи у
 * инструмента нет: маршрут баланса тоже только читает.
 *
 * @param {object} deps
 * @returns {object}
 */
export function tool(deps) {
  const state = stateFor(deps)
  return {
    name: TOOL_NAME,
    description: 'Return the last CheapVibeCode balance readings per provider without spending a request: remaining units and the spend since the previous reading. Read-only.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['status'],
          description: 'Only "status": the cached readings from the last panel refresh.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          fetchedAt: { type: 'string' },
          providers: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                provider: { type: 'string' },
                displayName: { type: 'string' },
                keySet: { type: 'boolean' },
                balanceUnits: { type: 'number' },
                spentSinceLast: { type: 'number' },
                balanceError: { type: 'string' },
              },
            },
          },
          note: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderToolText(value) }],
    },
    execute: (args) => Promise.resolve(toolStatus(deps, state, args)),
  }
}
