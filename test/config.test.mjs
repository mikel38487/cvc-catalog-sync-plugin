/**
 * Схема конфигурации: дефолты, все поля volatile, нормализация 1.x → 2.x,
 * отказ невалидных значений, форма записанного конфига.
 *
 * Запуск: node --test test/config.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import z from '@deepseek-ai/schemastery'

import {
  BALANCE_MIN_REFRESH_SECONDS,
  CONFIG_GROUPS,
  Config,
  DEFAULTS,
  FEATURE_KEYS,
  LEGACY_KEYS,
  configShapeOf,
  featuresOf,
  isVolatileReference,
  normalizeConfig,
  readPluginConfig,
  sameConfig,
  stableStringify,
  unwrapReferences,
  validateConfigInput,
} from '../lib/config.js'

/** Путь свободного поля схемы и проверка, что оно volatile. */
function isVolatileAt(schema, path) {
  let node = schema
  for (const step of path) {
    if (node?.dict?.[step] === undefined) return false
    node = node.dict[step]
  }
  return node?.meta?.volatile === true
}

/** Все листья групп конфига как пути `['поле', 'ключ']`. */
const LEAF_PATHS = [
  ...FEATURE_KEYS.map((key) => ['features', key]),
  ['providers', 'match'],
  ['providers', 'entryId'],
  ['providers', 'apiKeyEnv'],
  ['providers', 'baseURL'],
  ['providers', 'timeoutMs'],
  ...Object.keys(DEFAULTS.catalog).map((key) => ['catalog', key]),
  ...Object.keys(DEFAULTS.coefficients).map((key) => ['coefficients', key]),
  ...Object.keys(DEFAULTS.balance).map((key) => ['balance', key]),
]

test('схема — schemastery и все листья объявлены volatile', () => {
  assert.equal(Reflect.get(Config, Symbol.for('schemastery')), true)
  for (const path of LEAF_PATHS) {
    assert.equal(isVolatileAt(Config, path), true, `${path.join('.')} должен быть .volatile()`)
  }
})

test('каждый устаревший ключ 1.x тоже volatile и есть в схеме', () => {
  for (const key of LEGACY_KEYS) {
    assert.equal(Config.dict[key]?.meta?.volatile, true, `${key} должен быть .volatile()`)
  }
})

test('Config({}) отдаёт ссылки со значениями из DEFAULTS', () => {
  const parsed = Config({})
  for (const group of CONFIG_GROUPS) {
    const expected = DEFAULTS[group]
    for (const [key, value] of Object.entries(expected)) {
      const reference = parsed[group][key]
      assert.equal(isVolatileReference(reference), true, `${group}.${key} — ссылка`)
      assert.deepEqual(reference.get(), value, `${group}.${key} совпадает с DEFAULTS`)
    }
  }
})

test('дефолты нормализации совпадают со схемой', () => {
  const fromSchema = normalizeConfig(unwrapReferences(Config({})))
  assert.deepEqual(fromSchema, DEFAULTS)
})

test('DEFAULTS заморожены и не меняются рантаймом', () => {
  assert.equal(Object.isFrozen(DEFAULTS), true)
  assert.equal(Object.isFrozen(DEFAULTS.catalog), true)
  assert.equal(Object.isFrozen(DEFAULTS.providers.match), true)
  assert.throws(() => {
    /** @type {any} */ (DEFAULTS).catalog.provider = 'x'
  }, TypeError)
})

