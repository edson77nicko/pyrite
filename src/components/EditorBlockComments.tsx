import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquarePlus,
  Check,
  RotateCcw,
  Trash2,
  X,
  User,
  MessageSquare,
  Star,
  Flame,
  AlertCircle
} from 'lucide-react'
import type { NoteComment } from '../types/comments'
import {
  getNoteComments,
  addNoteComment,
  updateNoteComment,
  toggleCommentResolved,
  deleteNoteComment,
  formatRelativeTime
} from '../utils/commentsStorage'

interface Props {
  noteId: string
  hoveredBlock: {
    element: HTMLElement
    top: number
    left: number
    right: number
  } | null
  containerRef: React.RefObject<HTMLDivElement | null>
  isEditable: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onCommentChange?: () => void
}

const AVAILABLE_ICONS = [
  { id: 'user', label: 'Boneco', Icon: User },
  { id: 'message', label: 'Mensagem', Icon: MessageSquare },
  { id: 'star', label: 'Estrela', Icon: Star },
  { id: 'flame', label: 'Fogo', Icon: Flame },
  { id: 'check', label: 'Check', Icon: Check },
  { id: 'alert', label: 'Alerta', Icon: AlertCircle }
]

const AVAILABLE_COLORS = [
  { id: 'accent', label: 'Destaque', value: 'var(--accent)' },
  { id: 'emerald', label: 'Esmeralda', value: '#10b981' },
  { id: 'rose', label: 'Rubi', value: '#f43f5e' },
  { id: 'violet', label: 'Violeta', value: '#8b5cf6' },
  { id: 'blue', label: 'Azul', value: '#3b82f6' },
  { id: 'amber', label: 'Âmbar', value: '#f59e0b' }
]

const renderCommentIcon = (iconId?: string, className: string = 'w-3.5 h-3.5') => {
  switch (iconId) {
    case 'message':
      return <MessageSquare className={className} />
    case 'star':
      return <Star className={className} />
    case 'flame':
      return <Flame className={className} />
    case 'check':
      return <Check className={className} />
    case 'alert':
      return <AlertCircle className={className} />
    case 'user':
    default:
      return <User className={className} />
  }
}

