/**
 * Синхронизация каталога моделей с профильным патчем DSH.
 *
 * Функция делает то же, что плагин 1.0.0, но живёт в общем каркасе 2.0.0:
 *
 * 1. забирает каталог из общего кэша (`deps.cache`) — его наполняет
 *    `index.js` запросом `GET {baseURL}/models` ключом провайдера;
 * 2. забирает установщик CVC и вытаскивает карту `reasoningLevels`
 *    (`deps.api.fetchLevels`, кэш на `catalog.levelsCacheMinutes`);
 * 3. собирает `models` чистыми функциями `lib/catalog-build.js`;
 * 4. точечно пишет результат в строку `providers.entryId` через
 *    `ctx.configEditor.edit()` — единственный sanctioned-путь записи: он
 *    сохраняет комментарии и чужие строки, пишет атомарно, а `dsh-hmr`
 *    перечитывает патч без перезапуска приложения;
 * 5. синхронизирует `allowedModels` сабагентов (`catalog.syncAllowlist`).
 *
 * Сборка и проверка `minModelRatio` выполняются **внутри** колбэка `edit`: он
 * отдаёт конфиг на момент блокировки, поэтому правка, сделанная между чтением
 * и записью, не теряется.
 *
 * Контракт модуля:
 *   register(ctx, deps) -> () => void   — маршрут `POST /cvc/run`, таймеры;
 *   tool(deps) -> object                — инструмент `cvc_catalog`.
 *
 * `register` вызывается только при `features.catalogSync === true`, поэтому
 * выключенная функция не оставляет ни маршрута, ни таймера, ни инструмента.
 *
 * @module cvc-catalog-sync-plugin/lib/catalog-sync
 */
import {
  buildModels,
  diffModels,
  guardFailureMessage,
  isDiffEmpty,
  modelRatioGuard,
  planAllowlist,
} from './catalog-build.js'

/** Имя инструмента ручного запуска. */
export const TOOL_NAME = 'cvc_catalog'

/** Верхняя граница `setTimeout`/`setInterval` (2^31-1 мс). */
const MAX_TIMEOUT_MS = 2147483647

/** Нижняя граница периода автосинхронизации: чаще — почти непрерывные прогоны. */
const MIN_INTERVAL_MS = 60000

/** JSON-схема вывода инструмента: только поддерживаемые ключевые слова. */
export const OUTPUT_SCHEMA = {
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

/** Текст ошибки без предположения о её типе. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Обычный объект, не массив и не null. */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Пустой результат синхронизации allowlist. */
function emptyAllowlist() {
  return { pruned: [], added: [], skipped: true, changed: false }
}

/** Конечное число в границах или умолчание. */
function numberOr(value, fallback, min) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) return fallback
  return Math.min(Math.round(value), MAX_TIMEOUT_MS)
}

/**
 * Ошибка прогона с HTTP-кодом для маршрута.
 *
 * `guard` и `stale` — это 409 (конфликт состояния, клиент показывает текст),
 * остальные неожиданные ошибки — 500. Инструмент код не использует: он отдаёт
 * `ok: false` и понятный `error`.
 */
class CatalogRunError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'CatalogRunError'
    this.status = status
  }
}

/**
 * Текст результата для модели и пользователя (как в 1.0.0).
 * @param {Record<string, any>} value
 * @returns {string}
 */
