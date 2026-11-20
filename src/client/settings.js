/**
 * Страница настроек плагина: три переключателя функций и группы параметров.
 *
 * Разметка выросла из страницы 1.0.0: те же поля, тот же порядок кнопок и тот
 * же блок «последний прогон». Добавлены переключатели функций, поэтому страница
 * одновременно и настройка, и единственный выключатель плагина.
 *
 * Данные страница берёт только из стора (`GET /cvc/state`, ответ
 * `PUT /cvc/config`); своих запросов она не делает.
 *
 * @module cvc-catalog-sync-plugin/client/settings
 */

import React from 'react'
import {
  FEATURE_ITEMS,
  GROUPS,
  FIELD_LIST,
  createDraft,
  defaultsDraft,
  draftToConfig,
  fieldsOfGroup,
  isDirty,
  validateDraft,
  withFeature,
  withField,
} from './config-form.js'

const h = React.createElement

/** Текст ошибки из исключения. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Поле формы: подпись, подсказка и контрол. */
function Field({ label, hint, children }) {
  return h('div', { className: 'cvc2-field' },
    h('div', null,
      h('div', { className: 'cvc2-label' }, label),
      hint ? h('div', { className: 'cvc2-hint' }, hint) : null,
    ),
    h('div', { className: 'cvc2-control' }, children),
  )
}

/** Текстовая строка. */
function TextInput({ value, onChange, placeholder }) {
  return h('input', {
    type: 'text',
    value: value ?? '',
    placeholder,
    spellCheck: false,
    autoComplete: 'off',
    onChange: (event) => onChange(event.target.value),
  })
}

/** Числовое поле: пустое значение не ломает форму, а уходит в проверку. */
function NumberInput({ value, onChange, min, max, step }) {
  return h('input', {
    type: 'number',
    value: Number.isFinite(value) ? String(value) : '',
    min,
    max,
    step,
    onChange: (event) => {
      const raw = event.target.value
      onChange(raw === '' ? Number.NaN : Number(raw))
    },
  })
}

/** Список строк: по одной на строку, как в 1.0.0. */
function ListInput({ value, onChange }) {
  return h('textarea', {
    value: Array.isArray(value) ? value.join('\n') : '',
    spellCheck: false,
    onChange: (event) => onChange(event.target.value.split('\n').map((line) => line.trim()).filter(Boolean)),
  })
}

/**
 * Переключатель с ролью `switch`.
 *
 * `aria-checked` обязателен: без него экранный диктор читает кнопку как
 * «кнопка», а не как «переключатель, включено/выключено».
 */
function Switch({ checked, onChange, label, feature }) {
  return h('div', { className: 'cvc2-row' },
    h('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': checked === true,
      'aria-label': label,
      className: 'cvc2-switch',
      'data-on': checked === true,
      'data-feature': feature,
      onClick: () => onChange(checked !== true),
    }),
    h('span', { className: 'cvc2-muted' }, checked === true ? label : ' '),
  )
}

/** Список как одна строка, без пустых значений. */
function joinList(list) {
  return Array.isArray(list) && list.length > 0 ? list.join(', ') : ''
}

/**
 * Итог последнего прогона.
 *
 * Поля проверяются по одному: ответ мог прийти от прежней версии хоста или
 * быть неполным, и тогда блок не должен падать на `undefined.length`.
 */
export function StatusBlock({ t, value }) {
  if (value === null || value === undefined) return null
  const lines = []
  const added = Array.isArray(value.added) ? value.added : []
  const removed = Array.isArray(value.removed) ? value.removed : []
  const changed = Array.isArray(value.changed) ? value.changed : []
  const warnings = Array.isArray(value.warnings) ? value.warnings : []
  const allowlist = value.allowlist !== null && typeof value.allowlist === 'object' ? value.allowlist : {}
  const allowlistAdded = Array.isArray(allowlist.added) ? allowlist.added : []
  const allowlistPruned = Array.isArray(allowlist.pruned) ? allowlist.pruned : []

  lines.push(h('div', { className: 'cvc2-line', key: 'counts' },
    h('span', null, h('b', null, t('catalogCount')), ` ${value.catalogModels ?? '—'}`),
    h('span', null, h('b', null, t('currentCount')), ` ${value.currentModels ?? '—'}`),
    h('span', null, h('b', null, t('nextCount')), ` ${value.nextModels ?? '—'}`),
    h('span', null, h('b', null, t('levels')), ' ', h('span', { className: 'cvc2-mono' }, value.levelsSource || '—')),
  ))
  const empty = added.length === 0 && removed.length === 0 && changed.length === 0
  lines.push(h('div', { className: empty ? 'cvc2-ok' : '', key: 'diff' },
    empty ? t('noDiff') : [
      added.length ? `${t('added')}: ${joinList(added)}` : '',
      removed.length ? `${t('removed')}: ${joinList(removed)}` : '',
      changed.length
        ? `${t('changed')}: ${changed.map((row) => `${row?.id ?? '?'} (${joinList(row?.fields)})`).join(', ')}`
        : '',
    ].filter(Boolean).join(' · '),
  ))
  if (allowlistAdded.length > 0) {
    lines.push(h('div', { key: 'al-add' }, `${t('allowlistAdded')}: ${joinList(allowlistAdded)}`))
  }
  if (allowlistPruned.length > 0) {
    lines.push(h('div', { key: 'al-prune' }, `${t('allowlistPruned')}: ${joinList(allowlistPruned)}`))
  }
  for (const [index, warning] of warnings.entries()) {
    lines.push(h('div', { className: 'cvc2-warn', key: `warn-${index}` }, String(warning)))
  }
  if (value.error) {
    lines.push(h('div', { className: 'cvc2-error', key: 'error' }, `${t('runError')}: ${value.error}`))
  }
  if (value.at) {
    lines.push(h('div', { className: 'cvc2-muted', key: 'at' }, String(value.at)))
  }
  if (value.applied === true) {
    lines.push(h('div', { className: 'cvc2-ok', key: 'applied' }, '✓'))
  }
  return h('div', { className: 'cvc2-status', 'data-cvc': 'status' }, h('h3', null, t('statusTitle')), ...lines)
}

