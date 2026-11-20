/**
 * Рендер клиентской половины на поддельном React и DOM + переключение гейтинга.
 *
 * Здесь проверяется то, что не проверить без React-слоя:
 *
 * - в бандле `client.js` (из `window.__ModuleLoader__.load`) есть все
 *   регистрации слотов и ни одной чужой;
 * - страница рендерится, три переключателя читают и меняют черновик,
 *   «Сохранить» отправляет `PUT /cvc/config` телом `{config}`;
 * - выключение функции снимает регистрацию, включение возвращает — без
 *   перезагрузки страницы;
 * - наблюдатель бейджей ставит и снимает бейджи, кнопка баланса показывает
 *   панель и ошибку маршрута.
 *
 * Фейковый React исполняет компоненты по-настоящему: хуки, эффекты, ре-рендер
 * по изменению состояния. React и DOM подменяются до импорта `client.js`:
 * бандл берёт их из `require` загрузчика браузера.
 *
 * Запуск: node --test test/client-render.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

// -------------------------------------------------------------------- DOM

/** Похож ли узел на простой селектор `[attr]`, `.class` или `tag`. */
function nodeMatches(node, selector) {
  if (node === null || typeof node !== 'object') return false
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const name = selector.slice(1, -1).split('=')[0]
    return node.attrs.has(name)
  }
  if (selector.startsWith('.')) return String(node.className).split(/\s+/).includes(selector.slice(1))
  return node.tagName === selector.toUpperCase()
}

class FakeNode {
  constructor(doc, tagName) {
    this.ownerDocument = doc
    this.tagName = String(tagName).toUpperCase()
    this.children = []
    this.parentNode = null
    this.attrs = new Map()
    this.dataset = {}
    this.listeners = new Map()
    this.className = ''
    this.title = ''
    this._text = ''
    this.style = {}
    this.disabled = false
  }

  setAttribute(name, value) { this.attrs.set(name, String(value)) }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null }
  removeAttribute(name) { this.attrs.delete(name) }

  get textContent() {
    return this.children.reduce((sum, child) => sum + child.textContent, this._text ?? '')
  }

  set textContent(value) { this._text = value === null || value === undefined ? '' : String(value) }

  appendChild(child) {
    if (child.parentNode !== null) child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }

  remove() {
    if (this.parentNode === null) return
    const index = this.parentNode.children.indexOf(this)
    if (index >= 0) this.parentNode.children.splice(index, 1)
    this.parentNode = null
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(handler)
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) ?? []
    const index = list.indexOf(handler)
    if (index >= 0) list.splice(index, 1)
  }

  dispatch(type, event = {}) {
    const payload = { type, target: this, currentTarget: this, ...event }
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(payload)
    return payload
  }

  querySelectorAll(selector) {
    const parts = selector.split(',').map((part) => part.trim()).filter(Boolean)
    const out = []
    const walk = (node) => {
      for (const child of node.children) {
        if (parts.some((part) => nodeMatches(child, part))) out.push(child)
        walk(child)
      }
    }
    walk(this)
    return out
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }

  closest(selector) {
    const parts = selector.split(',').map((part) => part.trim())
    let current = this
    while (current !== null && current !== undefined) {
      if (parts.some((part) => nodeMatches(current, part))) return current
      current = current.parentNode
    }
    return null
  }
}

/** Документ с `<head>`, `<body>` и поиском по ним. */
function makeDocument() {
  const doc = {
    head: null,
    body: null,
    documentElement: null,
    createElement(tag) { return new FakeNode(doc, tag) },
    querySelectorAll(selector) { return doc.body.querySelectorAll(selector) },
    querySelector(selector) { return doc.body.querySelector(selector) },
  }
  doc.head = new FakeNode(doc, 'head')
  doc.body = new FakeNode(doc, 'body')
  doc.documentElement = new FakeNode(doc, 'html')
  return doc
}

/** Окно: кадры, интервалы и `localStorage` под контролем теста. */
function makeWindow() {
  const timers = new Map()
  const storage = new Map()
  let nextId = 1
  return {
    timers,
    storage,
    innerWidth: 1200,
    innerHeight: 800,
    requestAnimationFrame(callback) {
      const id = nextId++
      timers.set(id, { callback, kind: 'frame' })
      return id
    },
    cancelAnimationFrame(id) { timers.delete(id) },
    setInterval(callback, ms) {
      const id = nextId++
      timers.set(id, { callback, ms, kind: 'interval' })
      return id
    },
    clearInterval(id) { timers.delete(id) },
    addEventListener() {},
    removeEventListener() {},
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  }
}

/** Прогнать отложенные кадры наблюдателя. */
function flushFrames(view) {
  for (const [id, entry] of [...view.timers]) {
    if (entry.kind !== 'frame') continue
    view.timers.delete(id)
    entry.callback(0)
  }
}

/** Подождать, пока разрешатся обещания сети и микрозадачи. */
async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve()
  await new Promise((resolve) => setImmediate(resolve))
}

// ------------------------------------------------------------- фейковый React
//
// Рендерер держит по массиву ячеек хуков на каждый экземпляр компонента
// (экземпляр опознаётся путём в дереве), поэтому `useState` и `useEffect`
// работают как в React, а не как «взять первое значение из очереди».

