# REVIEW — cvc-catalog-sync-plugin 2.0.0

Независимое ревью перед релизом. Ревьюер — отдельный агент (`reviewer`), код продукта не
правил: единственный файл, созданный ревьюером в репозитории, — этот отчёт.
Дата: 2026-11-21. Спека: `../cvc-merge-spec.md` (§1–§7). План: `../cvc-merge-plan.md`.

**Вердикт после релиза: релиз состоялся и артефакты честные — npm 2.0.0 ≡ локальная
сборка, тег `v2.0.0` есть, провенанс есть; функциональный риск один — M1 (живой UI).**
Вердикт до релиза был «готов при двух условиях»: (1) lock в коммит — **выполнено**
(`3fc2854`, проверено `git ls-tree v2.0.0`); (2) решение по M1 — **за ревьюером, данные
собраны**, но полного прогона переключателей в живом клиенте никто ещё не делал. В
профиле пользователя (`desktop`) сейчас стоят **1.0.0 + оба старых плагина**
(`cvc-balance-plugin` 1.1.0, `cvc-model-coeff-plugin` 1.0.0), поэтому видимая в рабочем
DSH кнопка баланса принадлежит **старому** плагину — это подтверждает механику слотов,
но не работу 2.0.0.

История ревью: найдено 2 блокера и 2 major. Оба блокера (отсутствующий lock и регресс
`applyConfig`) и ошибка в CHANGELOG исправлены автором по ходу ревью и **перепроверены
ревьюером своим прогоном**; minors m1/m2/m6 тоже закрыты. Открытым остаётся M1.

> Хронология: функциональные замеры — на «замороженном» дереве (последняя правка продукта
> 02:35:19, замеры 02:36–02:37); релизные артефакты проверены после коммита `3fc2854`
> (тег `v2.0.0`), коммиты `c5d3177`, `ccf91da`, `05d672f` после тега меняют только
> `.github/workflows/publish.yml` (`git diff --stat v2.0.0..HEAD`).

---

## Условия релиза — статус

1. **`package-lock.json` в релизном коммите — ВЫПОЛНЕНО.** `git ls-tree -r v2.0.0` содержит
   `package-lock.json`; локальный CI-набор на коммите проходил (`npm ci` → `npm test`
   342/342 → `npm run build` → diff пусто → `assert-pack` ok).
2. **M1 (живой UI) — НЕ ВЫПОЛНЕНО.** Полного прогона переключателей в живом клиенте
   нет; видимая в рабочем DSH кнопка принадлежит старому плагину 1.1.0 (см. ниже).

---

## Статус M1 на момент этого отчёта

**Что уже установлено фактами:**

1. **В рабочем клиенте пользователя (профиль `desktop`) кнопка «CVC баланс» видна** в
   подвале сайдбара DSH (скриншот окна DSH, hwnd 264044, 02:48; `windows_computer_use_screenshot`).
   **Но это не 2.0.0:** профиль держит `cvc-catalog-sync-plugin` **1.0.0**,
   `cvc-balance-plugin` **1.1.0** и `cvc-model-coeff-plugin` **1.0.0** (проверено
   чтением `<профиль>/package.json` и установленных версий в `node_modules`, только чтение;
   профиль не менялся), а строка кнопки `cvc-balance` принадлежит старому плагину. Вывод:
   механика слотов браузера этой сборки DSH совместима с нашим способом регистрации, но
   кнопка на экране — **санити-чек площадки, а не подтверждение 2.0.0**.
2. **Изолированная браузерная проверка GUI запрещена политикой харнесса:**
   `set_value elementId "new-tab"` с адресом DSH → `WCU_POLICY_DENIED: this address
   belongs to the DSH host`. Встроенные инструменты браузера на адрес DSH не ведут.
