/**
 * Стор и чистая логика клиентской половины: конфиг, форма, коэффициенты, баланс.
 *
 * Ни браузера, ни React: только `node --test` и поддельный `fetch`/DOM. Всё,
 * что можно проверить без рендера, проверяется здесь — тогда падение
 * `client-render.test.mjs` сразу указывает на React-слой, а не на модель данных.
 *
 * Запуск: node --test test/client-store.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const { createApi, createStore, applyState, applySaved, initialState, readRoute } = await import(
  new URL('../src/client/store.js', import.meta.url).href
)
const {
  DEFAULT_CONFIG,
  FIELD_LIST,
  FEATURE_ITEMS,
  FEATURE_KEYS,
  GROUPS,
  coerceValue,
  createDraft,
  defaultsDraft,
  draftToConfig,
  fieldsOfGroup,
  isDirty,
  isHttpUrl,
  readField,
  readFeatures,
  validateDraft,
  withFeature,
  withField,
} = await import(new URL('../src/client/config-form.js', import.meta.url).href)
const {
  BADGE_ATTR,
  badgeHint,
  clearBadges,
  decorate,
  formatMultiplier,
  indexPayload,
  tierOf,
  watch,
} = await import(new URL('../src/client/coefficients.js', import.meta.url).href)
const {
  POS_KEY,
  clampPos,
  clearPos,
  dotState,
  formatTime,
  formatUnits,
  loadPos,
  savePos,
} = await import(new URL('../src/client/panel-pos.js', import.meta.url).href)

/** Поддельный `fetch`: запоминает вызовы и отдаёт заранее заданные ответы. */
function makeFetch(responses) {
  const calls = []
  const queue = [...responses]
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (next === undefined) throw new Error(`unexpected request: ${url}`)
    if (next instanceof Error) throw next
    return {
      ok: next.status === undefined || next.status < 400,
      status: next.status ?? 200,
      async json() {
        if (next.raw !== undefined) return next.raw
        if (next.json instanceof Error) throw next.json
        return next.json
      },
    }
  }
  return { fetchImpl, calls }
}

/** Валидный конфиг 2.0.0 для подстановки в ответы. */
function configFixture() {
  return {
    features: { catalogSync: true, coefficients: true, balance: true },
    providers: { match: ['cheapvibecode.ru'], entryId: 'llm-pi-ai', apiKeyEnv: 'CVC_DEEPSEEK_API_KEY', baseURL: 'https://ru.cheapvibecode.ru/v1', timeoutMs: 20000 },
    catalog: { provider: 'cheapvibecode', autoSync: true, intervalHours: 24, startupDelayMs: 5000, minModelRatio: 0.8, keepModels: [], installerUrls: ['https://ru.cheapvibecode.ru/idhw'], syncAllowlist: true, allowlistEntryId: 'subagent-model-selection-settings', levelsCacheMinutes: 360 },
    coefficients: { refreshMinutes: 10, showFast: true },
    balance: { refreshSeconds: 0, showDelta: true },
  }
}

// ---------------------------------------------------------------- HTTP-слой

test('createApi собирает запрос и разбирает JSON', async () => {
  const { fetchImpl, calls } = makeFetch([{ json: { ok: true } }])
  const call = createApi(fetchImpl)
  const payload = await call('GET', '/state')
  assert.deepEqual(payload, { ok: true })
  assert.equal(calls[0].url, '/cvc/state')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.headers.accept, 'application/json')
  assert.equal(calls[0].init.body, undefined)
})

test('createApi шлёт тело с JSON content-type', async () => {
  const { fetchImpl, calls } = makeFetch([{ json: { ok: true } }])
  const call = createApi(fetchImpl)
  await call('PUT', '/config', { config: { a: 1 } })
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), { config: { a: 1 } })
})

test('createApi переносит поля ошибки хоста в сообщение', async () => {
  const { fetchImpl } = makeFetch([{ status: 400, json: { error: 'invalid', fields: ['minModelRatio', 'timeoutMs'] } }])
  const call = createApi(fetchImpl)
  await assert.rejects(call('PUT', '/config', {}), (error) => {
    assert.equal(error.status, 400)
    assert.deepEqual(error.fields, ['minModelRatio', 'timeoutMs'])
    assert.match(error.message, /minModelRatio/)
    return true
  })
})

