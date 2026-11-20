/**
 * Инструмент `cvc_catalog`: описание, схема вывода, status/plan/apply на
 * фейковом `ctx.configEditor`, понятная ошибка при выключенной функции.
 *
 * Запуск: node --test test/catalog-tool.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { register, TOOL_NAME, tool } from '../lib/catalog-sync.js'
import { CATALOG, makeEditor, makeHarness, model } from './helpers/catalog-sync.mjs'

/**
 * Поднять движок и вернуть описание инструмента.
 * @param {ReturnType<typeof makeHarness>} harness
 */
function mount(harness) {
  const dispose = register(harness.ctx, harness.deps)
  const spec = tool(harness.deps)
  return { dispose, spec }
}

/** Выполнить действие инструмента. */
function execute(spec, args, exec = { signal: new AbortController().signal }) {
  return spec.execute(args, exec)
}

test('описание инструмента: имя, параметры и выходная схема как в 1.0.0', () => {
  const harness = makeHarness({ editor: makeEditor({ models: [] }) })
  const { spec } = mount(harness)
  assert.equal(spec.name, TOOL_NAME)
  assert.equal(spec.name, 'cvc_catalog')
  assert.match(spec.description, /CheapVibeCode/)
  assert.deepEqual(spec.parameters.properties.action.enum, ['status', 'plan', 'apply'])
  assert.equal(spec.parameters.additionalProperties, false)
  assert.equal(spec.parameters.properties.force.type, 'boolean')
  assert.equal(spec.output.schema.type, 'object')
  assert.deepEqual(spec.output.schema.required, [
    'action', 'ok', 'at', 'provider', 'catalogModels', 'currentModels', 'nextModels',
    'levelsSource', 'applied', 'added', 'removed', 'changed', 'warnings', 'allowlist', 'error',
  ])
  assert.equal(spec.output.schema.additionalProperties, false)
  assert.equal(spec.timeoutMs, 90000)
  assert.equal(typeof spec.execute, 'function')
})

test('инструмент называется cvc_catalog даже без register (временный движок)', () => {
  const harness = makeHarness({ editor: makeEditor({ models: [] }) })
  const spec = tool(harness.deps)
  assert.equal(spec.name, 'cvc_catalog')
  assert.equal(typeof spec.execute, 'function')
})

test('status без прогона: честная заготовка без сети', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')] }) })
  const { spec } = mount(harness)
  const value = await execute(spec, { action: 'status' })
  assert.equal(value.action, 'status')
  assert.equal(value.ok, true)
  assert.equal(value.currentModels, 1)
  assert.equal(value.catalogModels, 0)
  assert.match(value.warnings.join(' '), /no refresh has run in this process yet/)
  assert.equal(harness.calls.cacheGet, 0, 'status не ходит в сеть')
})

test('status после plan отдаёт итог последнего прогона', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  const { spec } = mount(harness)
  await execute(spec, { action: 'plan' })
  const value = await execute(spec, { action: 'status' })
  assert.equal(value.action, 'status')
  assert.deepEqual([...value.added].sort(), ['m-a', 'm-b'])
  assert.equal(value.catalogModels, 2)
  assert.equal(harness.calls.cacheGet, 1)
})

test('plan через инструмент не пишет файл и возвращает дифф', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  const { spec } = mount(harness)
  const value = await execute(spec, { action: 'plan' })
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, false)
  assert.deepEqual(value.removed, ['old'])
  assert.equal(harness.state.writes, 0)
})

test('apply через инструмент пишет модели и allowlist', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
  const { spec } = mount(harness)
  const value = await execute(spec, { action: 'apply' })
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, true)
  assert.equal(harness.state.writes, 2)
  assert.deepEqual(
    harness.modelEntry.options.config.providers.cheapvibecode.models.map((entry) => entry.id),
    ['m-a', 'm-b'],
  )
})

