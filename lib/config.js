/**
 * Схема конфигурации плагина и мост из формата 1.x в 2.x.
 *
 * Схема — единственный источник правды о значениях по умолчанию: страница
 * настроек, `GET /cvc/state` и рантайм читают один и тот же объект. Все поля
 * объявлены `.volatile()`: правка строки патча применяется на лету, без
 * перезапуска плагина (проверено на DSH 0.2.2-rc.5: правка volatile-полей
 * приходит событием `loader/volatile-update`, `apply` повторно не вызывается).
 *
 * Плоский конфиг 1.0.0 остаётся в схеме необязательными устаревшими полями и
 * нормализуется в группы 2.x, чтобы обновление плагина не требовало ручной
 * правки патча.
 *
 * @module cvc-catalog-sync-plugin/lib/config
 */
import z from '@deepseek-ai/schemastery'

/** Ключи переключателей функций — порядок важен для интерфейса. */
export const FEATURE_KEYS = Object.freeze(['catalogSync', 'coefficients', 'balance'])

/** Группы конфигурации 2.x. */
export const CONFIG_GROUPS = Object.freeze(['features', 'providers', 'catalog', 'coefficients', 'balance'])

/**
 * Плоские ключи 1.x, которые нормализуются в группы.
 *
 * Список совпадает с §2 спецификации: всё, что писалось в строку патча 1.0.0.
 */
export const LEGACY_KEYS = Object.freeze([
  'entryId',
  'provider',
  'baseURL',
  'apiKeyEnv',
  'installerUrls',
  'autoSync',
  'intervalHours',
  'startupDelayMs',
  'minModelRatio',
  'keepModels',
  'syncAllowlist',
  'allowlistEntryId',
  'levelsCacheMinutes',
  'timeoutMs',
])

/** Нижняя граница автозамера баланса: чаще нельзя, 0 — только по кнопке. */
export const BALANCE_MIN_REFRESH_SECONDS = 15

/** Официальные установщики CVC: PowerShell для Windows, bash для Linux/WSL. */
export const DEFAULT_INSTALLER_URLS = Object.freeze([
  'https://ru.cheapvibecode.ru/idhw',
  'https://ru.cheapvibecode.ru/idhl',
])

/** Маркер, которым schemastery помечает volatile-ссылку. */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** Глубоко заморозить литерал: умолчания не должны меняться рантаймом. */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key])
    Object.freeze(value)
  }
  return value
}

/** Значения по умолчанию 2.x — ровно те, что объявлены в схеме. */
export const DEFAULTS = deepFreeze({
  features: {
    catalogSync: true,
    coefficients: true,
    balance: true,
  },
  providers: {
    match: ['cheapvibecode.ru'],
    entryId: 'llm-pi-ai',
    apiKeyEnv: 'CVC_DEEPSEEK_API_KEY',
    baseURL: 'https://ru.cheapvibecode.ru/v1',
    timeoutMs: 20000,
  },
  catalog: {
    provider: 'cheapvibecode',
    autoSync: true,
    intervalHours: 24,
    startupDelayMs: 5000,
    minModelRatio: 0.8,
    keepModels: [],
    installerUrls: [...DEFAULT_INSTALLER_URLS],
    syncAllowlist: true,
    allowlistEntryId: 'subagent-model-selection-settings',
    levelsCacheMinutes: 360,
  },
  coefficients: {
    refreshMinutes: 10,
    showFast: true,
  },
  balance: {
    refreshSeconds: 0,
    showDelta: true,
  },
})

/** Обычный объект, не массив и не null. */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Первое определённое значение: значение 2.x важнее устаревшего. */
function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

/** Непустая строка без хвостовых пробелов или умолчание. */
function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

/** Булево или умолчание. */
function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/** Конечное число в границах или умолчание. */
function numberOr(value, fallback, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value < min || value > max) return fallback
  return value
}

/** Целое число не меньше единицы или умолчание. */
function positiveIntOr(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback
  return Math.trunc(value)
}

/** Доля в (0, 1] или умолчание. */
function ratioOr(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) return fallback
  return value
}

/** `http(s)`-адрес или undefined. */
function httpUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? value.trim() : undefined
  } catch {
    return undefined
  }
}

/** Список хостов: строки, обрезанные и в нижнем регистре, без пустых. */
function hostListOr(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  const hosts = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
  return hosts.length > 0 ? hosts : [...fallback]
}

