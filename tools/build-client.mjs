/**
 * Сборка клиентской половины: `src/client/*` → `client.js` в корне репозитория.
 *
 * Клиент собирается в CommonJS-тело и оборачивается в
 * `window.__ModuleLoader__.load({ id, factory })` — так модуль получает
 * `require` загрузчика браузера, а React и `@deepseek-ai/*` резолвятся из
 * таблицы модулей харнесса, а не дублируются в бандле.
 *
 * Промежуточное тело собирается в `node_modules/.cache/` (папка уже в
 * `.gitignore` и не попадает в `files` тарбола) и удаляется после сборки:
 * в репозитории остаётся только готовый `client.js`.
 *
 * Артефакт детерминирован: ни времени, ни абсолютных путей внутри нет, поэтому
 * CI сравнивает пересобранный файл с закоммиченным (`git diff --exit-code`).
 *
 * Запуск: `npm run build` или `node tools/build-client.mjs`.
 *
 * @module cvc-catalog-sync-plugin/tools/build-client
 */
import { build } from 'tsdown'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const cacheDir = join(root, 'node_modules', '.cache', 'cvc-client')
const bodyPath = join(cacheDir, 'client.body.cjs')

await rm(cacheDir, { recursive: true, force: true })
await mkdir(cacheDir, { recursive: true })

await build({
  entry: { 'client.body': join(root, 'src/client/index.js') },
  outDir: cacheDir,
  format: ['cjs'],
  // CJS всегда считается Node-форматом, поэтому `platform` в верхнем уровне
  // игнорируется; для браузерного бандла он задаётся на уровне rolldown.
  platform: 'neutral',
  inputOptions: { platform: 'browser' },
  target: 'es2022',
  dts: false,
  clean: false,
  fixedExtension: false,
  deps: { neverBundle: ['react', /^@deepseek-ai\//] },
  sourcemap: false,
})

const body = await readFile(bodyPath, 'utf8')
const indented = body
  .split('\n')
  .map((line) => (line.length > 0 ? `    ${line}` : line))
  .join('\n')

const wrapped = `/**
 * Клиентская половина ${pkg.name}: собранный бандл.
 *
 * Файл создаётся \`node tools/build-client.mjs\` из \`src/client/*\`; править
 * его руками нельзя — следующая сборка перезапишет. Исходники и правила лежат
 * в репозитории рядом.
 *
 * @module ${pkg.name}/client
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
${indented}
    return module.exports
  },
})
`

await writeFile(join(root, 'client.js'), wrapped, 'utf8')
await rm(cacheDir, { recursive: true, force: true })
console.log(`built client.js (${pkg.name}@${pkg.version})`)
