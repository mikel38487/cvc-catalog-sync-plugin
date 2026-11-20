/**
 * Синхронизация каталога моделей CheapVibeCode с профильным патчем DSH.
 *
 * Каталог моделей CVC меняется часто, а уровни мышления лежат не в API, а в
 * литерале `reasoningLevels` официального установщика. Штатного обновления в
 * DSH нет, поэтому плагин делает это сам:
 *
 * 1. забирает `GET {baseURL}/models` ключом провайдера;
 * 2. забирает установщик (`/idhw`, запасной `/idhl`) и вытаскивает карту
 *    `reasoningLevels` регуляркой;
 * 3. собирает `models` по правилам установщика (`modelFromCatalog`);
 * 4. точечно пишет результат в строку `llm-pi-ai` профильного патча через
 *    `ctx.configEditor.edit()` — единственный sanctioned-путь записи: он
 *    сохраняет комментарии и чужие строки, пишет атомарно, а `dsh-hmr`
 *    перечитывает патч без перезапуска приложения.
 *
 * Запись выполняется только при реальном изменении каталога, и только если
 * число моделей не провалилось ниже доли от текущего (`minModelRatio`):
 * пустой или обрезанный ответ API не должен стирать рабочий список.
 *
 * Ручной запуск — инструмент `cvc_catalog` (status / plan / apply).
 *
 * @module cvc-catalog-sync-plugin
 */

/**
 * Уровни, которые схема llm-pi-ai принимает ключами `reasoningEfforts`
 * (`THINKING_LEVELS`). Значения — проводное написание, произвольная строка,
 * поэтому `high: thinking` допустим.
 */
const WIRE_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/** Полный ряд уровней для модели с `supports_reasoning`, но без явной карты. */
const FULL_ROW = Object.freeze({
  off: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
})

/** Официальные установщики CVC: PowerShell для Windows, bash для Linux/WSL. */
const DEFAULT_INSTALLER_URLS = Object.freeze([
  'https://ru.cheapvibecode.ru/idhw',
  'https://ru.cheapvibecode.ru/idhl',
])

/** Имя инструмента ручного запуска. */
const TOOL_NAME = 'cvc_catalog'

/**
 * Проверить, что значение — обычный объект (не массив и не null).
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Привести значение к строке с умолчанием.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

/**
 * Положительное целое или null.
 * @param {unknown} value
 * @returns {number | null}
 */
function positiveInt(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

/**
 * Первое положительное целое по списку полей каталога.
 * @param {Record<string, unknown>} item
 * @param {readonly string[]} keys
 * @returns {number | null}
 */
function firstPositiveInt(item, keys) {
  for (const key of keys) {
    const value = positiveInt(item[key])
    if (value !== null) return value
  }
  return null
}

/**
 * Задержка/таймаут из конфига: конечное число не меньше `min`, но не больше
 * предела `setTimeout`/`AbortSignal.timeout` (2^31-1 мс). Большее значение
 * Node молча исполняет как 1 мс, что хуже явного ограничения.
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @returns {number}
 */
function delayOr(value, fallback, min) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) return fallback
  return Math.min(Math.round(value), 2147483647)
}

/** Текст ошибки без предположения о её типе. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Снять хвостовые слэши без регулярки: значение приходит из конфигурации. */
function stripTrailingSlashes(value) {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  return value.slice(0, end)
}

/** Снять слэши с обоих концов строки без регулярки. */
function trimSlashes(value) {
  let start = 0
  let end = value.length
  while (start < end && value[start] === '/') start += 1
  while (end > start && value[end - 1] === '/') end -= 1
  return value.slice(start, end)
}

/** Пустой ли дифф. */
function isDiffEmpty(diff) {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changedCount === 0
}

/**
 * Нормализовать конфигурацию строки плагина.
 *
 * Битые значения не бросают: плагин должен подниматься и с неполным конфигом,
 * иначе одна опечатка в патче выключает автообновление молча.
 * @param {unknown} raw
 * @returns {Record<string, any>}
 */
function normalizeConfig(raw) {
  const source = isPlainObject(raw) ? raw : {}
  const installerUrls = Array.isArray(source.installerUrls)
    ? source.installerUrls.filter((url) => typeof url === 'string' && url.trim().length > 0).map((url) => url.trim())
    : []
  const intervalHours = typeof source.intervalHours === 'number' && Number.isFinite(source.intervalHours) && source.intervalHours >= 0
    ? source.intervalHours
    : 24
  const ratio = typeof source.minModelRatio === 'number' && Number.isFinite(source.minModelRatio)
    && source.minModelRatio > 0 && source.minModelRatio <= 1
    ? source.minModelRatio
    : 0.8
  return {
    entryId: stringOr(source.entryId, 'llm-pi-ai'),
    provider: stringOr(source.provider, 'cheapvibecode'),
    baseURL: stringOr(source.baseURL, 'https://ru.cheapvibecode.ru/v1'),
    apiKeyEnv: stringOr(source.apiKeyEnv, 'CVC_DEEPSEEK_API_KEY'),
    installerUrls: installerUrls.length > 0 ? installerUrls : [...DEFAULT_INSTALLER_URLS],
    autoSync: source.autoSync !== false,
    startupDelayMs: delayOr(source.startupDelayMs, 5000, 0),
    intervalHours,
    minModelRatio: ratio,
    keepModels: Array.isArray(source.keepModels)
      ? source.keepModels.filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())
      : [],
    syncAllowlist: source.syncAllowlist !== false,
    allowlistEntryId: stringOr(source.allowlistEntryId, 'subagent-model-selection-settings'),
    timeoutMs: delayOr(source.timeoutMs, 30000, 1),
    levelsCacheMinutes: typeof source.levelsCacheMinutes === 'number' && Number.isFinite(source.levelsCacheMinutes)
      && source.levelsCacheMinutes >= 0
      ? source.levelsCacheMinutes
      : 360,
  }
}

/**
 * Разобрать ответ `GET /v1/models`.
 *
 * Принимается и OpenAI-форма `{ data: [...] }`, и голый массив. Записи без
 * строкового `id` отбрасываются: без идентификатора модель в конфиг не
 * положить.
 * @param {unknown} body
 * @returns {Array<Record<string, unknown>>}
 */
