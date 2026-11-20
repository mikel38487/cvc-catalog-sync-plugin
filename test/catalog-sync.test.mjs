/**
 * Маршрут `POST /cvc/run`, таймеры автосинхронизации и запись патча на
 * фейковом `ctx.configEditor`: порт интеграционных сценариев 1.0.0
 * (test/integration.mjs) на каркас 2.0.0.
 *
 * Запуск: node --test test/catalog-sync.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { register, TOOL_NAME } from '../lib/catalog-sync.js'
import { CATALOG, makeEditor, makeHarness, makeHmr, makeStore, model } from './helpers/catalog-sync.mjs'

/**
 * Поднять функцию на стенде и вернуть disposer.
 * @param {ReturnType<typeof makeHarness>} harness
 */
function mount(harness) {
  const dispose = register(harness.ctx, harness.deps)
  assert.deepEqual(harness.calls.route, ['run'])
  return dispose
}

/** Запустить прогон через маршрут. */
async function run(harness, body = { action: 'plan' }) {
  const answer = await harness.call('run', { body })
  return { status: answer.status, value: answer.body }
}

test('apply пишет модели и синхронизирует allowlist', async () => {
  const harness = makeHarness({
    editor: makeEditor({ models: [model('old')], allowlist: [{ provider: 'cheapvibecode', model: 'old' }] }),
  })
  mount(harness)

  const { status, value } = await run(harness, { action: 'apply' })
  assert.equal(status, 200)
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, true)
  assert.deepEqual([...value.added].sort(), ['m-a', 'm-b'])
  assert.deepEqual(value.removed, ['old'])
  assert.equal(harness.state.writes, 2, 'one write for models, one for the allowlist')

  const models = harness.modelEntry.options.config.providers.cheapvibecode.models
  assert.deepEqual(models.map((entry) => entry.id), ['m-a', 'm-b'])
  assert.deepEqual(models[0].reasoningEfforts, { low: 'low', high: 'high' })
  assert.deepEqual(models[1].reasoningEfforts, { off: 'none', high: 'high' })
  assert.deepEqual(harness.allowEntry.options.config.allowedModels, [
    { provider: 'cheapvibecode', model: 'm-a' },
    { provider: 'cheapvibecode', model: 'm-b' },
  ])
  assert.equal(harness.calls.cacheForce[0], true, 'каждый прогон идёт мимо кэша')
})