3. **Мой браузерный доступ к GUI ограничен, но у lead он есть** — поэтому прогон должен
   делать lead (это же его решение), а не я. Отдельная проверка показала, что
   пересборка клиента для UI-прогона **не нужна**: в профиле `desktop` строка
   `dev:web`/`dsh-web-interface-build` **не объявлена** (`Select-String` по
   `cordis.patch.yml`/`package.json` профиля — пусто), в каталоге установки DSH нет
   `node_modules` (`Test-Path …\app.asar\dsh\node_modules` → False), а клиент 2.0.0
   отгружается как готовый `client.js` в тарболе. Значит `tsdown`/devDeps не нужны:
   временный профиль должен **ставить именно 2.0.0** (пакет из `npm pack`/`npm ci` тега
   `v2.0.0`), а не пускать пакетный `@latest`, который теперь резолвится в `3.4.1`.
   Временный профиль на отдельном `DSH_HOME` — правильная замена `desktop`.

**Что осталось для закрытия M1** — дымовой сценарий в живом DSH на временном профиле
(не `desktop`), на артефакте 2.0.0:

0. Убедиться, что в профиле стоит `cvc-catalog-sync-plugin@2.0.0`, а не `3.4.1`:
   `package.json` профиля + `dsh.client.inject` (model-selection/settings/sidebar).
1. `GET /cvc/state` (снять JSON).
2. Settings → CVC: три переключателя (`role=switch`). Выключить баланс → блок исчезает,
   `GET /cvc/balance` → **404**. Выключить коэффициенты → бейджи `×N` уходят.
   Выключить каталог → `POST /cvc/run` → **404**, `cvc_catalog` исчезает из инструментов.
3. Включить всё обратно → маршруты/инструменты вернулись **без перезагрузки страницы**
   и без рестарта DSH; снова снять `GET /cvc/state`. Скриншоты до/после.
4. Отдельно, без браузера, — **volatile-путь в живом DSH**: во временном профиле
   правка `catalog.intervalHours 24 → 6` в его `cordis.patch.yml` при работающем
   процессе должна дать `loader/volatile-update`, перемонтирование и строку
   `configuration updated without restart` в `~/.dsh/logs/dsh.log`; проверка —
   `GET /cvc/state` (`config.catalog.intervalHours = 6`).

Формально M1 остаётся **major (открыт)**: живой клиент 2.0.0 в работе не наблюдался ни
разу, только фейковый React/DOM авторов.

---

## Что проверялось и каким запуском

| Шаг | Команда | Результат |
|---|---|---|
| Установка из lock | `npm ci` (3 раза: сломанный старт, после фикса, финальный) | старт: **EUSAGE** (B1); финал: **exit 0**, 30 пакетов, 0 vulnerabilities |
| Полный прогон тестов | `npm test` (≥ 8 прогонов за ревью) | старт: **341/0**; финал: **342/342, 0 fail** |
| Обратный порядок файлов | `node --test <14 файлов в обратном порядке>` | **342/342** |
| Перемешанный порядок | 5 запусков `Sort-Object { Get-Random }` | **341/0** в каждом (на старте) |
| По файлам | `node --test test/<файл>` × 14 | api 20, balance 29, catalog-build 21, catalog-sync 33, catalog-tool 17, client-render 24, client-store 47, coefficients 20, config 25, cvc-api 24, gating 29, http 23, providers 18, state 12 = **342** |
| Сборка | `npm run build` × 6 (до/после `npm ci`, дважды подряд) | SHA-256 `9DD5…52B5`, идентичен в обоих прогонах и отгруженному `client.js` |
| Сверка «собрано = отгружено» | `git diff --no-index --stat <до сборки> client.js` | **exit 0**, пусто |
| Состав тарбола | `node tools/assert-pack.mjs` | **ok**, 28 файлов |
| Пак | `npm pack` + `tar -tzf` + распаковка | **cvc-catalog-sync-plugin-2.0.0.tgz**, 139 817 байт, 28 записей, version `2.0.0` |
| Гейтинг (свой скрипт) | `node gating-owned.mjs` | **34/34** |
| Безопасность (свой скрипт) | `node security-owned.mjs` | **17/17** |
| Контракт §2/§4 (свой скрипт) | `node contract-owned.mjs` | **10/10** |
| Перемонтирование при правке обычных настроек (свой скрипт) | `node remount-owned.mjs` | **5/5** |
| Порядок статусов HTTP (свой зонд) | `node http-status-probe.mjs` | см. m2 |
| **Релизные артефакты** | `git rev-list -n 1 v2.0.0`, `gh release view`, `npm view …`, `npm install` из реестра, SHA-1 локального пака | см. «Релиз проверен» |