function parseCatalogPayload(body) {
  const rows = Array.isArray(body)
    ? body
    : isPlainObject(body) && Array.isArray(body.data)
      ? body.data
      : []
  const items = []
  for (const row of rows) {
    if (!isPlainObject(row)) continue
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (id.length === 0) continue
    items.push(row)
  }
  return items
}

/**
 * Вытащить карту `reasoningLevels` из текста установщика.
 *
 * В обоих установщиках это литерал `const reasoningLevels = {...};` с
 * JSON-совместимым содержимым: вложенных объектов внутри нет, поэтому
 * нежадный разбор до первой `};` безопасен. Дополнительно проверяется, что
 * каждый уровень — строка: битая карта не должна молча менять конфиг.
 * @param {unknown} text
 * @returns {Record<string, string[]> | null}
 */
function parseReasoningLevels(text) {
  if (typeof text !== 'string' || text.length === 0) return null
  // Линейный разбор без регулярки: текст приходит из сети, а нежадный
  // `[\s\S]*?` на большом файле — кандидат на квадратичный откат.
  const start = text.indexOf('const reasoningLevels')
  if (start < 0) return null
  const open = text.indexOf('{', start)
  if (open < 0) return null
  const close = text.indexOf('};', open)
  if (close < 0) return null
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(text.slice(open, close + 1))
  } catch {
    return null
  }
  if (!isPlainObject(parsed)) return null
  /** @type {Record<string, string[]>} */
  const map = {}
  for (const [id, levels] of Object.entries(parsed)) {
    if (!Array.isArray(levels)) continue
    const clean = levels
      .filter((level) => typeof level === 'string' && level.trim().length > 0)
      .map((level) => level.trim())
    if (clean.length > 0) map[id] = clean
  }
  return Object.keys(map).length > 0 ? map : null
}

/**
 * Имя модели для UI: хвост `display_name` после разделителя ` · `.
 * @param {Record<string, unknown>} item
 * @param {string} id
 * @returns {string}
 */
function modelName(item, id) {
  const raw = typeof item.display_name === 'string' && item.display_name.trim().length > 0
    ? item.display_name.trim()
    : typeof item.name === 'string' && item.name.trim().length > 0
      ? item.name.trim()
      : id
  const tail = raw.includes(' · ') ? raw.split(' · ').pop()?.trim() : raw
  return tail && tail.length > 0 ? tail : id
}

/**
 * Построить `reasoningEfforts` для одной модели.
 *
 * Правила переноса взяты из `reasoningEffortsFor` установщика:
 * `none` → ключ `off` со значением `none`, `thinking` → ключ `high` со
 * значением `thinking`, остальные уровни — ключ = значение.
 *
 * Схема llm-pi-ai ограничивает **ключи** (`THINKING_LEVELS`), а значения —
 * произвольная строка (это и есть проводное написание, которое шлёт адаптер),
 * поэтому `high: thinking` допустим.
 *
 * Порядок источников:
 * 1. явная карта установщика;
 * 2. текущее значение из патча (карта недоступна — не трогаем то, что уже
 *    настроено);
 * 3. `supports_reasoning === true` → полный ряд, иначе `false`.
 * @param {string} id
 * @param {Record<string, unknown>} item
 * @param {Record<string, unknown> | undefined} existing
 * @param {Record<string, string[]> | null} levelMap
 * @param {string[]} warnings
 * @returns {Record<string, string> | false}
 */
function reasoningEffortsFor(id, item, existing, levelMap, warnings) {
  const levels = levelMap === null ? undefined : levelMap[id]
  if (Array.isArray(levels) && levels.length > 0) {
    /** @type {Record<string, string>} */
    const efforts = {}
    for (const level of levels) {
      if (level === 'none') efforts.off = 'none'
      else if (level === 'thinking') efforts.high = 'thinking'
      else if (WIRE_LEVELS.includes(level)) efforts[level] = level
      else warnings.push(`model ${id}: unknown level "${level}", dropped`)
    }
    const keys = Object.keys(efforts)
    // `resolveModelReasoning` в llm-pi-ai отвергает карту, не предлагающую
    // уровня кроме `off`, и это роняет всю запись. Такую карту не отдаём:
    // падаем в источники ниже (текущее значение, полный ряд, false).
    if (keys.length > 1 || (keys.length === 1 && keys[0] !== 'off')) return efforts
    warnings.push(`model ${id}: level list ${JSON.stringify(levels)} offers no level beyond "off", falling back`)
  }
  if (existing !== undefined && existing.reasoningEfforts !== undefined) {
    return /** @type {Record<string, string> | false} */ (existing.reasoningEfforts)
  }
  if (item.supports_reasoning === true) return { ...FULL_ROW }
  return false
}

/**
 * Собрать модели из каталога по правилам установщика `modelFromCatalog`.
 *
 * Модели без текстового вывода и `gpt-image*` пропускаются: адаптер не сможет
 * их обслужить. Значения контекста и вывода при отсутствии в каталоге берутся
 * из текущей записи патча — так ручная правка пользователя не теряется.
 * @param {Array<Record<string, unknown>>} catalog
 * @param {Record<string, string[]> | null} levelMap
 * @param {Array<Record<string, unknown>>} existingModels
 * @param {ReturnType<typeof normalizeConfig>} cfg
 * @returns {{ models: Array<Record<string, unknown>>, warnings: string[] }}
 */
