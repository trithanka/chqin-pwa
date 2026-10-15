import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Run with: node --test apps/api/src/architecture.test.js
//
// The backend is a set of domain modules. These rules keep them that way:
//
//   modules/<name>/    one domain. Other modules reach it only through its
//                      index.js, never into a file inside it.
//   shared/            the kernel: database, lib, outbox. It knows no domain.
//   integrations/      adapters to outside services. They may call domains;
//                      no domain calls them.
//   app.js, index.js   wire everything. Only app.js mounts a module's routes.
//
// Known debt, not checked here because it goes through the shared schema
// rather than an import: modules/entry/sessions.js (loadAny,
// attachBookingByLookup) still reads hotel tables, so the engine is not yet
// fully hotel-free. Untangling it changes behaviour, so it was left alone.

const SRC = dirname(fileURLToPath(import.meta.url))

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  )

const files = walk(SRC).map((abs) => relative(SRC, abs))
const isTest = (f) => f.endsWith('.test.js')
const isSchema = (f) => f.endsWith('.schema.js')

const importsOf = (file) => {
  const text = readFileSync(join(SRC, file), 'utf8')
  const out = []
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|^import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    out.push(relative(SRC, normalize(join(SRC, dirname(file), m[1]))))
  }
  return out
}

// 'modules/hotel/x.js' -> 'hotel'; 'shared/..' -> 'shared'; 'app.js' -> 'root'
const area = (f) => {
  const [a, b] = f.split('/')
  if (a === 'modules') return `module:${b}`
  if (a === 'shared' || a === 'integrations') return a
  return 'root'
}

const violations = []
for (const file of files) {
  if (isTest(file)) continue
  const from = area(file)
  for (const target of importsOf(file)) {
    const to = area(target)
    if (from === to) {
      // a module's own files never go back through its own barrel
      if (from.startsWith('module:') && target === `modules/${from.slice(7)}/index.js` && file !== target) {
        violations.push(`${file} imports its own index.js`)
      }
      continue
    }
    if (from === 'root') {
      // app.js and index.js wire things; they may import anything
      continue
    }
    if (from === 'shared') {
      const tableOnly = (file === 'shared/db/schema.js' || file === 'shared/outbox/outbox.schema.js') && isSchema(target)
      if (to !== 'root' && !tableOnly) violations.push(`${file} (kernel) imports ${target}`)
      continue
    }
    if (to === 'root' || to === 'shared') continue
    if (to === 'integrations') {
      violations.push(`${file} imports ${target}: a domain must not call an integration`)
      continue
    }
    // module/integration -> another module: its barrel, or a table definition
    const ok = target === `modules/${to.slice(7)}/index.js` || isSchema(target)
    if (!ok) violations.push(`${file} reaches into ${target}; import ${to.slice(7)}'s index.js instead`)
    if (to === 'module:admin') violations.push(`${file} imports the admin module, which nothing else depends on`)
  }
}

test('modules reach each other only through index.js, and the kernel knows no domain', () => {
  assert.deepEqual(violations, [])
})

test('only app.js imports a module\'s route files', () => {
  const offenders = []
  for (const file of files) {
    if (isTest(file) || file === 'app.js') continue
    for (const target of importsOf(file)) {
      if (!/modules\/[^/]+\/routes\//.test(target)) continue
      // a module's own router files may compose each other (admin does)
      if (area(file) !== area(target)) offenders.push(`${file} imports ${target}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('every module another module imports has an index.js', () => {
  const needed = new Set()
  for (const file of files) {
    if (isTest(file)) continue
    for (const target of importsOf(file)) {
      if (target.endsWith('/index.js') && target.startsWith('modules/') && area(file) !== area(target)) needed.add(target)
    }
  }
  const present = new Set(files)
  assert.deepEqual([...needed].filter((t) => !present.has(t)), [])
})
