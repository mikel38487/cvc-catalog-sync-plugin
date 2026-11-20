/**
 * Стенд прогона каталога на фейковых зависимостях каркаса.
 *
 * Настоящий профиль DSH не читается и не пишется: `configEditor` имитирует
 * контракт DSH — `edit` отдаёт конфиг **на момент блокировки**, после
 * асинхронной паузы, поэтому плагин обязан собирать модели из этого значения,
 * а не из снимка, прочитанного до неё. Каталог приходит от `deps.cache`,
 * уровни — от `deps.api.fetchLevels`.
 *
 * @module test/catalog-sync-support
 */
import assert from 'node:assert/strict'

import { normalizeConfig } from '../../lib/config.js'

const INSTALLER = 'const reasoningLevels = {"m-a":["low","high"],"m-b":["none","high"]};'

/** Модель-заготовка в форме патча. */
export const model = (id, extra = {}) => ({
  id, name: id, contextWindow: 1000, maxTokens: 100, input: ['text'], reasoningEfforts: false, ...extra,
})

export const CATALOG = [
  { id: 'm-a', display_name: 'Vendor · Model A', context_window: 1000, max_output_tokens: 100, supports_vision: true, supports_reasoning: true },
  { id: 'm-b', display_name: 'Vendor · Model B', context_window: 2000, max_output_tokens: 500, supports_vision: false, supports_reasoning: true },
]

/**
 * Поддельный configEditor с контрактом «current на момент блокировки».
 * @param {{ models?: any[], allowlist?: any[], onLock?: (entry: any) => void, now?: () => number }} [options]
 */
export function makeEditor(options = {}) {
  const modelEntry = {
    options: {
      id: 'llm-pi-ai',
      config: { providers: { cheapvibecode: { models: options.models ?? [] } } },
    },
    fiber: { state: 'active' },
  }
  const allowEntry = {
    options: {
      id: 'subagent-model-selection-settings',
      config: { allowedModels: options.allowlist ?? [] },
    },
    fiber: { state: 'active' },
  }
  const state = { writes: 0, entries: [], last: null }
  const editor = {
    documentPath: 'C:/tmp/cordis.patch.yml',
    entries: () => (options.extraEntries ?? []).concat([modelEntry, allowEntry]),
    async edit(entry, change) {
      // Асинхронная пауза = ожидание файловой блокировки в DSH.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (options.onLock !== undefined) options.onLock(entry)
      const current = structuredClone(entry.options.config)
      const next = change(current, {})
      entry.options.config = next
      state.writes += 1
      state.last = next
      state.entries.push(entry.options.id)
    },
  }
  return { editor, state, modelEntry, allowEntry }
}

/**
 * Фейковый сервис состояния (`lib/state.js`).
 *
 * @param {{ now?: () => string }} [options]
 */
export function makeStore(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => 'T'
  const calls = { lastRun: [], running: [], errors: [] }
  return {
    calls,
    lastRun: null,
    async setLastRun(value) {
      this.lastRun = value
      calls.lastRun.push(value)
    },
    async setRunning(value) {
      calls.running.push(value)
    },
    async setError(message) {
      calls.errors.push(message)
    },
    snapshot() {
      return { ok: calls.errors.length === 0, at: now(), running: calls.running.at(-1) === true, error: calls.errors.at(-1) ?? '' }
    },
  }
}

/**
 * Фейковый сервис HMR.
 * @param {(factory: () => unknown) => unknown} exit
 */
export function makeHmr(exit) {
  return { executing: { exit } }
}

/**
 * Стенд: поддельные `ctx`, `deps`, кэш и сеть уровней.
 *
 * @param {{
 *   config?: Record<string, unknown>,
 *   editor?: ReturnType<typeof makeEditor>,
 *   catalog?: any[],
 *   catalogState?: { stale?: boolean, error?: string, empty?: boolean, throws?: Error },
 *   levels?: { levels?: Record<string, string[]>, source?: string, error?: Error },
 *   hmr?: object | null,
 *   now?: () => number,
 *   store?: ReturnType<typeof makeStore>,
 * }} [options]
 */
