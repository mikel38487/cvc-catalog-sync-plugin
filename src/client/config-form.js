/**
 * Модель формы настроек: пути полей, умолчания, чтение и запись конфига.
 *
 * Конфиг 2.0.0 сгруппирован (`features`, `providers`, `catalog`, `coefficients`,
 * `balance`), но в установке с 1.0.0 в патче лежат плоские ключи. Страница
 * читает оба вида, а сохраняет всегда новый: одно нажатие «Сохранить» — это и
 * есть миграция строки конфига, о которой предупреждает `configShape: 'legacy'`.
 *
 * Всё в этом модуле — чистые функции без React и без сети: иначе форму нельзя
 * проверить тестом отдельно от рендера.
 *
 * @module cvc-catalog-sync-plugin/client/config-form
 */

/** Ключи функций, которые включает и выключает страница. */
export const FEATURE_KEYS = Object.freeze(['catalogSync', 'coefficients', 'balance'])

/**
 * Переключатели функций в порядке показа.
 *
 * @type {ReadonlyArray<{key: string, labelKey: string, hintKey: string}>}
 */
export const FEATURE_ITEMS = Object.freeze([
  { key: 'catalogSync', labelKey: 'featureCatalogSync', hintKey: 'featureCatalogSyncHint' },
  { key: 'coefficients', labelKey: 'featureCoefficients', hintKey: 'featureCoefficientsHint' },
  { key: 'balance', labelKey: 'featureBalance', hintKey: 'featureBalanceHint' },
])

/** Группы параметров в порядке показа. */
export const GROUPS = Object.freeze([
  { id: 'catalog', titleKey: 'groupCatalog' },
  { id: 'coefficients', titleKey: 'groupCoefficients' },
  { id: 'balance', titleKey: 'groupBalance' },
  { id: 'advanced', titleKey: 'groupAdvanced' },
])

/**
 * Описание одного поля формы.
 *
 * `path` — путь в новом конфиге, `legacy` — плоский ключ 1.x, который читается
 * как запасной источник. `kind`: `text`, `number`, `switch`, `list`.
 */