test('createApi падает понятной ошибкой на не-JSON и на неизвестный статус', async () => {
  const { fetchImpl } = makeFetch([{ status: 404, json: new Error('not json') }])
  const call = createApi(fetchImpl)
  await assert.rejects(call('GET', '/state'), /HTTP 404/)
})

test('readRoute возвращает ошибку вместо исключения', async () => {
  const { fetchImpl } = makeFetch([{ status: 404, json: { error: 'disabled' } }])
  const result = await readRoute(fetchImpl, '/balance')
  assert.equal(result.ok, false)
  assert.equal(result.status, 404)
})

test('readRoute ловит падение сети', async () => {
  const { fetchImpl } = makeFetch([new Error('offline')])
  const result = await readRoute(fetchImpl, '/coefficients')
  assert.equal(result.ok, false)
  assert.match(result.error, /offline/)
})

// ------------------------------------------------------------ разбор состояния

test('applyState разбирает полный ответ /cvc/state', () => {
  const config = configFixture()
  const state = applyState({
    version: '2.0.0',
    features: { catalogSync: true, coefficients: false, balance: true },
    config,
    configShape: 'v2',
    status: { action: 'plan', ok: true },
    lastRun: { action: 'apply', ok: true },
    patchPath: 'C:/p/cordis.patch.yml',
    rowId: 'cvc-catalog-sync',
  })
  assert.equal(state.loaded, true)
  assert.equal(state.version, '2.0.0')
  assert.deepEqual(state.features, { catalogSync: true, coefficients: false, balance: true })
  assert.deepEqual(state.config, config)
  assert.equal(state.configShape, 'v2')
  assert.equal(state.patchPath, 'C:/p/cordis.patch.yml')
  assert.equal(state.rowId, 'cvc-catalog-sync')
  assert.equal(state.lastRun.action, 'apply')
})

test('applyState берёт функции из конфига, если отдельного поля нет', () => {
  const config = configFixture()
  config.features = { catalogSync: false, coefficients: true, balance: false }
  const state = applyState({ config, configShape: 'legacy' })
  assert.deepEqual(state.features, { catalogSync: false, coefficients: true, balance: false })
  assert.equal(state.configShape, 'legacy')
})

test('applyState без lastRun показывает status и не ломается на пустом ответе', () => {
  const withStatus = applyState({ status: { action: 'plan', ok: false } })
  assert.equal(withStatus.lastRun.action, 'plan')
  const empty = applyState(null)
  assert.equal(empty.loaded, true)
  assert.equal(empty.config, null)
  assert.equal(empty.version, '')
  assert.deepEqual(empty.features, { catalogSync: true, coefficients: true, balance: true })
})

test('applyState сохраняет прежний lastRun, если ответ его не прислал', () => {
  const previous = { lastRun: { action: 'apply', ok: true } }
  const state = applyState({ status: { action: 'plan', ok: true } }, previous)
  assert.equal(state.lastRun.action, 'plan')
  const withoutStatus = applyState({}, previous)
  assert.equal(withoutStatus.lastRun.action, 'apply')
})

test('applySaved берёт конфиг и функции из ответа PUT', () => {
  const previous = { ...initialState(), config: configFixture() }
  const config = configFixture()
  config.features.balance = false
  const state = applySaved({ ok: true, config, features: { catalogSync: true, coefficients: true, balance: false } }, previous)
  assert.deepEqual(state.features, { catalogSync: true, coefficients: true, balance: false })
  assert.equal(state.config.balance.refreshSeconds, 0)
  assert.equal(state.configShape, 'v2')
})

test('applySaved без конфига оставляет прежний', () => {
  const previous = { ...initialState(), config: configFixture() }
  const state = applySaved({ ok: true }, previous)
  assert.deepEqual(state.config, previous.config)
})

// --------------------------------------------------------------------- стор

test('стор загружает состояние и оповещает подписчиков', async () => {
  const config = configFixture()
  const body = { version: '2.0.0', features: { catalogSync: true, coefficients: true, balance: true }, config, configShape: 'v2', status: { ok: true }, patchPath: 'P', rowId: 'cvc-catalog-sync' }
  const { fetchImpl, calls } = makeFetch([{ json: body }, { json: body }])
  const store = createStore({ fetch: fetchImpl })
  const seen = []
  const off = store.subscribe((state) => seen.push(state.loaded))
  assert.equal(store.getState().loaded, false)
  const state = await store.refresh()
  assert.equal(calls[0].url, '/cvc/state')
  assert.equal(state.loaded, true)
  assert.equal(seen.length, 2, 'loading and loaded both notify')
  assert.deepEqual(seen, [false, true])
  off()
  await store.refresh()
  assert.equal(seen.length, 2, 'unsubscribed listener is not called')})

