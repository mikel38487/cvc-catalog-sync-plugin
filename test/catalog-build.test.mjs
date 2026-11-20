/**
 * Чистые функции сборки моделей: порт юнит-тестов 1.0.0 без сети и профиля
 * (test/self-test.mjs), плюс новые проверки guard и планирования allowlist.
 *
 * Запуск: node --test test/catalog-build.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseReasoningLevels } from '../lib/cvc-api.js'
import {
  buildModels,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  diffModels,
  FULL_ROW,
  guardFailureMessage,
  isDiffEmpty,
  modelName,
  modelRatioGuard,
  planAllowlist,
  positiveInt,
  reasoningEffortsFor,
  stableStringify,
  WIRE_LEVELS,
} from '../lib/catalog-build.js'

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

test('константы схемы: ряд уровней и полный ряд совпадают', () => {
  assert.deepEqual([...WIRE_LEVELS], ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(Object.keys(FULL_ROW), [...WIRE_LEVELS])
  assert.equal(FULL_ROW.off, 'none')
  assert.equal(DEFAULT_CONTEXT_WINDOW, 128000)
  assert.equal(DEFAULT_MAX_TOKENS, 16384)
  assert.ok(Object.isFrozen(WIRE_LEVELS))
  assert.ok(Object.isFrozen(FULL_ROW))
})

test('parseReasoningLevels вытаскивает литерал и отбрасывает битое', () => {
  const map = parseReasoningLevels(INSTALLER_SAMPLE)
  assert.deepEqual(map?.['glm-5.3'], ['high', 'max'])
  assert.deepEqual(map?.['minimax-m3'], ['none', 'thinking'])
  assert.deepEqual(map?.['claude-opus-4-6'], ['low', 'medium', 'high', 'max'])
  assert.equal(parseReasoningLevels('const other = {};'), null)
  assert.equal(parseReasoningLevels('const reasoningLevels = {broken};'), null)
  assert.equal(parseReasoningLevels('const reasoningLevels = {"m":[]};'), null)
  assert.equal(parseReasoningLevels(''), null)
  assert.equal(parseReasoningLevels(null), null)
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
  const { models, warnings } = buildModels(CATALOG, map, [], {})
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
  const { models } = buildModels([{
    id: 'tiny',
    display_name: 'Tiny',
    context_window: 8000,
    max_output_tokens: 128000,
    output_modalities: ['text'],
  }], null, [], {})
  assert.equal(models[0].maxTokens, 8000)
})

test('buildModels переносит контекст из текущей записи, если каталог молчит', () => {
  const { models } = buildModels(
    [{ id: 'kept', display_name: 'Kept', output_modalities: ['text'] }],
    null,
    [{ id: 'kept', contextWindow: 64000, maxTokens: 8000, input: ['text'], reasoningEfforts: { low: 'low' } }],
    {},
  )
  assert.equal(models[0].contextWindow, 64000)
  assert.equal(models[0].maxTokens, 8000)
  assert.deepEqual(models[0].reasoningEfforts, { low: 'low' })
})

test('buildModels берёт умолчания контекста, когда каталог и патч молчат', () => {
  const { models } = buildModels([{ id: 'plain', display_name: 'Plain' }], null, [], {})
  assert.equal(models[0].contextWindow, DEFAULT_CONTEXT_WINDOW)
  assert.equal(models[0].maxTokens, DEFAULT_MAX_TOKENS)
  assert.deepEqual(models[0].input, ['text'])
})

test('buildModels уважает keepModels и предупреждает о пропавших', () => {
  const { models, warnings } = buildModels(
    [{ id: 'fresh', display_name: 'Fresh', output_modalities: ['text'] }],
    null,
    [{ id: 'gone', name: 'Gone', contextWindow: 1000, maxTokens: 100, input: ['text'], reasoningEfforts: false }],
    { keepModels: ['gone', 'ghost'] },
  )
  assert.deepEqual(models.map((model) => model.id), ['fresh', 'gone'])
  assert.equal(warnings.length, 2)
  assert.match(warnings.join(' '), /ghost/)
  assert.match(warnings.join(' '), /kept although the catalog no longer lists it/)
})

test('buildModels: каталог главнее текущей записи в вопросе image', () => {
  const stale = [{ id: 'm', contextWindow: 1000, maxTokens: 100, input: ['text', 'image'], reasoningEfforts: false }]
  const declared = buildModels(
    [{ id: 'm', display_name: 'M', output_modalities: ['text'], input_modalities: ['text'] }],
    null, stale, {},
  )
  assert.deepEqual(declared.models[0].input, ['text'])

  const silent = buildModels(
    [{ id: 'm', display_name: 'M', output_modalities: ['text'] }],
    null, stale, {},
  )
  assert.deepEqual(silent.models[0].input, ['text', 'image'])

  const visionOnly = buildModels(
    [{ id: 'v', display_name: 'V', output_modalities: ['text'], supports_vision: true }],
    null, [], {},
  )
  assert.deepEqual(visionOnly.models[0].input, ['text', 'image'])

  const denied = buildModels(
    [{ id: 'm', display_name: 'M', output_modalities: ['text'], supports_vision: false }],
    null, stale, {},
  )
  assert.deepEqual(denied.models[0].input, ['text'], 'supports_vision: false побеждает старую запись')
})

test('buildModels сохраняет ручной compat', () => {
  const { models } = buildModels(
    [{ id: 'm', display_name: 'M', output_modalities: ['text'] }],
    null,
    [{ id: 'm', compat: { supportsStrictMode: true } }],
    {},
  )
  assert.deepEqual(models[0].compat, { supportsStrictMode: true })
})

test('buildModels отбрасывает дубли и пустой id, а не бросает на мусоре', () => {
  const { models } = buildModels(
    [
      { id: ' same ', display_name: 'A', output_modalities: ['text'] },
      { id: 'same', display_name: 'B', output_modalities: ['text'] },
      { id: '', display_name: 'No id' },
      null,
      42,
    ],
    null,
    [],
    {},
  )
  assert.deepEqual(models.map((model) => model.id), ['same'])
  assert.equal(models[0].name, 'A')
  assert.deepEqual(buildModels(undefined, null, undefined, undefined).models, [])
})

test('modelName берёт хвост display_name после разделителя', () => {
  assert.equal(modelName({ display_name: 'Vendor · Model X' }, 'id'), 'Model X')
  assert.equal(modelName({ name: 'Plain Name' }, 'id'), 'Plain Name')
  assert.equal(modelName({}, 'fallback-id'), 'fallback-id')
})

test('positiveInt и guards на мусор', () => {
  assert.equal(positiveInt('42'), 42)
  assert.equal(positiveInt(-1), null)
  assert.equal(positiveInt('abc'), null)
  const guard = modelRatioGuard(10, 1, 0.8)
  assert.deepEqual(guard, { minModelRatio: 0.8, currentModels: 10, nextModels: 1, minRequired: 8, ok: false })
  assert.equal(modelRatioGuard(10, 1, 5).minModelRatio, 0.8, 'доля вне (0,1] заменяется умолчанием')
  assert.equal(modelRatioGuard(0, 1, 0.8).ok, true, 'нечего защищать: каталог не может сжаться меньше одной модели')
  assert.equal(modelRatioGuard(0, 0, 0.8).ok, false)
  assert.match(guardFailureMessage({ currentModels: 10, nextModels: 1, minModelRatio: 0.8 }), /guard: catalog returned 1 models, below 8 \(80% of current 10\)/)
  assert.match(guardFailureMessage({ currentModels: 10, nextModels: 1, minModelRatio: 0.8 }), /use force to override/)
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
  assert.equal(isDiffEmpty(diff), false)
})

test('diffModels не считает изменением порядок ключей', () => {
  const diff = diffModels(
    [{ id: 'a', name: 'A', input: ['text'] }],
    [{ input: ['text'], name: 'A', id: 'a' }],
  )
  assert.equal(diff.changedCount, 0)
  assert.equal(isDiffEmpty(diff), true)
})

test('diffModels видит исчезнувшее поле и не падает на мусоре', () => {
  const diff = diffModels(
    [{ id: 'a', name: 'A', compat: { x: 1 } }],
    [{ id: 'a', name: 'A' }],
  )
  assert.deepEqual(diff.changed, [{ id: 'a', fields: ['compat'] }])
  assert.deepEqual(diffModels(null, undefined), { added: [], removed: [], changed: [], changedCount: 0 })
})

test('stableStringify сортирует ключи', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }))
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }))
  assert.equal(stableStringify([1, undefined]), '[1,null]')
})

test('planAllowlist добавляет каталог и сохраняет чужих провайдеров', () => {
  const plan = planAllowlist(
    [{ provider: 'funpay', model: 'x' }, { provider: 'cvc', model: 'old' }],
    'cvc',
    ['m-a', 'm-b'],
  )
  assert.deepEqual(plan.pruned, ['old'])
  assert.deepEqual(plan.added, ['m-a', 'm-b'])
  assert.deepEqual(plan.others, [{ provider: 'funpay', model: 'x' }])
  assert.deepEqual(plan.expected, [
    { provider: 'funpay', model: 'x' },
    { provider: 'cvc', model: 'm-a' },
    { provider: 'cvc', model: 'm-b' },
  ])
  assert.equal(plan.changed, true)
})

test('planAllowlist различает дубли и порядок как изменение', () => {
  const good = [{ provider: 'cvc', model: 'm-a' }, { provider: 'cvc', model: 'm-b' }]
  assert.equal(planAllowlist(good, 'cvc', ['m-a', 'm-b']).changed, false)
  const dup = [good[0], good[0], good[1]]
  assert.equal(planAllowlist(dup, 'cvc', ['m-a', 'm-b']).changed, true)
  const swapped = [good[1], good[0]]
  assert.equal(planAllowlist(swapped, 'cvc', ['m-a', 'm-b']).changed, true)
  assert.deepEqual(planAllowlist(undefined, 'cvc', ['m-a']).added, ['m-a'])
  assert.deepEqual(planAllowlist([], 'cvc', ['m-a', 'm-a']).expected, [{ provider: 'cvc', model: 'm-a' }])
})