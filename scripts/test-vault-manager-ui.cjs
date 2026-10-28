// Run after npm run build. Optional arguments: Playwright package and Chromium executable.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium } = require(process.argv[2] || 'playwright')

async function main() {
  const dist = path.resolve(__dirname, '../dist')
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream')
    response.end(fs.readFileSync(file))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  let page
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.argv[3] })
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const original = { id: 'original', name: 'Obsidian original', path: 'D:/Obsidian', lastOpened: 1 }
      window.electronAPI = {
        isElectron: false,
        getKnownVaults: async () => [original],
        getVaultSettings: async () => ({ rootPath: localStorage.getItem('test-root') || 'D:/Pyrite/Cofres' }),
        setVaultRoot: async rootPath => { localStorage.setItem('test-root', rootPath); return { success: true, rootPath } },
        selectFolder: async () => window.nextFolder,
        duplicateVault: async params => { localStorage.setItem('test-copy', JSON.stringify(params)); return { success: true, vaultPath: (localStorage.getItem('test-root') || 'D:/Pyrite/Cofres') + '/' + params.vaultName } },
        createVault: async params => ({ success: true, vaultPath: params.parentPath + '/' + params.vaultName })
      }
    })
    await page.goto('http://127.0.0.1:' + server.address().port)
    const show = () => page.getByTitle('Alternar ou Gerenciar Cofres (Vault Switcher)', { exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Gerenciar cofres' })
    await show()
    await dialog.getByRole('button', { name: 'Opções de Obsidian original' }).click()
    await dialog.getByRole('menuitem', { name: 'Remover da lista' }).click()
    await dialog.getByText('Nenhum cofre na lista.').waitFor()
    await dialog.getByLabel('Fechar gerenciador de cofres').click()
    await show()
    assert.equal(await dialog.locator('[data-vault-path]').count(), 0)
    await page.reload(); await show()
    await dialog.getByText('Nenhum cofre na lista.').waitFor()
    await page.evaluate(() => { window.nextFolder = 'D:/Obsidian' })
    await dialog.getByRole('button', { name: 'Abrir original', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' }); await show()
    await dialog.getByRole('button', { name: 'Opções de Obsidian' }).click()
    await dialog.getByRole('menuitem', { name: 'Duplicar para meus cofres' }).click()
    await page.evaluate(() => { window.nextFolder = 'D:/Meus Cofres' })
    await dialog.getByRole('button', { name: 'Escolher pasta' }).click()
    await page.waitForFunction(() => localStorage.getItem('test-root') === 'D:/Meus Cofres')
    await dialog.getByRole('textbox', { name: 'Nome do cofre' }).fill('Meu Obsidian')
    await dialog.getByRole('button', { name: 'Copiar e abrir' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('test-copy'))), { sourcePath: 'D:/Obsidian', vaultName: 'Meu Obsidian' })
    assert.equal(await page.evaluate(() => localStorage.getItem('pyrite_electron_vault_path')), 'D:/Meus Cofres/Meu Obsidian')
    await page.reload(); await show()
    await dialog.getByText('D:/Meus Cofres', { exact: true }).waitFor()
    assert.equal(await dialog.locator('[data-vault-path]').count(), 2)
    await page.screenshot({ path: path.join(dist, 'vault-manager-preview.png') })
    assert.deepEqual(errors, [])
    console.log('PASS: removal survives reopening/reload, explicit restore, root selection, duplicate and open copy')
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