export const EditorBlockComments: React.FC<Props> = ({
  noteId,
  hoveredBlock,
  containerRef,
  isEditable,
  onMouseEnter,
  onMouseLeave,
  onCommentChange
}) => {
  const [comments, setComments] = useState<NoteComment[]>(() => getNoteComments(noteId))
  const [activeInputBlock, setActiveInputBlock] = useState<{
    element: HTMLElement
    top: number
    right: number
    blockIndex: number
    snippet: string
  } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [selectedIcon, setSelectedIcon] = useState('user')
  const [selectedColor, setSelectedColor] = useState('var(--accent)')
  const [showColorPicker, setShowColorPicker] = useState(false)

  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const hoverLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pinnedPositions, setPinnedPositions] = useState<{
    comment: NoteComment
    top: number
    right: number
    element: HTMLElement
    isVisible: boolean
  }[]>([])

  const handlePinMouseEnter = (commentId: string) => {
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current)
      hoverLeaveTimeoutRef.current = null
    }
    setHoveredCommentId(commentId)
  }

  const handlePinMouseLeave = () => {
    if (editingCommentId) return
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current)
    }
    hoverLeaveTimeoutRef.current = setTimeout(() => {
      setHoveredCommentId(null)
    }, 180)
  }

  // Reload comments when noteId changes or event fires
  const reload = () => {
    const list = getNoteComments(noteId)
    setComments(list)
    onCommentChange?.()
  }

  useEffect(() => {
    reload()
    const handleUpdate = (e: any) => {
      if (!e.detail?.noteId || e.detail.noteId === noteId) {
        reload()
      }
    }
    window.addEventListener('pyrite_comments_updated', handleUpdate)
    return () => window.removeEventListener('pyrite_comments_updated', handleUpdate)
  }, [noteId])

  // Recalculate block positions for pinned comments
  const updatePinnedPositions = () => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const children = Array.from(container.children) as HTMLElement[]

    const scrollParent = (container.closest('.custom-chat-scrollbar, .overflow-y-auto, .app-editor-pane') || container.parentElement) as HTMLElement | null
    const scrollRect = scrollParent?.getBoundingClientRect()

    const positions: {
      comment: NoteComment
      top: number
      right: number
      element: HTMLElement
      isVisible: boolean
    }[] = []

    comments.forEach(comm => {
      let el = children[comm.blockIndex]
      if (!el || (comm.blockSnippet && !el.innerText?.includes(comm.blockSnippet.slice(0, 20)))) {
        const found = children.find(c => c.innerText?.includes(comm.blockSnippet.slice(0, 25)))
        if (found) el = found
      }

      if (el) {
        const rect = el.getBoundingClientRect()
        const isVisible = scrollRect
          ? (rect.top >= scrollRect.top && rect.top <= scrollRect.bottom - 20)
          : true

        positions.push({
          comment: comm,
          top: rect.top,
          right: containerRect.right + 12,
          element: el,
          isVisible
        })
      }
    })

    setPinnedPositions(positions)
  }

  useEffect(() => {
    updatePinnedPositions()
    const onScroll = () => updatePinnedPositions()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [comments, containerRef])

  // Open add comment input for the hovered block
  const handleOpenAddInput = (el: HTMLElement) => {
    const container = containerRef.current
    if (!container) return
    const rect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const children = Array.from(container.children)
    const blockIndex = Math.max(0, children.indexOf(el))
    const snippet = (el.innerText || '').trim().slice(0, 60)

    setActiveInputBlock({
      element: el,
      top: rect.top,
      right: containerRect.right + 14,
      blockIndex,
      snippet
    })
    setDraftText('')
    setSelectedIcon('user')
    setSelectedColor('var(--accent)')
    setShowColorPicker(false)
  }

  // Submit comment
  const handleSubmitComment = () => {
    if (!draftText.trim() || !activeInputBlock) return
    addNoteComment(noteId, {
      blockIndex: activeInputBlock.blockIndex,
      blockSnippet: activeInputBlock.snippet,
      text: draftText.trim(),
      icon: selectedIcon,
      color: selectedColor
    })
    setActiveInputBlock(null)
    setDraftText('')
    reload()
  }

  // Toggle resolved status
  const handleToggleResolved = (commentId: string) => {
    toggleCommentResolved(noteId, commentId)
    reload()
  }

  // Delete comment
  const handleDeleteComment = (commentId: string) => {
    deleteNoteComment(noteId, commentId)
    reload()
  }

  // Update comment icon / color
  const handleUpdateCommentMeta = (commentId: string, icon?: string, color?: string) => {
    updateNoteComment(noteId, commentId, { icon, color })
    reload()
  }

  // Check if current hovered block already has a comment
  const hoveredHasComment = hoveredBlock && pinnedPositions.some(p => p.element === hoveredBlock.element)

  // Clamp input position so it NEVER overflows off the right edge of the screen
  const inputLeftPos = activeInputBlock
    ? Math.max(16, Math.min(activeInputBlock.right, window.innerWidth - 275))
    : 0
  const inputTopPos = activeInputBlock
    ? Math.max(70, Math.min(activeInputBlock.top, window.innerHeight - 160))
    : 0

  return (
    <>
      {/* 1. RIGHT-SIDE ADD-COMMENT BUTTON (Hovered block) */}
      {isEditable && hoveredBlock && !hoveredHasComment && !activeInputBlock && (
        <div
          style={{
            position: 'fixed',
            top: `${hoveredBlock.top}px`,
            left: `${Math.min(hoveredBlock.right + 10, window.innerWidth - 44)}px`,
            zIndex: 25
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className="flex items-center select-none animate-in fade-in duration-100 group/addcomment"
        >
          <button
            type="button"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={() => handleOpenAddInput(hoveredBlock.element)}
            className="w-5.5 h-5.5 rounded-full border border-zinc-700/80 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center cursor-pointer shadow-sm transition-all hover:scale-110 active:scale-95"
            title="Adicionar comentário nesta linha"
          >
            <MessageSquarePlus className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 2. ULTRA-MINIMAL INLINE ADD-COMMENT INPUT CARD */}
      {activeInputBlock && (
        <div
          style={{
            position: 'fixed',
            top: `${inputTopPos}px`,
            left: `${inputLeftPos}px`,
            zIndex: 45
          }}
          className="w-64 bg-[#18181c] border border-zinc-700/80 rounded-xl shadow-2xl p-1.5 z-40 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
        >
          {/* Top row: Icon/Color trigger & Close */}
          <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-zinc-800/60">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowColorPicker(v => !v)}
                className="w-5.5 h-5.5 rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                title="Trocar ícone e cor"
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: selectedColor === 'var(--accent)' ? 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))' : `${selectedColor}25`,
                    color: selectedColor || 'var(--accent)'
                  }}
                >
                  {renderCommentIcon(selectedIcon, "w-2.5 h-2.5")}
                </div>
              </button>
              <span className="text-[10px] text-zinc-400 font-medium">Comentário</span>
            </div>

            <button
              type="button"
              onClick={() => setActiveInputBlock(null)}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              title="Cancelar (Esc)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Palette selector if open */}
          {showColorPicker && (
            <div className="mb-1.5 p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1.5 animate-in fade-in duration-75">
              {/* Icon choices */}
              <div className="flex items-center justify-between gap-1">
                {AVAILABLE_ICONS.map(item => {
                  const IconComp = item.Icon
                  const isCur = selectedIcon === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedIcon(item.id)}
                      style={isCur ? {
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-contrast, #09090b)'
                      } : undefined}
                      className={`p-1 rounded cursor-pointer transition-colors ${
                        isCur ? 'shadow-sm font-medium' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                      }`}
                      title={item.label}
                    >
                      <IconComp className="w-3 h-3" />
                    </button>
                  )
                })}
              </div>

              {/* Color choices */}
              <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-800">
                {AVAILABLE_COLORS.map(c => {
                  const isCur = selectedColor === c.value
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedColor(c.value)}
                      className={`w-4 h-4 rounded-full border cursor-pointer transition-transform ${
                        isCur ? 'scale-125 border-white ring-1 ring-white/50' : 'border-black/30 hover:scale-110'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Input text field (Enter to submit, Shift+Enter for newline) */}
          <textarea
            autoFocus
            rows={2}
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmitComment()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setActiveInputBlock(null)
              }
            }}
            placeholder="Comentar... (Enter)"
            className="w-full bg-zinc-900/60 border border-zinc-700/60 rounded-lg p-1.5 text-zinc-100 text-xs resize-none outline-none focus:border-[var(--accent)] leading-snug placeholder:text-zinc-500"
          />

          {/* Minimalist Icon-only Actions */}
          <div className="flex items-center justify-between mt-1 px-0.5">
            <span className="text-[9px] text-zinc-500">Enter para salvar</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveInputBlock(null)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Cancelar (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!draftText.trim()}
                onClick={handleSubmitComment}
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast, #09090b)'
                }}
                className="p-1 rounded-md hover:opacity-90 disabled:opacity-40 shadow-xs transition-all cursor-pointer flex items-center justify-center"
                title="Salvar comentário (Enter)"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PINNED COMMENT ICONS ON BLOCKS */}
      {pinnedPositions.map(({ comment, top, right, isVisible }) => {
        if (!isVisible) return null

        const isHovered = hoveredCommentId === comment.id
        const isEditing = editingCommentId === comment.id
        const clampedRight = Math.min(right, window.innerWidth - 38)

        return (
          <div
            key={comment.id}
            style={{
              position: 'fixed',
              top: `${top}px`,
              left: `${clampedRight}px`,
              zIndex: isHovered ? 45 : 20
            }}
            onMouseEnter={() => handlePinMouseEnter(comment.id)}
            onMouseLeave={handlePinMouseLeave}
            className="relative w-7 h-7 select-none"
          >
            {/* COLLAPSED PIN (Smoothly fades & scales out when hovered, never abruptly unmounts) */}
            <div
              className={`absolute top-0 right-0 w-7 h-7 rounded-full rounded-bl-xs shadow-md bg-white dark:bg-[#18181c] border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center cursor-pointer transition-all duration-200 ease-out ${
                isHovered
                  ? 'opacity-0 scale-75 pointer-events-none'
                  : 'opacity-100 scale-100 pointer-events-auto hover:scale-110 active:scale-95'
              } ${comment.resolved ? 'opacity-40 hover:opacity-100' : ''}`}
              title={`Comentário de ${comment.author}: "${comment.text}"`}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center border"
                style={{
                  backgroundColor: comment.color ? `${comment.color}22` : 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                  borderColor: comment.color ? `${comment.color}45` : 'var(--accent-border, rgba(197, 155, 39, 0.3))',
                  color: comment.color || 'var(--accent, #c59b27)'
                }}
              >
                {renderCommentIcon(comment.icon, "w-3 h-3")}
              </div>
            </div>

            {/* EXPANDED COMMENT BUBBLE (Expands smoothly outward from the balloon itself with no pause or stutter) */}
            <div
              className={`absolute top-0 right-0 rounded-xl rounded-bl-xs shadow-2xl p-2.5 bg-white dark:bg-[#1c1c20] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/80 min-w-[240px] max-w-xs origin-top-right transition-all duration-200 ease-out ${
                isHovered
                  ? 'opacity-100 scale-100 translate-y-0 visible pointer-events-auto shadow-black/60'
                  : 'opacity-0 scale-85 -translate-y-1 invisible pointer-events-none'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {/* Bonequinho dot with color & icon editor */}
                <div className="relative group/pinicon shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingCommentId(isEditing ? null : comment.id)}
                    className="w-7 h-7 rounded-full rounded-bl-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                    title="Clique para alterar ícone ou cor"
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center border"
                      style={{
                        backgroundColor: comment.color ? `${comment.color}22` : 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                        borderColor: comment.color ? `${comment.color}45` : 'var(--accent-border, rgba(197, 155, 39, 0.3))',
                        color: comment.color || 'var(--accent, #c59b27)'
                      }}
                    >
                      {renderCommentIcon(comment.icon, "w-3 h-3")}
                    </div>
                  </button>

                  {/* Quick Icon / Color selector popup inside bubble */}
                  {isEditing && (
                    <div className="absolute top-8 left-0 z-50 p-1.5 bg-zinc-900 border border-zinc-750 rounded-lg shadow-xl w-36 space-y-1.5 animate-in fade-in duration-75">
                      <div className="flex items-center justify-between gap-1">
                        {AVAILABLE_ICONS.map(item => {
                          const IconComp = item.Icon
                          const isCur = (comment.icon || 'user') === item.id
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                handleUpdateCommentMeta(comment.id, item.id, comment.color)
                              }}
                              style={isCur ? {
                                backgroundColor: 'var(--accent)',
                                color: 'var(--accent-contrast, #09090b)'
                              } : undefined}
                              className={`p-1 rounded cursor-pointer transition-colors ${
                                isCur ? 'shadow-sm font-medium' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                              }`}
                              title={item.label}
                            >
                              <IconComp className="w-3 h-3" />
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-800">
                        {AVAILABLE_COLORS.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              handleUpdateCommentMeta(comment.id, comment.icon, c.value)
                              setEditingCommentId(null)
                            }}
                            className="w-3.5 h-3.5 rounded-full border border-black/30 hover:scale-110 cursor-pointer"
                            style={{ backgroundColor: c.value }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Header & Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1.5">
                    <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                      {comment.author}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-normal shrink-0">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-700 dark:text-zinc-200 mt-0.5 whitespace-pre-wrap leading-relaxed break-words">
                    {comment.text}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => handleToggleResolved(comment.id)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        comment.resolved
                          ? 'text-amber-500 hover:bg-amber-500/10'
                          : 'text-emerald-500 hover:bg-emerald-500/10'
                      }`}
                    >
                      {comment.resolved ? (
                        <>
                          <RotateCcw className="w-3 h-3" />
                          <span>Reabrir</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Resolver</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteComment(comment.id)}
                      className="p-1 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Excluir comentário"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