/** Список строк без пустых; пустой результат заменяется умолчанием. */
function idListOr(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  const items = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : [...fallback]
}

/** Список `http(s)`-адресов; невалидный или пустой список заменяется умолчанием. */
function urlListOr(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  const urls = value.filter((item) => httpUrl(item) !== undefined).map((item) => item.trim())
  return urls.length > 0 ? urls : [...fallback]
}

/**
 * Схема конфигурации 2.0.0.
 *
 * Группы объявлены объектами с умолчаниями, листья — `.volatile()`: ссылка
 * читается через `.get()` и обновляется на месте. Плоские ключи 1.x — только
 * для чтения старого патча, в нормализованный конфиг они не попадают.
 */
export const Config = z.object({
  features: z.object({
    catalogSync: z.boolean().default(DEFAULTS.features.catalogSync).volatile(),
    coefficients: z.boolean().default(DEFAULTS.features.coefficients).volatile(),
    balance: z.boolean().default(DEFAULTS.features.balance).volatile(),
  }).default({}),
  providers: z.object({
    match: z.array(z.string()).default([...DEFAULTS.providers.match]).volatile(),
    entryId: z.string().default(DEFAULTS.providers.entryId).volatile(),
    apiKeyEnv: z.string().default(DEFAULTS.providers.apiKeyEnv).volatile(),
    baseURL: z.string().default(DEFAULTS.providers.baseURL).volatile(),
    timeoutMs: z.number().min(1).default(DEFAULTS.providers.timeoutMs).volatile(),
  }).default({}),
  catalog: z.object({
    provider: z.string().default(DEFAULTS.catalog.provider).volatile(),
    autoSync: z.boolean().default(DEFAULTS.catalog.autoSync).volatile(),
    intervalHours: z.number().min(0).default(DEFAULTS.catalog.intervalHours).volatile(),
    startupDelayMs: z.number().min(0).default(DEFAULTS.catalog.startupDelayMs).volatile(),
    minModelRatio: z.number().min(0.0001).max(1).default(DEFAULTS.catalog.minModelRatio).volatile(),
    keepModels: z.array(z.string()).default([...DEFAULTS.catalog.keepModels]).volatile(),
    installerUrls: z.array(z.string()).default([...DEFAULT_INSTALLER_URLS]).volatile(),
    syncAllowlist: z.boolean().default(DEFAULTS.catalog.syncAllowlist).volatile(),
    allowlistEntryId: z.string().default(DEFAULTS.catalog.allowlistEntryId).volatile(),
    levelsCacheMinutes: z.number().min(0).default(DEFAULTS.catalog.levelsCacheMinutes).volatile(),
  }).default({}),
  coefficients: z.object({
    refreshMinutes: z.number().min(1).default(DEFAULTS.coefficients.refreshMinutes).volatile(),
    showFast: z.boolean().default(DEFAULTS.coefficients.showFast).volatile(),
  }).default({}),
  balance: z.object({
    refreshSeconds: z.number().min(0).default(DEFAULTS.balance.refreshSeconds).volatile(),
    showDelta: z.boolean().default(DEFAULTS.balance.showDelta).volatile(),
  }).default({}),

  // Устаревшие плоские поля 1.0.0. Без умолчаний: отсутствие поля в патче
  // должно оставаться отсутствием, иначе миграция никогда не завершится.
  entryId: z.string().volatile(),
  provider: z.string().volatile(),
  baseURL: z.string().volatile(),
  apiKeyEnv: z.string().volatile(),
  installerUrls: z.array(z.string()).volatile(),
  autoSync: z.boolean().volatile(),
  intervalHours: z.number().volatile(),
  startupDelayMs: z.number().volatile(),
  minModelRatio: z.number().volatile(),
  keepModels: z.array(z.string()).volatile(),
  syncAllowlist: z.boolean().volatile(),
  allowlistEntryId: z.string().volatile(),
  levelsCacheMinutes: z.number().volatile(),
  timeoutMs: z.number().volatile(),
})

/**
 * Проверить, что значение — volatile-ссылка schemastery.
 * @param {unknown} value
 * @returns {value is { get: () => unknown }}
 */
export function isVolatileReference(value) {
  return value !== null
    && typeof value === 'object'
    && typeof (/** @type {{ get?: unknown }} */ (value).get) === 'function'
    && Object.hasOwn(value, VOLATILE_WRITE)
}

