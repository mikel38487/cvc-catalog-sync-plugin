/**
 * Клиентская половина cvc-catalog-sync-plugin: страница настроек.
 *
 * Регистрирует секцию `settings.section` (и её иконку) в панели настроек DSH.
 * Значения читаются и пишутся через HTTP-маршрут хост-половины
 * `/cvc-catalog-sync`: браузер не получает ключ и не пишет патч сам.
 *
 * @module cvc-catalog-sync-plugin/client
 */
window.__ModuleLoader__.load({
  id: 'cvc-catalog-sync-plugin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    /** Пространство имён локали и id секции настроек. */
    const NS = 'cvc-catalog-sync'
    /** Префикс маршрута хост-половины. */
    const API = '/cvc-catalog-sync'
    /** Позиция секции в навигации настроек. */
    const ORDER = 25
    /** Имя пакета бандла: ключ блока на странице плагина в разделе «Плагины». */
    const BUNDLE_NAME = 'cvc-catalog-sync-plugin'

    const EN = {
      nav: 'CVC catalog',
      title: 'CVC catalog sync',
      summary: 'Model catalog sync for the CheapVibeCode route.',
      desc: 'Keeps the CheapVibeCode model list in the profile patch in sync with /v1/models and with the reasoning levels published by the official installer.',
      groupMain: 'Connection',
      groupSync: 'Synchronization',
      groupAdvanced: 'Advanced',
      provider: 'Provider route',
      providerHint: 'Route key inside llm-pi-ai.providers.',
      baseURL: 'API base URL',
      baseURLHint: 'The models request goes to {baseURL}/models.',
      apiKeyEnv: 'Credential name',
      apiKeyEnvHint: 'Name of the variable; the key itself never enters this page.',
      autoSync: 'Automatic sync',
      autoSyncHint: 'Fetch at startup and on the interval; writes only on a real difference.',
      intervalHours: 'Interval, hours',
      intervalHoursHint: '0 turns the timer off; anything below a minute is raised to a minute.',
      startupDelayMs: 'Startup delay, ms',
      startupDelayMsHint: 'Pause after activation before the first run.',
      syncAllowlist: 'Sync subagent list',
      syncAllowlistHint: 'Keep subagent-model-selection-settings.allowedModels aligned with this route.',
      minModelRatio: 'Catalog shrink guard',
      minModelRatioHint: 'Refuse a catalog smaller than this share of the current model count (0 to 1).',
      entryId: 'Profile row',
      entryIdHint: 'Patch row that owns the provider routes.',
      allowlistEntryId: 'Allowlist row',
      allowlistEntryIdHint: 'Patch row that stores allowedModels.',
      installerUrls: 'Installer URLs',
      installerUrlsHint: 'One URL per line; the first reachable one provides reasoning levels.',
      keepModels: 'Keep model ids',
      keepModelsHint: 'One id per line; kept even when the catalog drops it.',
      levelsCacheMinutes: 'Levels cache, minutes',
      levelsCacheMinutesHint: 'How long the reasoning-level map is reused.',
      timeoutMs: 'Request timeout, ms',
      timeoutMsHint: 'Timeout for one catalog or installer request.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Settings saved.',
      check: 'Check catalog',
      checking: 'Checking…',
      checked: 'Catalog checked; nothing was written.',
      apply: 'Apply catalog',
      applying: 'Applying…',
      confirmApply: 'Write the catalog into the profile patch now?',
      confirmYes: 'Yes, apply',
      confirmNo: 'Cancel',
      reset: 'Reset to defaults',
      resetDone: 'Defaults restored in the form; press Save to remove the override.',
      statusTitle: 'Last run',
      never: 'No run in this process yet.',
      catalog: 'Catalog',
      current: 'Current',
      next: 'Next',
      levels: 'Levels',
      noDiff: 'No differences',
      added: 'Added',
      removed: 'Removed',
      changed: 'Changed',
      allowlistAdded: 'Allowlist added',
      allowlistPruned: 'Allowlist pruned',
      warnings: 'Warnings',
      runError: 'Error',
      patch: 'Patch',
      inactive: 'The plugin row is not active; saving is disabled until the bundle is enabled.',
      dirty: 'Unsaved changes',
      checkUsesSaved: 'Check and apply use the saved settings.',
      errLoad: 'Could not read settings',
      errSave: 'Could not save settings',
      errRun: 'Run failed',
      loading: 'Loading…',
      switchOn: 'On',
      switchOff: 'Off',
    }

    const RU = {
      nav: 'Каталог CVC',
      title: 'Синхронизация каталога CVC',
      summary: 'Синхронизация каталога моделей маршрута CheapVibeCode.',
      desc: 'Держит список моделей CheapVibeCode в профильном патче в соответствии с /v1/models и с уровнями мышления из официального установщика.',
      groupMain: 'Подключение',
      groupSync: 'Синхронизация',
      groupAdvanced: 'Дополнительно',
      provider: 'Маршрут провайдера',
      providerHint: 'Ключ маршрута в llm-pi-ai.providers.',
      baseURL: 'Базовый адрес API',
      baseURLHint: 'Запрос моделей идёт на {baseURL}/models.',
      apiKeyEnv: 'Имя ключа',
      apiKeyEnvHint: 'Имя переменной; сам ключ на страницу не попадает.',
      autoSync: 'Автоматическая синхронизация',
      autoSyncHint: 'Забирать каталог при старте и по интервалу; писать только при реальной разнице.',
      intervalHours: 'Интервал, часов',
      intervalHoursHint: '0 выключает таймер; значения меньше минуты поднимаются до минуты.',
      startupDelayMs: 'Задержка старта, мс',
      startupDelayMsHint: 'Пауза после активации перед первым прогоном.',
      syncAllowlist: 'Синхронизировать список сабагентов',
      syncAllowlistHint: 'Держать subagent-model-selection-settings.allowedModels в соответствии с маршрутом.',
      minModelRatio: 'Защита от усыхания каталога',
      minModelRatioHint: 'Не принимать каталог меньше этой доли от текущего числа моделей (0…1).',
      entryId: 'Строка профиля',
      entryIdHint: 'Строка патча, которой принадлежат маршруты провайдеров.',
      allowlistEntryId: 'Строка списка',
      allowlistEntryIdHint: 'Строка патча, где лежит allowedModels.',
      installerUrls: 'Адреса установщиков',
      installerUrlsHint: 'По одному на строку; уровни берутся из первого доступного.',
      keepModels: 'Сохранять модели',
      keepModelsHint: 'По одному id на строку; сохраняются, даже если каталог их убрал.',
      levelsCacheMinutes: 'Кэш уровней, минут',
      levelsCacheMinutesHint: 'Сколько времени переиспользуется карта уровней.',
      timeoutMs: 'Таймаут запроса, мс',
      timeoutMsHint: 'Таймаут одного запроса каталога или установщика.',
      save: 'Сохранить',
      saving: 'Сохраняю…',
      saved: 'Настройки сохранены.',
      check: 'Проверить каталог',
      checking: 'Проверяю…',
      checked: 'Каталог проверен, ничего не записано.',
      apply: 'Применить каталог',
      applying: 'Применяю…',
      confirmApply: 'Записать каталог в профильный патч сейчас?',
      confirmYes: 'Да, применить',
      confirmNo: 'Отмена',
      reset: 'Сбросить к умолчаниям',
      resetDone: 'Умолчания подставлены в форму; нажмите «Сохранить», чтобы убрать переопределение.',
      statusTitle: 'Последний прогон',
      never: 'В этом процессе прогонов ещё не было.',
      catalog: 'Каталог',
      current: 'Сейчас',
      next: 'Будет',
      levels: 'Уровни',
      noDiff: 'Различий нет',
      added: 'Добавлено',
      removed: 'Удалено',
      changed: 'Изменено',
      allowlistAdded: 'В список добавлено',
      allowlistPruned: 'Из списка убрано',
      warnings: 'Предупреждения',
      runError: 'Ошибка',
      patch: 'Патч',
      inactive: 'Строка плагина не активна; сохранение недоступно, пока бандл не включён.',
      dirty: 'Есть несохранённые изменения',
      checkUsesSaved: 'Проверка и применение используют сохранённые настройки.',
      errLoad: 'Не удалось прочитать настройки',
      errSave: 'Не удалось сохранить настройки',
      errRun: 'Прогон не удался',
      loading: 'Загружаю…',
      switchOn: 'Вкл',
      switchOff: 'Выкл',
    }

    const CSS = `
.cvc-sync { display: flex; flex-direction: column; gap: 14px; max-width: 780px; padding: 4px 2px 28px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.45; }
.cvc-sync h2 { margin: 0; font-size: 16px; font-weight: 600; }
.cvc-sync .cvc-sync-embedded-title { margin: 0; font-size: 14px; font-weight: 600; }
@media (max-width: 560px) { .cvc-sync .cvc-sync-field { grid-template-columns: 1fr; } }
.cvc-sync .cvc-sync-desc { margin: 0; color: var(--dsw-alias-label-secondary); }
.cvc-sync .cvc-sync-group { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 4px 16px 8px; }
.cvc-sync .cvc-sync-group > h3 { margin: 10px 0 2px; font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.cvc-sync .cvc-sync-field { display: grid; grid-template-columns: minmax(170px, 220px) minmax(0, 1fr); gap: 6px 16px; padding: 10px 0; border-top: 1px dashed var(--dsw-alias-border-l1); align-items: start; }
.cvc-sync .cvc-sync-group > .cvc-sync-field:first-of-type { border-top: 0; }
.cvc-sync .cvc-sync-label { font-weight: 500; }
.cvc-sync .cvc-sync-hint { margin-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.cvc-sync .cvc-sync-control { min-width: 0; }
.cvc-sync input[type="text"], .cvc-sync input[type="number"], .cvc-sync textarea, .cvc-sync select {
  box-sizing: border-box; width: 100%; padding: 7px 9px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); font: inherit;
}
.cvc-sync input:focus-visible, .cvc-sync textarea:focus-visible, .cvc-sync select:focus-visible, .cvc-sync button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px;
}
.cvc-sync textarea { min-height: 64px; resize: vertical; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; }
.cvc-sync .cvc-sync-row { display: flex; align-items: center; gap: 10px; }
.cvc-sync .cvc-sync-switch { position: relative; width: 38px; height: 22px; flex: none; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); cursor: pointer; padding: 0; transition: background .12s ease, border-color .12s ease; }
.cvc-sync .cvc-sync-switch[data-on="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.cvc-sync .cvc-sync-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform .12s ease; }
.cvc-sync .cvc-sync-switch[data-on="true"]::after { transform: translateX(16px); }
.cvc-sync .cvc-sync-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.cvc-sync .cvc-sync-btn { border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-weight: 500; padding: 7px 14px; cursor: pointer; }
.cvc-sync .cvc-sync-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.cvc-sync .cvc-sync-btn:disabled { opacity: .5; cursor: default; }
.cvc-sync .cvc-sync-btn[data-primary="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.cvc-sync .cvc-sync-note { flex: 1 1 220px; min-width: 0; font-size: 12px; }
.cvc-sync .cvc-sync-note[data-kind="ok"] { color: var(--dsw-alias-state-success-primary); }
.cvc-sync .cvc-sync-note[data-kind="warn"] { color: var(--dsw-alias-state-warn-primary); }
.cvc-sync .cvc-sync-note[data-kind="error"] { color: var(--dsw-alias-state-error-primary); }
.cvc-sync .cvc-sync-status { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); padding: 10px 14px; font-size: 12px; }
.cvc-sync .cvc-sync-status h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); text-transform: uppercase; letter-spacing: .02em; }
.cvc-sync .cvc-sync-line { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.cvc-sync .cvc-sync-line b { font-weight: 600; }
.cvc-sync .cvc-sync-mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
.cvc-sync .cvc-sync-warn { color: var(--dsw-alias-state-warn-primary); }
.cvc-sync .cvc-sync-error { color: var(--dsw-alias-state-error-primary); }
.cvc-sync .cvc-sync-ok { color: var(--dsw-alias-state-success-primary); }
.cvc-sync .cvc-sync-muted { color: var(--dsw-alias-label-secondary); }
`

    /** REST-вызов к хост-половине. */
    async function api(method, path, body) {
      const init = { method, headers: { accept: 'application/json' } }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      const response = await fetch(API + path, init)
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        const detail = payload?.fields?.length
          ? `${payload.error ?? 'invalid'}: ${payload.fields.join('; ')}`
          : payload?.error ?? `HTTP ${response.status}`
        throw new Error(detail)
      }
      return payload
    }

    /** Показать список как строку, без пустых значений. */
    function joinList(list) {
      return Array.isArray(list) && list.length > 0 ? list.join(', ') : ''
    }

    /** Поле формы: подпись, подсказка и контрол. */
    function Field({ label, hint, children }) {
      return h('div', { className: 'cvc-sync-field' },
        h('div', null,
          h('div', { className: 'cvc-sync-label' }, label),
          hint ? h('div', { className: 'cvc-sync-hint' }, hint) : null,
        ),
        h('div', { className: 'cvc-sync-control' }, children),
      )
    }

    /** Текстовая строка. */
    function TextInput({ value, onChange, list, placeholder }) {
      return h('input', {
        type: 'text',
        value: value ?? '',
        list,
        placeholder,
        spellCheck: false,
        autoComplete: 'off',
        onChange: (event) => onChange(event.target.value),
      })
    }

    /** Числовое поле: пустое значение не ломает форму. */
    function NumberInput({ value, onChange, min, max, step }) {
      return h('input', {
        type: 'number',
        value: Number.isFinite(value) ? String(value) : '',
        min, max, step,
        onChange: (event) => {
          const raw = event.target.value
          onChange(raw === '' ? NaN : Number(raw))
        },
      })
    }

    /** Переключатель с ролью switch. */
    function Switch({ checked, onChange, label }) {
      return h('div', { className: 'cvc-sync-row' },
        h('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': checked === true,
          'aria-label': label,
          className: 'cvc-sync-switch',
          'data-on': checked === true,
          onClick: () => onChange(checked !== true),
        }),
        h('span', { className: 'cvc-sync-muted' }, checked === true ? label : ' '),
      )
    }

    /** Блок состояния последнего прогона. */
    function StatusBlock({ t, value }) {
      if (value === null || value === undefined) return null
      const lines = []
      lines.push(h('div', { className: 'cvc-sync-line', key: 'counts' },
        h('span', null, h('b', null, t('catalog')), ` ${value.catalogModels}`),
        h('span', null, h('b', null, t('current')), ` ${value.currentModels}`),
        h('span', null, h('b', null, t('next')), ` ${value.nextModels}`),
        h('span', null, h('b', null, t('levels')), ' ', h('span', { className: 'cvc-sync-mono' }, value.levelsSource || '—')),
      ))
      const empty = value.added.length === 0 && value.removed.length === 0 && value.changed.length === 0
      lines.push(h('div', { className: empty ? 'cvc-sync-ok' : '', key: 'diff' },
        empty ? t('noDiff') : [
          value.added.length ? `${t('added')}: ${joinList(value.added)}` : '',
          value.removed.length ? `${t('removed')}: ${joinList(value.removed)}` : '',
          value.changed.length ? `${t('changed')}: ${value.changed.map((row) => `${row.id} (${joinList(row.fields)})`).join(', ')}` : '',
        ].filter(Boolean).join(' · '),
      ))
      if (value.allowlist.added.length) {
        lines.push(h('div', { key: 'al-add' }, `${t('allowlistAdded')}: ${joinList(value.allowlist.added)}`))
      }
      if (value.allowlist.pruned.length) {
        lines.push(h('div', { key: 'al-prune' }, `${t('allowlistPruned')}: ${joinList(value.allowlist.pruned)}`))
      }
      for (const [index, warning] of value.warnings.entries()) {
        lines.push(h('div', { className: 'cvc-sync-warn', key: `warn-${index}` }, warning))
      }
      if (value.error) lines.push(h('div', { className: 'cvc-sync-error', key: 'error' }, `${t('runError')}: ${value.error}`))
      if (value.at) lines.push(h('div', { className: 'cvc-sync-muted', key: 'at' }, value.at))
      if (value.applied) lines.push(h('div', { className: 'cvc-sync-ok', key: 'applied' }, '✓'))
      return h('div', { className: 'cvc-sync-status' }, h('h3', null, t('statusTitle')), ...lines)
    }

    /** Страница настроек. */
    function SettingsPage({ t, embedded = false }) {
      const [state, setState] = useState(null)
      const [draft, setDraft] = useState(null)
      const [busy, setBusy] = useState('')
      const [note, setNote] = useState(null)
      const [run, setRun] = useState(null)
      const [confirming, setConfirming] = useState(false)

      const load = useCallback(async () => {
        const body = await api('GET', '/state')
        setState(body)
        setDraft(body.config)
        return body
      }, [])

      useEffect(() => {
        let alive = true
        load().catch((error) => {
          if (alive) setNote({ kind: 'error', text: `${t('errLoad')}: ${error.message}` })
        })
        return () => {
          alive = false
        }
      }, [load, t])

      const set = useCallback((key, value) => {
        setDraft((current) => (current === null ? current : { ...current, [key]: value }))
      }, [])

      const dirty = useMemo(() => {
        if (state === null || draft === null) return false
        return JSON.stringify(state.config) !== JSON.stringify(draft)
      }, [state, draft])

      /** Привести форму к значениям, которые принимает хост. */
      const payload = useCallback(() => ({
        ...draft,
        installerUrls: Array.isArray(draft.installerUrls) ? draft.installerUrls : [],
        keepModels: Array.isArray(draft.keepModels) ? draft.keepModels : [],
      }), [draft])

      const save = useCallback(async () => {
        setBusy('save')
        setNote(null)
        try {
          const body = await api('PUT', '/config', { config: payload() })
          await load()
          setNote({ kind: 'ok', text: t('saved') })
          if (body?.config) setDraft(body.config)
        } catch (error) {
          setNote({ kind: 'error', text: `${t('errSave')}: ${error.message}` })
        } finally {
          setBusy('')
        }
      }, [load, payload, t])

      const runAction = useCallback(async (action) => {
        setBusy(action)
        setNote(null)
        setConfirming(false)
        try {
          const value = await api('POST', '/run', { action })
          setRun(value)
          setNote({ kind: value.ok === true ? 'ok' : 'error', text: action === 'apply' ? '' : t('checked') })
          await load()
        } catch (error) {
          setNote({ kind: 'error', text: `${t('errRun')}: ${error.message}` })
        } finally {
          setBusy('')
        }
      }, [load, t])

      const reset = useCallback(() => {
        if (state === null) return
        setDraft(state.defaults)
        setNote({ kind: 'warn', text: t('resetDone') })
      }, [state, t])

      if (state === null || draft === null) {
        return h('div', { className: 'cvc-sync' },
          h('h2', null, t('title')),
          h('p', { className: 'cvc-sync-desc' }, note?.text ?? t('loading')),
        )
      }

      const status = run ?? state.status
      const disabled = busy !== '' || state.active === false

      const textRows = (key, hint) => h(TextInput, {
        value: draft[key],
        onChange: (value) => set(key, value),
      })

      return h('div', { className: 'cvc-sync' },
        h(embedded ? 'h3' : 'h2', { className: embedded ? 'cvc-sync-embedded-title' : undefined }, t('title')),
        embedded ? null : h('p', { className: 'cvc-sync-desc' }, t('desc')),
        state.active === false ? h('p', { className: 'cvc-sync-error' }, t('inactive')) : null,

        h('div', { className: 'cvc-sync-group' },
          h('h3', null, t('groupMain')),
          h(Field, { label: t('provider'), hint: t('providerHint') },
            h(React.Fragment, null,
              h(TextInput, { value: draft.provider, onChange: (value) => set('provider', value), list: 'cvc-sync-providers' }),
              h('datalist', { id: 'cvc-sync-providers' },
                state.providers.map((id) => h('option', { key: id, value: id }))),
            )),
          h(Field, { label: t('baseURL'), hint: t('baseURLHint') }, textRows('baseURL')),
          h(Field, { label: t('apiKeyEnv'), hint: t('apiKeyEnvHint') }, textRows('apiKeyEnv')),
        ),

        h('div', { className: 'cvc-sync-group' },
          h('h3', null, t('groupSync')),
          h(Field, { label: t('autoSync'), hint: t('autoSyncHint') },
            h(Switch, { checked: draft.autoSync, onChange: (value) => set('autoSync', value), label: draft.autoSync ? t('switchOn') : t('switchOff') })),
          h(Field, { label: t('intervalHours'), hint: t('intervalHoursHint') },
            h(NumberInput, { value: draft.intervalHours, min: 0, step: 1, onChange: (value) => set('intervalHours', value) })),
          h(Field, { label: t('startupDelayMs'), hint: t('startupDelayMsHint') },
            h(NumberInput, { value: draft.startupDelayMs, min: 0, step: 500, onChange: (value) => set('startupDelayMs', value) })),
          h(Field, { label: t('minModelRatio'), hint: t('minModelRatioHint') },
            h(NumberInput, { value: draft.minModelRatio, min: 0.05, max: 1, step: 0.05, onChange: (value) => set('minModelRatio', value) })),
          h(Field, { label: t('syncAllowlist'), hint: t('syncAllowlistHint') },
            h(Switch, { checked: draft.syncAllowlist, onChange: (value) => set('syncAllowlist', value), label: draft.syncAllowlist ? t('switchOn') : t('switchOff') })),
        ),

        h('div', { className: 'cvc-sync-group' },
          h('h3', null, t('groupAdvanced')),
          h(Field, { label: t('entryId'), hint: t('entryIdHint') }, textRows('entryId')),
          h(Field, { label: t('allowlistEntryId'), hint: t('allowlistEntryIdHint') }, textRows('allowlistEntryId')),
          h(Field, { label: t('installerUrls'), hint: t('installerUrlsHint') },
            h('textarea', {
              value: Array.isArray(draft.installerUrls) ? draft.installerUrls.join('\n') : '',
              spellCheck: false,
              onChange: (event) => set('installerUrls', event.target.value.split('\n').map((line) => line.trim()).filter(Boolean)),
            })),
          h(Field, { label: t('keepModels'), hint: t('keepModelsHint') },
            h('textarea', {
              value: Array.isArray(draft.keepModels) ? draft.keepModels.join('\n') : '',
              spellCheck: false,
              onChange: (event) => set('keepModels', event.target.value.split(/[\n,]+/).map((line) => line.trim()).filter(Boolean)),
            })),
          h(Field, { label: t('levelsCacheMinutes'), hint: t('levelsCacheMinutesHint') },
            h(NumberInput, { value: draft.levelsCacheMinutes, min: 0, step: 10, onChange: (value) => set('levelsCacheMinutes', value) })),
          h(Field, { label: t('timeoutMs'), hint: t('timeoutMsHint') },
            h(NumberInput, { value: draft.timeoutMs, min: 1, step: 1000, onChange: (value) => set('timeoutMs', value) })),
        ),

        h(StatusBlock, { t, value: status }),

        h('div', { className: 'cvc-sync-actions' },
          h('button', {
            type: 'button',
            className: 'cvc-sync-btn',
            'data-primary': true,
            disabled: disabled || !dirty,
            onClick: save,
          }, busy === 'save' ? t('saving') : t('save')),
          h('button', {
            type: 'button',
            className: 'cvc-sync-btn',
            disabled,
            onClick: () => runAction('plan'),
          }, busy === 'plan' ? t('checking') : t('check')),
          h('button', {
            type: 'button',
            className: 'cvc-sync-btn',
            disabled,
            onClick: () => setConfirming(true),
          }, busy === 'apply' ? t('applying') : t('apply')),
          h('button', {
            type: 'button',
            className: 'cvc-sync-btn',
            disabled: disabled,
            onClick: reset,
          }, t('reset')),
          h('span', { className: 'cvc-sync-note', 'data-kind': note?.kind ?? '' }, note?.text ?? ''),
        ),

        confirming ? h('div', { className: 'cvc-sync-status' },
          h('div', null, t('confirmApply')),
          h('div', { className: 'cvc-sync-actions', style: { marginTop: '8px' } },
            h('button', { type: 'button', className: 'cvc-sync-btn', 'data-primary': true, onClick: () => runAction('apply') }, t('confirmYes')),
            h('button', { type: 'button', className: 'cvc-sync-btn', onClick: () => setConfirming(false) }, t('confirmNo')),
          ),
        ) : null,

        h('p', { className: 'cvc-sync-hint' },
          `${t('checkUsesSaved')} ${dirty ? `· ${t('dirty')}` : ''}`),
        h('p', { className: 'cvc-sync-hint cvc-sync-mono' }, `${t('patch')}: ${state.patchPath}`),
      )
    }

    /** Значок секции в навигации настроек. */
    function NavIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', { d: 'M20 25a12 12 0 0 1 20-6l4 4', fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round' }),
      h('path', { d: 'M44 19v8h-8', fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M44 39a12 12 0 0 1-20 6l-4-4', fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round' }),
      h('path', { d: 'M20 45v-8h8', fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    /** Точка входа клиентской половины. */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en: EN, ru: RU }), 'cvc-catalog-sync: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'cvc-catalog-sync-plugin'
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'cvc-catalog-sync: styles')

      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: NS,
      }, (owner = {}) => h(NavIcon, { size: owner.size ?? 16 })))

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: NS,
        order: ORDER,
        label: () => t('nav'),
        locale: NS,
        inject: () => ({ t }),
      }, (owner = {}) => h(SettingsPage, { ...owner, t })))

      // Второе место — страница плагина в разделе «Плагины»: блок между
      // описанием и списком компонентов, как у dshmarket и dsh-free-search.
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: BUNDLE_NAME,
        locale: NS,
        inject: () => ({ t }),
      }, (owner = {}) => (owner.view === 'summary'
        ? h('span', { className: 'cvc-sync-muted' }, t('summary'))
        : h(SettingsPage, { ...owner, t, embedded: true }))))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
