/**
 * Состояние и запись конфига: слои строки, сброс к умолчаниям, сборка
 * `GET /cvc/state` и реестр последнего прогона.
 *
 * Запуск: node --test test/state.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import z from '@deepseek-ai/schemastery'

import { DEFAULTS, normalizeConfig } from '../lib/config.js'
import { CVC_PREFIX, createRouter } from '../lib/http.js'
import {
  buildState,
  createStateStore,
  findEditableEntry,
  installStateRoutes,
  readLayers,
  rowMatches,
  writeConfig,
} from '../lib/state.js'

const ROW = 'cvc-catalog-sync'

/** Поддельный configEditor. */
function makeEditor({ entries = [], layers = [], documentPath = 'C:/tmp/cordis.patch.yml' } = {}) {
  const editor = {
    documentPath,
    entries: () => entries,
    configuration: () => layers,
    edits: [],
    async edit(entry, change) {
      const layer = layers.find((item) => item.entry === entry)
      const next = change(entry.options.config, layer?.inherited ?? {})
      editor.edits.push(next)
      return JSON.stringify(next)
    },
  }
  return editor
}

/** Контекст с сервисом по имени. */
function makeCtx(services = {}) {
  return { get: (name) => services[name] }
}

/** Запрос / ответ для вызова маршрута напрямую. */
function callRoute(router, { method = 'GET', path, headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = `${CVC_PREFIX}${path}`
  req.headers = headers
  req.destroy = () => {}
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
    req.emit('end')
  })
  const res = {
    captured: { status: 0, headers: {}, body: '', headersSent: false, writableEnded: false },
    setHeader(name, value) { this.captured.headers[name.toLowerCase()] = value },
    writeHead(status, extra) {
      this.captured.status = status
      this.captured.headers = { ...this.captured.headers, ...(extra ?? {}) }
    },
    end(chunk) { this.captured.body = chunk ?? ''; this.captured.writableEnded = true },
  }
  return router.handle(req, res).then(() => {
    let json = null
    try {
      json = JSON.parse(res.captured.body)
    } catch {
      json = null
    }
    return { ...res.captured, json }
  })
}

test('rowMatches понимает group-префикс', () => {
  assert.equal(rowMatches('cvc-catalog-sync', ROW), true)
  assert.equal(rowMatches('include:cvc-catalog-sync', ROW), true)
  assert.equal(rowMatches('other', ROW), false)
})

test('readLayers отдаёт override, inherited и путь патча', () => {
  const row = { options: { id: ROW, config: { features: { balance: false } } } }
  const ctx = makeCtx({
    configEditor: makeEditor({
      entries: [row],
      layers: [{ entry: row, inherited: { features: { catalogSync: true } }, override: { features: { balance: false } } }],
    }),
  })
  const layers = readLayers(ctx, ROW)
  assert.equal(layers.active, true)
  assert.equal(layers.entry, row)
  assert.deepEqual(layers.inherited, { features: { catalogSync: true } })
  assert.deepEqual(layers.override, { features: { balance: false } })
  assert.equal(layers.documentPath, 'C:/tmp/cordis.patch.yml')
})

test('readLayers без сервиса и без строки безопасен', () => {
  const empty = readLayers({}, ROW)
  assert.equal(empty.active, false)
  assert.deepEqual(empty.inherited, {})
  const missing = readLayers(makeCtx({ configEditor: makeEditor({ entries: [] }) }), ROW)
  assert.equal(missing.active, false)
  const throwing = readLayers(makeCtx({ configEditor: { configuration: () => { throw new Error('x') } } }), ROW)
  assert.equal(throwing.active, false)
})

test('findEditableEntry находит строку по id и group-префиксу', () => {
  const nested = { options: { id: `include:${ROW}` } }
  assert.equal(findEditableEntry(makeCtx({ configEditor: makeEditor({ entries: [nested] }) }), ROW), nested)
  assert.equal(findEditableEntry(makeCtx({}), ROW), undefined)
})

test('writeConfig передаёт нормализованный конфиг в configEditor', async () => {
  const row = { options: { id: ROW, config: {} } }
  const editor = makeEditor({ entries: [row], layers: [{ entry: row, inherited: {}, override: {} }] })
  const ctx = makeCtx({ configEditor: editor })
  const next = normalizeConfig({ features: { catalogSync: false } })
  await writeConfig(ctx, ROW, next)
  assert.equal(editor.edits.length, 1)
  assert.equal(editor.edits[0].features.catalogSync, false)
})

