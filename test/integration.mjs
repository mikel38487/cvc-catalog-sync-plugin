/**
 * Интеграционная проверка хостовой половины плагина на поддельном `ctx`.
 *
 * Настоящий профиль DSH не читается и не пишется: `configEditor` имитирует
 * контракт DSH — `edit` отдаёт конфиг **на момент блокировки**, после
 * асинхронной паузы, поэтому плагин обязан собирать модели из этого значения,
 * а не из снимка, прочитанного до неё.
 *
 * Запуск: node --test test/integration.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { apply } = await import(new URL('../index.js', import.meta.url).href)

const INSTALLER = 'const reasoningLevels = {"m-a":["low","high"],"m-b":["none","high"]};'

/** Ответы поддельной сети. */
function installFetch(catalog, installerText = INSTALLER) {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).endsWith('/models')) {
      return { ok: true, status: 200, json: async () => ({ data: catalog }) }
    }
    return { ok: true, status: 200, text: async () => installerText }
  }
  return calls
}

/** Поддельный configEditor с контрактом «current на момент блокировки». */
function makeEditor({ models, allowlist, onLock }) {
  const modelEntry = { options: { id: 'llm-pi-ai', config: { providers: { cheapvibecode: { models } } } }, fiber: { state: 'active' } }
  const allowEntry = { options: { id: 'subagent-model-selection-settings', config: { allowedModels: allowlist } }, fiber: { state: 'active' } }
  const state = { writes: 0, lastEntry: null }
  const editor = {
    entries: () => [modelEntry, allowEntry],
    async edit(entry, change) {
      // Асинхронная пауза = ожидание файловой блокировки в DSH.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (onLock !== undefined) onLock(entry)
      const current = structuredClone(entry.options.config)
      const next = change(current, {})
      entry.options.config = next
      state.writes += 1
      state.lastEntry = entry.options.id
    },
  }
  return { editor, state, modelEntry, allowEntry }
}

function makeCtx(editor) {
  const tools = { definitions: [], register(definition) { this.definitions.push(definition); return () => {} } }
  return {
    logger: { info() {}, warn() {} },
    credentials: { resolve: async () => ({ value: 'test-key', source: 'test' }) },
    configEditor: editor,
    tools,
    get: () => undefined,
    inject() {},
    effect(callback) { return callback() },
  }
}

const model = (id, extra = {}) => ({
  id, name: id, contextWindow: 1000, maxTokens: 100, input: ['text'], reasoningEfforts: false, ...extra,
})

/** Прогнать действие инструмента. */
async function run(ctx, action, extra = {}) {
  const definition = ctx.tools.definitions.find((entry) => entry.name === 'cvc_catalog')
  assert.ok(definition, 'tool cvc_catalog is registered')
  return definition.execute({ action, ...extra }, { signal: new AbortController().signal })
}

const CATALOG = [
  { id: 'm-a', display_name: 'Vendor · Model A', context_window: 1000, max_output_tokens: 100, supports_vision: true, supports_reasoning: true },
  { id: 'm-b', display_name: 'Vendor · Model B', context_window: 2000, max_output_tokens: 500, supports_vision: false, supports_reasoning: true },
]

test('apply пишет модели и синхронизирует allowlist', async () => {
  installFetch(CATALOG)
  const { editor, state, modelEntry, allowEntry } = makeEditor({
    models: [model('old')],
    allowlist: [{ provider: 'cheapvibecode', model: 'old' }],
  })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })

  const value = await run(ctx, 'apply')
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, true)
  assert.deepEqual(value.added.sort(), ['m-a', 'm-b'])
  assert.deepEqual(value.removed, ['old'])
  assert.equal(state.writes, 2, 'one write for models, one for the allowlist')

  const models = modelEntry.options.config.providers.cheapvibecode.models
  assert.deepEqual(models.map((entry) => entry.id), ['m-a', 'm-b'])
  assert.deepEqual(models[0].reasoningEfforts, { low: 'low', high: 'high' })
  assert.deepEqual(models[1].reasoningEfforts, { off: 'none', high: 'high' })
  assert.deepEqual(allowEntry.options.config.allowedModels, [
    { provider: 'cheapvibecode', model: 'm-a' },
    { provider: 'cheapvibecode', model: 'm-b' },
  ])
})

