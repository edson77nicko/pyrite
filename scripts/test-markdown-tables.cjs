const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/utils/markdownTable.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
const loaded = { exports: {} }
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { parseMarkdownTable, serializeMarkdownTable, splitTableRow, insertTableColumn, removeTableColumn } = loaded.exports

const table = parseMarkdownTable('| Nome | Valor | Notas |\n| :--- | ---: | :---: |\n| Olivia | 10 | Primeira<br>Segunda |\n| Preston | 20 | [[Outra nota|apelido]] |')
assert.deepEqual(table.alignments, ['left', 'right', 'center'])
assert.equal(table.rows[0][2], 'Primeira\nSegunda')
assert.equal(table.rows[1][2], '[[Outra nota|apelido]]')
table.rows.push(['A | B', 'C:\\Users\\teste', '**negrito** e `a|b`'])
table.widths = [240, 160, 320]
assert.deepEqual(parseMarkdownTable(serializeMarkdownTable(table)), table, 'Round trip preserves text, widths, alignment, pipes, slashes and newlines')
assert.deepEqual(splitTableRow('| a\\|b | c |'), ['a|b', 'c'])
const inserted = insertTableColumn(table, 1)
assert.equal(inserted.columns.length, 4)
assert.deepEqual(inserted.rows[2], ['A | B', '', 'C:\\Users\\teste', '**negrito** e `a|b`'])
assert.deepEqual(removeTableColumn(inserted, 1), table)
const lastColumn = parseMarkdownTable('| Única |\n| --- |\n| dado |')
assert.equal(removeTableColumn(lastColumn, 0), lastColumn)
assert.equal(parseMarkdownTable('| A |\n| --- |\n<!-- pyrita-table:broken -->').columns[0], 'A')
assert.deepEqual(parseMarkdownTable('| A |\n| --- |\n| dado | extra |').rows[0], ['dado', 'extra'], 'Never discard cells from uneven imported rows')
console.log('Markdown table preservation checks passed.')