const FIELDS = [
  { id: 'provider', group: 'catalog', path: ['catalog', 'provider'], legacy: 'provider', kind: 'text', labelKey: 'provider', hintKey: 'providerHint' },
  { id: 'autoSync', group: 'catalog', path: ['catalog', 'autoSync'], legacy: 'autoSync', kind: 'switch', labelKey: 'autoSync', hintKey: 'autoSyncHint' },
  { id: 'intervalHours', group: 'catalog', path: ['catalog', 'intervalHours'], legacy: 'intervalHours', kind: 'number', min: 0, step: 1, labelKey: 'intervalHours', hintKey: 'intervalHoursHint' },
  { id: 'startupDelayMs', group: 'catalog', path: ['catalog', 'startupDelayMs'], legacy: 'startupDelayMs', kind: 'number', min: 0, step: 500, labelKey: 'startupDelayMs', hintKey: 'startupDelayMsHint' },
  { id: 'minModelRatio', group: 'catalog', path: ['catalog', 'minModelRatio'], legacy: 'minModelRatio', kind: 'number', min: 0.05, max: 1, step: 0.05, labelKey: 'minModelRatio', hintKey: 'minModelRatioHint' },
  { id: 'keepModels', group: 'catalog', path: ['catalog', 'keepModels'], legacy: 'keepModels', kind: 'list', labelKey: 'keepModels', hintKey: 'keepModelsHint' },
  { id: 'installerUrls', group: 'catalog', path: ['catalog', 'installerUrls'], legacy: 'installerUrls', kind: 'list', labelKey: 'installerUrls', hintKey: 'installerUrlsHint' },
  { id: 'syncAllowlist', group: 'catalog', path: ['catalog', 'syncAllowlist'], legacy: 'syncAllowlist', kind: 'switch', labelKey: 'syncAllowlist', hintKey: 'syncAllowlistHint' },
  { id: 'allowlistEntryId', group: 'catalog', path: ['catalog', 'allowlistEntryId'], legacy: 'allowlistEntryId', kind: 'text', labelKey: 'allowlistEntryId', hintKey: 'allowlistEntryIdHint' },

  { id: 'refreshMinutes', group: 'coefficients', path: ['coefficients', 'refreshMinutes'], legacy: null, kind: 'number', min: 1, step: 1, labelKey: 'refreshMinutes', hintKey: 'refreshMinutesHint' },
  { id: 'showFast', group: 'coefficients', path: ['coefficients', 'showFast'], legacy: null, kind: 'switch', labelKey: 'showFast', hintKey: 'showFastHint' },

  { id: 'refreshSeconds', group: 'balance', path: ['balance', 'refreshSeconds'], legacy: null, kind: 'number', min: 0, step: 5, labelKey: 'refreshSeconds', hintKey: 'refreshSecondsHint' },
  { id: 'showDelta', group: 'balance', path: ['balance', 'showDelta'], legacy: null, kind: 'switch', labelKey: 'showDelta', hintKey: 'showDeltaHint' },

  { id: 'entryId', group: 'advanced', path: ['providers', 'entryId'], legacy: 'entryId', kind: 'text', labelKey: 'entryId', hintKey: 'entryIdHint' },
  { id: 'match', group: 'advanced', path: ['providers', 'match'], legacy: null, kind: 'list', labelKey: 'match', hintKey: 'matchHint' },
  { id: 'apiKeyEnv', group: 'advanced', path: ['providers', 'apiKeyEnv'], legacy: 'apiKeyEnv', kind: 'text', labelKey: 'apiKeyEnv', hintKey: 'apiKeyEnvHint' },
  { id: 'baseURL', group: 'advanced', path: ['providers', 'baseURL'], legacy: 'baseURL', kind: 'text', labelKey: 'baseURL', hintKey: 'baseURLHint' },
  { id: 'timeoutMs', group: 'advanced', path: ['providers', 'timeoutMs'], legacy: 'timeoutMs', kind: 'number', min: 1, step: 1000, labelKey: 'timeoutMs', hintKey: 'timeoutMsHint' },
  { id: 'levelsCacheMinutes', group: 'advanced', path: ['catalog', 'levelsCacheMinutes'], legacy: 'levelsCacheMinutes', kind: 'number', min: 0, step: 10, labelKey: 'levelsCacheMinutes', hintKey: 'levelsCacheMinutesHint' },
]

/** Поля в порядке показа и в порядке записи конфига. */
export const FIELD_LIST = Object.freeze(FIELDS.map((field) => Object.freeze(field)))

/** Поля выбранной группы. */
export function fieldsOfGroup(groupId) {
  return FIELD_LIST.filter((field) => field.group === groupId)
}

/**
 * Умолчания схемы 2.0.0 (§2 спеки).
 *
 * Копия нужна как запасной источник: если хост пришлёт `state.defaults`,
 * страница возьмёт его, иначе — эти значения. Дублирование намеренное:
 * страница должна работать и без дополнительного поля в ответе.
 */
export const DEFAULT_CONFIG = Object.freeze({
  features: Object.freeze({ catalogSync: true, coefficients: true, balance: true }),
  providers: Object.freeze({
    match: Object.freeze(['cheapvibecode.ru']),
    entryId: 'llm-pi-ai',
    apiKeyEnv: 'CVC_DEEPSEEK_API_KEY',
    baseURL: 'https://ru.cheapvibecode.ru/v1',
    timeoutMs: 20000,
  }),
  catalog: Object.freeze({
    provider: 'cheapvibecode',
    autoSync: true,
    intervalHours: 24,
    startupDelayMs: 5000,
    minModelRatio: 0.8,
    keepModels: Object.freeze([]),
    installerUrls: Object.freeze(['https://ru.cheapvibecode.ru/idhw', 'https://ru.cheapvibecode.ru/idhl']),
    syncAllowlist: true,
    allowlistEntryId: 'subagent-model-selection-settings',
    levelsCacheMinutes: 360,
  }),
  coefficients: Object.freeze({ refreshMinutes: 10, showFast: true }),
  balance: Object.freeze({ refreshSeconds: 0, showDelta: true }),
})

