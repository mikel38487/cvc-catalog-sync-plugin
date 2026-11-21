/**
 * Коэффициенты: бейдж `×N` рядом с именем модели в выборе модели.
 *
 * Слот `conversation.input.model.label` не занимается. Он один на всех
 * (`single`), и его уже держит штатный бейдж. Вместо замены селектор сам
 * помечает имя атрибутами `data-provider-id` и `data-model-id`, поэтому бейдж
 * дописывается в эту обёртку наблюдателем. Клики, поиск и выбор остаются у
 * селектора.
 *
 * Данные приходят с `GET /cvc/coefficients` хоста. Маршрут отвечает 404, когда
 * функция выключена, — поверхность к этому готова и просто не рисует бейджи.
 *
 * @module cvc-catalog-sync-plugin/client/coefficients
 */

import { CSS } from './css.js'

/** Атрибут, по которому бейдж находит свой узел и не дублируется. */
export const BADGE_ATTR = 'data-cvc2-coeff'

/**
 * Карта коэффициентов и список провайдеров из ответа маршрута.
 *
 * Записи без числового множителя отбрасываются: бейдж «×(нет)» бессмыслен.
 *
 * @param {unknown} payload - тело `GET /cvc/coefficients`.
 * @returns {{ models: Map<string, {id: string, multiplier: number, fastMultiplier: number | null}>, providers: string[] }} карта.
 */
export function indexPayload(payload) {
  const raw = Array.isArray(payload?.models) ? payload.models : []
  const models = new Map()
  for (const model of raw) {
    if (typeof model?.id !== 'string' || model.id.length === 0) continue
    if (!Number.isFinite(model.multiplier)) continue
    models.set(model.id, {
      id: model.id,
      multiplier: model.multiplier,
      fastMultiplier: Number.isFinite(model.fastMultiplier) ? model.fastMultiplier : null,
    })
  }
  const providers = Array.isArray(payload?.providers)
    ? payload.providers.filter((id) => typeof id === 'string' && id.length > 0)
    : []
  return { models, providers }
}

/** Сколько знаков после запятой показывается полностью. */
const SHOWN_DECIMALS = 3

/**
 * Значение огрублённое до `SHOWN_DECIMALS` знаков.
 *
 * Экспоненциальную запись (`1e-7`) раскладываем в обычную десятичную:
 * бейдж должен читаться как число, а не как степень.
 * @param {number} value
 * @returns {string} например `0.001`, `2.5`, `10`.
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
 * Подпись множителя для бейджа и подсказки.
 *
 * До трёх знаков после запятой — точное значение: `×1`, `×0.1`, `×0.001`.
 * Если значение точнее, оно не округляется в «похожее» число, а показывается
 * огрублённым с тильдой: `0.125` → `×~0.125`, `0.0005` → `×~0.001` (иначе
 * `×0` врал бы: модель не бесплатная).
 *
 * @param {number} value - множитель.
 * @returns {string} подпись бейджа; пустая строка для нечисла.
 */
export function formatMultiplier(value) {
  if (!Number.isFinite(value)) return ''
  const exact = Number(value.toFixed(10))
  const rounded = Number(value.toFixed(SHOWN_DECIMALS))
  const shown = plainNumber(rounded)
  const approximate = Math.abs(exact - rounded) > 1e-9
  return `×${approximate ? '~' : ''}${shown}`
}

/** Класс цены по тем же порогам, что и заметка в Obsidian. */
export function tierOf(multiplier) {
  if (multiplier <= 0.5) return 'cheap'
  if (multiplier <= 1.5) return 'mid'
  if (multiplier <= 4) return 'pricey'
  return 'expensive'
}

/**
 * Подсказка бейджа: множитель цены и, если разрешено, быстрый режим.
 *
 * @param {{multiplier: number, fastMultiplier: number | null}} entry - запись коэффициента.
 * @param {boolean} showFast - добавлять ли вторую строку.
 * @returns {string} текст `title`.
 */
export function badgeHint(entry, showFast) {
  const lines = [formatMultiplier(entry.multiplier)]
  if (showFast === true && entry.fastMultiplier !== null) lines.push(`fast ${formatMultiplier(entry.fastMultiplier)}`)
  return lines.join(' · ')
}

/**
 * Расставить бейджи по уже нарисованным именам моделей.
 *
 * Идемпотентна: повторный вызов на том же дереве не добавляет второй бейдж.
 * Бейдж ставится только строке провайдера, который отдал каталог: одинаковый
 * id у чужого провайдера остаётся без коэффициента. Если `data-provider-id`
 * нет, бейдж не ставится — угадывать провайдера нельзя.
 *
 * Узел без известного коэффициента остаётся без нового бейджа, а уже стоящий
 * бейдж снимается: каталог мог обновиться и модель из него ушла.
 *
 * @param {ParentNode} root - корень, в котором ищем строки моделей.
 * @param {{models: Map<string, object>, providers: string[]}} index - карта.
 * @param {{showFast?: boolean}} [options] - настройки подписи.
 * @returns {number} сколько бейджей стоит после прохода.
 */