test('стор схлопывает параллельные refresh в один запрос', async () => {
  const config = configFixture()
  const { fetchImpl, calls } = makeFetch([{ json: { config, features: config.features } }])
  const store = createStore({ fetch: fetchImpl })
  await Promise.all([store.refresh(), store.refresh(), store.refresh()])
  assert.equal(calls.length, 1)
})

test('стор запоминает ошибку загрузки и отдаёт её странице', async () => {
  const { fetchImpl } = makeFetch([{ status: 500, json: { error: 'boom' } }])
  const store = createStore({ fetch: fetchImpl })
  await assert.rejects(store.refresh(), /boom/)
  assert.equal(store.getState().error, 'boom')
  assert.equal(store.getState().loading, false)
})

test('стор сохраняет конфиг телом {config} и обновляет функции', async () => {
  const config = configFixture()
  const saved = configFixture()
  saved.features.coefficients = false
  const { fetchImpl, calls } = makeFetch([{ json: { ok: true, config: saved, features: saved.features } }])
  const changes = []
  const store = createStore({ fetch: fetchImpl, onFeatures: (features) => changes.push(features) })
  await store.save(config)
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].url, '/cvc/config')
  assert.deepEqual(JSON.parse(calls[0].init.body), { config })
  assert.equal(store.getState().features.coefficients, false)
  assert.equal(changes.length, 1, 'feature change is reported once')
})

test('стор не зовёт onFeatures, когда набор функций не изменился', async () => {
  const config = configFixture()
  const answer = { json: { ok: true, config, features: config.features } }
  const { fetchImpl } = makeFetch([{ ...answer }, { ...answer }])
  const changes = []
  const store = createStore({ fetch: fetchImpl, onFeatures: (features) => changes.push(features) })
  await store.save(config)
  await store.save(config)
  assert.equal(changes.length, 0)
})

test('стор запускает прогон и кладёт результат в lastRun', async () => {
  const { fetchImpl, calls } = makeFetch([{ json: { action: 'apply', ok: true, applied: true, added: [] } }])
  const store = createStore({ fetch: fetchImpl })
  const result = await store.run('apply', true)
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].url, '/cvc/run')
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'apply', force: true })
  assert.equal(result.ok, true)
  assert.equal(store.getState().lastRun.action, 'apply')
})

test('стор запрашивает коэффициенты и баланс без исключений', async () => {
  const { fetchImpl, calls } = makeFetch([
    { json: { models: [], providers: [] } },
    { status: 404, json: { error: 'off' } },
  ])
  const store = createStore({ fetch: fetchImpl })
  const coefficients = await store.coefficients()
  const balance = await store.balance()
  assert.equal(coefficients.ok, true)
  assert.equal(balance.ok, false)
  assert.equal(calls[0].url, '/cvc/coefficients')
  assert.equal(calls[1].url, '/cvc/balance')
})

// -------------------------------------------------------------- модель формы

test('умолчания формы совпадают со схемой §2', () => {
  assert.deepEqual(DEFAULT_CONFIG.catalog.installerUrls, ['https://ru.cheapvibecode.ru/idhw', 'https://ru.cheapvibecode.ru/idhl'])
  assert.equal(DEFAULT_CONFIG.catalog.intervalHours, 24)
  assert.equal(DEFAULT_CONFIG.catalog.minModelRatio, 0.8)
  assert.equal(DEFAULT_CONFIG.catalog.levelsCacheMinutes, 360)
  assert.equal(DEFAULT_CONFIG.coefficients.refreshMinutes, 10)
  assert.equal(DEFAULT_CONFIG.balance.refreshSeconds, 0)
  assert.equal(DEFAULT_CONFIG.providers.timeoutMs, 20000)
  assert.equal(DEFAULT_CONFIG.providers.baseURL, 'https://ru.cheapvibecode.ru/v1')
  assert.deepEqual(DEFAULT_CONFIG.features, { catalogSync: true, coefficients: true, balance: true })
  const draft = defaultsDraft()
  assert.equal(draft.values.intervalHours, 24)
  assert.equal(draft.values.provider, 'cheapvibecode')
  assert.deepEqual(draft.values.installerUrls, ['https://ru.cheapvibecode.ru/idhw', 'https://ru.cheapvibecode.ru/idhl'])
})