function makeReactHarness() {
  const Fragment = Symbol('Fragment')
  let active = null

  const createElement = (type, props, ...children) => ({
    type,
    key: props?.key ?? null,
    props: {
      ...(props ?? {}),
      children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
    },
  })

  const React = {
    Fragment,
    createElement,
    useState: (initial) => active.useState(initial),
    useEffect: (callback, deps) => active.useEffect(callback, deps),
    useLayoutEffect: (callback, deps) => active.useEffect(callback, deps),
    useCallback: (...args) => active.useCallback(...args),
    useMemo: (...args) => active.useMemo(...args),
    useRef: (initial) => active.useRef(initial),
  }

  const instances = new Map()
  let pendingEffects = []
  let tree = null
  let rootComponent = null
  let rootProps = null
  let rendering = false
  let dirty = false

  function instanceFor(path) {
    let instance = instances.get(path)
    if (instance === undefined) {
      instance = { hooks: [] }
      instances.set(path, instance)
    }
    instance.cursor = 0
    return instance
  }

  function hooksFor(instance) {
    const ensure = (index, create) => {
      if (instance.hooks[index] === undefined) instance.hooks[index] = create()
      return instance.hooks[index]
    }
    return {
      useState(initial) {
        const index = instance.cursor++
        const cell = ensure(index, () => ({ value: typeof initial === 'function' ? initial() : initial }))
        const setState = (next) => {
          const value = typeof next === 'function' ? next(cell.value) : next
          if (Object.is(value, cell.value)) return
          cell.value = value
          // Во время рендера нет: React копит обновления и перерисовывает после.
          if (rendering) {
            dirty = true
            return
          }
          performRender()
        }
        return [cell.value, setState]
      },
      useEffect(callback, deps) {
        const index = instance.cursor++
        const cell = ensure(index, () => ({ deps: undefined, cleanup: null }))
        const same = cell.deps !== undefined && deps !== undefined
          && cell.deps.length === deps.length
          && cell.deps.every((value, position) => Object.is(value, deps[position]))
        if (same) return
        pendingEffects.push({ cell, callback, deps })
      },
      useCallback(callback, deps) {
        const index = instance.cursor++
        const cell = ensure(index, () => ({ deps: undefined, value: callback }))
        const same = cell.deps !== undefined && deps !== undefined
          && cell.deps.length === deps.length
          && cell.deps.every((value, position) => Object.is(value, deps[position]))
        if (!same) {
          cell.value = callback
          cell.deps = deps
        }
        return cell.value
      },
      useMemo(factory, deps) {
        const index = instance.cursor++
        const cell = ensure(index, () => ({ deps: undefined, value: undefined }))
        const same = cell.deps !== undefined && deps !== undefined
          && cell.deps.length === deps.length
          && cell.deps.every((value, position) => Object.is(value, deps[position]))
        if (!same) {
          cell.value = factory()
          cell.deps = deps
        }
        return cell.value
      },
      useRef(initial) {
        const index = instance.cursor++
        return ensure(index, () => ({ ref: { current: initial } })).ref
      },
    }
  }

  function renderNode(node, path) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) {
      return node.map((child, index) => renderNode(child, `${path}.${index}`)).filter((child) => child !== null)
    }
    if (typeof node !== 'object') return String(node)

    const { type, props } = node
    if (type === Fragment) return renderNode(props.children, path)

    const children = props.children

    if (typeof type === 'string') {
      return {
        tag: type,
        key: node.key,
        props: { ...props, children: renderNode(children, `${path}>${type}`) },
      }
    }

    if (typeof type === 'function') {
      const name = type.name || 'anonymous'
      // Пропустка «N» в пути — это ключ React: одинаковый компонент в разных
      // местах списка должен получить свою ячейку хуков.
      const instancePath = `${path}/${name}#${children === undefined ? '' : keyOf(children)}`
      const previous = active
      active = hooksFor(instanceFor(instancePath))
      let output
      try {
        output = type(props)
      } finally {
        active = previous
      }
      return renderNode(output, instancePath)
    }

    return null
  }

  /** Ключ места в списке: React берёт `key`, иначе индекс. */
  function keyOf(children) {
    if (Array.isArray(children)) return children.length
    if (children !== null && typeof children === 'object' && children.key) return children.key
    return ''
  }

  function performRender() {
    if (rendering) return tree
    rendering = true
    try {
      for (let pass = 0; pass < 40; pass += 1) {
        dirty = false
        pendingEffects = []
        tree = rootComponent === null
          ? null
          : renderNode(createElement(rootComponent, rootProps), 'root')
        const effects = pendingEffects
        pendingEffects = []
        for (const effect of effects) {
          if (typeof effect.cell.cleanup === 'function') effect.cell.cleanup()
          effect.cell.cleanup = effect.callback() ?? null
          effect.cell.deps = effect.deps
        }
        if (!dirty) break
      }
    } finally {
      rendering = false
    }
    return tree
  }

  return {
    React,
    mount(component, props) {
      instances.clear()
      rootComponent = component
      rootProps = props
      return performRender()
    },
    rerender() {
      return performRender()
    },
    tree() {
      return tree
    },
    unmount() {
      for (const instance of instances.values()) {
        for (const cell of instance.hooks) {
          if (cell !== undefined && typeof cell.cleanup === 'function') cell.cleanup()
          if (cell !== undefined) cell.cleanup = null
        }
      }
      instances.clear()
      rootComponent = null
      tree = null
    },
  }
}

