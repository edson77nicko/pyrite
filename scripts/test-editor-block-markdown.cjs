const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/utils/editorBlocks.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
const loaded = { exports: {} }
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { parseCodeInfo, serializeCodeBlock, serializeCallout } = loaded.exports

const code = { language: 'typescript', title: 'Exemplo "API" C:\\tmp', content: '<script>literal</script>\n```\n````\n\treturn "a|b";\n' }
const markdown = serializeCodeBlock(code)
const lines = markdown.split('\n')
assert.equal(lines[0].match(/^`+/)[0], '`````', 'Code fences in the contents cannot terminate the block')
assert.deepEqual(parseCodeInfo(lines[0].replace(/^`+/, '')), { language: code.language, title: code.title })
assert.equal(lines.slice(1, -1).join('\n'), code.content)
assert.deepEqual(parseCodeInfo('python'), { language: 'python', title: '' })
assert.deepEqual(parseCodeInfo('title="Sem linguagem"'), { language: '', title: 'Sem linguagem' })
assert.equal(serializeCallout({ type: 'tip', title: 'Dica de teste', content: 'Primeira\n\nSegunda' }), '> [!TIP] Dica de teste\n> Primeira\n> \n> Segunda')
assert.equal(serializeCallout({ type: 'TIP', title: '', content: '' }), '> [!TIP]\n> ')
console.log('Code and callout Markdown preservation checks passed.')
