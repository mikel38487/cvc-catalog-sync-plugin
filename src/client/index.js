/**
 * Клиентская половина cvc-catalog-sync-plugin 2.0.0: три поверхности и
 * переключатель между ними.
 *
 * Что регистрируется:
 *
 * - `settings.section` (id `cvc`, order 25) и `settings.section.icon` — страница
 *   настроек; она существует всегда, это и есть переключатель;
 * - `plugins.bundle.config` (`key: 'cvc-catalog-sync-plugin'`) — тот же блок на
 *   странице плагина, `view: 'summary'` даёт короткую строку;
 * - `sidebar.footer.action` (id `cvc-balance`, order 5) — кнопка и панель
 *   баланса, только при `features.balance`;
 * - наблюдатель `[data-model-id]` и бейджи коэффициентов, только при
 *   `features.coefficients`.
 *
 * Слот `conversation.input.model.label` не занимается: он `single` и уже занят
 * штатным бейджем.
 *
 * Выключение функции снимает её регистрацию сразу, включение возвращает — без
 * перезагрузки страницы. Смена набора функций приходит из стора после
 * `GET /cvc/state` и `PUT /cvc/config`.
 *
 * @module cvc-catalog-sync-plugin/client
 */

import React from 'react'
import { CSS } from './css.js'
import { DICTIONARIES, NS } from './i18n.js'
import { createStore } from './store.js'
import { BundleSummary, NavIcon, SettingsPage } from './settings.js'
import { startCoefficients } from './coefficients.js'
import { BalanceWidget } from './balance.js'

const h = React.createElement

/** Слот кнопки баланса. */
export const BALANCE_SLOT = 'sidebar.footer.action'

/** Позиция страницы в навигации настроек. */
export const SECTION_ORDER = 25

/** Позиция кнопки баланса среди кнопок подвала сайдбара. */
export const BALANCE_ORDER = 5

/** Ключ блока на странице плагина: имя пакета. */
export const BUNDLE_KEY = 'cvc-catalog-sync-plugin'

/**
 * Сервисы, без которых половина не может зарегистрировать ничего.
 *
 * Это Cordis-inject: он и делает `ctx.slots` подключённым свойством. Половина
 * с одним только `apply` получает пустой `ctx.get('slots')`, и регистрация
 * молча исчезает.
 */
export const inject = ['slots', 'locale']

/**
 * Поставить целевое состояние эффекта: функция «включить/выключить».
 *
 * Эффект в Cordis исполняется один раз (`ctx.effect`), поэтому поверхность,
 * которая должна появляться и исчезать по переключателю, держит собственный
 * `enabled` и умеет применять его повторно. Возвращённое — отписка и `stop`.
 *
 * @template {(...args: any[]) => (() => void)} T
 * @param {T} mount - поставить поверхность, вернуть её остановку.
 * @returns {{ set: (enabled: boolean) => void, stop: () => void }} переключатель.
 */
export function createToggle(mount) {
  let dispose = null
  let stopped = false
  return {
    set(enabled) {
      if (stopped) return
      if (enabled === true && dispose === null) {
        dispose = mount() ?? null
      } else if (enabled !== true && dispose !== null) {
        const current = dispose
        dispose = null
        current()
      }
    },
    stop() {
      if (stopped) return
      stopped = true
      if (dispose !== null) {
        const current = dispose
        dispose = null
        current()
      }
    },
  }
}

/**
 * Точка входа клиентской половины.
 *
 * @param {object} ctx - клиентский контекст Cordis.
 * @param {object} [env] - подмена окружения для тестов.
 * @param {Document} [env.document] - документ.
 * @param {typeof fetch} [env.fetch] - `fetch`.
 * @param {object} [env.store] - готовый стор вместо созданного по умолчанию.
 */
export function apply(ctx, env = {}) {
  const documentRef = env.document ?? globalThis.document
  const fetchImpl = env.fetch ?? globalThis.fetch

  // Поверхности по переключателям. Каждая — свой эффект: выключенная функция
  // не должна держать ни регистрации, ни наблюдателя, ни таймера.
  const mounted = []
  const balance = createToggle(() => ctx.slots.inject(BALANCE_SLOT, () => ctx.slots.register({
    name: BALANCE_SLOT,
    id: 'cvc-balance',
    order: BALANCE_ORDER,
    label: () => t('balanceButton'),
  }, () => h(BalanceWidget, { store, t }))))
  const coefficients = createToggle(() => startCoefficients({
    store,
    document: documentRef,
    getRefreshMs: () => {
      const minutes = Number(store.getState().config?.coefficients?.refreshMinutes)
      return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 10 * 60 * 1000
    },
  }))
  mounted.push(balance, coefficients)

  // Набор функций, к которому уже привязаны поверхности. Обновление, не
  // изменившее набор, не трогает регистрации: иначе страница настроек при
  // каждом refresh снимала бы и ставила кнопку баланса заново.
  let applied = null

  /** Поставить или снять поверхности по набору функций. */
  const applyFeatures = (features) => {
    const key = `${features?.balance === true ? 1 : 0}${features?.coefficients === true ? 1 : 0}`
    if (key === applied) return
    applied = key
    balance.set(features?.balance === true)
    coefficients.set(features?.coefficients === true)
  }

  const store = env.store ?? createStore({ fetch: fetchImpl, onFeatures: (features) => applyFeatures(features) })

  ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'cvc: dictionaries')
  const t = ctx.locale.bind(NS)

  // Стили — один тег на весь плагин, внутрь `ctx.effect`: остановка плагина
  // убирает их вместе с поверхностями.
  ctx.effect(() => {
    const style = documentRef.createElement('style')
    style.dataset.plugin = BUNDLE_KEY
    style.textContent = CSS
    documentRef.head.appendChild(style)
    return () => style.remove()
  }, 'cvc: styles')

  // Страница настроек существует всегда: это переключатель, у которого нет
  // второго места управления.
  ctx.effect(() => ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon',
    id: NS,
  }, (owner = {}) => h(NavIcon, { size: owner.size ?? 16 }))), 'cvc: settings icon')

  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: NS,
    order: SECTION_ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ t, store }),
  }, (owner = {}) => h(SettingsPage, { ...owner, t, store }))), 'cvc: settings section')

  ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: BUNDLE_KEY,
    locale: NS,
    inject: () => ({ t, store }),
  }, (owner = {}) => (owner.view === 'summary'
    ? h(BundleSummary, { t })
    : h(SettingsPage, { ...owner, t, store, embedded: true })))), 'cvc: bundle block')

  ctx.effect(() => {
    applyFeatures(store.getState().features)
    const off = store.subscribe((next) => applyFeatures(next.features))
    const pending = store.refresh()
    if (pending !== null && typeof pending.catch === 'function') pending.catch(() => {})
    return () => {
      off()
      for (const toggle of mounted) toggle.stop()
    }
  }, 'cvc: feature surfaces')

  return { store }
}

export { createStore, CSS, DICTIONARIES, NS }