test('плоский конфиг 1.x нормализуется в группы 2.x', () => {
  const legacy = {
    entryId: 'llm-pi-ai-custom',
    provider: 'myroute',
    baseURL: 'https://ru.cheapvibecode.ru/v1/',
    apiKeyEnv: 'MY_KEY',
    installerUrls: ['https://ru.cheapvibecode.ru/idhw'],
    autoSync: false,
    intervalHours: 6,
    startupDelayMs: 1000,
    minModelRatio: 0.5,
    keepModels: ['keep-me'],
    syncAllowlist: false,
    allowlistEntryId: 'my-allowlist',
    levelsCacheMinutes: 60,
    timeoutMs: 5000,
  }
  const config = normalizeConfig(legacy)
  assert.deepEqual(Object.keys(config), [...CONFIG_GROUPS])
  assert.equal(config.providers.entryId, 'llm-pi-ai-custom')
  assert.equal(config.providers.baseURL, 'https://ru.cheapvibecode.ru/v1/')
  assert.equal(config.providers.apiKeyEnv, 'MY_KEY')
  assert.equal(config.providers.timeoutMs, 5000)
  assert.equal(config.catalog.provider, 'myroute')
  assert.equal(config.catalog.autoSync, false)
  assert.equal(config.catalog.intervalHours, 6)
  assert.equal(config.catalog.startupDelayMs, 1000)
  assert.equal(config.catalog.minModelRatio, 0.5)
  assert.deepEqual(config.catalog.keepModels, ['keep-me'])
  assert.deepEqual(config.catalog.installerUrls, ['https://ru.cheapvibecode.ru/idhw'])
  assert.equal(config.catalog.syncAllowlist, false)
  assert.equal(config.catalog.allowlistEntryId, 'my-allowlist')
  assert.equal(config.catalog.levelsCacheMinutes, 60)
  for (const key of LEGACY_KEYS) assert.equal(Object.hasOwn(config, key), false, `${key} не протекает наверх`)
})

test('конфиг 2.x важнее устаревшего плоского ключа', () => {
  const config = normalizeConfig({
    providers: { entryId: 'llm-pi-ai', timeoutMs: 9000 },
    entryId: 'stale-row',
    timeoutMs: 1,
  })
  assert.equal(config.providers.entryId, 'llm-pi-ai')
  assert.equal(config.providers.timeoutMs, 9000)
})

test('устаревший плоский ключ подхватывается, когда группы нет', () => {
  const config = normalizeConfig({ features: { balance: false }, intervalHours: 12 })
  assert.equal(config.features.balance, false)
  assert.equal(config.catalog.intervalHours, 12)
})

test('битые значения не бросают, а заменяются умолчаниями', () => {
  const config = normalizeConfig({
    features: { catalogSync: 'yes', coefficients: 1, balance: null },
    providers: { match: [], baseURL: 'ftp://x', timeoutMs: 0 },
    catalog: { intervalHours: -1, minModelRatio: 5, keepModels: 'x', installerUrls: ['bad'] },
    coefficients: { refreshMinutes: 0 },
    balance: { refreshSeconds: -3 },
  })
  assert.deepEqual(config, DEFAULTS)
})

test('необъектный вход даёт дефолты', () => {
  for (const raw of [undefined, null, 'text', 42, []]) {
    assert.deepEqual(normalizeConfig(raw), DEFAULTS)
  }
})

test('хост-шаблоны приводятся к нижнему регистру, пустые выбрасываются', () => {
  const config = normalizeConfig({ providers: { match: ['CheapVibeCode.RU', '  ', 'alt.example'] } })
  assert.deepEqual(config.providers.match, ['cheapvibecode.ru', 'alt.example'])
})

test('refreshSeconds: 0 остаётся 0, маленькое значение поднимается до минимума', () => {
  assert.equal(normalizeConfig({ balance: { refreshSeconds: 0 } }).balance.refreshSeconds, 0)
  assert.equal(normalizeConfig({ balance: { refreshSeconds: 5 } }).balance.refreshSeconds, BALANCE_MIN_REFRESH_SECONDS)
  assert.equal(normalizeConfig({ balance: { refreshSeconds: 60 } }).balance.refreshSeconds, 60)
})

test('readPluginConfig читает объект со ссылками schemastery', () => {
  const parsed = Config({ features: { coefficients: false }, catalog: { provider: 'alt' } })
  const config = readPluginConfig(parsed)
  assert.equal(config.features.coefficients, false)
  assert.equal(config.features.catalogSync, true)
  assert.equal(config.catalog.provider, 'alt')
})

test('readPluginConfig принимает и обычный объект', () => {
  assert.deepEqual(readPluginConfig({ features: { balance: false } }).features, {
    catalogSync: true,
    coefficients: true,
    balance: false,
  })
})

test('isVolatileReference отличает ссылку от значения', () => {
  const parsed = Config({})
  assert.equal(isVolatileReference(parsed.features.balance), true)
  assert.equal(isVolatileReference({ get: () => 1 }), false)
  assert.equal(isVolatileReference(true), false)
  assert.equal(isVolatileReference(null), false)
})

