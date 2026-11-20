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

import { readFeatures } from './config-form.js'

/** Префикс маршрутов хост-половины (§4 спеки). */
export const API_PREFIX = '/cvc'

/** Начальное состояние до первого ответа `GET /cvc/state`. */
export function initialState() {
  return {
    loaded: false,
    loading: false,
    error: '',
    version: '',
    // До первого ответа действуют умолчания схемы: все три функции включены.
    features: readFeatures(null, null),
    config: null,
    configShape: 'v2',
    status: null,
    lastRun: null,
    patchPath: '',
    rowId: '',
  }
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
export function applyState(payload, previous) {
  const body = payload !== null && typeof payload === 'object' ? payload : {}
  const config = body.config !== null && typeof body.config === 'object' ? body.config : null
  const status = body.status !== null && typeof body.status === 'object' ? body.status : null
  const lastRun = body.lastRun !== null && typeof body.lastRun === 'object' ? body.lastRun : status
  return {
    loaded: true,
    loading: false,
    error: '',
    version: typeof body.version === 'string' ? body.version : '',
    features: readFeatures(body.features, config),
    config,
    configShape: body.configShape === 'legacy' ? 'legacy' : 'v2',
    status,
    lastRun: lastRun ?? previous?.lastRun ?? null,
    patchPath: typeof body.patchPath === 'string' ? body.patchPath : '',
    rowId: typeof body.rowId === 'string' ? body.rowId : '',
  }
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
export function applySaved(payload, previous) {
  const body = payload !== null && typeof payload === 'object' ? payload : {}
  const config = body.config !== null && typeof body.config === 'object' ? body.config : previous.config
  return {
    ...previous,
    loaded: true,
    error: '',
    config,
    features: readFeatures(body.features, config),
    configShape: 'v2',
  }
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
export function createApi(fetchImpl, prefix = API_PREFIX) {
  return async function call(method, path, body) {
    const init = { method, headers: { accept: 'application/json' } }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const response = await fetchImpl(prefix + path, init)
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    if (!response.ok) {
      const fields = Array.isArray(payload?.fields) ? payload.fields.filter((item) => typeof item === 'string') : []
      const detail = fields.length > 0
        ? `${payload?.error ?? 'invalid'}: ${fields.join('; ')}`
        : typeof payload?.error === 'string' && payload.error.length > 0
          ? payload.error
          : `HTTP ${response.status}`
      const error = new Error(detail)
      error.status = response.status
      error.fields = fields
      error.payload = payload
      throw error
    }
    return payload
  }
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
export async function readRoute(fetchImpl, path, prefix = API_PREFIX) {
  let response
  try {
    response = await fetchImpl(prefix + path, { headers: { accept: 'application/json' } })
  } catch (error) {
    return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : String(error) }
  }
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) return { ok: false, status: response.status, body, error: `HTTP ${response.status}` }
  if (body === null || typeof body !== 'object') return { ok: false, status: response.status, body: null, error: 'invalid JSON' }
  return { ok: true, status: response.status, body, error: '' }
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
export function createStore(options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const call = createApi(fetchImpl, options.prefix ?? API_PREFIX)
  const listeners = new Set()
  let state = initialState()
  let inflight = null

  /** Оповестить подписчиков; ошибка одного не мешает остальным. */
  function emit() {
    for (const listener of [...listeners]) {
      try {
        listener(state)
      } catch {
        // Подписчик — чужой код; его падение не должно останавливать стор.
      }
    }
  }

  /** Короткий отпечаток набора функций для сравнения. */
  function featuresKey(value) {
    return `${value.coefficients ? 1 : 0}${value.balance ? 1 : 0}${value.catalogSync ? 1 : 0}`
  }

  /** Заменить состояние, оповестив подписчиков и наблюдателя функций. */
  function commit(next) {
    const before = featuresKey(state.features)
    state = next
    emit()
    const after = featuresKey(state.features)
    if (after !== before && typeof options.onFeatures === 'function') {
      try {
        options.onFeatures(state.features, state)
      } catch {
        // Наблюдатель поверхностей не должен валить обновление состояния.
      }
    }
  }

  const store = {
    /** Текущее состояние. */
    getState() {
      return state
    },

    /**
     * Подписка на изменение состояния.
     *
     * @param {(state: object) => void} listener - получатель.
     * @returns {() => void} отписка.
     */
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
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
      if (inflight !== null) return inflight
      state = { ...state, loading: true }
      emit()
      inflight = (async () => {
        try {
          const payload = await call('GET', '/state')
          commit(applyState(payload, state))
          return state
        } catch (error) {
          state = { ...state, loading: false, error: error instanceof Error ? error.message : String(error) }
          emit()
          throw error
        } finally {
          inflight = null
        }
      })()
      return inflight
    },

    /**
     * Сохранить конфиг и обновить состояние из ответа.
     *
     * @param {Record<string, unknown>} config - полный конфиг.
     * @returns {Promise<object>} новое состояние.
     */
    async save(config) {
      const payload = await call('PUT', '/config', { config })
      commit(applySaved(payload, state))
      return state
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
      const body = { action }
      if (force === true) body.force = true
      const value = await call('POST', '/run', body)
      const result = value !== null && typeof value === 'object' ? value : { ok: false, error: 'empty result' }
      commit({ ...state, lastRun: result, status: result })
      return result
    },

    /**
     * Прочитать коэффициенты.
     *
     * @returns {Promise<{ok: boolean, status: number, body: any, error: string}>} результат.
     */
    async coefficients() {
      return readRoute(fetchImpl, '/coefficients', options.prefix ?? API_PREFIX)
    },

    /**
     * Прочитать баланс.
     *
     * @returns {Promise<{ok: boolean, status: number, body: any, error: string}>} результат.
     */
    async balance() {
      return readRoute(fetchImpl, '/balance', options.prefix ?? API_PREFIX)
    },
  }
  return store
}