test('все поля формы разложены по группам и описаны', () => {
  const ids = FIELD_LIST.map((field) => field.id)
  assert.equal(new Set(ids).size, ids.length, 'field ids are unique')
  for (const field of FIELD_LIST) {
    assert.ok(GROUPS.some((group) => group.id === field.group), `${field.id} belongs to a group`)
    assert.ok(field.labelKey.length > 0)
    assert.ok(field.hintKey.length > 0)
    assert.ok(Array.isArray(field.path) && field.path.length >= 1)
    assert.ok(['text', 'number', 'switch', 'list'].includes(field.kind))
  }
  const total = GROUPS.reduce((sum, group) => sum + fieldsOfGroup(group.id).length, 0)
  assert.equal(total, FIELD_LIST.length)
  assert.deepEqual(FEATURE_ITEMS.map((item) => item.key), [...FEATURE_KEYS])
})

test('черновик читает плоский конфиг 1.x', () => {
  const legacy = {
    provider: 'cheapvibecode',
    baseURL: 'https://ru.cheapvibecode.ru/v1',
    apiKeyEnv: 'CVC_DEEPSEEK_API_KEY',
    entryId: 'llm-pi-ai',
    autoSync: false,
    intervalHours: 6,
    startupDelayMs: 1500,
    minModelRatio: 0.5,
    keepModels: ['x'],
    installerUrls: ['https://ru.cheapvibecode.ru/idhw'],
    syncAllowlist: false,
    allowlistEntryId: 'subagent-model-selection-settings',
    levelsCacheMinutes: 60,
    timeoutMs: 15000,
  }
  const draft = createDraft(legacy)
  assert.equal(draft.values.autoSync, false)
  assert.equal(draft.values.intervalHours, 6)
  assert.equal(draft.values.startupDelayMs, 1500)
  assert.equal(draft.values.minModelRatio, 0.5)
  assert.deepEqual(draft.values.keepModels, ['x'])
  assert.equal(draft.values.syncAllowlist, false)
  assert.equal(draft.values.levelsCacheMinutes, 60)
  assert.equal(draft.values.timeoutMs, 15000)
  assert.equal(draft.values.baseURL, 'https://ru.cheapvibecode.ru/v1')
  // Новой группы в 1.x нет: действует умолчание схемы.
  assert.equal(draft.values.refreshMinutes, 10)
  assert.equal(draft.values.refreshSeconds, 0)
})

test('черновик предпочитает новый вид плоским ключам', () => {
  const config = configFixture()
  config.intervalHours = 12
  config.catalog = { ...config.catalog, intervalHours: 3 }
  assert.equal(createDraft(config).values.intervalHours, 3)
})

test('draftToConfig собирает группы, убирает устаревшие ключи и хранит чужие', () => {
  const base = {
    ...configFixture(),
    autoSync: true,
    intervalHours: 24,
    someHostOnlyKey: 'keep-me',
  }
  const draft = withField(createDraft(base), 'intervalHours', 7)
  const next = draftToConfig(draft, base)
  assert.equal(next.catalog.intervalHours, 7)
  assert.equal(next.autoSync, undefined, 'legacy key is removed')
  assert.equal(next.intervalHours, undefined)
  assert.equal(next.someHostOnlyKey, 'keep-me')
  assert.deepEqual(next.features, base.features)
  assert.deepEqual(next.providers, base.providers)
})

test('draftToConfig пишет null вместо пустого числа', () => {
  const base = configFixture()
  const draft = withField(createDraft(base), 'intervalHours', Number.NaN)
  const next = draftToConfig(draft, base)
  assert.equal(next.catalog.intervalHours, null)
})

test('черновик сравнивается с конфигом по нормализованным значениям', () => {
  const config = configFixture()
  const draft = createDraft(config)
  assert.equal(isDirty(draft, config), false)
  assert.equal(isDirty(withField(draft, 'intervalHours', 5), config), true)
  assert.equal(isDirty(withFeature(draft, 'balance', false), config), true)
  assert.equal(isDirty(withField(draft, 'keepModels', ['a']), config), true)
})

