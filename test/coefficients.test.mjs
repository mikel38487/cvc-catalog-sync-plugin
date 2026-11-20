/**
 * Коэффициенты: индекс каталога, поиск по id, форматирование множителя и
 * маршрут `GET /cvc/coefficients` на общем кэше каталога.
 *
 * Порт `_src-coeff/test/catalog.test.js` (нормализация id, разбор множителя,
 * индекс, поиск, формат бейджа) в стиле `node --test` и проверки, которых в
 * 1.0.0 не было: общий кэш вместо своего запроса, одно чтение на параллельные
 * запросы, поздний ответ, ошибка апстрима без ключа в ответе и логе, 404 через
 * общий роутер.
 *
 * Запуск: node --test test/coefficients.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  coefficientsPayload,
  createCoefficientsReader,
  displayNameOf,
  formatMultiplier,
  indexCoefficients,
  lookupCoefficient,
  normalizeModelId,
  parseContextWindow,
  parseMultiplier,
  register,
  tool,
} from '../lib/coefficients.js'
import { normalizeConfig } from '../lib/config.js'
import * as httpModule from '../lib/http.js'
import { createRouter } from '../lib/http.js'

/** Секрет, которого не должно быть ни в ответе, ни в логе. */
const KEY = 'sk-live-secret-42'

/** Каталог в форме `GET /v1/models`: и полные строки, и мусор. */
const CATALOG = {
  models: [
    {
      id: 'deepseek-v4.1-flash',
      display_name: 'DeepSeek V4.1 Flash',
      multiplier: 0.1,
      fast_multiplier: 1,
      context_window: 1_048_576,
    },
    { id: 'openai/gpt-6-sol', display_name: 'GPT-6 Sol', multiplier: '0.38', fast_multiplier: '2.5' },
    { id: 'gpt-6-luna', multiplier: 2.5 },
    { id: 'broken', multiplier: null },
    { id: '', multiplier: 1 },
    null,
  ],
  providers: [{ provider: 'cheapvibecode', displayName: 'CheapVibeCode' }],
}

/**
 * Поддельный `res`: записывает статус, заголовки и тело.
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
 * Прогнать запрос через общий роутер каркаса.
 * @param {ReturnType<typeof createRouter>} router
 * @param {{ method?: string, path?: string, headers?: Record<string, string> }} [request]
 * @returns {Promise<{ status: number, headers: Record<string, any>, json: any, text: string }>}
 */
