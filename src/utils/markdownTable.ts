export type TableAlignment = 'left' | 'center' | 'right'
export interface MarkdownTable {
  columns: string[]
  rows: string[][]
  alignments: TableAlignment[]
  widths: number[]
  rowColors?: Record<number, string>
  colColors?: Record<number, string>
  cellColors?: Record<string, string> // format: "${row}:${col}", e.g. "-1:0" for header, "0:1" for body
}

export const DEFAULT_TABLE = '| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |'
export const TABLE_METADATA = /^<!-- (?:pyrite|pyrita)-table:(.*?) -->$/
export const clampColumnWidth = (width: number) => Math.max(48, Math.min(800, width))

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
  let rowColors: Record<number, string> | undefined
  let colColors: Record<number, string> | undefined
  let cellColors: Record<string, string> | undefined

  const metadata = lines.find(line => TABLE_METADATA.test(line.trim()))
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata.trim().match(TABLE_METADATA)![1])
      if (Array.isArray(parsed.widths)) widths = columns.map((_, index) => Number.isFinite(parsed.widths[index]) ? clampColumnWidth(parsed.widths[index]) : 180)
      if (parsed.rowColors && typeof parsed.rowColors === 'object') rowColors = parsed.rowColors
      if (parsed.colColors && typeof parsed.colColors === 'object') colColors = parsed.colColors
      if (parsed.cellColors && typeof parsed.cellColors === 'object') cellColors = parsed.cellColors
    } catch { /* Malformed optional metadata must not affect table contents. */ }
  }
  return {
    columns, alignments, widths,
    rowColors, colColors, cellColors,
    rows: rows.map(cells => columns.map((_, index) => cells[index] || ''))
  }
}

