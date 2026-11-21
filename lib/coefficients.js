/**
 * Коэффициенты моделей CheapVibeCode: бейджи `×0.1…×10` в выборе модели.
 *
 * Своего запроса к апстриму модуль не делает: каталог берётся из ОБЩЕГО кэша
 * `deps.cache` (`lib/cache.js`), который наполняется одним `GET /v1/models` для
 * трёх функций. Здесь остаются только чистые преобразования каталога и защита
 * маршрута от лишних чтений.
 *
 * Почему защита вообще нужна, если кэш и сам сливает одновременные запросы:
 * у маршрута может быть несколько читателей сразу (несколько вкладок браузера,
 * открытая панель), и каждый лишний `cache.get()` — это лишняя работа на
 * хосте. Поэтому модуль сам держит одно чтение на монтирование функции, а
 * поздний ответ (функцию уже выключили и включили заново) он не превращает в
 * ответ: поколение чтения сменилось.
 *
 * Ключ и сеть сюда не попадают: `cache.get()` уже получил каталог, а ошибки
 * апстрима приходят кодом (`CvcApiError.code`), не текстом с секретом.
 *
 * @module cvc-catalog-sync-plugin/lib/coefficients
 */

/** Путь маршрута в общей таблице каркаса. */
export const ROUTE_PATH = 'coefficients'

/**
 * Нормализовать идентификатор модели для сравнения и дедупликации.
 *
 * Каталог CheapVibeCode и каталог адаптера DSH пишут одну модель по-разному:
 * `deepseek-v4.1-flash` и `deepseek-v4-1-flash`. Точки и подчёркивания
 * сводятся к дефису, регистр не учитывается.
 *
 * @param {unknown} value — сырой идентификатор.
 * @returns {string} ключ сравнения или пустая строка.
 */
export function normalizeModelId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Разобрать числовой коэффициент.
 *
 * Ноль — законное значение (бесплатная модель), отрицательное и NaN — нет.
 * Строка принимается, потому что часть прокси отдаёт числа текстом.
 *
 * @param {unknown} value
 * @returns {number | null} число или `null`, если значение не читается.
 */
