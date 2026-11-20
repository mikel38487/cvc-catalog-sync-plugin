/**
 * Чистая часть панели баланса: позиция в `localStorage` и состояние точки.
 *
 * Модуль без React: положение панели и цвет точки проверяются тестом без
 * рендера, а `balance.js` добавляет к ним сам компонент.
 *
 * @module cvc-catalog-sync-plugin/client/panel-pos
 */

/**
 * Ключ `localStorage` с позицией панели.
 *
 * Пространство имён другое, чем в 1.1.0 (`cvc-balance:panel-pos`): панель другая
 * по разметке, и координаты прежней панели могут оказаться за пределами экрана.
 * Новая стартует из угла и запоминает своё.
 */
export const POS_KEY = 'cvc:panel-pos'

/** Насколько должен уехать указатель, чтобы нажатие стало перетаскиванием. */
export const DRAG_THRESHOLD = 4

/** Отступ от края окна при прижатии позиции. */
export const EDGE_MARGIN = 8

/**
 * Прочитать запомненную позицию панели.
 *
 * Чтение защищено: `localStorage` бросает в песочнице, а испорченное значение
 * не должно утянуть панель за собой. Нечисловая координата отбрасывается так
 * же, как отсутствующая.
 *
 * @param {Storage | null | undefined} storage - хранилище.
 * @returns {{left: number, top: number} | null} позиция.
 */
export function loadPos(storage) {
  try {
    const raw = storage?.getItem(POS_KEY)
    if (typeof raw !== 'string' || raw.length === 0) return null
    const parsed = JSON.parse(raw)
    const { left, top } = parsed ?? {}
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null
    return { left, top }
  } catch {
    return null
  }
}

/**
 * Запомнить позицию панели, проглотив отказ хранилища.
 *
 * @param {Storage | null | undefined} storage - хранилище.
 * @param {{left: number, top: number}} pos - позиция.
 * @returns {boolean} удалось ли записать.
 */
export function savePos(storage, pos) {
  try {
    storage?.setItem(POS_KEY, JSON.stringify(pos))
    return true
  } catch {
    return false
  }
}

/**
 * Забыть позицию панели.
 *
 * @param {Storage | null | undefined} storage - хранилище.
 */
export function clearPos(storage) {
  try {
    storage?.removeItem(POS_KEY)
  } catch {
    // Нечего чистить, если хранилище недоступно.
  }
}

/**
 * Прижать позицию к окну, чтобы перетянутую за край панель всегда можно было
 * вернуть назад.
 *
 * @param {{left: number, top: number}} pos - желаемая позиция.
 * @param {{width: number, height: number}} size - размер панели.
 * @param {{width: number, height: number}} viewport - размер окна.
 * @returns {{left: number, top: number}} позиция внутри окна.
 */
export function clampPos(pos, size, viewport) {
  const maxLeft = Math.max(EDGE_MARGIN, viewport.width - size.width - EDGE_MARGIN)
  const maxTop = Math.max(EDGE_MARGIN, viewport.height - size.height - EDGE_MARGIN)
  return {
    left: Math.min(Math.max(pos.left, EDGE_MARGIN), maxLeft),
    top: Math.min(Math.max(pos.top, EDGE_MARGIN), maxTop),
  }
}

/**
 * Состояние точки у кнопки: всё прочитано, прочитано частично, ничего.
 *
 * @param {{busy: boolean, providers: object[] | null, error: string}} input - данные панели.
 * @returns {'' | 'ok' | 'warn' | 'err'} значение `data-state` точки.
 */
export function dotState({ busy, providers, error }) {
  if (busy) return 'warn'
  if (Array.isArray(providers) && providers.length === 0) return error.length > 0 ? 'err' : ''
  if (!Array.isArray(providers)) return ''
  const ok = providers.filter((provider) => provider?.balanceUnits !== null && provider?.balanceUnits !== undefined).length
  if (ok === providers.length) return 'ok'
  return ok > 0 ? 'warn' : 'err'
}

/** Число с разделителями разрядов или прочерк. */
export function formatUnits(value, locale = 'ru-RU') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat(locale).format(value)
  } catch {
    return String(value)
  }
}

/** ISO-время в местные часы, пустая строка при неверном значении. */
export function formatTime(iso, locale = 'ru-RU') {
  if (typeof iso !== 'string' || iso.length === 0) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}