/** Весь текст дерева. */
function textOf(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { node.forEach((child) => textOf(child, out)); return out }
  if (node.props?.children !== undefined) textOf(node.props.children, out)
  return out
}

/** Все узлы дерева, подходящие под предикат. */
function findAll(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node === 'string') return out
  if (Array.isArray(node)) { node.forEach((child) => findAll(child, predicate, out)); return out }
  if (predicate(node)) out.push(node)
  findAll(node.props?.children, predicate, out)
  return out
}

/** Первый узел с заданным значением пропа. */
function findByProp(tree, name, value) {
  return findAll(tree, (node) => node.props?.[name] === value)[0] ?? null
}

/** Контрол поля формы: узел внутри обёртки `data-field`. */
function fieldControl(tree, fieldId) {
  const wrapper = findByProp(tree, 'data-field', fieldId)
  assert.ok(wrapper !== null, `field ${fieldId} is rendered`)
  const child = Array.isArray(wrapper.props.children) ? wrapper.props.children[0] : wrapper.props.children
  assert.ok(child !== null && typeof child === 'object', `field ${fieldId} has a control`)
  return child
}

/**
 * Ответы `fetch` для одного теста.
 *
 * Маршрут выбирается по `path`, а не по порядку вызовов: клиент при старте
 * параллельно читает `/cvc/state` и `/cvc/coefficients`, и очередь ответов
 * зависела бы от гонки. Ответ без `path` забирает первый неиспользованный.
 * `?from`/`?to` в пути считаются одним маршрутом.
 */
function makeFetch(routes) {
  const calls = []
  const used = new Set()
  const matches = (route, url) => {
    const path = url.split('?')[0]
    return typeof route.path === 'string' && path.endsWith(route.path)
  }
  const pick = (url) => {
    for (let index = 0; index < routes.length; index += 1) {
      if (!used.has(index) && matches(routes[index], url)) {
        used.add(index)
        return routes[index]
      }
    }
    // Ответ с `reuse: true` обслуживает маршрут сколько угодно раз: так
    // проверяется повторное сохранение без перечисления ответов наперёд.
    for (const route of routes) {
      if (route.reuse === true && matches(route, url)) return route
    }
    for (let index = 0; index < routes.length; index += 1) {
      if (!used.has(index) && routes[index].path === undefined) {
        used.add(index)
        return routes[index]
      }
    }
    return { json: {} }
  }
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body })
    const next = pick(url)
    if (next instanceof Error) throw next
    const body = typeof next.factory === 'function' ? next.factory(init) : next.json
    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      async json() {
        if (body instanceof Error) throw body
        return body
      },
    }
  }
  fetchImpl.calls = calls
  return fetchImpl
}

/** Конфиг 2.0.0 для ответов. */
function configFixture(overrides = {}) {
  return {
    features: { catalogSync: true, coefficients: true, balance: true, ...(overrides.features ?? {}) },
    providers: { match: ['cheapvibecode.ru'], entryId: 'llm-pi-ai', apiKeyEnv: 'CVC_DEEPSEEK_API_KEY', baseURL: 'https://ru.cheapvibecode.ru/v1', timeoutMs: 20000, ...(overrides.providers ?? {}) },
    catalog: { provider: 'cheapvibecode', autoSync: true, intervalHours: 24, startupDelayMs: 5000, minModelRatio: 0.8, keepModels: [], installerUrls: ['https://ru.cheapvibecode.ru/idhw'], syncAllowlist: true, allowlistEntryId: 'subagent-model-selection-settings', levelsCacheMinutes: 360, ...(overrides.catalog ?? {}) },
    coefficients: { refreshMinutes: 10, showFast: true, ...(overrides.coefficients ?? {}) },
    balance: { refreshSeconds: 0, showDelta: true, ...(overrides.balance ?? {}) },
  }
}

/** Ответ `GET /cvc/state`. */
function stateResponse(overrides = {}) {
  return {
    path: '/cvc/state',
    json: {
      version: '2.0.0',
      features: { catalogSync: true, coefficients: true, balance: true, ...(overrides.features ?? {}) },
      config: configFixture(overrides),
      configShape: overrides.configShape ?? 'v2',
      status: overrides.status ?? { action: 'plan', ok: true, at: '2026-11-20T21:00:00.000Z' },
      lastRun: overrides.lastRun ?? null,
      patchPath: 'C:/Users/x/.dsh/profiles/desktop/cordis.patch.yml',
      rowId: 'cvc-catalog-sync',
    },
  }
}

/** Ответ `PUT /cvc/config`: конфиг берётся из тела запроса, как у настоящего хоста. */
function echoSavedResponse(overrides = {}) {
  return {
    path: '/cvc/config',
    reuse: true,
    factory: (init) => {
      const config = JSON.parse(init.body).config
      return {
        ok: true,
        config,
        features: {
          catalogSync: config.features?.catalogSync === true,
          coefficients: config.features?.coefficients === true,
          balance: config.features?.balance === true,
          ...(overrides.features ?? {}),
        },
      }
    },
  }
}

