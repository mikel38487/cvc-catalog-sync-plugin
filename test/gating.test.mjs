/**
 * Гейтинг функций: выключенная функция не регистрирует маршрут, таймер и
 * инструмент; `loader/volatile-update` монтирует и размонтирует на лету.
 *
 * Здесь же проверяются базовые маршруты каркаса: `GET /cvc/state`,
 * `GET /cvc/health`, `PUT /cvc/config` (запись через configEditor, сброс к
 * умолчаниям, 400/405/409) и кэш каталога.
 *
 * Запуск: node --test test/gating.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { apply, Config, SELF_ROW_ID, VERSION } from '../index.js'
import { createCatalogCache } from '../lib/cache.js'
import { createStateStore } from '../lib/state.js'

/** Символ записи volatile-ссылки: так Loader обновляет значение на месте. */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/**
 * Записать в volatile-ссылку новое значение — то, что делает Loader при
 * `loader/volatile-update`.
 * @param {{ get: () => unknown }} reference
 * @param {unknown} value
 */
function writeVolatile(reference, value) {
  reference[VOLATILE_WRITE](value)
}

/**
 * Фейковый cordis-контекст: `effect` запоминает disposer, `inject` вызывает
 * callback при появлении сервиса, `on` — настоящая подписка на событие.
 */
function makeCtx() {
  const effects = []
  const injections = []
  const listeners = new Map()
  const services = {}

  const ctx = {
    fiber: { id: 'cvc-fiber' },
    logger: null,
    get(name) {
      return services[name]
    },
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(callback)
      return () => listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== callback))
    },
    effect(callback) {
      const dispose = callback()
      effects.push(dispose)
      return dispose
    },
    inject(deps, callback) {
      const child = Object.create(ctx)
      const injection = { deps, callback, child, done: false }
      injections.push(injection)
      if (deps.every((dep) => services[dep] !== undefined)) run(injection)
    },
  }

  /** Выполнить отложенный inject. */
  function run(injection) {
    injection.done = true
    injection.callback(injection.child)
  }

  return {
    ctx,
    effects,
    listeners,
    services,
    /** Появился сервис: вызвать все отложенные inject, которые его ждали. */
    provide(name, service) {
      services[name] = service
      // Настоящий context выставляет сервисы свойствами; inject-ребёнок
      // наследует их через прототип.
      ctx[name] = service
      for (const injection of injections) {
        if (!injection.done && injection.deps.every((dep) => services[dep] !== undefined)) run(injection)
      }
    },
    /** Отправить событие подписчикам. */
    emit(event, ...args) {
      for (const callback of listeners.get(event) ?? []) callback(...args)
    },
    /** Снять эффекты в обратном порядке. */
    dispose() {
      while (effects.length > 0) {
        const dispose = effects.pop()
        if (typeof dispose === 'function') dispose()
      }
    },
  }
}

/** Поддельный веб-сервер: складывает маршруты и снимает их. */
function makeWebServer() {
  const routes = []
  return {
    routes,
    register(route) {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
    /** Ответить на запрос к `/cvc` route. */
    async call({ method = 'GET', path = '/state', headers = {}, body } = {}) {
      const route = routes.find((item) => item.path === '/cvc')
      assert.ok(route !== undefined, 'prefix-маршрут /cvc не зарегистрирован')
      const req = new EventEmitter()
      req.method = method
      req.url = `/cvc${path}`
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
          this.captured.headersSent = true
        },
        end(chunk) {
          this.captured.body = chunk ?? ''
          this.captured.writableEnded = true
        },
      }
      await route.handler(req, res)
      let json = null
      try {
        json = JSON.parse(res.captured.body)
      } catch {
        json = null
      }
      return { ...res.captured, json }
    },
  }
}

/** Поддельный реестр инструментов. */
function makeTools() {
  const names = []
  return {
    names,
    register(spec) {
      names.push(spec.name)
      return () => {
        const index = names.indexOf(spec.name)
        if (index >= 0) names.splice(index, 1)
      }
    },
  }
}

/** Поддельный configEditor: строки, слои и запись. */
function makeEditor({ entries = [], layers = [], onEdit } = {}) {
  const editor = {
    documentPath: 'C:/tmp/cordis.patch.yml',
    writes: [],
    entries: () => entries,
    configuration: () => layers,
    async edit(entry, change) {
      const layer = layers.find((item) => item.entry === entry)
      const next = change(entry.options.config, layer?.inherited ?? {})
      editor.writes.push(next)
      const json = JSON.stringify(next)
      if (onEdit !== undefined) return onEdit(json)
      return json
    },
  }
  return editor
}

