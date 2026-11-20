/**
 * HTTP-контракт 2.0.0 на живом `apply()`: `GET /cvc/state`, `PUT /cvc/config`,
 * `POST /cvc/run` (порт test/settings-api.mjs 1.0.0 на новые маршруты).
 *
 * Настоящий профиль DSH не читается и не пишется: `configEditor`, веб-сервер и
 * сеть поддельные, но путь запроса проходит через настоящий `createRouter`,
 * гейтинг `apply()` и `lib/state.js`.
 *
 * Запуск: node --test test/api.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { apply, SELF_ROW_ID, VERSION } from '../index.js'
import { Config } from '../lib/config.js'

const INSTALLER = 'const reasoningLevels = {"m-a":["low","high"],"m-b":["none","high"]};'
const SECRET = 'secret-test-key'

const CATALOG = [
  { id: 'm-a', display_name: 'Vendor · Model A', context_window: 1000, max_output_tokens: 100, supports_vision: true, supports_reasoning: true, output_modalities: ['text'] },
  { id: 'm-b', display_name: 'Vendor · Model B', context_window: 2000, max_output_tokens: 500, supports_vision: false, supports_reasoning: true, output_modalities: ['text'] },
]

const model = (id, extra = {}) => ({
  id, name: id, contextWindow: 1000, maxTokens: 100, input: ['text'], reasoningEfforts: false, ...extra,
})

/**
 * Подменить глобальный fetch: каталог и установщик уровней.
 * @param {{ catalog?: any[], installer?: string, fail?: Error | null }} [options]
 */
function installFetch(options = {}) {
  const calls = []
  const original = globalThis.fetch
  const state = { fail: options.fail ?? null, catalog: options.catalog ?? CATALOG, installer: options.installer ?? INSTALLER }
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (state.fail !== null) throw state.fail
    const href = String(url)
    if (href.endsWith('/models')) {
      return { ok: true, status: 200, json: async () => ({ data: state.catalog }), text: async () => '' }
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => state.installer }
  }
  return { calls, state, restore: () => { globalThis.fetch = original } }
}

/**
 * Фейковый cordis-контекст (как в gating.test.mjs, минимум для index.apply).
 */
function makeCtx() {
  const effects = []
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
      if (deps.every((dep) => services[dep] !== undefined)) {
        injection.done = true
        callback(child)
      }
    },
  }
  return {
    ctx,
    effects,
    listeners,
    services,
    provide(name, service) {
      services[name] = service
      ctx[name] = service
    },
    emit(event, ...args) {
      for (const callback of listeners.get(event) ?? []) callback(...args)
    },
    dispose() {
      while (effects.length > 0) {
        const dispose = effects.pop()
        if (typeof dispose === 'function') dispose()
      }
    },
  }
}

/** Поддельный веб-сервер: складывает маршруты и умеет отвечать на запрос. */
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

/**
 * Поддельный configEditor: своя строка плагина, маршруты провайдеров,
 * allowlist сабагентов и запись «как в DSH» — колбэк получает current.
 */
function makeEditor({ models = [], allowlist = [], pluginConfig = {} } = {}) {
  const row = { options: { id: SELF_ROW_ID, config: pluginConfig } }
  const llm = {
    options: {
      id: 'llm-pi-ai',
      config: { providers: { cheapvibecode: { baseURL: 'https://ru.cheapvibecode.ru/v1', models } } },
    },
  }
  const subagents = { options: { id: 'subagent-model-selection-settings', config: { allowedModels: allowlist } } }
  const writes = []
  const editor = {
    documentPath: 'C:/tmp/cordis.patch.yml',
    entries: () => [row, llm, subagents],
    configuration: () => [{ entry: row, inherited: {}, override: { ...row.options.config } }],
    async edit(entry, change) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const next = change(structuredClone(entry.options.config), {})
      entry.options.config = next
      writes.push({ id: entry.options.id, value: next })
    },
  }
  return { editor, writes, row, llm, subagents }
}

/**
 * Полный стенд: сервисы профиля, веб-сервер, инструменты, apply().
 * @param {{ editor?: ReturnType<typeof makeEditor>, raw?: Record<string, unknown>, logger?: object }} [options]
 */
