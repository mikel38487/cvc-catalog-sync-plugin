/**
 * HTTP-слой: фенс cross-site, лимит тела, 415, 404 и таблица подмаршрутов.
 *
 * Запуск: node --test test/http.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  BODY_LIMIT,
  CVC_PREFIX,
  HttpError,
  createRouter,
  isCrossSite,
  isJsonRequest,
  methodNotAllowed,
  readJsonBody,
  sendJson,
} from '../lib/http.js'

/** Запрос с телом на следующем тике. */
function makeReq({ method = 'GET', url = '/cvc/health', headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = headers
  req.destroyed = false
  req.destroy = () => { req.destroyed = true }
  process.nextTick(() => {
    if (body !== undefined) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
      req.emit('data', buffer)
    }
    req.emit('end')
  })
  return req
}

/** Ответ, запоминающий статус, заголовки и тело. */
function makeRes() {
  const captured = { status: 0, headers: {}, body: '', headersSent: false, writableEnded: false }
  return {
    captured,
    setHeader(name, value) { captured.headers[name] = value },
    writeHead(status, headers) {
      captured.status = status
      captured.headers = { ...captured.headers, ...headers }
      captured.headersSent = true
    },
    end(body) {
      captured.body = body ?? ''
      captured.writableEnded = true
    },
  }
}

/** Вызвать обработчик и разобрать JSON. */
async function call(router, options) {
  const res = makeRes()
  await router.handle(makeReq(options), res)
  let json = null
  try {
    json = JSON.parse(res.captured.body)
  } catch {
    json = null
  }
  return { ...res.captured, json }
}

