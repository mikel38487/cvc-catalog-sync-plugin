/**
 * Чистая сборка моделей `llm-pi-ai` из каталога CheapVibeCode и карты уровней.
 *
 * Модуль ничего не знает о сети, профиле и таймерах: на вход каталог
 * (`GET /v1/models`), карта `reasoningLevels` из официального установщика и
 * текущий список моделей из патча, на выходе — новый список по правилам
 * установщика `modelFromCatalog`. Здесь же живут дифф моделей, защита от
 * усыхания каталога (`minModelRatio`) и планирование списка `allowedModels`
 * сабагентов.
 *
 * Правила переноса уровней повторяют установщик CVC: `none` → ключ `off` со
 * значением `none`, `thinking` → ключ `high` со значением `thinking` (схема
 * llm-pi-ai ограничивает ключи, а значение — произвольное проводное написание),
 * остальные уровни — ключ = значение.
 *
 * @module cvc-catalog-sync-plugin/lib/catalog-build
 */

/**
 * Уровни, которые схема llm-pi-ai принимает ключами `reasoningEfforts`
 * (`THINKING_LEVELS`). Значения — проводное написание, поэтому `high: thinking`
 * допустим.
 */
export const WIRE_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/** Полный ряд уровней для модели с `supports_reasoning`, но без явной карты. */
export const FULL_ROW = Object.freeze({
  off: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
})

/** Контекст по умолчанию, если каталог и текущая запись молчат. */
export const DEFAULT_CONTEXT_WINDOW = 128000

/** Максимум вывода по умолчанию, если каталог и текущая запись молчат. */
export const DEFAULT_MAX_TOKENS = 16384

/** Доля каталога по умолчанию для защиты от усыхания. */
export const DEFAULT_MIN_MODEL_RATIO = 0.8

/**
 * Проверить, что значение — обычный объект (не массив и не null).
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Положительное целое или null.
 * @param {unknown} value
 * @returns {number | null}
 */
