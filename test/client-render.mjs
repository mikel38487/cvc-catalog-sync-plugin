/**
 * Смоук клиентской страницы без браузера: модуль грузится через поддельный
 * `window.__ModuleLoader__`, компонент рендерится поддельным React.
 *
 * Ловит ошибки рендера, которые иначе проявились бы пустым слотом в настройках.
 *
 * Запуск: node --test test/client-render.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

/** Поддельный React: createElement + хуки с заданными значениями состояний. */
function makeReact(stateQueue) {
  let stateIndex = 0
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat() }
    },
    useState(initial) {
      const index = stateIndex
      stateIndex += 1
      return [index < stateQueue.length ? stateQueue[index] : initial, () => {}]
    },
    useEffect() {},
    useCallback(fn) { return fn },
    useMemo(fn) { return fn() },
  }
  return { React, reset() { stateIndex = 0 } }
}

/** Собрать весь текст из дерева элементов. */
function textOf(node, collected = []) {
  if (node === null || node === undefined || node === false) return collected
  if (typeof node === 'string' || typeof node === 'number') {
    collected.push(String(node))
    return collected
  }
  if (Array.isArray(node)) {
    for (const child of node) textOf(child, collected)
    return collected
  }
  if (typeof node === 'object') {
    // Функциональные компоненты вызываем с их пропсами: слот регистрирует
    // обёртку, а страница — вложенный компонент.
    if (typeof node.type === 'function') return textOf(node.type(node.props), collected)
    textOf(node.children ?? [], collected)
  }
  return collected
}

/** Один раз загрузить модуль и запомнить его определение. */
let definitionPromise = null
function getDefinition() {
  if (definitionPromise === null) {
    definitionPromise = (async () => {
      let captured = null
      globalThis.window = { __ModuleLoader__: { load(input) { captured = input } } }
      globalThis.document = {
        createElement: () => ({ dataset: {}, textContent: '' }),
        head: { appendChild() {} },
      }
      await import(new URL('../client.js', import.meta.url).href)
      assert.ok(captured !== null, 'client.js registers a module')
      assert.equal(captured.id, 'cvc-catalog-sync-plugin')
      return captured
    })()
  }
  return definitionPromise
}

/** Смонтировать плагин на поддельном ctx и получить регистрации слотов. */
async function mount(queue = []) {
  const definition = await getDefinition()
  const fake = makeReact(queue)
  const module = definition.factory(() => fake.React)
  const registered = []
  module.apply({
    effect(callback) { return callback() },
    locale: { register() { return () => {} }, bind() { return (key) => key } },
    slots: {
      inject(_name, callback) { callback() },
      register(options, component) {
        registered.push({ options, component })
        return () => {}
      },
    },
  })
  return { registered, fake }
}

/** Отрисовать страницу настроек с заданной очередью значений useState. */
async function renderWith(queue) {
  const { registered, fake } = await mount(queue)
  const section = registered.find((entry) => entry.options.name === 'settings.section')
  const icon = registered.find((entry) => entry.options.name === 'settings.section.icon')
  assert.ok(section !== undefined, 'settings.section is registered')
  assert.ok(icon !== undefined, 'settings.section.icon is registered')
  assert.equal(section.options.id, 'cvc-catalog-sync')
  assert.equal(section.options.order, 25)
  assert.equal(typeof section.options.label, 'function')
  assert.equal(section.options.label(), 'nav')
  const injected = section.options.inject()
  assert.equal(typeof injected.t, 'function')

  fake.reset()
  return section.component({ ...injected, close() {} })
}

/** Отрисовать блок конфигурации на странице плагина. */
async function renderBundle(ownerProps, queue) {
  const { registered, fake } = await mount(queue)
  const bundle = registered.find((entry) => entry.options.name === 'plugins.bundle.config')
  assert.ok(bundle !== undefined, 'plugins.bundle.config is registered')
  assert.equal(bundle.options.key, 'cvc-catalog-sync-plugin')
  const injected = bundle.options.inject()
  fake.reset()
  return bundle.component({ ...injected, ...ownerProps })
}