/** Ответ `GET /cvc/coefficients`. */
function coefficientsResponse(models = [], providers = ['cheapvibecode']) {
  return { path: '/cvc/coefficients', json: { models, providers, fetchedAt: '2026-11-20T21:00:00.000Z' } }
}

/** Ответ `GET /cvc/balance`. */
function balanceResponse(body, status = 200) {
  return { path: '/cvc/balance', status, json: body }
}

/** Ответ `PUT /cvc/config` с действующим конфигом. */
function savedResponse(overrides = {}) {
  const config = configFixture(overrides)
  return { path: '/cvc/config', json: { ok: true, config, features: config.features } }
}

// -------------------------------------------------- загрузка бандла клиента

/** Один раз выполнить `client.js`: он только регистрирует фабрику. */
let registrationPromise = null
function loadRegistration() {
  if (registrationPromise === null) {
    registrationPromise = (async () => {
      let captured = null
      globalThis.window = { __ModuleLoader__: { load(input) { captured = input } } }
      globalThis.document = makeDocument()
      await import(new URL('../client.js', import.meta.url).href)
      assert.ok(captured !== null, 'client.js registers a module')
      assert.equal(captured.id, 'cvc-catalog-sync-plugin')
      return captured
    })()
  }
  return registrationPromise
}

/**
 * Поднять плагин на поддельном ctx.
 *
 * Каждый тест получает свой экземпляр React: фабрика бандла вызывает
 * `require('react')` заново, поэтому модули не делят состояние между тестами.
 */
async function mountPlugin(options = {}) {
  const registration = await loadRegistration()
  const document = options.document ?? makeDocument()
  const view = options.view ?? makeWindow()
  const fetchImpl = options.fetch ?? makeFetch(options.responses ?? [stateResponse(), echoSavedResponse()])

  const harness = makeReactHarness()
  const require = (specifier) => {
    // Бандл прогоняет `require('react')` через свой interop-хелпер и ждёт то,
    // что отдал бы настоящий загрузчик: пространство имён без `default`.
    if (specifier === 'react') {
      // Как отдаёт настоящий загрузчик: объект-пространство имён без `default`.
      // Хелпер бандла (`__toESM`) на таком объекте не ставит `__esModule` и
      // подставляет `default` сам — обращение `React.default.*` в коде работает.
      const { default: unused, ...rest } = { ...harness.React, default: null }
      return rest
    }
    if (specifier === 'react/jsx-runtime') {
      return { jsx: harness.React.createElement, jsxs: harness.React.createElement, Fragment: harness.React.Fragment }
    }
    throw new Error(`unknown module: ${specifier}`)
  }

  // Компоненты баланса берут окно и хранилище из `globalThis`, поэтому
  // подмена стоит ДО выполнения фабрики: иначе первый рендер увидит прежние.
  const previous = {
    localStorage: globalThis.localStorage,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    document: globalThis.document,
  }
  globalThis.document = document
  globalThis.localStorage = view.localStorage
  globalThis.innerWidth = view.innerWidth
  globalThis.innerHeight = view.innerHeight
  document.defaultView = view

  const module = registration.factory(require)

  const registered = []
  const ctx = {
    effects: [],
    effect(callback, label) {
      const dispose = callback()
      this.effects.push({ label, dispose })
      return dispose
    },
    locale: {
      registered: [],
      register(ns, dictionaries) {
        this.registered.push({ ns, dictionaries })
        return () => {}
      },
      bind(ns) {
        return (key) => `${ns}.${key}`
      },
    },
    slots: {
      inject(name, callback) {
        const off = callback()
        return () => {
          if (typeof off === 'function') off()
        }
      },
      register(options2, component) {
        const entry = { options: options2, component, disposed: false }
        registered.push(entry)
        return () => {
          entry.disposed = true
        }
      },
    },
  }

  // Компоненты баланса берут окно и хранилище из `globalThis`.
  globalThis.document = document
  globalThis.localStorage = view.localStorage
  globalThis.innerWidth = view.innerWidth
  globalThis.innerHeight = view.innerHeight
  document.defaultView = view

  const result = module.apply(ctx, { document, fetch: fetchImpl })
  await settle()

  const stop = () => {
    for (const effect of [...ctx.effects].reverse()) {
      if (typeof effect.dispose === 'function') effect.dispose()
    }
  }
  const restore = () => {
    globalThis.localStorage = previous.localStorage
    globalThis.innerWidth = previous.innerWidth
    globalThis.innerHeight = previous.innerHeight
    globalThis.document = previous.document
  }
  return {
    module,
    ctx,
    registered,
    document,
    view,
    calls: fetchImpl.calls ?? [],
    fetchImpl,
    store: result?.store,
    harness,
    t: ctx.locale.bind('cvc-catalog-sync'),
    stop,
    restore,
  }
}

/** Найти живую регистрацию по слоту и id/key. */
function findRegistration(registered, name, keyOrId) {
  return registered.find((entry) => entry.options.name === name
    && entry.disposed !== true
    && (keyOrId === undefined || entry.options.id === keyOrId || entry.options.key === keyOrId))
}