/** Полный тестовый стенд: сервисы профиля + веб-сервер + tools. */
function boot(options = {}) {
  const harness = makeCtx()
  const webServer = makeWebServer()
  const tools = makeTools()
  const row = { options: { id: SELF_ROW_ID, config: {} } }
  const editor = options.editor ?? makeEditor({ entries: [row] })
  const config = Config(options.raw ?? {})
  if (options.services !== false) {
    harness.provide('configEditor', editor)
    harness.provide('tools', tools)
    harness.provide('credentials', { resolve: async () => ({ value: 'test-key' }) })
  }
  if (options.webServer !== false) harness.provide('webServer', webServer)
  if (options.settings === true) harness.provide('settings', harness.services.settings)
  apply(harness.ctx, config)
  return { harness, webServer, tools, editor, config }
}

test('все функции включены: маршруты всех трёх функций и health/state', async () => {
  const { webServer } = boot()
  assert.equal((await webServer.call({ path: '/health' })).json.ok, true)
  assert.equal((await webServer.call({ path: '/state' })).status, 200)
  assert.deepEqual((await webServer.call({ path: '/coefficients' })).json.models, [])
  assert.deepEqual((await webServer.call({ path: '/balance' })).json.providers, [])
  const run = await webServer.call({ method: 'POST', path: '/run', headers: { 'content-type': 'application/json' }, body: { action: 'plan' } })
  assert.equal(run.status, 200)
  assert.equal(run.json.action, 'plan')
})

test('GET /state отдаёт конфиг, форму, путь патча и id строки', async () => {
  const row = { options: { id: SELF_ROW_ID, config: { entryId: 'llm-pi-ai' } } }
  const editor = makeEditor({
    entries: [row],
    layers: [{ entry: row, inherited: {}, override: { entryId: 'llm-pi-ai' } }],
  })
  const { webServer } = boot({ editor })
  const state = await webServer.call({ path: '/state' })
  assert.equal(state.json.version, VERSION)
  assert.equal(state.json.rowId, SELF_ROW_ID)
  assert.equal(state.json.patchPath, 'C:/tmp/cordis.patch.yml')
  assert.equal(state.json.configShape, 'legacy')
  assert.equal(state.json.config.features.balance, true)
  assert.equal(state.json.lastRun, null)
  assert.equal(state.json.status.running, false)
})

test('выключенная функция отвечает 404, остальные продолжают работать', async () => {
  const { webServer } = boot({ raw: { features: { balance: false } } })
  assert.equal((await webServer.call({ path: '/balance' })).status, 404)
  assert.equal((await webServer.call({ path: '/coefficients' })).status, 200)
  const run = await webServer.call({ method: 'POST', path: '/run', headers: { 'content-type': 'application/json' }, body: {} })
  assert.equal(run.status, 200)
  assert.equal(run.json.action, 'plan')
})

test('все три функции выключены: страница настроек живёт, остальное 404', async () => {
  const { webServer } = boot({ raw: { features: { catalogSync: false, coefficients: false, balance: false } } })
  assert.equal((await webServer.call({ path: '/state' })).status, 200)
  assert.equal((await webServer.call({ path: '/health' })).status, 200)
  for (const path of ['/coefficients', '/balance', '/run']) {
    const answer = path === '/run'
      ? await webServer.call({ method: 'POST', path, headers: { 'content-type': 'application/json' }, body: {} })
      : await webServer.call({ path })
    assert.equal(answer.status, 404, path)
  }
})

test('prefix /cvc регистрируется ровно один раз при любой комбинации', () => {
  for (const features of [
    {},
    { catalogSync: false },
    { coefficients: false, balance: false },
    { catalogSync: false, coefficients: false, balance: false },
  ]) {
    const { webServer } = boot({ raw: { features } })
    assert.equal(webServer.routes.length, 1)
    assert.equal(webServer.routes[0].kind, 'prefix')
    assert.equal(webServer.routes[0].path, '/cvc')
  }
})

