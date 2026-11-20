/**
 * HTTP-клиент CheapVibeCode: каталог моделей, баланс ключа, карта уровней.
 *
 * Только глобальный `fetch` — никакого `ctx.shell`: сеть разрешена хосту, а
 * таймаут и отмена ограничивают один запрос. Ключ никогда не попадает в текст
 * ошибки, лог или ответ маршрута.
 *
 * @module cvc-catalog-sync-plugin/lib/cvc-api
 */

/** Таймаут одного запроса по умолчанию. */
export const DEFAULT_TIMEOUT_MS = 20000

/** Верхняя граница того, что читается из тела ошибки апстрима. */
const ERROR_BODY_LIMIT = 300

/**
 * Ошибка обращения к CheapVibeCode с машинным кодом.
 *
 * Коды: `no-key`, `invalid-base-url`, `timeout`, `aborted`, `network`,
 * `unauthorized`, `http`, `invalid-json`, `invalid-payload`, `levels-unavailable`.
 */
export class CvcApiError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ status?: number, cause?: unknown }} [details]
   */
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'CvcApiError'
    this.code = code
    if (details.status !== undefined) this.status = details.status
    if (details.cause !== undefined) this.cause = details.cause
  }
}

/** Обычный объект, не массив и не null. */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Снять хвостовые слэши без регулярки: значение приходит из конфигурации. */
function stripTrailingSlashes(value) {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

/**
 * Корень API: база провайдера задана как OpenAI-совместимый `.../v1`,
 * а `/v1/balance` живёт уровнем выше.
 * @param {unknown} baseURL
 * @returns {string}
 */
export function apiRoot(baseURL) {
  const trimmed = stripTrailingSlashes(String(baseURL ?? '').trim())
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed
}

/**
 * Адрес каталога моделей.
 * @param {unknown} baseURL
 * @returns {string}
 */
export function modelsUrl(baseURL) {
  return `${stripTrailingSlashes(String(baseURL ?? '').trim())}/models`
}

/**
 * Адрес баланса ключа.
 * @param {unknown} baseURL
 * @returns {string}
 */
export function balanceUrl(baseURL) {
  return `${apiRoot(baseURL)}/v1/balance`
}

/**
 * Убрать секрет из произвольного текста.
 * @param {string} text
 * @param {string} secret
 * @returns {string}
 */
export function redact(text, secret) {
  const line = typeof text === 'string' ? text : String(text ?? '')
  if (typeof secret !== 'string' || secret.length === 0) return line
  return line.split(secret).join('***')
}

/**
 * Проверить `baseURL` перед запросом.
 * @param {unknown} baseURL
 * @returns {string}
 */
function requireBaseURL(baseURL) {
  if (typeof baseURL !== 'string' || baseURL.trim().length === 0) {
    throw new CvcApiError('invalid-base-url', 'baseURL is not configured')
  }
  try {
    const url = new URL(baseURL.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new CvcApiError('invalid-base-url', 'baseURL must be an http(s) URL')
    }
  } catch (error) {
    if (error instanceof CvcApiError) throw error
    throw new CvcApiError('invalid-base-url', 'baseURL must be an http(s) URL')
  }
  return baseURL.trim()
}

/** Проверить ключ: без него запрос не имеет смысла. */
function requireKey(key) {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new CvcApiError('no-key', 'API key is not configured for this provider')
  }
  return key.trim()
}

/**
 * Сигнал запроса: таймаут плюс внешняя отмена, если она есть.
 * @param {AbortSignal | undefined} signal
 * @param {number} timeoutMs
 * @returns {AbortSignal}
 */
function requestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal instanceof AbortSignal ? AbortSignal.any([signal, timeout]) : timeout
}

/** Таймаут из конфига: конечное число не меньше секунды. */
function timeoutOr(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.round(value), 2147483647)
}

/**
 * Тело ошибки апстрима — коротко и без секретов.
 * @param {Response} response
 * @param {string} key
 * @returns {Promise<string>}
 */
async function errorDetail(response, key) {
  try {
    const text = await response.text()
    const trimmed = text.slice(0, ERROR_BODY_LIMIT)
    try {
      const body = JSON.parse(trimmed)
      const message = isPlainObject(body) && isPlainObject(body.error) && typeof body.error.message === 'string'
        ? body.error.message
        : isPlainObject(body) && typeof body.message === 'string'
          ? body.message
          : ''
      if (message.length > 0) return `: ${redact(message, key)}`
    } catch {
      // Не-JSON тело ничего полезного не несёт.
    }
    return ''
  } catch {
    return ''
  }
}

/**
 * Один JSON-запрос с таймаутом.
 * @param {string} url
 * @param {{ key: string, timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal, label: string }} options
 * @returns {Promise<{ status: number, payload: unknown }>}
 */
