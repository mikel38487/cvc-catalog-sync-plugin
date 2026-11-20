/**
 * cvc-catalog-sync-plugin 2.0.0 — три функции CheapVibeCode в одном плагине.
 *
 * Синхронизация каталога, коэффициенты моделей и баланс ключа включаются
 * независимо группой `features`. Выключенная функция не регистрирует ничего:
 * её маршрут отвечает 404, таймер не создаётся, инструмент не появляется.
 * Страница настроек существует всегда — это и есть переключатель.
 *
 * Все поля `Config` объявлены `.volatile()`, поэтому правка строки патча
 * приходит событием `loader/volatile-update` и применяется на лету: каркас
 * перемонтирует только затронутые функции, не перезапуская плагин.
 *
 * Контракт функций (lib/catalog-sync.js, lib/coefficients.js, lib/balance.js):
 *   register(ctx, deps) -> () => void   — вызывается при включении функции;
 *   tool(deps) -> object | null         — описание инструмента, если он есть.
 *
 * @module cvc-catalog-sync-plugin
 */
import { readFileSync } from 'node:fs'

import * as balanceModule from './lib/balance.js'
import * as catalogSyncModule from './lib/catalog-sync.js'
import * as coefficientsModule from './lib/coefficients.js'
import { createCatalogCache } from './lib/cache.js'
import {
  Config,
  FEATURE_KEYS,
  featuresOf,
  normalizeConfig,
  readPluginConfig,
  sameConfig,
} from './lib/config.js'
import * as apiModule from './lib/cvc-api.js'
import { CvcApiError, fetchModels } from './lib/cvc-api.js'
import * as httpModule from './lib/http.js'
import { CVC_PREFIX, createRouter, methodNotAllowed, sendJson } from './lib/http.js'
import * as providersModule from './lib/providers.js'
import { apiKeyFor, pickRoute, resolveKey, resolveRoutes } from './lib/providers.js'
import { createStateStore, installStateRoutes } from './lib/state.js'

/** Идентификатор строки композиции; совпадает с id в cordis.patch.yml. */
export const SELF_ROW_ID = 'cvc-catalog-sync'

/** Имя плагина в терминах Cordis. */
export const name = 'cvc-catalog-sync'

/**
 * Сервисы, без которых плагин не работает: запись профильного патча, реестр
 * инструментов и разрешение ссылки на ключ. Loader отложит запуск, а не упадёт.
 */
export const inject = ['configEditor', 'tools', 'credentials']

export { Config }