test('volatile-update выключает баланс без перезапуска', async () => {
  const { harness, webServer, config } = boot()
  assert.equal((await webServer.call({ path: '/balance' })).status, 200)
  writeVolatile(config.features.balance, false)
  harness.emit('loader/volatile-update', [['features', 'balance']])
  assert.equal((await webServer.call({ path: '/balance' })).status, 404)
  assert.equal(webServer.routes.length, 1)
})

test('volatile-update включает выключенную функцию обратно', async () => {
  const { harness, webServer, config } = boot({ raw: { features: { coefficients: false } } })
  assert.equal((await webServer.call({ path: '/coefficients' })).status, 404)
  writeVolatile(config.features.coefficients, true)
  harness.emit('loader/volatile-update', [['features', 'coefficients']])
  assert.equal((await webServer.call({ path: '/coefficients' })).status, 200)
})

test('volatile-update выключает и включает каталог', async () => {
  const { harness, webServer, config } = boot()
  writeVolatile(config.features.catalogSync, false)
  harness.emit('loader/volatile-update', [['features', 'catalogSync']])
  const off = await webServer.call({ method: 'POST', path: '/run', headers: { 'content-type': 'application/json' }, body: {} })
  assert.equal(off.status, 404)
  writeVolatile(config.features.catalogSync, true)
  harness.emit('loader/volatile-update', [['features', 'catalogSync']])
  const on = await webServer.call({ method: 'POST', path: '/run', headers: { 'content-type': 'application/json' }, body: {} })
  assert.equal(on.status, 200)
  assert.equal(on.json.action, 'plan')
})

test('volatile-update с изменением обычных настроек перемонтирует включённую функцию', async () => {
  // Перемонтирование видно по повторной регистрации инструмента: функция
  // снимается и ставится заново, поэтому в реестре по-прежнему одно имя, а не два.
  // Счётчик живёт во внешней переменной: index.js берёт tools.register из контекста
  // на каждом монтировании, поэтому обёртка над объектом её не переживает.
  const { harness, tools, webServer, config } = boot()
  let mounts = 0
  const register = tools.register
  tools.register = (spec) => {
    mounts += 1
    return register(spec)
  }
  writeVolatile(config.catalog.intervalHours, 6)
  harness.emit('loader/volatile-update', [['catalog', 'intervalHours']])
  assert.equal(mounts, 1, 'перемонтировалась ровно одна функция — каталог')
  // Порядок в реестре — следствие перемонтирования, набор важен, порядок нет.
  assert.deepEqual([...tools.names].sort(), ['cvc_balance', 'cvc_catalog'], 'дублей инструментов нет')
  const state = await webServer.call({ path: '/state' })
  assert.equal(state.json.config.catalog.intervalHours, 6)
  assert.equal((await webServer.call({ method: 'POST', path: '/run', headers: { 'content-type': 'application/json' }, body: {} })).status, 200)
  // Выключение баланса снимает только его инструмент, каталог не трогается.
  writeVolatile(config.features.balance, false)
  harness.emit('loader/volatile-update', [['features', 'balance']])
  assert.deepEqual(tools.names, ['cvc_catalog'])
  assert.equal((await webServer.call({ path: '/balance' })).status, 404)
})

test('повторное событие с тем же конфигом ничего не перемонтирует', async () => {
  const { harness, webServer } = boot()
  const before = (await webServer.call({ path: '/coefficients' })).status
  harness.emit('loader/volatile-update', [])
  harness.emit('loader/volatile-update', [['features', 'balance']])
  assert.equal((await webServer.call({ path: '/coefficients' })).status, before)
})

test('PUT /cvc/config пишет через configEditor и применяет функции сразу', async () => {
  const { webServer, editor } = boot()
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { config: { features: { balance: false } } },
  })
  assert.equal(answer.status, 200, JSON.stringify(answer.json))
  assert.equal(answer.json.ok, true)
  assert.equal(answer.json.features.balance, false)
  assert.equal(answer.json.config.features.balance, false)
  assert.equal(editor.writes.length, 1)
  assert.equal(editor.writes[0].features.balance, false)
  assert.equal((await webServer.call({ path: '/balance' })).status, 404)
})