async function requestJson(url, options) {
  const { key } = options
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  const timeoutMs = timeoutOr(options.timeoutMs)
  let response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: requestSignal(options.signal, timeoutMs),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError') {
      throw new CvcApiError('timeout', `${options.label}: request timed out after ${timeoutMs} ms`, { cause: error })
    }
    if (name === 'AbortError') {
      throw new CvcApiError('aborted', `${options.label}: request was aborted`, { cause: error })
    }
    throw new CvcApiError(
      'network',
      `${options.label}: network error${error instanceof Error && error.message ? `: ${redact(error.message, key)}` : ''}`,
      { cause: error },
    )
  }

  if (response.status === 401 || response.status === 403) {
    const detail = await errorDetail(response, key)
    throw new CvcApiError(
      'unauthorized',
      `${options.label}: HTTP ${response.status}${detail}`,
      { status: response.status },
    )
  }
  if (!response.ok) {
    const detail = await errorDetail(response, key)
    throw new CvcApiError('http', `${options.label}: HTTP ${response.status}${detail}`, { status: response.status })
  }

  try {
    return { status: response.status, payload: await response.json() }
  } catch (error) {
    throw new CvcApiError(
      'invalid-json',
      `${options.label}: response is not valid JSON${error instanceof Error ? `: ${redact(error.message, key)}` : ''}`,
      { cause: error },
    )
  }
}

/**
 * Разобрать ответ `GET /v1/models` или `null`, если форма не та.
 *
 * Принимается OpenAI-форма `{ data: [...] }` и голый массив; записи без
 * строкового `id` отбрасываются — без идентификатора модель в патч не лежит.
 * @param {unknown} payload
 * @returns {Array<Record<string, unknown>> | null}
 */
export function parseCatalogPayload(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : isPlainObject(payload) && Array.isArray(payload.data)
      ? payload.data
      : null
  if (rows === null) return null
  const items = []
  for (const row of rows) {
    if (!isPlainObject(row)) continue
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (id.length === 0) continue
    items.push(row)
  }
  return items
}

/**
 * Забрать каталог моделей провайдера.
 * @param {{ baseURL?: string, key?: string, timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchModels(options = {}) {
  const baseURL = requireBaseURL(options.baseURL)
  const key = requireKey(options.key)
  const { payload } = await requestJson(modelsUrl(baseURL), {
    key,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    label: 'GET /models',
  })
  const models = parseCatalogPayload(payload)
  if (models === null) {
    throw new CvcApiError('invalid-payload', 'GET /models: response has no model list')
  }
  return models
}

/**
 * Забрать баланс ключа.
 * @param {{ baseURL?: string, key?: string, timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<{ units: number }>}
 */
export async function fetchBalance(options = {}) {
  const baseURL = requireBaseURL(options.baseURL)
  const key = requireKey(options.key)
  const { payload } = await requestJson(balanceUrl(baseURL), {
    key,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    label: 'GET /balance',
  })
  const units = isPlainObject(payload) ? payload.token_balance : undefined
  if (typeof units !== 'number' || !Number.isFinite(units)) {
    throw new CvcApiError('invalid-payload', 'GET /balance: response has no token_balance')
  }
  return { units }
}

/**
 * Вытащить карту `reasoningLevels` из текста официального установщика.
 *
 * Литерал `const reasoningLevels = {...};` в обоих установщиках JSON-совместим:
 * вложенных объектов внутри нет, поэтому разбор до первой `};` безопасен.
 * Каждый уровень обязан быть строкой: битая карта не должна молча менять патч.
 * @param {unknown} text
 * @returns {Record<string, string[]> | null}
 */
export function parseReasoningLevels(text) {
  if (typeof text !== 'string' || text.length === 0) return null
  // Линейный разбор без регулярки: текст приходит из сети, а нежадный
  // `[\s\S]*?` на большом файле — кандидат на квадратичный откат.
  const start = text.indexOf('const reasoningLevels')
  if (start < 0) return null
  const open = text.indexOf('{', start)
  if (open < 0) return null
  const close = text.indexOf('};', open)
  if (close < 0) return null
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(text.slice(open, close + 1))
  } catch {
    return null
  }
  if (!isPlainObject(parsed)) return null
  /** @type {Record<string, string[]>} */
  const map = {}
  for (const [id, levels] of Object.entries(parsed)) {
    if (!Array.isArray(levels)) continue
    const clean = levels
      .filter((level) => typeof level === 'string' && level.trim().length > 0)
      .map((level) => level.trim())
    if (clean.length > 0) map[id] = clean
  }
  return Object.keys(map).length > 0 ? map : null
}

/**
 * Забрать карту уровней с первого ответившего установщика.
 * @param {{ urls?: string[], timeoutMs?: number, fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<{ levels: Record<string, string[]>, source: string }>}
 */
export async function fetchLevels(options = {}) {
  const urls = Array.isArray(options.urls) ? options.urls.filter((url) => typeof url === 'string' && url.trim()) : []
  if (urls.length === 0) {
    throw new CvcApiError('levels-unavailable', 'no installer URL is configured')
  }
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  const timeoutMs = timeoutOr(options.timeoutMs)
  const failures = []
  for (const url of urls) {
    let response
    try {
      response = await fetchImpl(url.trim(), {
        method: 'GET',
        signal: requestSignal(options.signal, timeoutMs),
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      failures.push(`${url}: ${name === 'TimeoutError' ? 'timeout' : 'network error'}`)
      continue
    }
    if (!response.ok) {
      failures.push(`${url}: HTTP ${response.status}`)
      continue
    }
    let text
    try {
      text = await response.text()
    } catch {
      failures.push(`${url}: body is unreadable`)
      continue
    }
    const levels = parseReasoningLevels(text)
    if (levels === null) {
      failures.push(`${url}: no reasoningLevels literal`)
      continue
    }
    return { levels, source: url.trim() }
  }
  throw new CvcApiError('levels-unavailable', `no installer answered with reasoningLevels (${failures.join('; ')})`)
}