Скрипты ревьюера лежат **вне репозитория** (чтобы не попасть в коммит и тарбол):
`%TEMP%\cvc-review\gating-owned.mjs`, `security-owned.mjs`, `contract-owned.mjs`,
`remount-owned.mjs`, `http-status-probe.mjs`; запуск с `$env:CVC_REPO=<путь к репо>`.
Они не импортируют тестов авторов и используют только публичный контракт
`apply(ctx, config)`; фейковый Context — свой. Итого независимых проверок ревьюера: **66**.

---

## Blocker

### B1. `package-lock.json` отсутствовал — CI и publish падали бы на Install. **Исправлено и в релизе**

**Как было (воспроизведение на старте ревью, 02:14):**

```
cd cvc-plugin-merge
Test-Path package-lock.json                     -> False
git ls-files | Select-String -Pattern 'lock'    -> пусто
npm ci
  npm error The `npm ci` command can only install with an existing package-lock.json
```

Затронутые места: `.github/workflows/ci.yml:37` (`run: npm ci`, job `test`), `ci.yml:55`
(job `build`), `.github/workflows/publish.yml:66`, плюс `setup-node` с `cache: npm`.
Комментарий `ci.yml:34-36` («package-lock.json в репозитории, поэтому `npm ci`…») тогда
не соответствовал действительности.

**Исправление и перепроверка ревьюером:**

```
node -e "require('./package-lock.json')" -> lockfileVersion 3, name cvc-catalog-sync-plugin,
                                            version 2.0.0, packages: 57
npm ci                                   -> exit 0, 30 пакетов, 0 vulnerabilities
npm test                                 -> 342/342
npm run build                            -> client.js SHA-256 без изменений
git ls-tree -r v2.0.0 | Select package-lock  -> package-lock.json  (в релизном коммите)
```

Закрыто полностью.

### B2. Регресс `applyConfig`: любая правка конфига перемонтировала ВСЕ функции. **Исправлено**

**Как было (промежуточное дерево 02:29–02:33):** `npm test` → `tests 342 / pass 341 / fail 1`;
падал новый тест авторов `test/gating.test.mjs:297`, `AssertionError` на `gating.test.mjs:309`,
`actual: 2, expected: 1`. Причина: `applyConfig` начинался со
`const remount = new Set(FEATURE_KEYS)` — при изменении любой настройки размонтировались и
монтировались заново все три функции.

**Независимое обнаружение:** свой `remount-owned.mjs` (5 кейсов) на версии 02:33 дал
`catalog.intervalHours 24→6 ⇒ ["cvc_balance","cvc_catalog"]` — лишний `cvc_balance`.

**Исправление (02:34:01) и перепроверка:**

```
catalog.intervalHours 24 -> 6          => cvc_catalog              PASS
coefficients.refreshMinutes 10 -> 20   => ничего                  PASS
balance.showDelta true -> false        => cvc_balance             PASS
providers.timeoutMs 20000 -> 30000     => cvc_catalog+cvc_balance PASS
ничего не изменилось                   => ничего                  PASS
npm test (прямой и обратный порядок)    => 342/342, 0 fail
```

### Честная история: чей тест был кривой

Первый вариант теста авторов не видел перемонтирований: `index.js` берёт `tools.register`
из сервиса на каждом монтировании, а обёртка-счётчик терялась. Пока автор отлаживал
счётчик, он нашёл настоящий дефект (B2). Текущая версия теста зелёная, и мой независимый
`remount-owned.mjs` подтверждает, что она отражает поведение кода.

---

## Major

### M1. Живой прогон клиента в DSH — **открыт** (см. «Статус M1»)

