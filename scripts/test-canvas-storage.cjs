const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), ts = require('typescript')
function load(file, deps = {}) { const code = ts.transpileModule(require('node:fs').readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText; const module = { exports: {} }; new Function('require','module','exports',code)(name => deps[name] || require(name), module, module.exports); return module.exports }
async function main() {
  const helpers = load('src/utils/canvasBoards.ts'), storage = load('electron/canvasStorage.ts', { '../src/utils/canvasBoards': helpers })
  const board = helpers.createBoard('Projeto', true), document = { version: 1, activeBoardId: board.id, boards: [board] }
  assert.ok(helpers.isCanvasDocument(document)); assert.equal(helpers.isCanvasDocument({ ...document, boards: [null] }), false)
  const note = { id: 'new-runtime-id', title: 'Pesquisa', filePath: 'D:/Cópia/Pesquisa.md', folder: 'Início' }
  assert.equal(helpers.linkedNote({ noteId: 'old-runtime-id', notePath: 'Pesquisa.md' }, [note], 'D:/Cópia'), note)
  assert.equal(helpers.linkedNote({ notePath: 'Excluída.md' }, [note], 'D:/Cópia'), undefined)
  const legacy = helpers.initialCanvas({ getItem: key => key === 'pyrite_canvas_cards' ? JSON.stringify(board.cards) : '[]' }, true)
  assert.equal(legacy.boards.length, 2); assert.equal(legacy.boards[1].name, 'Canvas anterior')
  const fixture = await fs.mkdtemp(path.join(process.cwd(), '.canvas-test-'))
  try {
    const a=path.join(fixture,'A'), b=path.join(fixture,'B'); await fs.mkdir(a); await fs.mkdir(b)
    assert.equal(await storage.readCanvas(a), null)
    await Promise.all([storage.writeCanvas(a, document), storage.writeCanvas(a, { ...document, boards: [{...board, name:'Último nome'}] })])
    assert.equal((await storage.readCanvas(a)).boards[0].name, 'Último nome')
    assert.equal(await storage.readCanvas(b), null)
    await fs.cp(a, b, { recursive: true })
    assert.equal((await storage.readCanvas(b)).boards[0].name, 'Último nome')
    const file=path.join(a,'.pyrita','canvas.json'); await fs.writeFile(file, '{invalid')
    await assert.rejects(storage.readCanvas(a)); assert.equal(await fs.readFile(file,'utf8'),'{invalid')
    console.log('PASS: document validation, portable note links, legacy migration, vault isolation, ordered saves, portable copies and corruption preservation')
  } finally { assert.equal(path.dirname(fixture), process.cwd()); await fs.rm(fixture,{recursive:true,force:true}) }
}
main().catch(error => { console.error(error); process.exitCode=1 })