export function renderValue(value) {
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

/**
 * Совпадает ли id строки с ожидаемым, включая group-префикс.
 * @param {unknown} candidate
 * @param {string} wanted
 * @returns {boolean}
 */
function sameRowId(candidate, wanted) {
  return candidate === wanted || (typeof candidate === 'string' && candidate.endsWith(`:${wanted}`))
}

/**
 * Активный движок на объект `deps`: `register` создаёт его один раз, а
 * `tool(deps)` переиспользует, чтобы `status` видел последний прогон и
 * параллельные вызовы схлопывались. Если инструмент спросили без `register`
 * (например, в тесте), создаётся временный движок.
 * @type {WeakMap<object, ReturnType<typeof createEngine>>}
 */
const engines = new WeakMap()

/**
 * Собрать движок прогонов: чтение, сборка, запись, allowlist, дедупликация.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} deps
 */
function createEngine(ctx, deps) {
  /** Последний прогон в этом движке. */
  let last = null
  /** Идущий прогон: параллельный вызов с тем же режимом ждёт его. */
  let inflight = null
  /** Кэш карты уровней: она меняется редко, а прогонов бывает два подряд. */
  let levelsCache = null

  /** Сервис записи патча. */
  function editor() {
    return ctx.get?.('configEditor') ?? ctx.configEditor
  }

  /**
   * Найти строку патча по id, включая `include:`-префикс.
   * @param {string} id
   * @returns {any}
   */
  function entryById(id) {
    const service = editor()
    if (service === null || typeof service !== 'object' || typeof service.entries !== 'function') return undefined
    let entries = []
    try {
      entries = service.entries() ?? []
    } catch {
      return undefined
    }
    return entries.find((entry) => sameRowId(entry?.options?.id, id))
  }

  /**
   * Модели маршрута из raw-конфига строки.
   * @param {unknown} config
   * @param {ReturnType<typeof deps.config>} cfg
   * @returns {Array<Record<string, any>>}
   */
  function modelsFromConfig(config, cfg) {
    const providers = isPlainObject(config) && isPlainObject(config.providers) ? config.providers : {}
    const profile = providers[cfg.catalog.provider]
    return isPlainObject(profile) && Array.isArray(profile.models) ? profile.models.filter(isPlainObject) : []
  }

  /**
   * Собрать следующий raw-конфиг строки с новым списком моделей.
   * @param {unknown} current
   * @param {Array<Record<string, unknown>>} models
   * @param {ReturnType<typeof deps.config>} cfg
   * @returns {Record<string, unknown>}
   */
  function withModels(current, models, cfg) {
    const next = isPlainObject(current) ? { ...current } : {}
    const providers = isPlainObject(next.providers) ? { ...next.providers } : {}
    const profile = isPlainObject(providers[cfg.catalog.provider]) ? { ...providers[cfg.catalog.provider] } : {}
    profile.models = models
    providers[cfg.catalog.provider] = profile
    next.providers = providers
    return next
  }

  /**
   * Прочитать текущие модели маршрута из профильного патча.
   * @param {ReturnType<typeof deps.config>} cfg
   * @returns {{ entry: any, models: Array<Record<string, any>> }}
   */
  function readCurrent(cfg) {
    const entry = entryById(cfg.providers.entryId)
    if (entry === undefined) {
      throw new CatalogRunError(409, `profile entry "${cfg.providers.entryId}" is not available`)
    }
    const current = isPlainObject(entry.options.config) ? entry.options.config : {}
    const providers = isPlainObject(current.providers) ? current.providers : {}
    const profile = providers[cfg.catalog.provider]
    if (!isPlainObject(profile)) {
      throw new CatalogRunError(
        409,
        `provider route "${cfg.catalog.provider}" is not configured in "${cfg.providers.entryId}"`,
      )
    }
    // llm-pi-ai отвергает `modelOverrides` рядом с `models`; сказать об этом
    // самим понятнее, чем получить отказ валидации при записи.
    if (isPlainObject(profile.modelOverrides) && Object.keys(profile.modelOverrides).length > 0) {
      throw new CatalogRunError(
        409,
        `provider route "${cfg.catalog.provider}" uses modelOverrides; a models list cannot be written beside it — `
        + 'convert the route to an explicit models list first',
      )
    }
    const models = Array.isArray(profile.models) ? profile.models.filter(isPlainObject) : []
    return { entry, models }
  }

  /**
   * Забрать карту уровней с первого ответившего установщика (кэш на минуты).
   *
   * Недоступность уровней не роняет прогон: существующие значения патча
   * сохраняются, новые модели падают в `supports_reasoning`.
   * @param {ReturnType<typeof deps.config>} cfg
   * @param {AbortSignal | undefined} signal
   * @returns {Promise<{ map: Record<string, string[]> | null, source: string, problems: string[] }>}
   */
  async function loadLevels(cfg, signal) {
    if (levelsCache !== null && levelsCache.map !== null
      && Date.now() - levelsCache.at < cfg.catalog.levelsCacheMinutes * 60000) {
      return levelsCache
    }
    try {
      const answer = await deps.api.fetchLevels({
        urls: cfg.catalog.installerUrls,
        timeoutMs: cfg.providers.timeoutMs,
        signal,
      })
      levelsCache = { map: answer.levels, source: answer.source, at: Date.now(), problems: [] }
      return levelsCache
    } catch (error) {
      for (const problem of String(messageOf(error)).split('; ')) deps.log('warn', problem)
      levelsCache = { map: null, source: 'none', at: 0, problems: [messageOf(error)] }
      return levelsCache
    }
  }

  /**
   * Записать каталог в строку маршрута, пересобрав модели по свежему конфигу.
   *
   * `configEditor.edit` отдаёт конфиг на момент блокировки, поэтому сборка
   * внутри колбэка — единственный способ не потерять правку, сделанную между
   * чтением и записью (ручной `maxTokens`, `compat`). Там же проверяется
   * защита от усыхания каталога: её отказ не пишет файл.
   * @param {any} entry
   * @param {Array<Record<string, unknown>>} catalog
   * @param {Record<string, string[]> | null} levelMap
   * @param {boolean} force
   * @param {ReturnType<typeof deps.config>} cfg
   * @returns {Promise<{ models: Array<Record<string, unknown>>, warnings: string[], diff: ReturnType<typeof diffModels>, unchanged: boolean } | null>}
   */
  async function writeModels(entry, catalog, levelMap, force, cfg) {
    /** @type {any} */
    let outcome = null
    await editor().edit(entry, (current) => {
      const fresh = modelsFromConfig(current, cfg)
      const built = buildModels(catalog, levelMap, fresh, { keepModels: cfg.catalog.keepModels })
      const guard = modelRatioGuard(fresh.length, built.models.length, cfg.catalog.minModelRatio)
      if (!force && !guard.ok) {
        throw new CatalogRunError(409, guardFailureMessage({
          currentModels: fresh.length,
          nextModels: built.models.length,
          minModelRatio: cfg.catalog.minModelRatio,
        }))
      }
      if (force && !guard.ok) {
        built.warnings.push(
          `force: model-count guard bypassed (${guard.nextModels} < ${guard.minRequired}, `
          + `${Math.round(guard.minModelRatio * 100)}% of current ${guard.currentModels})`,
        )
      }
      const diff = diffModels(fresh, built.models)
      outcome = { models: built.models, warnings: built.warnings, diff, unchanged: isDiffEmpty(diff) }
      return withModels(current, built.models, cfg)
    })
    return outcome
  }

  /**
   * Привести список доступных моделей сабагентов к каталогу маршрута.
   *
   * Чужие провайдеры сохраняются как есть: плагин владеет только своим
   * маршрутом. Если строки нет (плагин сабагентов не установлен) — пропуск.
   * @param {Array<Record<string, unknown>>} models
   * @param {ReturnType<typeof deps.config>} cfg
   * @returns {Promise<{ pruned: string[], added: string[], skipped: boolean, changed: boolean }>}
   */
  async function syncAllowlist(models, cfg) {
    const empty = { pruned: [], added: [], skipped: true, changed: false }
    if (!cfg.catalog.syncAllowlist) return empty
    const entry = entryById(cfg.catalog.allowlistEntryId)
    if (entry === undefined) return empty
    const catalogIds = models
      .map((model) => model.id)
      .filter((id) => typeof id === 'string' && id.length > 0)
    const snapshot = planAllowlist(
      isPlainObject(entry.options.config) ? entry.options.config.allowedModels : [],
      cfg.catalog.provider,
      catalogIds,
    )
    if (!snapshot.changed) return { pruned: [], added: [], skipped: false, changed: false }
    /** @type {{ pruned: string[], added: string[], changed: boolean } | null} */
    let outcome = null
    await editor().edit(entry, (cur) => {
      const current = isPlainObject(cur) ? cur : {}
      // Пересчёт на момент блокировки: чужой список мог измениться, пока шли
      // запросы к каталогу.
      const fresh = planAllowlist(current.allowedModels, cfg.catalog.provider, catalogIds)
      outcome = { pruned: fresh.pruned, added: fresh.added, changed: fresh.changed }
      return fresh.changed ? { ...current, allowedModels: fresh.expected } : current
    })
    deps.log('info', `allowed models synced: +${outcome?.added.length ?? 0}/-${outcome?.pruned.length ?? 0}`)
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
    const cfg = deps.config()
    /** @type {Record<string, any>} */
    const result = {
      ok: false,
      reason,
      at: new Date().toISOString(),
      provider: cfg.catalog.provider,
      catalogModels: 0,
      currentModels: 0,
      nextModels: 0,
      levelsSource: 'none',
      applied: false,
      added: [],
      removed: [],
      changed: [],
      warnings: [],
      allowlist: emptyAllowlist(),
      error: '',
      errorStatus: 500,
    }
    try {
      const snapshot = await deps.cache.get({ force: true })
      const catalog = Array.isArray(snapshot?.data?.models) ? snapshot.data.models : []
      result.catalogModels = catalog.length
      const staleMessage = typeof snapshot?.error === 'string' && snapshot.error.length > 0
        ? snapshot.error
        : 'upstream is unavailable'
      if (snapshot?.stale === true) {
        if (options.apply === true && options.force !== true) {
          throw new CatalogRunError(
            409,
            `catalog is stale (${staleMessage}); nothing written, use force to override`,
          )
        }
        result.warnings.push(options.apply === true
          ? `force: stale catalog applied (${staleMessage})`
          : `catalog is stale: ${staleMessage}`)
      }
      if (catalog.length === 0) {
        throw new CatalogRunError(409, 'catalog returned no models; nothing written')
      }

      const levels = await loadLevels(cfg, options.signal)
      result.levelsSource = levels.source
      if (levels.map === null) {
        result.warnings.push('reasoning levels unavailable: existing levels preserved, new models fall back to supports_reasoning')
      }

      const current = readCurrent(cfg)
      result.currentModels = current.models.length

      const built = buildModels(catalog, levels.map, current.models, { keepModels: cfg.catalog.keepModels })
      result.nextModels = built.models.length
      const warningsBeforeBuild = result.warnings.length
      result.warnings.push(...built.warnings)

      const diff = diffModels(current.models, built.models)
      result.added = diff.added
      result.removed = diff.removed
      result.changed = diff.changed

      const unchanged = isDiffEmpty(diff)

      if (options.apply !== true) {
        // plan ничего не пишет, поэтому защита от усыхания сообщается
        // предупреждением, а не отказом: дифф увидеть нужно.
        if (!unchanged && options.force !== true) {
          const guard = modelRatioGuard(current.models.length, built.models.length, cfg.catalog.minModelRatio)
          if (!guard.ok) {
            result.warnings.push(
              `guard: ${guard.nextModels} models is below ${guard.minRequired} `
              + `(${Math.round(guard.minModelRatio * 100)}% of current ${guard.currentModels}); `
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
          result.allowlist = await syncAllowlist(current.models, cfg)
          // Патч всё-таки записан — отчитываемся честно.
          result.applied = result.allowlist.changed
        } catch (error) {
          result.warnings.push(`allowed models not synced: ${messageOf(error)}`)
        }
        return result
      }

      const outcome = await writeModels(current.entry, catalog, levels.map, options.force === true, cfg)
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
      deps.log('info', `applied catalog: ${result.nextModels} models (+${result.added.length}/-${result.removed.length}/~${result.changed.length})`)
      try {
        result.allowlist = await syncAllowlist(outcome?.models ?? built.models, cfg)
      } catch (error) {
        result.warnings.push(`allowed models not synced: ${messageOf(error)}`)
      }
      result.ok = true
    } catch (error) {
      result.error = messageOf(error)
      result.errorStatus = typeof error?.status === 'number' ? error.status : 500
      deps.log('warn', `refresh failed: ${result.error}`)
    }
    return result
  }

  /**
   * Запомнить итог прогона в общем реестре состояния (`GET /cvc/state`).
   * @param {Record<string, any>} result
   * @param {boolean} apply
   */
  function publish(result, apply) {
    const store = deps.store
    if (store === null || typeof store !== 'object') return
    try {
      if (result.ok !== true && result.error.length > 0) {
        store.setError?.(result.error)
        return
      }
      store.setRunning?.(false)
      store.setLastRun?.(toValue(result, apply ? 'apply' : 'plan'))
    } catch (error) {
      deps.log('warn', `state store write failed: ${messageOf(error)}`)
    }
  }

  /**
   * Прогон с дедупликацией: два одновременных вызова не дублируют запросы.
   * @param {'startup' | 'timer' | 'tool'} reason
   * @param {{ apply?: boolean, force?: boolean, signal?: AbortSignal }} [options]
   * @returns {Promise<Record<string, any>>}
   */
  function refresh(reason, options = {}) {
    const apply = options.apply === true
    const force = options.force === true
    // Слияние только внутри одного режима: `plan`, прицепившийся к идущей
    // записи, не должен отчитываться «applied», а `force: true` не теряется
    // в обычном прогоне.
    const key = `${apply}:${force}`
    if (inflight !== null && inflight.key === key) return inflight.promise
    try {
      deps.store?.setRunning?.(true)
    } catch {
      // Реестр состояния необязателен: инструмент работает и без него.
    }
    const promise = collect(reason, { ...options, apply, force }).then((result) => {
      last = result
      publish(result, apply)
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

  /**
   * Итог прогона в форме ответа маршрута/инструмента (как в 1.0.0).
   * @param {Record<string, any>} result
   * @param {'status' | 'plan' | 'apply'} action
   * @returns {Record<string, any>}
   */
  function toValue(result, action) {
    const cfg = deps.config()
    return {
      action,
      ok: result.ok === true,
      at: typeof result.at === 'string' ? result.at : '',
      provider: cfg.catalog.provider,
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
      return readCurrent(deps.config()).models.length
    } catch {
      return 0
    }
  }

  /**
   * Ответ `status`: последний прогон в этом движке или честная заготовка.
   * @returns {Record<string, any>}
   */
  function statusValue() {
    const cfg = deps.config()
    return toValue(last ?? {
      ok: true,
      at: '',
      provider: cfg.catalog.provider,
      catalogModels: 0,
      currentModels: currentModelCount(),
      nextModels: 0,
      levelsSource: 'none',
      warnings: ['no refresh has run in this process yet'],
    }, 'status')
  }

  return { refresh, toValue, statusValue }
}

/**
 * Подключить функцию синхронизации каталога.
 *
 * Регистрирует `POST /cvc/run` и таймеры автосинхронизации. Таймеры создаются
 * через `hmr.executing.exit`, чтобы не унаследовать HMR-транзакцию: иначе
 * `configEditor.edit()` на срабатывании получит «HMR transactions cannot be
 * nested». Если приватного поля у сервиса нет, авто-запись отключается
 * (таймеры только показывают дифф), а без сервиса HMR она работает как есть.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx — контекст плагина.
 * @param {object} deps — общие зависимости каркаса (см. `index.js`).
 * @returns {() => void} disposer, снимающий маршрут и таймеры.
 */
export function register(ctx, deps) {
  /** @type {Array<() => void>} */
  const disposers = []
  const engine = createEngine(ctx, deps)
  engines.set(deps, engine)

  const disposeRoute = deps.route('run', async (req, res) => {
    const method = String(req.method ?? 'GET').toUpperCase()
    if (method !== 'POST') {
      deps.http.methodNotAllowed(res, ['POST'])
      return
    }
    if (!deps.http.isJsonRequest(req)) {
      deps.http.sendJson(res, 415, { error: 'content-type: application/json required' })
      return
    }
    let body
    try {
      body = await deps.http.readJsonBody(req)
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 400
      deps.http.sendJson(res, status, { error: messageOf(error) })
      return
    }
    const requested = isPlainObject(body) ? body.action : undefined
    if (requested !== undefined && requested !== 'plan' && requested !== 'apply') {
      deps.http.sendJson(res, 400, { error: 'action must be "plan" or "apply"' })
      return
    }
    const action = requested === 'apply' ? 'apply' : 'plan'
    const force = isPlainObject(body) && body.force === true
    const result = await engine.refresh('tool', { apply: action === 'apply', force })
    // 409 — отказ по stale/guard: клиент покажет текст, а не «ошибку сервера».
    // Прочие неудачи (нет строки, нет ключа, сеть) остаются 200 с `ok: false`:
    // тело ответа — диагностика прогона, как у инструмента.
    const status = result.ok === true ? 200 : (result.errorStatus === 409 ? 409 : 200)
    deps.http.sendJson(res, status, engine.toValue(result, action))
  })
  disposers.push(disposeRoute)

  const hmrService = (() => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('hmr') : undefined
    } catch {
      return undefined
    }
  })()
  const hmrPresent = hmrService !== undefined && hmrService !== null
  /**
   * AsyncLocalStorage HMR-транзакции, если сервис его отдаёт.
   *
   * `executing` — приватное поле Hmr, но именно им сам DSH выводит наблюдение
   * за файлами из транзакции.
   * @type {{ exit?: (factory: () => unknown) => unknown } | null}
   */
  let hmrExecuting = null
  try {
    const executing = hmrPresent ? hmrService.executing : undefined
    if (executing !== undefined && executing !== null && typeof executing.exit === 'function') {
      hmrExecuting = /** @type {any} */ (executing)
    }
  } catch {
    hmrExecuting = null
  }

  const cfg = deps.config()
  /**
   * Автоматическая запись включается, только когда таймер гарантированно
   * оказывается вне HMR-транзакции. Без HMR-сервиса транзакций не бывает.
   */
  let autoApply = cfg.catalog.autoSync && !(hmrPresent && hmrExecuting === null)
  if (cfg.catalog.autoSync && !autoApply) {
    deps.log('warn', 'auto-write disabled: the HMR service exposes no usable transaction context in this host; '
      + 'timers will only report the diff, use cvc_catalog apply')
  }

  /** Фоновый прогон по таймеру: ошибки уже внутри результата, промис не должен всплывать. */
  function backgroundRun(reason) {
    void engine.refresh(reason, { apply: autoApply }).catch((error) => {
      deps.log('warn', `background refresh failed: ${messageOf(error)}`)
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
          deps.log('warn', `auto-write disabled: HMR transaction escape failed (${messageOf(error)}); `
            + 'timers will only report the diff, use cvc_catalog apply')
        }
      }
    }
    return factory()
  }

  // Автоматика: стартовая проверка после того, как Loader устоялся, и таймер.
  if (cfg.catalog.autoSync) {
    const startupDelayMs = numberOr(cfg.catalog.startupDelayMs, 5000, 0)
    const startup = scheduleOutsideHmr(() => setTimeout(() => backgroundRun('startup'), startupDelayMs))
    startup?.unref?.()
    disposers.push(() => clearTimeout(startup))

    if (cfg.catalog.intervalHours > 0) {
      // setInterval принимает от 1 до 2^31-1 мс. Слишком малое значение
      // округлилось бы в 0 и дало почти непрерывные прогоны, поэтому нижняя
      // граница — минута.
      const requested = cfg.catalog.intervalHours * 3600000
      const periodMs = Math.min(Math.max(Math.round(requested), MIN_INTERVAL_MS), MAX_TIMEOUT_MS)
      if (requested < MIN_INTERVAL_MS) {
        deps.log('warn', `intervalHours ${cfg.catalog.intervalHours} is too small, timer raised to 1 minute`)
      } else if (requested > MAX_TIMEOUT_MS) {
        deps.log('warn', `intervalHours ${cfg.catalog.intervalHours} is too large, timer clamped to 24.8 days`)
      }
      const timer = scheduleOutsideHmr(() => setInterval(() => backgroundRun('timer'), periodMs))
      timer?.unref?.()
      disposers.push(() => clearInterval(timer))
    }
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      if (typeof dispose === 'function') dispose()
    }
    if (engines.get(deps) === engine) engines.delete(deps)
  }
}

/**
 * Описание инструмента `cvc_catalog` (status / plan / apply, force).
 *
 * `tool(deps)` вызывается каркасом сразу после `register(ctx, deps)` с тем же
 * объектом `deps`, поэтому инструмент переиспользует движок функции: `status`
 * видит последний прогон, а параллельный `apply` схлопывается с ручным
 * маршрутом. При выключенной функции (например, гонка с volatile-правкой)
 * `execute` отвечает понятной ошибкой, а не идёт в сеть.
 *
 * @param {object} deps
 * @returns {object}
 */
export function tool(deps) {
  const engine = engines.get(deps) ?? createEngine(deps.ctx, deps)
  return {
    name: TOOL_NAME,
    description: 'Refresh the CheapVibeCode model catalog in the DSH profile patch. '
      + 'Reads the provider catalog and the reasoning-level map from the official installer, '
      + 'then rewrites only the configured provider route models and, when enabled, the '
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
      const features = typeof deps.features === 'function' ? deps.features() : null
      if (features !== null && features !== undefined && features.catalogSync !== true) {
        return engine.toValue({
          ok: false,
          at: new Date().toISOString(),
          catalogModels: 0,
          currentModels: 0,
          nextModels: 0,
          levelsSource: 'none',
          warnings: [],
          error: 'catalog sync is disabled in settings (features.catalogSync=false); '
            + 'enable it on the plugin settings page to use cvc_catalog',
        }, action)
      }
      if (action === 'status') return engine.statusValue()
      const result = await engine.refresh('tool', {
        apply: action === 'apply',
        force: isPlainObject(args) && args.force === true,
        signal: exec?.signal,
      })
      return engine.toValue(result, action)
    },
  }
}