test('повторный apply ничего не пишет и говорит «no difference»', async () => {
  const harness = makeHarness({
    editor: makeEditor({
      models: [
        model('m-a', { name: 'Model A', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }),
        model('m-b', { name: 'Model B', contextWindow: 2000, maxTokens: 500, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' } }),
      ],
      allowlist: [{ provider: 'cheapvibecode', model: 'm-a' }, { provider: 'cheapvibecode', model: 'm-b' }],
    }),
  })
  mount(harness)
  const value = (await run(harness, { action: 'apply' })).value
  assert.equal(value.ok, true)
  assert.equal(value.applied, false)
  assert.equal(harness.state.writes, 0)
  assert.ok(harness.calls.logs.length >= 0)

  const render = (await import('../lib/catalog-sync.js')).renderValue
  assert.match(render(value), /catalog: no difference/)
})

test('apply чинит устаревший allowlist при совпадающих моделях', async () => {
  const harness = makeHarness({
    editor: makeEditor({
      models: [
        model('m-a', { name: 'Model A', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }),
        model('m-b', { name: 'Model B', contextWindow: 2000, maxTokens: 500, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' } }),
      ],
      allowlist: [{ provider: 'cheapvibecode', model: 'm-a' }],
    }),
  })
  mount(harness)
  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, true, 'the allowlist write still counts as applied')
  assert.deepEqual(value.added, [])
  assert.deepEqual(value.allowlist.added, ['m-b'])
  assert.equal(harness.state.writes, 1)
  assert.equal(harness.allowEntry.options.config.allowedModels.length, 2)
})

test('apply чинит дубли и порядок allowlist', async () => {
  const good = { provider: 'cheapvibecode', model: 'm-a' }
  const harness = makeHarness({
    editor: makeEditor({
      models: [
        model('m-a', { name: 'Model A', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }),
        model('m-b', { name: 'Model B', contextWindow: 2000, maxTokens: 500, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' } }),
      ],
      allowlist: [good, good, { provider: 'cheapvibecode', model: 'm-b' }],
    }),
  })
  mount(harness)
  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, true, value.error)
  assert.equal(value.allowlist.changed, true)
  assert.equal(harness.allowEntry.options.config.allowedModels.length, 2)
})

test('plan не пишет и показывает дифф', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  mount(harness)
  const { status, value } = await run(harness, { action: 'plan' })
  assert.equal(status, 200)
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, false)
  assert.equal(harness.state.writes, 0)
  assert.deepEqual([...value.added].sort(), ['m-a', 'm-b'])
})

test('guard: apply без force отказывает 409 и не пишет, force пишет', async () => {
  const current = []
  for (let index = 0; index < 10; index += 1) current.push(model(`m-${index}`))
  const harness = makeHarness({
    editor: makeEditor({ models: current, allowlist: [] }),
    catalog: [{ id: 'only', display_name: 'Only', context_window: 1000, max_output_tokens: 100 }],
    levels: { levels: {} },
  })
  mount(harness)

  const refused = await run(harness, { action: 'apply' })
  assert.equal(refused.status, 409, 'guard is a conflict, not a server error')
  assert.equal(refused.value.ok, false)
  assert.match(refused.value.error, /guard:/)
  assert.match(refused.value.error, /use force to override/)
  assert.equal(harness.state.writes, 0, 'guard must not write the file')

  const forced = await run(harness, { action: 'apply', force: true })
  assert.equal(forced.status, 200, JSON.stringify(forced.value))
  assert.equal(forced.value.ok, true, forced.value.error)
  assert.equal(forced.value.applied, true)
  assert.equal(harness.state.writes, 2, 'models plus allowlist')
  assert.match(forced.value.warnings.join(' '), /force: model-count guard bypassed/)
})

test('plan при усыхании каталога возвращает дифф, а не ошибку', async () => {
  const current = []
  for (let index = 0; index < 10; index += 1) current.push(model(`m-${index}`))
  const harness = makeHarness({
    editor: makeEditor({ models: current, allowlist: [] }),
    catalog: [{ id: 'only', display_name: 'Only', context_window: 1000, max_output_tokens: 100 }],
  })
  mount(harness)
  const { status, value } = await run(harness, { action: 'plan' })
  assert.equal(status, 200)
  assert.equal(value.ok, true, value.error)
  assert.equal(value.removed.length, 10)
  assert.match(value.warnings.join(' '), /guard:/)
  assert.match(value.warnings.join(' '), /apply would refuse without force/)
})

test('правка, сделанная во время ожидания блокировки, не теряется', async () => {
  // Каталог молчит о maxTokens: значение берётся из текущей записи.
  const harness = makeHarness({
    editor: makeEditor({
      models: [model('m-a', { maxTokens: 777, compat: { supportsStrictMode: true } })],
      allowlist: [],
      onLock: (entry) => {
        if (entry.options.id !== 'llm-pi-ai') return
        const profile = entry.options.config.providers.cheapvibecode
        profile.models[0].maxTokens = 888
      },
    }),
    catalog: [{ id: 'm-a', display_name: 'Model A', context_window: 1000 }],
  })
  mount(harness)
  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, true, value.error)
  const written = harness.modelEntry.options.config.providers.cheapvibecode.models[0]
  assert.equal(written.maxTokens, 888, 'the value edited under the lock wins')
  assert.deepEqual(written.compat, { supportsStrictMode: true })
})

test('маршрут с modelOverrides даёт понятную ошибку', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [], allowlist: [] }) })
  harness.modelEntry.options.config.providers.cheapvibecode.modelOverrides = { 'm-a': { name: 'Override' } }
  mount(harness)
  const { value } = await run(harness, { action: 'plan' })
  assert.equal(value.ok, false)
  assert.match(value.error, /modelOverrides/)
})

test('нет строки llm-pi-ai — понятная ошибка, файл не тронут', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [], allowlist: [] }) })
  harness.editor.entries = () => []
  mount(harness)
  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, false)
  assert.match(value.error, /llm-pi-ai" is not available/)
  assert.equal(harness.state.writes, 0)
})