export function parseMultiplier(value) {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

/**
 * Размер контекста из строки каталога.
 *
 * @param {unknown} value — `context_window` сырой строки.
 * @returns {number | null} целое положительное число или `null`.
 */
export function parseContextWindow(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(/** @type {number} */ (value)) : null
}

/**
 * Отображаемое имя модели: `display_name` каталога, иначе сам id.
 *
 * @param {string} id — идентификатор модели.
 * @param {unknown} value — `display_name` сырой строки.
 * @returns {string}
 */
export function displayNameOf(id, value) {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  return id
}

/**
 * Индекс каталога: `нормализованный id → множители и контекст`.
 *
 * Принимает и весь снимок кэша (`{models: [...]}`), и голый массив строк.
 * Строка без читаемого `multiplier` не индексируется: бейдж без множителя
 * означал бы выдуманную цену. При двух записях с одним ключом остаётся первая:
 * порядок каталога провайдера и есть порядок, в котором он их объявил.
 *
 * @param {unknown} catalog — снимок каталога или список строк.
 * @returns {Map<string, { id: string, displayName: string, multiplier: number, fastMultiplier: number | null, contextWindow: number | null }>}
 */
export function indexCoefficients(catalog) {
  const source = Array.isArray(catalog)
    ? catalog
    : catalog !== null && typeof catalog === 'object' && Array.isArray(/** @type {any} */ (catalog).models)
      ? /** @type {any} */ (catalog).models
      : []

  const index = new Map()
  for (const row of source) {
    if (row === null || typeof row !== 'object') continue
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const multiplier = parseMultiplier(row.multiplier)
    if (id.length === 0 || multiplier === null) continue
    const key = normalizeModelId(id)
    if (key.length === 0 || index.has(key)) continue
    index.set(key, {
      id,
      displayName: displayNameOf(id, row.display_name),
      multiplier,
      fastMultiplier: parseMultiplier(row.fast_multiplier),
      contextWindow: parseContextWindow(row.context_window),
    })
  }
  return index
}

/**
 * Найти коэффициент модели по идентификатору.
 *
 * Порядок поиска: точный ключ, затем ключ без префикса провайдера
 * (`openai/gpt-6-sol`), затем единственный ключ каталога, который заканчивается
 * на id модели. Последний шаг нужен, когда адаптер DSH отрезает вендора, а
 * каталог CheapVibeCode его оставляет. Если таких хвостов несколько — это уже
 * неоднозначность, и коэффициент не показывается.
 *
 * @param {ReturnType<typeof indexCoefficients>} index — индекс каталога.
 * @param {unknown} modelId — идентификатор модели в селекторе.
 * @returns {{ id: string, multiplier: number, fastMultiplier: number | null, contextWindow: number | null } | null}
 */
export function lookupCoefficient(index, modelId) {
  const key = normalizeModelId(modelId)
  if (key.length === 0) return null

  const direct = index.get(key)
  if (direct !== undefined) return direct

  const slash = key.lastIndexOf('/')
  if (slash >= 0) {
    const tail = index.get(key.slice(slash + 1))
    if (tail !== undefined) return tail
  }

  // Хвост после дефиса берём только когда он сам похож на id модели.
  // Иначе «pro» совпадёт и с mimo-v2.6-pro, и с gemini-3.1-pro, и с десятком
  // других, а единственный короткий ключ получит чужой коэффициент.
  if (key.length < 6 || !key.includes('-')) return null

  const suffix = []
  for (const [candidate, value] of index) {
    if (candidate.endsWith(`-${key}`) || candidate.endsWith(`/${key}`)) suffix.push(value)
  }
  return suffix.length === 1 ? suffix[0] : null
}

/**
 * Подпись множителя: до трёх знаков после запятой — точное значение, точнее —
 * огрублённое с тильдой (`×~0.001`). Правило продублировано в
 * `src/client/coefficients.js`: собранный клиент не может импортировать
 * хост-модуль, и дублирование здесь дешевле сборки.
 *
 * @param {number} multiplier
 * @returns {string} подпись бейджа или пустая строка для нечисла.
 */
export function formatMultiplier(multiplier) {
  if (!Number.isFinite(multiplier)) return ''
  return formatCoefficient(multiplier)
}

/** Сколько знаков после запятой показывается полностью. */
const SHOWN_DECIMALS = 3

/**
 * Число, огрублённое до `SHOWN_DECIMALS` знаков, в обычной десятичной записи.
 *
 * Экспоненциальную запись (`1e-7`) раскладываем в обычную: бейдж читается как
 * число, а не как степень.
 * @param {number} value
 * @returns {string}
 */
function plainNumber(value) {
  const rounded = Number(value.toFixed(SHOWN_DECIMALS))
  const text = String(rounded)
  if (!/e/i.test(text)) return text
  const [mantissa, exponent] = text.split(/e/i)
  const power = Number(exponent)
  const digits = mantissa.replace('-', '').replace('.', '')
  const sign = mantissa.startsWith('-') ? '-' : ''
  if (power >= 0) return `${sign}${digits}${'0'.repeat(power)}`
  return `${sign}0.${'0'.repeat(Math.abs(power) - 1)}${digits}`
}

/**
 * Подпись множителя с тильдой, если значение точнее показанного.
 *
 * `0.001` → `×0.001`, `0.125` → `×~0.125`, `0.0005` → `×~0.001`. Округлять до
 * `×0` нельзя: модель не бесплатная, и ноль в бейдже — ложь.
 * @param {number} value
 * @returns {string}
 */
export function formatCoefficient(value) {
  if (!Number.isFinite(value)) return ''
  const exact = Number(value.toFixed(10))
  const rounded = Number(value.toFixed(SHOWN_DECIMALS))
  const shown = plainNumber(rounded)
  const approximate = Math.abs(exact - rounded) > 1e-9
  return `×${approximate ? '~' : ''}${shown}`
}

/**
 * Ответ маршрута из снимка кэша.
 *
 * `fetchedAt` — время каталога, а не ответа маршрута: бейджи показывают тот
 * каталог, который действительно прочитан. `stale` говорит, что кэш отдал
 * прошлый удачный снимок после ошибки апстрима.
 *
 * @param {unknown} catalog — данные из `cache.get().data`.
 * @param {{ fetchedAt?: number | null, stale?: boolean }} [meta] — метаданные кэша.
 * @returns {{ models: Array<{ id: string, displayName: string, multiplier: number, fastMultiplier: number | null, contextWindow: number | null }>, providers: string[], fetchedAt: string | null, stale: boolean }}
 */
export function coefficientsPayload(catalog, meta = {}) {
  const index = indexCoefficients(catalog)
  const models = [...index.values()].map((model) => ({
    id: model.id,
    displayName: displayNameOf(model.id, /** @type {any} */ (model).displayName),
    multiplier: model.multiplier,
    fastMultiplier: model.fastMultiplier,
    contextWindow: model.contextWindow,
  }))

  // id провайдеров, которым принадлежит кэшированный каталог: браузер не должен
  // украшать бейджем модель чужого провайдера с тем же id.
  const rawProviders = catalog !== null && typeof catalog === 'object' && Array.isArray(/** @type {any} */ (catalog).providers)
    ? /** @type {any} */ (catalog).providers
    : []
  const providers = []
  for (const entry of rawProviders) {
    const id = typeof entry === 'string' ? entry : typeof entry?.provider === 'string' ? entry.provider : ''
    if (id.length > 0 && !providers.includes(id)) providers.push(id)
  }

  const fetchedAt = typeof meta.fetchedAt === 'number' && meta.fetchedAt > 0
    ? new Date(meta.fetchedAt).toISOString()
    : null

  return { models, providers, fetchedAt, stale: meta.stale === true }
}

/**
 * Одно чтение общего кэша на все одновременные запросы.
 *
 * Заодно это защита от позднего ответа: `dispose()` поднимает поколение, и
 * чтение, начатое до выключения функции, уже не станет ответом. Сам кэш тоже
 * сливает одновременные запросы, но здесь важно не открывать второе чтение
 * вовсе — у маршрута бывает несколько одновременных читателей.
 *
 * @param {{ get: (options?: { force?: boolean }) => Promise<any> }} cache — общий кэш каталога.
 * @returns {{ read: () => Promise<any | null>, dispose: () => void }}
 */
export function createCoefficientsReader(cache) {
  /** @type {Promise<any> | null} */
  let inflight = null
  let generation = 0

  return {
    read() {
      if (inflight !== null) return inflight
      const startedGeneration = generation
      const run = (async () => {
        try {
          const result = await cache.get()
          // Поздний ответ: функцию успели выключить или перемонтировать.
          if (startedGeneration !== generation) return null
          return result
        } finally {
          if (inflight === run) inflight = null
        }
      })()
      inflight = run
      return run
    },
    dispose() {
      generation += 1
      inflight = null
    },
  }
}

/**
 * Подключить функцию коэффициентов: `GET /cvc/coefficients`.
 *
 * Маршрут отдаёт форму §4 спеки. Ошибка апстрима не превращается в 500:
 * бейджи просто не рисуются, а причина уходит в лог кодом (`CvcApiError.code`),
 * потому что текст ошибки апстрима может содержать что угодно.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx — контекст плагина.
 * @param {object} deps — общие зависимости каркаса (см. `lib/CONTRACT.js`).
 * @returns {() => void} disposer, снимающий маршрут и ожидающие чтения.
 */
export function register(ctx, deps) {
  const reader = createCoefficientsReader(deps.cache)
  const disposeRoute = deps.route(ROUTE_PATH, async (req, res) => {
    if (String(req.method ?? 'GET').toUpperCase() !== 'GET') {
      deps.http.methodNotAllowed(res, ['GET'])
      return
    }

    let result = null
    let failedCode = ''
    try {
      result = await reader.read()
    } catch (error) {
      failedCode = typeof /** @type {any} */ (error)?.code === 'string' ? error.code : 'unavailable'
    }
    if (failedCode.length > 0) {
      deps.log('warn', `coefficients: catalog read failed (${failedCode})`)
    }

    if (result === null) {
      // Снимка ещё нет (или чтение отменено выключением функции): пустой каталог
      // — честный ответ, бейджей не будет, но маршрут не врёт про 200.
      deps.http.sendJson(res, 200, { models: [], providers: [], fetchedAt: null, stale: false })
      return
    }
    deps.http.sendJson(res, 200, coefficientsPayload(result.data, {
      fetchedAt: result.fetchedAt,
      stale: result.stale === true,
    }))
  })

  return () => {
    reader.dispose()
    disposeRoute()
  }
}

/**
 * Описание инструмента функции; у коэффициентов инструмента нет.
 * @param {object} deps
 * @returns {object | null}
 */
export function tool(deps) {
  void deps
  return null
}
