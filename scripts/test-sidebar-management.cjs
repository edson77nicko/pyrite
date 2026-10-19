const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

async function main() {
  const temporary = fs.mkdtempSync(path.join(__dirname, '../.sidebar-test-'))
  const root = path.join(temporary, 'vault')
  fs.mkdirSync(root)
  let handler
  let trashed
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf8')
  const management = source.slice(source.indexOf("ipcMain.handle('vault:managePath'"))
  const javascript = ts.transpileModule(management, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText
  vm.runInNewContext(javascript, {
    fs, path,
    ipcMain: { handle: (_name, callback) => { handler = callback } },
    shell: { trashItem: async file => { trashed = file }, openPath: async () => '' }
  })
  const run = (action, source, destination) => handler(null, { vaultPath: root, action, source, destination })
  try {
    const original = path.join(root, 'original')
    fs.mkdirSync(path.join(original, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(original, 'nested/note.md'), 'Conteúdo preservado')
    const copy = path.join(root, 'copy')
    const copied = await run('copy', original, copy)
    assert.equal(copied.success, true, copied.error)
    assert.equal(fs.readFileSync(path.join(copy, 'nested/note.md'), 'utf8'), 'Conteúdo preservado')
    assert.equal((await run('copy', original, copy)).success, false, 'Never overwrite a destination')
    assert.equal((await run('move', original, path.join(original, 'nested/child'))).success, false)
    const moved = path.join(root, 'renamed')
    const renamed = await run('move', copy, moved)
    assert.equal(renamed.success, true, renamed.error)
    assert.equal(fs.existsSync(copy), false)
    assert.equal((await run('move', original, path.join(temporary, 'outside'))).success, false)
    assert.equal((await run('delete', root)).success, false, 'Protect the vault root')
    assert.equal((await run('delete', moved)).success, true)
    assert.equal(trashed, moved, 'Delete must use the recycle bin')
    assert.equal((await run('open', path.join(original, 'nested/note.md'))).success, true)
    console.log('Sidebar file management checks passed.')
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