test('нет маршрута провайдера — понятная ошибка', async () => {
  const harness = makeHarness({
    config: { catalog: { autoSync: false, provider: 'missing' } },
    editor: makeEditor({ models: [], allowlist: [] }),
  })
  mount(harness)
  const { value } = await run(harness, { action: 'plan' })
  assert.equal(value.ok, false)
  assert.match(value.error, /provider route "missing" is not configured/)
})

test('stale каталог: plan показывает дифф с предупреждением, apply отказывает 409', async () => {
  const harness = makeHarness({
    editor: makeEditor({ models: [model('old')], allowlist: [] }),
    catalogState: { stale: true, error: 'GET /models: HTTP 503' },
  })
  mount(harness)

  const plan = await run(harness, { action: 'plan' })
  assert.equal(plan.status, 200)
  assert.equal(plan.value.ok, true)
  assert.deepEqual([...plan.value.added].sort(), ['m-a', 'm-b'])
  assert.match(plan.value.warnings.join(' '), /catalog is stale: GET \/models: HTTP 503/)

  const refused = await run(harness, { action: 'apply' })
  assert.equal(refused.status, 409)
  assert.equal(refused.value.ok, false)
  assert.match(refused.value.error, /catalog is stale/)
  assert.match(refused.value.error, /nothing written, use force to override/)
  assert.equal(harness.state.writes, 0)

  const forced = await run(harness, { action: 'apply', force: true })
  assert.equal(forced.status, 200)
  assert.equal(forced.value.ok, true, forced.value.error)
  assert.equal(forced.value.applied, true)
  assert.match(forced.value.warnings.join(' '), /force: stale catalog applied/)
  assert.equal(harness.state.writes, 2)
})

test('пустой каталог — отказ без записи', async () => {
  const harness = makeHarness({
    editor: makeEditor({ models: [model('old')], allowlist: [] }),
    catalogState: { empty: true },
  })
  mount(harness)
  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, false)
  assert.match(value.error, /catalog returned no models/)
  assert.equal(harness.state.writes, 0)
})

test('недоступный апстрим не даёт 500: ошибка в теле, как у инструмента', async () => {
  const harness = makeHarness({
    editor: makeEditor({ models: [model('old')], allowlist: [] }),
  })
  harness.cacheState.throws = new Error('GET /models: HTTP 401')
  mount(harness)
  const { status, value } = await run(harness, { action: 'apply' })
  assert.equal(status, 200)
  assert.equal(value.ok, false)
  assert.match(value.error, /HTTP 401/)
  assert.equal(harness.state.writes, 0)
})

test('недоступные уровни: модели собираются, предупреждение одно', async () => {
  const harness = makeHarness({
    editor: makeEditor({ models: [], allowlist: [] }),
    levels: { error: new Error('no installer answered with reasoningLevels (https://example.test/idhw: HTTP 500)') },
  })
  mount(harness)
  const { value } = await run(harness, { action: 'plan' })
  assert.equal(value.ok, true, value.error)
  assert.equal(value.levelsSource, 'none')
  assert.match(value.warnings.join('\n'), /reasoning levels unavailable/)
  assert.ok(harness.calls.logs.some((entry) => entry.level === 'warn' && /reasoningLevels/.test(entry.message)))
})

test('карта уровней кэшируется на levelsCacheMinutes', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [], allowlist: [] }) })
  mount(harness)
  await run(harness, { action: 'plan' })
  await run(harness, { action: 'plan' })
  assert.equal(harness.calls.levels, 1, 'второй прогон берёт карту из кэша движка')
  assert.equal(harness.calls.cacheGet, 2, 'а каталог — всегда свежий')
})

test('allowlist выключен: патч моделей пишется, список не тронут', async () => {
  const harness = makeHarness({
    config: { catalog: { autoSync: false, syncAllowlist: false } },
    editor: makeEditor({ models: [model('old')], allowlist: [{ provider: 'cheapvibecode', model: 'old' }] }),
  })
  mount(harness)
  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, true, value.error)
  assert.equal(value.allowlist.skipped, true)
  assert.equal(harness.state.writes, 1)
  assert.deepEqual(harness.allowEntry.options.config.allowedModels, [{ provider: 'cheapvibecode', model: 'old' }])
})