function buildModels(catalog, levelMap, existingModels, cfg) {
  /** @type {Map<string, Record<string, unknown>>} */
  const existingById = new Map()
  for (const model of existingModels) {
    if (typeof model.id === 'string') existingById.set(model.id, model)
  }
  /** @type {Array<Record<string, unknown>>} */
  const models = []
  /** @type {string[]} */
  const warnings = []
  /** @type {Set<string>} */
  const seen = new Set()

  for (const item of catalog) {
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (id.length === 0) continue
    if (id.toLowerCase().startsWith('gpt-image')) continue
    if (seen.has(id)) continue

    const outputs = Array.isArray(item.output_modalities)
      ? item.output_modalities.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
      : []
    if (outputs.length > 0 && !outputs.includes('text')) continue

    const existing = existingById.get(id)
    const contextWindow = firstPositiveInt(item, ['context_window', 'contextWindow', 'context_length', 'max_context_tokens'])
      ?? (existing === undefined ? null : positiveInt(existing.contextWindow))
      ?? 128000
    const advertisedMax = firstPositiveInt(item, ['max_output_tokens', 'max_tokens'])
      ?? (existing === undefined ? null : positiveInt(existing.maxTokens))
      ?? 16384
    const maxTokens = Math.min(advertisedMax, contextWindow)

    // Каталог главнее текущей записи: если он объявил модальности, решение
    // принимается по ним, а `supports_vision: false` означает «картинки нет»,
    // даже когда в патче она когда-то была. Текущая запись отвечает только
    // там, где каталог о зрении молчит вовсе.
    const advertisedInputs = Array.isArray(item.input_modalities)
      ? item.input_modalities.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
      : []
    let input
    if (advertisedInputs.length > 0) {
      input = advertisedInputs.includes('image') || item.supports_vision === true ? ['text', 'image'] : ['text']
    } else if (item.supports_vision === true) {
      input = ['text', 'image']
    } else if (item.supports_vision === false) {
      input = ['text']
    } else if (Array.isArray(existing?.input) && existing.input.length > 0) {
      input = [...existing.input]
    } else {
      input = ['text']
    }

    const model = {
      id,
      name: modelName(item, id),
      contextWindow,
      maxTokens,
      input,
      reasoningEfforts: reasoningEffortsFor(id, item, existing, levelMap, warnings),
    }
    if (isPlainObject(existing?.compat)) model.compat = existing.compat
    models.push(model)
    seen.add(id)
  }

  for (const id of cfg.keepModels) {
    if (seen.has(id)) continue
    const existing = existingById.get(id)
    if (existing === undefined) {
      warnings.push(`keepModels: "${id}" is neither in the catalog nor in the patch`)
      continue
    }
    models.push(existing)
    seen.add(id)
    warnings.push(`keepModels: "${id}" kept although the catalog no longer lists it`)
  }

  return { models, warnings }
}

/**
 * Стабильная JSON-строка: ключи сортируются, порядок полей не считается
 * изменением.
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Сравнить текущий набор моделей с новым.
 * @param {Array<Record<string, unknown>>} current
 * @param {Array<Record<string, unknown>>} next
 * @returns {{ added: string[], removed: string[], changed: Array<{ id: string, fields: string[] }>, changedCount: number }}
 */