/** Смонтировать компонент регистрации и получить дерево. */
function renderRegistration(env, registration, owner = {}) {
  const injected = typeof registration.options.inject === 'function' ? registration.options.inject() : {}
  const harness = env.harness
  const tree = harness.mount(registration.component, { ...injected, ...owner })
  return {
    get tree() { return harness.tree() },
    firstTree: tree,
    rerender: () => harness.rerender(),
    unmount: () => harness.unmount(),
  }
}

// ------------------------------------------------------------------- тесты

test('бандл регистрирует ровно нужные слоты и не занимает чужие', async () => {
  const env = await mountPlugin()
  const names = env.registered.map((entry) => entry.options.name).sort()
  assert.deepEqual(names, ['plugins.bundle.config', 'settings.section', 'settings.section.icon', 'sidebar.footer.action'])
  const section = findRegistration(env.registered, 'settings.section', 'cvc-catalog-sync')
  assert.equal(section.options.order, 25)
  assert.equal(typeof section.options.label, 'function')
  assert.equal(section.options.label(), 'cvc-catalog-sync.nav')
  assert.equal(section.options.locale, 'cvc-catalog-sync')
  const bundle = findRegistration(env.registered, 'plugins.bundle.config', 'cvc-catalog-sync-plugin')
  assert.ok(bundle !== undefined)
  const balance = findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance')
  assert.equal(balance.options.order, 5)
  assert.ok(!names.includes('conversation.input.model.label'), 'model label slot is not touched')
  env.stop()
  env.restore()
})

test('регистрации живут в ctx.effect/ctx.slots.inject, словари зарегистрированы', async () => {
  const env = await mountPlugin()
  assert.ok(env.ctx.effects.length >= 5, 'each registration lives in its own effect')
  assert.equal(env.ctx.locale.registered.length, 1)
  assert.equal(env.ctx.locale.registered[0].ns, 'cvc-catalog-sync')
  assert.ok(env.ctx.locale.registered[0].dictionaries.en.summary.length > 0)
  assert.ok(env.ctx.locale.registered[0].dictionaries.ru.summary.length > 0)
  assert.equal(env.document.head.querySelectorAll('style').length, 1, 'one stylesheet for the whole plugin')
  env.stop()
  env.restore()
})

test('страница рендерится с загруженным состоянием', async () => {
  const env = await mountPlugin()
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, { close() {} })
  const text = textOf(rendered.tree).join(' ')
  for (const key of ['title', 'desc', 'groupFeatures', 'groupCatalog', 'groupCoefficients', 'groupBalance', 'groupAdvanced', 'save', 'check', 'apply', 'reset', 'statusTitle', 'featuresNote']) {
    assert.ok(text.includes(`cvc-catalog-sync.${key}`), `page shows ${key}`)
  }
  assert.ok(text.includes('C:/Users/x/.dsh/profiles/desktop/cordis.patch.yml'), 'patch path is rendered')
  for (const group of ['features', 'catalog', 'coefficients', 'balance', 'advanced']) {
    assert.ok(findByProp(rendered.tree, 'data-group', group) !== null, `group ${group} is rendered`)
  }
  assert.equal(fieldControl(rendered.tree, 'provider').props.value, 'cheapvibecode')
  rendered.unmount()
  env.stop()
  env.restore()
})

test('страница показывает загрузку, пока конфиг не пришёл', async () => {
  const env = await mountPlugin({ responses: [{ path: '/cvc/state', json: { config: null, configShape: 'v2' } }] })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  const text = textOf(rendered.tree).join(' ')
  assert.ok(text.includes('cvc-catalog-sync.title'))
  assert.ok(text.includes('cvc-catalog-sync.loading'))
  rendered.unmount()
  env.stop()
  env.restore()
})

test('три переключателя с role=switch и aria-checked отражают функции', async () => {
  const env = await mountPlugin({ responses: [stateResponse({ features: { coefficients: false } })] })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  const switches = findAll(rendered.tree, (node) => node.props?.role === 'switch' && node.props?.['data-feature'] !== undefined)
  assert.equal(switches.length, 3)
  const byFeature = new Map(switches.map((node) => [node.props['data-feature'], node.props['aria-checked']]))
  assert.equal(byFeature.get('catalogSync'), true)
  assert.equal(byFeature.get('coefficients'), false)
  assert.equal(byFeature.get('balance'), true)
  rendered.unmount()
  env.stop()
  env.restore()
})

test('переключатель меняет черновик и включает индикатор несохранённых изменений', async () => {
  const env = await mountPlugin()
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  const balanceSwitch = findAll(rendered.tree, (node) => node.props?.['data-feature'] === 'balance')[0]
  assert.equal(balanceSwitch.props['aria-checked'], true)
  balanceSwitch.props.onClick()
  await settle()
  const updated = findAll(rendered.tree, (node) => node.props?.['data-feature'] === 'balance')[0]
  assert.equal(updated.props['aria-checked'], false)
  const note = findByProp(rendered.tree, 'data-cvc', 'note')
  assert.equal(note.props['data-kind'], '', 'no message yet')
  const hints = findAll(rendered.tree, (node) => node.props?.className === 'cvc2-hint')
  assert.ok(textOf(hints).join(' ').includes('cvc-catalog-sync.dirty'), 'dirty indicator is shown')
  const save = findByProp(rendered.tree, 'data-action', 'save')
  assert.equal(save.props.disabled, false, 'save becomes available')
  rendered.unmount()
  env.stop()
  env.restore()
})