export function positiveInt(value) {
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
 * Имя модели для UI: хвост `display_name` после разделителя ` · `.
 * @param {Record<string, unknown>} item
 * @param {string} id
 * @returns {string}
 */
export function modelName(item, id) {
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
 * Порядок источников:
 * 1. явная карта установщика;
 * 2. текущее значение из патча (карта недоступна — не трогаем то, что уже
 *    настроено);
 * 3. `supports_reasoning === true` → полный ряд, иначе `false`.
 *
 * Карта, предлагающая только `off`, не отдаётся: `resolveModelReasoning` в
 * llm-pi-ai отвергает её и роняет всю запись. Такой случай падает в источники
 * ниже с предупреждением.
 *
 * @param {string} id
 * @param {Record<string, unknown>} item — запись каталога.
 * @param {Record<string, any> | undefined} existing — текущая запись патча.
 * @param {Record<string, string[]> | null} levelMap — карта установщика.
 * @param {string[]} warnings — накопитель предупреждений.
 * @returns {Record<string, string> | false}
 */
export function reasoningEffortsFor(id, item, existing, levelMap, warnings) {
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
 *
 * @param {Array<Record<string, unknown>>} catalog — записи каталога.
 * @param {Record<string, string[]> | null} levelMap — карта уровней установщика.
 * @param {Array<Record<string, unknown>>} existingModels — модели из патча.
 * @param {{ keepModels?: string[] }} [options] — `keepModels` из конфига.
 * @returns {{ models: Array<Record<string, unknown>>, warnings: string[] }}
 */
export function buildModels(catalog, levelMap, existingModels, options = {}) {
  const keepModels = isPlainObject(options) && Array.isArray(options.keepModels) ? options.keepModels : []
  const rows = Array.isArray(catalog) ? catalog : []
  const previous = Array.isArray(existingModels) ? existingModels : []

  /** @type {Map<string, Record<string, unknown>>} */
  const existingById = new Map()
  for (const model of previous) {
    if (isPlainObject(model) && typeof model.id === 'string') existingById.set(model.id, model)
  }
  /** @type {Array<Record<string, unknown>>} */
  const models = []
  /** @type {string[]} */
  const warnings = []
  /** @type {Set<string>} */
  const seen = new Set()

  for (const item of rows) {
    if (!isPlainObject(item)) continue
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
      ?? DEFAULT_CONTEXT_WINDOW
    const advertisedMax = firstPositiveInt(item, ['max_output_tokens', 'max_tokens'])
      ?? (existing === undefined ? null : positiveInt(existing.maxTokens))
      ?? DEFAULT_MAX_TOKENS
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

    /** @type {Record<string, unknown>} */
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

  for (const id of keepModels) {
    if (typeof id !== 'string' || id.trim().length === 0) continue
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
export function stableStringify(value) {
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
export function diffModels(current, next) {
  /** @type {Map<string, Record<string, unknown>>} */
  const currentById = new Map()
  for (const model of Array.isArray(current) ? current : []) {
    if (isPlainObject(model) && typeof model.id === 'string') currentById.set(model.id, model)
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const nextById = new Map()
  for (const model of Array.isArray(next) ? next : []) {
    if (isPlainObject(model) && typeof model.id === 'string') nextById.set(model.id, model)
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
 * Пустой ли дифф.
 * @param {{ added: string[], removed: string[], changedCount: number }} diff
 * @returns {boolean}
 */
export function isDiffEmpty(diff) {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changedCount === 0
}

/**
 * Доля из конфига: конечное число в (0, 1] или умолчание.
 * @param {unknown} value
 * @returns {number}
 */
function ratioOr(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) {
    return DEFAULT_MIN_MODEL_RATIO
  }
  return value
}

/**
 * Защита от усыхания каталога: сколько моделей обязано остаться.
 *
 * `minRequired` — максимум из одной модели и `ceil(current * ratio)`: пустой
 * ответ не должен стереть рабочий список, даже когда в патче одна модель.
 *
 * @param {number} currentCount — сколько моделей сейчас в патче.
 * @param {number} nextCount — сколько собралось из нового каталога.
 * @param {number} [minModelRatio] — доля из `catalog.minModelRatio`.
 * @returns {{ minModelRatio: number, currentModels: number, nextModels: number, minRequired: number, ok: boolean }}
 */
export function modelRatioGuard(currentCount, nextCount, minModelRatio) {
  const ratio = ratioOr(minModelRatio)
  const current = Number.isFinite(currentCount) && currentCount > 0 ? Math.trunc(currentCount) : 0
  const next = Number.isFinite(nextCount) && nextCount > 0 ? Math.trunc(nextCount) : 0
  const minRequired = Math.max(1, Math.ceil(current * ratio))
  return {
    minModelRatio: ratio,
    currentModels: current,
    nextModels: next,
    minRequired,
    ok: next >= minRequired,
  }
}

/**
 * Текст отказа guard для apply (совпадает с формулировкой 1.0.0).
 * @param {{ currentModels: number, nextModels: number, minModelRatio?: number }} input
 * @returns {string}
 */
export function guardFailureMessage(input) {
  const guard = modelRatioGuard(input.currentModels, input.nextModels, input.minModelRatio)
  return `guard: catalog returned ${guard.nextModels} models, below ${guard.minRequired} `
    + `(${Math.round(guard.minModelRatio * 100)}% of current ${guard.currentModels}); `
    + 'nothing written, use force to override'
}

/**
 * Спланировать список `allowedModels` сабагентов под каталог маршрута.
 *
 * Чужие провайдеры сохраняются как есть и в исходном порядке: плагин владеет
 * только своим маршрутом. Собственные записи всегда переписываются в порядке
 * каталога — это чинит дубли и разъехавшийся порядок, которые DSH отвергает.
 *
 * @param {unknown} allowedModels — текущее значение `allowedModels`.
 * @param {string} provider — ключ своего маршрута.
 * @param {string[]} catalogIds — идентификаторы моделей каталога по порядку.
 * @returns {{
 *   allowed: Array<Record<string, unknown>>,
 *   others: Array<Record<string, unknown>>,
 *   expected: Array<{ provider: string, model: string }>,
 *   pruned: string[],
 *   added: string[],
 *   changed: boolean,
 * }}
 */
export function planAllowlist(allowedModels, provider, catalogIds) {
  const rows = Array.isArray(allowedModels) ? allowedModels.filter(isPlainObject) : []
  const name = typeof provider === 'string' ? provider : ''
  const ids = Array.isArray(catalogIds)
    ? [...new Set(catalogIds.filter((id) => typeof id === 'string' && id.length > 0))]
    : []
  const catalogSet = new Set(ids)
  const ownRows = rows.filter((row) => row.provider === name)
  const ownIds = new Set(ownRows.map((row) => row.model))
  const others = rows.filter((row) => row.provider !== name)
  const pruned = [...ownIds].filter((id) => !catalogSet.has(id))
  const added = ids.filter((id) => !ownIds.has(id))
  const expected = [...others, ...ids.map((id) => ({ provider: name, model: id }))]
  return {
    allowed: rows,
    others,
    expected,
    pruned,
    added,
    changed: stableStringify(rows) !== stableStringify(expected),
  }
}