Критерий готовности плана (`cvc-merge-plan.md:92-94`) требует, чтобы переключатели в
интерфейсе работали без перезапуска DSH. В репозитории это доказано только тестами
авторов на фейковом React/DOM (`test/client-render.test.mjs`, 24 теста, и
`client-store.test.mjs`, 47). Минусов два: (а) прогон переключателей
в живой странице не сделан; (б) фейковый `slots.register` (`test/client-render.test.mjs:625-639`)
не проверяет дубли id. Видимая в рабочем DSH кнопка баланса — от старого плагина
(`<профиль>/package.json`: `cvc-catalog-sync-plugin` 1.0.0, `cvc-balance-plugin` 1.1.0),
так что 2.0.0 в живом клиенте не наблюдался.

**Что закрывает M1:** дымовой прогон в отдельном процессе DSH на временном `DSH_HOME`
(не `desktop`): Settings → CVC, три переключателя вкл/выкл, исчезновение/возврат кнопки
баланса и бейджей без перезагрузки, `GET /cvc/state` до/после. Скриншоты — в отчёт.

### M2. CHANGELOG утверждал «38 checks of 1.0.0». **Исправлено**

Было: `CHANGELOG.md:96-97` — «the 38 checks of 1.0.0 are carried over rather than dropped».
Факт: `test/self-test.mjs` — **15**, `test/integration.mjs` — **9**, `test/settings-api.mjs` —
**8**; HEAD-код с этими файлами дал `tests 32 / pass 32`. Сейчас `CHANGELOG.md:97` —
«every one of the **32** test scenarios of 1.0.0 is carried over» — совпадает с подсчётом.

**Сверка сценариев (HEAD → 2.0.0):** все 32 имеют прямое соответствие —
parseCatalogPayload → `cvc-api.test.mjs`; parseReasoningLevels → `catalog-build.test.mjs`
/cvc-api.test.mjs; reasoningEffortsFor ×3 → `catalog-build.test.mjs`; buildModels ×6 →
`catalog-build.test.mjs` (+2 новых); diffModels ×2 → `catalog-build.test.mjs`;
stableStringify → `catalog-build.test.mjs` + `config.test.mjs`; normalizeConfig →
`config.test.mjs`; apply ×9 (модели+allowlist, повторный apply, старый allowlist,
дубли/порядок, plan, guard force, усыхание, правка во время ожидания, modelOverrides) →
`catalog-sync.test.mjs` один к одному; settings-api ×8 → `api.test.mjs`, `gating.test.mjs`,
`config.test.mjs`. Потерь покрытия нет.

Замечание к плану: там «27 + 52» для приватных плагинов; по снимкам — 27 и **56**.
На CHANGELOG это не влияет.

---

## Minor

- **m1. Битая ссылка в JSDoc — исправлено.** Было `lib/config.js:7` «см. `_phase0-report.md`»
  (файла в репо нет). Сейчас — переформулировано, `grep _phase0 lib/config.js` пуст.
- **m2. Порядок статусов HTTP — исправлено.** Было: 415 раньше 404. Сейчас
  (`lib/http.js:198-211`): 403 → 404 пути → 404 маршрута → 415 → обработчик. Мой зонд:

  ```
  GET  /cvc/balance ct=-                 -> 200
  PUT  /cvc/balance ct=-                 -> 415 (body не JSON)
  PUT  /cvc/balance ct=application/json  -> 405 (решает обработчик)
  POST /cvc/nope    ct=text/plain        -> 404 (было 415)
  ```
- **m3. `refreshSeconds` 1..14 молча поднимается до 15** (`lib/config.js:293-294`) — без
  `warn`; форма отклоняет такие значения. Low-risk, не блокирует.
- **m4. Документация против кода — формулировки верные.** «Applied without a restart»
  (`README.md:84-88`), «404 при выключенной функции» (`README.md:268-269`), «409 на
  stale/guard» (`README.md:201-203`), «ключ не уходит в браузер» (`README.md:249`,
  `SECURITY.md:50-57`), `docs/DETAIL.md` с одной картинкой, локали с
  `meta.title/description/detail` — всё подтверждено запуском и кодом.
