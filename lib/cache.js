/**
 * Общий кэш каталога `GET /v1/models` на три функции плагина.
 *
 * Синхронизация каталога, коэффициенты и баланс читают один и тот же ответ,
 * поэтому запрос к апстриму не дублируется. Поведение при ошибке: пока есть
 * прошлый снимок, он отдаётся с `stale: true` и текстом ошибки; когда снимка
 * ещё нет — ошибка пробрасывается.
 *
 * @module cvc-catalog-sync-plugin/lib/cache
 */

/** TTL по умолчанию: 10 минут, как `coefficients.refreshMinutes`. */
export const DEFAULT_TTL_MS = 10 * 60 * 1000

/**
 * Создать кэш каталога.
 *
 * `client` — асинхронная функция без аргументов, отдающая данные каталога;
 * `ttlMs` — число или функция от текущего конфига (тогда TTL меняется вместе с
 * настройками без пересоздания кэша).
 *
 * @param {{ client: () => Promise<any>, ttlMs?: number | (() => number), now?: () => number }} options
 * @returns {{
 *   get: (options?: { force?: boolean }) => Promise<{ data: any, fetchedAt: number, stale: boolean, error: string, ageMs: number }>,
 *   refresh: () => Promise<{ data: any, fetchedAt: number, stale: boolean, error: string, ageMs: number }>,
 *   peek: () => { data: any, fetchedAt: number, ageMs: number } | null,
 *   clear: () => void,
 *   ttl: () => number,
 * }}
 */
export function createCatalogCache(options = {}) {
  const { client } = options
  if (typeof client !== 'function') throw new TypeError('createCatalogCache: client must be a function')
  const now = typeof options.now === 'function' ? options.now : Date.now
  const ttlSource = options.ttlMs

  /** @type {{ data: any, fetchedAt: number } | null} */
  let entry = null
  /** @type {Promise<any> | null} */
  let inflight = null
  /** Поколение кэша: `clear()` отменяет право старых ответов записываться. */
  let generation = 0

  /** Действующий TTL в миллисекундах. */
  function ttl() {
    const requested = typeof ttlSource === 'function' ? ttlSource() : ttlSource
    if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return DEFAULT_TTL_MS
    return requested
  }

  /** Снимок текущего значения без сети. */
  function peek() {
    if (entry === null) return null
    return { data: entry.data, fetchedAt: entry.fetchedAt, ageMs: Math.max(0, now() - entry.fetchedAt) }
  }

  /**
   * Прочитать данные: из кэша, если снимок свежий, иначе из `client()`.
   * @param {boolean} force
   */
  function load(force) {
    const time = now()
    if (!force && entry !== null && time - entry.fetchedAt < ttl()) {
      return Promise.resolve({
        data: entry.data,
        fetchedAt: entry.fetchedAt,
        stale: false,
        error: '',
        ageMs: Math.max(0, time - entry.fetchedAt),
      })
    }
    if (inflight !== null) return inflight
    const startedGeneration = generation
    const promise = (async () => {
      try {
        const data = await client()
        const fetchedAt = now()
        if (startedGeneration === generation) entry = { data, fetchedAt }
        return { data, fetchedAt, stale: false, error: '', ageMs: 0 }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (entry !== null) {
          return {
            data: entry.data,
            fetchedAt: entry.fetchedAt,
            stale: true,
            error: message,
            ageMs: Math.max(0, now() - entry.fetchedAt),
          }
        }
        throw error
      } finally {
        if (inflight === promise) inflight = null
      }
    })()
    inflight = promise
    return promise
  }

  return {
    get(options = {}) {
      return load(options.force === true)
    },
    refresh() {
      return load(true)
    },
    peek,
    clear() {
      entry = null
      generation += 1
    },
    ttl,
  }
}