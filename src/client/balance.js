/**
 * Баланс: кнопка в сайдбаре и перетаскиваемая панель с остатком.
 *
 * Кнопка регистрируется в слоте `sidebar.footer.action` (`id: 'cvc-balance'`,
 * `order: 5`) и живёт только пока `features.balance` включён — регистрацию
 * держит `index.js`. Данные приходят с `GET /cvc/balance`; маршрут отвечает
 * 404, когда функция выключена.
 *
 * Панель рисуется внутри того же слота: в DSH нет публичного слота оверлея,
 * а `position: fixed` с `shell.leading` превратил бы панель в кнопку ящика.
 * Поэтому панель позиционируется от слота, но тянется как оверлей.
 *
 * Чистая часть — позиция, прижатие к окну, состояние точки — живёт в
 * `panel-pos.js`, чтобы проверяться без React.
 *
 * @module cvc-catalog-sync-plugin/client/balance
 */

import React from 'react'
import {
  DRAG_THRESHOLD,
  POS_KEY,
  clampPos,
  clearPos,
  dotState,
  formatTime,
  formatUnits,
  loadPos,
  savePos,
} from './panel-pos.js'

const h = React.createElement

export { DRAG_THRESHOLD, POS_KEY, clampPos, clearPos, dotState, formatTime, formatUnits, loadPos, savePos }

/**
 * Панель баланса вместе с кнопкой.
 *
 * Кнопка и панель в одном компоненте: точка состояния отражает последнее
 * чтение без второй регистрации. Кнопка и панель — обычный React внутри
 * слота, поэтому перетаскивание принадлежит плагину, а не харнессу.
 *
 * @param {object} props
 * @param {object} props.store - стор клиентской половины.
 * @param {(key: string) => string} props.t - перевод по ключу.
 */