test('readField берёт умолчание, когда ключа нет ни в группе, ни в 1.x', () => {
  const field = FIELD_LIST.find((item) => item.id === 'timeoutMs')
  assert.equal(readField({}, field), 20000)
  assert.equal(readField(null, field), 20000)
})

test('coerceValue приводит списки и числа', () => {
  const list = FIELD_LIST.find((item) => item.id === 'keepModels')
  assert.deepEqual(coerceValue(list, ' a\n b , c '), ['a', 'b', 'c'])
  assert.deepEqual(coerceValue(list, ['x', '  ', 'y']), ['x', 'y'])
  assert.deepEqual(coerceValue(list, null), [])
  const number = FIELD_LIST.find((item) => item.id === 'intervalHours')
  assert.equal(coerceValue(number, '12'), 12)
  assert.ok(Number.isNaN(coerceValue(number, '')))
  const flag = FIELD_LIST.find((item) => item.id === 'autoSync')
  assert.equal(coerceValue(flag, 'true'), false, 'only a real boolean is on')
})

test('readFeatures отдаёт умолчания без источников', () => {
  assert.deepEqual(readFeatures(null, null), { catalogSync: true, coefficients: true, balance: true })
  assert.deepEqual(readFeatures({ coefficients: false }, { features: { catalogSync: false } }), {
    catalogSync: false,
    coefficients: false,
    balance: true,
  })
})

test('валидация пропускает полный набор умолчаний', () => {
  assert.deepEqual(validateDraft(defaultsDraft()), [])
})

test('валидация ловит долю, адрес, секунды и пустое число', () => {
  const base = defaultsDraft()
  const ratio = validateDraft(withField(base, 'minModelRatio', 5))
  assert.deepEqual(ratio, [{ field: 'minModelRatio', code: 'errRatio' }])
  const url = validateDraft(withField(base, 'baseURL', 'not a url'))
  assert.deepEqual(url, [{ field: 'baseURL', code: 'errUrl' }])
  const urls = validateDraft(withField(base, 'installerUrls', ['ftp://x']))
  assert.deepEqual(urls, [{ field: 'installerUrls', code: 'errUrl' }])
  const seconds = validateDraft(withField(base, 'refreshSeconds', 5))
  assert.deepEqual(seconds, [{ field: 'refreshSeconds', code: 'errSeconds' }])
  const minutes = validateDraft(withField(base, 'refreshMinutes', 0))
  assert.deepEqual(minutes, [{ field: 'refreshMinutes', code: 'errMinutes' }])
  const empty = validateDraft(withField(base, 'intervalHours', Number.NaN))
  assert.deepEqual(empty, [{ field: 'intervalHours', code: 'errNumber' }])
  const noProvider = validateDraft(withField(base, 'provider', '  '))
  assert.deepEqual(noProvider, [{ field: 'provider', code: 'errEmpty' }])
})

test('isHttpUrl принимает только http(s)', () => {
  assert.equal(isHttpUrl('https://ru.cheapvibecode.ru/idhw'), true)
  assert.equal(isHttpUrl('http://localhost:1234/x'), true)
  assert.equal(isHttpUrl('ftp://x'), false)
  assert.equal(isHttpUrl(''), false)
  assert.equal(isHttpUrl('nope'), false)
})

// --------------------------------------------------------------- коэффициенты

test('indexPayload отбрасывает записи без id и множителя', () => {
  const index = indexPayload({
    models: [
      { id: 'a', multiplier: 1, fastMultiplier: 2, contextWindow: 128000 },
      { id: '', multiplier: 1 },
      { id: 'b' },
      { id: 'c', multiplier: 'x' },
      null,
    ],
    providers: ['cheapvibecode', '', 5],
  })
  assert.equal(index.models.size, 1)
  assert.equal(index.models.get('a').fastMultiplier, 2)
  assert.deepEqual(index.providers, ['cheapvibecode'])
})

test('indexPayload терпит пустой ответ', () => {
  const index = indexPayload(null)
  assert.equal(index.models.size, 0)
  assert.deepEqual(index.providers, [])
})

test('formatMultiplier печатает ×N и не врёт на дробях', () => {
  assert.equal(formatMultiplier(1), '×1')
  assert.equal(formatMultiplier(0.1), '×0.1')
  assert.equal(formatMultiplier(2.5), '×2.5')
  assert.equal(formatMultiplier(10.0), '×10')
  assert.equal(formatMultiplier(Number.NaN), '')
})

