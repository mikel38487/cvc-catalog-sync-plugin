/**
 * Баланс: снимок по маршрутам, дельта «с прошлого замера», изоляция ошибок,
 * маршрут `GET /cvc/balance` и инструмент `cvc_balance`.
 *
 * Порт `_src-balance/test/host.test.js` в стиле `node --test` и проверки,
 * которых в 1.1.0 не было: обнаружение провайдеров переехало в `providers.js`
 * каркаса (проверяется через `deps.routes()`), ключ не попадает ни в ответ, ни
 * в лог, ни в текст ошибки; 404 при выключенной функции через общий роутер.
 *
 * Запуск: node --test test/balance.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  apiRootOf,
  balanceErrorText,
  createBalanceTracker,
  readRoute,
  readSnapshot,
  register,
  renderToolText,
  snapshot,
  stateFor,
  tool,
  toolStatus,
} from '../lib/balance.js'
import { normalizeConfig } from '../lib/config.js'
import * as cvcApi from '../lib/cvc-api.js'
import * as httpModule from '../lib/http.js'

/** Ключи стенда: значение одного из них обязано остаться на хосте. */
const KEYS = { A: 'sk-live-aaa-secret', B: 'sk-live-bbb-secret' }

/** Маршрут CheapVibeCode: так его отдаёт `providers.resolveRoutes`. */
const ROUTE_A = { provider: 'cheapvibecode', displayName: 'CheapVibeCode', baseURL: 'https://ru.cheapvibecode.ru/v1', apiKeyEnv: 'A' }
const ROUTE_B = { provider: 'funpay', displayName: 'FunPay', baseURL: 'https://ru.cheapvibecode.ru/v1', apiKeyEnv: 'B' }

/**
 * Поддельный `res`.
 * @returns {object}
 */
function makeResponse() {
  return {
    captured: { status: 0, headers: {}, body: '', headersSent: false, writableEnded: false },
    setHeader(name, value) {
      this.captured.headers[name.toLowerCase()] = value
    },
    writeHead(status, extra) {
      this.captured.status = status
      this.captured.headers = { ...this.captured.headers, ...(extra ?? {}) }
      this.captured.headersSent = true
    },
    end(chunk) {
      this.captured.body = chunk ?? ''
      this.captured.writableEnded = true
    },
  }
}

/**
 * Ответ-подделка для инъецированного fetch.
 * @param {number} status
 * @param {unknown} body
 */
function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body)
    },
  }
}

/**
 * `fetchImpl`, который отдаёт по одному ответу из очереди и запоминает вызовы.
 * @param {Array<() => object | Promise<object>>} queue
 */
function queuedFetch(queue) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (next === undefined) throw new Error('unexpected fetch')
    return next()
  }
  impl.calls = calls
  return impl
}

/**
 * Зависимости функции баланса.
 *
 * `deps.api` — настоящий `lib/cvc-api.js`, каркас передаёт его как есть; сеть
 * заменяется через `deps.fetchImpl`, чтобы проверялся реальный путь запроса.
 *
 * @param {{ routes?: Array<object>, credentials?: Record<string, string>, fetchedAt?: () => number }} [options]
 */
function makeDeps(options = {}) {
  const router = httpModule.createRouter({ prefix: '/cvc' })
  const logs = []
  const config = normalizeConfig({})
  const credentials = options.credentials ?? KEYS
  const paths = []
  const deps = Object.freeze({
    ctx: {},
    version: '2.0.0',
    config: () => config,
    features: () => ({ catalogSync: true, coefficients: true, balance: true }),
    log: (level, message) => logs.push({ level, message }),
    route: (path, handler) => {
      paths.push(path)
      return router.register(path, handler)
    },
    http: httpModule,
    api: cvcApi,
    providers: {},
    cache: {},
    store: {},
    routes: () => options.routes ?? [ROUTE_A],
    key: async (ref) => (ref in credentials ? credentials[ref] : ''),
    apiKeyFor: (route) => (typeof route?.apiKeyEnv === 'string' && route.apiKeyEnv.length > 0 ? route.apiKeyEnv : config.providers.apiKeyEnv),
    fetchImpl: options.fetchImpl,
  })
  return { deps, router, logs, paths }
}