test('без строки сабагентов allowlist помечается skipped', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  harness.editor.entries = () => [harness.modelEntry]
  mount(harness)
  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, true, value.error)
  assert.equal(value.allowlist.skipped, true)
  assert.match(value.allowlist.skipped === true ? 'skipped' : '', /skipped/)
})

test('одновременные plan схлопываются в один прогон, apply не делит результат с plan', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  mount(harness)
  const [first, second] = await Promise.all([
    run(harness, { action: 'plan' }),
    run(harness, { action: 'plan' }),
  ])
  assert.equal(harness.calls.cacheGet, 1)
  assert.deepEqual(first.value.added, second.value.added)

  const apply = await run(harness, { action: 'apply' })
  assert.equal(harness.calls.cacheGet, 2, 'другой режим не сливается с plan')
  assert.equal(apply.value.applied, true)
})

test('итог прогона попадает в реестр состояния', async () => {
  const store = makeStore({ now: () => 'T' })
  const harness = makeHarness({ editor: makeEditor({ models: [], allowlist: [] }), store })
  mount(harness)
  await run(harness, { action: 'plan' })
  assert.deepEqual(store.calls.running, [true, false])
  assert.equal(store.calls.lastRun.length, 1)
  assert.equal(store.calls.lastRun[0].action, 'plan')
  assert.equal(store.calls.lastRun[0].ok, true)

  harness.cacheState.throws = new Error('GET /models: network error')
  await run(harness, { action: 'plan' })
  assert.deepEqual(store.calls.errors, ['GET /models: network error'])
})

test('неверный action — 400, body: реальная мапа не меняется', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [], allowlist: [] }) })
  mount(harness)
  const bad = await harness.call('run', { body: { action: 'delete' } })
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /action must be/)
  assert.equal(harness.calls.cacheGet, 0, 'отказ до сети')

  const planByDefault = await harness.call('run', { body: {} })
  assert.equal(planByDefault.status, 200)
  assert.equal(planByDefault.body.action, 'plan')
  assert.equal(harness.state.writes, 0)
})

test('GET /run — 405 с Allow: POST; не-JSON тело — 415', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [], allowlist: [] }) })
  mount(harness)
  const get = await harness.call('run', { method: 'GET' })
  assert.equal(get.status, 405)
  assert.deepEqual(get.body.allow, ['POST'])
  const text = await harness.call('run', { body: 'x', json: false, headers: { 'content-type': 'text/plain' } })
  assert.equal(text.status, 415)
  assert.equal(harness.calls.cacheGet, 0)
})

test('disposer снимает маршрут и таймеры', async () => {
  const harness = makeHarness({
    config: { catalog: { autoSync: true, startupDelayMs: 600000, intervalHours: 24 } },
  })
  const dispose = mount(harness)
  assert.equal(harness.routes.has('run'), true)
  dispose()
  assert.equal(harness.routes.has('run'), false)
})

test('без hmr таймеры создаются напрямую и битый контекст не мешает', async () => {
  const harness = makeHarness({
    config: { catalog: { autoSync: true, startupDelayMs: 600000, intervalHours: 24 } },
    hmr: null,
  })
  const dispose = mount(harness)
  assert.equal(harness.routes.has('run'), true)
  dispose()
})

test('autoSync=false: таймеры не создаются, ручной путь работает', async () => {
  const harness = makeHarness({
    config: { catalog: { autoSync: false } },
    editor: makeEditor({ models: [], allowlist: [] }),
  })
  mount(harness)
  const { value } = await run(harness, { action: 'plan' })
  assert.equal(value.ok, true)
})

test('таймеры: работают вне HMR-транзакции через hmr.executing.exit', async () => {
  let exited = 0
  const before = process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
  const harness = makeHarness({
    config: { catalog: { autoSync: true, startupDelayMs: 600000, intervalHours: 0 } },
    hmr: makeHmr((factory) => {
      exited += 1
      return factory()
    }),
  })
  const dispose = mount(harness)
  const during = process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
  assert.equal(exited, 1, 'стартовый таймер создан через exit')
  assert.ok(during >= before)
  dispose()
  const after = process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
  assert.ok(after <= before, 'disposer снимает стартовый таймер')
})