function boot(options = {}) {
  const harness = makeCtx()
  const webServer = makeWebServer()
  const tools = {
    names: [],
    specs: [],
    register(spec) {
      this.names.push(spec.name)
      this.specs.push(spec)
      return () => {
        const index = this.names.indexOf(spec.name)
        if (index >= 0) this.names.splice(index, 1)
        const specIndex = this.specs.indexOf(spec)
        if (specIndex >= 0) this.specs.splice(specIndex, 1)
      }
    },
  }
  const bundle = options.editor ?? makeEditor()
  harness.provide('configEditor', bundle.editor)
  harness.provide('tools', tools)
  harness.provide('credentials', { resolve: async () => ({ value: SECRET, source: 'test' }) })
  harness.provide('webServer', webServer)
  harness.ctx.logger = options.logger ?? null
  apply(harness.ctx, Config(options.raw ?? {
    features: { catalogSync: true, coefficients: false, balance: false },
    catalog: { autoSync: false },
  }))
  return { harness, webServer, tools, ...bundle }
}

/** JSON-заголовки для POST/PUT. */
const json = { 'content-type': 'application/json' }

test('GET /cvc/state отдаёт версию, конфиг, форму, путь и id строки', async () => {
  const { webServer } = boot()
  const answer = await webServer.call({ path: '/state' })
  assert.equal(answer.status, 200)
  assert.equal(answer.json.version, VERSION)
  assert.equal(answer.json.rowId, SELF_ROW_ID)
  assert.equal(answer.json.patchPath, 'C:/tmp/cordis.patch.yml')
  assert.equal(answer.json.configShape, 'v2')
  assert.equal(answer.json.config.features.catalogSync, true)
  assert.equal(answer.json.config.catalog.autoSync, false)
  assert.equal(answer.json.lastRun, null)
  assert.equal(answer.json.status.running, false)
  assert.equal(answer.json.status.error, '')
})

test('PUT /cvc/config валидирует, пишет и сразу применяет переключатель', async () => {
  const { webServer, writes, harness } = boot()
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: json,
    body: { config: { features: { catalogSync: false } } },
  })
  assert.equal(answer.status, 200, JSON.stringify(answer.json))
  assert.equal(answer.json.ok, true)
  assert.equal(answer.json.config.features.catalogSync, false)
  assert.equal(answer.json.features.catalogSync, false)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].id, SELF_ROW_ID)
  assert.equal(writes[0].value.features.catalogSync, false)

  // Функция размонтирована без перезапуска: маршрут прогона отвечает 404.
  const run = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'plan' } })
  assert.equal(run.status, 404)
  assert.equal((await webServer.call({ path: '/state' })).json.config.features.catalogSync, false)
  harness.dispose()
})

test('PUT /cvc/config отклоняет неверные значения с понятными полями', async () => {
  const { webServer, writes } = boot()
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: json,
    body: {
      config: {
        providers: { baseURL: 'not a url', timeoutMs: 0 },
        catalog: { minModelRatio: 5, installerUrls: [] },
      },
    },
  })
  assert.equal(answer.status, 400)
  const fields = answer.json.fields.join(' ')
  assert.match(fields, /providers\.baseURL/)
  assert.match(fields, /providers\.timeoutMs/)
  assert.match(fields, /catalog\.minModelRatio/)
  assert.match(fields, /catalog\.installerUrls/)
  assert.equal(writes.length, 0, 'invalid config must not be written')
})

test('PUT /cvc/config принимает конфиг и без обёртки {config}', async () => {
  const { webServer, writes } = boot()
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: json,
    body: { catalog: { intervalHours: 6 } },
  })
  assert.equal(answer.status, 200, JSON.stringify(answer.json))
  assert.equal(answer.json.config.catalog.intervalHours, 6)
  assert.equal(writes.length, 1)
})

test('PUT /cvc/config требует application/json — 415', async () => {
  const { webServer, writes } = boot()
  const answer = await webServer.call({
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  })
  assert.equal(answer.status, 415)
  assert.equal(writes.length, 0)
})

test('GET на PUT-маршрут — 405 с Allow, POST на GET-маршрут — 405', async () => {
  const { webServer } = boot()
  const configByGet = await webServer.call({ path: '/config' })
  assert.equal(configByGet.status, 405)
  assert.equal(configByGet.headers.allow, 'PUT')
  const stateByPost = await webServer.call({ method: 'POST', path: '/state', headers: json, body: {} })
  assert.equal(stateByPost.status, 405)
  assert.equal(stateByPost.headers.allow, 'GET')
})