export function serializeMarkdownTable(table: MarkdownTable): string {
  const escapeCell = (cell: string) => {
    let result = ''
    let wiki = false
    for (let i = 0; i < cell.length; i++) {
      if (cell.slice(i, i + 2) === '[[') wiki = true
      if (cell.slice(i, i + 2) === ']]') { wiki = false; result += ']]'; i++; continue }
      if (cell[i] === '|' && !wiki) {
        result += '\\|'
      } else {
        result += cell[i]
      }
    }
    return result.replace(/\r?\n/g, '<br>')
  }
  const row = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`
  const separators = table.columns.map((_, index) => table.alignments[index] === 'center' ? ':---:' : table.alignments[index] === 'right' ? '---:' : '---')
  const lines = [row(table.columns), row(separators), ...table.rows.map(cells => row(table.columns.map((_, index) => cells[index] || '')))]

  const metadataObj: Record<string, any> = {}
  if (table.widths.some(width => width !== 180)) metadataObj.widths = table.widths
  if (table.rowColors && Object.keys(table.rowColors).length > 0) metadataObj.rowColors = table.rowColors
  if (table.colColors && Object.keys(table.colColors).length > 0) metadataObj.colColors = table.colColors
  if (table.cellColors && Object.keys(table.cellColors).length > 0) metadataObj.cellColors = table.cellColors

  if (Object.keys(metadataObj).length > 0) {
    lines.push(`<!-- pyrite-table:${JSON.stringify(metadataObj)} -->`)
  }
  return lines.join('\n')
}

export function insertTableColumn(table: MarkdownTable, index: number): MarkdownTable {
  const insert = <T,>(values: T[], value: T) => [...values.slice(0, index), value, ...values.slice(index)]

  let colColors: Record<number, string> | undefined
  if (table.colColors) {
    colColors = {}
    for (const [k, v] of Object.entries(table.colColors)) {
      const colNum = Number(k)
      if (colNum >= index) {
        colColors[colNum + 1] = v
      } else {
        colColors[colNum] = v
      }
    }
  }

  let cellColors: Record<string, string> | undefined
  if (table.cellColors) {
    cellColors = {}
    for (const [key, color] of Object.entries(table.cellColors)) {
      const [rStr, cStr] = key.split(':')
      const r = Number(rStr)
      const c = Number(cStr)
      if (c >= index) {
        cellColors[`${r}:${c + 1}`] = color
      } else {
        cellColors[`${r}:${c}`] = color
      }
    }
  }

  return {
    ...table,
    columns: insert(table.columns, 'Nova coluna'),
    rows: table.rows.map(row => insert(row, '')),
    alignments: insert(table.alignments, 'left'),
    widths: insert(table.widths, 180),
    colColors: colColors && Object.keys(colColors).length > 0 ? colColors : undefined,
    cellColors: cellColors && Object.keys(cellColors).length > 0 ? cellColors : undefined
  }
}

export function removeTableColumn(table: MarkdownTable, index: number): MarkdownTable {
  if (table.columns.length <= 1) return table
  const remove = <T,>(values: T[]) => values.filter((_, position) => position !== index)

  let colColors: Record<number, string> | undefined
  if (table.colColors) {
    colColors = {}
    for (const [k, v] of Object.entries(table.colColors)) {
      const colNum = Number(k)
      if (colNum === index) continue
      if (colNum > index) {
        colColors[colNum - 1] = v
      } else {
        colColors[colNum] = v
      }
    }
  }

  let cellColors: Record<string, string> | undefined
  if (table.cellColors) {
    cellColors = {}
    for (const [key, color] of Object.entries(table.cellColors)) {
      const [rStr, cStr] = key.split(':')
      const r = Number(rStr)
      const c = Number(cStr)
      if (c === index) continue
      if (c > index) {
        cellColors[`${r}:${c - 1}`] = color
      } else {
        cellColors[`${r}:${c}`] = color
      }
    }
  }

  return {
    ...table,
    columns: remove(table.columns),
    rows: table.rows.map(remove),
    alignments: remove(table.alignments),
    widths: remove(table.widths),
    colColors: colColors && Object.keys(colColors).length > 0 ? colColors : undefined,
    cellColors: cellColors && Object.keys(cellColors).length > 0 ? cellColors : undefined
  }
}

export function insertTableRow(table: MarkdownTable, index: number, duplicate = false): MarkdownTable {
  const newRow = duplicate && index > 0
    ? [...table.rows[index - 1]]
    : table.columns.map(() => '')

  let rowColors: Record<number, string> | undefined
  if (table.rowColors) {
    rowColors = {}
    for (const [k, v] of Object.entries(table.rowColors)) {
      const r = Number(k)
      if (r >= index) {
        rowColors[r + 1] = v
      } else {
        rowColors[r] = v
      }
    }
    if (duplicate && index > 0 && table.rowColors[index - 1]) {
      rowColors[index] = table.rowColors[index - 1]
    }
  }

  let cellColors: Record<string, string> | undefined
  if (table.cellColors) {
    cellColors = {}
    for (const [k, v] of Object.entries(table.cellColors)) {
      const [rStr, cStr] = k.split(':')
      const r = Number(rStr)
      const c = Number(cStr)
      if (r >= index) {
        cellColors[`${r + 1}:${c}`] = v
      } else {
        cellColors[`${r}:${c}`] = v
      }
    }
    if (duplicate && index > 0) {
      for (let c = 0; c < table.columns.length; c++) {
        if (table.cellColors[`${index - 1}:${c}`]) {
          cellColors[`${index}:${c}`] = table.cellColors[`${index - 1}:${c}`]
        }
      }
    }
  }

  return {
    ...table,
    rows: [...table.rows.slice(0, index), newRow, ...table.rows.slice(index)],
    rowColors: rowColors && Object.keys(rowColors).length > 0 ? rowColors : undefined,
    cellColors: cellColors && Object.keys(cellColors).length > 0 ? cellColors : undefined
  }
}

export function removeTableRow(table: MarkdownTable, index: number): MarkdownTable {
  if (table.rows.length <= 1) {
    return {
      ...table,
      rows: [table.columns.map(() => '')],
      rowColors: undefined,
      cellColors: undefined
    }
  }

  let rowColors: Record<number, string> | undefined
  if (table.rowColors) {
    rowColors = {}
    for (const [k, v] of Object.entries(table.rowColors)) {
      const r = Number(k)
      if (r === index) continue
      if (r > index) {
        rowColors[r - 1] = v
      } else {
        rowColors[r] = v
      }
    }
  }

  let cellColors: Record<string, string> | undefined
  if (table.cellColors) {
    cellColors = {}
    for (const [k, v] of Object.entries(table.cellColors)) {
      const [rStr, cStr] = k.split(':')
      const r = Number(rStr)
      const c = Number(cStr)
      if (r === index) continue
      if (r > index) {
        cellColors[`${r - 1}:${c}`] = v
      } else {
        cellColors[`${r}:${c}`] = v
      }
    }
  }

  return {
    ...table,
    rows: table.rows.filter((_, idx) => idx !== index),
    rowColors: rowColors && Object.keys(rowColors).length > 0 ? rowColors : undefined,
    cellColors: cellColors && Object.keys(cellColors).length > 0 ? cellColors : undefined
  }
}

export function setTableColor(
  table: MarkdownTable,
  target: { type: 'cell' | 'row' | 'col'; row?: number; col?: number },
  color: string
): MarkdownTable {
  const isClear = !color || color === 'transparent' || color === 'default'

  if (target.type === 'cell' && target.row !== undefined && target.col !== undefined) {
    const key = `${target.row}:${target.col}`
    const nextCellColors = { ...(table.cellColors || {}) }
    if (isClear) {
      delete nextCellColors[key]
    } else {
      nextCellColors[key] = color
    }
    return {
      ...table,
      cellColors: Object.keys(nextCellColors).length > 0 ? nextCellColors : undefined
    }
  }

  if (target.type === 'row' && target.row !== undefined) {
    const nextRowColors = { ...(table.rowColors || {}) }
    if (isClear) {
      delete nextRowColors[target.row]
    } else {
      nextRowColors[target.row] = color
    }
    return {
      ...table,
      rowColors: Object.keys(nextRowColors).length > 0 ? nextRowColors : undefined
    }
  }

  if (target.type === 'col' && target.col !== undefined) {
    const nextColColors = { ...(table.colColors || {}) }
    if (isClear) {
      delete nextColColors[target.col]
    } else {
      nextColColors[target.col] = color
    }
    return {
      ...table,
      colColors: Object.keys(nextColColors).length > 0 ? nextColColors : undefined
    }
  }

  return table
}