async function call(router, { method = 'GET', path = '/coefficients', headers = {} } = {}) {
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

/**
 * Кэш-подделка: отдаёт заданный снимок и считает чтения.
 * @param {unknown} result
 */
function fakeCache(result) {
  const cache = {
    calls: 0,
    async get() {
      cache.calls += 1
      return result
    },
  }
  return cache
}

/** Кэш с ручным управлением: чтение остаётся висеть до `resolve`. */
function deferredCache() {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  const cache = {
    calls: 0,
    get() {
      cache.calls += 1
      return promise
    },
    resolve(value) {
      release(value)
    },
  }
  return cache
}

/**
 * Зависимости функции коэффициентов: общий кэш, общий роутер, лог в массив.
 * @param {{ cache?: any, config?: any }} [options]
 */
function makeDeps(options = {}) {
  const router = createRouter({ prefix: '/cvc' })
  const logs = []
  const paths = []
  const config = options.config ?? normalizeConfig({})
  const deps = Object.freeze({
    ctx: { get: () => undefined },
    version: '2.0.0',
    config: () => config,
    features: () => ({ catalogSync: true, coefficients: true, balance: true }),
    log: (level, message) => logs.push({ level, message }),
    route: (path, handler) => {
      paths.push(path)
      return router.register(path, handler)
    },
    http: httpModule,
    api: {},
    providers: {},
    cache: options.cache ?? fakeCache({ data: CATALOG, fetchedAt: Date.now(), stale: false, error: '' }),
    store: {},
    routes: () => [],
    key: async () => KEY,
    apiKeyFor: () => 'CVC_DEEPSEEK_API_KEY',
  })
  return { deps, router, logs, paths }
}

test('нормализация сводит точки, подчёркивания и регистр', () => {
  assert.equal(normalizeModelId('DeepSeek-V4.1_Flash'), 'deepseek-v4-1-flash')
  assert.equal(normalizeModelId('  gpt-6-sol  '), 'gpt-6-sol')
  assert.equal(normalizeModelId(null), '')
})

test('коэффициент принимает ноль и строку, отвергает мусор', () => {
  assert.equal(parseMultiplier(0), 0)
  assert.equal(parseMultiplier('0.38'), 0.38)
  assert.equal(parseMultiplier(''), null)
  assert.equal(parseMultiplier(-1), null)
  assert.equal(parseMultiplier('нет'), null)
  assert.equal(parseMultiplier(Number.NaN), null)
})

test('размер контекста: только положительное число', () => {
  assert.equal(parseContextWindow(1_048_576), 1_048_576)
  assert.equal(parseContextWindow(2048.9), 2048)
  assert.equal(parseContextWindow(0), null)
  assert.equal(parseContextWindow('1000'), null)
})

test('индекс каталога: `models` и голый массив, первая запись побеждает, без множителя — нет записи', () => {
  const index = indexCoefficients(CATALOG)
  assert.equal(index.size, 3, 'null, пустой id и строка без множителя отброшены')
  assert.deepEqual(index.get('deepseek-v4-1-flash'), {
    id: 'deepseek-v4.1-flash',
    displayName: 'DeepSeek V4.1 Flash',
    multiplier: 0.1,
    fastMultiplier: 1,
    contextWindow: 1_048_576,
  })
  assert.deepEqual(index.get('openai/gpt-6-sol'), {
    id: 'openai/gpt-6-sol',
    displayName: 'GPT-6 Sol',
    multiplier: 0.38,
    fastMultiplier: 2.5,
    contextWindow: null,
  })
  assert.equal(index.get('gpt-6-luna').displayName, 'gpt-6-luna', 'без display_name имя — сам id')
  assert.equal(index.has('broken'), false, 'нет множителя — нет бейджа')

  const bare = indexCoefficients([{ id: 'a', multiplier: 2 }, { id: 'a', multiplier: 9 }, { id: 'b' }])
  assert.equal(bare.size, 1)
  assert.equal(bare.get('a').multiplier, 2, 'порядок каталога решает повтор id')
  assert.deepEqual([...indexCoefficients({}).keys()], [])
  assert.deepEqual([...indexCoefficients(undefined).keys()], [])
})

test('поиск находит модель с другим написанием разделителя и с префиксом вендора', () => {
  const index = indexCoefficients({
    models: [
      { id: 'deepseek-v4.1-flash', multiplier: 0.1 },
      { id: 'openai/gpt-6-sol', multiplier: 3 },
      { id: 'claude-sonnet-5', multiplier: 2 },
    ],
  })

  assert.equal(lookupCoefficient(index, 'deepseek-v4-1-flash')?.multiplier, 0.1)
  assert.equal(lookupCoefficient(index, 'openai/gpt-6-sol')?.multiplier, 3)
  assert.equal(lookupCoefficient(index, 'gpt-6-sol')?.multiplier, 3, 'префикс вендора отбрасывается')
  assert.equal(lookupCoefficient(index, 'vendor-claude-sonnet-5')?.multiplier, undefined)
  assert.equal(lookupCoefficient(index, ''), null)
})

test('короткий хвост не получает чужой коэффициент', () => {
  const index = indexCoefficients({
    models: [
      { id: 'mimo-v2.6-pro', multiplier: 0.3 },
      { id: 'gemini-3.1-pro', multiplier: 2 },
    ],
  })
  assert.equal(lookupCoefficient(index, 'pro'), null)
  assert.equal(lookupCoefficient(index, 'flash'), null)
  assert.equal(lookupCoefficient(index, 'mimo-v2-6-pro')?.multiplier, 0.3)
})

test('неоднозначный хвост не выбирает коэффициент наугад', () => {
  const index = indexCoefficients({
    models: [
      { id: 'a/flash', multiplier: 0.1 },
      { id: 'b/flash', multiplier: 0.3 },
    ],
  })
  assert.equal(lookupCoefficient(index, 'flash'), null)
  assert.equal(lookupCoefficient(index, 'a/flash')?.multiplier, 0.1)
})

test('бейдж не тащит хвостовые нули и не врёт про нечисло', () => {
  assert.equal(formatMultiplier(0.1), '×0.1')
  assert.equal(formatMultiplier(1), '×1')
  assert.equal(formatMultiplier(2.5), '×2.5')
  assert.equal(formatMultiplier(2.5), formatMultiplier(Number('2.50')))
  assert.equal(formatMultiplier(0), '×0')
  assert.equal(formatMultiplier(Number.NaN), '')
})

test('подпись модели: display_name важнее id и обрезается', () => {
  assert.equal(displayNameOf('id-1', '  Vendor · Model  '), 'Vendor · Model')
  assert.equal(displayNameOf('id-1', '   '), 'id-1')
  assert.equal(displayNameOf('id-1', null), 'id-1')
})

test('ответ несёт форму §4: модели, провайдеры, fetchedAt и stale', () => {
  const payload = coefficientsPayload(CATALOG, { fetchedAt: 1_000, stale: false })
  assert.deepEqual(payload.providers, ['cheapvibecode'], 'id провайдера, а не подпись')
  assert.equal(payload.models.length, 3)
  assert.equal(payload.fetchedAt, '1970-01-01T00:00:01.000Z')
  assert.equal(payload.stale, false)
  for (const model of payload.models) {
    assert.deepEqual(
      Object.keys(model).sort(),
      ['contextWindow', 'displayName', 'fastMultiplier', 'id', 'multiplier'],
      'в строке только поля контракта',
    )
  }
  assert.equal(payload.models.find((model) => model.id === 'deepseek-v4.1-flash').fastMultiplier, 1)
  assert.equal(payload.models.find((model) => model.id === 'gpt-6-luna').contextWindow, null)
  assert.equal(JSON.stringify(payload).includes(KEY), false, 'ключа в ответе нет')
})

test('fetchedAt без снимка — null, stale проносится как есть', () => {
  const payload = coefficientsPayload({ models: [], providers: [] }, { fetchedAt: 0, stale: true })
  assert.equal(payload.fetchedAt, null)
  assert.equal(payload.stale, true)
  assert.deepEqual(payload.models, [])
  assert.deepEqual(payload.providers, [])
})

test('GET /cvc/coefficients отвечает каталогом из общего кэша и не ходит в сеть сам', async () => {
  const { deps, router, paths } = makeDeps()
  const dispose = register({}, deps)
  assert.deepEqual(paths, ['coefficients'], 'маршрут регистрируется в общей таблице')

  const answer = await call(router)
  assert.equal(answer.status, 200)
  assert.equal(answer.headers['cache-control'], 'no-store')
  assert.deepEqual(answer.json.providers, ['cheapvibecode'])
  assert.equal(answer.json.models.length, 3)
  assert.equal(deps.cache.calls, 1, 'одно чтение общего кэша')
  dispose()
})

test('два параллельных запроса читают кэш один раз', async () => {
  const cache = deferredCache()
  const { deps, router } = makeDeps({ cache })
  const dispose = register({}, deps)

  const first = call(router)
  const second = call(router)
  assert.equal(cache.calls, 1, 'второй запрос ждёт первое чтение, а не открывает своё')

  cache.resolve({ data: CATALOG, fetchedAt: 2_000, stale: false, error: '' })
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.status, 200)
  assert.deepEqual(a.json, b.json)
  dispose()
})

