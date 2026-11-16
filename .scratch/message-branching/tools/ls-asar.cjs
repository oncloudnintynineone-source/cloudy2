// Read-only directory listing for paths inside app.asar.
// Usage: ELECTRON_RUN_AS_NODE=1 <electron> ls-asar.cjs <dir> <depth> <outFile>
const fs = require('node:fs')
const path = require('node:path')

const dir = process.argv[2]
const depth = Number(process.argv[3] || 2)
const outFile = process.argv[4]

const lines = []
function walk(current, level) {
  let entries
  try {
    entries = fs.readdirSync(current, { withFileTypes: true })
  } catch (error) {
    lines.push(`${'  '.repeat(level)}! ${path.basename(current)}: ${error.code}`)
    return
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.name === 'node_modules' && level > 0) continue
    lines.push(`${'  '.repeat(level)}${entry.isDirectory() ? '[d]' : '   '} ${entry.name}`)
    if (entry.isDirectory() && level + 1 < depth) walk(path.join(current, entry.name), level + 1)
  }
}

lines.push(dir)
walk(dir, 0)
fs.writeFileSync(outFile, lines.join('\n'), 'utf8')