test('фенс cross-site отклоняется на всех маршрутах функций', async () => {
  const { webServer } = boot()
  assert.equal((await webServer.call({ path: '/state', headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await webServer.call({ method: 'POST', path: '/run', headers: { ...json, 'sec-fetch-site': 'cross-site' }, body: {} })).status, 403)
})

test('неизвестный маршрут отвечает 404', async () => {
  const { webServer } = boot()
  assert.equal((await webServer.call({ path: '/unknown' })).status, 404)
})

test('POST /cvc/run plan показывает дифф, ничего не пишет, итог виден в /state', async () => {
  const net = installFetch()
  try {
    const { webServer, writes } = boot({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
    const answer = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'plan' } })
    assert.equal(answer.status, 200, JSON.stringify(answer.json))
    assert.equal(answer.json.action, 'plan')
    assert.equal(answer.json.ok, true, answer.json.error)
    assert.equal(answer.json.applied, false)
    assert.equal(answer.json.catalogModels, 2)
    assert.deepEqual([...answer.json.added].sort(), ['m-a', 'm-b'])
    assert.match(answer.json.levelsSource, /idhw/)
    assert.equal(writes.length, 0)

    const state = await webServer.call({ path: '/state' })
    assert.equal(state.json.lastRun.action, 'plan')
    assert.equal(state.json.lastRun.ok, true)
    assert.equal(state.json.lastRun.added.length, 2)
  } finally {
    net.restore()
  }
})

test('POST /cvc/run apply пишет models и allowedModels', async () => {
  const net = installFetch()
  try {
    const bundle = makeEditor({ models: [model('old')], allowlist: [{ provider: 'cheapvibecode', model: 'old' }] })
    const { webServer, writes } = boot({ editor: bundle })
    const answer = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'apply' } })
    assert.equal(answer.status, 200, JSON.stringify(answer.json))
    assert.equal(answer.json.ok, true, answer.json.error)
    assert.equal(answer.json.applied, true)
    assert.equal(answer.json.removed.length, 1)
    assert.equal(writes.length, 2, 'models plus allowlist')
    assert.deepEqual(
      bundle.llm.options.config.providers.cheapvibecode.models.map((entry) => entry.id),
      ['m-a', 'm-b'],
    )
    assert.deepEqual(bundle.subagents.options.config.allowedModels, [
      { provider: 'cheapvibecode', model: 'm-a' },
      { provider: 'cheapvibecode', model: 'm-b' },
    ])
    const state = await webServer.call({ path: '/state' })
    assert.equal(state.json.lastRun.action, 'apply')
    assert.equal(state.json.lastRun.applied, true)
  } finally {
    net.restore()
  }
})

test('POST /cvc/run: неизвестный action — 400 до сети', async () => {
  const net = installFetch()
  try {
    const { webServer } = boot()
    for (const action of ['reset', 'apply-all', null]) {
      const answer = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action } })
      assert.equal(answer.status, 400, String(action))
      assert.match(answer.json.error, /action must be/)
    }
  } finally {
    net.restore()
  }
})

test('POST /cvc/run: guard отдаёт 409, force обходит и пишет предупреждение', async () => {
  const current = []
  for (let index = 0; index < 10; index += 1) current.push(model(`m-${index}`))
  const net = installFetch({ catalog: [{ id: 'only', display_name: 'Only', context_window: 1000, max_output_tokens: 100 }] })
  try {
    const { webServer, writes } = boot({ editor: makeEditor({ models: current, allowlist: [] }) })
    const refused = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'apply' } })
    assert.equal(refused.status, 409, JSON.stringify(refused.json))
    assert.equal(refused.json.ok, false)
    assert.match(refused.json.error, /guard:/)
    assert.equal(writes.length, 0)

    const forced = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'apply', force: true } })
    assert.equal(forced.status, 200, JSON.stringify(forced.json))
    assert.equal(forced.json.ok, true, forced.json.error)
    assert.equal(forced.json.applied, true)
    assert.match(forced.json.warnings.join(' '), /force: model-count guard bypassed/)
  } finally {
    net.restore()
  }
})

test('POST /cvc/run: stale каталог — plan с предупреждением, apply 409, force пишет', async () => {
  const net = installFetch()
  try {
    const { webServer, writes } = boot({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
    // Первый plan прогревает общий кэш каталога.
    const warm = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'plan' } })
    assert.equal(warm.json.ok, true)

    net.state.fail = new Error('network down')
    const plan = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'plan' } })
    assert.equal(plan.status, 200)
    assert.equal(plan.json.ok, true)
    assert.match(plan.json.warnings.join(' '), /catalog is stale/)

    const refused = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'apply' } })
    assert.equal(refused.status, 409, JSON.stringify(refused.json))
    assert.match(refused.json.error, /catalog is stale/)
    assert.equal(writes.length, 0)

    const forced = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'apply', force: true } })
    assert.equal(forced.status, 200, JSON.stringify(forced.json))
    assert.equal(forced.json.ok, true, forced.json.error)
    assert.match(forced.json.warnings.join(' '), /force: stale catalog applied/)
    assert.equal(writes.length, 2)
  } finally {
    net.restore()
  }
})

