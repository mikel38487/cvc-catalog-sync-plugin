/**
 * HTTP-слой плагина: один prefix-маршрут `/cvc`, JSON и фенс same-origin.
 *
 * Все три функции регистрируют свои подмаршруты в одной таблице, поэтому
 * выключенная функция отвечает 404 без повторной регистрации prefix-маршрута
 * на веб-сервере (две регистрации одного префикса конфликтуют).
 *
 * @module cvc-catalog-sync-plugin/lib/http
 */

/** Префикс, под которым живёт весь HTTP плагина. */
export const CVC_PREFIX = '/cvc'

/** Верхняя граница тела запроса: конфиг — это несколько килобайт. */
export const BODY_LIMIT = 65536

/**
 * Ошибка HTTP-слоя с кодом ответа.
 */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * Ответить JSON без кэширования.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

/**
 * Запрос объявлен как JSON.
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
export function isJsonRequest(req) {
  const header = String(req.headers?.['content-type'] ?? '')
  return header.split(';')[0].trim().toLowerCase() === 'application/json'
}

/**
 * Запрос пришёл с чужого сайта.
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
export function isCrossSite(req) {
  return String(req.headers?.['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site'
}

/**
 * Ответить 405 с перечнем допустимых методов.
 * @param {import('node:http').ServerResponse} res
 * @param {readonly string[]} allow
 */
export function methodNotAllowed(res, allow) {
  const methods = allow.join(', ')
  res.setHeader?.('allow', methods)
  sendJson(res, 405, { error: `method not allowed; use ${methods}` })
}

/**
 * Прочитать JSON-тело запроса с ограничением размера.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<unknown>}
 */
export function readJsonBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > limit) {
        reject(new HttpError(413, 'request body is too large'))
        req.destroy?.()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim().length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch (error) {
        reject(new HttpError(400, `invalid JSON: ${error instanceof Error ? error.message : String(error)}`))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Убрать слэши с обоих концов пути.
 * @param {unknown} value
 * @returns {string}
 */
function trimSlashes(value) {
  const text = String(value ?? '')
  let start = 0
  let end = text.length
  while (start < end && text[start] === '/') start += 1
  while (end > start && text[end - 1] === '/') end -= 1
  return text.slice(start, end)
}

/**
 * Создать таблицу маршрутов и обработчик prefix-маршрута.
 *
 * @param {{ prefix?: string, log?: (message: string) => void }} [options]
 * @returns {{
 *   prefix: string,
 *   register: (path: string, handler: (req: any, res: any) => unknown) => () => void,
 *   handle: (req: any, res: any) => Promise<void>,
 *   attach: (webServer: { register: (route: unknown) => () => void }) => () => void,
 *   paths: () => string[],
 * }}
 */
export function createRouter(options = {}) {
  const prefix = typeof options.prefix === 'string' && options.prefix.trim().length > 0
    ? `/${trimSlashes(options.prefix)}`
    : CVC_PREFIX
  const log = typeof options.log === 'function' ? options.log : () => {}

  /** @type {Map<string, (req: any, res: any) => unknown>} */
  const routes = new Map()

  /** Живая регистрация prefix-маршрута на веб-сервере, если она есть. */
  let attached = null

  /**
   * Зарегистрировать обработчик подмаршрута.
   * @param {string} path — путь без префикса, например `state`.
   * @param {(req: any, res: any) => unknown} handler
   * @returns {() => void} disposer, снимающий только свою регистрацию.
   */
  function register(path, handler) {
    if (typeof handler !== 'function') throw new TypeError('createRouter: handler must be a function')
    const key = trimSlashes(path)
    if (routes.has(key)) throw new Error(`cvc: route "${key}" is already registered`)
    routes.set(key, handler)
    return () => {
      if (routes.get(key) === handler) routes.delete(key)
    }
  }

  /**
   * Обработать запрос: фенс, разбор пути, диспетчеризация.
   *
   * Порядок важен: сначала чужой сайт (403), потом несуществующий путь (404),
   * потом запись без JSON (415) и только затем сам обработчик. Так маршрут,
   * которого нет, отвечает 404, а не «пришлите JSON», и метод проверяет
   * обработчик, знающий свои методы.
   * @param {any} req
   * @param {any} res
   * @returns {Promise<void>}
   */
  async function handle(req, res) {
    // Same-origin фенс: браузер присылает Sec-Fetch-Site на каждом fetch,
    // 'cross-site' — единственное значение, означающее чужую страницу.
    if (isCrossSite(req)) {
      sendJson(res, 403, { error: 'forbidden' })
      return
    }

    let pathname
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    } catch {
      sendJson(res, 400, { error: 'malformed url' })
      return
    }
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      sendJson(res, 404, { error: 'not found' })
      return
    }

    const key = trimSlashes(pathname.slice(prefix.length))
    const handler = routes.get(key)
    if (handler === undefined) {
      sendJson(res, 404, { error: 'not found' })
      return
    }

    // Тело несут только PUT/POST; они обязаны быть JSON. Проверка идёт после
    // поиска маршрута, чтобы не перекрывать 404/405 ответом про content-type.
    const method = String(req.method ?? 'GET').toUpperCase()
    if ((method === 'PUT' || method === 'POST') && !isJsonRequest(req)) {
      sendJson(res, 415, { error: 'content-type: application/json required' })
      return
    }

    try {
      await handler(req, res)
    } catch (error) {
      if (res?.writableEnded === true || res?.headersSent === true) {
        log(`cvc: response already sent, error: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof Error ? error.message : String(error)
      if (status >= 500) log(`cvc: ${key} failed: ${message}`)
      sendJson(res, status, { error: message })
    }
  }

  /**
   * Повесить prefix-маршрут на веб-сервер DSH.
   *
   * Идемпотентно: повторный `attach` (например, если сервис webServer
   * пересоздали) сначала снимает прежнюю регистрацию, поэтому `/cvc` на
   * сервере всегда один и тот же маршрут, а не два конкурирующих.
   * @param {{ register: (route: unknown) => () => void }} webServer
   * @returns {() => void}
   */
  function attach(webServer) {
    if (webServer === null || typeof webServer !== 'object' || typeof webServer.register !== 'function') {
      throw new Error('cvc: webServer.register is unavailable')
    }
    if (attached !== null) {
      const previous = attached
      attached = null
      try {
        previous()
      } catch (error) {
        log(`cvc: previous prefix route teardown failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    const dispose = webServer.register({
      kind: 'prefix',
      path: prefix,
      handler: (req, res) => handle(req, res),
    })
    const detach = () => {
      if (attached === detach) attached = null
      if (typeof dispose === 'function') dispose()
    }
    attached = detach
    return detach
  }

  return {
    prefix,
    register,
    handle,
    attach,
    paths: () => [...routes.keys()].sort(),
  }
}