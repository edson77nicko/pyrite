const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const ts = require('typescript')
function load(file) {
  const code = ts.transpileModule(require('node:fs').readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }; new Function('require', 'module', 'exports', code)(require, module, module.exports); return module.exports
}
async function main() {
  const catalog = load('src/utils/vaultCatalog.ts')
  const vault = { id: 'one', name: 'Original', path: 'D:\\Original', lastOpened: 1 }
  let state = catalog.mergeVaultCatalog({ vaults: [], hiddenPaths: [] }, [vault], vault.path)
  state = catalog.removeVaultFromCatalog(state, 'd:/original/')
  const storage = { getItem: key => key === catalog.VAULT_CATALOG_KEY ? JSON.stringify(state) : null }
  state = catalog.mergeVaultCatalog(catalog.loadVaultCatalog(storage), [vault], vault.path)
  assert.equal(state.vaults.length, 0, 'removed current/discovered vault stays removed after reload')
  state = catalog.openVaultInCatalog(state, vault.path)
  assert.equal(state.vaults.length, 1); assert.equal(state.hiddenPaths.length, 0)
  assert.equal(catalog.mergeVaultCatalog(state, [vault]).vaults.length, 1)
  const { createVaultLibrary } = load('electron/vaultLibrary.ts')
  const fixture = await fs.mkdtemp(path.join(process.cwd(), '.vault-test-'))
  try {
    const source = path.join(fixture, 'original'), root = path.join(fixture, 'cofres'), settingsPath = path.join(fixture, 'settings.json')
    await fs.mkdir(path.join(source, '.obsidian'), { recursive: true }); await fs.mkdir(root)
    await fs.writeFile(path.join(source, 'nota.md'), 'Original')
    await fs.writeFile(path.join(source, '.obsidian', 'app.json'), '{}')
    await fs.writeFile(path.join(source, 'anexo.bin'), Buffer.from([0, 255, 17]))
    let library = createVaultLibrary({ settingsPath, defaultRootPath: root })
    await library.setRoot(root)
    library = createVaultLibrary({ settingsPath, defaultRootPath: source })
    assert.equal((await library.getSettings()).rootPath, await fs.realpath(root))
    const { vaultPath } = await library.duplicateVault(source, 'Cópia')
    assert.equal(await fs.readFile(path.join(vaultPath, '.obsidian', 'app.json'), 'utf8'), '{}')
    assert.deepEqual(await fs.readFile(path.join(vaultPath, 'anexo.bin')), Buffer.from([0, 255, 17]))
    await fs.writeFile(path.join(vaultPath, 'nota.md'), 'Editado')
    assert.equal(await fs.readFile(path.join(source, 'nota.md'), 'utf8'), 'Original')
    await assert.rejects(library.duplicateVault(source, 'Cópia'), /Já existe/)
    await assert.rejects(library.createVault(root, 'Cópia'), /Já existe/)
    await assert.rejects(library.duplicateVault(source, '../inválido'), /válido/)
    const nested = path.join(source, 'nested'); await fs.mkdir(nested); await library.setRoot(nested)
    await assert.rejects(library.duplicateVault(source, 'Recursive'), /fora/)
    await library.setRoot(root)
    await fs.symlink(root, path.join(source, 'external'), 'junction')
    await assert.rejects(library.duplicateVault(source, 'Falha'), /fora/)
    assert.equal((await fs.readdir(root)).some(name => name.startsWith('.pyrita-copy-') || name === 'Falha'), false)
    await fs.unlink(path.join(source, 'external'))
    await fs.symlink(path.join(source, '.obsidian'), path.join(source, 'internal'), 'junction')
    const linked = await library.duplicateVault(source, 'Com link')
    assert.equal((await fs.lstat(path.join(linked.vaultPath, 'internal'))).isSymbolicLink(), false)
    assert.equal((await library.listManagedVaults()).length, 2)
    console.log('PASS: catalog persistence, explicit restore, copy isolation, attachments, settings, collisions, recursion and link cleanup')
  } finally {
    assert.equal(path.dirname(fixture), process.cwd())
    await fs.rm(fixture, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
