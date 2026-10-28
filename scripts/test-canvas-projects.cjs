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
      if (!localStorage.getItem('canvas-seeded')) {
        const note={id:'note-1',title:'Pesquisa do projeto',content:'Conteúdo original da pesquisa.',folder:'Projeto',filePath:'D:/Cofre A/Projeto/Pesquisa do projeto.md',tags:[],createdAt:1,updatedAt:1}
        localStorage.setItem('pyrite_vault_notes',JSON.stringify([note])); localStorage.setItem('pyrite_vault_folders',JSON.stringify(['Projeto']))
        localStorage.setItem('pyrite_electron_vault_path','D:/Cofre A'); localStorage.setItem('canvas-seeded','1')
        localStorage.setItem('pyrite_canvas_cards',JSON.stringify([{id:'old',x:60,y:150,width:280,height:210,text:'Minha ideia antiga',title:'Legado',color:'#71717a'}]))
      }
      window.electronAPI={isElectron:false,
        readCanvas:async vault=>JSON.parse(localStorage.getItem('disk:'+vault)||'null'),
        writeCanvas:async(vault,document)=>{if(window.failSave)return {success:false,error:'Erro simulado de gravação'};localStorage.setItem('disk:'+vault,JSON.stringify(document));return {success:true}}
      }
    })
    await page.goto('http://127.0.0.1:'+server.address().port)
    const open=()=>page.getByTitle('Canvas Infinito',{exact:true}).click()
    await open()
    const selector=page.getByLabel('Selecionar quadro'), canvas=page.getByLabel('Quadro do projeto')
    await canvas.getByLabel('Conteúdo da ideia').waitFor(); assert.equal(await canvas.getByLabel('Conteúdo da ideia').inputValue(), 'Minha ideia antiga')
    assert.equal(await selector.locator('option').count(),2)
    const example=await selector.locator('option').filter({hasText:'Meu primeiro projeto'}).getAttribute('value')
    await selector.selectOption(example)
    await page.getByTitle('Enquadrar todos os cartões').click()
    assert.equal(await canvas.locator('.canvas-card').count(),3)
    await page.getByRole('button',{name:'Editar conexão: precisa de',exact:true}).click()
    await canvas.getByLabel('Nome da conexão').fill('depende de')
    await canvas.getByLabel('Fechar conexão').click()
    await page.getByRole('button',{name:'Novo quadro',exact:true}).click()
    await page.getByRole('dialog',{name:'Novo quadro'}).getByLabel('Nome do projeto').fill('Planejamento real')
    await page.getByRole('button',{name:'Criar quadro',exact:true}).click()
    assert.equal(await canvas.locator('.canvas-card').count(),0)
    await page.getByRole('button',{name:'Vincular nota',exact:true}).click()
    await page.getByLabel('Buscar nota para vincular').fill('Pesquisa')
    await page.locator('.canvas-note-picker').getByRole('button',{name:/Pesquisa do projeto/}).click()
    await page.getByText('Conteúdo original da pesquisa.',{exact:true}).waitFor()
    assert.equal(await canvas.locator('.canvas-card textarea').count(),0,'Linked notes are previews, not editable snapshots')
    await page.getByRole('button',{name:'Ideia',exact:true}).click()
    await canvas.getByLabel('Título da ideia').fill('Próxima ação')
    await canvas.getByLabel('Conteúdo da ideia').fill('Ler a pesquisa e definir a próxima entrega.')
    const idea=canvas.locator('.canvas-card').filter({has:page.getByLabel('Conteúdo da ideia')})
    const handle=idea.locator('.canvas-drag-handle'), before=await idea.boundingBox(), grip=await handle.boundingBox()
    await page.mouse.move(grip.x+4,grip.y+4);await page.mouse.down();await page.mouse.move(grip.x+80,grip.y+140,{steps:5});await page.mouse.up()
    const after=await idea.boundingBox();assert.ok(after.y>before.y+100,'Dragging the header moves cards')
    await canvas.getByLabel('Conectar Pesquisa do projeto').click()
    await canvas.getByLabel('Conectar Próxima ação').click()
    await canvas.getByLabel('Nome da conexão').fill('leva a')
    await canvas.getByLabel('Fechar conexão').click()
    await page.getByTitle('Enquadrar todos os cartões').click()
    await page.getByText('Salvo no cofre',{exact:true}).waitFor()
    await page.screenshot({path:path.join(dist,'canvas-project-preview.png')})
    // A new editor session changes runtime IDs; the relative file path must preserve the link.
    await page.evaluate(()=>{const notes=JSON.parse(localStorage.getItem('pyrite_vault_notes'));const note=notes.find(note=>note.title==='Pesquisa do projeto');note.id='new-session-id';note.content='Pesquisa atualizada na nota original.';localStorage.setItem('pyrite_vault_notes',JSON.stringify(notes))})
    await page.reload();await open()
    await page.getByText('Pesquisa atualizada na nota original.',{exact:true}).waitFor()
    assert.equal(await selector.locator('option:checked').innerText(),'Planejamento real')
    assert.equal(await canvas.getByLabel('Conteúdo da ideia').inputValue(),'Ler a pesquisa e definir a próxima entrega.')
    await canvas.getByTitle('Abrir nota no editor',{exact:true}).click()
    await page.locator('.pyrite-editor-surface').waitFor()
    await open()
    // Failed native writes keep a recoverable local document and can be retried.
    await page.evaluate(()=>{window.failSave=true})
    await canvas.getByLabel('Conteúdo da ideia').fill('Alteração preservada localmente')
    await page.getByRole('alert').getByText('Erro simulado de gravação').waitFor()
    await page.evaluate(()=>{window.failSave=false})
    await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
    await page.getByText('Salvo no cofre',{exact:true}).waitFor()
    // Every vault has its own boards and legacy migration happens only once.
    await page.evaluate(()=>localStorage.setItem('pyrite_electron_vault_path','D:/Cofre B'))
    await page.reload();await open()
    await page.getByText('Salvo no cofre',{exact:true}).waitFor()
    assert.equal(await selector.locator('option').count(),1)
    assert.equal(await selector.locator('option:checked').innerText(),'Meu primeiro projeto')
    await page.evaluate(()=>localStorage.setItem('pyrite_electron_vault_path','D:/Cofre A'))
    await page.reload();await open()
    assert.equal(await canvas.getByLabel('Conteúdo da ideia').inputValue(),'Alteração preservada localmente')
    await canvas.getByLabel('Excluir quadro',{exact:true}).click()
    await page.getByRole('dialog',{name:'Excluir quadro'}).getByRole('button',{name:'Excluir quadro',exact:true}).click()
    assert.equal(await selector.locator('option').count(),2)
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pyrite_vault_notes')).filter(note=>note.title==='Pesquisa do projeto').length),1,'Deleting a board preserves source notes')
    assert.deepEqual(errors,[])
    console.log('PASS: legacy migration, multiple boards, note links across runtime IDs, drag, named edges, save/reload, recovery, vault isolation and safe deletion')
  } catch(error) { await page?.screenshot({path:path.join(dist,'canvas-project-failure.png')}); throw error } finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1})