/**
 * Прогнать запрос через общий роутер.
 * @param {ReturnType<typeof httpModule.createRouter>} router
 * @param {{ method?: string, path?: string, headers?: Record<string, string> }} [request]
 */
async function call(router, { method = 'GET', path = '/balance', headers = {} } = {}) {
  const req = { method, url: `/cvc${path}`, headers }
  const res = makeResponse()
  await router.handle(req, res)
  let json = null
  try {
    json = JSON.parse(res.captured.body)
  } catch {
    json = null
  }
  return { ...res.captured, json, text: String(res.captured.body) }
}

test('apiRoot снимает хвостовой слэш и /v1', () => {
  assert.equal(apiRootOf('https://ru.cheapvibecode.ru/v1'), 'https://ru.cheapvibecode.ru')
  assert.equal(apiRootOf('https://ru.cheapvibecode.ru/v1/'), 'https://ru.cheapvibecode.ru')
  assert.equal(apiRootOf('https://ru.cheapvibecode.ru'), 'https://ru.cheapvibecode.ru')
  assert.equal(apiRootOf(undefined), '')
})

test('текст ошибки — код и статус, без тела апстрима', () => {
  assert.equal(balanceErrorText(Object.assign(new Error('x'), { code: 'unauthorized', status: 403 })), 'unauthorized (HTTP 403)')
  assert.equal(balanceErrorText(Object.assign(new Error('x'), { code: 'timeout' })), 'timeout')
  assert.equal(balanceErrorText(new Error('boom')), 'unavailable')
  const secret = `bad key ${KEYS.A}`
  assert.equal(balanceErrorText(new Error(secret)).includes(KEYS.A), false)
})

test('учёт замеров: первый замер без расхода, падение — расход, рост — null', () => {
  const tracker = createBalanceTracker()
  assert.equal(tracker.observe('cheapvibecode', 1000), null, 'сравнить не с чем')
  assert.equal(tracker.observe('cheapvibecode', 940), 60, '1000 → 940 — 60 юнитов расхода')
  assert.equal(tracker.observe('cheapvibecode', 5000), null, 'пополнение — не отрицательный расход')
  assert.equal(tracker.observe('cheapvibecode', 4980), 20, 'следующее падение считается от пополнения')
  assert.equal(tracker.observe('other', 100), null, 'у каждого провайдера своя база')
  tracker.reset()
  assert.equal(tracker.observe('cheapvibecode', 100), null, 'reset забывает замеры')
})

test('readRoute: баланс превращается в units, адрес — apiRoot', async () => {
  const fetchImpl = queuedFetch([() => response(200, { token_balance: 123 })])
  const { deps } = makeDeps({ fetchImpl })
  const row = await readRoute(createBalanceTracker(), deps, ROUTE_A)
  assert.deepEqual(row, {
    provider: 'cheapvibecode',
    displayName: 'CheapVibeCode',
    baseURL: 'https://ru.cheapvibecode.ru',
    apiKeyEnv: 'A',
    keySet: true,
    balanceUnits: 123,
    spentSinceLast: null,
    balanceError: '',
  })
  assert.equal(fetchImpl.calls.length, 1)
  assert.equal(fetchImpl.calls[0].url, 'https://ru.cheapvibecode.ru/v1/balance', 'запрос идёт на apiRoot, а не на baseURL')
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, `Bearer ${KEYS.A}`)
})

test('readRoute: HTTP-отказ записывается строкой провайдера', async () => {
  const fetchImpl = queuedFetch([() => response(403, { error: { message: 'nope' } })])
  const { deps } = makeDeps({ fetchImpl })
  const row = await readRoute(createBalanceTracker(), deps, ROUTE_A)
  assert.equal(row.balanceUnits, null)
  assert.equal(row.keySet, true)
  assert.equal(row.balanceError, 'unauthorized (HTTP 403)')
  assert.equal(JSON.stringify(row).includes('nope'), false, 'тело апстрима в ответ не попадает')
})