- **m5. README EN/RU** — полные обе версии, одинаковый набор разделов, ссылки на npm и
  GitHub настоящие.
- **m6. «Moved from» — закрыто.** README называется `cvc-model-coeff-plugin` и
  `cvc-balance-plugin` и ведёт в `docs/UPGRADING.md`. Необязательное: ссылки на сами
  архивируемые репозитории.

---

## Проверено и в порядке

1. **Тесты 342/342** в прямом и обратном порядке; по файлам — сумма 342 (см. таблицу).
   Вопрос lead №1: `test/balance.test.mjs` импортирует настоящий `lib/cvc-api.js` в
   `deps.api` (комментарий на строках 98-99), сеть подменяется через `deps.fetchImpl` —
   глобального мока нет, от порядка файлов результат не зависит (7+ прогонов).
2. **Гейтинг (§1)** — `gating-owned.mjs` 34/34: все выключены — 0 инструментов, 0 таймеров,
   `POST /cvc/run`/`GET /cvc/balance`/`GET /cvc/coefficients` → 404, `/cvc/state` → 200;
   включение через `loader/volatile-update` **без повторного `apply()`** поднимает
   маршруты/инструменты/таймеры, prefix-маршрут остаётся один; выключение на лету всё
   снимает (таймеров 0); teardown плагина чист.
3. **Безопасность** — `security-owned.mjs` 17/17: cross-site → 403 на 6 маршрутах;
   `text/plain` → 415; тело 66 053 байт → 413; ключ-сентинел не в ответах и логах, только
   `Authorization` на https; `http://` и соседний домен не принимаются; в `client.js`
   только `require('react')`; приватных путей и живых токенов в репо нет (фиктивные
   `sk-live-…` только в тестах).
4. **Контракт §2/§4** — `contract-owned.mjs` 10/10: `DEFAULTS` совпадают с §2, 36
   volatile-листьев, поля ответов всех маршрутов как в спеке.
5. **Сборка** — SHA-256 `9DD5…52B5` стабилен; пак 28 файлов; тарбол чистый (нет
   `src/test/tools/.github/_src/lock`), абсолютных путей 0.
6. **§1–§7** — функции и ключи, группы конфига, маршруты, слоты клиента (`settings.section`
   id `cvc` order 25, `sidebar.footer.action` `cvc-balance` order 5, `plugins.bundle.config`),
   документы §7, локали, DETAIL — всё на месте.

---

## Релиз проверен (после коммита `3fc2854`)

| Что | Команда | Факт |
|---|---|---|
| Коммит и тег | `git rev-list -n 1 v2.0.0` | **`3fc2854dd41aeef656d1b97375506274a3ef9f45`** (аннотированный тег `c43b1b8`, peeled) |
| Что после тега | `git diff --stat v2.0.0..HEAD` | только `.github/workflows/publish.yml` (+33/−4) в `c5d3177`, `ccf91da`, `05d672f`; продукт не менялся |
| Lock в теге | `git ls-tree -r v2.0.0` | `package-lock.json` есть; файлов в теге 62 |
| `client.js` в теге | `git show v2.0.0:client.js` → SHA-256 | `9DD5754A…52B5` — **тот же**, что локальная сборка |
| GitHub Release | `gh release view v2.0.0 --json …` | опубликован 2026-11-20T23:40:57Z, не draft, не prerelease, tag `v2.0.0` |
| npm | `npm view cvc-catalog-sync-plugin@2.0.0 …` | version `2.0.0`; `dist.fileCount` 28; `unpackedSize` 497 091; provenance `slsa.dev/provenance/v1` |
| Артефакт = мой пак | SHA-1 локального `npm pack` vs `dist.shasum` | **`e74291c765d3af6ac2cf7dc765f20726521f9121`** — совпадает побайтно |
| Установка из реестра | `npm install cvc-catalog-sync-plugin@2.0.0 @deepseek-ai/schemastery@3` | exit 0; импорт даёт `Config,SELF_ROW_ID,VERSION,apply,inject,name`; `VERSION 2.0.0`; `inject [configEditor,tools,credentials]` |
| Манифест в тарболе | `package.json` из тарбола | все `exports` разрешаются (`.` → `index.js`, `./client` → `client.js`, `./icon`, `./package.json`); `files` без `src/test/tools/.github`; `dsh.client.inject` — три UI-пакета; `dsh.engines.dsh` `>=0.2.2-rc.3 <0.4.0` |
| Бандл-патч | `cordis.patch.yml` из тарбола | строка `cvc-catalog-sync` с тремя `features` = true |
| Локали | `locale/en.json`, `locale/ru.json` из тарбола | JSON валиден, `meta.title/description/detail` есть, `detail` → `docs/DETAIL.md` |

