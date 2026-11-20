/**
 * Поиск маршрутов CheapVibeCode и разрешение ключа.
 *
 * Запуск: node --test test/providers.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeConfig } from '../lib/config.js'
import {
  LLM_ENTRY_NAME,
  apiKeyFor,
  findProviderEntry,
  hostMatches,
  hostOf,
  matchesProvider,
  pickRoute,
  resolveKey,
  resolveRoutes,
  rowIdMatches,
} from '../lib/providers.js'

/** Контекст с поддельным configEditor и credentials. */
function makeCtx({ entries = [], credentials } = {}) {
  const services = {
    configEditor: { entries: () => entries, configuration: () => [], documentPath: 'C:/tmp/patch.yml' },
    ...(credentials === undefined ? {} : { credentials }),
  }
  return { get: (name) => services[name] }
}

/** Строка llm-pi-ai с маршрутами. */
function llmRow(providers, id = 'llm-pi-ai') {
  return { options: { id, name: LLM_ENTRY_NAME, config: { providers } } }
}

const CVC = {
  displayName: 'CheapVibeCode',
  apiKeyEnv: 'CVC_DEEPSEEK_API_KEY',
  api: 'openai-completions',
  baseURL: 'https://ru.cheapvibecode.ru/v1',
  models: [{ id: 'm1' }],
}

test('hostOf берёт hostname https-адреса в нижнем регистре', () => {
  assert.equal(hostOf('https://RU.CheapVibeCode.ru/v1'), 'ru.cheapvibecode.ru')
  assert.equal(hostOf('https://cheapvibecode.ru'), 'cheapvibecode.ru')
})

test('hostOf отвергает не-https, мусор и пустое', () => {
  assert.equal(hostOf('http://ru.cheapvibecode.ru/v1'), '')
  assert.equal(hostOf('not a url'), '')
  assert.equal(hostOf(''), '')
  assert.equal(hostOf(undefined), '')
})

test('hostMatches покрывает сам хост и его поддомены', () => {
  assert.equal(hostMatches('cheapvibecode.ru', 'cheapvibecode.ru'), true)
  assert.equal(hostMatches('ru.cheapvibecode.ru', 'cheapvibecode.ru'), true)
  assert.equal(hostMatches('api.RU.CheapVibeCode.ru', 'cheapvibecode.ru'), true)
})

test('hostMatches не пускает подстроки соседних хостов', () => {
  assert.equal(hostMatches('cheapvibecode.ru.evil.com', 'cheapvibecode.ru'), false)
  assert.equal(hostMatches('notcheapvibecode.ru', 'cheapvibecode.ru'), false)
  assert.equal(hostMatches('evilcheapvibecode.ru', 'cheapvibecode.ru'), false)
  assert.equal(hostMatches('ru.cheapvibecode.ru', '.cheapvibecode.ru'), true)
  assert.equal(hostMatches('x', ''), false)
})

test('matchesProvider сравнивает hostname, а не подстроку', () => {
  assert.equal(matchesProvider('https://ru.cheapvibecode.ru/v1', ['cheapvibecode.ru']), true)
  assert.equal(matchesProvider('https://cheapvibecode.ru.evil.com/v1', ['cheapvibecode.ru']), false)
  assert.equal(matchesProvider('http://ru.cheapvibecode.ru/v1', ['cheapvibecode.ru']), false)
  assert.equal(matchesProvider('https://ru.cheapvibecode.ru/v1', []), false)
})

test('rowIdMatches узнаёт строку внутри include-группы', () => {
  assert.equal(rowIdMatches('llm-pi-ai', 'llm-pi-ai'), true)
  assert.equal(rowIdMatches('include:llm-pi-ai', 'llm-pi-ai'), true)
  assert.equal(rowIdMatches('llm-pi-ai:extra', 'llm-pi-ai'), false)
  assert.equal(rowIdMatches(undefined, 'llm-pi-ai'), false)
})

test('resolveRoutes отдаёт только маршруты CheapVibeCode', () => {
  const ctx = makeCtx({
    entries: [llmRow({
      cheapvibecode: CVC,
      funpay: { displayName: 'FunPay', baseURL: 'https://funpay.example/v1', apiKeyEnv: 'FP_KEY' },
    })],
  })
  const routes = resolveRoutes(ctx, normalizeConfig({}))
  assert.equal(routes.length, 1)
  assert.deepEqual(routes[0], {
    provider: 'cheapvibecode',
    displayName: 'CheapVibeCode',
    baseURL: 'https://ru.cheapvibecode.ru/v1',
    apiKeyEnv: 'CVC_DEEPSEEK_API_KEY',
    api: 'openai-completions',
    models: [{ id: 'm1' }],
    entryId: 'llm-pi-ai',
  })
})