function diffModels(current, next) {
  /** @type {Map<string, Record<string, unknown>>} */
  const currentById = new Map()
  for (const model of current) {
    if (typeof model.id === 'string') currentById.set(model.id, model)
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const nextById = new Map()
  for (const model of next) {
    if (typeof model.id === 'string') nextById.set(model.id, model)
  }
  const added = [...nextById.keys()].filter((id) => !currentById.has(id))
  const removed = [...currentById.keys()].filter((id) => !nextById.has(id))
  /** @type {Array<{ id: string, fields: string[] }>} */
  const changed = []
  for (const [id, model] of nextById) {
    const before = currentById.get(id)
    if (before === undefined) continue
    const fields = []
    for (const key of Object.keys(model)) {
      if (stableStringify(model[key]) !== stableStringify(before[key])) fields.push(key)
    }
    for (const key of Object.keys(before)) {
      if (!(key in model)) fields.push(key)
    }
    if (fields.length > 0) changed.push({ id, fields })
  }
  return { added, removed, changed, changedCount: changed.length }
}

/**
 * Объединить сигнал вызова инструмента с таймаутом запроса.
 * @param {AbortSignal | undefined} signal
 * @param {number} timeoutMs
 * @returns {AbortSignal}
 */
function fetchSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

/** JSON-схема вывода инструмента: только поддерживаемые ключевые слова. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'action', 'ok', 'at', 'provider', 'catalogModels', 'currentModels', 'nextModels',
    'levelsSource', 'applied', 'added', 'removed', 'changed', 'warnings', 'allowlist', 'error',
  ],
  properties: {
    action: { type: 'string', enum: ['status', 'plan', 'apply'] },
    ok: { type: 'boolean' },
    at: { type: 'string' },
    provider: { type: 'string' },
    catalogModels: { type: 'integer' },
    currentModels: { type: 'integer' },
    nextModels: { type: 'integer' },
    levelsSource: { type: 'string' },
    applied: { type: 'boolean' },
    added: { type: 'array', items: { type: 'string' } },
    removed: { type: 'array', items: { type: 'string' } },
    changed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'fields'],
        properties: {
          id: { type: 'string' },
          fields: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
    allowlist: {
      type: 'object',
      additionalProperties: false,
      required: ['pruned', 'added', 'skipped', 'changed'],
      properties: {
        pruned: { type: 'array', items: { type: 'string' } },
        added: { type: 'array', items: { type: 'string' } },
        skipped: { type: 'boolean' },
        changed: { type: 'boolean' },
      },
    },
    error: { type: 'string' },
  },
}

/**
 * Текст результата для модели и пользователя.
 * @param {Record<string, any>} value
 * @returns {string}
 */
function renderValue(value) {
  const lines = [
    `${value.action}: ${value.provider} — catalog ${value.catalogModels}, current ${value.currentModels}, next ${value.nextModels}; levels: ${value.levelsSource}${value.applied ? '; applied' : ''}`,
  ]
  if (value.added.length > 0) lines.push(`added: ${value.added.join(', ')}`)
  if (value.removed.length > 0) lines.push(`removed: ${value.removed.join(', ')}`)
  if (value.changed.length > 0) {
    lines.push(`changed: ${value.changed.map((entry) => `${entry.id} (${entry.fields.join('/')})`).join(', ')}`)
  }
  if (value.added.length === 0 && value.removed.length === 0 && value.changed.length === 0) lines.push('catalog: no difference')
  if (value.allowlist.pruned.length > 0) lines.push(`allowlist pruned: ${value.allowlist.pruned.join(', ')}`)
  if (value.allowlist.added.length > 0) lines.push(`allowlist added: ${value.allowlist.added.join(', ')}`)
  if (value.allowlist.changed && value.allowlist.pruned.length === 0 && value.allowlist.added.length === 0) {
    lines.push('allowlist: duplicates or order fixed')
  }
  for (const warning of value.warnings) lines.push(`warning: ${warning}`)
  if (value.error.length > 0) lines.push(`error: ${value.error}`)
  return lines.join('\n')
}

/** Строка композиции, которой владеет плагин (совпадает с id в cordis.patch.yml). */
const SELF_ROW_ID = 'cvc-catalog-sync'

/** Префикс HTTP-маршрута настроек; совпадает с константой клиентской половины. */
const SETTINGS_API_PREFIX = '/cvc-catalog-sync'

/** Верхняя граница тела запроса настроек: конфиг — это несколько килобайт. */
const SETTINGS_BODY_LIMIT = 65536

/**
 * Проверить, что строка — http(s)-адрес.
 * @param {unknown} value
 * @returns {boolean}
 */
function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Проверить пользовательский ввод перед записью в патч.
 *
 * Возвращает список понятных ошибок, а не молча подставляет умолчания:
 * опечатка в интерфейсе не должна тихо превращаться в другие настройки.
 * @param {unknown} raw
 * @returns {string[]}
 */
function validateConfigInput(raw) {
  if (!isPlainObject(raw)) return ['config: object required']
  const errors = []
  for (const key of ['entryId', 'provider', 'apiKeyEnv', 'baseURL', 'allowlistEntryId']) {
    if (typeof raw[key] !== 'string' || raw[key].trim().length === 0) errors.push(`${key}: non-empty string required`)
  }
  if (typeof raw.baseURL === 'string' && raw.baseURL.trim().length > 0 && !isHttpUrl(raw.baseURL)) {
    errors.push('baseURL: http(s) URL required')
  }
  for (const key of ['installerUrls']) {
    const value = raw[key]
    if (!Array.isArray(value) || value.length === 0) {
      errors.push(`${key}: non-empty list of URLs required`)
      continue
    }
    if (value.some((url) => !isHttpUrl(url))) errors.push(`${key}: every item must be an http(s) URL`)
  }
  if (!Array.isArray(raw.keepModels) || raw.keepModels.some((id) => typeof id !== 'string')) {
    errors.push('keepModels: list of strings required')
  }
  for (const key of ['autoSync', 'syncAllowlist']) {
    if (typeof raw[key] !== 'boolean') errors.push(`${key}: boolean required`)
  }
  const numbers = [
    ['intervalHours', 0, Infinity],
    ['startupDelayMs', 0, Infinity],
    ['levelsCacheMinutes', 0, Infinity],
    ['timeoutMs', 1, Infinity],
    ['minModelRatio', Number.MIN_VALUE, 1],
  ]
  for (const [key, min, max] of numbers) {
    const value = raw[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      errors.push(`${key}: number in [${min}, ${max}] required`)
    }
  }
  return errors
}

/**
 * Ответить JSON без кэширования.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

/**
 * Прочитать JSON-тело запроса с ограничением размера.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<unknown>}
 */
function readJsonBody(req, limit = SETTINGS_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim().length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch (error) {
        reject(new Error(`invalid JSON: ${messageOf(error)}`))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Текущее состояние для страницы настроек.
 *
 * `config` — действующие значения (слой профиля поверх слоя бандла),
 * `override` — то, что записано в профильном патче, `defaults` — умолчания.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} selfRowId
 * @param {Record<string, any>} status
 * @returns {Record<string, any>}
 */
function settingsState(ctx, selfRowId, status) {
  const editor = ctx.configEditor
  const layers = editor.configuration().find((row) => row.entry?.options?.id === selfRowId)
  const inherited = isPlainObject(layers?.inherited) ? layers.inherited : {}
  const override = isPlainObject(layers?.override) ? layers.override : {}
  const config = normalizeConfig({ ...inherited, ...override })
  const llmEntry = editor.entries().find((candidate) => candidate.options?.id === config.entryId)
  const providers = isPlainObject(llmEntry?.options?.config?.providers)
    ? Object.keys(llmEntry.options.config.providers)
    : []
  return {
    config,
    override,
    defaults: normalizeConfig({}),
    providers,
    patchPath: editor.documentPath,
    rowId: selfRowId,
    active: layers !== undefined,
    status,
  }
}

/**
 * Установить маршрут настроек.
 * @param {{ register: (route: any) => () => void }} webServer
 * @param {{ ctx: import('@deepseek-ai/cordis').Context, selfRowId: string, refresh: Function, toValue: Function, status: () => Record<string, any> }} deps
 * @returns {() => void}
 */
function installSettingsApi(webServer, deps) {
  const jsonRequest = (req) => String(req.headers['content-type'] ?? '').split(';')[0].trim() === 'application/json'
  return webServer.register({
    kind: 'prefix',
    path: SETTINGS_API_PREFIX,
    handler: async (req, res) => {
      if (String(req.headers['sec-fetch-site'] ?? '') === 'cross-site') {
        sendJson(res, 403, { error: 'forbidden' })
        return
      }
      let route
      try {
        route = trimSlashes(new URL(req.url ?? '/', 'http://localhost').pathname.slice(SETTINGS_API_PREFIX.length))
      } catch {
        sendJson(res, 400, { error: 'malformed url' })
        return
      }
      try {
        if (route === 'health' && req.method === 'GET') {
          sendJson(res, 200, { ok: true, plugin: deps.selfRowId })
          return
        }
        if (route === 'state' && req.method === 'GET') {
          sendJson(res, 200, settingsState(deps.ctx, deps.selfRowId, deps.status()))
          return
        }
        if (route === 'config' && (req.method === 'PUT' || req.method === 'POST')) {
          if (!jsonRequest(req)) {
            sendJson(res, 415, { error: 'content-type: application/json required' })
            return
          }
          const body = await readJsonBody(req)
          const raw = isPlainObject(body) && isPlainObject(body.config) ? body.config : body
          const errors = validateConfigInput(raw)
          if (errors.length > 0) {
            sendJson(res, 400, { error: 'invalid config', fields: errors })
            return
          }
          const editor = deps.ctx.configEditor
          const entry = editor.entries().find((candidate) => candidate.options?.id === deps.selfRowId)
          if (entry === undefined) {
            sendJson(res, 409, { error: `row "${deps.selfRowId}" is not active; enable the bundle first` })
            return
          }
          const next = normalizeConfig(raw)
          // Сброс к умолчаниям должен убрать переопределение, а не записать
          // в патч копию умолчаний: `edit` удаляет строку, когда новое
          // значение совпадает со слоем ниже.
          const resetToDefaults = stableStringify(next) === stableStringify(normalizeConfig({}))
          await editor.edit(entry, (current, inherited) => (resetToDefaults ? inherited : next))
          sendJson(res, 200, { ok: true, config: next })
          return
        }
        if (route === 'run' && req.method === 'POST') {
          if (!jsonRequest(req)) {
            sendJson(res, 415, { error: 'content-type: application/json required' })
            return
          }
          const body = await readJsonBody(req)
          const action = isPlainObject(body) && body.action === 'apply' ? 'apply' : 'plan'
          const force = isPlainObject(body) && body.force === true
          const result = await deps.refresh('tool', { apply: action === 'apply', force })
          sendJson(res, 200, deps.toValue(result, action))
          return
        }
        sendJson(res, 404, { error: 'not found' })
      } catch (error) {
        sendJson(res, 500, { error: messageOf(error) })
      }
    },
  })
}

/**
 * Сервисы, без которых плагин не работает: запись профильного патча, реестр
 * инструментов и разрешение ссылки на ключ.
 *
 * Плагин без них не активируется (Loader отложит запуск), а не падает.
 */
export const inject = ['configEditor', 'tools', 'credentials']

/**
 * Подключить плагин.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} [config]
 */
export function apply(ctx, config = {}) {
  const cfg = normalizeConfig(config)

  /** Последний прогон в этом процессе хоста. */
  let last = null
  /** Идущий прогон: параллельный вызов с тем же режимом ждёт его, а не открывает свой. */
  let inflight = null
  /** Кэш карты уровней: она меняется редко, а прогонов бывает два подряд. */
  let levelsCache = null

  /**
   * Записать строку в лог хоста, не падая на профиле без логгера.
   * @param {'info' | 'warn' | 'error'} level
   * @param {string} message
   */
  function log(level, message) {
    const logger = ctx.logger
    if (logger !== undefined && logger !== null && typeof logger[level] === 'function') {
      logger[level](`cvc-catalog-sync: ${message}`)
    }
  }

  /**
   * Разрешить ключ провайдера через сервис credentials.
   *
   * Порядок источников DSH сохраняется: хранилище плагина, затем переменные
   * окружения и `.env`. Значение остаётся на хосте и в лог не попадает.
   * @param {string} ref
   * @returns {Promise<string>}
   */
  async function resolveKey(ref) {
    const credentials = ctx.credentials
    if (credentials === undefined || typeof credentials.resolve !== 'function') return ''
    try {
      const hit = await credentials.resolve(ref)
      return typeof hit?.value === 'string' ? hit.value : ''
    } catch {
      return ''
    }
  }

  /**
   * Прочитать текущие модели маршрута из профильного патча.
   * @returns {{ entry: import('@deepseek-ai/cordis').Context['loader'] extends never ? any : any, models: Array<Record<string, unknown>> }}
   */
  function readCurrent() {
    const editor = ctx.configEditor
    const entry = editor.entries().find((candidate) => candidate.options?.id === cfg.entryId)
    if (entry === undefined) throw new Error(`profile entry "${cfg.entryId}" is not available`)
    const current = isPlainObject(entry.options.config) ? entry.options.config : {}
    const providers = isPlainObject(current.providers) ? current.providers : {}
    const profile = providers[cfg.provider]
    if (!isPlainObject(profile)) throw new Error(`provider route "${cfg.provider}" is not configured in "${cfg.entryId}"`)
    // llm-pi-ai отвергает `modelOverrides` рядом с `models`; сказать об этом
    // самим понятнее, чем получить отказ валидации при записи.
    if (isPlainObject(profile.modelOverrides) && Object.keys(profile.modelOverrides).length > 0) {
      throw new Error(
        `provider route "${cfg.provider}" uses modelOverrides; a models list cannot be written beside it — `
        + 'convert the route to an explicit models list first',
      )
    }
    const models = Array.isArray(profile.models) ? profile.models.filter(isPlainObject) : []
    return { entry, models }
  }

  /**
   * Забрать каталог провайдера.
   * @param {string} key
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  async function fetchCatalog(key, signal) {
    const url = `${stripTrailingSlashes(cfg.baseURL)}/models`
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: fetchSignal(signal, cfg.timeoutMs),
    })
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    let body
    try {
      body = await response.json()
    } catch (error) {
      throw new Error(`${url}: invalid JSON (${error instanceof Error ? error.message : String(error)})`)
    }
    const items = parseCatalogPayload(body)
    if (items.length === 0) throw new Error(`${url}: response contains no models`)
    return items
  }

  /**
   * Забрать карту уровней из установщика (первый успешный URL).
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<{ map: Record<string, string[]> | null, source: string, problems: string[] }>}
   */
  async function loadLevels(signal) {
    if (levelsCache !== null && levelsCache.map !== null
      && Date.now() - levelsCache.at < cfg.levelsCacheMinutes * 60000) {
      return levelsCache
    }
    const problems = []
    for (const url of cfg.installerUrls) {
      try {
        const response = await fetch(url, {
          headers: { accept: 'text/plain, */*' },
          signal: fetchSignal(signal, cfg.timeoutMs),
        })
        if (!response.ok) {
          problems.push(`${url}: HTTP ${response.status}`)
          continue
        }
        const text = await response.text()
        const map = parseReasoningLevels(text)
        if (map === null) {
          problems.push(`${url}: reasoningLevels literal not found`)
          continue
        }
        levelsCache = { map, source: url, at: Date.now(), problems: [] }
        return levelsCache
      } catch (error) {
        problems.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    for (const problem of problems) log('warn', problem)
    levelsCache = { map: null, source: 'none', at: 0, problems }
    return levelsCache
  }

  /**
   * Записать каталог в строку llm-pi-ai, пересобрав модели по свежему конфигу.
   *
   * `configEditor.edit` отдаёт конфиг на момент блокировки, поэтому сборка
   * внутри колбэка — единственный способ не потерять правку, сделанную между
   * чтением и записью (ручной `maxTokens`, `compat`). Там же проверяется
   * защита от усыхания каталога: её отказ не пишет файл.
   * @param {any} entry
   * @param {Array<Record<string, unknown>>} catalog
   * @param {Record<string, string[]> | null} levelMap
   * @param {boolean} force
   * @returns {Promise<{ models: Array<Record<string, unknown>>, warnings: string[], diff: ReturnType<typeof diffModels>, unchanged: boolean }>}
   */
  async function writeModels(entry, catalog, levelMap, force) {
    /** @type {any} */
    let outcome = null
    await ctx.configEditor.edit(entry, (current) => {
      const fresh = modelsFromConfig(current)
      const built = buildModels(catalog, levelMap, fresh, cfg)
      if (!force) {
        const minRequired = Math.max(1, Math.ceil(fresh.length * cfg.minModelRatio))
        if (built.models.length < minRequired) {
          throw new Error(
            `guard: catalog returned ${built.models.length} models, below ${minRequired} `
            + `(${Math.round(cfg.minModelRatio * 100)}% of current ${fresh.length}); `
            + 'nothing written, use force to override',
          )
        }
      }
      const diff = diffModels(fresh, built.models)
      outcome = { models: built.models, warnings: built.warnings, diff, unchanged: isDiffEmpty(diff) }
      return withModels(current, built.models)
    })
    return outcome
  }

  /**
   * Прочитать модели маршрута из raw-конфига строки.
   * @param {unknown} config
   * @returns {Array<Record<string, unknown>>}
   */
  function modelsFromConfig(config) {
    const providers = isPlainObject(config) && isPlainObject(config.providers) ? config.providers : {}
    const profile = providers[cfg.provider]
    return isPlainObject(profile) && Array.isArray(profile.models) ? profile.models.filter(isPlainObject) : []
  }

  /**
   * Собрать следующий raw-конфиг строки с новым списком моделей.
   * @param {unknown} current
   * @param {Array<Record<string, unknown>>} models
   * @returns {Record<string, unknown>}
   */
  function withModels(current, models) {
    const next = isPlainObject(current) ? { ...current } : {}
    const providers = isPlainObject(next.providers) ? { ...next.providers } : {}
    const profile = isPlainObject(providers[cfg.provider]) ? { ...providers[cfg.provider] } : {}
    profile.models = models
    providers[cfg.provider] = profile
    next.providers = providers
    return next
  }

  /**
   * Привести список доступных моделей сабагентов к каталогу маршрута.
   *
   * Чужие провайдеры сохраняются как есть: плагин владеет только своим
   * маршрутом. Если строки нет (плагин сабагентов не установлен) — пропуск.
   * @param {Array<Record<string, unknown>>} models
   * @returns {Promise<{ pruned: string[], added: string[], skipped: boolean, changed: boolean }>}
   */
  async function syncAllowlist(models) {
    const empty = { pruned: [], added: [], skipped: true, changed: false }
    if (!cfg.syncAllowlist) return empty
    const editor = ctx.configEditor
    const entry = editor.entries().find((candidate) => candidate.options?.id === cfg.allowlistEntryId)
    if (entry === undefined) return empty
    const catalogIds = models.map((model) => model.id)
    const catalogSet = new Set(catalogIds)
    const expected = (others) => [...others, ...catalogIds.map((id) => ({ provider: cfg.provider, model: id }))]
    /** Посчитать, что нужно поправить для одного снимка списка. */
    const planFor = (allowedValue) => {
      const allowedRows = Array.isArray(allowedValue) ? allowedValue.filter(isPlainObject) : []
      const ownIds = new Set(allowedRows.filter((row) => row.provider === cfg.provider).map((row) => row.model))
      return {
        allowed: allowedRows,
        others: allowedRows.filter((row) => row.provider !== cfg.provider),
        pruned: [...ownIds].filter((id) => !catalogSet.has(id)),
        added: catalogIds.filter((id) => !ownIds.has(id)),
      }
    }
    const snapshot = planFor(isPlainObject(entry.options.config) ? entry.options.config.allowedModels : [])
    // Сравнивается весь список, а не только pruned/added: дубли и порядок
    // собственных маршрутов в этих множествах не видны, а DSH их отвергает.
    if (stableStringify(snapshot.allowed) === stableStringify(expected(snapshot.others))) {
      return { pruned: [], added: [], skipped: false, changed: false }
    }
    /** @type {{ pruned: string[], added: string[], changed: boolean } | null} */
    let outcome = null
    await ctx.configEditor.edit(entry, (cur) => {
      const current = isPlainObject(cur) ? cur : {}
      // Пересчёт на момент блокировки: чужой список мог измениться, пока шли
      // запросы к каталогу.
      const fresh = planFor(current.allowedModels)
      const nextAllowed = expected(fresh.others)
      const changed = stableStringify(fresh.allowed) !== stableStringify(nextAllowed)
      outcome = { pruned: fresh.pruned, added: fresh.added, changed }
      return changed ? { ...current, allowedModels: nextAllowed } : current
    })
    log('info', `allowed models synced: +${outcome?.added.length ?? 0}/-${outcome?.pruned.length ?? 0}`)
    return {
      pruned: outcome?.pruned ?? [],
      added: outcome?.added ?? [],
      skipped: false,
      changed: outcome?.changed ?? false,
    }
  }

  /**
   * Один прогон: каталог → модели → (при необходимости) запись.
   * @param {'startup' | 'timer' | 'tool'} reason
   * @param {{ apply: boolean, force?: boolean, signal?: AbortSignal }} options
   * @returns {Promise<Record<string, any>>}
   */
  async function collect(reason, options) {
    /** @type {Record<string, any>} */
    const result = {
      ok: false,
      reason,
      at: new Date().toISOString(),
      provider: cfg.provider,
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
      error: '',
    }
    try {
      const key = await resolveKey(cfg.apiKeyEnv)
      if (key.length === 0) {
        throw new Error(`credential "${cfg.apiKeyEnv}" is not configured (process env, store or .env)`)
      }
      const catalog = await fetchCatalog(key, options.signal)
      result.catalogModels = catalog.length

      const levels = await loadLevels(options.signal)
      result.levelsSource = levels.source
      if (levels.map === null) {
        result.warnings.push('reasoning levels unavailable: existing levels preserved, new models fall back to supports_reasoning')
      }

      const current = readCurrent()
      result.currentModels = current.models.length

      const built = buildModels(catalog, levels.map, current.models, cfg)
      result.nextModels = built.models.length
      const warningsBeforeBuild = result.warnings.length
      result.warnings.push(...built.warnings)

      const diff = diffModels(current.models, built.models)
      result.added = diff.added
      result.removed = diff.removed
      result.changed = diff.changed

      const unchanged = isDiffEmpty(diff)

      if (!options.apply) {
        // plan ничего не пишет, поэтому защита от усыхания сообщается
        // предупреждением, а не отказом: дифф увидеть нужно.
        if (!unchanged && options.force !== true) {
          const minRequired = Math.max(1, Math.ceil(current.models.length * cfg.minModelRatio))
          if (built.models.length < minRequired) {
            result.warnings.push(
              `guard: ${built.models.length} models is below ${minRequired} `
              + `(${Math.round(cfg.minModelRatio * 100)}% of current ${current.models.length}); `
              + 'apply would refuse without force',
            )
          }
        }
        result.ok = true
        return result
      }

      if (unchanged) {
        // Модели совпадают, но список сабагентов мог разъехаться: чиним его.
        result.ok = true
        try {
          result.allowlist = await syncAllowlist(current.models)
          // Патч всё-таки записан — отчитываемся честно.
          result.applied = result.allowlist.changed
        } catch (error) {
          result.warnings.push(`allowed models not synced: ${messageOf(error)}`)
        }
        return result
      }

      const outcome = await writeModels(current.entry, catalog, levels.map, options.force === true)
      result.applied = outcome !== null && !outcome.unchanged
      if (outcome !== null) {
        result.nextModels = outcome.models.length
        result.added = outcome.diff.added
        result.removed = outcome.diff.removed
        result.changed = outcome.diff.changed
        // Предупреждения сборки на момент блокировки точнее предварительных.
        result.warnings.length = warningsBeforeBuild
        result.warnings.push(...outcome.warnings)
      }
      log('info', `applied catalog: ${result.nextModels} models (+${result.added.length}/-${result.removed.length}/~${result.changed.length})`)
      try {
        result.allowlist = await syncAllowlist(outcome?.models ?? built.models)
      } catch (error) {
        result.warnings.push(`allowed models not synced: ${messageOf(error)}`)
      }
      result.ok = true
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      log('warn', `refresh failed: ${result.error}`)
    }
    return result
  }

  /**
   * Прогон с дедупликацией: два одновременных вызова не дублируют запросы.
   * @param {'startup' | 'timer' | 'tool'} reason
   * @param {{ apply: boolean, force?: boolean, signal?: AbortSignal }} options
   * @returns {Promise<Record<string, any>>}
   */
  function refresh(reason, options) {
    const apply = options.apply === true
    const force = options.force === true
    // Слияние только внутри одного режима: `plan`, прицепившийся к идущей
    // записи, не должен отчитываться «applied», а `force: true` не теряется
    // в обычном прогоне.
    const key = `${apply}:${force}`
    if (inflight !== null && inflight.key === key) return inflight.promise
    const promise = collect(reason, options).then((result) => {
      last = result
      return result
    })
    const record = { key, promise }
    inflight = record
    const clear = () => {
      if (inflight === record) inflight = null
    }
    promise.then(clear, clear)
    return promise
  }

  const hmrService = typeof ctx.get === 'function' ? ctx.get('hmr') : undefined
  const hmrPresent = hmrService !== undefined && hmrService !== null
  /**
   * AsyncLocalStorage HMR-транзакции, если сервис его отдаёт.
   *
   * `executing` — приватное поле Hmr, но именно им сам DSH выводит наблюдение
   * за файлами из транзакции.
   * @type {{ exit?: (factory: () => unknown) => unknown, getStore?: () => unknown } | null}
   */
  let hmrExecuting = null
  try {
    const executing = hmrPresent ? hmrService.executing : undefined
    if (executing !== undefined && typeof executing.exit === 'function') {
      hmrExecuting = /** @type {any} */ (executing)
    }
  } catch {
    hmrExecuting = null
  }

  /**
   * Автоматическая запись включается, только когда таймер гарантированно
   * оказывается вне HMR-транзакции.
   *
   * Без HMR-сервиса транзакций не бывает вообще. Если же сервис есть, а его
   * AsyncLocalStorage недоступен, выйти из контекста нельзя: таймер унаследует
   * транзакцию установки и `configEditor.edit()` упадёт. Тогда честнее
   * выключить авто-запись и сказать об этом, чем падать на каждой смене
   * каталога; ручной `cvc_catalog apply` работает всегда.
   */
  let autoApply = cfg.autoSync && !(hmrPresent && hmrExecuting === null)
  if (cfg.autoSync && !autoApply) {
    log('warn', 'auto-write disabled: the HMR service exposes no usable transaction context in this host; '
      + 'timers will only report the diff, use cvc_catalog apply')
  }

  /** Фоновый прогон по таймеру: ошибки уже внутри результата, промис не должен всплывать. */
  function backgroundRun(reason) {
    void refresh(reason, { apply: autoApply }).catch((error) => {
      log('warn', `background refresh failed: ${messageOf(error)}`)
    })
  }

  /**
   * Создать таймер вне текущей async-зоны.
   *
   * Плагин может активироваться внутри HMR-транзакции. Таймер, созданный
   * внутри неё, наследует AsyncLocalStorage-контекст, и `configEditor.edit()`
   * при срабатывании получает «HMR transactions cannot be nested».
   * @template T
   * @param {() => T} factory
   * @returns {T}
   */
  function scheduleOutsideHmr(factory) {
    if (hmrExecuting !== null) {
      try {
        return /** @type {T} */ (hmrExecuting.exit(factory))
      } catch (error) {
        // `exit` штатно не бросает, но если это случилось — таймер окажется
        // внутри транзакции, поэтому авто-запись выключаем до перезапуска.
        if (autoApply) {
          autoApply = false
          log('warn', `auto-write disabled: HMR transaction escape failed (${messageOf(error)}); `
            + 'timers will only report the diff, use cvc_catalog apply')
        }
      }
    }
    return factory()
  }

  // Автоматика: стартовая проверка после того, как Loader устоялся, и таймер.
  if (cfg.autoSync) {
    ctx.effect(() => {
      const startup = scheduleOutsideHmr(() => setTimeout(() => backgroundRun('startup'), cfg.startupDelayMs))
      startup.unref?.()
      return () => clearTimeout(startup)
    }, 'cvc-catalog-sync: startup run')
    if (cfg.intervalHours > 0) {
      // setInterval принимает от 1 до 2^31-1 мс. Слишком малое значение
      // (0.00001 ч) округлилось бы в 0 и дало почти непрерывные прогоны,
      // поэтому нижняя граница — минута.
      const requested = cfg.intervalHours * 3600000
      const periodMs = Math.min(Math.max(Math.round(requested), 60000), 2147483647)
      if (requested < 60000) {
        log('warn', `intervalHours ${cfg.intervalHours} is too small, timer raised to 1 minute`)
      } else if (requested > 2147483647) {
        log('warn', `intervalHours ${cfg.intervalHours} is too large, timer clamped to 24.8 days`)
      }
      ctx.effect(() => {
        const timer = scheduleOutsideHmr(() => setInterval(() => backgroundRun('timer'), periodMs))
        timer.unref?.()
        return () => clearInterval(timer)
      }, 'cvc-catalog-sync: interval')
    }
  }

  /** @param {Record<string, any>} result @param {'status' | 'plan' | 'apply'} action */
  function toValue(result, action) {
    return {
      action,
      ok: result.ok === true,
      at: typeof result.at === 'string' ? result.at : '',
      provider: cfg.provider,
      catalogModels: Number.isInteger(result.catalogModels) ? result.catalogModels : 0,
      currentModels: Number.isInteger(result.currentModels) ? result.currentModels : 0,
      nextModels: Number.isInteger(result.nextModels) ? result.nextModels : 0,
      levelsSource: typeof result.levelsSource === 'string' ? result.levelsSource : 'none',
      applied: result.applied === true,
      added: Array.isArray(result.added) ? result.added : [],
      removed: Array.isArray(result.removed) ? result.removed : [],
      changed: Array.isArray(result.changed) ? result.changed : [],
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      allowlist: {
        pruned: Array.isArray(result.allowlist?.pruned) ? result.allowlist.pruned : [],
        added: Array.isArray(result.allowlist?.added) ? result.allowlist.added : [],
        skipped: result.allowlist?.skipped !== false,
        changed: result.allowlist?.changed === true,
      },
      error: typeof result.error === 'string' ? result.error : '',
    }
  }

  /** Текущее число моделей в патче; для status, если прогонов ещё не было. */
  function currentModelCount() {
    try {
      return readCurrent().models.length
    } catch {
      return 0
    }
  }

  ctx.effect(() => ctx.tools.register({
    name: TOOL_NAME,
    description: 'Refresh the CheapVibeCode model catalog in the DSH profile patch. '
      + 'Reads the provider catalog and the reasoning-level map from the official installer, '
      + 'then rewrites only llm-pi-ai.providers.<route>.models and, when enabled, the '
      + 'subagent allowed-model list. Actions: status (last run in this process, no network), '
      + 'plan (fetch and show the diff without writing), apply (fetch and write). '
      + 'A write happens only when the catalog changed, and is refused when the response '
      + 'shrinks below the configured share of the current model count unless force is set. '
      + 'The change is applied without restarting DSH.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'plan', 'apply'],
          description: 'status: report the last run in this process without network. '
            + 'plan: fetch and return the diff without writing. apply: fetch and write the catalog.',
        },
        force: {
          type: 'boolean',
          description: 'apply only: write even when the response is smaller than the model-count guard allows.',
        },
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderValue(value) }],
    },
    timeoutMs: 90000,
    async execute(args, exec) {
      const action = isPlainObject(args) && (args.action === 'status' || args.action === 'plan' || args.action === 'apply')
        ? args.action
        : 'status'
      if (action === 'status') {
        return toValue(last ?? {
          ok: true,
          at: '',
          provider: cfg.provider,
          catalogModels: 0,
          currentModels: currentModelCount(),
          nextModels: 0,
          levelsSource: 'none',
          warnings: ['no refresh has run in this process yet'],
        }, 'status')
      }
      const result = await refresh('tool', {
        apply: action === 'apply',
        force: isPlainObject(args) && args.force === true,
        signal: exec.signal,
      })
      last = result
      return toValue(result, action)
    },
  }), 'cvc-catalog-sync: refresh tool')

  /**
   * Страница настроек: маршрут есть только там, где есть веб-сервер.
   * В headless-профилях плагин продолжает работать через инструмент.
   */
  ctx.inject(['webServer'], (web) => {
    web.effect(() => installSettingsApi(web.webServer, {
      ctx,
      selfRowId: SELF_ROW_ID,
      refresh,
      toValue,
      status: () => toValue(last ?? {
        ok: true,
        at: '',
        provider: cfg.provider,
        catalogModels: 0,
        currentModels: currentModelCount(),
        nextModels: 0,
        levelsSource: 'none',
        warnings: [],
      }, 'status'),
    }), 'cvc-catalog-sync: settings API')
  })
}

export {
  DEFAULT_INSTALLER_URLS,
  FULL_ROW,
  SELF_ROW_ID,
  SETTINGS_API_PREFIX,
  TOOL_NAME,
  WIRE_LEVELS,
  buildModels,
  diffModels,
  installSettingsApi,
  normalizeConfig,
  parseCatalogPayload,
  parseReasoningLevels,
  reasoningEffortsFor,
  settingsState,
  stableStringify,
  validateConfigInput,
}