/**
 * Развернуть volatile-ссылки в обычные значения (рекурсивно).
 *
 * Замороженные снимки из ссылок копируются в новые массивы и объекты, чтобы
 * нормализация не зависела от того, отдал ли schemastery общий объект.
 * @param {unknown} value
 * @returns {unknown}
 */
export function unwrapReferences(value) {
  if (isVolatileReference(value)) return unwrapReferences(value.get())
  if (Array.isArray(value)) return value.map((item) => unwrapReferences(item))
  if (isPlainObject(value)) {
    /** @type {Record<string, unknown>} */
    const plain = {}
    for (const [key, item] of Object.entries(value)) plain[key] = unwrapReferences(item)
    return plain
  }
  return value
}

/**
 * Привести любой вход (1.x, 2.x, частичный, битый) к полному конфигу 2.x.
 *
 * Битые значения не бросают: плагин должен подниматься и с неполным патчем,
 * иначе одна опечатка молча выключает автообновление.
 * @param {unknown} raw
 * @returns {typeof DEFAULTS}
 */
export function normalizeConfig(raw) {
  const source = isPlainObject(unwrapReferences(raw)) ? /** @type {Record<string, any>} */ (unwrapReferences(raw)) : {}
  const features = isPlainObject(source.features) ? source.features : {}
  const providers = isPlainObject(source.providers) ? source.providers : {}
  const catalog = isPlainObject(source.catalog) ? source.catalog : {}
  const coefficients = isPlainObject(source.coefficients) ? source.coefficients : {}
  const balance = isPlainObject(source.balance) ? source.balance : {}

  const refreshSecondsRaw = numberOr(first(balance.refreshSeconds), DEFAULTS.balance.refreshSeconds, 0)
  // 0 — только по кнопке; ненулевое значение ниже минимума поднимается до него,
  // чтобы опечатка «5» не превращалась в запрос каждые пять секунд.
  const refreshSeconds = refreshSecondsRaw > 0 && refreshSecondsRaw < BALANCE_MIN_REFRESH_SECONDS
    ? BALANCE_MIN_REFRESH_SECONDS
    : refreshSecondsRaw

  return {
    features: {
      catalogSync: boolOr(features.catalogSync, DEFAULTS.features.catalogSync),
      coefficients: boolOr(features.coefficients, DEFAULTS.features.coefficients),
      balance: boolOr(features.balance, DEFAULTS.features.balance),
    },
    providers: {
      match: hostListOr(first(providers.match), DEFAULTS.providers.match),
      entryId: stringOr(first(providers.entryId, source.entryId), DEFAULTS.providers.entryId),
      apiKeyEnv: stringOr(first(providers.apiKeyEnv, source.apiKeyEnv), DEFAULTS.providers.apiKeyEnv),
      baseURL: httpUrl(first(providers.baseURL, source.baseURL)) ?? DEFAULTS.providers.baseURL,
      timeoutMs: numberOr(first(providers.timeoutMs, source.timeoutMs), DEFAULTS.providers.timeoutMs, 1),
    },
    catalog: {
      provider: stringOr(first(catalog.provider, source.provider), DEFAULTS.catalog.provider),
      autoSync: boolOr(first(catalog.autoSync, source.autoSync), DEFAULTS.catalog.autoSync),
      intervalHours: numberOr(first(catalog.intervalHours, source.intervalHours), DEFAULTS.catalog.intervalHours, 0),
      startupDelayMs: numberOr(first(catalog.startupDelayMs, source.startupDelayMs), DEFAULTS.catalog.startupDelayMs, 0),
      minModelRatio: ratioOr(first(catalog.minModelRatio, source.minModelRatio), DEFAULTS.catalog.minModelRatio),
      keepModels: idListOr(first(catalog.keepModels, source.keepModels), DEFAULTS.catalog.keepModels),
      installerUrls: urlListOr(first(catalog.installerUrls, source.installerUrls), DEFAULTS.catalog.installerUrls),
      syncAllowlist: boolOr(first(catalog.syncAllowlist, source.syncAllowlist), DEFAULTS.catalog.syncAllowlist),
      allowlistEntryId: stringOr(first(catalog.allowlistEntryId, source.allowlistEntryId), DEFAULTS.catalog.allowlistEntryId),
      levelsCacheMinutes: numberOr(
        first(catalog.levelsCacheMinutes, source.levelsCacheMinutes),
        DEFAULTS.catalog.levelsCacheMinutes,
        0,
      ),
    },
    coefficients: {
      refreshMinutes: positiveIntOr(first(coefficients.refreshMinutes), DEFAULTS.coefficients.refreshMinutes),
      showFast: boolOr(first(coefficients.showFast), DEFAULTS.coefficients.showFast),
    },
    balance: {
      refreshSeconds,
      showDelta: boolOr(first(balance.showDelta), DEFAULTS.balance.showDelta),
    },
  }
}

