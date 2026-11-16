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
  ChevronDown,
  Palette
} from 'lucide-react'
import {
  clampColumnWidth,
  insertTableColumn,
  removeTableColumn,
  insertTableRow,
  removeTableRow,
  setTableColor,
  parseMarkdownTable,
  serializeMarkdownTable
} from '../utils/markdownTable'
import type { MarkdownTable } from '../utils/markdownTable'
import { NOTION_BG_COLORS } from './NotionColorPicker'
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

  // Hover states for inserters and bars (isolated strictly per item)
  const [hoveredCol, setHoveredCol] = useState<number | null>(null)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [isHoveringBottomAdd, setIsHoveringBottomAdd] = useState(false)
  const [isHoveringRightAdd, setIsHoveringRightAdd] = useState(false)

  // UI popover & confirmation states
  const [openAlignMenu, setOpenAlignMenu] = useState(false)
  const [openColorMenu, setOpenColorMenu] = useState(false)
  const [colorScope, setColorScope] = useState<'cell' | 'row' | 'col'>('cell')
  const [deletePending, setDeletePending] = useState(false)

  // Floating toolbar dynamic positioning (positions on/above selected row)
  const [toolbarTop, setToolbarTop] = useState<number>(-44)
  const [toolbarLeft, setToolbarLeft] = useState<number | null>(null)

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

  // Dynamically compute toolbar position to appear on or above the selected row
  const updateToolbarPosition = useCallback(() => {
    if (!rootRef.current) return

    const activeRow = selectedRow !== null ? selectedRow : selectedCell ? selectedCell.row : null

    // If selection is on column or header row or no active row, position above the table
    if (activeRow === null || activeRow === -1 || selectedCol !== null) {
      setToolbarTop(-44)
      setToolbarLeft(null)
      return
    }

    const rootRect = rootRef.current.getBoundingClientRect()
    const rowEl = rootRef.current.querySelector(`tbody tr[data-row-index="${activeRow}"]`) as HTMLElement | null

    if (!rowEl) {
      setToolbarTop(-44)
      setToolbarLeft(null)
      return
    }

    const rowRect = rowEl.getBoundingClientRect()
    // Position toolbar directly on/above the selected row
    const targetTop = Math.max(-44, rowRect.top - rootRect.top - 42)
    setToolbarTop(targetTop)

    // Horizontally center near active cell if cell is selected, clamped to root bounds
    if (selectedCell && selectedCell.row === activeRow) {
      const cellEl = rootRef.current.querySelector(
        `td[data-cell-row="${selectedCell.row}"][data-cell-col="${selectedCell.col}"]`
      ) as HTMLElement | null

      if (cellEl) {
        const cellRect = cellEl.getBoundingClientRect()
        const cellCenterX = cellRect.left + cellRect.width / 2 - rootRect.left
        const halfWidth = 220
        const minLeft = halfWidth + 8
        const maxLeft = Math.max(minLeft, rootRect.width - halfWidth - 8)
        const clampedLeft = Math.max(minLeft, Math.min(maxLeft, cellCenterX))
        setToolbarLeft(clampedLeft)
        return
      }
    }

    setToolbarLeft(null)
  }, [selectedRow, selectedCell, selectedCol])

  useEffect(() => {
    updateToolbarPosition()
  }, [updateToolbarPosition, table.rows.length])

  useEffect(() => {
    window.addEventListener('resize', updateToolbarPosition)
    return () => window.removeEventListener('resize', updateToolbarPosition)
  }, [updateToolbarPosition])

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
        setOpenColorMenu(false)
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

  // Color picker logic (cell, row, or column)
  const getColorTarget = (): { type: 'cell' | 'row' | 'col'; row?: number; col?: number } | null => {
    if (selectedCol !== null) {
      return { type: 'col', col: selectedCol }
    }
    if (selectedRow !== null) {
      return { type: 'row', row: selectedRow }
    }
    if (selectedCell) {
      if (colorScope === 'cell') {
        return { type: 'cell', row: selectedCell.row, col: selectedCell.col }
      }
      if (colorScope === 'row') {
        return { type: 'row', row: selectedCell.row }
      }
      if (colorScope === 'col') {
        return { type: 'col', col: selectedCell.col }
      }
    }
    return null
  }

  const applyColor = (color: string) => {
    const target = getColorTarget()
    if (!target) return
    commit(setTableColor(latest.current, target, color))
  }

  const getCurrentColor = (): string => {
    if (selectedCol !== null) return table.colColors?.[selectedCol] || 'transparent'
    if (selectedRow !== null) return table.rowColors?.[selectedRow] || 'transparent'
    if (selectedCell) {
      if (colorScope === 'cell') return table.cellColors?.[`${selectedCell.row}:${selectedCell.col}`] || 'transparent'
      if (colorScope === 'row') return table.rowColors?.[selectedCell.row] || 'transparent'
      if (colorScope === 'col') return table.colColors?.[selectedCell.col] || 'transparent'
    }
    return 'transparent'
  }

  // Focus and start editing a specific cell
  const startEditing = (cell: Cell, selectAll = false) => {
    if (readOnly) return
    setSelectedCell(cell)
    setSelectedCol(null)
    setSelectedRow(null)
    setEditingCell(cell)
    setOpenColorMenu(false)
    setOpenAlignMenu(false)
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
    commit(insertTableRow(latest.current, index, duplicate))
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

    let colColors: Record<number, string> | undefined
    if (current.colColors) {
      colColors = {}
      for (const [k, v] of Object.entries(current.colColors)) {
        const c = Number(k)
        if (c > index) {
          colColors[c + 1] = v
        } else {
          colColors[c] = v
        }
      }
      if (current.colColors[index]) {
        colColors[index + 1] = current.colColors[index]
      }
    }

    let cellColors: Record<string, string> | undefined
    if (current.cellColors) {
      cellColors = {}
      for (const [k, v] of Object.entries(current.cellColors)) {
        const [rStr, cStr] = k.split(':')
        const r = Number(rStr)
        const c = Number(cStr)
        if (c > index) {
          cellColors[`${r}:${c + 1}`] = v
        } else {
          cellColors[`${r}:${c}`] = v
        }
      }
      for (let r = -1; r < current.rows.length; r++) {
        if (current.cellColors[`${r}:${index}`]) {
          cellColors[`${r}:${index + 1}`] = current.cellColors[`${r}:${index}`]
        }
      }
    }

    commit({
      ...current,
      columns: insert(current.columns, `${current.columns[index]} (cópia)`),
      rows: current.rows.map(r => insert(r, r[index] || '')),
      alignments: insert(current.alignments, current.alignments[index] || 'left'),
      widths: insert(current.widths, current.widths[index] || 180),
      colColors: colColors && Object.keys(colColors).length > 0 ? colColors : undefined,
      cellColors: cellColors && Object.keys(cellColors).length > 0 ? cellColors : undefined
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

  // Column resize handler with pointer capture
  const handleResize = (event: React.PointerEvent, colIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    dragCleanup.current?.()
    const startX = event.clientX
    const startWidth = latest.current.widths[colIndex] || 180
    const targetEl = event.currentTarget as HTMLElement
    try {
      targetEl.setPointerCapture(event.pointerId)
    } catch {}

    const onMove = (e: PointerEvent) => {
      const newWidth = clampColumnWidth(startWidth + (e.clientX - startX))
      setTable(prev => ({
        ...prev,
        widths: prev.widths.map((w, idx) => idx === colIndex ? newWidth : w)
      }))
    }

    const onUp = (e: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(e.pointerId)
      } catch {}
      cleanup()
      const finalWidth = clampColumnWidth(startWidth + (e.clientX - startX))
      commit({
        ...latest.current,
        widths: latest.current.widths.map((w, idx) => idx === colIndex ? finalWidth : w)
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
        commit(removeTableRow(table, selectedRow))
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
  const totalTableWidth = table.widths.reduce((sum, w) => sum + w, 0) + (readOnly ? 0 : 28)

  return (
    <div
      ref={rootRef}
      className={`pyrite-canvas-table-wrapper relative group/table my-5 select-none ${readOnly ? 'is-reading' : ''}`}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onMouseLeave={() => {
        setHoveredCol(null)
        setHoveredRow(null)
        setIsHoveringBottomAdd(false)
        setIsHoveringRightAdd(false)
      }}
    >
      {/* 1. FLOATING POPOVER TOOLBAR (FigJam Canvas Style in Neutral Mode Tones) */}
      {hasSelection && (
        <div
          style={{
            top: `${toolbarTop}px`,
            ...(toolbarLeft !== null ? { left: `${toolbarLeft}px` } : {})
          }}
          className={`absolute z-40 bg-[#18181b]/95 backdrop-blur-md border border-zinc-700/80 rounded-xl shadow-2xl px-2 py-1 flex items-center gap-1 text-xs text-zinc-300 pointer-events-auto animate-in fade-in zoom-in-95 duration-100 pyrite-table-popover ${
            toolbarLeft !== null ? '-translate-x-1/2' : 'left-1/2 -translate-x-1/2'
          }`}
        >
          {/* A. Text Alignment Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setOpenAlignMenu(prev => !prev)
                setOpenColorMenu(false)
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Alinhamento do texto"
            >
              {activeAlign === 'center' ? (
                <AlignCenter className="w-3.5 h-3.5 text-zinc-200" />
              ) : activeAlign === 'right' ? (
                <AlignRight className="w-3.5 h-3.5 text-zinc-200" />
              ) : (
                <AlignLeft className="w-3.5 h-3.5 text-zinc-200" />
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
                        isSel ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
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
              isFormatActive('bold') ? 'bg-zinc-700 text-white font-semibold' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Negrito"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => toggleFormat('italic')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isFormatActive('italic') ? 'bg-zinc-700 text-white font-semibold' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Itálico"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => toggleFormat('strike')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isFormatActive('strike') ? 'bg-zinc-700 text-white font-semibold' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Tachado"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => toggleFormat('code')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isFormatActive('code') ? 'bg-zinc-700 text-white font-semibold' : 'hover:text-white hover:bg-zinc-800'
            }`}
            title="Código em linha"
          >
            <Code className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

          {/* C. Color Palette Dropdown (Cell, Row, Column) */}
          <div className="relative">
            <button
              onClick={() => {
                setOpenColorMenu(prev => !prev)
                setOpenAlignMenu(false)
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                openColorMenu ? 'bg-zinc-700 text-white' : 'hover:text-white hover:bg-zinc-800'
              }`}
              title="Cor de fundo (célula, linha ou coluna)"
            >
              <Palette className="w-3.5 h-3.5 text-zinc-200" />
              <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
            </button>

            {openColorMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-48 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1.5 animate-in fade-in duration-100">
                {/* Scope Switcher when a cell is selected */}
                {selectedCell && (
                  <div className="flex bg-zinc-900 p-0.5 rounded-lg text-[11px] font-medium text-zinc-400 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setColorScope('cell')}
                      className={`flex-1 py-1 rounded text-center transition-colors cursor-pointer ${
                        colorScope === 'cell' ? 'bg-zinc-700 text-white shadow-xs font-semibold' : 'hover:text-zinc-200'
                      }`}
                    >
                      Célula
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorScope('row')}
                      className={`flex-1 py-1 rounded text-center transition-colors cursor-pointer ${
                        colorScope === 'row' ? 'bg-zinc-700 text-white shadow-xs font-semibold' : 'hover:text-zinc-200'
                      }`}
                    >
                      Linha
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorScope('col')}
                      className={`flex-1 py-1 rounded text-center transition-colors cursor-pointer ${
                        colorScope === 'col' ? 'bg-zinc-700 text-white shadow-xs font-semibold' : 'hover:text-zinc-200'
                      }`}
                    >
                      Coluna
                    </button>
                  </div>
                )}

                {selectedRow !== null && (
                  <div className="text-[11px] font-semibold text-zinc-300 px-1 py-0.5">
                    Linha {selectedRow + 1}
                  </div>
                )}

                {selectedCol !== null && (
                  <div className="text-[11px] font-semibold text-zinc-300 px-1 py-0.5">
                    Coluna {selectedCol + 1}
                  </div>
                )}

                {/* List of Notion Background Colors */}
                <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin">
                  {NOTION_BG_COLORS.map(item => {
                    const activeColor = getCurrentColor()
                    const isSelected = (item.color === 'transparent' && (activeColor === 'transparent' || !activeColor)) || item.color === activeColor

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => applyColor(item.color)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-xs ${
                          isSelected ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded border border-zinc-600/70 shrink-0"
                            style={{
                              backgroundColor: item.color === 'transparent' ? 'transparent' : item.color,
                              borderColor: item.color === 'transparent' ? undefined : item.preview
                            }}
                          />
                          <span className="text-xs truncate">{item.label}</span>
                        </div>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

          {/* D. Contextual Actions based on Selection Target */}
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
                  commit(removeTableRow(table, selectedRow))
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

          {/* E. Delete Table Option */}
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
        <div
          style={{
            top: `${toolbarTop}px`,
            ...(toolbarLeft !== null ? { left: `${toolbarLeft}px` } : {})
          }}
          className={`absolute z-50 bg-[#1e1416] border border-rose-500/50 rounded-xl shadow-2xl px-3 py-1.5 flex items-center gap-2 text-xs text-rose-200 animate-in fade-in duration-100 ${
            toolbarLeft !== null ? '-translate-x-1/2' : 'left-1/2 -translate-x-1/2'
          }`}
        >
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

      {/* 2. TABLE GRID WITH CLEAN UNCLIPPED TOP/LEFT CONTROLS & DEDICATED HOVER REGIONS */}
      <div className="flex items-start">
        <div
          className="flex-1 overflow-x-auto overflow-y-visible pt-6 pb-2"
          onScroll={updateToolbarPosition}
        >
          <div style={{ width: `${totalTableWidth}px` }} className="relative">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 shadow-sm backdrop-blur-xs">
              <table
                className="border-collapse table-fixed text-xs text-zinc-300"
                style={{ width: `${totalTableWidth}px` }}
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
                      // Strictly show handles ONLY when this specific column is hovered or selected
                      const showColHandles = !readOnly && (isColSelected || isColHovered)
                      const cellCustomBg = table.cellColors?.[`-1:${cIdx}`] || table.rowColors?.[-1] || table.colColors?.[cIdx]

                      return (
                        <th
                          key={cIdx}
                          data-col-index={cIdx}
                          onMouseEnter={() => setHoveredCol(cIdx)}
                          onMouseLeave={() => setHoveredCol(prev => prev === cIdx ? null : prev)}
                          onClick={(e) => {
                            if (!readOnly && !editingCell) {
                              e.stopPropagation()
                              setSelectedCol(prev => prev === cIdx ? null : cIdx)
                              setSelectedRow(null)
                              setSelectedCell(null)
                            }
                          }}
                          onDoubleClick={(e) => {
                            if (!readOnly) {
                              e.stopPropagation()
                              startEditing({ row: -1, col: cIdx }, true)
                            }
                          }}
                          style={{
                            textAlign: table.alignments[cIdx] || 'left',
                            backgroundColor: cellCustomBg || undefined
                          }}
                          className={`relative group/colheader px-3 py-2 font-semibold text-zinc-200 border-r border-zinc-800/50 cursor-pointer select-text transition-colors overflow-hidden ${
                            isColSelected ? 'bg-zinc-700/30' : 'hover:bg-zinc-800/40'
                          }`}
                        >
                          {/* Top Column Handle Pill (Horizontal stroke) + Divider Inserters */}
                          {showColHandles && (
                            <div className="absolute -top-5 left-0 right-0 flex items-center justify-center pointer-events-auto z-30">
                              {/* Left Inserter Dot */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  insertColumn(cIdx)
                                }}
                                onMouseEnter={() => setHoveredCol(cIdx)}
                                className="absolute left-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-zinc-500 hover:bg-zinc-300 hover:scale-125 shadow-xs transition-all z-30 pyrite-table-dot"
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
                                className={`w-6 h-2 rounded-full transition-all cursor-pointer z-30 shadow-xs pyrite-table-pill ${
                                  isColSelected
                                    ? 'bg-zinc-200 text-zinc-900 ring-2 ring-zinc-400 scale-110 pyrite-table-pill-selected'
                                    : 'bg-zinc-600 hover:bg-zinc-400 hover:scale-125'
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
                                  className="absolute right-0 translate-x-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-zinc-500 hover:bg-zinc-300 hover:scale-125 shadow-xs transition-all z-30 pyrite-table-dot"
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
                              className="w-full bg-transparent resize-none outline-none border-none p-0 text-inherit font-inherit leading-normal text-zinc-100"
                              style={{ textAlign: table.alignments[cIdx] || 'left' }}
                              onChange={e => handleCellChange({ row: -1, col: cIdx }, e.target.value, e.target)}
                              onKeyDown={e => handleCellKeyDown(e, { row: -1, col: cIdx })}
                              onBlur={() => setEditingCell(null)}
                            />
                          ) : (
                            <div className="truncate py-0.5">
                              {colName || <span className="text-zinc-500 italic select-none">Coluna {cIdx + 1}</span>}
                            </div>
                          )}

                          {/* Column Resize Handle with Pointer Capture */}
                          {!readOnly && (
                            <div
                              onPointerDown={e => handleResize(e, cIdx)}
                              onClick={e => e.stopPropagation()}
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-zinc-400/80 transition-colors z-20"
                              title="Arrastar para redimensionar coluna"
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
                    // Strictly show handles ONLY when this specific row is hovered or selected
                    const showRowHandles = !readOnly && (isRowSelected || isRowHovered)

                    return (
                      <tr
                        key={rIdx}
                        data-row-index={rIdx}
                        onMouseEnter={() => setHoveredRow(rIdx)}
                        onMouseLeave={() => setHoveredRow(prev => prev === rIdx ? null : prev)}
                        className={`border-b border-zinc-800/40 transition-colors ${
                          isRowSelected ? 'bg-zinc-700/20' : 'hover:bg-zinc-800/20'
                        }`}
                      >
                        {/* Left Gutter Cell with Row Pill Handle & Inserter Dots */}
                        {!readOnly && (
                          <td
                            onClick={(e) => {
                              if (!readOnly && !editingCell) {
                                e.stopPropagation()
                                setSelectedRow(prev => prev === rIdx ? null : rIdx)
                                setSelectedCol(null)
                                setSelectedCell(null)
                              }
                            }}
                            className={`w-7 min-w-[28px] max-w-[28px] p-0 border-r border-zinc-800/60 bg-zinc-900/30 text-center relative select-none cursor-pointer transition-colors ${
                              isRowSelected ? 'bg-zinc-700/30' : 'hover:bg-zinc-800/40'
                            }`}
                          >
                            {showRowHandles && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-30">
                                {/* Top Inserter Dot */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    addRow(rIdx)
                                  }}
                                  onMouseEnter={() => setHoveredRow(rIdx)}
                                  className="absolute top-0 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-zinc-500 hover:bg-zinc-300 hover:scale-125 shadow-xs transition-all z-30 pyrite-table-dot"
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
                                  className={`w-2 h-6 rounded-full transition-all cursor-pointer z-30 shadow-xs pyrite-table-pill ${
                                    isRowSelected
                                      ? 'bg-zinc-200 text-zinc-900 ring-2 ring-zinc-400 scale-110 pyrite-table-pill-selected'
                                      : 'bg-zinc-600 hover:bg-zinc-400 hover:scale-125'
                                  }`}
                                  title={`Selecionar linha ${rIdx + 1}`}
                                />

                                {/* Bottom Inserter Dot (for last row) */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    addRow(rIdx + 1)
                                  }}
                                  onMouseEnter={() => setHoveredRow(rIdx)}
                                  className="absolute bottom-0 translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer bg-zinc-500 hover:bg-zinc-300 hover:scale-125 shadow-xs transition-all z-30 pyrite-table-dot"
                                  title={`Inserir linha depois da linha ${rIdx + 1}`}
                                />
                              </div>
                            )}
                          </td>
                        )}

                        {/* Cell Contents */}
                        {row.map((cellText, cIdx) => {
                          const isCellSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx
                          const isCellEditing = editingCell?.row === rIdx && editingCell?.col === cIdx
                          const isColSelected = selectedCol === cIdx
                          const cellCustomBg = table.cellColors?.[`${rIdx}:${cIdx}`] || table.rowColors?.[rIdx] || table.colColors?.[cIdx]

                          return (
                            <td
                              key={cIdx}
                              data-cell-row={rIdx}
                              data-cell-col={cIdx}
                              onMouseEnter={() => {
                                setHoveredCol(cIdx)
                                setHoveredRow(rIdx)
                              }}
                              onMouseLeave={() => {
                                setHoveredCol(prev => prev === cIdx ? null : prev)
                                setHoveredRow(prev => prev === rIdx ? null : prev)
                              }}
                              style={{
                                textAlign: table.alignments[cIdx] || 'left',
                                backgroundColor: cellCustomBg || undefined
                              }}
                              className={`relative px-3 py-2 border-r border-zinc-800/40 transition-colors overflow-hidden ${
                                isCellSelected
                                  ? 'ring-2 ring-zinc-400 dark:ring-zinc-400 ring-inset bg-zinc-700/20 text-white z-10'
                                  : isColSelected
                                    ? 'bg-zinc-700/20'
                                    : isRowSelected
                                      ? 'bg-zinc-700/20'
                                      : 'hover:bg-zinc-800/20'
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

            {/* 3. BOTTOM BAR: Add Row (Only visible when hovering near the bottom of the table) */}
            {!readOnly && (isHoveringBottomAdd || hoveredRow === table.rows.length - 1) && (
              <div
                className="w-full pt-1.5"
                onMouseEnter={() => setIsHoveringBottomAdd(true)}
                onMouseLeave={() => setIsHoveringBottomAdd(false)}
              >
                <button
                  onClick={() => addRow(table.rows.length)}
                  className="w-full h-6 rounded-lg border border-dashed border-zinc-700/80 hover:border-zinc-500 bg-zinc-800/40 hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 flex items-center justify-center cursor-pointer transition-all duration-100 group animate-in fade-in pyrite-table-add-bar"
                  title="Adicionar linha"
                >
                  <Plus className="w-4 h-4 stroke-[2] group-hover:scale-125 transition-transform" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4. RIGHT BAR: Add Column (Only visible when hovering near the right of the table) */}
        {!readOnly && (isHoveringRightAdd || hoveredCol === table.columns.length - 1) && (
          <div
            className="pt-6 pl-1.5 self-stretch flex items-stretch"
            onMouseEnter={() => setIsHoveringRightAdd(true)}
            onMouseLeave={() => setIsHoveringRightAdd(false)}
          >
            <button
              onClick={() => insertColumn(table.columns.length)}
              className="w-6 rounded-lg border border-dashed border-zinc-700/80 hover:border-zinc-500 bg-zinc-800/40 hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 flex items-center justify-center cursor-pointer transition-all duration-100 group animate-in fade-in pyrite-table-add-bar"
              title="Adicionar coluna"
            >
              <Plus className="w-4 h-4 stroke-[2] group-hover:scale-125 transition-transform" />
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
          className="pyrite-table-wiki-suggest w-72 bg-[#141418] border border-zinc-700/80 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
        >
          <div className="wiki-suggest-header px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="font-mono text-zinc-300">[[</span> Link para Nota
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
                      ? 'bg-zinc-700/60 text-white border border-zinc-600 shadow-xs'
                      : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
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