test('tierOf раскладывает цены по порогам', () => {
  assert.equal(tierOf(0.1), 'cheap')
  assert.equal(tierOf(0.5), 'cheap')
  assert.equal(tierOf(1), 'mid')
  assert.equal(tierOf(2), 'pricey')
  assert.equal(tierOf(5), 'expensive')
})

test('badgeHint добавляет быстрый режим только когда разрешено', () => {
  const entry = { multiplier: 1, fastMultiplier: 2 }
  assert.equal(badgeHint(entry, true), '×1 · fast ×2')
  assert.equal(badgeHint(entry, false), '×1')
  assert.equal(badgeHint({ multiplier: 1, fastMultiplier: null }, true), '×1')
})

/** Минимальный узел DOM: только то, что используют бейджи. */
function makeNode(doc, tag = 'div') {
  return {
    ownerDocument: doc,
    tagName: tag.toUpperCase(),
    children: [],
    attrs: new Map(),
    dataset: {},
    className: '',
    title: '',
    textContent: '',
    removed: false,
    setAttribute(name, value) { this.attrs.set(name, String(value)) },
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child },
    remove() {
      this.removed = true
      if (this.parentNode) {
        const index = this.parentNode.children.indexOf(this)
        if (index >= 0) this.parentNode.children.splice(index, 1)
      }
    },
    querySelectorAll(selector) {
      const out = []
      const match = (node) => node.attrs?.has(selector.slice(1, -1)) === true
      const walk = (node) => {
        for (const child of node.children) {
          if (match(child)) out.push(child)
          walk(child)
        }
      }
      walk(this)
      return out
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null },
    closest(selector) {
      const name = selector.slice(1, -1)
      let current = this
      while (current) {
        if (current.attrs?.has(name)) return current
        current = current.parentNode
      }
      return null
    },
  }
}

/** Дерево строк моделей выбора модели. */
function makeModelTree(doc, rows) {
  const root = makeNode(doc)
  for (const row of rows) {
    const node = makeNode(doc, 'span')
    node.setAttribute('data-model-id', row.model)
    if (row.provider !== undefined) node.setAttribute('data-provider-id', row.provider)
    root.appendChild(node)
  }
  return root
}

/** Документ из одного узла: хватает для наблюдателя и поиска бейджей. */
function makeDocument() {
  const doc = {
    body: null,
    head: null,
    documentElement: null,
    createElement(tag) { return makeNode(doc, tag) },
  }
  doc.body = makeNode(doc)
  doc.head = makeNode(doc)
  doc.documentElement = doc.body
  doc.querySelectorAll = (selector) => doc.body.querySelectorAll(selector)
  doc.querySelector = (selector) => doc.body.querySelector(selector)
  return doc
}

test('decorate ставит бейдж только провайдеру каталога', () => {
  const doc = { createElement: (tag) => makeNode(doc, tag) }
  const index = indexPayload({ models: [{ id: 'glm-5.3', multiplier: 0.5 }], providers: ['cheapvibecode'] })
  const root = makeModelTree(doc, [
    { model: 'glm-5.3', provider: 'cheapvibecode' },
    { model: 'glm-5.3', provider: 'other' },
    { model: 'glm-5.3' },
  ])
  const placed = decorate(root, index, { showFast: true })
  assert.equal(placed, 1)
  const badge = root.children[0].querySelector(`[${BADGE_ATTR}]`)
  assert.ok(badge !== null)
  assert.equal(badge.textContent, '×0.5')
  assert.equal(badge.dataset.tier, 'cheap')
  assert.equal(root.children[1].querySelector(`[${BADGE_ATTR}]`), null)
  assert.equal(root.children[2].querySelector(`[${BADGE_ATTR}]`), null)
})

test('decorate идемпотентна и снимает устаревший бейдж', () => {
  const doc = { createElement: (tag) => makeNode(doc, tag) }
  const root = makeModelTree(doc, [{ model: 'a', provider: 'p' }])
  const index = indexPayload({ models: [{ id: 'a', multiplier: 2 }], providers: ['p'] })
  decorate(root, index)
  decorate(root, index)
  assert.equal(root.children[0].children.length, 1, 'second pass does not duplicate')
  const empty = indexPayload({ models: [], providers: ['p'] })
  decorate(root, empty)
  assert.equal(root.children[0].children.length, 0, 'stale badge is removed')
})