/** Версия из package.json; при нечитаемом манифесте — запасная строка. */
export const VERSION = (() => {
  try {
    const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    return typeof manifest.version === 'string' && manifest.version.length > 0 ? manifest.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

/** Модули функций по ключам переключателей. */
const MODULES = Object.freeze({
  catalogSync: catalogSyncModule,
  coefficients: coefficientsModule,
  balance: balanceModule,
})

/** Текст ошибки без предположения о её типе. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Подключить плагин.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} [config] — конфиг строки патча (объект со ссылками).
 */
export function apply(ctx, config = {}) {
  /** Действующий нормализованный конфиг; обновляется в applyConfig. */
  let current = readPluginConfig(config)

  /** Последний прогон и статус для `/cvc/state`. */
  const store = createStateStore()

  /** Один prefix-маршрут на весь плагин: выключенная функция даёт 404. */
  const router = createRouter({
    prefix: CVC_PREFIX,
    log: (message) => log('warn', message),
  })

  /** @type {Map<string, () => void>} */
  const mounted = new Map()

  /**
   * Записать строку в лог хоста, не падая на профиле без логгера.
   * @param {'info' | 'warn' | 'error'} level
   * @param {string} message
   */
  function log(level, message) {
    const line = `cvc-catalog-sync: ${message}`
    const logger = ctx.logger
    if (logger !== null && logger !== undefined && typeof logger[level] === 'function') {
      logger[level](line)
      return
    }
    if (level === 'error') console.error(line)
  }

  /**
   * Загрузить общий снимок каталога: выбранный маршрут, ключ, `GET /models`.
   *
   * Используется кэшем, который делят каталог и коэффициенты; баланс ходит
   * своим запросом за `token_balance`.
   * @returns {Promise<{ models: Array<Record<string, unknown>>, providers: Array<{ provider: string, displayName: string }>, fetchedAt: string }>}
   */
  async function loadCatalog() {
    const snapshot = current
    const routes = resolveRoutes(ctx, snapshot)
    const route = pickRoute(routes, snapshot.catalog.provider)
    if (route === undefined) {
      throw new CvcApiError(
        'no-route',
        `provider route "${snapshot.catalog.provider}" is not configured in "${snapshot.providers.entryId}"`,
      )
    }
    const key = await resolveKey(ctx, apiKeyFor(route, snapshot))
    const models = await fetchModels({ baseURL: route.baseURL, key, timeoutMs: snapshot.providers.timeoutMs })
    return {
      models,
      providers: routes.map((item) => ({ provider: item.provider, displayName: item.displayName })),
      fetchedAt: new Date().toISOString(),
    }
  }

  /** Общий кэш каталога; TTL следует за `coefficients.refreshMinutes`. */
  const cache = createCatalogCache({
    client: loadCatalog,
    ttlMs: () => Math.max(1, current.coefficients.refreshMinutes) * 60000,
  })

  /**
   * Общие зависимости функций.
   *
   * Модуль получает живой доступ к конфигу (`config()`), общий кэш каталога,
   * реестр состояния и helpers HTTP — но не сам `webServer`: маршруты
   * регистрируются в общей таблице через `route()`.
   * @returns {object}
   */
  function createFeatureDeps() {
    return Object.freeze({
      ctx,
      version: VERSION,
      /** Актуальный нормализованный конфиг. */
      config: () => current,
      /** Только переключатели. */
      features: () => featuresOf(current),
      log,
      /** Зарегистрировать подмаршрут `/cvc/<path>`; вернуть disposer. */
      route: (path, handler) => router.register(path, handler),
      http: httpModule,
      api: apiModule,
      providers: providersModule,
      cache,
      store,
      /** Маршруты CheapVibeCode по текущему конфигу. */
      routes: () => resolveRoutes(ctx, current),
      /** Ключ по ссылке (пустая строка, если не настроен). */
      key: (ref) => resolveKey(ctx, ref),
      /** Имя записи ключа для маршрута с учётом общего запасного имени. */
      apiKeyFor: (route) => apiKeyFor(route, current),
    })
  }

  const featureDeps = createFeatureDeps()

  /**
   * Включить функцию: вызвать `register` и зарегистрировать её инструмент.
   * @param {string} feature
   */
  function mountFeature(feature) {
    if (mounted.has(feature)) return
    const module = MODULES[feature]
    if (module === undefined || typeof module.register !== 'function') {
      log('warn', `feature "${feature}" has no module`)
      return
    }
    const disposers = []
    const disposeModule = module.register(ctx, featureDeps)
    if (typeof disposeModule === 'function') disposers.push(disposeModule)

    if (typeof module.tool === 'function') {
      const spec = module.tool(featureDeps)
      if (spec !== null && spec !== undefined) {
        const tools = ctx.get?.('tools') ?? ctx.tools
        if (tools !== null && tools !== undefined && typeof tools.register === 'function') {
          disposers.push(tools.register(spec))
        } else {
          log('warn', `feature "${feature}": tools service is unavailable, "${spec.name ?? 'tool'}" is not registered`)
        }
      }
    }

    mounted.set(feature, () => {
      for (const dispose of disposers.reverse()) {
        if (typeof dispose === 'function') dispose()
      }
    })
  }

  /**
   * Выключить функцию: снять маршруты, таймеры и инструмент.
   * @param {string} feature
   */
  function unmountFeature(feature) {
    const dispose = mounted.get(feature)
    if (dispose === undefined) return
    mounted.delete(feature)
    try {
      dispose()
    } catch (error) {
      log('warn', `feature "${feature}" teardown failed: ${messageOf(error)}`)
    }
  }

  /**
   * Применить новый конфиг без перезапуска плагина.
   *
   * Перемонтируются только функции: их таймеры и маршруты должны увидеть новые
   * значения, а `apply()` повторно не вызывается — ссылки уже обновлены.
   * Если обычные (не переключательные) настройки поменялись у уже включённой
   * функции, она перемонтируется тоже: иначе, например, новый интервал
   * автосинхронизации подхватился бы только после перезапуска DSH.
   * @param {ReturnType<typeof normalizeConfig>} next
   */
  function applyConfig(next) {
    if (sameConfig(next, current)) return
    const previous = current
    current = next
    // Смена самих переключателей снимает все функции — это одна операция; для
    // обычных настроек перемонтируется только затронутая функция.
    const remount = new Set()
    const featuresChanged = !sameConfig(previous.features, next.features)
    if (featuresChanged) {
      for (const feature of FEATURE_KEYS) remount.add(feature)
    } else {
      const providersChanged = !sameConfig(previous.providers, next.providers)
      if (providersChanged
        || (previous.features.catalogSync === true && !sameConfig(previous.catalog, next.catalog))) remount.add('catalogSync')
      if (providersChanged
        || (previous.features.coefficients === true && !sameConfig(previous.coefficients, next.coefficients))) remount.add('coefficients')
      if (providersChanged
        || (previous.features.balance === true && !sameConfig(previous.balance, next.balance))) remount.add('balance')
    }
    for (const feature of remount) unmountFeature(feature)
    for (const feature of FEATURE_KEYS) {
      if (current.features[feature] === true) mountFeature(feature)
    }
    if (!sameConfig(previous.providers, current.providers) || !sameConfig(previous.catalog, current.catalog)) {
      cache.clear()
    }
    log('info', 'configuration updated without restart')
  }

  // Базовые маршруты: состояние и переключатели есть всегда, даже когда все
  // три функции выключены — страница настроек и есть переключатель.
  ctx.effect(() => {
    const disposers = [
      installStateRoutes(router, {
        ctx,
        rowId: SELF_ROW_ID,
        version: VERSION,
        readConfig: () => current,
        store,
        onAfterWrite: (next) => applyConfig(next),
      }),
      router.register('health', (req, res) => {
        if (String(req.method ?? 'GET').toUpperCase() !== 'GET') {
          methodNotAllowed(res, ['GET'])
          return
        }
        sendJson(res, 200, { ok: true, version: VERSION })
      }),
    ]
    return () => {
      for (const dispose of disposers) {
        if (typeof dispose === 'function') dispose()
      }
    }
  }, 'cvc-catalog-sync: state routes')

  // Первичное монтирование по текущему конфигу.
  for (const feature of FEATURE_KEYS) {
    if (current.features[feature] === true) mountFeature(feature)
  }

  // Правка volatile-полей строки патча: перемонтировать функции по новым
  // значениям. `sameConfig` не даст сделать работу дважды (например, после
  // PUT /cvc/config, который уже применил конфиг сам).
  ctx.effect(() => ctx.on('loader/volatile-update', () => {
    applyConfig(readPluginConfig(config))
  }), 'cvc-catalog-sync: volatile config')

  // Выключение плагина снимает всё, что зарегистрировали функции.
  ctx.effect(() => () => {
    for (const feature of FEATURE_KEYS) unmountFeature(feature)
  }, 'cvc-catalog-sync: feature teardown')

  // Веб-сервер есть не в каждом профиле: без него плагин живёт инструментами.
  ctx.inject(['webServer'], (web) => {
    web.effect(() => router.attach(web.webServer), 'cvc-catalog-sync: browser API')
  })

  // Своя страница настроек: форма строится клиентом, автогенерация не нужна.
  // Регистрация внутри inject — плагин обязан грузиться и без Settings.
  ctx.inject(['settings'], (scoped) => {
    scoped.effect(
      () => scoped.settings.configure({ auto: false }, scoped.fiber),
      'cvc-catalog-sync: settings policy',
    )
  })
}