const fixture = {
  config: {
    entryId: 'llm-pi-ai',
    provider: 'cheapvibecode',
    baseURL: 'https://ru.cheapvibecode.ru/v1',
    apiKeyEnv: 'CVC_DEEPSEEK_API_KEY',
    installerUrls: ['https://ru.cheapvibecode.ru/idhw', 'https://ru.cheapvibecode.ru/idhl'],
    autoSync: true,
    startupDelayMs: 5000,
    intervalHours: 24,
    minModelRatio: 0.8,
    keepModels: [],
    syncAllowlist: true,
    allowlistEntryId: 'subagent-model-selection-settings',
    timeoutMs: 30000,
    levelsCacheMinutes: 360,
  },
  override: {},
  defaults: {},
  providers: ['cheapvibecode', 'funpay'],
  patchPath: 'C:/Users/x/.dsh/profiles/desktop/cordis.patch.yml',
  rowId: 'cvc-catalog-sync',
  active: true,
  status: {
    action: 'plan',
    ok: true,
    at: '2026-11-20T00:00:00.000Z',
    provider: 'cheapvibecode',
    catalogModels: 49,
    currentModels: 49,
    nextModels: 49,
    levelsSource: 'https://ru.cheapvibecode.ru/idhw',
    applied: false,
    added: ['new-model'],
    removed: ['old-model'],
    changed: [{ id: 'glm-5.3', fields: ['maxTokens'] }],
    warnings: ['sample warning'],
    allowlist: { pruned: [], added: ['new-model'], skipped: false, changed: true },
    error: '',
  },
}

const FIELDS = [
  'provider', 'baseURL', 'apiKeyEnv', 'autoSync', 'intervalHours', 'startupDelayMs',
  'minModelRatio', 'syncAllowlist', 'entryId', 'allowlistEntryId', 'installerUrls',
  'keepModels', 'levelsCacheMinutes', 'timeoutMs',
]

test('страница рендерится с загруженным состоянием', async () => {
  // Порядок useState: state, draft, busy, note, run, confirming.
  const tree = await renderWith([fixture, fixture.config, '', null, null, false])
  const text = textOf(tree).join(' ')
  for (const key of ['title', 'groupMain', 'groupSync', 'groupAdvanced', 'save', 'check', 'apply', 'reset', 'statusTitle', ...FIELDS]) {
    assert.ok(text.includes(key), `page shows ${key}`)
  }
  assert.ok(text.includes(fixture.patchPath), 'patch path is rendered')
  assert.ok(text.includes('new-model'), 'diff is rendered')
  assert.ok(text.includes('sample warning'), 'warnings are rendered')
})

test('страница показывает загрузку без состояния', async () => {
  const tree = await renderWith([null, null, '', null, null, false])
  const text = textOf(tree).join(' ')
  assert.ok(text.includes('title'))
  assert.ok(text.includes('loading'))
})

test('неактивная строка показывает предупреждение', async () => {
  const state = { ...fixture, active: false }
  const tree = await renderWith([state, state.config, '', null, null, false])
  assert.ok(textOf(tree).join(' ').includes('inactive'))
})

test('режим подтверждения показывает кнопки применения', async () => {
  const tree = await renderWith([fixture, fixture.config, '', null, null, true])
  const text = textOf(tree).join(' ')
  assert.ok(text.includes('confirmApply'))
  assert.ok(text.includes('confirmYes'))
  assert.ok(text.includes('confirmNo'))
})

test('блок на странице плагина рендерит ту же форму без большого описания', async () => {
  const tree = await renderBundle({ view: 'page' }, [fixture, fixture.config, '', null, null, false])
  const text = textOf(tree).join(' ')
  for (const key of ['title', 'save', 'check', 'apply', ...FIELDS]) {
    assert.ok(text.includes(key), `bundle page shows ${key}`)
  }
  assert.ok(!text.includes('desc'), 'embedded block skips the page description')
  assert.ok(text.includes(fixture.patchPath), 'patch path is rendered')
})

test('в summary блок показывает короткую строку', async () => {
  const tree = await renderBundle({ view: 'summary' }, [])
  assert.ok(textOf(tree).join(' ').includes('summary'))
})