/**
 * Прочитать действующий конфиг плагина из того, что передал Loader.
 *
 * Loader передаёт объект со ссылками; в тестах и на странице настроек может
 * прийти обычный объект. Оба вида приводятся к нормализованному конфигу 2.x.
 * @param {unknown} config
 * @returns {ReturnType<typeof normalizeConfig>}
 */
export function readPluginConfig(config) {
  return normalizeConfig(unwrapReferences(config))
}

/**
 * Форма записанного в патч конфига.
 *
 * `legacy` — только плоские ключи 1.x; `v2` — есть хотя бы одна группа 2.x
 * (или записывать нечего). Обе формы вместе считаются v2: группы важнее.
 * @param {unknown} raw
 * @returns {'legacy' | 'v2'}
 */
export function configShapeOf(raw) {
  const source = isPlainObject(raw) ? raw : {}
  const hasLegacy = LEGACY_KEYS.some((key) => Object.hasOwn(source, key))
  const hasGroups = CONFIG_GROUPS.some((key) => isPlainObject(source[key]))
  return hasLegacy && !hasGroups ? 'legacy' : 'v2'
}

/** Проверить значение устаревшего ключа 1.x по тем же правилам. */
function validateLegacy(source, errors) {
  const stringKeys = ['entryId', 'provider', 'apiKeyEnv', 'baseURL', 'allowlistEntryId']
  for (const key of stringKeys) {
    if (source[key] === undefined) continue
    if (typeof source[key] !== 'string' || source[key].trim().length === 0) errors.push(`${key}: non-empty string required`)
  }
  if (source.baseURL !== undefined && httpUrl(source.baseURL) === undefined) {
    errors.push('baseURL: http(s) URL required')
  }
  if (source.installerUrls !== undefined) {
    if (!Array.isArray(source.installerUrls) || source.installerUrls.length === 0) {
      errors.push('installerUrls: non-empty list of URLs required')
    } else if (source.installerUrls.some((url) => httpUrl(url) === undefined)) {
      errors.push('installerUrls: every item must be an http(s) URL')
    }
  }
  if (source.keepModels !== undefined) {
    if (!Array.isArray(source.keepModels) || source.keepModels.some((id) => typeof id !== 'string')) {
      errors.push('keepModels: list of strings required')
    }
  }
  for (const key of ['autoSync', 'syncAllowlist']) {
    if (source[key] !== undefined && typeof source[key] !== 'boolean') errors.push(`${key}: boolean required`)
  }
  const numbers = [
    ['intervalHours', 0, Infinity],
    ['startupDelayMs', 0, Infinity],
    ['levelsCacheMinutes', 0, Infinity],
    ['timeoutMs', 1, Infinity],
    ['minModelRatio', Number.MIN_VALUE, 1],
  ]
  for (const [key, min, max] of numbers) {
    if (source[key] === undefined) continue
    const value = source[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      errors.push(`${key}: number in [${min}, ${max}] required`)
    }
  }
}

