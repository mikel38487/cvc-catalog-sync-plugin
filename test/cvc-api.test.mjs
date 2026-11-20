/**
 * HTTP-клиент CheapVibeCode: адреса, таймаут, 401/403, битый JSON, разбор
 * уровней установщика и отсутствие ключа в тексте ошибок.
 *
 * Запуск: node --test test/cvc-api.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CvcApiError,
  apiRoot,
  balanceUrl,
  fetchBalance,
  fetchLevels,
  fetchModels,
  modelsUrl,
  parseCatalogPayload,
  parseReasoningLevels,
  redact,
} from '../lib/cvc-api.js'

const KEY = 'sk-test-secret-value'
const BASE = 'https://ru.cheapvibecode.ru/v1'

/** Ответ-подделка с заданным статусом и телом. */
function response(status, body, { json = true } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (!json) throw new Error('unexpected token <')
      return typeof body === 'string' ? JSON.parse(body) : body
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body)
    },
  }
}

/** fetch-подделка: запоминает вызовы и отдаёт ответ или бросает. */
function fakeFetch(handler) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  impl.calls = calls
  return impl
}

/** Ошибка-заглушка с нужным name (как у abort/timeout). */
function namedError(name) {
  const error = new Error(name)
  error.name = name
  return error
}

test('apiRoot снимает хвостовой слэш и уровнем /v1', () => {
  assert.equal(apiRoot('https://ru.cheapvibecode.ru/v1'), 'https://ru.cheapvibecode.ru')
  assert.equal(apiRoot('https://ru.cheapvibecode.ru/v1/'), 'https://ru.cheapvibecode.ru')
  assert.equal(apiRoot('https://ru.cheapvibecode.ru'), 'https://ru.cheapvibecode.ru')
  assert.equal(apiRoot(''), '')
})

test('адреса каталога и баланса', () => {
  assert.equal(modelsUrl(BASE), 'https://ru.cheapvibecode.ru/v1/models')
  assert.equal(modelsUrl('https://x/v1/'), 'https://x/v1/models')
  assert.equal(balanceUrl(BASE), 'https://ru.cheapvibecode.ru/v1/balance')
})

test('redact вырезает секрет из текста', () => {
  assert.equal(redact(`bad key ${KEY}`, KEY), 'bad key ***')
  assert.equal(redact('text', ''), 'text')
})

test('parseCatalogPayload принимает { data } и голый массив', () => {
  assert.deepEqual(parseCatalogPayload({ data: [{ id: 'a' }] }), [{ id: 'a' }])
  assert.deepEqual(parseCatalogPayload([{ id: 'b' }]), [{ id: 'b' }])
})

test('parseCatalogPayload отбрасывает записи без id и чужую форму', () => {
  assert.deepEqual(parseCatalogPayload({ data: [{ id: 'a' }, { id: '  ' }, { name: 'x' }, null] }), [{ id: 'a' }])
  assert.equal(parseCatalogPayload({ models: [] }), null)
  assert.equal(parseCatalogPayload('text'), null)
})

test('fetchModels ходит своим маршрутом с Bearer и без ключа в URL', async () => {
  const impl = fakeFetch(() => response(200, { data: [{ id: 'gpt-6.2-astra' }] }))
  const models = await fetchModels({ baseURL: BASE, key: KEY, fetchImpl: impl })
  assert.deepEqual(models, [{ id: 'gpt-6.2-astra' }])
  assert.equal(impl.calls.length, 1)
  assert.equal(impl.calls[0].url, 'https://ru.cheapvibecode.ru/v1/models')
  assert.equal(impl.calls[0].init.headers.Authorization, `Bearer ${KEY}`)
  assert.equal(impl.calls[0].url.includes(KEY), false)
  assert.ok(impl.calls[0].init.signal instanceof AbortSignal)
})

test('fetchModels без ключа падает кодом no-key до сети', async () => {
  let called = 0
  const impl = fakeFetch(() => { called += 1; return response(200, { data: [] }) })
  await assert.rejects(
    fetchModels({ baseURL: BASE, key: '', fetchImpl: impl }),
    (error) => error instanceof CvcApiError && error.code === 'no-key',
  )
  assert.equal(called, 0)
})

test('fetchModels с мусорным baseURL падает кодом invalid-base-url', async () => {
  await assert.rejects(
    fetchModels({ baseURL: 'not-a-url', key: KEY, fetchImpl: fakeFetch(() => response(200, {})) }),
    (error) => error.code === 'invalid-base-url',
  )
  await assert.rejects(
    fetchModels({ baseURL: '', key: KEY, fetchImpl: fakeFetch(() => response(200, {})) }),
    (error) => error.code === 'invalid-base-url',
  )
})

test('таймаут превращается в код timeout с длительностью в тексте', async () => {
  const impl = fakeFetch(() => { throw namedError('TimeoutError') })
  await assert.rejects(
    fetchModels({ baseURL: BASE, key: KEY, timeoutMs: 1234, fetchImpl: impl }),
    (error) => error.code === 'timeout' && /1234 ms/.test(error.message),
  )
})

test('внешняя отмена даёт код aborted', async () => {
  const impl = fakeFetch(() => { throw namedError('AbortError') })
  await assert.rejects(
    fetchModels({ baseURL: BASE, key: KEY, fetchImpl: impl }),
    (error) => error.code === 'aborted',
  )
})