export function BalanceWidget({ store, t }) {
  const [open, setOpen] = React.useState(false)
  const [data, setData] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [pos, setPos] = React.useState(() => loadPos(globalThis.localStorage))
  const [dragging, setDragging] = React.useState(false)

  const nodeRef = React.useRef(null)
  const dragRef = React.useRef(null)

  const load = React.useCallback(async () => {
    setBusy(true)
    setError('')
    const result = await store.balance()
    setBusy(false)
    if (result.ok) {
      setData(result.body)
    } else {
      setError(result.error)
    }
  }, [store])

  React.useEffect(() => {
    if (open && data === null) void load()
  }, [open, data, load])

  // `balance.refreshSeconds`: 0 — только по кнопке, значение меньше 15 сек
  // хост всё равно поднимает до 15, поэтому здесь повтор включается с 15.
  React.useEffect(() => {
    if (!open) return undefined
    const seconds = Number(store.getState()?.config?.balance?.refreshSeconds)
    if (!Number.isFinite(seconds) || seconds < 15) return undefined
    if (typeof globalThis.setInterval !== 'function') return undefined
    const timer = globalThis.setInterval(() => { void load() }, seconds * 1000)
    return () => globalThis.clearInterval(timer)
  }, [open, store, load])

  /** Прижать текущую позицию к окну. Возвращает тот же объект, если не двигали. */
  const reclamp = React.useCallback((current) => {
    if (current === null) return null
    const node = nodeRef.current
    if (node === null || typeof node.getBoundingClientRect !== 'function') return current
    const rect = node.getBoundingClientRect()
    const viewport = {
      width: globalThis.innerWidth ?? 0,
      height: globalThis.innerHeight ?? 0,
    }
    if (viewport.width === 0 || viewport.height === 0) return current
    const clamped = clampPos(current, rect, viewport)
    return clamped.left === current.left && clamped.top === current.top ? current : clamped
  }, [])

  React.useEffect(() => {
    if (!open) return undefined
    setPos(reclamp)
    const view = globalThis
    if (typeof view.addEventListener !== 'function') return undefined
    const reflow = () => setPos(reclamp)
    view.addEventListener('resize', reflow)
    return () => view.removeEventListener('resize', reflow)
  }, [open, reclamp])

  const endDrag = () => {
    if (dragRef.current === null) return
    dragRef.current = null
    setDragging(false)
  }

  const onPointerDown = (event) => {
    if (event.button !== 0) return
    // Нажатие, начатое на кнопке, — это клик, а не перетаскивание: захват
    // указателя перенаправил бы на себя и `click` кнопки.
    if (typeof event.target?.closest === 'function' && event.target.closest('button') !== null) return
    const node = nodeRef.current
    if (node === null) return
    const rect = node.getBoundingClientRect()
    dragRef.current = {
      startLeft: rect.left,
      startTop: rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Старые браузеры: слушатели на окне доведут перетаскивание.
    }
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (drag === null) return
    if (!drag.moved
      && Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD
      && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return
    const node = nodeRef.current
    if (node === null) return
    dragRef.current = { ...drag, moved: true }
    setDragging(true)
    const next = clampPos(
      { left: drag.startLeft + (event.clientX - drag.startX), top: drag.startTop + (event.clientY - drag.startY) },
      node.getBoundingClientRect(),
      { width: globalThis.innerWidth ?? 0, height: globalThis.innerHeight ?? 0 },
    )
    dragRef.current = { ...dragRef.current, startLeft: next.left, startTop: next.top, startX: event.clientX, startY: event.clientY }
    setPos(next)
  }

  const onPointerUp = (event) => {
    const drag = dragRef.current
    if (drag === null) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ничего отпускать, если браузер не захватывал указатель.
    }
    endDrag()
    // Нажатие без движения — не перетаскивание: позицию не фиксируем, иначе
    // обычный клик тихо выключил бы вёрстку по умолчанию.
    if (!drag.moved) return
    const node = nodeRef.current
    if (node === null) return
    const rect = node.getBoundingClientRect()
    const next = clampPos({ left: rect.left, top: rect.top }, rect, {
      width: globalThis.innerWidth ?? 0,
      height: globalThis.innerHeight ?? 0,
    })
    setPos(next)
    savePos(globalThis.localStorage, next)
  }

  const resetPos = () => {
    dragRef.current = null
    setDragging(false)
    setPos(null)
    clearPos(globalThis.localStorage)
  }

  const providers = Array.isArray(data?.providers) ? data.providers : []
  const state = dotState({ busy, providers, error })

  const button = h('button', {
    type: 'button',
    className: 'cvc2-bal-btn',
    'data-cvc': 'balance-toggle',
    title: t('balanceButton'),
    'aria-expanded': open === true,
    onClick: () => {
      endDrag()
      setOpen((value) => !value)
    },
  },
  h('span', { className: 'cvc2-bal-dot', 'data-state': state, 'data-cvc': 'balance-dot' }),
  h('span', null, t('balanceButton')))

  if (!open) return h('div', { className: 'cvc2-bal-root' }, button)

  const style = pos === null
    ? undefined
    : { left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto', bottom: 'auto' }

  const rows = []
  rows.push(h('div', { className: 'cvc2-bal-head', key: 'head' },
    h('span', { className: 'cvc2-bal-title' }, t('balanceTitle')),
    h('span', { className: 'cvc2-bal-muted' }, busy ? t('balanceLoading') : formatTime(data?.fetchedAt)),
    h('button', {
      type: 'button',
      className: 'cvc2-bal-close',
      title: t('balanceClose'),
      'aria-label': t('balanceClose'),
      onClick: () => {
        endDrag()
        setOpen(false)
      },
    }, '×'),
  ))
  rows.push(h('div', { className: 'cvc2-bal-actions', key: 'actions' },
    h('button', { type: 'button', className: 'cvc2-bal-refresh', disabled: busy, onClick: () => { void load() } }, t('balanceRefresh')),
    h('button', {
      type: 'button',
      className: 'cvc2-bal-reset',
      disabled: pos === null,
      title: t('balanceResetPos'),
      onClick: resetPos,
    }, t('balanceResetPos')),
  ))

  if (error.length > 0) {
    rows.push(h('div', { className: 'cvc2-bal-msg cvc2-bal-bad', key: 'err' }, error))
  }
  if (data?.stale === true) {
    rows.push(h('div', { className: 'cvc2-bal-msg', key: 'stale' }, t('balanceStale')))
  }
  if (providers.length === 0 && !busy && error.length === 0) {
    rows.push(h('div', { className: 'cvc2-bal-muted', key: 'none' }, t('balanceNone')))
  }

  providers.forEach((provider, index) => {
    const card = []
    card.push(h('div', { className: 'cvc2-bal-row', key: 'name' },
      h('span', { className: 'cvc2-bal-title' }, provider?.displayName ?? provider?.provider ?? '—'),
      h('span', { className: 'cvc2-bal-muted' }, provider?.provider ?? ''),
    ))
    if (provider?.baseURL) {
      card.push(h('div', { className: 'cvc2-bal-row cvc2-bal-muted', key: 'url' },
        h('span', null, provider.baseURL),
        h('span', null, provider?.keySet === true ? `${provider?.apiKeyEnv ?? ''} ✓` : t('balanceKeyMissing')),
      ))
    }
    if (provider?.balanceUnits !== null && provider?.balanceUnits !== undefined) {
      card.push(h('div', { className: 'cvc2-bal-row', key: 'bal' },
        h('span', null, t('balanceUnits')),
        h('span', { className: 'cvc2-bal-big' }, formatUnits(provider.balanceUnits)),
      ))
    }
    if (typeof provider?.spentSinceLast === 'number' && provider.spentSinceLast > 0) {
      card.push(h('div', { className: 'cvc2-bal-row cvc2-bal-muted', key: 'spent' },
        h('span', null, t('balanceSpent')),
        h('span', null, formatUnits(provider.spentSinceLast)),
      ))
    }
    if (provider?.balanceError) {
      card.push(h('div', { className: 'cvc2-bal-msg cvc2-bal-bad', key: 'be' }, String(provider.balanceError)))
    }
    rows.push(h('div', { className: 'cvc2-bal-card', key: `card-${index}`, 'data-cvc': 'balance-card' }, card))
  })

  return h('div', { className: 'cvc2-bal-root' },
    button,
    h('div', {
      className: 'cvc2-bal-panel',
      'data-cvc': 'balance-panel',
      'data-dragging': dragging === true,
      style,
      ref: nodeRef,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      title: dragging ? t('balanceRelease') : t('balanceDragHint'),
    }, rows),
  )
}