test('readRoute: нет token_balance — invalid-payload, а не ноль', async () => {
  const fetchImpl = queuedFetch([() => response(200, { balance: 5 })])
  const { deps } = makeDeps({ fetchImpl })
  const row = await readRoute(createBalanceTracker(), deps, ROUTE_A)
  assert.equal(row.balanceUnits, null)
  assert.equal(row.balanceError, 'invalid-payload')
})

test('readRoute: сеть упала — сетевая ошибка, а не исключение наружу', async () => {
  const fetchImpl = async () => {
    throw new Error(`socket closed while sending ${KEYS.A}`)
  }
  const { deps } = makeDeps({ fetchImpl })
  const row = await readRoute(createBalanceTracker(), deps, ROUTE_A)
  assert.equal(row.balanceUnits, null)
  assert.match(row.balanceError, /^network/)
  assert.equal(JSON.stringify(row).includes(KEYS.A), false, 'ключ из текста сетевой ошибки вырезан')
})

test('readRoute: нет ключа — сети нет, в ответе только keySet: false', async () => {
  const fetchImpl = queuedFetch([])
  const { deps } = makeDeps({ fetchImpl, credentials: {} })
  const row = await readRoute(createBalanceTracker(), deps, ROUTE_A)
  assert.equal(row.keySet, false)
  assert.equal(row.balanceUnits, null)
  assert.match(row.balanceError, /Ключ не найден/)
  assert.equal(fetchImpl.calls.length, 0, 'без ключа запрос не отправляется')
  assert.equal(JSON.stringify(row).includes(KEYS.A), false)
})

test('ошибка одного провайдера не роняет остальные', async () => {
  const fetchImpl = queuedFetch([
    () => response(403, { error: { message: 'denied' } }),
    () => response(200, { token_balance: 7 }),
  ])
  const { deps } = makeDeps({ fetchImpl, routes: [ROUTE_A, ROUTE_B] })
  const reading = await readSnapshot(deps, stateFor(deps))
  assert.equal(reading.providers.length, 2)
  assert.equal(reading.providers[0].balanceUnits, null)
  assert.equal(reading.providers[0].balanceError, 'unauthorized (HTTP 403)')
  assert.equal(reading.providers[1].balanceUnits, 7, 'второй провайдер отвечает своим балансом')
  assert.equal(reading.providers[1].balanceError, '')
})

test('маршруты берутся через providers.js каркаса и ничего не хардкодят', async () => {
  const fetchImpl = queuedFetch([() => response(200, { token_balance: 1 })])
  const { deps, router } = makeDeps({ fetchImpl })
  const dispose = register({}, deps)
  const answer = await call(router)
  assert.equal(answer.status, 200)
  assert.deepEqual(answer.json.providers.map((row) => row.provider), ['cheapvibecode'])
  dispose()

  // Другой набор маршрутов — другой ответ, без правки кода.
  const other = makeDeps({ fetchImpl: queuedFetch([() => response(200, { token_balance: 2 })]), routes: [ROUTE_B] })
  const otherDispose = register({}, other.deps)
  const second = await call(other.router)
  assert.deepEqual(second.json.providers.map((row) => row.provider), ['funpay'])
  otherDispose()
})

test('пустой список маршрутов — пустой список провайдеров, не ошибка', async () => {
  const { deps } = makeDeps({ routes: [] })
  const reading = await readSnapshot(deps, stateFor(deps))
  assert.deepEqual(reading.providers, [])
  assert.equal(typeof reading.fetchedAt, 'string')
})

test('чтение маршрутов упало — 200 с пустым списком и `note`, а не 500', async () => {
  const { deps, router, logs } = makeDeps()
  const broken = Object.freeze({ ...deps, routes: () => { throw new Error('configEditor is unavailable') } })
  const reading = await snapshot(broken, stateFor(broken))
  assert.deepEqual(reading.providers, [])
  assert.match(reading.note, /routes are unreadable/)

  const dispose = register({}, broken)
  const answer = await call(router)
  dispose()
  assert.equal(answer.status, 200, 'панель деградирует до пустого списка, а не получает 500')
  assert.deepEqual(answer.json.providers, [])
  assert.equal(answer.json.note, 'provider routes are unreadable')
  assert.match(logs.map((line) => line.message).join('\n'), /routes are unreadable/)
})