test('сохранение отправляет PUT /cvc/config и обновляет стор', async () => {
  const saved = configFixture({ balance: { refreshSeconds: 30 } })
  const env = await mountPlugin({
    responses: [stateResponse(), { path: '/cvc/config', json: { ok: true, config: saved, features: saved.features } }],
  })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  fieldControl(rendered.tree, 'refreshSeconds').props.onChange({ target: { value: '30' } })
  await settle()
  const save = findByProp(rendered.tree, 'data-action', 'save')
  assert.equal(save.props.disabled, false, 'save is enabled after a change')
  save.props.onClick()
  await settle()
  const put = env.calls.find((call) => call.method === 'PUT')
  assert.ok(put !== undefined, 'a PUT was sent')
  assert.equal(put.url, '/cvc/config')
  const body = JSON.parse(put.body)
  assert.equal(body.config.balance.refreshSeconds, 30)
  assert.equal(body.config.catalog.installerUrls.length, 1)
  assert.equal(body.config.features.balance, true)
  assert.equal(body.config.autoSync, undefined, 'legacy flat keys are not sent')
  const note = findByProp(rendered.tree, 'data-cvc', 'note')
  assert.equal(note.props['data-kind'], 'ok')
  assert.equal(env.store.getState().config.balance.refreshSeconds, 30)
  rendered.unmount()
  env.stop()
  env.restore()
})

test('неверное значение не уходит на хост и показывает ошибку поля', async () => {
  const env = await mountPlugin()
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  fieldControl(rendered.tree, 'minModelRatio').props.onChange({ target: { value: '5' } })
  await settle()
  findByProp(rendered.tree, 'data-action', 'save').props.onClick()
  await settle()
  assert.equal(env.calls.filter((call) => call.method === 'PUT').length, 0, 'nothing sent')
  const note = findByProp(rendered.tree, 'data-cvc', 'note')
  assert.equal(note.props['data-kind'], 'error')
  assert.ok(textOf(note).join(' ').includes('cvc-catalog-sync.errFields'))
  rendered.unmount()
  env.stop()
  env.restore()
})

test('ошибка хоста при сохранении показывается с полями', async () => {
  const env = await mountPlugin({
    responses: [
      stateResponse(),
      { path: '/cvc/config', status: 400, json: { error: 'invalid', fields: ['minModelRatio'] } },
    ],
  })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  fieldControl(rendered.tree, 'intervalHours').props.onChange({ target: { value: '6' } })
  await settle()
  findByProp(rendered.tree, 'data-action', 'save').props.onClick()
  await settle()
  const note = findByProp(rendered.tree, 'data-cvc', 'note')
  assert.equal(note.props['data-kind'], 'error')
  assert.ok(textOf(note).join(' ').includes('minModelRatio'))
  rendered.unmount()
  env.stop()
  env.restore()
})

test('«Проверить каталог» шлёт POST /run plan и показывает итог', async () => {
  const result = { action: 'plan', ok: true, catalogModels: 49, currentModels: 48, nextModels: 49, added: ['new-model'], removed: [], changed: [], warnings: ['careful'], allowlist: { added: [], pruned: [] }, levelsSource: 'idhw' }
  const env = await mountPlugin({ responses: [stateResponse(), { path: '/cvc/run', json: result }] })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  findByProp(rendered.tree, 'data-action', 'check').props.onClick()
  await settle()
  const post = env.calls.find((call) => call.method === 'POST')
  assert.equal(post.url, '/cvc/run')
  assert.deepEqual(JSON.parse(post.body), { action: 'plan' })
  const text = textOf(rendered.tree).join(' ')
  assert.ok(text.includes('new-model'), 'diff is rendered')
  assert.ok(text.includes('careful'), 'warning is rendered')
  assert.ok(text.includes('cvc-catalog-sync.checked'))
  rendered.unmount()
  env.stop()
  env.restore()
})

test('«Применить каталог» требует подтверждения', async () => {
  const applied = { action: 'apply', ok: true, applied: true, added: [], removed: [], changed: [], warnings: [], allowlist: {} }
  const env = await mountPlugin({ responses: [stateResponse(), { path: '/cvc/run', json: applied }] })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  findByProp(rendered.tree, 'data-action', 'apply').props.onClick()
  await settle()
  let text = textOf(rendered.tree).join(' ')
  assert.ok(text.includes('cvc-catalog-sync.confirmApply'))
  assert.ok(text.includes('cvc-catalog-sync.confirmYes'))
  assert.ok(text.includes('cvc-catalog-sync.confirmNo'))
  assert.equal(env.calls.filter((call) => call.method === 'POST').length, 0, 'nothing applied before confirmation')
  const yes = findAll(rendered.tree, (node) => textOf(node).join('') === 'cvc-catalog-sync.confirmYes' && node.props?.onClick !== undefined)[0]
  assert.ok(yes !== undefined, 'confirmation button is in the tree')
  yes.props.onClick()
  await settle()
  const post = env.calls.find((call) => call.method === 'POST')
  assert.deepEqual(JSON.parse(post.body), { action: 'apply' })
  text = textOf(rendered.tree).join(' ')
  assert.ok(text.includes('cvc-catalog-sync.applied'))
  rendered.unmount()
  env.stop()
  env.restore()
})

