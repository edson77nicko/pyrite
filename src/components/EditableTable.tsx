import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus,
  Trash2,
  Copy,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Code,
  ArrowDownAZ,
  ArrowUpAZ,
  FileText,
  ChevronDown
} from 'lucide-react'
import {
  clampColumnWidth,
  insertTableColumn,
  removeTableColumn,
  parseMarkdownTable,
  serializeMarkdownTable
} from '../utils/markdownTable'
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

type Cell = { row: number; col: number }

export function EditableTable({
  markdown,
  readOnly,
  onChange,
  onDelete,
  onExit,
  renderInline,
  onNavigate,
  allNotes = []
}: Props) {
  const [table, setTable] = useState(() => parseMarkdownTable(markdown))
  const latest = useRef(table)
  const rootRef = useRef<HTMLDivElement>(null)
  const history = useRef<MarkdownTable[]>([])
  const future = useRef<MarkdownTable[]>([])
  const dragCleanup = useRef<(() => void) | null>(null)

  // Selection & Editing states (matching Canvas DrawEditor)
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null)
  const [editingCell, setEditingCell] = useState<Cell | null>(null)
  const [selectedCol, setSelectedCol] = useState<number | null>(null)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)

  // Hover states for inserters and bars
  const [hoveredCol, setHoveredCol] = useState<number | null>(null)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [isHoveringBottomAdd, setIsHoveringBottomAdd] = useState(false)
  const [isHoveringRightAdd, setIsHoveringRightAdd] = useState(false)
  const [isHoveringTable, setIsHoveringTable] = useState(false)

  // UI popover & confirmation states
  const [openAlignMenu, setOpenAlignMenu] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  // Wikilink autocomplete state
  const [wikiSuggest, setWikiSuggest] = useState<{
    query: string
    cell: Cell
    top: number
    left: number
    index: number
    startIdx: number
  } | null>(null)

  // Keep latest ref up-to-date
  latest.current = table

  useEffect(() => () => dragCleanup.current?.(), [])

  // Commit changes to table and notify parent
  const commit = useCallback((next: MarkdownTable) => {
    if (next === latest.current) return
    history.current = [...history.current.slice(-99), latest.current]
    future.current = []
    latest.current = next
    setTable(next)
    onChange(serializeMarkdownTable(next))
  }, [onChange])

  // Deselect on clicks outside
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !target.closest('.pyrite-table-popover') &&
        !target.closest('.pyrite-table-wiki-suggest')
      ) {
        setSelectedCell(null)
        setEditingCell(null)
        setSelectedCol(null)
        setSelectedRow(null)
        setOpenAlignMenu(false)
        setDeletePending(false)
        setWikiSuggest(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  // Dismiss wikilink popup on clicks outside
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

  // Focus and start editing a specific cell
  const startEditing = (cell: Cell, selectAll = false) => {
    if (readOnly) return
    setSelectedCell(cell)
    setSelectedCol(null)
    setSelectedRow(null)
    setEditingCell(cell)
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLTextAreaElement>(
        `[data-row="${cell.row}"][data-column="${cell.col}"]`
      )
      if (el) {
        el.focus()
        if (selectAll) {
          el.select()
        } else {
          const len = el.value.length
          el.setSelectionRange(len, len)
        }
      }
    })
  }

  // Edit cell value
  const editCell = (cell: Cell, value: string) => {
    const current = latest.current
    if (cell.row === -1) {
      commit({
        ...current,
        columns: current.columns.map((c, idx) => idx === cell.col ? value : c)
      })
    } else {
      commit({
        ...current,
        rows: current.rows.map((row, rIdx) =>
          rIdx === cell.row
            ? row.map((c, cIdx) => cIdx === cell.col ? value : c)
            : row
        )
      })
    }
  }

  // Add row
  const addRow = (index: number, duplicate = false) => {
    const current = latest.current
    const newRow = duplicate && index > 0
      ? [...current.rows[index - 1]]
      : current.columns.map(() => '')
    commit({
      ...current,
      rows: [...current.rows.slice(0, index), newRow, ...current.rows.slice(index)]
    })
    startEditing({ row: index, col: 0 })
  }

  // Insert column
  const insertColumn = (index: number) => {
    const next = insertTableColumn(latest.current, index)
    commit(next)
    startEditing({ row: -1, col: index }, true)
  }

  // Duplicate column
  const duplicateColumn = (index: number) => {
    const current = latest.current
    const insert = <T,>(arr: T[], val: T) => [
      ...arr.slice(0, index + 1),
      val,
      ...arr.slice(index + 1)
    ]
    commit({
      ...current,
      columns: insert(current.columns, `${current.columns[index]} (cópia)`),
      rows: current.rows.map(r => insert(r, r[index] || '')),
      alignments: insert(current.alignments, current.alignments[index] || 'left'),
      widths: insert(current.widths, current.widths[index] || 180)
    })
    setSelectedCol(index + 1)
  }

  // Sort rows by column
  const sortColumn = (index: number, ascending: boolean) => {
    const current = latest.current
    const sorted = [...current.rows].sort((a, b) => {
      const valA = (a[index] || '').trim()
      const valB = (b[index] || '').trim()
      const res = valA.localeCompare(valB, 'pt-BR', { numeric: true, sensitivity: 'base' })
      return ascending ? res : -res
    })
    commit({ ...current, rows: sorted })
  }

  // Toggle Markdown formatting on cell / row / column
  const toggleFormat = (format: 'bold' | 'italic' | 'strike' | 'code') => {
    const apply = (text: string): string => {
      const t = text.trim()
      if (!t) return text
      if (format === 'bold') {
        if (t.startsWith('**') && t.endsWith('**') && t.length >= 4) return t.slice(2, -2)
        return `**${t}**`
      }
      if (format === 'italic') {
        if (t.startsWith('*') && t.endsWith('*') && !t.startsWith('**') && t.length >= 2) return t.slice(1, -1)
        return `*${t}*`
      }
      if (format === 'strike') {
        if (t.startsWith('~~') && t.endsWith('~~') && t.length >= 4) return t.slice(2, -2)
        return `~~${t}~~`
      }
      if (format === 'code') {
        if (t.startsWith('`') && t.endsWith('`') && t.length >= 2) return t.slice(1, -1)
        return `\`${t}\``
      }
      return text
    }

    const current = latest.current
    if (selectedCell) {
      if (selectedCell.row === -1) {
        commit({
          ...current,
          columns: current.columns.map((c, i) => i === selectedCell.col ? apply(c) : c)
        })
      } else {
        commit({
          ...current,
          rows: current.rows.map((r, ri) =>
            ri === selectedCell.row
              ? r.map((c, ci) => ci === selectedCell.col ? apply(c) : c)
              : r
          )
        })
      }
    } else if (selectedCol !== null) {
      commit({
        ...current,
        columns: current.columns.map((c, i) => i === selectedCol ? apply(c) : c),
        rows: current.rows.map(r => r.map((c, ci) => ci === selectedCol ? apply(c) : c))
      })
    } else if (selectedRow !== null) {
      commit({
        ...current,
        rows: current.rows.map((r, ri) =>
          ri === selectedRow ? r.map(c => apply(c)) : r
        )
      })
    }
  }

  // Check if format is active on current selection
  const isFormatActive = (format: 'bold' | 'italic' | 'strike' | 'code'): boolean => {
    let sample = ''
    if (selectedCell) {
      sample = selectedCell.row === -1
        ? table.columns[selectedCell.col]
        : table.rows[selectedCell.row]?.[selectedCell.col] || ''
    } else if (selectedCol !== null) {
      sample = table.columns[selectedCol] || ''
    } else if (selectedRow !== null) {
      sample = table.rows[selectedRow]?.[0] || ''
    }
    sample = sample.trim()
    if (!sample) return false
    if (format === 'bold') return sample.startsWith('**') && sample.endsWith('**') && sample.length >= 4
    if (format === 'italic') return sample.startsWith('*') && sample.endsWith('*') && !sample.startsWith('**') && sample.length >= 2
    if (format === 'strike') return sample.startsWith('~~') && sample.endsWith('~~') && sample.length >= 4
    if (format === 'code') return sample.startsWith('`') && sample.endsWith('`') && sample.length >= 2
    return false
  }

  // Set alignment for current column
  const setAlignment = (align: 'left' | 'center' | 'right') => {
    const col = selectedCol !== null ? selectedCol : selectedCell?.col
    if (col === undefined || col === null) return
    const current = latest.current
    commit({
      ...current,
      alignments: current.alignments.map((a, idx) => idx === col ? align : a)
    })
    setOpenAlignMenu(false)
  }

  // Column resize handler
  const handleResize = (event: React.PointerEvent, colIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    dragCleanup.current?.()
    const current = latest.current
    const startX = event.clientX
    let width = current.widths[colIndex]

    const onMove = (e: PointerEvent) => {
      width = clampColumnWidth(current.widths[colIndex] + e.clientX - startX)
      setTable({
        ...current,
        widths: current.widths.map((w, idx) => idx === colIndex ? width : w)
      })
    }

    const onUp = () => {
      cleanup()
      commit({
        ...current,
        widths: current.widths.map((w, idx) => idx === colIndex ? width : w)
      })
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cleanup)
      dragCleanup.current = null
    }

    dragCleanup.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cleanup)
  }

  // Filtered notes for wikilink autocomplete
  const filteredWikiNotes = (allNotes || []).filter(n => {
    if (!wikiSuggest?.query) return true
    return n.title.toLowerCase().includes(wikiSuggest.query)
  }).slice(0, 15)

  // Insert selected wikilink into cell
  const handleSelectWikiSuggestion = (targetNoteTitle: string) => {
    if (!wikiSuggest) return
    const cell = wikiSuggest.cell
    const currentValue = cell.row === -1
      ? table.columns[cell.col]
      : table.rows[cell.row][cell.col]
    const before = currentValue.slice(0, wikiSuggest.startIdx)
    const after = currentValue.slice(wikiSuggest.startIdx + 2 + wikiSuggest.query.length)
    const newValue = `${before}[[${targetNoteTitle}]]${after}`
    editCell(cell, newValue)
    setWikiSuggest(null)

    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLTextAreaElement>(
        `[data-row="${cell.row}"][data-column="${cell.col}"]`
      )
      if (el) {
        el.focus()
        const newCursor = before.length + targetNoteTitle.length + 4
        el.setSelectionRange(newCursor, newCursor)
      }
    })
  }

  // Cell change handler (with wikilink detection)
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
          top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 260)),
          left: Math.max(8, Math.min(bounds.left, window.innerWidth - 300)),
          index: 0,
          startIdx: wikiIdx
        })
        return
      }
    }
    setWikiSuggest(null)
  }

  // Keyboard navigation inside cell textarea
  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, cell: Cell) => {
    if (event.nativeEvent.isComposing) return

    // Wikilink autocomplete navigation
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

    // Table undo / redo
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault()
      const redo = event.shiftKey || event.key.toLowerCase() === 'y'
      const source = redo ? future : history
      const dest = redo ? history : future
      const next = source.current.pop()
      if (next) {
        dest.current.push(latest.current)
        latest.current = next
        setTable(next)
        onChange(serializeMarkdownTable(next))
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setEditingCell(null)
      setSelectedCell(cell)
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const totalCols = table.columns.length
      if (event.shiftKey) {
        // Navigate backwards
        if (cell.col > 0) {
          startEditing({ row: cell.row, col: cell.col - 1 }, true)
        } else if (cell.row > -1) {
          startEditing({ row: cell.row - 1, col: totalCols - 1 }, true)
        } else {
          onExit()
        }
      } else {
        // Navigate forwards
        if (cell.col < totalCols - 1) {
          startEditing({ row: cell.row, col: cell.col + 1 }, true)
        } else if (cell.row < table.rows.length - 1) {
          startEditing({ row: cell.row + 1, col: 0 }, true)
        } else {
          // At the very end: append new row!
          addRow(table.rows.length)
        }
      }
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (cell.row === table.rows.length - 1 || table.rows.length === 0) {
        addRow(table.rows.length)
      } else {
        startEditing({ row: cell.row + 1, col: cell.col }, true)
      }
    }
  }

  // Paste TSV / Excel data into grid
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>, cell: Cell) => {
    const text = event.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    event.preventDefault()
    const grid = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'))
    if (grid.length === 1 && grid[0].length === 1) return

    const current = latest.current
    let next: MarkdownTable = {
      ...current,
      columns: [...current.columns],
      rows: current.rows.map(row => [...row]),
      widths: [...current.widths],
      alignments: [...current.alignments]
    }

    const neededCols = Math.max(...grid.map(row => row.length)) + cell.col
    while (next.columns.length < neededCols) {
      next = insertTableColumn(next, next.columns.length)
    }

    for (let r = 0; r < grid.length; r++) {
      const targetRow = cell.row + r
      while (targetRow >= next.rows.length) {
        next.rows.push(next.columns.map(() => ''))
      }
      const dest = targetRow === -1 ? next.columns : next.rows[targetRow]
      grid[r].forEach((val, c) => {
        dest[cell.col + c] = val
      })
    }
    commit(next)
  }

  // Value cell click (handles wikilink navigation or cell selection)
  const handleCellClick = (e: React.MouseEvent, cell: Cell) => {
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
      setSelectedCell(cell)
      setSelectedCol(null)
      setSelectedRow(null)
      setEditingCell(null)
    }
  }

  // Global keydown on table container (when cell is selected, not editing)
  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (readOnly || editingCell) return

    if (selectedCell) {
      const { row, col } = selectedCell
      const numRows = table.rows.length
      const numCols = table.columns.length

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (col < numCols - 1) setSelectedCell({ row, col: col + 1 })
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (col > 0) setSelectedCell({ row, col: col - 1 })
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (row < numRows - 1) setSelectedCell({ row: row + 1, col })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (row > -1) setSelectedCell({ row: row - 1, col })
        return
      }
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault()
        startEditing(selectedCell, true)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        editCell(selectedCell, '')
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedCell(null)
        return
      }
      // If typing a printable character, begin editing immediately
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        editCell(selectedCell, e.key)
        startEditing(selectedCell, false)
        return
      }
    }

    if (selectedCol !== null) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedCol(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (table.columns.length > 1) {
          commit(removeTableColumn(table, selectedCol))
          setSelectedCol(null)
        }
      }
    }

    if (selectedRow !== null) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedRow(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        commit({
          ...table,
          rows: table.rows.filter((_, idx) => idx !== selectedRow)
        })
        setSelectedRow(null)
      }
    }
  }

  // Active alignment for the selected target
  const activeAlign = selectedCol !== null
    ? table.alignments[selectedCol] || 'left'
    : selectedCell
      ? table.alignments[selectedCell.col] || 'left'
      : 'left'

  const hasSelection = !readOnly && (selectedCell !== null || selectedCol !== null || selectedRow !== null)

  return (
    <div
      ref={rootRef}
      className={`pyrite-canvas-table-wrapper relative group/table my-5 select-none ${readOnly ? 'is-reading' : ''}`}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onMouseEnter={() => setIsHoveringTable(true)}
      onMouseLeave={() => {
        setIsHoveringTable(false)
        setHoveredCol(null)
        setHoveredRow(null)
        setIsHoveringBottomAdd(false)
        setIsHoveringRightAdd(false)
      }}
    >
      {/* 1. FLOATING POPOVER TOOLBAR (Matching FigJam Canvas Toolbar) */}
      {hasSelection && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-40 bg-[#18181b]/95 backdrop-blur-md border border-zinc-700/80 rounded-xl shadow-2xl px-2 py-1 flex items-center gap-1 text-xs text-zinc-300 pointer-events-auto animate-in fade-in zoom-in-95 duration-100 pyrite-table-popover">
          {/* A. Text Alignment Dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpenAlignMenu(prev => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Alinhamento do texto"
            >
              {activeAlign === 'center' ? (
                <AlignCenter className="w-3.5 h-3.5 text-sky-400" />
              ) : activeAlign === 'right' ? (
                <AlignRight className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <AlignLeft className="w-3.5 h-3.5 text-sky-400" />
              )}
              <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
            </button>

            {openAlignMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-32 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-1 z-50 flex flex-col gap-0.5">
                {[
                  { id: 'left', label: 'Esquerda', icon: AlignLeft },
                  { id: 'center', label: 'Centro', icon: AlignCenter },
                  { id: 'right', label: 'Direita', icon: AlignRight }
                ].map(opt => {
                  const Icon = opt.icon
                  const isSel = activeAlign === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setAlignment(opt.id as any)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-xs ${
                        isSel ? 'bg-sky-500/20 text-sky-400 font-medium' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

          {/* B. Text Formatting: Bold, Italic, Strikethrough, Code */}
          <button
            onClick={() => toggleFormat('bold')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isFormatActive('bold') ? 'bg-sky-500/20 text-sky-400' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Negrito"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => toggleFormat('italic')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isFormatActive('italic') ? 'bg-sky-500/20 text-sky-400' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Itálico"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => toggleFormat('strike')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isFormatActive('strike') ? 'bg-sky-500/20 text-sky-400' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Tachado"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => toggleFormat('code')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isFormatActive('code') ? 'bg-sky-500/20 text-sky-400' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Código em linha"
          >
            <Code className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

          {/* C. Contextual Actions based on Selection Target */}
          {selectedCol !== null ? (
            <>
              <button
                onClick={() => sortColumn(selectedCol, true)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Classificar coluna A-Z"
              >
                <ArrowDownAZ className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => sortColumn(selectedCol, false)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Classificar coluna Z-A"
              >
                <ArrowUpAZ className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => duplicateColumn(selectedCol)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Duplicar coluna"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (table.columns.length > 1) {
                    commit(removeTableColumn(table, selectedCol))
                    setSelectedCol(null)
                  }
                }}
                disabled={table.columns.length <= 1}
                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-40"
                title="Excluir coluna"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : selectedRow !== null ? (
            <>
              <button
                onClick={() => addRow(selectedRow)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Inserir linha acima"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => addRow(selectedRow + 1, true)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Duplicar linha"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  commit({
                    ...table,
                    rows: table.rows.filter((_, idx) => idx !== selectedRow)
                  })
                  setSelectedRow(null)
                }}
                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                title="Excluir linha"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : selectedCell ? (
            <>
              <button
                onClick={() => addRow(selectedCell.row + 1)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1"
                title="Inserir linha abaixo"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[11px]">Linha</span>
              </button>
              <button
                onClick={() => insertColumn(selectedCell.col + 1)}
                className="p-1.5 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1"
                title="Inserir coluna à direita"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[11px]">Coluna</span>
              </button>
              <button
                onClick={() => editCell(selectedCell, '')}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                title="Limpar conteúdo da célula"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : null}

          <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

          {/* D. Delete Table Option */}
          <button
            onClick={() => setDeletePending(true)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
            title="Excluir tabela inteira"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Delete Table Confirmation Pill */}
      {deletePending && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 bg-[#1e1416] border border-rose-500/50 rounded-xl shadow-2xl px-3 py-1.5 flex items-center gap-2 text-xs text-rose-200 animate-in fade-in duration-100">
          <span>Excluir esta tabela?</span>
          <button
            onClick={onDelete}
            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer transition-colors"
          >
            Excluir
          </button>
          <button
            onClick={() => setDeletePending(false)}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* 2. TABLE GRID WITH TOP / LEFT FIGJAM HANDLES & RIGHT / BOTTOM HOVER BARS */}
      <div className="flex items-start">
        <div className="flex-1 overflow-x-auto overflow-y-visible pt-5 pb-1">
          <div className="inline-block min-w-full align-middle">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 shadow-sm overflow-hidden backdrop-blur-xs">
              <table
                className="w-full border-collapse table-fixed text-xs text-zinc-300"
                style={{
                  minWidth: table.widths.reduce((sum, w) => sum + w, 0) + (readOnly ? 0 : 28)
                }}
              >
                <colgroup>
                  {!readOnly && <col style={{ width: 28 }} />}
                  {table.widths.map((w, idx) => (
                    <col key={idx} style={{ width: w }} />
                  ))}
                </colgroup>

                {/* THEAD with Top Column Pill Handles & Divider Inserter Dots */}
                <thead>
                  <tr className="bg-zinc-900/80 border-b border-zinc-800/80">
                    {/* Left gutter corner header */}
                    {!readOnly && (
                      <th className="w-7 min-w-[28px] max-w-[28px] p-0 border-r border-zinc-800/60 bg-zinc-900/50 select-none relative" />
                    )}

                    {table.columns.map((colName, cIdx) => {
                      const isColSelected = selectedCol === cIdx
                      const isColHovered = hoveredCol === cIdx
                      const showHandles = !readOnly && (isHoveringTable || isColSelected || isColHovered)

                      return (
                        <th
                          key={cIdx}
                          style={{ textAlign: table.alignments[cIdx] || 'left' }}
                          className={`relative group/colheader px-3 py-2 font-semibold text-zinc-200 border-r border-zinc-800/50 transition-colors ${
                            isColSelected ? 'bg-sky-400/15' : 'hover:bg-zinc-800/40'
                          }`}
                        >
                          {/* Top Column Handle Pill (Horizontal stroke) + Divider Inserters */}
                          {showHandles && (
                            <div className="absolute -top-4 left-0 right-0 flex items-center justify-center pointer-events-auto">
                              {/* Left Inserter Dot */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  insertColumn(cIdx)
                                }}
                                onMouseEnter={() => setHoveredCol(cIdx)}
                                className="absolute left-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs transition-all z-30"
                                title={`Inserir coluna antes da coluna ${cIdx + 1}`}
                              />

                              {/* Center Pill Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedCol(prev => prev === cIdx ? null : cIdx)
                                  setSelectedRow(null)
                                  setSelectedCell(null)
                                  setEditingCell(null)
                                }}
                                onMouseEnter={() => setHoveredCol(cIdx)}
                                onMouseLeave={() => setHoveredCol(null)}
                                className={`w-5 h-1.5 rounded-full transition-all cursor-pointer z-30 shadow-xs ${
                                  isColSelected
                                    ? 'bg-sky-400 ring-2 ring-sky-300 scale-110'
                                    : 'bg-sky-400/90 hover:bg-sky-300 hover:scale-125'
                                }`}
                                title={`Selecionar coluna ${cIdx + 1}`}
                              />

                              {/* Right Inserter Dot (for last column) */}
                              {cIdx === table.columns.length - 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    insertColumn(cIdx + 1)
                                  }}
                                  onMouseEnter={() => setHoveredCol(cIdx)}
                                  className="absolute right-0 translate-x-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs transition-all z-30"
                                  title={`Inserir coluna depois da coluna ${cIdx + 1}`}
                                />
                              )}
                            </div>
                          )}

                          {/* Column Header Content */}
                          {editingCell && editingCell.row === -1 && editingCell.col === cIdx ? (
                            <textarea
                              rows={1}
                              autoFocus
                              data-row={-1}
                              data-column={cIdx}
                              value={colName}
                              placeholder="Nome da coluna"
                              className="w-full bg-transparent resize-none outline-none border-none p-0 text-inherit font-inherit leading-normal text-sky-300"
                              style={{ textAlign: table.alignments[cIdx] || 'left' }}
                              onChange={e => handleCellChange({ row: -1, col: cIdx }, e.target.value, e.target)}
                              onKeyDown={e => handleCellKeyDown(e, { row: -1, col: cIdx })}
                              onBlur={() => setEditingCell(null)}
                            />
                          ) : (
                            <div
                              onClick={e => handleCellClick(e, { row: -1, col: cIdx })}
                              onDoubleClick={() => startEditing({ row: -1, col: cIdx }, true)}
                              className={`cursor-pointer select-text truncate py-0.5 ${
                                selectedCell?.row === -1 && selectedCell?.col === cIdx
                                  ? 'ring-2 ring-sky-400 ring-inset rounded px-1 text-white bg-sky-400/10'
                                  : ''
                              }`}
                            >
                              {colName || <span className="text-zinc-500 italic select-none">Coluna {cIdx + 1}</span>}
                            </div>
                          )}

                          {/* Column Resize Handle */}
                          {!readOnly && (
                            <div
                              onPointerDown={e => handleResize(e, cIdx)}
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-sky-400/60 transition-colors z-20"
                              title="Redimensionar coluna"
                            />
                          )}
                        </th>
                      )
                    })}
                  </tr>
                </thead>

                {/* TBODY with Left Row Pill Handles & Divider Inserter Dots */}
                <tbody>
                  {table.rows.map((row, rIdx) => {
                    const isRowSelected = selectedRow === rIdx
                    const isRowHovered = hoveredRow === rIdx
                    const showRowHandles = !readOnly && (isHoveringTable || isRowSelected || isRowHovered)

                    return (
                      <tr
                        key={rIdx}
                        className={`border-b border-zinc-800/40 transition-colors ${
                          isRowSelected ? 'bg-sky-400/10' : 'hover:bg-zinc-800/20'
                        }`}
                      >
                        {/* Left Gutter Cell with Row Pill Handle & Inserter Dots */}
                        {!readOnly && (
                          <td className="w-7 min-w-[28px] max-w-[28px] p-0 border-r border-zinc-800/60 bg-zinc-900/30 text-center relative select-none">
                            {showRowHandles && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                                {/* Top Inserter Dot */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    addRow(rIdx)
                                  }}
                                  onMouseEnter={() => setHoveredRow(rIdx)}
                                  className="absolute top-0 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs transition-all z-30"
                                  title={`Inserir linha antes da linha ${rIdx + 1}`}
                                />

                                {/* Row Pill Button (Vertical stroke) */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedRow(prev => prev === rIdx ? null : rIdx)
                                    setSelectedCol(null)
                                    setSelectedCell(null)
                                    setEditingCell(null)
                                  }}
                                  onMouseEnter={() => setHoveredRow(rIdx)}
                                  onMouseLeave={() => setHoveredRow(null)}
                                  className={`w-1.5 h-5 rounded-full transition-all cursor-pointer z-30 shadow-xs ${
                                    isRowSelected
                                      ? 'bg-sky-400 ring-2 ring-sky-300 scale-110'
                                      : 'bg-sky-400/90 hover:bg-sky-300 hover:scale-125'
                                  }`}
                                  title={`Selecionar linha ${rIdx + 1}`}
                                />

                                {/* Bottom Inserter Dot (for last row) */}
                                {rIdx === table.rows.length - 1 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      addRow(rIdx + 1)
                                    }}
                                    onMouseEnter={() => setHoveredRow(rIdx)}
                                    className="absolute bottom-0 translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs transition-all z-30"
                                    title={`Inserir linha depois da linha ${rIdx + 1}`}
                                  />
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Cell Contents */}
                        {row.map((cellText, cIdx) => {
                          const isCellSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx
                          const isCellEditing = editingCell?.row === rIdx && editingCell?.col === cIdx
                          const isColSelected = selectedCol === cIdx

                          return (
                            <td
                              key={cIdx}
                              style={{ textAlign: table.alignments[cIdx] || 'left' }}
                              className={`relative px-3 py-2 border-r border-zinc-800/40 transition-colors ${
                                isCellSelected
                                  ? 'ring-2 ring-sky-400 ring-inset bg-sky-400/15 text-white z-10'
                                  : isColSelected
                                    ? 'bg-sky-400/10'
                                    : ''
                              }`}
                            >
                              {isCellEditing ? (
                                <textarea
                                  rows={1}
                                  autoFocus
                                  data-row={rIdx}
                                  data-column={cIdx}
                                  value={cellText}
                                  className="w-full bg-transparent resize-none outline-none border-none p-0 text-inherit font-inherit leading-normal"
                                  style={{
                                    textAlign: table.alignments[cIdx] || 'left',
                                    minHeight: '22px'
                                  }}
                                  onChange={e => handleCellChange({ row: rIdx, col: cIdx }, e.target.value, e.target)}
                                  onKeyDown={e => handleCellKeyDown(e, { row: rIdx, col: cIdx })}
                                  onPaste={e => handlePaste(e, { row: rIdx, col: cIdx })}
                                  onBlur={() => setEditingCell(null)}
                                />
                              ) : (
                                <div
                                  onClick={e => handleCellClick(e, { row: rIdx, col: cIdx })}
                                  onDoubleClick={() => startEditing({ row: rIdx, col: cIdx })}
                                  className="cursor-pointer select-text min-h-[22px] leading-normal break-words"
                                  dangerouslySetInnerHTML={{
                                    __html: cellText
                                      ? cellText.split('\n').map(renderInline).join('<br>')
                                      : !readOnly
                                        ? '<span class="text-zinc-600/70 italic text-[11px] select-none opacity-0 group-hover/table:opacity-40">vazio</span>'
                                        : ''
                                  }}
                                />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 3. BOTTOM BAR: Add Row (Matches Canvas FigJam Table Inserter) */}
            {!readOnly && (isHoveringTable || isHoveringBottomAdd) && (
              <button
                onClick={() => addRow(table.rows.length)}
                onMouseEnter={() => setIsHoveringBottomAdd(true)}
                onMouseLeave={() => setIsHoveringBottomAdd(false)}
                className="w-full mt-1.5 h-6 rounded-lg border border-sky-400/40 bg-sky-400/15 hover:bg-sky-400/30 text-sky-400 hover:text-sky-300 flex items-center justify-center cursor-pointer transition-all duration-100 group animate-in fade-in"
                title="Adicionar linha"
              >
                <Plus className="w-4 h-4 stroke-[2.5] group-hover:scale-125 transition-transform" />
              </button>
            )}
          </div>
        </div>

        {/* 4. RIGHT BAR: Add Column (Matches Canvas FigJam Table Inserter) */}
        {!readOnly && (isHoveringTable || isHoveringRightAdd) && (
          <div className="pt-5 pl-1.5 self-stretch flex items-stretch">
            <button
              onClick={() => insertColumn(table.columns.length)}
              onMouseEnter={() => setIsHoveringRightAdd(true)}
              onMouseLeave={() => setIsHoveringRightAdd(false)}
              className="w-6 rounded-lg border border-sky-400/40 bg-sky-400/15 hover:bg-sky-400/30 text-sky-400 hover:text-sky-300 flex items-center justify-center cursor-pointer transition-all duration-100 group animate-in fade-in"
              title="Adicionar coluna"
            >
              <Plus className="w-4 h-4 stroke-[2.5] group-hover:scale-125 transition-transform" />
            </button>
          </div>
        )}
      </div>

      {/* 5. FLOATING WIKILINK AUTOCOMPLETE POPUP (When typing [[ inside table) */}
      {!readOnly && wikiSuggest && filteredWikiNotes.length > 0 && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${wikiSuggest.top}px`,
            left: `${wikiSuggest.left}px`,
            zIndex: 9999
          }}
          onMouseDown={e => e.preventDefault()}
          className="pyrite-table-wiki-suggest w-72 bg-[#141418] border border-sky-400/40 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
        >
          <div className="wiki-suggest-header px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-400 border-b border-zinc-800 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="font-mono text-sky-400">[[</span> Link para Nota
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
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-xs'
                      : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
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
  )
}