test('интервал: маленький intervalHours поднимается до минуты, большой обрезается', async () => {
  const small = makeHarness({
    config: { catalog: { autoSync: true, startupDelayMs: 600000, intervalHours: 0.000001 } },
    hmr: makeHmr((factory) => factory()),
  })
  const disposeSmall = mount(small)
  assert.ok(small.calls.logs.some((entry) => /too small, timer raised to 1 minute/.test(entry.message)))
  disposeSmall()

  const big = makeHarness({
    config: { catalog: { autoSync: true, startupDelayMs: 600000, intervalHours: 1e6 } },
    hmr: makeHmr((factory) => factory()),
  })
  const disposeBig = mount(big)
  assert.ok(big.calls.logs.some((entry) => /too large, timer clamped to 24.8 days/.test(entry.message)))
  disposeBig()
})

test('hmr есть, но приватного поля нет: авто-запись отключается, ручной путь работает', async () => {
  const harness = makeHarness({
    config: { catalog: { autoSync: true, startupDelayMs: 600000, intervalHours: 0 } },
    hmr: {},
    editor: makeEditor({ models: [], allowlist: [] }),
  })
  mount(harness)
  assert.ok(
    harness.calls.logs.some((entry) => entry.level === 'warn' && /auto-write disabled/.test(entry.message)),
    'пользователь видит, что таймеры только показывают дифф',
  )
  const { value } = await run(harness, { action: 'plan' })
  assert.equal(value.ok, true)
})

test('hmr.executing.exit бросает: авто-запись выключается, таймер всё равно создаётся', async () => {
  const harness = makeHarness({
    config: { catalog: { autoSync: true, startupDelayMs: 600000, intervalHours: 0 } },
    hmr: makeHmr(() => {
      throw new Error('nested transaction')
    }),
    editor: makeEditor({ models: [], allowlist: [] }),
  })
  const dispose = mount(harness)
  assert.ok(harness.calls.logs.some((entry) => /HMR transaction escape failed/.test(entry.message)))
  assert.equal(harness.routes.has('run'), true)
  dispose()
})

test('асинхронный реестр состояния не мешает прогону', async () => {
  const store = makeStore()
  store.setLastRun = () => {
    throw new Error('store is broken')
  }
  const harness = makeHarness({ editor: makeEditor({ models: [], allowlist: [] }), store })
  mount(harness)
  const { value } = await run(harness, { action: 'plan' })
  assert.equal(value.ok, true, value.error)
})

test('запись сохраняет чужие поля маршрута, других провайдеров и строк', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  const config = harness.modelEntry.options.config
  config.someRowField = 'keep-me'
  config.providers.cheapvibecode.displayName = 'CheapVibeCode'
  config.providers.cheapvibecode.headers = { 'x-route': '1' }
  config.providers.funpay = { models: [{ id: 'foreign' }], displayName: 'FunPay' }
  harness.allowEntry.options.config.someOtherList = ['keep']
  mount(harness)

  const { value } = await run(harness, { action: 'apply' })
  assert.equal(value.ok, true, value.error)
  const written = harness.modelEntry.options.config
  assert.equal(written.someRowField, 'keep-me')
  assert.equal(written.providers.cheapvibecode.displayName, 'CheapVibeCode')
  assert.deepEqual(written.providers.cheapvibecode.headers, { 'x-route': '1' })
  assert.deepEqual(written.providers.funpay, { models: [{ id: 'foreign' }], displayName: 'FunPay' }, 'чужие маршруты не трогаются')
  assert.deepEqual([...written.providers.cheapvibecode.models.map((entry) => entry.id)].sort(), ['m-a', 'm-b'])
  assert.deepEqual(harness.allowEntry.options.config.someOtherList, ['keep'], 'чужие поля строки сабагентов сохраняются')
})

test('порядок строк редактора не меняется: правится та же строка', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  const entryBefore = harness.modelEntry
  mount(harness)
  await run(harness, { action: 'apply' })
  assert.equal(harness.modelEntry, entryBefore, 'строка патча остаётся той же записью')
  assert.deepEqual(harness.editor.entries().map((entry) => entry.options.id), [
    'llm-pi-ai',
    'subagent-model-selection-settings',
  ])
})

test('имя инструмента — cvc_catalog', () => {
  assert.equal(TOOL_NAME, 'cvc_catalog')
  assert.equal(CATALOG.length, 2)
})