test('первый замер — без расхода, следующий — разница; снимок держит обе строки', async () => {
  const fetchImpl = queuedFetch([
    () => response(200, { token_balance: 1000 }),
    () => response(200, { token_balance: 940 }),
  ])
  const { deps } = makeDeps({ fetchImpl })
  const state = stateFor(deps)

  const first = await readSnapshot(deps, state)
  assert.equal(first.providers[0].balanceUnits, 1000)
  assert.equal(first.providers[0].spentSinceLast, null, 'с прошлым замером сравнить нечего')

  const second = await readSnapshot(deps, state)
  assert.equal(second.providers[0].balanceUnits, 940)
  assert.equal(second.providers[0].spentSinceLast, 60)
})

test('пополнение не считается отрицательным расходом', async () => {
  const fetchImpl = queuedFetch([
    () => response(200, { token_balance: 100 }),
    () => response(200, { token_balance: 5000 }),
    () => response(200, { token_balance: 4980 }),
  ])
  const { deps } = makeDeps({ fetchImpl })
  const state = stateFor(deps)

  await readSnapshot(deps, state)
  const topped = await readSnapshot(deps, state)
  assert.equal(topped.providers[0].balanceUnits, 5000)
  assert.equal(topped.providers[0].spentSinceLast, null, 'рост — пополнение, а не расход')

  const spent = await readSnapshot(deps, state)
  assert.equal(spent.providers[0].spentSinceLast, 20, 'следующее падение считается от пополнения')
})

test('ошибочное чтение не стирает прошлый замер', async () => {
  const fetchImpl = queuedFetch([
    () => response(200, { token_balance: 500 }),
    () => response(403, { error: { message: 'denied' } }),
    () => response(200, { token_balance: 480 }),
  ])
  const { deps } = makeDeps({ fetchImpl })
  const state = stateFor(deps)

  await readSnapshot(deps, state)
  const failed = await readSnapshot(deps, state)
  assert.equal(failed.providers[0].balanceUnits, null)
  const recovered = await readSnapshot(deps, state)
  assert.equal(recovered.providers[0].spentSinceLast, 20, 'считается от последнего удачного замера')
})

test('каждый провайдер держит свою базу', async () => {
  const fetchImpl = queuedFetch([
    () => response(200, { token_balance: 100 }),
    () => response(200, { token_balance: 200 }),
    () => response(200, { token_balance: 70 }),
    () => response(200, { token_balance: 150 }),
  ])
  const { deps } = makeDeps({ fetchImpl, routes: [ROUTE_A, ROUTE_B] })
  const state = stateFor(deps)

  await readSnapshot(deps, state)
  const second = await readSnapshot(deps, state)
  assert.equal(second.providers[0].spentSinceLast, 30, 'cheapvibecode: 100 → 70')
  assert.equal(second.providers[1].spentSinceLast, 50, 'funpay: 200 → 150')
})

test('два одновременных «Обновить» — один замер и одна дельта', async () => {
  const fetchImpl = queuedFetch([
    () => response(200, { token_balance: 1000 }),
    () => response(200, { token_balance: 900 }),
  ])
  const { deps } = makeDeps({ fetchImpl })
  const state = stateFor(deps)

  await readSnapshot(deps, state)
  const [a, b] = await Promise.all([readSnapshot(deps, state), readSnapshot(deps, state)])
  assert.equal(fetchImpl.calls.length, 2, 'базовое чтение плюс одно слитое')
  assert.equal(a.providers[0].spentSinceLast, 100)
  assert.equal(b.providers[0].spentSinceLast, 100)
})