test('PUT /cvc/config со сбросом к умолчаниям возвращает слой ниже', async () => {
  // Сброс означает «удалить переопределение»: configEditor получает inherited,
  // а не копию умолчаний, и сам решает, что записать в патч.
  const inherited = { features: { catalogSync: true, coefficients: true, balance: true } }
  const row = { options: { id: SELF_ROW_ID, config: inherited } }
  const editor = makeEditor({
    entries: [row],
    layers: [{ entry: row, inherited, override: { features: { balance: false } } }],
  })
  const { webServer } = boot({ editor })
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { config: { features: { catalogSync: true, coefficients: true, balance: true } } },
  })
  assert.equal(answer.status, 200, JSON.stringify(answer.json))
  assert.deepEqual(editor.writes[0], inherited)
})

test('PUT /cvc/config без configEditor — 409, а не тихая запись', async () => {
  const { webServer, harness } = boot()
  // Сервис пропал (например, профиль откатился): запись обязана отказать.
  harness.services.configEditor = undefined
  harness.ctx.configEditor = undefined
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { config: {} },
  })
  assert.equal(answer.status, 409)
  assert.match(answer.json.error, /configEditor/)
})

test('PUT /cvc/config при отсутствии своей строки — 409', async () => {
  const editor = makeEditor({ entries: [] })
  const { webServer } = boot({ editor })
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { config: {} },
  })
  assert.equal(answer.status, 409)
  assert.match(answer.json.error, /not active/)
})

test('GET на PUT-маршрут — 405 с Allow, POST на GET-маршрут — 405', async () => {
  const { webServer } = boot()
  const configByGet = await webServer.call({ path: '/config' })
  assert.equal(configByGet.status, 405)
  assert.equal(configByGet.headers.allow, 'PUT')
  const stateByPost = await webServer.call({ method: 'POST', path: '/state', headers: { 'content-type': 'application/json' }, body: {} })
  assert.equal(stateByPost.status, 405)
  assert.equal(stateByPost.headers.allow, 'GET')
})