test('POST /cvc/run: отсутствие ключа — понятная ошибка в теле, не 500', async () => {
  const net = installFetch()
  try {
    const { webServer, harness } = boot()
    harness.services.credentials.resolve = async () => ({ value: '' })
    const answer = await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'plan' } })
    assert.equal(answer.status, 200)
    assert.equal(answer.json.ok, false)
    assert.match(answer.json.error, /API key is not configured/)
  } finally {
    net.restore()
  }
})

test('POST /cvc/run: битый JSON — 400, не-JSON content-type — 415, GET — 405', async () => {
  const { webServer } = boot()
  const broken = await webServer.call({ method: 'POST', path: '/run', headers: json, body: '{' })
  assert.equal(broken.status, 400)
  assert.match(broken.json.error, /invalid JSON/)

  const plain = await webServer.call({ method: 'POST', path: '/run', headers: { 'content-type': 'text/plain' }, body: '{}' })
  assert.equal(plain.status, 415)

  const get = await webServer.call({ method: 'GET', path: '/run' })
  assert.equal(get.status, 405)
  assert.equal(get.headers.allow, 'POST')
})

test('ключ не попадает ни в ответы маршрутов, ни в лог', async () => {
  const net = installFetch()
  const lines = []
  try {
    const { webServer } = boot({ logger: { info: (line) => lines.push(line), warn: (line) => lines.push(line) } })
    const answers = [
      await webServer.call({ path: '/state' }),
      await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'plan' } }),
      await webServer.call({ method: 'POST', path: '/run', headers: json, body: { action: 'apply' } }),
    ]
    const dump = JSON.stringify(answers.map((answer) => answer.json))
    assert.equal(dump.includes(SECRET), false)
    assert.equal(dump.includes('Bearer'), false)
    assert.equal(dump.includes('authorization'), false)
    assert.equal(lines.join('\n').includes(SECRET), false)
  } finally {
    net.restore()
  }
})

test('выключенная функция не регистрирует ни маршрута, ни инструмента', async () => {
  const { webServer, tools } = boot({
    raw: {
      features: { catalogSync: false, coefficients: false, balance: false },
      catalog: { autoSync: false },
    },
  })
  const run = await webServer.call({ method: 'POST', path: '/run', headers: json, body: {} })
  assert.equal(run.status, 404)
  assert.deepEqual(tools.names, [])
})

test('при включённой функции инструмент cvc_catalog зарегистрирован', () => {
  const { tools } = boot()
  assert.deepEqual(tools.names, ['cvc_catalog'])
  assert.equal(tools.specs[0].name, 'cvc_catalog')
})

test('инструмент на живом стенде: apply пишет, потом «no difference»', async () => {
  const net = installFetch()
  try {
    const bundle = makeEditor({ models: [model('old')], allowlist: [] })
    const { tools, harness } = boot({ editor: bundle })
    const spec = tools.specs.find((entry) => entry.name === 'cvc_catalog')
    assert.ok(spec !== undefined)
    const signal = new AbortController().signal

    const planned = await spec.execute({ action: 'plan' }, { signal })
    assert.equal(planned.ok, true, planned.error)
    assert.deepEqual([...planned.added].sort(), ['m-a', 'm-b'])

    const applied = await spec.execute({ action: 'apply' }, { signal })
    assert.equal(applied.ok, true, applied.error)
    assert.equal(applied.applied, true)

    const again = await spec.execute({ action: 'apply' }, { signal })
    assert.equal(again.ok, true)
    assert.equal(again.applied, false)
    assert.match(spec.output.render({}, again)[0].text, /catalog: no difference/)

    const status = await spec.execute({ action: 'status' })
    assert.equal(status.action, 'status')
    assert.equal(status.catalogModels, 2)
    assert.equal(status.nextModels, 2)
    // Итог того же прогона виден и в общем состоянии плагина.
    assert.equal(harness.services.configEditor, bundle.editor)
  } finally {
    net.restore()
  }
})

test('инструмент на живом стенде: status и plan попадают в GET /cvc/state', async () => {
  const net = installFetch()
  try {
    const { tools, webServer } = boot({ editor: makeEditor({ models: [model('old')], allowlist: [] }) })
    const spec = tools.specs.find((entry) => entry.name === 'cvc_catalog')
    assert.deepEqual((await webServer.call({ path: '/state' })).json.status.running, false)
    const value = await spec.execute({ action: 'plan' }, { signal: new AbortController().signal })
    assert.equal(value.ok, true)
    const state = await webServer.call({ path: '/state' })
    assert.equal(state.json.lastRun.action, 'plan')
    assert.deepEqual([...state.json.lastRun.added].sort(), ['m-a', 'm-b'])
    assert.equal(state.json.status.running, false)
  } finally {
    net.restore()
  }
})