**Замечание по ходу публикации (недефект кода, но требует финального прогона).**
`publish.yml` до `05d672f` требовал npm, умеющий OIDC-обмен: прогон на Node 22 давал
`ENEEDAUTH`. Сейчас на `main` публикация идёт с Node 24 (npm 11) и проверяет версию в
реестре поллингом. Важно для **следующего релиза**: тег `v2.0.0` стоит на `3fc2854`,
то есть на старой версии workflow. Повторная публикация той же версии безопасна —
`publish.yml` проверяет «уже опубликовано → ничего не делать», — но запускать Publish
на тег `v2.0.0` имеет смысл только чтобы увидеть зелёный статус уже исправленного
workflow; при этом он возьмёт `npm ci`, тесты и сверку `client.js` **из коммита тега**,
а не из `main`. Если нужен зелёный «проверенный» прогон нового workflow — надёжнее
`workflow_dispatch` с `main` (он публикует версию из `package.json` и увидит
«already published»). Это должен решить lead.

---

## Что не проверено (границы ревью)

1. **Переключатели в живой странице DSH** — см. M1: нужен отдельный процесс DSH на
   временном `DSH_HOME`; без согласия пользователя ревьюер такое не запускает.
2. **GitHub Actions** — workflow-файлы прочитаны; прогон видел только lead (ENEEDAUTH,
   затем успех). Ревьюер проверил локально тот же набор команд и артефакт в реестре.
3. **Метаданные репозитория §8** (description/topics) — `gh` в сессии не отдаёт поле
   `homepage`; не подтверждено.

---

## Уточнения по замечаниям lead

1. **Порядок загрузки модулей в `balance.test.mjs`** — зависимости нет (мок не используется);
   7+ прогонов в разном порядке — зелёные.
2. **415 перед 405** — исправлено автором (m2); моя матрица подтверждает 403→404→415→405
   от обработчика.
3. **Трейсабилити** — CHANGELOG `127-155` и `docs/UPGRADING.md:76-113` читаются; README
   «Moved from» называет оба пакета и ведёт в UPGRADING.
4. **Пакет и publish** — лишнего нет, даунгрейд-пути нет, артефакт реестра побайтно равен
   локальному паку, версия `2.0.0`.

---

## Итоговый вердикт

**Релиз состоялся и артефакты честные.** npm `2.0.0` — это в точности локальная сборка
(`dist.shasum` = SHA-1 моего `npm pack`), `client.js` в теге и в реестре совпадает с
собранным из источников побайтно, тег `v2.0.0` на `3fc2854`, GitHub Release опубликован,
provенанс SLSA приложен, установка из реестра с peer-зависимостью работает. Все 66
независимых проверок ревьюера и 342 теста авторов — зелёные.

**Открытый риск один — M1:** переключатели на живой странице DSH не прогнаны, а кнопка
баланса в рабочем клиенте принадлежит старому `cvc-balance-plugin` 1.1.0 — **2.0.0 в
живом клиенте не наблюдался**. Рекомендация: либо прогнать дымовой сценарий на временном
профиле (скриншоты + `GET /cvc/state` до/после), либо в итоговом отчёте записать дословно:
«UI-половина проверена юнит-тестами на фейковом React/DOM; живого прогона переключателей
в DSH не было». Код, пакет, документы и артефакты реестра к релизу готовы.