test('поздний ответ после выключения функции не становится ответом', async () => {
  const cache = deferredCache()
  const { deps, router } = makeDeps({ cache })
  const dispose = register({}, deps)

  const pending = call(router)
  dispose() // функция выключена: маршрут снят, поколение чтения поднято
  cache.resolve({ data: CATALOG, fetchedAt: 3_000, stale: false, error: '' })

  const answer = await pending
  assert.equal(answer.status, 200)
  assert.deepEqual(answer.json.models, [], 'поздний каталог уже не ответ этой функции')
  assert.equal(answer.json.fetchedAt, null)
})

test('ошибка кэша: пустой ответ, код в логе, ключа в ответе и логе нет', async () => {
  const failure = Object.assign(new Error(`upstream said: ${KEY} is invalid`), { code: 'unauthorized' })
  const cache = { calls: 0, async get() { cache.calls += 1; throw failure } }
  const { deps, router, logs } = makeDeps({ cache })
  const dispose = register({}, deps)

  const answer = await call(router)
  assert.equal(answer.status, 200, 'ошибка апстрима не превращается в 500: бейджи просто не рисуются')
  assert.deepEqual(answer.json.models, [])
  assert.equal(logs.length, 1)
  assert.equal(logs[0].level, 'warn')
  assert.match(logs[0].message, /unauthorized/)
  const wire = JSON.stringify(answer.json) + JSON.stringify(logs)
  assert.equal(wire.includes(KEY), false, 'ключ не уходит ни в ответ, ни в лог')
  dispose()
})

