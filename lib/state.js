/**
 * Состояние плагина и запись конфигурации через `configEditor`.
 *
 * `GET /cvc/state` — единственная точка, из которой страница настроек узнаёт
 * действующий конфиг, форму записанного патча, состояние последнего прогона и
 * путь к файлу. `PUT /cvc/config` пишет через `configEditor.edit()`: он
 * сохраняет комментарии и чужие строки, валидирует значение и сериализует
 * запись с другими правками профиля. Сброс к умолчаниям удаляет
 * переопределение, а не записывает копию умолчаний.
 *
 * @module cvc-catalog-sync-plugin/lib/state
 */
import { configShapeOf, normalizeConfig, sameConfig, validateConfigInput } from './config.js'
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from './http.js'
import { rowIdMatches } from './providers.js'

/** Префикс маршрутов состояния. */
export const STATE_PATH = 'state'

/** Префикс записи конфига. */
export const CONFIG_PATH = 'config'

/** Обычный объект, не массив и не null. */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Совпадает ли id строки с ожидаемым, включая group-префикс.
 * @param {unknown} candidate
 * @param {string} rowId
 * @returns {boolean}
 */
export function rowMatches(candidate, rowId) {
  return rowIdMatches(candidate, rowId)
}

/**
 * Слои конфигурации строки плагина: то, что записано в патче, и то, что лежит
 * под ним (бандл и умолчания схемы).
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} rowId
 * @returns {{ entry: any, inherited: Record<string, any>, override: Record<string, any>, active: boolean, documentPath: string }}
 */
export function readLayers(ctx, rowId) {
  const editor = ctx.get?.('configEditor') ?? ctx.configEditor
  const empty = { entry: undefined, inherited: {}, override: {}, active: false, documentPath: '' }
  if (editor === null || typeof editor !== 'object') return empty
  let configuration = []
  if (typeof editor.configuration === 'function') {
    try {
      configuration = editor.configuration() ?? []
    } catch {
      return empty
    }
  }
  const row = configuration.find((candidate) => rowMatches(candidate?.entry?.options?.id, rowId))
  if (row === undefined) return { ...empty, documentPath: String(editor.documentPath ?? '') }
  return {
    entry: row.entry,
    inherited: isPlainObject(row.inherited) ? row.inherited : {},
    override: isPlainObject(row.override) ? row.override : {},
    active: true,
    documentPath: String(editor.documentPath ?? ''),
  }
}

/**
 * Найти активную строку плагина для записи.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} rowId
 * @returns {any}
 */
export function findEditableEntry(ctx, rowId) {
  const editor = ctx.get?.('configEditor') ?? ctx.configEditor
  if (editor === null || typeof editor !== 'object' || typeof editor.entries !== 'function') return undefined
  let entries = []
  try {
    entries = editor.entries() ?? []
  } catch {
    return undefined
  }
  return entries.find((entry) => rowMatches(entry?.options?.id, rowId))
}

/**
 * Маленький реестр последнего прогона и статуса для `/cvc/state`.
 * @param {{ now?: () => string }} [options]
 */
export function createStateStore(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  /** @type {unknown} */
  let lastRun = null
  let running = false
  let error = ''
  return {
    get lastRun() {
      return lastRun
    },
    /** Запомнить итог прогона каталога. */
    setLastRun(value) {
      lastRun = value
      error = ''
    },
    /** Отметить, что прогон идёт. */
    setRunning(value) {
      running = value === true
    },
    /** Запомнить последнюю ошибку хоста. */
    setError(message) {
      error = typeof message === 'string' ? message : ''
      running = false
    },
    /** Сводка для ответа маршрута. */
    snapshot() {
      return { ok: error.length === 0, at: now(), running, error }
    },
    /** Сбросить всё (для тестов и повторной инициализации). */
    reset() {
      lastRun = null
      running = false
      error = ''
    },
  }
}

/**
 * Собрать ответ `GET /cvc/state`.
 * @param {{ version: string, rowId: string, config: ReturnType<typeof normalizeConfig>, store: ReturnType<typeof createStateStore>, layers: ReturnType<typeof readLayers> }} input
 * @returns {Record<string, unknown>}
 */
export function buildState(input) {
  const { version, rowId, config, store, layers } = input
  const effectiveRaw = { ...layers.inherited, ...layers.override }
  return {
    version,
    features: config.features,
    config,
    configShape: configShapeOf(effectiveRaw),
    status: store.snapshot(),
    lastRun: store.lastRun,
    patchPath: layers.documentPath,
    rowId,
  }
}

/**
 * Записать конфиг в строку плагина.
 *
 * Если нормализованное значение равно умолчаниям — вернуть слой ниже
 * (`inherited`): `configEditor.edit` в этом случае удаляет переопределение.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} rowId
 * @param {ReturnType<typeof normalizeConfig>} next
 * @returns {Promise<void>}
 */
export async function writeConfig(ctx, rowId, next) {
  const editor = ctx.get?.('configEditor') ?? ctx.configEditor
  if (editor === null || typeof editor !== 'object' || typeof editor.edit !== 'function') {
    throw new HttpError(409, 'configuration cannot be saved in this profile: configEditor is unavailable')
  }
  const entry = findEditableEntry(ctx, rowId)
  if (entry === undefined) {
    throw new HttpError(409, `row "${rowId}" is not active; enable the bundle first`)
  }
  const resetToDefaults = sameConfig(next, normalizeConfig({}))
  await editor.edit(entry, (_current, inherited) => (resetToDefaults ? inherited : next))
}

/**
 * Зарегистрировать маршруты состояния.
 *
 * @param {ReturnType<import('./http.js').createRouter>} router
 * @param {{
 *   ctx: import('@deepseek-ai/cordis').Context,
 *   rowId: string,
 *   version: string,
 *   readConfig: () => ReturnType<typeof normalizeConfig>,
 *   store: ReturnType<typeof createStateStore>,
 *   onAfterWrite?: (config: ReturnType<typeof normalizeConfig>) => void,
 * }} deps
 * @returns {() => void}
 */
export function installStateRoutes(router, deps) {
  const disposers = []

  disposers.push(router.register(STATE_PATH, (req, res) => {
    if (String(req.method ?? 'GET').toUpperCase() !== 'GET') {
      methodNotAllowed(res, ['GET'])
      return
    }
    sendJson(res, 200, buildState({
      version: deps.version,
      rowId: deps.rowId,
      config: deps.readConfig(),
      store: deps.store,
      layers: readLayers(deps.ctx, deps.rowId),
    }))
  }))

  disposers.push(router.register(CONFIG_PATH, async (req, res) => {
    if (String(req.method ?? 'GET').toUpperCase() !== 'PUT') {
      methodNotAllowed(res, ['PUT'])
      return
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message })
        return
      }
      throw error
    }
    const raw = isPlainObject(body) && isPlainObject(body.config) ? body.config : body
    const errors = validateConfigInput(raw)
    if (errors.length > 0) {
      sendJson(res, 400, { error: 'invalid config', fields: errors })
      return
    }
    const next = normalizeConfig(raw)
    await writeConfig(deps.ctx, deps.rowId, next)
    deps.onAfterWrite?.(next)
    sendJson(res, 200, { ok: true, config: next, features: next.features })
  }))

  return () => {
    for (const dispose of disposers.reverse()) {
      if (typeof dispose === 'function') dispose()
    }
  }
}