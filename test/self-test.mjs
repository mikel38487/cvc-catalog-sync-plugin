/**
 * Юнит-проверка чистых функций плагина: без сети, без профиля DSH.
 *
 * Запуск: node --test test/self-test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildModels,
  diffModels,
  normalizeConfig,
  parseCatalogPayload,
  parseReasoningLevels,
  reasoningEffortsFor,
  stableStringify,
} from '../index.js'

const INSTALLER_SAMPLE = `
const reasoningLevels = {"deepseek-v4.1-flash-1017":["none","low","high","max"],"glm-5.3":["high","max"],"minimax-m3":["none","thinking"],"claude-opus-4-6":["low","medium","high","max"]};
const managedBaseURL = apiRoot + "/v1";
`

const CATALOG = [
  {
    id: 'gpt-6-astra',
    display_name: 'OpenAI · GPT 6 Astra',
    context_window: 1050000,
    max_output_tokens: 128000,
    supports_vision: true,
    supports_reasoning: true,
    output_modalities: ['text'],
  },
  {
    id: 'deepseek-v4.1-flash-1017',
    display_name: 'DeepSeek · DeepSeek V4.1 Flash 1017',
    context_window: 1048576,
    max_output_tokens: 393216,
    supports_vision: true,
    supports_reasoning: true,
    output_modalities: ['text'],
  },
  {
    id: 'claude-haiku-4-5',
    display_name: 'Anthropic · Claude Haiku 4.5',
    context_window: 200000,
    max_output_tokens: 64000,
    supports_vision: false,
    supports_reasoning: false,
    output_modalities: ['text'],
  },
  {
    id: 'gpt-image-1',
    display_name: 'OpenAI · GPT Image 1',
    context_window: 32000,
    max_output_tokens: 4096,
    output_modalities: ['image'],
  },
  { id: 'video-model', display_name: 'Some · Video Model', output_modalities: ['video'] },
  { display_name: 'Broken without id' },
]

test('parseCatalogPayload принимает OpenAI-форму и голый массив', () => {
  assert.equal(parseCatalogPayload({ data: [{ id: 'a' }] }).length, 1)
  assert.equal(parseCatalogPayload([{ id: 'a' }, { id: 'b' }]).length, 2)
  assert.equal(parseCatalogPayload({ nope: true }).length, 0)
  assert.equal(parseCatalogPayload([{ id: '' }, null, 42]).length, 0)
})

test('parseReasoningLevels вытаскивает литерал и отбрасывает битое', () => {
  const map = parseReasoningLevels(INSTALLER_SAMPLE)
  assert.deepEqual(map?.['glm-5.3'], ['high', 'max'])
  assert.deepEqual(map?.['minimax-m3'], ['none', 'thinking'])
  assert.equal(parseReasoningLevels('const other = {};'), null)
  assert.equal(parseReasoningLevels('const reasoningLevels = {broken};'), null)
  assert.equal(parseReasoningLevels(''), null)
})

test('reasoningEffortsFor переносит уровни по правилам установщика', () => {
  const warnings = []
  const map = { m1: ['none', 'low', 'high', 'max'], m2: ['none', 'thinking'] }
  assert.deepEqual(reasoningEffortsFor('m1', {}, undefined, map, warnings), {
    off: 'none', low: 'low', high: 'high', max: 'max',
  })
  // Ключи ограничены THINKING_LEVELS, значения — проводное написание,
  // поэтому thinking едет как high: thinking (как в установщике CVC).
  assert.deepEqual(reasoningEffortsFor('m2', {}, undefined, map, warnings), { off: 'none', high: 'thinking' })
  assert.deepEqual(warnings, [])
})

test('reasoningEffortsFor не отдаёт карту только с off: DSH её отвергает', () => {
  const warnings = []
  const map = { m1: ['none'], m2: ['none', 'weird'] }
  // off-only роняет resolveModelReasoning, поэтому падаем в полный ряд.
  assert.deepEqual(reasoningEffortsFor('m1', { supports_reasoning: true }, undefined, map, warnings), {
    off: 'none', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
  })
  assert.equal(reasoningEffortsFor('m2', { supports_reasoning: false }, undefined, map, warnings), false)
  // m2 даёт два предупреждения: неизвестный уровень и «только off».
  assert.equal(warnings.length, 3)
  assert.match(warnings[0], /beyond "off"/)
  assert.match(warnings[1], /unknown level "weird"/)
  assert.match(warnings[2], /beyond "off"/)
})

test('reasoningEffortsFor сохраняет текущее значение, если карта недоступна', () => {
  const existing = { reasoningEfforts: { high: 'high', max: 'max' } }
  assert.deepEqual(reasoningEffortsFor('x', {}, existing, null, []), { high: 'high', max: 'max' })
  assert.deepEqual(reasoningEffortsFor('x', { supports_reasoning: true }, undefined, null, []), {
    off: 'none', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
  })
  assert.equal(reasoningEffortsFor('x', { supports_reasoning: false }, undefined, null, []), false)
  assert.equal(reasoningEffortsFor('x', {}, undefined, null, []), false)
})

test('buildModels собирает модели по правилам установщика', () => {
  const map = parseReasoningLevels(INSTALLER_SAMPLE)
  const cfg = normalizeConfig({})
  const { models, warnings } = buildModels(CATALOG, map, [], cfg)
  const ids = models.map((model) => model.id)
  assert.deepEqual(ids, ['gpt-6-astra', 'deepseek-v4.1-flash-1017', 'claude-haiku-4-5'])
  assert.deepEqual(warnings, [])

  const astra = models[0]
  assert.equal(astra.name, 'GPT 6 Astra')
  assert.equal(astra.contextWindow, 1050000)
  assert.equal(astra.maxTokens, 128000)
  assert.deepEqual(astra.input, ['text', 'image'])
  assert.equal(astra.reasoningEfforts.off, 'none')

  const flash = models[1]
  assert.deepEqual(flash.reasoningEfforts, { off: 'none', low: 'low', high: 'high', max: 'max' })

  const haiku = models[2]
  assert.deepEqual(haiku.input, ['text'])
  assert.equal(haiku.reasoningEfforts, false)
  assert.equal(haiku.maxTokens, 64000)
})

test('buildModels не даёт maxTokens превысить contextWindow', () => {
  const cfg = normalizeConfig({})
  const { models } = buildModels([{
    id: 'tiny',
    display_name: 'Tiny',
    context_window: 8000,
    max_output_tokens: 128000,
    output_modalities: ['text'],
  }], null, [], cfg)
  assert.equal(models[0].maxTokens, 8000)
})

test('buildModels переносит контекст из текущей записи, если каталог молчит', () => {
  const cfg = normalizeConfig({})
  const { models } = buildModels(
    [{ id: 'kept', display_name: 'Kept', output_modalities: ['text'] }],
    null,
    [{ id: 'kept', contextWindow: 64000, maxTokens: 8000, input: ['text'], reasoningEfforts: { low: 'low' } }],
    cfg,
  )
  assert.equal(models[0].contextWindow, 64000)
  assert.equal(models[0].maxTokens, 8000)
  assert.deepEqual(models[0].reasoningEfforts, { low: 'low' })
})

test('buildModels уважает keepModels и предупреждает о пропавших', () => {
  const cfg = normalizeConfig({ keepModels: ['gone', 'ghost'] })
  const { models, warnings } = buildModels(
    [{ id: 'fresh', display_name: 'Fresh', output_modalities: ['text'] }],
    null,
    [{ id: 'gone', name: 'Gone', contextWindow: 1000, maxTokens: 100, input: ['text'], reasoningEfforts: false }],
    cfg,
  )
  assert.deepEqual(models.map((model) => model.id), ['fresh', 'gone'])
  assert.equal(warnings.length, 2)
  assert.match(warnings.join(' '), /ghost/)
})

test('buildModels: каталог главнее текущей записи в вопросе image', () => {
  const cfg = normalizeConfig({})
  const stale = [{ id: 'm', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: false }]
  const declared = buildModels(
    [{ id: 'm', display_name: 'M', output_modalities: ['text'], input_modalities: ['text'] }],
    null, stale, cfg,
  )
  assert.deepEqual(declared.models[0].input, ['text'])

  const silent = buildModels(
    [{ id: 'm', display_name: 'M', output_modalities: ['text'] }],
    null, stale, cfg,
  )
  assert.deepEqual(silent.models[0].input, ['text', 'image'])

  const visionOnly = buildModels(
    [{ id: 'v', display_name: 'V', output_modalities: ['text'], supports_vision: true }],
    null, [], cfg,
  )
  assert.deepEqual(visionOnly.models[0].input, ['text', 'image'])
})

test('buildModels сохраняет ручной compat', () => {
  const cfg = normalizeConfig({})
  const { models } = buildModels(
    [{ id: 'm', display_name: 'M', output_modalities: ['text'] }],
    null,
    [{ id: 'm', compat: { supportsStrictMode: true } }],
    cfg,
  )
  assert.deepEqual(models[0].compat, { supportsStrictMode: true })
})

test('diffModels считает добавленные, удалённые и изменённые', () => {
  const current = [
    { id: 'a', name: 'A', contextWindow: 1, maxTokens: 1, input: ['text'], reasoningEfforts: false },
    { id: 'b', name: 'B', contextWindow: 1, maxTokens: 1, input: ['text'], reasoningEfforts: false },
  ]
  const next = [
    { id: 'b', name: 'B2', contextWindow: 1, maxTokens: 1, input: ['text'], reasoningEfforts: false },
    { id: 'c', name: 'C', contextWindow: 1, maxTokens: 1, input: ['text'], reasoningEfforts: false },
  ]
  const diff = diffModels(current, next)
  assert.deepEqual(diff.added, ['c'])
  assert.deepEqual(diff.removed, ['a'])
  assert.deepEqual(diff.changed, [{ id: 'b', fields: ['name'] }])
  assert.equal(diff.changedCount, 1)
})

test('diffModels не считает изменением порядок ключей', () => {
  const diff = diffModels(
    [{ id: 'a', name: 'A', input: ['text'] }],
    [{ input: ['text'], name: 'A', id: 'a' }],
  )
  assert.equal(diff.changedCount, 0)
})

test('stableStringify сортирует ключи', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }))
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }))
})

test('normalizeConfig подставляет умолчания и не падает на мусоре', () => {
  const defaults = normalizeConfig(undefined)
  assert.equal(defaults.provider, 'cheapvibecode')
  assert.equal(defaults.entryId, 'llm-pi-ai')
  assert.equal(defaults.apiKeyEnv, 'CVC_DEEPSEEK_API_KEY')
  assert.equal(defaults.autoSync, true)
  assert.equal(defaults.intervalHours, 24)
  assert.equal(defaults.minModelRatio, 0.8)
  assert.equal(defaults.installerUrls.length, 2)

  const custom = normalizeConfig({
    provider: ' p2 ',
    intervalHours: 0,
    minModelRatio: 5,
    installerUrls: [' https://example.test/idhw ', ''],
    keepModels: [' x ', 7],
    syncAllowlist: false,
  })
  assert.equal(custom.provider, 'p2')
  assert.equal(custom.intervalHours, 0)
  assert.equal(custom.minModelRatio, 0.8)
  assert.deepEqual(custom.installerUrls, ['https://example.test/idhw'])
  assert.deepEqual(custom.keepModels, ['x'])
  assert.equal(custom.syncAllowlist, false)

  // Пределы таймеров: больше 2^31-1 мс Node исполняет как 1 мс.
  assert.equal(normalizeConfig({ startupDelayMs: 5e9 }).startupDelayMs, 2147483647)
  assert.equal(normalizeConfig({ timeoutMs: 5e9 }).timeoutMs, 2147483647)
  assert.equal(normalizeConfig({ timeoutMs: 0 }).timeoutMs, 30000)
  assert.equal(normalizeConfig({ startupDelayMs: -1 }).startupDelayMs, 5000)
})