test('«Сбросить к умолчаниям» подставляет умолчания, но ничего не шлёт', async () => {
  const env = await mountPlugin({ responses: [stateResponse({ catalog: { intervalHours: 6 } })] })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  assert.equal(fieldControl(rendered.tree, 'intervalHours').props.value, '6')
  findByProp(rendered.tree, 'data-action', 'reset').props.onClick()
  await settle()
  assert.equal(fieldControl(rendered.tree, 'intervalHours').props.value, '24')
  const note = findByProp(rendered.tree, 'data-cvc', 'note')
  assert.equal(note.props['data-kind'], 'warn')
  assert.equal(env.calls.filter((call) => call.method === 'PUT').length, 0)
  rendered.unmount()
  env.stop()
  env.restore()
})

test('конфиг 1.x показывает подсказку о миграции', async () => {
  const env = await mountPlugin({ responses: [stateResponse({ configShape: 'legacy' })] })
  const section = findRegistration(env.registered, 'settings.section')
  const rendered = renderRegistration(env, section, {})
  assert.ok(textOf(rendered.tree).join(' ').includes('cvc-catalog-sync.legacyHint'))
  rendered.unmount()
  env.stop()
  env.restore()
})

test('блок на странице плагина рендерит ту же форму без большого описания', async () => {
  const env = await mountPlugin()
  const bundle = findRegistration(env.registered, 'plugins.bundle.config')
  const rendered = renderRegistration(env, bundle, { view: 'page' })
  const text = textOf(rendered.tree).join(' ')
  for (const key of ['title', 'save', 'check', 'apply', 'groupFeatures']) {
    assert.ok(text.includes(`cvc-catalog-sync.${key}`), `bundle page shows ${key}`)
  }
  assert.ok(!text.includes('cvc-catalog-sync.desc'), 'embedded block skips the page description')
  rendered.unmount()
  env.stop()
  env.restore()
})

test('в summary блок показывает одну короткую строку', async () => {
  const env = await mountPlugin()
  const bundle = findRegistration(env.registered, 'plugins.bundle.config')
  const rendered = renderRegistration(env, bundle, { view: 'summary' })
  assert.equal(textOf(rendered.tree).join('').trim(), 'cvc-catalog-sync.summary')
  rendered.unmount()
  env.stop()
  env.restore()
})

test('иконка секции рендерится svg нужного размера', async () => {
  const env = await mountPlugin()
  const icon = findRegistration(env.registered, 'settings.section.icon')
  const rendered = renderRegistration(env, icon, { size: 24, active: true })
  assert.equal(rendered.tree.tag, 'svg')
  assert.equal(rendered.tree.props.width, 24)
  assert.equal(rendered.tree.props['aria-hidden'], true)
  rendered.unmount()
  env.stop()
  env.restore()
})

test('бейджи коэффициентов ставятся только на строки провайдера каталога', async () => {
  const coefficients = {
    models: [
      { id: 'glm-5.3', displayName: 'GLM 5.3', multiplier: 0.5, fastMultiplier: 1, contextWindow: 200000 },
      { id: 'kimi', displayName: 'Kimi', multiplier: 3 },
    ],
    providers: ['cheapvibecode'],
  }
  // Строки выбора модели существуют до монтирования: в браузере их рисует
  // селектор, здесь — тот же документ, в который смотрит наблюдатель.
  const document = makeDocument()
  const rows = []
  for (const row of [
    { model: 'glm-5.3', provider: 'cheapvibecode' },
    { model: 'kimi', provider: 'other' },
    { model: 'unknown', provider: 'cheapvibecode' },
  ]) {
    const node = document.createElement('span')
    node.setAttribute('data-model-id', row.model)
    node.setAttribute('data-provider-id', row.provider)
    document.body.appendChild(node)
    rows.push(node)
  }
  const env = await mountPlugin({ document, responses: [stateResponse(), coefficientsResponse(coefficients.models, coefficients.providers)] })
  flushFrames(env.view)
  const badges = document.querySelectorAll('[data-cvc2-coeff]')
  assert.equal(badges.length, 1, 'only the catalog provider row gets a badge')
  assert.equal(badges[0].textContent, '×0.5')
  assert.equal(badges[0].parentNode.getAttribute('data-model-id'), 'glm-5.3')
  assert.equal(badges[0].title, '×0.5 · fast ×1')
  assert.equal(rows[1].querySelector('[data-cvc2-coeff]'), null)
  assert.equal(rows[2].querySelector('[data-cvc2-coeff]'), null)
  env.stop()
  env.restore()
})