test('sendJson отвечает JSON без кэша и с nosniff', () => {
  const res = makeRes()
  sendJson(res, 201, { a: 1 })
  assert.equal(res.captured.status, 201)
  assert.equal(res.captured.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(res.captured.headers['cache-control'], 'no-store')
  assert.equal(res.captured.headers['x-content-type-options'], 'nosniff')
  assert.equal(res.captured.body, '{"a":1}')
})

test('isJsonRequest понимает параметры и регистр', () => {
  assert.equal(isJsonRequest({ headers: { 'content-type': 'application/json' } }), true)
  assert.equal(isJsonRequest({ headers: { 'content-type': 'Application/JSON; charset=utf-8' } }), true)
  assert.equal(isJsonRequest({ headers: { 'content-type': 'text/plain' } }), false)
  assert.equal(isJsonRequest({ headers: {} }), false)
})

test('isCrossSite ловит только cross-site', () => {
  assert.equal(isCrossSite({ headers: { 'sec-fetch-site': 'cross-site' } }), true)
  assert.equal(isCrossSite({ headers: { 'sec-fetch-site': 'same-origin' } }), false)
  assert.equal(isCrossSite({ headers: {} }), false)
})

test('methodNotAllowed пишет Allow и 405', () => {
  const res = makeRes()
  methodNotAllowed(res, ['GET', 'PUT'])
  assert.equal(res.captured.status, 405)
  assert.equal(res.captured.headers.allow, 'GET, PUT')
})

test('readJsonBody читает тело и пустое тело как {}', async () => {
  assert.deepEqual(await readJsonBody(makeReq({ body: { a: 1 } })), { a: 1 })
  assert.deepEqual(await readJsonBody(makeReq({})), {})
})

test('readJsonBody на битом JSON бросает HttpError 400', async () => {
  await assert.rejects(readJsonBody(makeReq({ body: '{oops' })), (error) => error instanceof HttpError && error.status === 400)
})

test('readJsonBody на теле сверх лимита бросает HttpError 413', async () => {
  const huge = Buffer.alloc(BODY_LIMIT + 1, 0x20)
  await assert.rejects(readJsonBody(makeReq({ body: huge })), (error) => error instanceof HttpError && error.status === 413)
})

test('readJsonBody режет сразу по своему лимиту', async () => {
  await assert.rejects(readJsonBody(makeReq({ body: '{"a":"0123456789"}' }), 8), (error) => error.status === 413)
})

test('роутер отвечает 404 на неизвестный подмаршрут', async () => {
  const router = createRouter()
  const answer = await call(router, { url: '/cvc/nope' })
  assert.equal(answer.status, 404)
  assert.deepEqual(answer.json, { error: 'not found' })
})

test('роутер отвечает 404 вне своего префикса', async () => {
  const router = createRouter()
  assert.equal((await call(router, { url: '/cvc-catalog-sync/state' })).status, 404)
  assert.equal((await call(router, { url: '/api/x' })).status, 404)
})

test('фенс cross-site отвечает 403 раньше всего остального', async () => {
  const router = createRouter()
  router.register('state', (req, res) => sendJson(res, 200, { ok: true }))
  const answer = await call(router, { url: '/cvc/state', headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(answer.status, 403)
  assert.equal(answer.json.error, 'forbidden')
})

test('PUT без application/json отвечает 415', async () => {
  const router = createRouter()
  router.register('config', (req, res) => sendJson(res, 200, { ok: true }))
  const answer = await call(router, { method: 'PUT', url: '/cvc/config', headers: { 'content-type': 'text/plain' }, body: '{}' })
  assert.equal(answer.status, 415)
})

test('POST без application/json тоже 415, GET без content-type проходит', async () => {
  const router = createRouter()
  router.register('run', (req, res) => sendJson(res, 200, { ok: true }))
  router.register('health', (req, res) => sendJson(res, 200, { ok: true }))
  assert.equal((await call(router, { method: 'POST', url: '/cvc/run', body: '{}' })).status, 415)
  assert.equal((await call(router, { url: '/cvc/health' })).status, 200)
})

test('PUT с настоящим JSON доходит до обработчика', async () => {
  const router = createRouter()
  router.register('config', (req, res) => sendJson(res, 200, { ok: true }))
  const answer = await call(router, {
    method: 'PUT',
    url: '/cvc/config',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: { config: {} },
  })
  assert.equal(answer.status, 200)
  assert.deepEqual(answer.json, { ok: true })
})

test('зарегистрированный подмаршрут с хвостовым слэшем и query находит обработчик', async () => {
  const router = createRouter()
  router.register('/state/', (req, res) => sendJson(res, 200, { who: 'state' }))
  assert.equal((await call(router, { url: '/cvc/state/?x=1' })).json.who, 'state')
  assert.equal((await call(router, { url: '/cvc/state' })).json.who, 'state')
})

test('disposer снимает только свою регистрацию', async () => {
  const router = createRouter()
  const disposeState = router.register('state', (req, res) => sendJson(res, 200, { ok: 'state' }))
  router.register('health', (req, res) => sendJson(res, 200, { ok: 'health' }))
  disposeState()
  // Повторный вызов disposer не должен снять чужой маршрут с тем же именем.
  const replacement = router.register('state', (req, res) => sendJson(res, 200, { ok: 'replaced' }))
  disposeState()
  assert.equal((await call(router, { url: '/cvc/state' })).json.ok, 'replaced')
  assert.equal((await call(router, { url: '/cvc/health' })).json.ok, 'health')
  replacement()
  assert.equal((await call(router, { url: '/cvc/state' })).status, 404)
})

test('вторая регистрация того же пути бросает', () => {
  const router = createRouter()
  router.register('state', () => {})
  assert.throws(() => router.register('state', () => {}), /already registered/)
})

test('ошибка в обработчике превращается в 500 с текстом', async () => {
  const messages = []
  const router = createRouter({ log: (line) => messages.push(line) })
  router.register('boom', () => { throw new Error('nope') })
  const answer = await call(router, { url: '/cvc/boom' })
  assert.equal(answer.status, 500)
  assert.deepEqual(answer.json, { error: 'nope' })
  assert.match(messages.join(' '), /boom failed: nope/)
})

test('HttpError из обработчика даёт свой статус без лога', async () => {
  const messages = []
  const router = createRouter({ log: (line) => messages.push(line) })
  router.register('bad', () => { throw new HttpError(400, 'bad input') })
  const answer = await call(router, { url: '/cvc/bad' })
  assert.equal(answer.status, 400)
  assert.equal(messages.length, 0)
})

test('attach регистрирует ровно один prefix-маршрут /cvc', async () => {
  const routes = []
  const router = createRouter()
  const dispose = router.attach({ register(route) { routes.push(route); return () => {} } })
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, CVC_PREFIX)
  assert.equal(CVC_PREFIX, '/cvc')
  dispose()
})

test('attach без webServer.register бросает', () => {
  assert.throws(() => createRouter().attach({}), /webServer.register/)
  assert.throws(() => createRouter().attach(undefined), /webServer.register/)
})

test('attach идемпотентен: повторный вызов заменяет регистрацию /cvc', () => {
  const live = []
  const webServer = {
    register(route) {
      live.push(route)
      return () => {
        const index = live.indexOf(route)
        if (index >= 0) live.splice(index, 1)
      }
    },
  }
  const router = createRouter()
  const first = router.attach(webServer)
  assert.equal(live.length, 1)
  const second = router.attach(webServer)
  assert.equal(live.length, 1, 'на сервере остаётся ровно один prefix-маршрут')
  assert.equal(live[0].path, CVC_PREFIX)
  second()
  assert.equal(live.length, 0)
  // Старый disposer после замены не должен снять чужую (новую) регистрацию.
  first()
  assert.equal(live.length, 0)
})

test('paths перечисляет зарегистрированные подмаршруты', () => {
  const router = createRouter({ prefix: '/custom' })
  router.register('b', () => {})
  router.register('/a/', () => {})
  assert.deepEqual(router.paths(), ['a', 'b'])
  assert.equal(router.prefix, '/custom')
})