/** Обычный объект (не массив и не `null`). */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Прочитать путь в объекте, `undefined` на любом промахе. */
function getPath(object, path) {
  let current = object
  for (const key of path) {
    if (!isPlainObject(current)) return undefined
    current = current[key]
  }
  return current
}

/** Записать путь в объект, создавая недостающие группы. */
function setPath(object, path, value) {
  let current = object
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]
    if (!isPlainObject(current[key])) current[key] = {}
    current = current[key]
  }
  current[path[path.length - 1]] = value
}

/** Глубокая копия значения без функций и без ссылок на исходный объект. */
function clone(value) {
  if (Array.isArray(value)) return value.map((item) => clone(item))
  if (isPlainObject(value)) {
    const copy = {}
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item)
    return copy
  }
  return value
}

/**
 * Привести одно значение к типу поля.
 *
 * Строки-списки из текстового поля приходят массивом, но защита от строки
 * нужна: конфиг мог быть собран руками в YAML, где список — одна строка.
 *
 * @param {{ kind: string }} field - описание поля.
 * @param {unknown} raw - значение из конфига или из формы.
 * @returns {string | number | boolean | string[]} нормализованное значение.
 */
export function coerceValue(field, raw) {
  if (field.kind === 'switch') return raw === true
  if (field.kind === 'number') {
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string' && raw.trim() !== '') {
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : Number.NaN
    }
    return Number.NaN
  }
  if (field.kind === 'list') {
    if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter((item) => item.length > 0)
    if (typeof raw === 'string') return raw.split(/[\n,]+/).map((item) => item.trim()).filter((item) => item.length > 0)
    return []
  }
  return typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw)
}

/**
 * Прочитать поле конфига: сначала новый вид, затем плоский ключ 1.x, затем
 * умолчание схемы.
 *
 * @param {Record<string, unknown> | null | undefined} config - конфиг из стора.
 * @param {{ id: string, path: string[], legacy: string | null, kind: string }} field - поле.
 * @returns {unknown} значение для формы.
 */
export function readField(config, field) {
  const source = isPlainObject(config) ? config : {}
  const nested = getPath(source, field.path)
  if (nested !== undefined) return coerceValue(field, nested)
  const legacy = field.legacy === null ? undefined : source[field.legacy]
  if (legacy !== undefined) return coerceValue(field, legacy)
  const fallback = getPath(DEFAULT_CONFIG, field.path)
  return coerceValue(field, fallback)
}

/**
 * Прочитать все функции из конфига и стора.
 *
 * Стор отдаёт `features` отдельным полем ответа, но в конфиге они тоже есть:
 * если поля `features` в ответе нет, значения берутся оттуда.
 *
 * @param {Record<string, unknown> | null | undefined} features - `features` из ответа.
 * @param {Record<string, unknown> | null | undefined} config - конфиг.
 * @returns {{ catalogSync: boolean, coefficients: boolean, balance: boolean }} значения.
 */
export function readFeatures(features, config) {
  const fromConfig = isPlainObject(config) && isPlainObject(config.features) ? config.features : {}
  const fromState = isPlainObject(features) ? features : {}
  const result = {}
  for (const key of FEATURE_KEYS) {
    if (typeof fromState[key] === 'boolean') result[key] = fromState[key]
    else if (typeof fromConfig[key] === 'boolean') result[key] = fromConfig[key]
    else result[key] = DEFAULT_CONFIG.features[key]
  }
  return result
}

/**
 * Собрать черновик формы из конфига.
 *
 * @param {Record<string, unknown> | null | undefined} config - конфиг из стора.
 * @param {Record<string, unknown> | null | undefined} [features] - функции из ответа.
 * @returns {{ features: Record<string, boolean>, values: Record<string, unknown> }} черновик.
 */
export function createDraft(config, features) {
  const values = {}
  for (const field of FIELD_LIST) values[field.id] = readField(config, field)
  return { features: readFeatures(features, config), values }
}

/** Черновик с умолчаниями схемы. */
export function defaultsDraft() {
  return createDraft(DEFAULT_CONFIG, DEFAULT_CONFIG.features)
}