test('401 и 403 дают код unauthorized и не светят ключ', async () => {
  for (const status of [401, 403]) {
    const impl = fakeFetch(() => response(status, { error: { message: `wrong key ${KEY}` } }))
    await assert.rejects(
      fetchModels({ baseURL: BASE, key: KEY, fetchImpl: impl }),
      (error) => {
        assert.equal(error.code, 'unauthorized')
        assert.equal(error.status, status)
        assert.equal(error.message.includes(KEY), false)
        assert.match(error.message, /\*\*\*/)
        return true
      },
    )
  }
})

test('прочие HTTP-ошибки дают код http со статусом', async () => {
  const impl = fakeFetch(() => response(502, '<html>bad gateway</html>', { json: false }))
  await assert.rejects(
    fetchModels({ baseURL: BASE, key: KEY, fetchImpl: impl }),
    (error) => error.code === 'http' && error.status === 502 && /HTTP 502/.test(error.message),
  )
})

test('битый JSON даёт invalid-json и не содержит ключ', async () => {
  const impl = fakeFetch(() => response(200, `<html>${KEY}</html>`, { json: false }))
  await assert.rejects(
    fetchModels({ baseURL: BASE, key: KEY, fetchImpl: impl }),
    (error) => error.code === 'invalid-json' && error.message.includes(KEY) === false,
  )
})

test('сетевая ошибка даёт network с вырезанным ключом', async () => {
  const impl = fakeFetch(() => { throw new Error(`getaddrinfo ENOTFOUND for ${KEY}`) })
  await assert.rejects(
    fetchModels({ baseURL: BASE, key: KEY, fetchImpl: impl }),
    (error) => error.code === 'network' && error.message.includes(KEY) === false,
  )
})

test('ответ без списка моделей даёт invalid-payload', async () => {
  const impl = fakeFetch(() => response(200, { models: [] }))
  await assert.rejects(
    fetchModels({ baseURL: BASE, key: KEY, fetchImpl: impl }),
    (error) => error.code === 'invalid-payload',
  )
})

test('fetchBalance читает token_balance', async () => {
  const impl = fakeFetch(() => response(200, { token_balance: 51200 }))
  const balance = await fetchBalance({ baseURL: BASE, key: KEY, fetchImpl: impl })
  assert.deepEqual(balance, { units: 51200 })
  assert.equal(impl.calls[0].url, 'https://ru.cheapvibecode.ru/v1/balance')
})

test('fetchBalance без token_balance даёт invalid-payload', async () => {
  const impl = fakeFetch(() => response(200, { balance: 1 }))
  await assert.rejects(
    fetchBalance({ baseURL: BASE, key: KEY, fetchImpl: impl }),
    (error) => error.code === 'invalid-payload',
  )
})

test('fetchBalance без ключа падает кодом no-key', async () => {
  await assert.rejects(
    fetchBalance({ baseURL: BASE, key: '', fetchImpl: fakeFetch(() => response(200, {})) }),
    (error) => error.code === 'no-key',
  )
})

const INSTALLER = `
$ErrorActionPreference = 'Stop'
const reasoningLevels = {
  "gpt-6.2-astra": ["low", "medium", "high"],
  "deepseek-v4.1-flash-1017": ["off", "low", "max"],
  "broken": [1, 2]
};
`

test('parseReasoningLevels вытаскивает карту и отбрасывает битые строки', () => {
  const levels = parseReasoningLevels(INSTALLER)
  assert.deepEqual(levels, {
    'gpt-6.2-astra': ['low', 'medium', 'high'],
    'deepseek-v4.1-flash-1017': ['off', 'low', 'max'],
  })
})

test('parseReasoningLevels молчит на тексте без литерала', () => {
  assert.equal(parseReasoningLevels('no literal here'), null)
  assert.equal(parseReasoningLevels('const reasoningLevels = {oops'), null)
  assert.equal(parseReasoningLevels(''), null)
  assert.equal(parseReasoningLevels(undefined), null)
})

test('fetchLevels берёт первый ответивший установщик', async () => {
  const impl = fakeFetch((url) => {
    if (url.endsWith('/idhw')) return response(503, 'down', { json: false })
    return response(200, INSTALLER, { json: false })
  })
  const result = await fetchLevels({ urls: ['https://ru.cheapvibecode.ru/idhw', 'https://ru.cheapvibecode.ru/idhl'], fetchImpl: impl })
  assert.equal(result.source, 'https://ru.cheapvibecode.ru/idhl')
  assert.equal(Object.keys(result.levels).length, 2)
  assert.equal(impl.calls.length, 2)
})

test('fetchLevels переживает сетевую ошибку первого адреса', async () => {
  const impl = fakeFetch((url) => {
    if (url.endsWith('/idhw')) throw namedError('TimeoutError')
    return response(200, INSTALLER, { json: false })
  })
  const result = await fetchLevels({ urls: ['https://a/idhw', 'https://a/idhl'], fetchImpl: impl })
  assert.equal(result.source, 'https://a/idhl')
})

test('fetchLevels собирает причины отказа', async () => {
  const impl = fakeFetch(() => response(200, 'no literal', { json: false }))
  await assert.rejects(
    fetchLevels({ urls: ['https://a/idhw'], fetchImpl: impl }),
    (error) => error.code === 'levels-unavailable' && /no reasoningLevels/.test(error.message),
  )
})

test('fetchLevels без адресов падает levels-unavailable', async () => {
  await assert.rejects(fetchLevels({ urls: [], fetchImpl: fakeFetch(() => response(200, '')) }), (error) => error.code === 'levels-unavailable')
})