/**
 * Проверка HTTP-маршрута настроек без DSH: поддельные webServer, запрос,
 * ответ и configEditor.
 *
 * Запуск: node --test test/settings-api.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

const { installSettingsApi, validateConfigInput, normalizeConfig } = await import(new URL('../index.js', import.meta.url).href)

const SELF = 'cvc-catalog-sync'
const BASE = 'http://localhost'

/** Поддельная строка профиля и соседняя строка с маршрутами. */
function makeCtx(overrides = {}) {
  const row = { options: { id: SELF, config: { provider: 'cheapvibecode', autoSync: true } }, fiber: {} }
  const llm = { options: { id: 'llm-pi-ai', config: { providers: { cheapvibecode: {}, funpay: {} } } }, fiber: {} }
  const editor = {
    entries: () => [row, llm],
    configuration: () => [{ entry: row, inherited: { provider: 'cheapvibecode', autoSync: true }, override: { ...row.options.config } }],
    documentPath: 'C:/tmp/cordis.patch.yml',
    async edit(entry, change) {
      entry.options.config = change(entry.options.config, {})
    },
  }
  return { row, llm, editor, ctx: { configEditor: editor, ...overrides } }
}

/** Запрос с телом, отданным на следующем тике. */
function makeReq({ method = 'GET', path = '/state', headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = `/cvc-catalog-sync${path}`
  req.headers = headers
  req.destroy = () => {}
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

/** Ответ, запоминающий статус, заголовки и тело. */
function makeRes() {
  const captured = { status: 0, headers: {}, body: '' }
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(body) {
      captured.body = body ?? ''
    },
  }
}

/** Установить маршрут на поддельном webServer. */
function mount(deps) {
  const routes = []
  installSettingsApi({ register(route) { routes.push(route); return () => {} } }, deps)
  assert.equal(routes.length, 1)
  return routes[0]
}

async function call(route, options) {
  const req = makeReq(options)
  const res = makeRes()
  await route.handler(req, res)
  let json = null
  try {
    json = JSON.parse(res.captured.body)
  } catch {
    json = null
  }
  return { status: res.captured.status, headers: res.captured.headers, json }
}

const deps = (ctx, extra = {}) => ({
  ctx,
  selfRowId: SELF,
  refresh: async () => ({ ok: true, catalogModels: 49, currentModels: 49, nextModels: 49, levelsSource: 'idhw', added: [], removed: [], changed: [], warnings: [], allowlist: {}, at: 'now' }),
  toValue: (result, action) => ({ action, ...result }),
  status: () => ({ action: 'status', ok: true, catalogModels: 0, currentModels: 0, nextModels: 0, levelsSource: 'none', added: [], removed: [], changed: [], warnings: [], allowlist: { pruned: [], added: [], skipped: true, changed: false }, error: '', at: '' }),
  ...extra,
})

test('GET /state отдаёт действующий конфиг, маршруты и путь патча', async () => {
  const { ctx } = makeCtx()
  const route = mount(deps(ctx))
  const answer = await call(route, { path: '/state' })
  assert.equal(answer.status, 200)
  assert.equal(answer.json.config.provider, 'cheapvibecode')
  assert.equal(answer.json.config.autoSync, true)
  assert.deepEqual(answer.json.providers, ['cheapvibecode', 'funpay'])
  assert.equal(answer.json.patchPath, 'C:/tmp/cordis.patch.yml')
  assert.equal(answer.json.rowId, SELF)
  assert.equal(answer.json.active, true)
  assert.equal(answer.json.status.action, 'status')
})

test('PUT /config валидирует и записывает настройки', async () => {
  const { ctx, row } = makeCtx()
  const route = mount(deps(ctx))
  const config = { ...normalizeConfig({}), intervalHours: 6, minModelRatio: 0.9, keepModels: ['x'] }
  const answer = await call(route, {
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { config },
  })
  assert.equal(answer.status, 200, JSON.stringify(answer.json))
  assert.equal(answer.json.ok, true)
  assert.equal(row.options.config.intervalHours, 6)
  assert.equal(row.options.config.minModelRatio, 0.9)
  assert.deepEqual(row.options.config.keepModels, ['x'])
})

test('PUT /config отклоняет неверные значения с понятными полями', async () => {
  const { ctx, row } = makeCtx()
  const route = mount(deps(ctx))
  const before = JSON.stringify(row.options.config)
  const config = { ...normalizeConfig({}), minModelRatio: 5, timeoutMs: 0, baseURL: 'not a url', installerUrls: [] }
  const answer = await call(route, {
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'application/json' },
    body: { config },
  })
  assert.equal(answer.status, 400)
  const fields = answer.json.fields.join(' ')
  assert.match(fields, /minModelRatio/)
  assert.match(fields, /timeoutMs/)
  assert.match(fields, /baseURL/)
  assert.match(fields, /installerUrls/)
  assert.equal(JSON.stringify(row.options.config), before, 'invalid config must not be written')
})

test('PUT /config требует JSON content-type', async () => {
  const { ctx } = makeCtx()
  const route = mount(deps(ctx))
  const answer = await call(route, {
    method: 'PUT',
    path: '/config',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  })
  assert.equal(answer.status, 415)
})

test('POST /run plan и apply вызывают прогон с нужным режимом', async () => {
  const { ctx } = makeCtx()
  const calls = []
  const route = mount(deps(ctx, {
    refresh: async (reason, options) => {
      calls.push({ reason, options })
      return { ok: true, catalogModels: 49, currentModels: 49, nextModels: 49, levelsSource: 'idhw', added: [], removed: [], changed: [], warnings: [], allowlist: {}, at: 'now', applied: options.apply === true }
    },
  }))

  const plan = await call(route, { method: 'POST', path: '/run', headers: { 'content-type': 'application/json' }, body: { action: 'plan' } })
  assert.equal(plan.status, 200)
  assert.equal(plan.json.action, 'plan')
  assert.equal(calls[0].options.apply, false)

  const apply = await call(route, { method: 'POST', path: '/run', headers: { 'content-type': 'application/json' }, body: { action: 'apply', force: true } })
  assert.equal(apply.status, 200)
  assert.equal(apply.json.action, 'apply')
  assert.equal(apply.json.applied, true)
  assert.deepEqual(calls[1].options, { apply: true, force: true })
})

test('межсайтовый запрос отклоняется', async () => {
  const { ctx } = makeCtx()
  const route = mount(deps(ctx))
  const answer = await call(route, { path: '/state', headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(answer.status, 403)
})

test('неизвестный маршрут отвечает 404', async () => {
  const { ctx } = makeCtx()
  const route = mount(deps(ctx))
  const answer = await call(route, { path: '/unknown' })
  assert.equal(answer.status, 404)
})

test('validateConfigInput принимает полный набор умолчаний', () => {
  assert.deepEqual(validateConfigInput(normalizeConfig({})), [])
  const errors = validateConfigInput({ ...normalizeConfig({}), autoSync: 'yes' })
  assert.match(errors.join(' '), /autoSync/)
})
