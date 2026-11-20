#!/usr/bin/env node
/**
 * Проверка состава npm-тарбола.
 *
 * Собирает пакет «насухо» (`npm pack --dry-run --json`) и сверяет список файлов
 * с тем, что должно попасть к пользователю. Ошибка в `files` или забытый
 * артефакт сборки ловятся здесь, до публикации.
 *
 * Запуск: `node tools/assert-pack.mjs` из корня пакета.
 * Код возврата 1 — состав неверный, 0 — всё на месте.
 *
 * @module cvc-catalog-sync-plugin/tools/assert-pack
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Файлы, которые обязаны быть в тарболе ровно такими, как записаны. */
const REQUIRED_FILES = [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'README.md',
  'README.ru.md',
  'SECURITY.md',
  'CHANGELOG.md',
]

/** Группы файлов: хотя бы один файл под префиксом должен быть в тарболе. */
const REQUIRED_GROUPS = [
  ['lib/', 'хост-логика плагина'],
  ['docs/', 'документация и детальная страница'],
  ['locale/en.json', 'английский словарь'],
  ['locale/ru.json', 'русский словарь'],
]

/** Чего в публичном тарболе быть не должно. */
const FORBIDDEN = [
  [/^src\//, 'исходники клиента перед сборкой'],
  [/^tools\//, 'сборочные скрипты'],
  [/^test\//, 'тесты'],
  [/^\.github\//, 'конфигурация CI'],
  [/^_src-/, 'снимки приватных плагинов'],
  [/^node_modules\//, 'зависимости'],
  [/^package-lock\.json$/, 'lock-файл'],
  [/(^|\/)\.env(\.|$)/, 'файлы с секретами'],
  [/\.log$/, 'логи'],
]

/**
 * Запускает `npm pack --dry-run --json` и возвращает список путей.
 *
 * @returns {string[]} пути файлов внутри тарбола, с прямыми слэшами
 */
function packFileList () {
  const stdout = execSync('npm pack --dry-run --json', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const start = stdout.indexOf('[') === -1 ? stdout.indexOf('{') : stdout.indexOf('[')
  if (start === -1) throw new Error(`npm pack вернул не JSON:\n${stdout.slice(0, 500)}`)
  const parsed = JSON.parse(stdout.slice(start))
  const entry = Array.isArray(parsed) ? parsed[0] : parsed
  if (!entry || !Array.isArray(entry.files)) {
    throw new Error('npm pack --json не содержит списка files')
  }
  return entry.files.map((file) => String(file.path).replaceAll('\\', '/')).sort()
}

/**
 * Сверяет состав тарбола с ожидаемым и печатает отчёт.
 *
 * @param {string[]} files пути из тарбола
 * @returns {string[]} список проблем; пустой массив — состав верный
 */
function inspect (files) {
  const problems = []
  const present = new Set(files)

  for (const required of REQUIRED_FILES) {
    if (!present.has(required)) problems.push(`missing file: ${required}`)
  }

  for (const [prefix, why] of REQUIRED_GROUPS) {
    const hit = prefix.endsWith('/') ? [...present].some((file) => file.startsWith(prefix)) : present.has(prefix)
    if (!hit) problems.push(`missing ${prefix.endsWith('/') ? `${prefix}*` : prefix} (${why})`)
  }

  for (const file of files) {
    for (const [pattern, why] of FORBIDDEN) {
      if (pattern.test(file)) problems.push(`forbidden entry: ${file} (${why})`)
    }
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (!present.has('package.json')) {
    problems.push('missing file: package.json')
  } else if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
    problems.push(`package.json version is not semver: ${String(pkg.version)}`)
  }

  if (files.length === 0) problems.push('tarball is empty')

  return problems
}

const files = packFileList()
const problems = inspect(files)

console.log(`tarball: ${files.length} files`)
for (const file of files) console.log(`  ${file}`)

if (problems.length > 0) {
  console.error(`\npackage contents check failed (${problems.length}):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('\npackage contents: ok')
