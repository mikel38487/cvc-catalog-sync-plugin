/**
 * Стили клиентской половины под общим префиксом `.cvc2-`.
 *
 * Префикс отделяет плагин от 1.0.0 и от двух прежних приватных плагинов: их
 * классы (`.cvc-sync`, `.cvc-coeff`, `.cvc-panel`) остались в истории и не
 * должны конфликтовать, если в профиле временно живёт старая строка.
 *
 * Цвета — только токены темы `--dsw-alias-*`: собственные значения ломают
 * светлую тему и подсветку контраста. Никаких `!important` и селекторов по
 * тегам вне своего корня, чтобы не задеть интерфейс харнесса.
 *
 * @module cvc-catalog-sync-plugin/client/css
 */

/** Готовое содержимое тега `<style>`. */
export const CSS = `
.cvc2-page { display: flex; flex-direction: column; gap: 14px; max-width: 780px; padding: 4px 2px 28px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.45; }
.cvc2-page h2 { margin: 0; font-size: 16px; font-weight: 600; }
.cvc2-page .cvc2-embedded-title { margin: 0; font-size: 14px; font-weight: 600; }
.cvc2-page .cvc2-desc { margin: 0; color: var(--dsw-alias-label-secondary); }
.cvc2-page .cvc2-group { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 4px 16px 8px; }
.cvc2-page .cvc2-group > h3 { margin: 10px 0 2px; font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.cvc2-page .cvc2-field { display: grid; grid-template-columns: minmax(170px, 220px) minmax(0, 1fr); gap: 6px 16px; padding: 10px 0; border-top: 1px dashed var(--dsw-alias-border-l1); align-items: start; }
.cvc2-page .cvc2-group > .cvc2-field:first-of-type { border-top: 0; }
.cvc2-page .cvc2-label { font-weight: 500; }
.cvc2-page .cvc2-hint { margin-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.cvc2-page .cvc2-control { min-width: 0; }
.cvc2-page input[type="text"], .cvc2-page input[type="number"], .cvc2-page textarea, .cvc2-page select {
  box-sizing: border-box; width: 100%; padding: 7px 9px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); font: inherit;
}
.cvc2-page input:focus-visible, .cvc2-page textarea:focus-visible, .cvc2-page select:focus-visible, .cvc2-page button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px;
}
.cvc2-page textarea { min-height: 64px; resize: vertical; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; }
.cvc2-page .cvc2-row { display: flex; align-items: center; gap: 10px; }
.cvc2-page .cvc2-switch { position: relative; width: 38px; height: 22px; flex: none; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); cursor: pointer; padding: 0; transition: background .12s ease, border-color .12s ease; }
.cvc2-page .cvc2-switch[data-on="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.cvc2-page .cvc2-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform .12s ease; }
.cvc2-page .cvc2-switch[data-on="true"]::after { transform: translateX(16px); }
.cvc2-page .cvc2-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.cvc2-page .cvc2-btn { border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-weight: 500; padding: 7px 14px; cursor: pointer; }
.cvc2-page .cvc2-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.cvc2-page .cvc2-btn:disabled { opacity: .5; cursor: default; }
.cvc2-page .cvc2-btn[data-primary="true"] { background: var(--dsw-alias-button-primary-fill); border-color: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-inverted); }
.cvc2-page .cvc2-note { flex: 1 1 220px; min-width: 0; font-size: 12px; }
.cvc2-page .cvc2-note[data-kind="ok"] { color: var(--dsw-alias-state-success-primary); }
.cvc2-page .cvc2-note[data-kind="warn"] { color: var(--dsw-alias-state-warn-primary); }
.cvc2-page .cvc2-note[data-kind="error"] { color: var(--dsw-alias-state-error-primary); }
.cvc2-page .cvc2-status { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); padding: 10px 14px; font-size: 12px; }
.cvc2-page .cvc2-status h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); text-transform: uppercase; letter-spacing: .02em; }
.cvc2-page .cvc2-line { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.cvc2-page .cvc2-line b { font-weight: 600; }
.cvc2-page .cvc2-mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
.cvc2-page .cvc2-warn { color: var(--dsw-alias-state-warn-primary); }
.cvc2-page .cvc2-error { color: var(--dsw-alias-state-error-primary); }
.cvc2-page .cvc2-ok { color: var(--dsw-alias-state-success-primary); }
.cvc2-page .cvc2-muted { color: var(--dsw-alias-label-secondary); }
.cvc2-page .cvc2-features-note { margin: 2px 0 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
@media (max-width: 560px) { .cvc2-page .cvc2-field { grid-template-columns: 1fr; } }

.cvc2-badge {
  display: inline-flex; align-items: center; margin-left: 6px; padding: 0 5px;
  border-radius: 4px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  font-size: 11px; font-weight: 500; line-height: 16px; letter-spacing: 0;
  white-space: nowrap; pointer-events: none; vertical-align: baseline;
}
.cvc2-badge[data-tier="cheap"] { color: var(--dsw-alias-state-success-primary); }
.cvc2-badge[data-tier="mid"] { color: var(--dsw-alias-label-secondary); }
.cvc2-badge[data-tier="pricey"] { color: var(--dsw-alias-state-warn-primary); }
.cvc2-badge[data-tier="expensive"] { color: var(--dsw-alias-state-error-primary); }

.cvc2-bal-root { font-size: 12px; color: var(--dsw-alias-label-primary); }
.cvc2-bal-btn { display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 8px; background: transparent; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; color: inherit; cursor: pointer; font: inherit; text-align: left; }
.cvc2-bal-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cvc2-bal-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--dsw-alias-label-secondary); }
.cvc2-bal-dot[data-state="ok"] { background: var(--dsw-alias-state-success-primary); }
.cvc2-bal-dot[data-state="warn"] { background: var(--dsw-alias-state-warn-primary); }
.cvc2-bal-dot[data-state="err"] { background: var(--dsw-alias-state-error-primary); }
.cvc2-bal-panel { position: fixed; z-index: 60; right: 16px; bottom: 64px; width: min(400px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; padding: 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-3); border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); cursor: grab; touch-action: none; }
.cvc2-bal-panel[data-dragging="true"] { cursor: grabbing; user-select: none; }
.cvc2-bal-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cvc2-bal-title { font-weight: 600; font-size: 13px; }
.cvc2-bal-close { margin-left: auto; flex: 0 0 auto; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; padding: 0; background: transparent; border: 1px solid transparent; border-radius: 5px; color: inherit; cursor: pointer; font: inherit; font-size: 15px; line-height: 1; opacity: .7; }
.cvc2-bal-close:hover { opacity: 1; background: var(--dsw-alias-interactive-bg-hover); border-color: var(--dsw-alias-border-l1); }
.cvc2-bal-actions { display: flex; gap: 6px; margin-bottom: 8px; }
.cvc2-bal-muted { color: var(--dsw-alias-label-secondary); }
.cvc2-bal-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px; margin-bottom: 8px; }
.cvc2-bal-row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
.cvc2-bal-big { font-size: 19px; font-weight: 650; }
.cvc2-bal-bad { color: var(--dsw-alias-state-error-primary); }
.cvc2-bal-msg { padding: 6px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); margin-top: 6px; }
.cvc2-bal-refresh, .cvc2-bal-reset { background: transparent; border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; color: inherit; cursor: pointer; font: inherit; padding: 3px 8px; }
.cvc2-bal-refresh:disabled, .cvc2-bal-reset:disabled { opacity: .5; cursor: default; }
`