test('GET /cvc/balance: снимок по маршрутам, признак ключа и время чтения', async () => {
  const fetchImpl = queuedFetch([() => response(200, { token_balance: 1234.5 })])
  const { deps, router, paths } = makeDeps({ fetchImpl })
  const dispose = register({}, deps)
  assert.deepEqual(paths, ['balance'])

  const answer = await call(router)
  assert.equal(answer.status, 200)
  assert.equal(answer.headers['cache-control'], 'no-store')
  assert.equal(answer.json.providers.length, 1)
  const row = answer.json.providers[0]
  assert.deepEqual(Object.keys(row).sort(), [
    'apiKeyEnv',
    'balanceError',
    'balanceUnits',
    'baseURL',
    'displayName',
    'keySet',
    'provider',
    'spentSinceLast',
  ])
  assert.equal(row.keySet, true)
  assert.equal('key' in row, false, 'значения ключа в ответе нет')
  assert.match(answer.json.fetchedAt, /^\d{4}-\d{2}-\d{2}T/)
  dispose()
})

test('ключ не встречается в ответе маршрута и в логе', async () => {
  const fetchImpl = queuedFetch([
    () => response(403, { error: { message: `invalid api key ${KEYS.A}` } }),
  ])
  const { deps, router, logs } = makeDeps({ fetchImpl, routes: [ROUTE_A] })
  const dispose = register({}, deps)
  const answer = await call(router)
  dispose()

  const wire = answer.text + JSON.stringify(logs)
  assert.equal(wire.includes(KEYS.A), false, 'ключ не уходит ни в тело ответа, ни в лог')
  assert.equal(wire.includes('invalid api key'), false, 'тело апстрима тоже не уходит')
  assert.equal(logs.length, 1)
  assert.match(logs[0].message, /^balance: 1 of 1 route\(s\) failed \(cheapvibecode\)$/)
})

test('ошибка credentials (ключ недоступен) — строка, а не падение панели', async () => {
  const { deps, router } = makeDeps()
  const broken = Object.freeze({ ...deps, key: async () => { throw new Error('credentials store is locked') } })
  const dispose = register({}, broken)
  const answer = await call(router)
  dispose()
  assert.equal(answer.status, 200)
  assert.equal(answer.json.providers[0].keySet, false)
  assert.match(answer.json.providers[0].balanceError, /Ключ не найден/)
})

test('не-GET на маршрут: POST с JSON — 405 с Allow, POST без JSON — 415', async () => {
  const { deps, router } = makeDeps({ routes: [] })
  const dispose = register({}, deps)

  // Роутер каркаса проверяет content-type раньше диспетчеризации: тело несут
  // только PUT/POST, и без `application/json` запрос до обработчика не доходит.
  const notJson = await call(router, { method: 'POST' })
  assert.equal(notJson.status, 415, 'тело без content-type: application/json')
  assert.equal(notJson.json.error, 'content-type: application/json required')

  const declared = await call(router, { method: 'POST', headers: { 'content-type': 'application/json' } })
  assert.equal(declared.status, 405, 'JSON-тело доходит до обработчика, а он принимает только GET')
  assert.equal(declared.headers.allow, 'GET')
  dispose()
})

test('выключенная функция: маршрут отвечает 404', async () => {
  const { deps, router, paths } = makeDeps({ routes: [] })
  const off = await call(router)
  assert.equal(off.status, 404)
  assert.equal(off.json.error, 'not found', 'никакой заготовки ответа от выключенной функции нет')

  const dispose = register({}, deps)
  assert.deepEqual(paths, ['balance'])
  assert.equal((await call(router)).status, 200)

  dispose()
  assert.equal((await call(router)).status, 404)
})

test('404 при features.balance=false: через общий роутер, пока и после включения', async () => {
  const { deps, router } = makeDeps({ routes: [ROUTE_A] })
  // Так каркас ведёт себя при выключенном переключателе: register не зовётся,
  // маршрут отсутствует в таблице, а ответ даёт общий роутер.
  const disabled = await call(router)
  assert.equal(disabled.status, 404)
  assert.match(disabled.json.error, /not found/)

  const dispose = register({}, deps)
  assert.equal((await call(router)).status, 200, 'переключатель включили — маршрут появился')

  dispose()
  assert.equal((await call(router)).status, 404, 'переключатель выключили — маршрут снят без перезапуска')
})