/**
 * Проверить пользовательский ввод перед записью в патч.
 *
 * Возвращает понятные поля с ошибками, а не молча подставляет умолчания:
 * опечатка в интерфейсе не должна тихо превращаться в другие настройки.
 * Проверяются только присутствующие поля — клиент вправе прислать одну группу.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function validateConfigInput(raw) {
  if (!isPlainObject(raw)) return ['config: object required']
  const errors = []
  const source = /** @type {Record<string, any>} */ (raw)

  for (const group of CONFIG_GROUPS) {
    if (source[group] !== undefined && !isPlainObject(source[group])) errors.push(`${group}: object required`)
  }

  const features = isPlainObject(source.features) ? source.features : {}
  for (const key of FEATURE_KEYS) {
    if (features[key] !== undefined && typeof features[key] !== 'boolean') {
      errors.push(`features.${key}: boolean required`)
    }
  }

  const providers = isPlainObject(source.providers) ? source.providers : {}
  if (providers.match !== undefined) {
    if (!Array.isArray(providers.match) || providers.match.length === 0) {
      errors.push('providers.match: non-empty list of host names required')
    } else if (providers.match.some((host) => typeof host !== 'string' || host.trim().length === 0)) {
      errors.push('providers.match: every host must be a non-empty string')
    }
  }
  for (const key of ['entryId', 'apiKeyEnv']) {
    if (providers[key] !== undefined && (typeof providers[key] !== 'string' || providers[key].trim().length === 0)) {
      errors.push(`providers.${key}: non-empty string required`)
    }
  }
  if (providers.baseURL !== undefined && httpUrl(providers.baseURL) === undefined) {
    errors.push('providers.baseURL: http(s) URL required')
  }
  if (providers.timeoutMs !== undefined) {
    const value = providers.timeoutMs
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
      errors.push('providers.timeoutMs: number >= 1 required')
    }
  }

  const catalog = isPlainObject(source.catalog) ? source.catalog : {}
  if (catalog.provider !== undefined && (typeof catalog.provider !== 'string' || catalog.provider.trim().length === 0)) {
    errors.push('catalog.provider: non-empty string required')
  }
  for (const key of ['autoSync', 'syncAllowlist']) {
    if (catalog[key] !== undefined && typeof catalog[key] !== 'boolean') errors.push(`catalog.${key}: boolean required`)
  }
  const catalogNumbers = [
    ['intervalHours', 0, Infinity],
    ['startupDelayMs', 0, Infinity],
    ['levelsCacheMinutes', 0, Infinity],
    ['minModelRatio', Number.MIN_VALUE, 1],
  ]
  for (const [key, min, max] of catalogNumbers) {
    if (catalog[key] === undefined) continue
    const value = catalog[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      errors.push(`catalog.${key}: number in [${min}, ${max}] required`)
    }
  }
  if (catalog.allowlistEntryId !== undefined) {
    const value = catalog.allowlistEntryId
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push('catalog.allowlistEntryId: non-empty string required')
    }
  }
  if (catalog.keepModels !== undefined) {
    if (!Array.isArray(catalog.keepModels) || catalog.keepModels.some((id) => typeof id !== 'string')) {
      errors.push('catalog.keepModels: list of strings required')
    }
  }
  if (catalog.installerUrls !== undefined) {
    if (!Array.isArray(catalog.installerUrls) || catalog.installerUrls.length === 0) {
      errors.push('catalog.installerUrls: non-empty list of URLs required')
    } else if (catalog.installerUrls.some((url) => httpUrl(url) === undefined)) {
      errors.push('catalog.installerUrls: every item must be an http(s) URL')
    }
  }

  const coefficients = isPlainObject(source.coefficients) ? source.coefficients : {}
  if (coefficients.refreshMinutes !== undefined) {
    const value = coefficients.refreshMinutes
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
      errors.push('coefficients.refreshMinutes: number >= 1 required')
    }
  }
  if (coefficients.showFast !== undefined && typeof coefficients.showFast !== 'boolean') {
    errors.push('coefficients.showFast: boolean required')
  }

  const balance = isPlainObject(source.balance) ? source.balance : {}
  if (balance.refreshSeconds !== undefined) {
    const value = balance.refreshSeconds
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push('balance.refreshSeconds: number >= 0 required')
    } else if (value > 0 && value < BALANCE_MIN_REFRESH_SECONDS) {
      errors.push(`balance.refreshSeconds: 0 or at least ${BALANCE_MIN_REFRESH_SECONDS} required`)
    }
  }
  if (balance.showDelta !== undefined && typeof balance.showDelta !== 'boolean') {
    errors.push('balance.showDelta: boolean required')
  }

  validateLegacy(source, errors)
  return errors
}

/**
 * Детерминированная JSON-строка: ключи объектов отсортированы.
 *
 * Нужна для сравнения конфигов (сброс к умолчаниям, «конфиг не изменился»)
 * и для диффа моделей в порту каталога.
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = /** @type {Record<string, unknown>} */ (value)
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/**
 * Совпадают ли два конфига по значению.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function sameConfig(left, right) {
  return stableStringify(left) === stableStringify(right)
}

/**
 * Только переключатели функций.
 * @param {{ features: Record<string, boolean> }} config
 * @returns {{ catalogSync: boolean, coefficients: boolean, balance: boolean }}
 */
export function featuresOf(config) {
  return {
    catalogSync: config.features.catalogSync === true,
    coefficients: config.features.coefficients === true,
    balance: config.features.balance === true,
  }
}