test('clearBadges снимает все бейджи', () => {
  const doc = { createElement: (tag) => makeNode(doc, tag) }
  const root = makeModelTree(doc, [{ model: 'a', provider: 'p' }])
  decorate(root, indexPayload({ models: [{ id: 'a', multiplier: 1 }], providers: ['p'] }))
  clearBadges(root)
  assert.equal(root.querySelectorAll(`[${BADGE_ATTR}]`).length, 0)
})

test('watch ставит бейджи при монтировании и снимает при остановке', () => {
  const doc = makeDocument()
  const names = makeModelTree(doc, [{ model: 'a', provider: 'p' }])
  doc.body.appendChild(names)
  const index = indexPayload({ models: [{ id: 'a', multiplier: 1 }], providers: ['p'] })
  const stop = watch(doc, () => ({ index, showFast: true }))
  assert.equal(names.children[0].children.length, 1, 'badge placed without requestAnimationFrame')
  stop()
  assert.equal(doc.querySelectorAll(`[${BADGE_ATTR}]`).length, 0)
})

// --------------------------------------------------------------------- баланс

test('позиция панели читается и пишется через localStorage', () => {
  const storage = new Map()
  const api = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }
  assert.equal(loadPos(api), null)
  assert.equal(savePos(api, { left: 10, top: 20 }), true)
  assert.equal(storage.get(POS_KEY), '{"left":10,"top":20}')
  assert.deepEqual(loadPos(api), { left: 10, top: 20 })
  clearPos(api)
  assert.equal(loadPos(api), null)
})

test('позиция панели переживает испорченное хранилище', () => {
  const broken = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
    removeItem() { throw new Error('denied') },
  }
  assert.equal(loadPos(broken), null)
  assert.equal(savePos(broken, { left: 1, top: 2 }), false)
  assert.doesNotThrow(() => clearPos(broken))
  assert.equal(loadPos(null), null)
  const corrupted = { getItem: () => '{not json' }
  assert.equal(loadPos(corrupted), null)
  const wrong = { getItem: () => '{"left":"x","top":1}' }
  assert.equal(loadPos(wrong), null)
})

test('clampPos держит панель в окне', () => {
  const size = { width: 300, height: 200 }
  const viewport = { width: 1000, height: 800 }
  assert.deepEqual(clampPos({ left: 0, top: 0 }, size, viewport), { left: 8, top: 8 })
  assert.deepEqual(clampPos({ left: 5000, top: 5000 }, size, viewport), { left: 692, top: 592 })
  assert.deepEqual(clampPos({ left: 100, top: 120 }, size, viewport), { left: 100, top: 120 })
  // Окно меньше панели: позиция не уезжает в минус.
  assert.deepEqual(clampPos({ left: 50, top: 50 }, size, { width: 100, height: 100 }), { left: 8, top: 8 })
})

test('dotState различает полное, частичное и пустое чтение', () => {
  assert.equal(dotState({ busy: true, providers: [], error: '' }), 'warn')
  assert.equal(dotState({ busy: false, providers: [], error: '' }), '')
  assert.equal(dotState({ busy: false, providers: [], error: 'HTTP 404' }), 'err')
  assert.equal(dotState({ busy: false, error: '', providers: [{ balanceUnits: 1 }, { balanceUnits: 2 }] }), 'ok')
  assert.equal(dotState({ busy: false, error: '', providers: [{ balanceUnits: 1 }, { balanceUnits: null }] }), 'warn')
  assert.equal(dotState({ busy: false, error: '', providers: [{ balanceUnits: null }] }), 'err')
  assert.equal(dotState({ busy: false, error: '', providers: null }), '')
})

test('formatUnits и formatTime не падают на мусоре', () => {
  assert.equal(formatUnits(1234.5).replace(/\u00a0/g, ' '), '1 234,5')
  assert.equal(formatUnits(null), '—')
  assert.equal(formatUnits('12'), '—')
  assert.equal(formatTime(''), '')
  assert.equal(formatTime('nonsense'), '')
  assert.match(formatTime('2026-11-20T21:05:06.000Z'), /^\d{2}:\d{2}:\d{2}$/)
})

test('loadPos не спотыкается о нечисловые координаты и пустой ключ', () => {
  const empty = { getItem: () => '' }
  assert.equal(loadPos(empty), null)
  const partial = { getItem: () => '{"left":5}' }
  assert.equal(loadPos(partial), null)
})