test('фенс same-origin и чужие пути роутера работают для маршрута баланса', async () => {
  const { deps, router } = makeDeps({ routes: [] })
  const dispose = register({}, deps)
  assert.equal((await call(router, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await call(router, { path: '/balance/extra' })).status, 404, 'лишний сегмент пути — не этот маршрут')
  dispose()
})

test('инструмент cvc_balance: только status и только чтение', async () => {
  const { deps } = makeDeps({ routes: [ROUTE_A] })
  const spec = tool(deps)
  assert.equal(spec.name, 'cvc_balance')
  assert.deepEqual(spec.parameters.properties.action.enum, ['status'], 'других действий у инструмента нет')
  assert.equal(spec.parameters.additionalProperties, false)
  assert.equal(typeof spec.execute, 'function')
  assert.equal(typeof spec.output.render, 'function')
  assert.ok(Array.isArray(spec.output.render({}, { ok: true, action: 'status', providers: [], fetchedAt: null })))
})

test('инструмент до первого замера: пусто и подсказка, сети нет', async () => {
  const fetchImpl = queuedFetch([])
  const { deps } = makeDeps({ fetchImpl, routes: [ROUTE_A] })
  const spec = tool(deps)
  const value = await spec.execute({ action: 'status' }, { signal: new AbortController().signal })
  assert.equal(value.ok, true)
  assert.deepEqual(value.providers, [])
  assert.equal(value.fetchedAt, null)
  assert.match(value.note, /balance panel/)
  assert.equal(fetchImpl.calls.length, 0, 'инструмент не тратит запрос')
})

test('инструмент отдаёт последний замер без нового запроса', async () => {
  const fetchImpl = queuedFetch([
    () => response(200, { token_balance: 1000 }),
    () => response(200, { token_balance: 900 }),
  ])
  const { deps, router } = makeDeps({ fetchImpl, routes: [ROUTE_A] })
  const dispose = register({}, deps)
  await call(router)
  await call(router)
  const spec = tool(deps)

  const value = await spec.execute({ action: 'status' }, { signal: new AbortController().signal })
  assert.equal(fetchImpl.calls.length, 2, 'вызов инструмента не открывает третий запрос')
  assert.equal(value.ok, true)
  assert.equal(value.providers.length, 1)
  assert.deepEqual(Object.keys(value.providers[0]).sort(), [
    'balanceError',
    'balanceUnits',
    'displayName',
    'keySet',
    'provider',
    'spentSinceLast',
  ], 'в инструменте нет baseURL и apiKeyEnv: агенту они не нужны')
  assert.equal(value.providers[0].provider, 'cheapvibecode')
  assert.equal(value.providers[0].displayName, 'CheapVibeCode')
  assert.equal(value.providers[0].keySet, true)
  assert.equal(value.providers[0].balanceUnits, 900)
  assert.equal(value.providers[0].spentSinceLast, 100)
  assert.equal(JSON.stringify(value).includes(KEYS.A), false, 'ключа в значении инструмента нет')
  const text = renderToolText(value)
  assert.match(text, /CheapVibeCode: 900, spent 100/)
  dispose()
})

test('инструмент на неизвестное действие отказывает, не ходя в сеть', async () => {
  const { deps } = makeDeps()
  const value = await toolStatus(deps, stateFor(deps), { action: 'reload' })
  assert.equal(value.ok, false)
  assert.match(value.error, /only action "status"/)
})

test('состояние функции привязано к набору deps: чужой набор — чужие замеры', async () => {
  const fetchImpl = queuedFetch([() => response(200, { token_balance: 10 })])
  const first = makeDeps({ fetchImpl })
  await readSnapshot(first.deps, stateFor(first.deps))
  assert.equal(stateFor(first.deps).last.providers[0].balanceUnits, 10)

  const second = makeDeps({ routes: [] })
  assert.equal(stateFor(second.deps).last, null, 'новый набор deps не видит чужого снимка')
})