test('повторный apply ничего не пишет', async () => {
  installFetch(CATALOG)
  const { editor, state } = makeEditor({
    models: [model('m-a', { name: 'Model A', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }),
      model('m-b', { name: 'Model B', contextWindow: 2000, maxTokens: 500, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' } })],
    allowlist: [{ provider: 'cheapvibecode', model: 'm-a' }, { provider: 'cheapvibecode', model: 'm-b' }],
  })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })
  const value = await run(ctx, 'apply')
  assert.equal(value.ok, true)
  assert.equal(value.applied, false)
  assert.equal(state.writes, 0)
})

test('apply чинит устаревший allowlist при совпадающих моделях', async () => {
  installFetch(CATALOG)
  const { editor, state, allowEntry } = makeEditor({
    models: [model('m-a', { name: 'Model A', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }),
      model('m-b', { name: 'Model B', contextWindow: 2000, maxTokens: 500, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' } })],
    allowlist: [{ provider: 'cheapvibecode', model: 'm-a' }],
  })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })
  const value = await run(ctx, 'apply')
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, true, 'the allowlist write still counts as applied')
  assert.deepEqual(value.added, [])
  assert.deepEqual(value.allowlist.added, ['m-b'])
  assert.equal(state.writes, 1)
  assert.equal(allowEntry.options.config.allowedModels.length, 2)
})

test('apply чинит дубли и порядок allowlist', async () => {
  installFetch(CATALOG)
  const good = { provider: 'cheapvibecode', model: 'm-a' }
  const { editor, allowEntry } = makeEditor({
    models: [model('m-a', { name: 'Model A', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' } }),
      model('m-b', { name: 'Model B', contextWindow: 2000, maxTokens: 500, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' } })],
    allowlist: [good, good, { provider: 'cheapvibecode', model: 'm-b' }],
  })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })
  const value = await run(ctx, 'apply')
  assert.equal(value.ok, true, value.error)
  assert.equal(value.allowlist.changed, true)
  assert.equal(allowEntry.options.config.allowedModels.length, 2)
})

test('plan не пишет и показывает дифф', async () => {
  installFetch(CATALOG)
  const { editor, state } = makeEditor({ models: [model('old')], allowlist: [] })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })
  const value = await run(ctx, 'plan')
  assert.equal(value.ok, true, value.error)
  assert.equal(value.applied, false)
  assert.equal(state.writes, 0)
  assert.deepEqual(value.added.sort(), ['m-a', 'm-b'])
})

test('guard: apply без force отказывает и не пишет, force пишет', async () => {
  // 1 модель против 10 текущих — ниже 0.8.
  installFetch([{ id: 'only', display_name: 'Only', context_window: 1000, max_output_tokens: 100 }])
  const current = []
  for (let index = 0; index < 10; index += 1) current.push(model(`m-${index}`))
  const { editor, state } = makeEditor({ models: current, allowlist: [] })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })

  const refused = await run(ctx, 'apply')
  assert.equal(refused.ok, false)
  assert.match(refused.error, /guard:/)
  assert.equal(state.writes, 0, 'guard must not write the file')

  const forced = await run(ctx, 'apply', { force: true })
  assert.equal(forced.ok, true, forced.error)
  assert.equal(forced.applied, true)
  assert.equal(state.writes, 2, 'models plus allowlist')
})

test('plan при усыхании каталога возвращает дифф, а не ошибку', async () => {
  installFetch([{ id: 'only', display_name: 'Only', context_window: 1000, max_output_tokens: 100 }])
  const current = []
  for (let index = 0; index < 10; index += 1) current.push(model(`m-${index}`))
  const { editor } = makeEditor({ models: current, allowlist: [] })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })
  const value = await run(ctx, 'plan')
  assert.equal(value.ok, true, value.error)
  assert.equal(value.removed.length, 10)
  assert.match(value.warnings.join(' '), /guard:/)
})

test('правка, сделанная во время ожидания блокировки, не теряется', async () => {
  // Каталог молчит о maxTokens: значение берётся из текущей записи.
  installFetch([{ id: 'm-a', display_name: 'Model A', context_window: 1000 }])
  const { editor, modelEntry } = makeEditor({
    models: [model('m-a', { maxTokens: 777, compat: { supportsStrictMode: true } })],
    allowlist: [],
    onLock: (entry) => {
      if (entry.options.id !== 'llm-pi-ai') return
      const profile = entry.options.config.providers.cheapvibecode
      profile.models[0].maxTokens = 888
    },
  })
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })
  const value = await run(ctx, 'apply')
  assert.equal(value.ok, true, value.error)
  const written = modelEntry.options.config.providers.cheapvibecode.models[0]
  assert.equal(written.maxTokens, 888, 'the value edited under the lock wins')
  assert.deepEqual(written.compat, { supportsStrictMode: true })
})

test('маршрут с modelOverrides даёт понятную ошибку', async () => {
  installFetch(CATALOG)
  const { editor } = makeEditor({ models: [], allowlist: [] })
  editor.entries().find((entry) => entry.options.id === 'llm-pi-ai')
    .options.config.providers.cheapvibecode.modelOverrides = { 'm-a': { name: 'Override' } }
  const ctx = makeCtx(editor)
  apply(ctx, { autoSync: false })
  const value = await run(ctx, 'plan')
  assert.equal(value.ok, false)
  assert.match(value.error, /modelOverrides/)
})