test('apply дважды: второй раз «no difference», файл не тронут', async () => {
  const harness = makeHarness({
    editor: makeEditor({
      models: [
        model('m-a', { name: 'Model A', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }),
        model('m-b', { name: 'Model B', contextWindow: 2000, maxTokens: 500, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' } }),
      ],
      allowlist: [{ provider: 'cheapvibecode', model: 'm-a' }, { provider: 'cheapvibecode', model: 'm-b' }],
    }),
  })
  const { spec } = mount(harness)
  const value = await execute(spec, { action: 'apply' })
  assert.equal(value.ok, true)
  assert.equal(value.applied, false)
  assert.equal(harness.state.writes, 0)
  const rendered = spec.output.render({ action: 'apply' }, value)
  assert.equal(rendered.length, 1)
  assert.match(rendered[0].text, /catalog: no difference/)
})

test('guard: инструмент отказывает без force и пишет с force', async () => {
  const current = []
  for (let index = 0; index < 10; index += 1) current.push(model(`m-${index}`))
  const harness = makeHarness({
    editor: makeEditor({ models: current, allowlist: [] }),
    catalog: [{ id: 'only', display_name: 'Only', context_window: 1000, max_output_tokens: 100 }],
    levels: { levels: {} },
  })
  const { spec } = mount(harness)
  const refused = await execute(spec, { action: 'apply' })
  assert.equal(refused.ok, false)
  assert.match(refused.error, /guard:/)
  assert.equal(harness.state.writes, 0)
  assert.match(spec.output.render({}, refused)[0].text, /error: guard:/)

  const forced = await execute(spec, { action: 'apply', force: true })
  assert.equal(forced.ok, true, forced.error)
  assert.equal(forced.applied, true)
  assert.match(forced.warnings.join(' '), /force: model-count guard bypassed/)
})

test('stale каталог: plan — предупреждение, apply — отказ, force пишет', async () => {
  const harness = makeHarness({
    editor: makeEditor({ models: [model('old')], allowlist: [] }),
    catalogState: { stale: true, error: 'GET /models: HTTP 503' },
  })
  const { spec } = mount(harness)
  const plan = await execute(spec, { action: 'plan' })
  assert.equal(plan.ok, true)
  assert.match(plan.warnings.join(' '), /catalog is stale/)

  const refused = await execute(spec, { action: 'apply' })
  assert.equal(refused.ok, false)
  assert.match(refused.error, /catalog is stale/)
  assert.equal(harness.state.writes, 0)

  const forced = await execute(spec, { action: 'apply', force: true })
  assert.equal(forced.ok, true, forced.error)
  assert.match(forced.warnings.join(' '), /force: stale catalog applied/)
})

test('execute при выключенной функции возвращает понятную ошибку и не ходит в сеть', async () => {
  const harness = makeHarness({
    config: { features: { catalogSync: false }, catalog: { autoSync: false } },
    editor: makeEditor({ models: [model('old')] }),
  })
  // Как в гонке с volatile-правкой: движок ещё поднят, но функция уже выключена.
  const { spec } = mount(harness)
  for (const action of ['status', 'plan', 'apply']) {
    const value = await execute(spec, { action })
    assert.equal(value.ok, false, action)
    assert.equal(value.action, action)
    assert.match(value.error, /catalog sync is disabled in settings/)
    assert.equal(harness.calls.cacheGet, 0)
    assert.equal(harness.state.writes, 0)
  }
})

test('execute без регистрации функции на объекте deps тоже отвечает отказом', async () => {
  const harness = makeHarness({ config: { features: { catalogSync: false } } })
  const spec = tool(harness.deps)
  const value = await execute(spec, { action: 'plan' })
  assert.equal(value.ok, false)
  assert.match(value.error, /features\.catalogSync=false/)
})

test('неизвестное действие считается status (как в 1.0.0)', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')] }) })
  const { spec } = mount(harness)
  const value = await execute(spec, { action: 'nonsense' })
  assert.equal(value.action, 'status')
  assert.equal(harness.calls.cacheGet, 0)
})

test('render печатает дифф, allowlist и предупреждения', () => {
  const harness = makeHarness({ editor: makeEditor({ models: [] }) })
  const { spec } = mount(harness)
  const text = spec.output.render({}, {
    action: 'apply',
    provider: 'cheapvibecode',
    catalogModels: 2,
    currentModels: 1,
    nextModels: 2,
    levelsSource: 'https://example.test/idhw',
    applied: true,
    added: ['m-b'],
    removed: ['old'],
    changed: [{ id: 'm-a', fields: ['maxTokens', 'name'] }],
    warnings: ['keepModels: "x" is neither in the catalog nor in the patch'],
    allowlist: { pruned: ['old'], added: ['m-b'], skipped: false, changed: true },
    error: '',
  })[0].text
  assert.match(text, /^apply: cheapvibecode — catalog 2, current 1, next 2; levels: https:\/\/example\.test\/idhw; applied/)
  assert.match(text, /added: m-b/)
  assert.match(text, /removed: old/)
  assert.match(text, /changed: m-a \(maxTokens\/name\)/)
  assert.match(text, /allowlist pruned: old/)
  assert.match(text, /allowlist added: m-b/)
  assert.match(text, /warning: keepModels/)
})

test('render: нет диффа — строка «catalog: no difference», ошибка последней', () => {
  const harness = makeHarness({ editor: makeEditor({ models: [] }) })
  const { spec } = mount(harness)
  const text = spec.output.render({}, {
    action: 'plan',
    provider: 'cheapvibecode',
    catalogModels: 0,
    currentModels: 0,
    nextModels: 0,
    levelsSource: 'none',
    applied: false,
    added: [],
    removed: [],
    changed: [],
    warnings: [],
    allowlist: { pruned: [], added: [], skipped: true, changed: false },
    error: 'catalog returned no models',
  })[0].text
  const lines = text.split('\n')
  assert.equal(lines[1], 'catalog: no difference')
  assert.equal(lines.at(-1), 'error: catalog returned no models')
})

test('ключ никогда не попадает ни в ответ, ни в лог', async () => {
  const harness = makeHarness({
    editor: makeEditor({ models: [model('old')], allowlist: [] }),
    catalogState: { throws: new Error('GET /models: HTTP 401') },
  })
  const { spec } = mount(harness)
  const value = await execute(spec, { action: 'apply' })
  const dump = JSON.stringify(value)
  assert.equal(dump.includes('test-key'), false)
  assert.equal(dump.includes('Bearer'), false)
  const logs = JSON.stringify(harness.calls.logs)
  assert.equal(logs.includes('test-key'), false)
  assert.equal(logs.includes('Bearer'), false)
})

test('без tools-реестра инструмент — просто описание, регистрация не нужна', () => {
  const harness = makeHarness({ editor: makeEditor({ models: [] }) })
  const { dispose, spec } = mount(harness)
  assert.equal(typeof dispose, 'function')
  assert.equal(spec.name, 'cvc_catalog')
  dispose()
  assert.equal(harness.routes.has('run'), false)
})

test('параллельные execute: удалённый каталог виден обоим', async () => {
  const harness = makeHarness({ editor: makeEditor({ models: [model('old')], allowlist: [] }), catalog: CATALOG })
  const { spec } = mount(harness)
  const [first, second] = await Promise.all([
    execute(spec, { action: 'plan' }),
    execute(spec, { action: 'plan' }),
  ])
  assert.equal(first.catalogModels, 2)
  assert.deepEqual(first.added, second.added)
  assert.equal(harness.calls.cacheGet, 1)
})