export function makeHarness(options = {}) {
  const editorBundle = options.editor ?? makeEditor()
  const config = normalizeConfig(options.config ?? { catalog: { autoSync: false } })
  const store = options.store ?? makeStore()
  const calls = {
    route: [],
    logs: [],
    cacheGet: 0,
    cacheForce: [],
    levels: 0,
  }

  let clock = 0
  const now = typeof options.now === 'function' ? options.now : () => clock
  /** Управление кэшем из теста. */
  const cacheState = {
    stale: false,
    error: '',
    empty: false,
    throws: null,
    catalog: options.catalog ?? CATALOG,
    ...options.catalogState,
  }

  const cache = {
    async get(request = {}) {
      calls.cacheGet += 1
      calls.cacheForce.push(request?.force === true)
      if (cacheState.throws !== null) throw cacheState.throws
      return {
        data: { models: cacheState.empty ? [] : cacheState.catalog },
        stale: cacheState.stale,
        error: cacheState.error,
        fetchedAt: now(),
        ageMs: 0,
      }
    },
    async refresh() {
      return this.get({ force: true })
    },
    peek: () => ({ data: { models: cacheState.catalog }, fetchedAt: now(), ageMs: 0 }),
    clear() {},
    ttl: () => 600000,
  }

  const api = {
    async fetchLevels() {
      calls.levels += 1
      const levels = options.levels ?? {}
      if (levels.error !== undefined) throw levels.error
      return {
        levels: levels.levels ?? {
          'm-a': ['low', 'high'],
          'm-b': ['none', 'high'],
        },
        source: levels.source ?? 'https://example.test/idhw',
      }
    },
  }

  /** Маршруты в общей таблице: `path -> handler`. */
  const routes = new Map()
  const httpModule = {
    isJsonRequest(req) {
      return String(req?.headers?.['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/json'
    },
    readJsonBody: async (req) => req.body ?? {},
    sendJson(res, status, body) {
      res.status = status
      res.body = body
    },
    methodNotAllowed(res, allow) {
      res.status = 405
      res.body = { allow }
    },
  }

  const ctx = {
    get(name) {
      if (name === 'configEditor') return editorBundle.editor
      if (name === 'hmr') return options.hmr === null ? undefined : options.hmr
      return undefined
    },
    configEditor: editorBundle.editor,
  }

  const deps = Object.freeze({
    ctx,
    version: '2.0.0',
    config: () => config,
    features: () => ({ ...config.features }),
    log: (level, message) => calls.logs.push({ level, message }),
    route: (path, handler) => {
      routes.set(path, handler)
      calls.route.push(path)
      return () => {
        if (routes.get(path) === handler) routes.delete(path)
      }
    },
    http: httpModule,
    api,
    providers: {},
    cache,
    store,
    routes: () => [],
    key: async () => 'test-key',
    apiKeyFor: () => 'CVC_DEEPSEEK_API_KEY',
    rowId: 'cvc-catalog-sync',
  })

  return {
    ctx,
    deps,
    config,
    routes,
    calls,
    cacheState,
    store,
    editorBundle,
    editor: editorBundle.editor,
    state: editorBundle.state,
    modelEntry: editorBundle.modelEntry,
    allowEntry: editorBundle.allowEntry,
    /** Сдвинуть часы фейкового кэша. */
    advance(ms) {
      clock += ms
    },
    /**
     * Вызвать зарегистрированный маршрут.
     * @param {string} path
     * @param {{ method?: string, body?: unknown, json?: boolean, headers?: Record<string, string> }} [request]
     */
    async call(path, request = {}) {
      const handler = routes.get(path)
      assert.ok(handler !== undefined, `маршрут /cvc/${path} не зарегистрирован`)
      const headers = { ...(request.headers ?? {}) }
      if (request.json !== false && (request.method ?? 'POST') !== 'GET') headers['content-type'] = 'application/json'
      const req = { method: request.method ?? 'POST', url: `/cvc/${path}`, headers, body: request.body ?? {} }
      const res = { status: 0, body: null }
      await handler(req, res)
      return res
    },
  }
}