/**
 * Собрать тело запроса `PUT /cvc/config` из черновика.
 *
 * Неизвестные ключи основы сохраняются: страница не должна выкидывать поля,
 * которых не знает. Плоские ключи 1.x, которыми управляет форма, удаляются —
 * иначе хост увидит и старое, и новое значение одного параметра.
 *
 * @param {{ features: Record<string, boolean>, values: Record<string, unknown> }} draft - черновик.
 * @param {Record<string, unknown> | null | undefined} [base] - текущий конфиг как основа.
 * @returns {Record<string, unknown>} конфиг 2.0.0.
 */
export function draftToConfig(draft, base) {
  const source = isPlainObject(base) && Object.keys(base).length > 0 ? base : DEFAULT_CONFIG
  const next = clone(source)
  for (const group of GROUPS) {
    if (!isPlainObject(next[group.id])) next[group.id] = {}
  }
  for (const field of FIELD_LIST) {
    const raw = draft.values[field.id]
    const value = coerceValue(field, raw)
    setPath(next, field.path, field.kind === 'number' && Number.isNaN(value) ? null : value)
    if (field.legacy !== null) delete next[field.legacy]
  }
  const features = {}
  for (const key of FEATURE_KEYS) features[key] = draft.features[key] === true
  next.features = features
  return next
}

/** Сравнить черновик с конфигом по нормализованным значениям. */
export function isDirty(draft, config, features) {
  const current = createDraft(config, features)
  return JSON.stringify(current) !== JSON.stringify(draft)
}

/** Значение поля из черновика (для контролов формы). */
export function draftValue(draft, fieldId) {
  return draft?.values?.[fieldId]
}

/** Записать значение поля в черновик, не меняя остальные. */
export function withField(draft, fieldId, value) {
  return { ...draft, values: { ...draft.values, [fieldId]: value } }
}

/** Включить или выключить функцию в черновике. */
export function withFeature(draft, key, value) {
  return { ...draft, features: { ...draft.features, [key]: value === true } }
}

/** Похоже ли значение на адрес http(s). */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Проверить черновик перед сохранением.
 *
 * Проверка не заменяет хостовую: сервер всё равно валидирует по схеме и отвечает
 * 400 со списком полей. Здесь ловятся очевидные опечатки, чтобы не гонять
 * заведомо неверный запрос и показать ошибку рядом с полем.
 *
 * @param {{ features: Record<string, boolean>, values: Record<string, unknown> }} draft - черновик.
 * @returns {Array<{ field: string, code: string }>} ошибки в порядке полей.
 */
export function validateDraft(draft) {
  const errors = []
  for (const field of FIELD_LIST) {
    const value = draft.values[field.id]
    if (field.kind === 'number') {
      const number = coerceValue(field, value)
      if (!Number.isFinite(number)) {
        errors.push({ field: field.id, code: 'errNumber' })
        continue
      }
      if (field.id === 'minModelRatio' && (number <= 0 || number > 1)) {
        errors.push({ field: field.id, code: 'errRatio' })
        continue
      }
      if (field.id === 'refreshSeconds' && number !== 0 && number < 15) {
        errors.push({ field: field.id, code: 'errSeconds' })
        continue
      }
      if (field.id === 'refreshMinutes' && number < 1) {
        errors.push({ field: field.id, code: 'errMinutes' })
        continue
      }
      const min = field.min === undefined ? -Infinity : field.min
      const max = field.max === undefined ? Infinity : field.max
      if (number < min || number > max) errors.push({ field: field.id, code: 'errNumber' })
      continue
    }
    if (field.kind === 'list') {
      const list = coerceValue(field, value)
      if (field.id === 'installerUrls' && list.some((item) => !isHttpUrl(item))) {
        errors.push({ field: field.id, code: 'errUrl' })
      }
      if (field.id === 'match' && list.length === 0) errors.push({ field: field.id, code: 'errEmpty' })
      continue
    }
    if (field.kind === 'text') {
      const text = coerceValue(field, value)
      if (field.id === 'baseURL' && !isHttpUrl(text)) errors.push({ field: field.id, code: 'errUrl' })
      if ((field.id === 'provider' || field.id === 'entryId') && text.trim() === '') {
        errors.push({ field: field.id, code: 'errEmpty' })
      }
    }
  }
  return errors
}
