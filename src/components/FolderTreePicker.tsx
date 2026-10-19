import React, { useState, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Check,
  FolderCheck
} from 'lucide-react'

export interface FolderTreeItem {
  name: string
  fullPath: string
  directCount: number
  totalCount: number
  children: FolderTreeItem[]
}

interface FolderTreePickerProps {
  anchorRef: React.RefObject<HTMLDivElement | null>
  popupRef: React.RefObject<HTMLDivElement | null>
  folders: { folder: string; count: number }[]
  selectedFolder: string | null
  currentNoteFolder?: string
  onSelectFolder: (folder: string | null) => void
  onClose: () => void
}

function buildTree(folders: { folder: string; count: number }[]): FolderTreeItem[] {
  interface MutableNode {
    name: string
    fullPath: string
    directCount: number
    childrenMap: Map<string, MutableNode>
  }

  const rootMap = new Map<string, MutableNode>()

  for (const { folder, count } of folders) {
    const clean = folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (!clean) continue

    const parts = clean.split('/')
    let currentMap = rootMap
    let accumulatedPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

      let node = currentMap.get(part)
      if (!node) {
        node = {
          name: part,
          fullPath: accumulatedPath,
          directCount: 0,
          childrenMap: new Map()
        }
        currentMap.set(part, node)
      }

      if (i === parts.length - 1) {
        node.directCount += count
      }

      currentMap = node.childrenMap
    }
  }

  function convert(node: MutableNode): FolderTreeItem {
    const children = Array.from(node.childrenMap.values())
      .map(convert)
      .sort((a, b) => a.name.localeCompare(b.name))

    const childTotals = children.reduce((acc, c) => acc + c.totalCount, 0)
    return {
      name: node.name,
      fullPath: node.fullPath,
      directCount: node.directCount,
      totalCount: node.directCount + childTotals,
      children
    }
  }

  return Array.from(rootMap.values())
    .map(convert)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const FolderTreePicker: React.FC<FolderTreePickerProps> = ({
  anchorRef,
  popupRef,
  folders,
  selectedFolder,
  currentNoteFolder,
  onSelectFolder,
  onClose
}) => {
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState({ left: 8, top: 8, width: 288, maxHeight: 360 })
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!anchor) return
      const width = Math.min(288, innerWidth - 16)
      const above = anchor.top - 16
      const below = innerHeight - anchor.bottom - 16
      const openAbove = above >= Math.min(360, below)
      const maxHeight = Math.max(80, Math.min(360, openAbove ? above : below))
      const height = Math.min(popupRef.current?.scrollHeight || maxHeight, maxHeight)
      setPosition({ left: Math.max(8, Math.min(anchor.left, innerWidth - width - 8)), top: openAbove ? anchor.top - height - 8 : anchor.bottom + 8, width, maxHeight })
    }
    place()
    const observer = new ResizeObserver(place)
    if (popupRef.current) observer.observe(popupRef.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchorRef, popupRef])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (selectedFolder) {
      const parts = selectedFolder.replace(/\\/g, '/').split('/')
      let cur = ''
      for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p
        initial.add(cur)
      }
    }
    return initial
  })

  const tree = useMemo(() => buildTree(folders), [folders])

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderNode = (node: FolderTreeItem, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedPaths.has(node.fullPath) || search.trim().length > 0
    const isSelected = selectedFolder === node.fullPath
    const isMatch = search.trim()
      ? node.fullPath.toLowerCase().includes(search.toLowerCase())
      : true

    if (search.trim() && !isMatch && !node.children.some(c => c.fullPath.toLowerCase().includes(search.toLowerCase()))) {
      return null
    }

    return (
      <div key={node.fullPath} className="space-y-0.5">
        <div
          onClick={() => {
            onSelectFolder(node.fullPath)
            onClose()
          }}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-lg text-xs cursor-pointer transition-colors group ${
            isSelected
              ? 'bg-white/[0.07] text-zinc-100'
              : 'hover:bg-zinc-800/60 text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={e => toggleExpand(node.fullPath, e)}
                className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5" />
            )}

            {isExpanded ? (
              <FolderOpen className={`w-3.5 h-3.5 shrink-0 text-zinc-400`} />
            ) : (
              <Folder className={`w-3.5 h-3.5 shrink-0 text-zinc-400`} />
            )}

            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <span className="text-[10px] font-mono text-zinc-500">
              {node.totalCount} {node.totalCount === 1 ? 'nota' : 'notas'}
            </span>
            {isSelected && <Check className="w-3.5 h-3.5 text-zinc-400" />}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-zinc-800 ml-3 pl-1 space-y-0.5">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Selecionar pasta de contexto"
      style={position}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); anchorRef.current?.querySelector<HTMLButtonElement>('button')?.focus() } }}
      onClick={e => e.stopPropagation()}
      className="fixed z-[200] bg-[#18181b] border border-white/10 rounded-lg p-2 shadow-2xl space-y-2 flex flex-col overflow-hidden select-none text-xs text-zinc-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
        <div className="flex items-center gap-1.5">
          <FolderCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-medium text-zinc-300 text-[11px]">Selecionar Pasta de Contexto</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 absolute left-2 text-zinc-500" />
        <input
          type="text"
          autoFocus
          aria-label="Filtrar pastas"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar pastas e subpastas..."
          className="w-full bg-[#14151b] border border-zinc-800 focus:border-zinc-600 rounded-lg pl-7 pr-7 py-1 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 text-zinc-500 hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Quick Action: Use Current Note's Folder */}
      {currentNoteFolder && currentNoteFolder !== 'Início' && (
        <button
          type="button"
          onClick={() => {
            onSelectFolder(currentNoteFolder)
            onClose()
          }}
          className="w-full px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] text-zinc-300 text-[11px] font-medium flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="truncate">Pasta da nota: {currentNoteFolder}</span>
          <span className="text-[10px] text-zinc-400">Ativar</span>
        </button>
      )}

      {/* Hierarchical Folder List */}
      <div className="flex-1 min-h-0 overflow-y-auto max-h-56 pr-1 space-y-0.5 custom-chat-scrollbar">
        {tree.length === 0 ? (
          <div className="p-3 text-center text-zinc-500 text-xs">
            Nenhuma pasta encontrada no cofre.
          </div>
        ) : (
          tree.map(node => renderNode(node, 0))
        )}
      </div>

      {/* Footer: Clear context */}
      {selectedFolder && (
        <div className="pt-1.5 border-t border-zinc-800/80 flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 truncate max-w-[150px]">
            Ativa: {selectedFolder}
          </span>
          <button
            type="button"
            onClick={() => {
              onSelectFolder(null)
              onClose()
            }}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Desativar Pasta
          </button>
        </div>
      )}
    </div>, document.body
  )
}