test('resolveRoutes находит строку по имени пакета при чужом id', () => {
  const ctx = makeCtx({
    entries: [
      { options: { id: 'other', name: 'other-plugin', config: { providers: { x: { baseURL: 'https://cheapvibecode.ru' } } } } },
      llmRow({ cheapvibecode: CVC }, 'include:llm-pi-ai'),
    ],
  })
  const routes = resolveRoutes(ctx, normalizeConfig({}))
  assert.equal(routes.length, 1)
  assert.equal(routes[0].entryId, 'include:llm-pi-ai')
})

test('resolveRoutes уважает entryId из конфига', () => {
  const ctx = makeCtx({
    entries: [
      llmRow({ cheapvibecode: CVC }),
      llmRow({ second: { ...CVC, baseURL: 'https://alt.cheapvibecode.ru/v1' } }, 'llm-second'),
    ],
  })
  const routes = resolveRoutes(ctx, normalizeConfig({ providers: { entryId: 'llm-second' } }))
  assert.deepEqual(routes.map((route) => route.provider), ['second'])
})

test('resolveRoutes уважает providers.match', () => {
  const ctx = makeCtx({ entries: [llmRow({ cheapvibecode: CVC, alt: { baseURL: 'https://alt.example/v1' } })] })
  const routes = resolveRoutes(ctx, normalizeConfig({ providers: { match: ['alt.example'] } }))
  assert.deepEqual(routes.map((route) => route.provider), ['alt'])
})

test('resolveRoutes пуст без configEditor и без строки', () => {
  assert.deepEqual(resolveRoutes({ get: () => undefined }, normalizeConfig({})), [])
  const ctx = makeCtx({ entries: [] })
  assert.deepEqual(resolveRoutes(ctx, normalizeConfig({})), [])
})

test('resolveRoutes не принимает строку-дубль без providers', () => {
  const ctx = makeCtx({
    entries: [
      { options: { id: 'llm-pi-ai', name: LLM_ENTRY_NAME, config: {} } },
      llmRow({ cheapvibecode: CVC }),
    ],
  })
  const routes = resolveRoutes(ctx, normalizeConfig({}))
  assert.equal(routes.length, 1)
})

test('displayName по умолчанию — id маршрута', () => {
  const ctx = makeCtx({ entries: [llmRow({ route1: { baseURL: 'https://cheapvibecode.ru/v1' } })] })
  assert.equal(resolveRoutes(ctx, normalizeConfig({}))[0].displayName, 'route1')
})

test('findProviderEntry сообщает причину, когда строки нет', () => {
  const missing = findProviderEntry({}, 'llm-pi-ai')
  assert.equal(missing.entry, undefined)
  assert.match(missing.notes.join(' '), /configEditor/)
  const empty = findProviderEntry(makeCtx({ entries: [] }), 'llm-pi-ai')
  assert.match(empty.notes.join(' '), /no provider routes/)
})

test('apiKeyFor: своё имя важнее общего', () => {
  const config = normalizeConfig({ providers: { apiKeyEnv: 'GLOBAL_KEY' } })
  assert.equal(apiKeyFor({ apiKeyEnv: 'OWN_KEY' }, config), 'OWN_KEY')
  assert.equal(apiKeyFor({ apiKeyEnv: '' }, config), 'GLOBAL_KEY')
  assert.equal(apiKeyFor(undefined, config), 'GLOBAL_KEY')
})

test('pickRoute находит маршрут по имени или берёт первый', () => {
  const routes = [{ provider: 'a' }, { provider: 'b' }]
  assert.equal(pickRoute(routes, 'b').provider, 'b')
  assert.equal(pickRoute(routes, 'missing').provider, 'a')
  assert.equal(pickRoute([], 'a'), undefined)
})

test('resolveKey отдаёт значение из credentials', async () => {
  const ctx = makeCtx({ credentials: { resolve: async (ref) => ({ value: `key-for-${ref}` }) } })
  assert.equal(await resolveKey(ctx, 'CVC_DEEPSEEK_API_KEY'), 'key-for-CVC_DEEPSEEK_API_KEY')
})

test('resolveKey молчит, когда сервиса нет, ссылка пуста или resolve бросает', async () => {
  assert.equal(await resolveKey(makeCtx({}), 'KEY'), '')
  const throwing = makeCtx({ credentials: { resolve: async () => { throw new Error('boom') } } })
  assert.equal(await resolveKey(throwing, 'KEY'), '')
  const noValue = makeCtx({ credentials: { resolve: async () => ({ value: 42 }) } })
  assert.equal(await resolveKey(noValue, 'KEY'), '')
  const withKey = makeCtx({ credentials: { resolve: async () => ({ value: 'v' }) } })
  assert.equal(await resolveKey(withKey, '  '), '')
})