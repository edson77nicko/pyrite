export type TableAlignment = 'left' | 'center' | 'right'
export interface MarkdownTable {
  columns: string[]
  rows: string[][]
  alignments: TableAlignment[]
  widths: number[]
}

export const DEFAULT_TABLE = '| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |'
export const TABLE_METADATA = /^<!-- pyrita-table:(.*?) -->$/
export const clampColumnWidth = (width: number) => Math.max(120, Math.min(640, width))

/** Split actual delimiters, preserving escaped pipes, wikilink aliases and code. */
export function splitTableRow(line: string): string[] {
  let source = line.trim()
  if (source.startsWith('|')) source = source.slice(1)
  if (source.endsWith('|')) {
    let backslashes = 0
    for (let index = source.length - 2; index >= 0 && source[index] === '\\'; index--) backslashes++
    if (backslashes % 2 === 0) source = source.slice(0, -1)
  }
  const cells: string[] = []
  let cell = ''
  let wiki = false
  let code = false
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character === '\\' && ['|', '\\'].includes(source[index + 1])) { cell += source[++index]; continue }
    if (source.slice(index, index + 2) === '[[') wiki = true
    if (source.slice(index, index + 2) === ']]') wiki = false
    if (character === '`') code = !code
    if (character === '|' && !wiki && !code) { cells.push(cell.trim().replace(/<br\s*\/?\s*>/gi, '\n')); cell = '' }
    else cell += character
  }
  cells.push(cell.trim().replace(/<br\s*\/?\s*>/gi, '\n'))
  return cells
}

export function parseMarkdownTable(markdown: string): MarkdownTable {
  const lines = markdown.split('\n')
  const tableLines = lines.filter(line => line.trim().startsWith('|'))
  const columns = splitTableRow(tableLines[0] || '| Coluna 1 |')
  const rows = tableLines.slice(2).map(splitTableRow)
  const columnCount = Math.max(columns.length, ...rows.map(row => row.length))
  while (columns.length < columnCount) columns.push(`Coluna ${columns.length + 1}`)
  const separators = splitTableRow(tableLines[1] || '')
  const alignments: TableAlignment[] = columns.map((_, index) => {
    const separator = separators[index] || ''
    return separator.startsWith(':') && separator.endsWith(':') ? 'center' : separator.endsWith(':') ? 'right' : 'left'
  })
  let widths = columns.map(() => 180)
  const metadata = lines.find(line => TABLE_METADATA.test(line.trim()))
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata.trim().match(TABLE_METADATA)![1])
      if (Array.isArray(parsed.widths)) widths = columns.map((_, index) => Number.isFinite(parsed.widths[index]) ? clampColumnWidth(parsed.widths[index]) : 180)
    } catch { /* Malformed optional metadata must not affect table contents. */ }
  }
  return {
    columns, alignments, widths,
    rows: rows.map(cells => columns.map((_, index) => cells[index] || ''))
  }
}

export function serializeMarkdownTable(table: MarkdownTable): string {
  const escapeCell = (cell: string) => cell.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  const row = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`
  const separators = table.columns.map((_, index) => table.alignments[index] === 'center' ? ':---:' : table.alignments[index] === 'right' ? '---:' : '---')
  const lines = [row(table.columns), row(separators), ...table.rows.map(cells => row(table.columns.map((_, index) => cells[index] || '')))]
  if (table.widths.some(width => width !== 180)) lines.push(`<!-- pyrita-table:${JSON.stringify({ widths: table.widths })} -->`)
  return lines.join('\n')
}

export function insertTableColumn(table: MarkdownTable, index: number): MarkdownTable {
  const insert = <T,>(values: T[], value: T) => [...values.slice(0, index), value, ...values.slice(index)]
  return { columns: insert(table.columns, 'Nova coluna'), rows: table.rows.map(row => insert(row, '')), alignments: insert(table.alignments, 'left'), widths: insert(table.widths, 180) }
}

export function removeTableColumn(table: MarkdownTable, index: number): MarkdownTable {
  if (table.columns.length <= 1) return table
  const remove = <T,>(values: T[]) => values.filter((_, position) => position !== index)
  return { columns: remove(table.columns), rows: table.rows.map(remove), alignments: remove(table.alignments), widths: remove(table.widths) }
}