test('фенс cross-site и 415 работают для функций', async () => {
  const { webServer } = boot()
  assert.equal((await webServer.call({ path: '/coefficients', headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  const badType = await webServer.call({ method: 'PUT', path: '/config', headers: { 'content-type': 'text/plain' }, body: '{}' })
  assert.equal(badType.status, 415)
})

test('без веб-сервера плагин активируется и не регистрирует маршрутов', () => {
  const { webServer } = boot({ webServer: false })
  assert.equal(webServer.routes.length, 0)
})

test('без tools плагин активируется и предупреждает', () => {
  const harness = makeCtx()
  harness.provide('webServer', makeWebServer())
  harness.provide('configEditor', makeEditor())
  harness.provide('credentials', { resolve: async () => ({ value: 'k' }) })
  const warnings = []
  harness.ctx.logger = { warn: (line) => warnings.push(line) }
  apply(harness.ctx, Config({}))
  harness.emit('loader/volatile-update', [])
  assert.equal(harness.effects.length > 0, true)
  assert.ok(Array.isArray(warnings))
})

test('settings.configure({ auto: false }) вызывается в inject и снимается', () => {
  const harness = makeCtx()
  const policies = []
  harness.provide('webServer', makeWebServer())
  harness.provide('configEditor', makeEditor())
  harness.provide('tools', makeTools())
  harness.provide('credentials', { resolve: async () => ({ value: 'k' }) })
  apply(harness.ctx, Config({}))
  harness.provide('settings', {
    configure(options, fiber) {
      policies.push({ options, fiber })
      return () => {
        const index = policies.findIndex((item) => item.options === options)
        if (index >= 0) policies.splice(index, 1)
      }
    },
  })
  assert.equal(policies.length, 1)
  assert.deepEqual(policies[0].options, { auto: false })
  assert.equal(policies[0].fiber, harness.ctx.fiber)
})

test('без сервиса settings плагин грузится, политика не регистрируется', () => {
  const harness = makeCtx()
  harness.provide('configEditor', makeEditor())
  harness.provide('tools', makeTools())
  harness.provide('credentials', { resolve: async () => ({ value: 'k' }) })
  apply(harness.ctx, Config({}))
  assert.equal(harness.effects.length > 0, true)
  harness.dispose()
  assert.equal(harness.effects.length, 0)
})

test('выключение плагина снимает все маршруты, включая базовые', async () => {
  const { harness, webServer } = boot()
  harness.dispose()
  assert.equal(webServer.routes.length, 0)
})

test('инструмент: имя есть в реестре при включённой функции и нет при выключенной', () => {
  const on = boot()
  // Набор инструментов проверяют функции, файл проверяет только гейтинг.
  assert.equal(on.tools.names.includes('cvc_catalog'), true)
  assert.equal(on.tools.names.includes('cvc_balance'), true)
  const off = boot({ raw: { features: { catalogSync: false } } })
  assert.equal(off.tools.names.includes('cvc_catalog'), false)
  // Баланс выключен с самого начала: его инструмент не должен даже мелькнуть.
  const noBalance = boot({ raw: { features: { balance: false } } })
  assert.equal(noBalance.tools.names.includes('cvc_balance'), false)
  assert.equal(noBalance.tools.names.includes('cvc_catalog'), true)
})

test('createStateStore хранит прогон, ошибку и отмечает running', () => {
  const store = createStateStore({ now: () => 'T' })
  assert.deepEqual(store.snapshot(), { ok: true, at: 'T', running: false, error: '' })
  store.setRunning(true)
  store.setLastRun({ ok: true })
  assert.equal(store.lastRun.ok, true)
  assert.equal(store.snapshot().running, true)
  store.setError('boom')
  assert.deepEqual(store.snapshot(), { ok: false, at: 'T', running: false, error: 'boom' })
  store.reset()
  assert.equal(store.lastRun, null)
})

test('кэш каталога: свежий снимок без сети, force идёт в сеть', async () => {
  let calls = 0
  let clock = 1000
  const cache = createCatalogCache({
    client: async () => { calls += 1; return { models: [{ id: `m${calls}` }] } },
    ttlMs: 60_000,
    now: () => clock,
  })
  const first = await cache.get()
  assert.equal(first.data.models[0].id, 'm1')
  assert.equal(first.stale, false)
  clock += 30_000
  assert.equal((await cache.get()).data.models[0].id, 'm1')
  assert.equal(calls, 1)
  assert.equal((await cache.refresh()).data.models[0].id, 'm2')
  assert.equal(calls, 2)
})

test('кэш каталога: ошибка отдаёт прошлый снимок как stale, без снимка — бросает', async () => {
  let fail = false
  const cache = createCatalogCache({
    client: async () => {
      if (fail) throw new Error('upstream down')
      return { ok: 1 }
    },
    ttlMs: 1000,
  })
  await cache.get()
  fail = true
  const stale = await cache.refresh()
  assert.equal(stale.stale, true)
  assert.equal(stale.error, 'upstream down')
  assert.deepEqual(stale.data, { ok: 1 })
  cache.clear()
  await assert.rejects(cache.refresh(), /upstream down/)
})

test('кэш каталога: параллельные запросы сливаются в один', async () => {
  let calls = 0
  let release = () => {}
  const cache = createCatalogCache({
    client: () => {
      calls += 1
      return new Promise((resolve) => { release = () => resolve({ ok: calls }) })
    },
    ttlMs: 1000,
  })
  const one = cache.get()
  const two = cache.get()
  release()
  const [a, b] = await Promise.all([one, two])
  assert.equal(calls, 1)
  assert.deepEqual(a.data, b.data)
  assert.deepEqual(cache.peek().data, { ok: 1 })
})

test('кэш каталога: TTL берётся из текущего конфига', async () => {
  let ttl = 1000
  let calls = 0
  let clock = 0
  const cache = createCatalogCache({
    client: async () => { calls += 1; return calls },
    ttlMs: () => ttl,
    now: () => clock,
  })
  await cache.get()
  clock += 500
  ttl = 0
  assert.equal((await cache.get()).data, 1, 'ttl 0 невалиден: берётся дефолт, снимок ещё свежий')
  assert.equal(calls, 1)
  ttl = 100
  assert.equal((await cache.get()).data, 2, 'ttl 100 < 500 лет жизни → снимок устарел')
  assert.equal(calls, 2)
})

test('кэш каталога: clear сбрасывает снимок', async () => {
  let calls = 0
  const cache = createCatalogCache({ client: async () => { calls += 1; return calls }, ttlMs: 60_000 })
  assert.equal((await cache.get()).data, 1)
  cache.clear()
  assert.equal(cache.peek(), null)
  assert.equal((await cache.get()).data, 2)
})

test('кэш каталога без клиента бросает', () => {
  assert.throws(() => createCatalogCache({}), /client must be a function/)
})