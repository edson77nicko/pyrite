import React, { useState, useEffect, useRef } from 'react'
import {
  GripVertical,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Heading1,
  Heading2,
  Heading3,
  ListTodo,
  List,
  ListOrdered,
  MessageSquareText,
  Code,
  Type
} from 'lucide-react'

export interface EditorBlockGutterProps {
  hoveredBlock: {
    element: HTMLElement
    top: number
    left: number
  } | null
  isEditable: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onInsertBelow: (element: HTMLElement) => void
  onDeleteBlock: (element: HTMLElement) => void
  onDuplicateBlock: (element: HTMLElement) => void
  onMoveBlock: (element: HTMLElement, direction: 'up' | 'down') => void
  onTransformBlock: (element: HTMLElement, type: 'p' | 'h1' | 'h2' | 'h3' | 'task' | 'bullet' | 'number' | 'callout' | 'code') => void
  onAskAi: (element: HTMLElement, text: string) => void
  onDragStart: (e: React.DragEvent, element: HTMLElement) => void
  onDragEnd: (e: React.DragEvent) => void
}

export const EditorBlockGutter: React.FC<EditorBlockGutterProps> = ({
  hoveredBlock,
  isEditable,
  onMouseEnter,
  onMouseLeave,
  onInsertBelow,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
  onTransformBlock,
  onAskAi,
  onDragStart,
  onDragEnd
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isTransformOpen, setIsTransformOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMenuOpen(false)
    setIsTransformOpen(false)
  }, [hoveredBlock?.element])

  // Click outside menu listener
  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
        setIsTransformOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  if (!isEditable || !hoveredBlock) return null

  const handleOpenMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsMenuOpen(prev => !prev)
    setIsTransformOpen(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: `${hoveredBlock.top}px`,
        left: `${hoveredBlock.left}px`,
        zIndex: 50
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="appflowy-block-gutter flex items-center gap-0.5 select-none -translate-y-0.5 group/gutter"
    >
      {/* Invisible hover bridge connecting gutter to text container so cursor never drops hover */}
      <div className="absolute -right-8 top-[-8px] bottom-[-8px] w-8 pointer-events-auto" />

      {/* + Button: Insert new line below */}
      <button
        type="button"
        onClick={() => onInsertBelow(hoveredBlock.element)}
        className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors cursor-pointer"
        title="Adicionar bloco abaixo (AppFlowy style)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* Grip 6-dots Handle: Drag & Drop or Click for Menu */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, hoveredBlock.element)}
        onDragEnd={onDragEnd}
        onClick={handleOpenMenu}
        className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors cursor-grab active:cursor-grabbing"
        title="Arraste para mover linha ou clique para opções do bloco"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Block Context Menu */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '26px',
            left: '0px',
            zIndex: 100
          }}
          className="w-56 bg-[#16161b] border border-zinc-800 rounded-xl shadow-2xl p-1.5 text-xs text-zinc-300 shadow-black/80 space-y-1 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Ask AI Option */}
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              const text = hoveredBlock.element.textContent || ''
              onAskAi(hoveredBlock.element, text)
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-500/15 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Melhorar com IA</span>
          </button>

          <div className="h-[1px] bg-zinc-800/80 my-1" />

          {/* Delete Block */}
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              onDeleteBlock(hoveredBlock.element)
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-950/40 text-zinc-300 hover:text-red-300 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-zinc-500" />
            <span>Excluir</span>
          </button>

          {/* Duplicate Block */}
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              onDuplicateBlock(hoveredBlock.element)
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-zinc-500" />
            <span>Duplicar</span>
          </button>

          {/* Move Up / Down */}
          <div className="grid grid-cols-2 gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => {
                onMoveBlock(hoveredBlock.element, 'up')
              }}
              className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-[11px]"
            >
              <ArrowUp className="w-3 h-3" />
              <span>Subir</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onMoveBlock(hoveredBlock.element, 'down')
              }}
              className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-[11px]"
            >
              <ArrowDown className="w-3 h-3" />
              <span>Descer</span>
            </button>
          </div>

          <div className="h-[1px] bg-zinc-800/80 my-1" />

          {/* Transform into submenu */}
          <div>
            <button
              type="button"
              onClick={() => setIsTransformOpen(prev => !prev)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Type className="w-3.5 h-3.5 text-zinc-500" />
                <span>Transformar em...</span>
              </span>
              <span className="text-[10px] text-zinc-500">{isTransformOpen ? '▲' : '▼'}</span>
            </button>

            {isTransformOpen && (
              <div className="mt-1 pl-2 space-y-0.5 border-l border-zinc-800 ml-2">
                {[
                  { id: 'p' as const, label: 'Texto normal', icon: Type },
                  { id: 'h1' as const, label: 'Título 1', icon: Heading1 },
                  { id: 'h2' as const, label: 'Título 2', icon: Heading2 },
                  { id: 'h3' as const, label: 'Título 3', icon: Heading3 },
                  { id: 'task' as const, label: 'Lista de Tarefas', icon: ListTodo },
                  { id: 'bullet' as const, label: 'Lista de Marcadores', icon: List },
                  { id: 'number' as const, label: 'Lista Numerada', icon: ListOrdered },
                  { id: 'callout' as const, label: 'Destaque (Callout)', icon: MessageSquareText },
                  { id: 'code' as const, label: 'Bloco de Código', icon: Code }
                ].map(item => {
                  const ItemIcon = item.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false)
                        setIsTransformOpen(false)
                        onTransformBlock(hoveredBlock.element, item.id)
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800 text-[11px] text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      <ItemIcon className="w-3 h-3 text-zinc-500" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