test('stale-снимок после ошибки помечается в ответе', async () => {
  const cache = fakeCache({
    data: { models: [{ id: 'm', multiplier: 1 }], providers: [] },
    fetchedAt: 4_000,
    stale: true,
    error: 'upstream down',
  })
  const { deps, router } = makeDeps({ cache })
  const dispose = register({}, deps)

  const answer = await call(router)
  assert.equal(answer.status, 200)
  assert.equal(answer.json.stale, true)
  assert.equal(answer.json.models[0].id, 'm')
  dispose()
})

test('не-GET на маршрут — 405 с Allow', async () => {
  const { deps, router } = makeDeps()
  const dispose = register({}, deps)
  const answer = await call(router, { method: 'POST', headers: { 'content-type': 'application/json' } })
  assert.equal(answer.status, 405)
  assert.equal(answer.headers.allow, 'GET')
  dispose()
})

test('выключенная функция: маршрута нет и общий роутер отвечает 404', async () => {
  const { deps, router } = makeDeps()
  const before = await call(router)
  assert.equal(before.status, 404, 'пока функция не смонтирована, маршрута нет')

  const dispose = register({}, deps)
  assert.equal((await call(router)).status, 200)

  dispose()
  const after = await call(router)
  assert.equal(after.status, 404, 'выключение снимает только свой подмаршрут')
  assert.equal(after.json.error, 'not found')
})

test('чтение сливает только одновременные запросы, а свежесть держит кэш', async () => {
  const cache = fakeCache({ data: { models: [], providers: [] }, fetchedAt: 0, stale: false })
  const reader = createCoefficientsReader(cache)
  const [a, b] = await Promise.all([reader.read(), reader.read()])
  assert.equal(cache.calls, 1, 'два одновременных чтения — один вызов кэша')
  assert.deepEqual(a, b)

  // Следующее (последовательное) чтение снова спрашивает кэш: TTL и сеть — его
  // дело, модуль не заводит второй кэш поверх общего.
  await reader.read()
  assert.equal(cache.calls, 2)
})

test('у коэффициентов нет инструмента', () => {
  const { deps } = makeDeps()
  assert.equal(tool(deps), null)
})