export function decorate(root, index, options = {}) {
  const names = typeof root?.querySelectorAll === 'function' ? root.querySelectorAll('[data-model-id]') : []
  const allowed = new Set(index.providers.map((id) => String(id).toLowerCase()))
  let placed = 0
  for (const node of names) {
    const providerId = node.getAttribute('data-provider-id')
    const allowedProvider = providerId !== null && allowed.has(providerId.toLowerCase())
    const modelId = node.getAttribute('data-model-id')
    const found = allowedProvider && typeof modelId === 'string' ? index.models.get(modelId) ?? null : null
    const existing = node.querySelector(`[${BADGE_ATTR}]`)
    if (found === null) {
      existing?.remove()
      continue
    }
    const badge = existing ?? node.ownerDocument.createElement('span')
    badge.setAttribute(BADGE_ATTR, '')
    badge.className = 'cvc2-badge'
    badge.dataset.tier = tierOf(found.multiplier)
    badge.textContent = formatMultiplier(found.multiplier)
    badge.title = badgeHint(found, options.showFast !== false)
    if (existing === null) node.appendChild(badge)
    placed += 1
  }
  return placed
}

/** Снять все бейджи с дерева. */
export function clearBadges(root) {
  if (typeof root?.querySelectorAll !== 'function') return
  for (const badge of root.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove()
}

/**
 * Следить за селектором и дописывать коэффициенты по мере отрисовки строк.
 *
 * Меню селектора рисуется порталом вне корня слота, поэтому наблюдается весь
 * документ. Пропускаются только мутации внутри самого бейджа: иначе наблюдатель
 * зациклится на собственной записи. Добавление и удаление бейджа снаружи —
 * обычная причина перерисовать; `decorate` идемпотентна.
 *
 * Кадр откладывается до `requestAnimationFrame`: список моделей перерисовывается
 * при каждом нажатии клавиши в поиске, и синхронный проход на каждую мутацию
 * складывал бы лишние.
 *
 * @param {Document} documentRef - документ.
 * @param {() => { index: {models: Map<string, object>, providers: string[]}, showFast: boolean }} getState - текущее состояние.
 * @returns {() => void} остановка наблюдения; бейджи при этом снимаются.
 */
export function watch(documentRef, getState) {
  let scheduled = false
  let stopped = false

  const run = () => {
    scheduled = false
    if (stopped) return
    const state = getState()
    decorate(documentRef, state.index, { showFast: state.showFast })
  }

  const schedule = () => {
    if (scheduled || stopped) return
    scheduled = true
    const view = documentRef.defaultView
    if (view !== null && view !== undefined && typeof view.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(run)
    } else {
      run()
    }
  }

  const target = documentRef.body ?? documentRef.documentElement
  const Observer = globalThis.MutationObserver
  if (typeof Observer !== 'function' || target === null || target === undefined) {
    // Окружение без MutationObserver (старый браузер, тестовый двойник):
    // коэффициенты ставим один раз по текущему дереву и не следим дальше.
    run()
    return () => {
      stopped = true
      clearBadges(documentRef)
    }
  }

  const observer = new Observer((records) => {
    for (const record of records) {
      const node = record.target
      if (typeof node?.closest === 'function' && node.closest(`[${BADGE_ATTR}]`) !== null) continue
      schedule()
      return
    }
  })
  observer.observe(target, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-model-id'],
  })
  schedule()
  return () => {
    stopped = true
    observer.disconnect()
    scheduled = false
    clearBadges(documentRef)
  }
}

/**
 * Подключить наблюдатель на время жизни плагина.
 *
 * Вызывается из `index.js` внутри `ctx.effect` и только пока
 * `features.coefficients` включён: возвращённая функция ставит наблюдение и
 * таймер, а возвращаемое ей замыкание снимает всё вместе с бейджами. Стили
 * ставит `index.js` один раз на весь плагин — здесь их дублировать не нужно.
 *
 * @param {object} deps
 * @param {object} deps.store - стор клиентской половины.
 * @param {Document} deps.document - документ браузера.
 * @param {() => number} [deps.getRefreshMs] - период повторного чтения, мс.
 * @returns {() => void} остановка.
 */
export function startCoefficients({ store, document: documentRef, getRefreshMs }) {
  let index = { models: new Map(), providers: [] }
  let showFast = true
  let stopped = false
  let timer = 0
  let lastLoad = 0

  /** Период опроса по текущему конфигу: 10 минут, если хост не сказал иного. */
  const period = () => {
    const requested = typeof getRefreshMs === 'function' ? getRefreshMs() : 0
    return Number.isFinite(requested) && requested > 0 ? Math.max(1000, requested) : 10 * 60 * 1000
  }

  const reload = async () => {
    lastLoad = Date.now()
    const result = await store.coefficients()
    if (stopped || !result.ok) return
    index = indexPayload(result.body)
    showFast = store.getState()?.config?.coefficients?.showFast !== false
    decorate(documentRef, index, { showFast })
  }

  const stopWatch = watch(documentRef, () => ({ index, showFast }))
  void reload()
  const view = documentRef.defaultView
  if (view !== null && view !== undefined && typeof view.setInterval === 'function') {
    // Проверяем раз в минуту, а не спим ровно `refreshMinutes`: настройку можно
    // поменять в форме, не перемонтируя поверхность.
    timer = view.setInterval(() => {
      if (Date.now() - lastLoad >= period()) void reload()
    }, Math.min(period(), 60000))
  }

  return () => {
    stopped = true
    if (timer !== 0) view.clearInterval(timer)
    stopWatch()
  }
}