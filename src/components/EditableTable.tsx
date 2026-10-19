import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownAZ, ArrowUpAZ, ChevronDown, Copy, Plus, Trash2, X } from 'lucide-react'
import { clampColumnWidth, insertTableColumn, parseMarkdownTable, removeTableColumn, serializeMarkdownTable } from '../utils/markdownTable'
import type { MarkdownTable } from '../utils/markdownTable'

interface Props {
  markdown: string
  readOnly: boolean
  onChange: (markdown: string) => void
  onDelete: () => void
  onExit: () => void
  renderInline: (text: string) => string
}
type Cell = { row: number; column: number }
type Menu = { kind: 'column' | 'row'; index: number; left: number; top: number }

function TableMenuAction({ label, onClick, Icon = Plus, disabled = false, danger = false }: {
  label: string; onClick: () => void; Icon?: typeof Plus; disabled?: boolean; danger?: boolean
}) {
  return <button role="menuitem" disabled={disabled} className={danger ? 'danger' : ''} onClick={onClick}><Icon size={15} />{label}</button>
}

export function EditableTable({ markdown, readOnly, onChange, onDelete, onExit, renderInline }: Props) {
  const [table, setTable] = useState(() => parseMarkdownTable(markdown))
  const latest = useRef(table)
  const root = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const history = useRef<MarkdownTable[]>([])
  const future = useRef<MarkdownTable[]>([])
  const dragCleanup = useRef<(() => void) | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [active, setActive] = useState<Cell | null>(null)
  const [filter, setFilter] = useState<{ column: number; value: string } | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => () => dragCleanup.current?.(), [])
  useEffect(() => {
    if (!menu) return
    popup.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const dismiss = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node)) setMenu(null) }
    const close = () => setMenu(null)
    const closeOnScroll = (event: Event) => {
      if (popup.current?.contains(event.target as Node) || root.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close); window.removeEventListener('scroll', closeOnScroll, true) }
  }, [menu])

  const commit = (next: MarkdownTable) => {
    if (next === latest.current) return
    history.current = [...history.current.slice(-99), latest.current]
    future.current = []
    latest.current = next
    setTable(next)
    onChange(serializeMarkdownTable(next))
  }
  const focusCell = (cell: Cell) => {
    const previousFocus = document.activeElement
    requestAnimationFrame(() => {
      // A later click/focus takes precedence over a scheduled table-cell focus.
      if (document.activeElement !== previousFocus && document.activeElement !== document.body) return
      root.current?.querySelector<HTMLTextAreaElement>(`[data-row="${cell.row}"][data-column="${cell.column}"]`)?.focus()
    })
  }
  const addRow = (index: number, duplicate = false) => {
    const current = latest.current
    const row = duplicate ? [...current.rows[index - 1]] : current.columns.map(() => '')
    commit({ ...current, rows: [...current.rows.slice(0, index), row, ...current.rows.slice(index)] })
    setFilter(null)
    focusCell({ row: index, column: 0 })
  }
  const editCell = (cell: Cell, value: string) => {
    const current = latest.current
    if (cell.row === -1) commit({ ...current, columns: current.columns.map((text, index) => index === cell.column ? value : text) })
    else commit({ ...current, rows: current.rows.map((row, index) => index === cell.row ? row.map((text, column) => column === cell.column ? value : text) : row) })
  }
  const openMenu = (event: React.MouseEvent, kind: Menu['kind'], index: number) => {
    event.preventDefault(); event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    setMenu({ kind, index, left: Math.max(8, Math.min(bounds.left, innerWidth - 264)), top: Math.max(8, Math.min(bounds.bottom + 4, innerHeight - 390)) })
  }
  const resize = (event: React.PointerEvent, column: number) => {
    event.preventDefault(); event.stopPropagation()
    dragCleanup.current?.()
    const current = latest.current
    const start = event.clientX
    let width = current.widths[column]
    const move = (next: PointerEvent) => {
      width = clampColumnWidth(current.widths[column] + next.clientX - start)
      setTable({ ...current, widths: current.widths.map((value, index) => index === column ? width : value) })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      dragCleanup.current = null
    }
    const up = () => { cleanup(); commit({ ...current, widths: current.widths.map((value, index) => index === column ? width : value) }) }
    const cancel = () => { cleanup(); setTable(current) }
    dragCleanup.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
  const cellKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, cell: Cell) => {
    if (event.nativeEvent.isComposing) return
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault()
      const redo = event.shiftKey || event.key.toLowerCase() === 'y'
      const source = redo ? future : history
      const destination = redo ? history : future
      const next = source.current.pop()
      if (next) { destination.current.push(latest.current); latest.current = next; setTable(next); setFilter(null); onChange(serializeMarkdownTable(next)) }
      return
    }
    if (event.key === 'Escape') { event.preventDefault(); onExit(); return }
    if (event.key === 'Tab') {
      event.preventDefault()
      const visibleRows = table.rows.map((row, index) => ({ row, index })).filter(({ row }) => !filter?.value || row[filter.column].toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())).map(({ index }) => index)
      const cells = [-1, ...visibleRows].flatMap(row => table.columns.map((_, column) => ({ row, column })))
      const index = cells.findIndex(value => value.row === cell.row && value.column === cell.column)
      const next = cells[index + (event.shiftKey ? -1 : 1)]
      if (next) focusCell(next)
      else if (!event.shiftKey) addRow(table.rows.length)
      else onExit()
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (cell.row === table.rows.length - 1 || !table.rows.length) addRow(table.rows.length)
      else focusCell({ ...cell, row: cell.row + 1 })
    }
  }
  const paste = (event: React.ClipboardEvent<HTMLTextAreaElement>, cell: Cell) => {
    const text = event.clipboardData.getData('text/plain')
    if (!text.includes('\t')) return
    event.preventDefault()
    const grid = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'))
    const current = latest.current
    let next: MarkdownTable = { ...current, columns: [...current.columns], rows: current.rows.map(row => [...row]), widths: [...current.widths], alignments: [...current.alignments] }
    const count = Math.max(...grid.map(row => row.length)) + cell.column
    while (next.columns.length < count) next = insertTableColumn(next, next.columns.length)
    for (let row = 0; row < grid.length; row++) {
      const index = cell.row + row
      while (index >= next.rows.length) next.rows.push(next.columns.map(() => ''))
      const destination = index === -1 ? next.columns : next.rows[index]
      grid[row].forEach((value, column) => { destination[cell.column + column] = value })
    }
    commit(next)
  }
  const renderCell = (text: string, cell: Cell) => readOnly
    ? <div className="pyrita-table-value" dangerouslySetInnerHTML={{ __html: text.split('\n').map(renderInline).join('<br>') }} />
    : <textarea rows={1} data-row={cell.row} data-column={cell.column} aria-label={cell.row === -1 ? `Nome da coluna ${cell.column + 1}` : `${table.columns[cell.column] || `Coluna ${cell.column + 1}`}, linha ${cell.row + 1}`} placeholder={cell.row === -1 ? 'Nome da coluna' : ''} value={text} spellCheck onFocus={() => setActive(cell)} onChange={event => editCell(cell, event.target.value)} onKeyDown={event => cellKeyDown(event, cell)} onPaste={event => paste(event, cell)} />

  return <div ref={root} className={`pyrita-table ${readOnly ? 'is-reading' : ''}`} contentEditable={false} onInput={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}>
    {!readOnly && <div className="pyrita-table-toolbar"><span><TableLabel />{table.rows.length} {table.rows.length === 1 ? 'linha' : 'linhas'} · {table.columns.length} colunas</span><div><button aria-label="Adicionar coluna" onClick={() => { commit(insertTableColumn(table, table.columns.length)); focusCell({ row: -1, column: table.columns.length }) }}><Plus size={13} />Coluna</button><button aria-label="Excluir tabela" title="Excluir tabela" onClick={() => setDeletePending(true)}><Trash2 size={14} /></button></div></div>}
    {!readOnly && filter && <div className="pyrita-table-filter"><label>Filtrar {table.columns[filter.column]}<input autoFocus placeholder="Buscar nesta coluna…" value={filter.value} onChange={event => setFilter({ ...filter, value: event.target.value })} /></label><button title="Limpar filtro" onClick={() => setFilter(null)}><X size={14} /></button></div>}
    <div className="pyrita-table-scroll"><table aria-label="Tabela da nota" style={{ width: table.widths.reduce((sum, width) => sum + width, 0) + (readOnly ? 0 : 38) }}>
      <colgroup>{!readOnly && <col style={{ width: 38 }} />}{table.widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr>{!readOnly && <th className="pyrita-table-gutter" aria-label="Linhas" />}{table.columns.map((text, column) => <th key={column} style={{ textAlign: table.alignments[column] }}>
        <div className="pyrita-table-heading">{renderCell(text, { row: -1, column })}{!readOnly && <button aria-label={`Opções da coluna ${column + 1}`} title="Opções da coluna" onClick={event => openMenu(event, 'column', column)}><ChevronDown size={14} /></button>}</div>
        {!readOnly && <span className="pyrita-table-resize" role="separator" aria-label={`Redimensionar coluna ${column + 1}`} aria-orientation="vertical" aria-valuenow={table.widths[column]} aria-valuemin={120} aria-valuemax={640} tabIndex={0} onPointerDown={event => resize(event, column)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); commit({ ...table, widths: table.widths.map((width, index) => index === column ? clampColumnWidth(width + (event.key === 'ArrowRight' ? 16 : -16)) : width) }) } }} />}
      </th>)}</tr></thead>
      <tbody>{table.rows.map((row, rowIndex) => {
        if (!readOnly && filter?.value && !row[filter.column].toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())) return null
        return <tr key={rowIndex}>{!readOnly && <td className="pyrita-table-gutter"><button aria-label={`Opções da linha ${rowIndex + 1}`} title="Opções da linha" onClick={event => openMenu(event, 'row', rowIndex)}>{rowIndex + 1}</button></td>}{row.map((text, column) => <td key={column} className={active?.row === rowIndex && active.column === column ? 'is-active' : ''} style={{ textAlign: table.alignments[column] }}>{renderCell(text, { row: rowIndex, column })}</td>)}</tr>
      })}</tbody>
    </table></div>
    {!readOnly && <div className="pyrita-table-footer"><button aria-label="Adicionar linha" onClick={() => addRow(table.rows.length)}><Plus size={15} />Nova linha</button><span>Tab para navegar · Shift+Enter para quebra de linha</span></div>}
    {!readOnly && deletePending && <div className="pyrita-table-confirm" role="alert"><span>Excluir esta tabela e todo o seu conteúdo?</span><button className="danger" onClick={onDelete}>Excluir tabela</button><button onClick={() => setDeletePending(false)}>Cancelar</button></div>}
    {!readOnly && menu && createPortal(<div ref={popup} role="menu" aria-label={menu.kind === 'column' ? 'Gerenciar coluna' : 'Gerenciar linha'} className="pyrita-table-menu" style={{ left: menu.left, top: menu.top }} onClick={event => { if ((event.target as HTMLElement).closest('button')) setMenu(null) }} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { setMenu(null); focusCell({ row: menu.kind === 'column' ? -1 : menu.index, column: menu.kind === 'column' ? menu.index : 0 }) }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const buttons = Array.from(popup.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }
    }}>
      {menu.kind === 'column' ? <>
        <TableMenuAction label="Renomear coluna" Icon={ChevronDown} onClick={() => { focusCell({ row: -1, column: menu.index }); requestAnimationFrame(() => root.current?.querySelector<HTMLTextAreaElement>(`[data-row="-1"][data-column="${menu.index}"]`)?.select()) }} />
        <TableMenuAction label="Inserir coluna à esquerda" onClick={() => { setFilter(null); commit(insertTableColumn(table, menu.index)); focusCell({ row: -1, column: menu.index }) }} />
        <TableMenuAction label="Inserir coluna à direita" onClick={() => { setFilter(null); commit(insertTableColumn(table, menu.index + 1)); focusCell({ row: -1, column: menu.index + 1 }) }} />
        <hr />
        <TableMenuAction label="Classificar crescente" Icon={ArrowDownAZ} onClick={() => commit({ ...table, rows: [...table.rows].sort((a, b) => a[menu.index].localeCompare(b[menu.index], 'pt-BR', { numeric: true, sensitivity: 'base' })) })} />
        <TableMenuAction label="Classificar decrescente" Icon={ArrowUpAZ} onClick={() => commit({ ...table, rows: [...table.rows].sort((a, b) => b[menu.index].localeCompare(a[menu.index], 'pt-BR', { numeric: true, sensitivity: 'base' })) })} />
        <TableMenuAction label="Filtrar por esta coluna" Icon={ChevronDown} onClick={() => setFilter({ column: menu.index, value: '' })} />
        <hr />
        <TableMenuAction label="Excluir coluna" Icon={Trash2} disabled={table.columns.length <= 1} danger onClick={() => { setFilter(null); commit(removeTableColumn(table, menu.index)) }} />
      </> : <>
        <TableMenuAction label="Inserir linha acima" onClick={() => addRow(menu.index)} />
        <TableMenuAction label="Inserir linha abaixo" onClick={() => addRow(menu.index + 1)} />
        <TableMenuAction label="Duplicar linha" Icon={Copy} onClick={() => addRow(menu.index + 1, true)} />
        <hr />
        <TableMenuAction label="Excluir linha" Icon={Trash2} danger onClick={() => commit({ ...table, rows: table.rows.filter((_, index) => index !== menu.index) })} />
      </>}
    </div>, document.body)}
  </div>
}

function TableLabel() {
  return <span className="pyrita-table-label">Tabela</span>
}
