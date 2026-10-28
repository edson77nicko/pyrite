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
      const note = { id: 'agent-ui', title: 'Interface de teste', content: '> [!TIP] Dica curta\n> Uma linha.\n\n| A | B |\n| --- | --- |\n| Um | Dois |', folder: 'Projeto/Subpasta', tags: [], createdAt: Date.now(), updatedAt: Date.now() }
      localStorage.setItem('pyrite_vault_notes', JSON.stringify([note]))
      localStorage.setItem('pyrite_vault_folders', JSON.stringify(['Projeto', 'Projeto/Subpasta']))
      window.electronAPI = {
        isElectron: false,
        aiGetAllConfigs: async () => ({ activeProvider: 'openrouter', providers: { openrouter: { model: 'test-model', hasKey: true } } }),
        aiChat: async params => { window.agentCalls = (window.agentCalls || 0) + 1; window.lastPrompt = params; await new Promise(resolve => setTimeout(resolve, 700)); return { success: true, text: 'Resposta de teste' } }
      }
    })
    await page.goto('http://127.0.0.1:' + server.address().port)
    await page.getByTitle('Interface de teste', { exact: true }).click()
    const callout = page.locator('.editor-callout')
    assert.equal(await callout.getByRole('button', { name: 'Escrever abaixo' }).count(), 0)
    const height = await callout.getByLabel('Conteúdo do callout').evaluate(el => el.getBoundingClientRect().height)
    assert.ok(height < 40, 'A single callout line should not reserve an empty extra line: ' + height)
    await callout.getByLabel('Conteúdo do callout').fill('Linha 1\nLinha 2\nLinha 3')
    assert.ok((await callout.getByLabel('Conteúdo do callout').boundingBox()).height > height)
    const table = page.locator('.pyrite-table table')
    const widths = await table.evaluate(el => ({ table: el.getBoundingClientRect().width, box: el.parentElement.clientWidth }))
    assert.ok(Math.abs(widths.table - widths.box) < 2, 'Two table columns should fill the container: ' + JSON.stringify(widths))
    await page.getByTitle('Agente Pyrite', { exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Mensagem para o agente' })
    assert.ok((await input.boundingBox()).height >= 44)
    await input.fill('Um\nDois\nTrês\nQuatro\nCinco\nSeis')
    const expanded = await input.boundingBox()
    assert.ok(expanded.height >= 80 && expanded.height <= 85)
    await input.fill('/')
    const commands = page.getByRole('listbox', { name: 'Comandos do agente' })
    await commands.getByRole('option').first().click()
    assert.ok((await input.inputValue()).length > 5)
    assert.equal(await page.evaluate(() => window.agentCalls || 0), 0)
    await input.press('End'); await input.type('Contexto adicional')
    await input.press('Shift+Enter')
    assert.equal(await page.evaluate(() => window.agentCalls || 0), 0)
    await input.fill('/')
    await input.press('ArrowDown'); await input.press('Enter')
    assert.ok((await input.inputValue()).length > 5)
    assert.equal(await page.evaluate(() => window.agentCalls || 0), 0)
    await input.fill('/comando inexistente')
    await input.press('Enter')
    assert.equal(await page.evaluate(() => window.agentCalls || 0), 0)
    await input.fill('Mensagem para teste')
    await input.press('Enter')
    await page.getByText('Preparando uma resposta para você…').waitFor()
    assert.equal(await page.getByText(/Processando com/).count(), 0)
    await page.getByText('Resposta de teste', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.agentCalls), 1)
    const trigger = page.getByTitle('Adicionar uma pasta inteira do cofre com hierarquia como contexto para a IA')
    await trigger.click()
    const picker = page.getByRole('dialog', { name: 'Selecionar pasta de contexto' })
    await picker.waitFor()
    const checkBounds = async () => {
      const box = await picker.boundingBox(), viewport = page.viewportSize()
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, 'Folder popup must fit viewport: ' + JSON.stringify(box))
      const hit = await picker.evaluate(el => { const b=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.right-8, b.top+8)) })
      assert.ok(hit, 'Folder popup must be above the editor')
    }
    await checkBounds()
    await page.screenshot({ path: path.join(dist, 'agent-refinements-preview.png') })
    await page.setViewportSize({ width: 960, height: 650 }); await page.waitForTimeout(150); await checkBounds()
    await picker.getByRole('textbox', { name: 'Filtrar pastas' }).fill('Projeto')
    await picker.getByText('Projeto', { exact: true }).click()
    await picker.waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => window.agentCalls), 1)
    assert.deepEqual(errors, [])
    console.log('PASS: compact callout, full-width table, 2–4 line composer, slash selection without sending, friendly status, portal positioning and folder selection')
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
