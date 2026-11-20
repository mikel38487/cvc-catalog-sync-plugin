# Security policy

## Supported versions

| Version | DSH | Support |
| --- | --- | --- |
| 1.x | `>=0.2.2-rc.3 <0.4.0` | security fixes |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

1. Use **Security → Report a vulnerability** on this repository (GitHub private
   vulnerability reporting).
2. Include the plugin version, the DSH version, the steps to reproduce, and the
   impact you expect.

You can expect an initial answer within 7 days and a fix or a mitigation plan
within 30 days for confirmed reports.

## Scope

The plugin makes network requests only to addresses from its own configuration:

- `GET {baseURL}/models` with the credential that DSH resolves by name
  (`apiKeyEnv`);
- `GET` to each configured installer URL (default
  `https://ru.cheapvibecode.ru/idhw` and `/idhl`);
- the settings page talks only to the plugin's own `/cvc-catalog-sync` routes on
  the same origin.

There is no telemetry, no analytics, and no other outbound host. The package has
zero runtime dependencies.

The plugin writes two configuration rows of the DSH profile patch
(`llm-pi-ai` models and `subagent-model-selection-settings.allowedModels`) and
never puts the API key value into logs, responses, or the browser.

Out of scope: vulnerabilities in DSH itself, in the CheapVibeCode API, or in the
models the catalog describes — report those to their maintainers.

## Hardening in this repository

- Dependabot alerts, security updates, and weekly version updates for npm and
  GitHub Actions.
- CodeQL code scanning (`security-and-quality`) on every push and pull request.
- GitHub secret scanning with push protection.
- OpenSSF Scorecard results published to the code-scanning dashboard.
- Third-party actions pinned to commit SHAs.
- npm releases with provenance through npm Trusted Publishing from GitHub
  Actions.

## Accepted findings

OpenSSF Scorecard reports posture items that a single-maintainer plugin cannot
satisfy by design; they are accepted, not ignored:

| Check | Why it stays |
| --- | --- |
| Code-Review | one maintainer; there is no second reviewer |
| Branch-Protection | `main` blocks deletion and force-push; required reviews or status checks would lock out direct maintenance |
| Maintained | young repository |
| CII-Best-Practices | no OpenSSF badge application yet |
| Fuzzing | no fuzz target; robustness is covered by edge-case tests |

Everything actionable is enabled: Dependabot, CodeQL, secret scanning with push
protection, pinned actions, and provenance on npm releases.

---

# Политика безопасности

## Поддерживаемые версии

| Версия | DSH | Поддержка |
| --- | --- | --- |
| 1.x | `>=0.2.2-rc.3 <0.4.0` | исправления безопасности |

## Как сообщить об уязвимости

Не открывайте публичный issue для проблемы безопасности.

1. Используйте **Security → Report a vulnerability** в этом репозитории
   (приватный advisory GitHub).
2. Укажите версию плагина, версию DSH, шаги воспроизведения и ожидаемое
   влияние.

Первый ответ — в течение 7 дней, исправление или план смягчения для
подтверждённой проблемы — в течение 30 дней.

## Область

Плагин делает сетевые запросы только по адресам из своей конфигурации:

- `GET {baseURL}/models` с ключом, который DSH разрешает по имени (`apiKeyEnv`);
- `GET` по каждому настроенному адресу установщика (по умолчанию
  `https://ru.cheapvibecode.ru/idhw` и `/idhl`);
- страница настроек ходит только в собственные маршруты `/cvc-catalog-sync` на
  том же origin.

Телеметрии и аналитики нет, других внешних адресов тоже. Зависимостей ноль.

Плагин пишет две строки профильного патча DSH (`llm-pi-ai` и
`subagent-model-selection-settings.allowedModels`) и не выводит значение ключа
в логи, ответы или браузер.

Вне области: уязвимости самого DSH, API CheapVibeCode и описанных в каталоге
моделей — о них сообщайте их авторам.

## Что включено в репозитории

- Dependabot: оповещения, security updates и еженедельные обновления npm и
  GitHub Actions.
- CodeQL (`security-and-quality`) на каждый push и pull request.
- Secret scanning с push protection.
- OpenSSF Scorecard с публикацией в code scanning.
- Сторонние actions закреплены по SHA коммита.
- Публикация в npm с provenance через Trusted Publishing из GitHub Actions.