test('writeConfig при равенстве умолчаниям возвращает inherited', async () => {
  const inherited = { features: { balance: true } }
  const row = { options: { id: ROW, config: {} } }
  const editor = makeEditor({ entries: [row], layers: [{ entry: row, inherited, override: {} }] })
  await writeConfig(makeCtx({ configEditor: editor }), ROW, normalizeConfig({}))
  assert.deepEqual(editor.edits[0], inherited)
})

test('writeConfig без configEditor и без строки бросает 409-совместимую ошибку', async () => {
  await assert.rejects(writeConfig(makeCtx({}), ROW, normalizeConfig({})), (error) => error.status === 409)
  const editor = makeEditor({ entries: [] })
  await assert.rejects(
    writeConfig(makeCtx({ configEditor: editor }), ROW, normalizeConfig({})),
    (error) => error.status === 409 && /not active/.test(error.message),
  )
})

test('buildState складывает конфиг, форму и прогон', () => {
  const store = createStateStore({ now: () => 'now' })
  store.setLastRun({ ok: true, nextModels: 3 })
  const state = buildState({
    version: '2.0.0',
    rowId: ROW,
    config: normalizeConfig({}),
    store,
    layers: { entry: undefined, inherited: {}, override: {}, active: false, documentPath: 'p' },
  })
  assert.deepEqual(state.features, DEFAULTS.features)
  assert.equal(state.configShape, 'v2')
  assert.equal(state.version, '2.0.0')
  assert.equal(state.patchPath, 'p')
  assert.deepEqual(state.lastRun, { ok: true, nextModels: 3 })
  assert.equal(state.status.at, 'now')
})

test('buildState отмечает legacy-патч', () => {
  const state = buildState({
    version: '2.0.0',
    rowId: ROW,
    config: normalizeConfig({}),
    store: createStateStore(),
    layers: { inherited: { entryId: 'llm-pi-ai' }, override: {}, active: true, documentPath: 'p' },
  })
  assert.equal(state.configShape, 'legacy')
})

test('маршруты /state и /config регистрируются и снимаются', async () => {
  const router = createRouter()
  const row = { options: { id: ROW, config: {} } }
  const editor = makeEditor({ entries: [row], layers: [{ entry: row, inherited: {}, override: {} }] })
  const dispose = installStateRoutes(router, {
    ctx: makeCtx({ configEditor: editor }),
    rowId: ROW,
    version: '2.0.0',
    readConfig: () => normalizeConfig({}),
    store: createStateStore(),
  })
  assert.deepEqual(router.paths(), ['config', 'state'])
  assert.equal((await callRoute(router, { path: '/state' })).status, 200)
  dispose()
  assert.deepEqual(router.paths(), [])
})

test('onAfterWrite получает применённый конфиг', async () => {
  const router = createRouter()
  const row = { options: { id: ROW, config: {} } }
  const editor = makeEditor({ entries: [row], layers: [{ entry: row, inherited: {}, override: {} }] })
  const applied = []
  installStateRoutes(router, {
    ctx: makeCtx({ configEditor: editor }),
    rowId: ROW,
    version: '2.0.0',
    readConfig: () => normalizeConfig({}),
    store: createStateStore(),
    onAfterWrite: (config) => applied.push(config),
  })
  const answer = await callRoute(router, {
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { config: { catalog: { intervalHours: 3 } } },
  })
  assert.equal(answer.status, 200)
  assert.equal(applied.length, 1)
  assert.equal(applied[0].catalog.intervalHours, 3)
})

test('PUT /config принимает конфиг и без обёртки {config}', async () => {
  const router = createRouter()
  const row = { options: { id: ROW, config: {} } }
  const editor = makeEditor({ entries: [row], layers: [{ entry: row, inherited: {}, override: {} }] })
  installStateRoutes(router, {
    ctx: makeCtx({ configEditor: editor }),
    rowId: ROW,
    version: '2.0.0',
    readConfig: () => normalizeConfig({}),
    store: createStateStore(),
  })
  const answer = await callRoute(router, {
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { balance: { refreshSeconds: 30 } },
  })
  assert.equal(answer.status, 200)
  assert.equal(answer.json.config.balance.refreshSeconds, 30)
})

/** Ссылка на схему, чтобы z не был неиспользуемым в этом файле. */
void z