test('unwrapReferences разворачивает вложенные ссылки', () => {
  const parsed = Config({ catalog: { keepModels: ['a', 'b'] } })
  const plain = unwrapReferences(parsed)
  assert.deepEqual(plain.catalog.keepModels, ['a', 'b'])
  assert.equal(isVolatileReference(plain.features.balance), false)
})

test('validateConfigInput принимает полный корректный конфиг', () => {
  assert.deepEqual(validateConfigInput(DEFAULTS), [])
})

test('validateConfigInput принимает частичный ввод и устаревшие ключи', () => {
  assert.deepEqual(validateConfigInput({ features: { balance: false } }), [])
  assert.deepEqual(validateConfigInput({ intervalHours: 3, provider: 'cheapvibecode' }), [])
})

test('validateConfigInput отклоняет необъектный вход', () => {
  assert.deepEqual(validateConfigInput(null), ['config: object required'])
  assert.deepEqual(validateConfigInput([1]), ['config: object required'])
})

test('validateConfigInput называет неверные поля', () => {
  const errors = validateConfigInput({
    features: { catalogSync: 'yes' },
    providers: { match: [], baseURL: 'ftp://x', entryId: '', timeoutMs: 0 },
    catalog: { intervalHours: -1, minModelRatio: 2, keepModels: [1], installerUrls: ['nope'] },
    coefficients: { refreshMinutes: 0, showFast: 'yes' },
    balance: { refreshSeconds: 5, showDelta: 1 },
  })
  const expected = [
    'features.catalogSync: boolean required',
    'providers.match: non-empty list of host names required',
    'providers.entryId: non-empty string required',
    'providers.baseURL: http(s) URL required',
    'providers.timeoutMs: number >= 1 required',
    'catalog.intervalHours: number in [0, Infinity] required',
    'catalog.minModelRatio: number in [5e-324, 1] required',
    'catalog.keepModels: list of strings required',
    'catalog.installerUrls: every item must be an http(s) URL',
    'coefficients.refreshMinutes: number >= 1 required',
    'coefficients.showFast: boolean required',
    `balance.refreshSeconds: 0 or at least ${BALANCE_MIN_REFRESH_SECONDS} required`,
    'balance.showDelta: boolean required',
  ]
  for (const message of expected) assert.ok(errors.includes(message), `ожидалось "${message}" в ${JSON.stringify(errors)}`)
})

test('validateConfigInput отклоняет пустые installerUrls и необъектную группу', () => {
  assert.ok(validateConfigInput({ catalog: { installerUrls: [] } }).includes('catalog.installerUrls: non-empty list of URLs required'))
  assert.ok(validateConfigInput({ providers: 'x' }).includes('providers: object required'))
})

test('configShapeOf: только плоские ключи — legacy, группы — v2', () => {
  assert.equal(configShapeOf({ entryId: 'llm-pi-ai', intervalHours: 1 }), 'legacy')
  assert.equal(configShapeOf({ features: { balance: false } }), 'v2')
  assert.equal(configShapeOf({ entryId: 'llm-pi-ai', features: {} }), 'v2')
  assert.equal(configShapeOf({}), 'v2')
  assert.equal(configShapeOf(undefined), 'v2')
})

test('stableStringify не зависит от порядка ключей', () => {
  assert.equal(stableStringify({ a: 1, b: [1, 2] }), stableStringify({ b: [1, 2], a: 1 }))
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }))
  assert.equal(sameConfig({ a: [1] }, { a: [1] }), true)
  assert.equal(sameConfig(DEFAULTS, normalizeConfig({})), true)
})

test('featuresOf отдаёт только три переключателя', () => {
  const features = featuresOf(normalizeConfig({ features: { coefficients: false } }))
  assert.deepEqual(features, { catalogSync: true, coefficients: false, balance: true })
  assert.deepEqual(Object.keys(features), [...FEATURE_KEYS])
})

test('Config с неверным типом бросает ValidationError', () => {
  assert.throws(() => Config({ features: { balance: 'yes' } }), z.ValidationError)
})