/** Короткая строка для страницы плагина: там под форму нет места. */
export function BundleSummary({ t }) {
  return h('span', { className: 'cvc2-muted' }, t('summary'))
}

/** Значок секции в навигации настроек: каталог, коэффициент и баланс вместе. */
export function NavIcon({ size = 16 }) {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    'aria-hidden': true,
    style: { display: 'block' },
  },
  h('path', { d: 'M14 16h22a8 8 0 0 1 8 8v4', fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round' }),
  h('path', { d: 'M46 24h4v26H22', fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  h('path', { d: 'M14 16v32h14', fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  h('path', { d: 'M36 40h6', fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round' }),
  h('path', { d: 'M26 34h8', fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round' }),
  )
}

/** Контрол поля по его виду. */
function Control({ field, draft, t, setValue }) {
  const value = draft.values[field.id]
  if (field.kind === 'switch') {
    return h(Switch, {
      checked: value === true,
      label: t(field.labelKey),
      onChange: (next) => setValue(field.id, next),
    })
  }
  if (field.kind === 'number') {
    return h(NumberInput, {
      value,
      min: field.min,
      max: field.max,
      step: field.step,
      onChange: (next) => setValue(field.id, next),
    })
  }
  if (field.kind === 'list') {
    return h(ListInput, { value, onChange: (next) => setValue(field.id, next) })
  }
  return h(TextInput, { value, onChange: (next) => setValue(field.id, next) })
}

/** Человеческое описание ошибок проверки. */
function describeErrors(t, errors) {
  return errors.map((error) => {
    const field = FIELD_LIST.find((item) => item.id === error.field)
    const label = field === undefined ? error.field : t(field.labelKey)
    return `${label}: ${t(error.code)}`
  }).join('; ')
}

/**
 * Страница настроек.
 *
 * @param {object} props
 * @param {(key: string) => string} props.t - перевод по ключу словаря.
 * @param {object} props.store - стор клиентской половины.
 * @param {boolean} [props.embedded] - блок на странице плагина, без описания.
 */
export function SettingsPage({ t, store, embedded = false }) {
  const [snapshot, setSnapshot] = React.useState(() => store.getState())
  const [draft, setDraft] = React.useState(() => createDraft(snapshot.config, snapshot.features))
  const [busy, setBusy] = React.useState('')
  const [note, setNote] = React.useState(null)
  const [run, setRun] = React.useState(null)
  const [confirming, setConfirming] = React.useState(false)

  // Стор обновляется извне (первая загрузка, сохранение, чужой refresh).
  // Черновик не перезаписывается, пока в нём есть несохранённые правки.
  React.useEffect(() => {
    const off = store.subscribe((next) => setSnapshot(next))
    return () => off()
  }, [store])

  React.useEffect(() => {
    if (isDirty(draft, snapshot.config, snapshot.features)) return
    setDraft(createDraft(snapshot.config, snapshot.features))
  }, [snapshot.config, snapshot.features])

  const setValue = React.useCallback((fieldId, value) => {
    setDraft((current) => withField(current, fieldId, value))
  }, [])

  const dirty = isDirty(draft, snapshot.config, snapshot.features)
  const disabled = busy !== ''

  const onSave = React.useCallback(async () => {
    const errors = validateDraft(draft)
    if (errors.length > 0) {
      setNote({ kind: 'error', text: `${t('errFields')}: ${describeErrors(t, errors)}` })
      return
    }
    setBusy('save')
    setNote(null)
    try {
      await store.save(draftToConfig(draft, snapshot.config))
      const next = store.getState()
      setSnapshot(next)
      setDraft(createDraft(next.config, next.features))
      setNote({ kind: 'ok', text: t('saved') })
    } catch (error) {
      setNote({ kind: 'error', text: `${t('errSave')}: ${messageOf(error)}` })
    } finally {
      setBusy('')
    }
  }, [draft, snapshot.config, store, t])

  const onRun = React.useCallback(async (action) => {
    setBusy(action)
    setNote(null)
    setConfirming(false)
    try {
      const value = await store.run(action)
      setRun(value)
      setSnapshot(store.getState())
      if (value?.ok === true) {
        setNote({ kind: 'ok', text: action === 'apply' ? t('applied') : t('checked') })
      } else {
        setNote({ kind: 'error', text: `${t('runError')}: ${value?.error ?? ''}` })
      }
    } catch (error) {
      setNote({ kind: 'error', text: `${t('errRun')}: ${messageOf(error)}` })
    } finally {
      setBusy('')
    }
  }, [store, t])

  const onReset = React.useCallback(() => {
    setDraft(defaultsDraft())
    setNote({ kind: 'warn', text: t('resetDone') })
  }, [t])

  if (snapshot.config === null) {
    return h('div', { className: 'cvc2-page', 'data-cvc': 'page' },
      h(embedded ? 'h3' : 'h2', { className: embedded ? 'cvc2-embedded-title' : undefined }, t('title')),
      h('p', { className: 'cvc2-desc' }, note?.text ?? (snapshot.error ? `${t('errLoad')}: ${snapshot.error}` : t('loading'))),
    )
  }

  const status = run ?? snapshot.lastRun ?? snapshot.status
  const groups = GROUPS.map((group) => {
    const fields = fieldsOfGroup(group.id)
    if (fields.length === 0) return null
    return h('div', { className: 'cvc2-group', 'data-group': group.id, key: group.id },
      h('h3', null, t(group.titleKey)),
      fields.map((field) => h(Field, {
        label: t(field.labelKey),
        hint: t(field.hintKey),
        key: field.id,
      }, h('div', { 'data-field': field.id },
        h(Control, { field, draft, t, setValue })))),
    )
  })

  return h('div', { className: 'cvc2-page', 'data-cvc': 'page' },
    h(embedded ? 'h3' : 'h2', { className: embedded ? 'cvc2-embedded-title' : undefined }, t('title')),
    embedded ? null : h('p', { className: 'cvc2-desc' }, t('desc')),

    h('div', { className: 'cvc2-group', 'data-group': 'features', key: 'features' },
      h('h3', null, t('groupFeatures')),
      h('p', { className: 'cvc2-features-note' }, t('featuresNote')),
      FEATURE_ITEMS.map((item) => h(Field, {
        label: t(item.labelKey),
        hint: t(item.hintKey),
        key: item.key,
      }, h('div', { 'data-field': `feature.${item.key}` },
        h(Switch, {
          checked: draft.features[item.key] === true,
          feature: item.key,
          label: t(item.labelKey),
          onChange: (next) => setDraft((current) => withFeature(current, item.key, next)),
        })))),
    ),

    ...groups,

    h(StatusBlock, { t, value: status, key: 'status' }),

    h('div', { className: 'cvc2-actions', 'data-cvc': 'actions', key: 'actions' },
      h('button', {
        type: 'button',
        className: 'cvc2-btn',
        'data-primary': true,
        'data-action': 'save',
        disabled: disabled || !dirty,
        onClick: onSave,
      }, busy === 'save' ? t('saving') : t('save')),
      h('button', {
        type: 'button',
        className: 'cvc2-btn',
        'data-action': 'check',
        disabled,
        onClick: () => onRun('plan'),
      }, busy === 'plan' ? t('checking') : t('check')),
      h('button', {
        type: 'button',
        className: 'cvc2-btn',
        'data-action': 'apply',
        disabled,
        onClick: () => setConfirming(true),
      }, busy === 'apply' ? t('applying') : t('apply')),
      h('button', {
        type: 'button',
        className: 'cvc2-btn',
        'data-action': 'reset',
        disabled,
        onClick: onReset,
      }, t('reset')),
      h('span', { className: 'cvc2-note', 'data-kind': note?.kind ?? '', 'data-cvc': 'note' }, note?.text ?? ''),
    ),

    confirming ? h('div', { className: 'cvc2-status', key: 'confirm' },
      h('div', null, t('confirmApply')),
      h('div', { className: 'cvc2-actions', style: { marginTop: '8px' } },
        h('button', { type: 'button', className: 'cvc2-btn', 'data-primary': true, onClick: () => onRun('apply') }, t('confirmYes')),
        h('button', { type: 'button', className: 'cvc2-btn', onClick: () => setConfirming(false) }, t('confirmNo')),
      ),
    ) : null,

    h('p', { className: 'cvc2-hint', key: 'dirty' },
      [
        t('checkUsesSaved'),
        dirty ? `${t('dirty')}` : '',
        snapshot.configShape === 'legacy' ? t('legacyHint') : '',
      ].filter(Boolean).join(' · ')),
    h('p', { className: 'cvc2-hint cvc2-mono', key: 'patch', 'data-cvc': 'patch' },
      `${t('patch')}: ${snapshot.patchPath || '—'}`),
  )
}