test('выключение коэффициентов снимает наблюдатель, бейджи и таймер', async () => {
  const coefficients = { models: [{ id: 'glm-5.3', multiplier: 2 }], providers: ['cheapvibecode'] }
  const document = makeDocument()
  const node = document.createElement('span')
  node.setAttribute('data-model-id', 'glm-5.3')
  node.setAttribute('data-provider-id', 'cheapvibecode')
  document.body.appendChild(node)
  const env = await mountPlugin({
    document,
    responses: [
      stateResponse(),
      coefficientsResponse(coefficients.models, coefficients.providers),
      savedResponse({ features: { coefficients: false } }),
    ],
  })
  flushFrames(env.view)
  assert.equal(document.querySelectorAll('[data-cvc2-coeff]').length, 1)
  assert.ok([...env.view.timers.values()].some((entry) => entry.kind === 'interval'), 'polling timer is armed')
  await env.store.save(configFixture({ features: { coefficients: false } }))
  await settle()
  assert.equal(document.querySelectorAll('[data-cvc2-coeff]').length, 0, 'badges are removed with the feature')
  assert.equal([...env.view.timers.values()].filter((entry) => entry.kind === 'interval').length, 0, 'timer is cleared')
  env.stop()
  env.restore()
})

test('кнопка баланса рендерится при включённой функции', async () => {
  const env = await mountPlugin()
  const balance = findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance')
  assert.ok(balance !== undefined)
  const rendered = renderRegistration(env, balance, { wide: true })
  const button = findByProp(rendered.tree, 'data-cvc', 'balance-toggle')
  assert.ok(button !== undefined, 'button is rendered')
  assert.ok(textOf(button).join(' ').includes('cvc-catalog-sync.balanceButton'))
  assert.equal(button.props.type, 'button')
  rendered.unmount()
  env.stop()
  env.restore()
})

test('выключение баланса снимает регистрацию, включение возвращает', async () => {
  const env = await mountPlugin()
  assert.ok(findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance') !== undefined)
  await env.store.save(configFixture({ features: { balance: false } }))
  await settle()
  assert.equal(findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance'), undefined, 'registration is gone')
  await env.store.save(configFixture({ features: { balance: true } }))
  await settle()
  assert.ok(findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance') !== undefined, 'registration is back')
  env.stop()
  env.restore()
})

test('баланс выключен на старте — кнопки нет до включения', async () => {
  const env = await mountPlugin({ responses: [stateResponse({ features: { balance: false } }), echoSavedResponse()] })
  assert.equal(findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance'), undefined)
  await env.store.save(configFixture({ features: { balance: true } }))
  await settle()
  assert.ok(findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance') !== undefined)
  env.stop()
  env.restore()
})

test('панель баланса открывается, читает GET /cvc/balance и показывает остаток', async () => {
  const balanceBody = {
    fetchedAt: '2026-11-20T21:00:00.000Z',
    providers: [{ provider: 'cheapvibecode', displayName: 'CheapVibeCode', baseURL: 'https://ru.cheapvibecode.ru/v1', apiKeyEnv: 'CVC_DEEPSEEK_API_KEY', keySet: true, balanceUnits: 1234.5, spentSinceLast: 12, balanceError: '' }],
  }
  const env = await mountPlugin({ responses: [stateResponse(), balanceResponse(balanceBody)] })
  const balance = findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance')
  const rendered = renderRegistration(env, balance, {})
  findByProp(rendered.tree, 'data-cvc', 'balance-toggle').props.onClick()
  await settle()
  assert.ok(env.calls.some((call) => call.url === '/cvc/balance'), 'balance route is read')
  const panel = findByProp(rendered.tree, 'data-cvc', 'balance-panel')
  assert.ok(panel !== undefined, 'panel is rendered')
  const text = textOf(panel).join(' ')
  assert.ok(text.includes('CheapVibeCode'))
  assert.ok(text.replace(/\u00a0/g, ' ').includes('1 234,5'), 'balance is formatted')
  assert.ok(text.includes('cvc-catalog-sync.balanceSpent'))
  const dot = findByProp(rendered.tree, 'data-cvc', 'balance-dot')
  assert.equal(dot.props['data-state'], 'ok')
  assert.equal(panel.props['data-dragging'], false)
  rendered.unmount()
  env.stop()
  env.restore()
})

test('панель показывает ошибку маршрута, когда функция выключена на хосте', async () => {
  const env = await mountPlugin({ responses: [stateResponse(), balanceResponse({ error: 'disabled' }, 404)] })
  const balance = findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance')
  const rendered = renderRegistration(env, balance, {})
  findByProp(rendered.tree, 'data-cvc', 'balance-toggle').props.onClick()
  await settle()
  const panel = findByProp(rendered.tree, 'data-cvc', 'balance-panel')
  assert.ok(textOf(panel).join(' ').includes('HTTP 404'))
  const dot = findByProp(rendered.tree, 'data-cvc', 'balance-dot')
  assert.equal(dot.props['data-state'], 'err')
  rendered.unmount()
  env.stop()
  env.restore()
})

test('остановка плагина снимает регистрации, таймеры и стили', async () => {
  const env = await mountPlugin()
  assert.ok([...env.view.timers.values()].some((entry) => entry.kind === 'interval'), 'coefficient polling is armed')
  env.stop()
  assert.equal([...env.view.timers.values()].filter((entry) => entry.kind === 'interval').length, 0)
  assert.equal(findRegistration(env.registered, 'sidebar.footer.action', 'cvc-balance'), undefined)
  assert.equal(env.document.head.querySelectorAll('style').length, 0, 'stylesheet is removed')
  env.restore()
})