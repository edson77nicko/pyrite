import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownAZ, ArrowUpAZ, ChevronDown, Copy, Plus, Trash2, X, FileText } from 'lucide-react'
import { clampColumnWidth, insertTableColumn, parseMarkdownTable, removeTableColumn, serializeMarkdownTable } from '../utils/markdownTable'
import type { MarkdownTable } from '../utils/markdownTable'
import type { Note } from '../types'

interface Props {
  markdown: string
  readOnly: boolean
  onChange: (markdown: string) => void
  onDelete: () => void
  onExit: () => void
  renderInline: (text: string) => string
  onNavigate?: (title: string) => void
  allNotes?: Note[]
}
type Cell = { row: number; column: number }
type Menu = { kind: 'column' | 'row'; index: number; left: number; top: number }

function TableMenuAction({ label, onClick, Icon = Plus, disabled = false, danger = false }: {
  label: string; onClick: () => void; Icon?: typeof Plus; disabled?: boolean; danger?: boolean
}) {
  return <button role="menuitem" disabled={disabled} className={danger ? 'danger' : ''} onClick={onClick}><Icon size={15} />{label}</button>
}

export function EditableTable({ markdown, readOnly, onChange, onDelete, onExit, renderInline, onNavigate, allNotes = [] }: Props) {
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

  // Floating wikilink suggestion state inside table
  const [wikiSuggest, setWikiSuggest] = useState<{
    query: string
    cell: Cell
    top: number
    left: number
    index: number
    startIdx: number
  } | null>(null)

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

  useEffect(() => {
    if (!wikiSuggest) return
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.pyrite-table-wiki-suggest')) {
        setWikiSuggest(null)
      }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [wikiSuggest])

  const commit = (next: MarkdownTable) => {
    if (next === latest.current) return
    history.current = [...history.current.slice(-99), latest.current]
    future.current = []
    latest.current = next
    setTable(next)
    onChange(serializeMarkdownTable(next))
  }
  const focusCell = (cell: Cell) => {
    setActive(cell)
    requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLTextAreaElement>(`[data-row="${cell.row}"][data-column="${cell.column}"]`)
      if (el) {
        el.focus()
        const len = el.value.length
        el.setSelectionRange(len, len)
      }
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

  const filteredWikiNotes = (allNotes || []).filter(n => {
    if (!wikiSuggest?.query) return true
    return n.title.toLowerCase().includes(wikiSuggest.query)
  }).slice(0, 15)

  const handleSelectWikiSuggestion = (targetNoteTitle: string) => {
    if (!wikiSuggest) return
    const cell = wikiSuggest.cell
    const currentValue = cell.row === -1 ? table.columns[cell.column] : table.rows[cell.row][cell.column]
    const before = currentValue.slice(0, wikiSuggest.startIdx)
    const after = currentValue.slice(wikiSuggest.startIdx + 2 + wikiSuggest.query.length)
    const newValue = `${before}[[${targetNoteTitle}]]${after}`
    editCell(cell, newValue)
    setWikiSuggest(null)

    requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLTextAreaElement>(`[data-row="${cell.row}"][data-column="${cell.column}"]`)
      if (el) {
        el.focus()
        const newCursor = before.length + targetNoteTitle.length + 4
        el.setSelectionRange(newCursor, newCursor)
      }
    })
  }

  const handleCellChange = (cell: Cell, value: string, targetEl: HTMLTextAreaElement) => {
    editCell(cell, value)

    if (!allNotes || allNotes.length === 0) return

    const cursor = targetEl.selectionStart || 0
    const textBefore = value.slice(0, cursor)
    const wikiIdx = textBefore.lastIndexOf('[[')

    if (wikiIdx !== -1) {
      const q = textBefore.slice(wikiIdx + 2)
      if (!q.includes(']]') && !q.includes('\n') && q.length < 35) {
        const bounds = targetEl.getBoundingClientRect()
        setWikiSuggest({
          query: q.toLowerCase(),
          cell,
          top: Math.max(8, Math.min(bounds.bottom + 4, innerHeight - 260)),
          left: Math.max(8, Math.min(bounds.left, innerWidth - 300)),
          index: 0,
          startIdx: wikiIdx
        })
        return
      }
    }
    setWikiSuggest(null)
  }

  const cellKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, cell: Cell) => {
    if (event.nativeEvent.isComposing) return

    // Handle wikilink suggestions navigation
    if (wikiSuggest && filteredWikiNotes.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setWikiSuggest(prev => prev ? { ...prev, index: (prev.index + 1) % filteredWikiNotes.length } : null)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setWikiSuggest(prev => prev ? { ...prev, index: (prev.index - 1 + filteredWikiNotes.length) % filteredWikiNotes.length } : null)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const target = filteredWikiNotes[wikiSuggest.index] || filteredWikiNotes[0]
        if (target) {
          handleSelectWikiSuggestion(target.title)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setWikiSuggest(null)
        return
      }
    }

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

  const isCellEditing = (cell: Cell) => !readOnly && active?.row === cell.row && active?.column === cell.column

  const handleValueClick = (e: React.MouseEvent, cell: Cell) => {
    const wikiEl = (e.target as HTMLElement).closest('.wiki-link')
    if (wikiEl) {
      e.preventDefault()
      e.stopPropagation()
      const dest = wikiEl.getAttribute('data-wiki')
      if (dest && onNavigate) {
        onNavigate(dest)
        return
      }
    }

    const linkEl = (e.target as HTMLElement).closest('a')
    if (linkEl) return

    if (!readOnly) {
      focusCell(cell)
    }
  }

  const renderCell = (text: string, cell: Cell) => {
    if (isCellEditing(cell)) {
      return (
        <textarea
          rows={1}
          autoFocus
          data-row={cell.row}
          data-column={cell.column}
          aria-label={cell.row === -1 ? `Nome da coluna ${cell.column + 1}` : `${table.columns[cell.column] || `Coluna ${cell.column + 1}`}, linha ${cell.row + 1}`}
          placeholder={cell.row === -1 ? 'Nome da coluna' : ''}
          value={text}
          spellCheck
          onFocus={() => setActive(cell)}
          onBlur={(e) => {
            const nextTarget = e.relatedTarget as Node | null
            if (nextTarget && root.current?.contains(nextTarget)) return
            setTimeout(() => {
              if (!root.current?.contains(document.activeElement)) {
                setActive(null)
                setWikiSuggest(null)
              }
            }, 120)
          }}
          onChange={event => handleCellChange(cell, event.target.value, event.target)}
          onKeyDown={event => cellKeyDown(event, cell)}
          onPaste={event => paste(event, cell)}
        />
      )
    }

    const html = text ? text.split('\n').map(renderInline).join('<br>') : ''

    return (
      <div
        className="pyrite-table-value group/cell relative cursor-text select-text"
        tabIndex={readOnly ? undefined : 0}
        onClick={event => handleValueClick(event, cell)}
        onDoubleClick={() => !readOnly && focusCell(cell)}
        onKeyDown={event => {
          if (!readOnly && (event.key === 'Enter' || event.key === 'F2')) {
            event.preventDefault()
            focusCell(cell)
          }
        }}
        dangerouslySetInnerHTML={{
          __html: html || (!readOnly && cell.row !== -1 ? '<span class="text-zinc-600 italic text-[11px] select-none opacity-0 group-hover/cell:opacity-40">vazio</span>' : '')
        }}
      />
    )
  }

  return <div ref={root} className={`pyrite-table ${readOnly ? 'is-reading' : ''}`} contentEditable={false} onInput={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}>
    {!readOnly && <div className="pyrite-table-toolbar"><span><TableLabel />{table.rows.length} {table.rows.length === 1 ? 'linha' : 'linhas'} · {table.columns.length} colunas</span><div><button aria-label="Adicionar coluna" onClick={() => { commit(insertTableColumn(table, table.columns.length)); focusCell({ row: -1, column: table.columns.length }) }}><Plus size={13} />Coluna</button><button aria-label="Excluir tabela" title="Excluir tabela" onClick={() => setDeletePending(true)}><Trash2 size={14} /></button></div></div>}
    {!readOnly && filter && <div className="pyrite-table-filter"><label>Filtrar {table.columns[filter.column]}<input autoFocus placeholder="Buscar nesta coluna…" value={filter.value} onChange={event => setFilter({ ...filter, value: event.target.value })} /></label><button title="Limpar filtro" onClick={() => setFilter(null)}><X size={14} /></button></div>}
    <div className="pyrite-table-scroll"><table aria-label="Tabela da nota" style={{ width: '100%', minWidth: table.widths.reduce((sum, width) => sum + width, 0) + (readOnly ? 0 : 38) }}>
      <colgroup>{!readOnly && <col style={{ width: 38 }} />}{table.widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr>{!readOnly && <th className="pyrite-table-gutter" aria-label="Linhas" />}{table.columns.map((text, column) => <th key={column} style={{ textAlign: table.alignments[column] }}>
        <div className="pyrite-table-heading">{renderCell(text, { row: -1, column })}{!readOnly && <button aria-label={`Opções da coluna ${column + 1}`} title="Opções da coluna" onClick={event => openMenu(event, 'column', column)}><ChevronDown size={14} /></button>}</div>
        {!readOnly && <span className="pyrite-table-resize" role="separator" aria-label={`Redimensionar coluna ${column + 1}`} aria-orientation="vertical" aria-valuenow={table.widths[column]} aria-valuemin={120} aria-valuemax={640} tabIndex={0} onPointerDown={event => resize(event, column)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); commit({ ...table, widths: table.widths.map((width, index) => index === column ? clampColumnWidth(width + (event.key === 'ArrowRight' ? 16 : -16)) : width) }) } }} />}
      </th>)}</tr></thead>
      <tbody>{table.rows.map((row, rowIndex) => {
        if (!readOnly && filter?.value && !row[filter.column].toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())) return null
        return <tr key={rowIndex}>{!readOnly && <td className="pyrite-table-gutter"><button aria-label={`Opções da linha ${rowIndex + 1}`} title="Opções da linha" onClick={event => openMenu(event, 'row', rowIndex)}>{rowIndex + 1}</button></td>}{row.map((text, column) => <td key={column} className={active?.row === rowIndex && active.column === column ? 'is-active' : ''} style={{ textAlign: table.alignments[column] }}>{renderCell(text, { row: rowIndex, column })}</td>)}</tr>
      })}</tbody>
    </table></div>
    {!readOnly && <div className="pyrite-table-footer"><button aria-label="Adicionar linha" onClick={() => addRow(table.rows.length)}><Plus size={15} />Nova linha</button><span>Tab para navegar · Shift+Enter para quebra de linha</span></div>}
    {!readOnly && deletePending && <div className="pyrite-table-confirm" role="alert"><span>Excluir esta tabela e todo o seu conteúdo?</span><button className="danger" onClick={onDelete}>Excluir tabela</button><button onClick={() => setDeletePending(false)}>Cancelar</button></div>}
    {!readOnly && menu && createPortal(<div ref={popup} role="menu" aria-label={menu.kind === 'column' ? 'Gerenciar coluna' : 'Gerenciar linha'} className="pyrite-table-menu" style={{ left: menu.left, top: menu.top }} onClick={event => { if ((event.target as HTMLElement).closest('button')) setMenu(null) }} onKeyDown={event => {
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
    {!readOnly && wikiSuggest && filteredWikiNotes.length > 0 && createPortal(
      <div
        style={{
          position: 'fixed',
          top: `${wikiSuggest.top}px`,
          left: `${wikiSuggest.left}px`,
          zIndex: 9999
        }}
        onMouseDown={e => e.preventDefault()}
        className="pyrite-table-wiki-suggest w-72 bg-[#141418] border border-[var(--accent)]/40 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
      >
        <div className="wiki-suggest-header px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)] border-b border-zinc-800 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <span className="font-mono text-[var(--accent)]">[[</span> Link para Nota
          </span>
          <span className="text-zinc-500 font-mono text-[10px]">↵ Inserir</span>
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5 pt-1 scrollbar-none">
          {filteredWikiNotes.map((targetNote, nIdx) => {
            const isSelected = nIdx === wikiSuggest.index
            return (
              <div
                key={targetNote.id}
                onMouseDown={e => {
                  e.preventDefault()
                  handleSelectWikiSuggestion(targetNote.title)
                }}
                onMouseEnter={() => setWikiSuggest(prev => (prev ? { ...prev, index: nIdx } : null))}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/40 shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <div className="truncate flex-1">
                  <div className="text-xs font-medium text-zinc-100 truncate">{targetNote.title}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{targetNote.folder}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>,
      document.body
    )}
  </div>
}

function TableLabel() {
  return <span className="pyrite-table-label">Tabela</span>
}
