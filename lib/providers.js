/**
 * Маршруты провайдеров CheapVibeCode в профильном патче.
 *
 * Провайдер узнаётся по `baseURL` из строки `llm-pi-ai`, а не по имени:
 * пользователь вправе назвать маршрут как угодно. Хосты сравниваются с
 * hostname URL, а не подстрокой: `cheapvibecode.ru.evil.com` и
 * `notcheapvibecode.ru` не должны получать ключ и запросы.
 *
 * @module cvc-catalog-sync-plugin/lib/providers
 */

/** Пакет, чья строка патча держит маршруты провайдеров. */
export const LLM_ENTRY_NAME = '@deepseek-ai/dsh-llm-pi-ai'

/**
 * Имя хоста `https`-адреса в нижнем регистре.
 *
 * Только `https`: по этому адресу уходит ключ, и `http` не должен совпадать с
 * шаблоном даже при опечатке в конфигурации.
 * @param {unknown} baseURL
 * @returns {string} имя хоста или пустая строка.
 */
export function hostOf(baseURL) {
  if (typeof baseURL !== 'string' || baseURL.trim().length === 0) return ''
  try {
    const url = new URL(baseURL.trim())
    if (url.protocol !== 'https:') return ''
    return url.hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Совпадает ли hostname с шаблоном хоста.
 *
 * Шаблон `cheapvibecode.ru` покрывает сам хост и его поддомены
 * (`ru.cheapvibecode.ru`), но не строки, где он лишь часть другого хоста.
 * @param {string} host — hostname в нижнем регистре.
 * @param {string} pattern — шаблон хоста из `providers.match`.
 * @returns {boolean}
 */
export function hostMatches(host, pattern) {
  if (typeof host !== 'string' || host.length === 0) return false
  if (typeof pattern !== 'string') return false
  const actual = host.trim().toLowerCase()
  const wanted = pattern.trim().toLowerCase().replace(/^\.+/, '')
  if (actual.length === 0 || wanted.length === 0) return false
  return actual === wanted || actual.endsWith(`.${wanted}`)
}

/**
 * Принадлежит ли `baseURL` одному из разрешённых хостов.
 * @param {unknown} baseURL
 * @param {readonly string[]} patterns
 * @returns {boolean}
 */
export function matchesProvider(baseURL, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return false
  const host = hostOf(baseURL)
  return host.length > 0 && patterns.some((pattern) => hostMatches(host, pattern))
}

/**
 * Совпадает ли id строки с ожидаемым, в том числе с group-префиксом.
 *
 * Строка внутри include-группы получает id вида `include:llm-pi-ai`, поэтому
 * точное сравнение недостаточно.
 * @param {unknown} candidate
 * @param {string} wanted
 * @returns {boolean}
 */
export function rowIdMatches(candidate, wanted) {
  return candidate === wanted || (typeof candidate === 'string' && candidate.endsWith(`:${wanted}`))
}

/**
 * Объект провайдеров из строки патча.
 * @param {{ options?: { config?: unknown } } | undefined} entry
 * @returns {Record<string, any>}
 */
function providersOf(entry) {
  const config = entry?.options?.config
  if (config === null || typeof config !== 'object') return {}
  const providers = /** @type {{ providers?: unknown }} */ (config).providers
  return providers !== null && typeof providers === 'object' && !Array.isArray(providers)
    ? /** @type {Record<string, any>} */ (providers)
    : {}
}

/**
 * Найти строку, которая объявляет маршруты провайдеров.
 *
 * Три попытки, как в прежних плагинах: id строки, имя пакета адаптера и id с
 * group-префиксом. Кандидат принимается, только когда реально несёт
 * `providers`: строка-дубль с `config: {}` не должна заканчивать поиск.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} entryId
 * @returns {{ entry?: any, notes: string[] }}
 */
export function findProviderEntry(ctx, entryId) {
  const notes = []
  const editor = ctx.get?.('configEditor') ?? ctx.configEditor
  if (editor === null || typeof editor !== 'object' || typeof editor.entries !== 'function') {
    return { notes: ['configEditor service is unavailable: provider routes cannot be discovered'] }
  }
  let entries
  try {
    entries = editor.entries() ?? []
  } catch (error) {
    return { notes: [`configEditor entries are unreadable: ${messageOf(error)}`] }
  }
  const wanted = typeof entryId === 'string' && entryId.trim().length > 0 ? entryId.trim() : 'llm-pi-ai'
  // Все кандидаты, а не первый попавшийся: строка-дубль с `config: {}` может
  // стоять в патче раньше настоящей, и `find` по id закончил бы поиск на ней.
  const candidates = [
    ...entries.filter((entry) => entry?.options?.id === wanted),
    ...entries.filter((entry) => entry?.options?.name === LLM_ENTRY_NAME),
    ...entries.filter((entry) => rowIdMatches(entry?.options?.id, wanted)),
  ]
  for (const candidate of candidates) {
    if (Object.keys(providersOf(candidate)).length > 0) return { entry: candidate, notes }
  }
  notes.push(`profile entry "${wanted}" has no provider routes`)
  return { notes }
}

/**
 * Сообщение ошибки без предположения о её типе.
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Все маршруты CheapVibeCode из строки патча.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ providers: { match: string[], entryId: string } }} config — нормализованный конфиг.
 * @returns {Array<{provider: string, displayName: string, baseURL: string, apiKeyEnv: string, api: string, models: unknown[], entryId: string}>}
 */
export function resolveRoutes(ctx, config) {
  const wanted = config?.providers?.entryId ?? 'llm-pi-ai'
  const patterns = Array.isArray(config?.providers?.match) ? config.providers.match : []
  const { entry } = findProviderEntry(ctx, wanted)
  if (entry === undefined) return []
  const providers = providersOf(entry)
  const routes = []
  for (const [provider, raw] of Object.entries(providers)) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const profile = /** @type {Record<string, any>} */ (raw)
    if (!matchesProvider(profile.baseURL, patterns)) continue
    routes.push({
      provider,
      displayName: typeof profile.displayName === 'string' && profile.displayName.trim().length > 0
        ? profile.displayName.trim()
        : provider,
      baseURL: String(profile.baseURL).trim(),
      apiKeyEnv: typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv.trim() : '',
      api: typeof profile.api === 'string' ? profile.api : '',
      models: Array.isArray(profile.models) ? profile.models : [],
      entryId: typeof entry.options?.id === 'string' ? entry.options.id : wanted,
    })
  }
  return routes
}

/**
 * Имя переменной/записи ключа для маршрута: своё имя важнее общего.
 * @param {{ apiKeyEnv?: string } | undefined} route
 * @param {{ providers: { apiKeyEnv: string } }} config
 * @returns {string}
 */
export function apiKeyFor(route, config) {
  const own = typeof route?.apiKeyEnv === 'string' ? route.apiKeyEnv.trim() : ''
  return own.length > 0 ? own : config.providers.apiKeyEnv
}

/**
 * Разрешить ссылку на ключ через сервис credentials.
 *
 * Значение остаётся на хосте: наружу уходит только факт «ключ есть/нет».
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} ref
 * @returns {Promise<string>} ключ или пустая строка, если он не настроен.
 */
export async function resolveKey(ctx, ref) {
  if (typeof ref !== 'string' || ref.trim().length === 0) return ''
  const credentials = ctx.get?.('credentials') ?? ctx.credentials
  if (credentials === null || typeof credentials !== 'object' || typeof credentials.resolve !== 'function') return ''
  try {
    const hit = await credentials.resolve(ref.trim())
    return typeof hit?.value === 'string' ? hit.value : ''
  } catch {
    return ''
  }
}

/**
 * Маршрут по ключу провайдера; если ключа нет — первый найденный.
 * @param {Array<{ provider: string }>} routes
 * @param {string} provider
 * @returns {{ provider: string } | undefined}
 */
export function pickRoute(routes, provider) {
  const wanted = typeof provider === 'string' ? provider.trim() : ''
  return routes.find((route) => route.provider === wanted) ?? routes[0]
}