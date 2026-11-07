import React, { useState, useEffect } from 'react'
import {
  MessageSquarePlus,
  Check,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'
import type { NoteComment } from '../types/comments'
import {
  getNoteComments,
  addNoteComment,
  toggleCommentResolved,
  deleteNoteComment,
  formatRelativeTime,
  getUserProfile
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
  onCommentChange?: () => void
}

export const EditorBlockComments: React.FC<Props> = ({
  noteId,
  hoveredBlock,
  containerRef,
  isEditable,
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
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null)
  const [pinnedPositions, setPinnedPositions] = useState<{
    comment: NoteComment
    top: number
    right: number
    element: HTMLElement
  }[]>([])

  const user = getUserProfile()

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

    const positions: {
      comment: NoteComment
      top: number
      right: number
      element: HTMLElement
    }[] = []

    comments.forEach(comm => {
      // Find element by index or snippet matching
      let el = children[comm.blockIndex]
      if (!el || (comm.blockSnippet && !el.innerText?.includes(comm.blockSnippet.slice(0, 20)))) {
        // Fallback: search by snippet
        const found = children.find(c => c.innerText?.includes(comm.blockSnippet.slice(0, 25)))
        if (found) el = found
      }

      if (el) {
        const rect = el.getBoundingClientRect()
        // Anchor to the right of the editor container
        positions.push({
          comment: comm,
          top: rect.top,
          right: containerRect.right + 12,
          element: el
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
  }

  // Submit comment
  const handleSubmitComment = () => {
    if (!draftText.trim() || !activeInputBlock) return
    addNoteComment(noteId, {
      blockIndex: activeInputBlock.blockIndex,
      blockSnippet: activeInputBlock.snippet,
      text: draftText.trim()
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

  // Check if current hovered block already has a comment
  const hoveredHasComment = hoveredBlock && pinnedPositions.some(p => p.element === hoveredBlock.element)

  return (
    <>
      {/* 1. RIGHT-SIDE ADD-COMMENT BUTTON (Shown when hovering over any block) */}
      {isEditable && hoveredBlock && !hoveredHasComment && !activeInputBlock && (
        <div
          style={{
            position: 'fixed',
            top: `${hoveredBlock.top}px`,
            left: `${hoveredBlock.right + 10}px`,
            zIndex: 40
          }}
          className="flex items-center select-none animate-in fade-in duration-100 group/addcomment"
        >
          {/* Invisible hit-area bridge connecting text to button so hover is never lost */}
          <div className="absolute -left-6 top-[-8px] bottom-[-8px] w-6 pointer-events-auto" />

          <button
            type="button"
            onClick={() => handleOpenAddInput(hoveredBlock.element)}
            className="w-6 h-6 rounded-full border border-zinc-700/80 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center cursor-pointer shadow-sm transition-all hover:scale-110"
            title="Adicionar comentário nesta linha"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. INLINE ADD-COMMENT INPUT CARD */}
      {activeInputBlock && (
        <div
          style={{
            position: 'fixed',
            top: `${activeInputBlock.top}px`,
            left: `${activeInputBlock.right}px`,
            zIndex: 60
          }}
          className="w-72 bg-[#18181b] border border-zinc-700/80 rounded-2xl shadow-2xl p-3 z-50 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-150 select-none shadow-black/80"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full border-2 border-orange-500 bg-orange-500 overflow-hidden flex items-center justify-center text-white font-bold text-[10px]"
                style={{
                  backgroundImage: `url(${user.avatarUrl})`,
                  backgroundSize: '320%',
                  backgroundPosition: '53.5% 35.6%'
                }}
              >
                {!user.avatarUrl && 'EC'}
              </div>
              <span className="font-semibold text-zinc-200 text-xs">{user.name}</span>
            </div>
            <button
              onClick={() => setActiveInputBlock(null)}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <textarea
            autoFocus
            rows={2}
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleSubmitComment()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setActiveInputBlock(null)
              }
            }}
            placeholder="Escreva um comentário..."
            className="w-full bg-zinc-900/90 border border-zinc-700/70 rounded-xl p-2 text-zinc-200 text-xs resize-none outline-none focus:border-zinc-500 leading-relaxed placeholder:text-zinc-500"
          />

          <div className="flex items-center justify-between mt-2.5">
            <span className="text-[10px] text-zinc-500">Ctrl+Enter para enviar</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setActiveInputBlock(null)}
                className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!draftText.trim()}
                onClick={handleSubmitComment}
                className="px-3 py-1 rounded-lg bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-white font-medium text-xs shadow-xs transition-all cursor-pointer"
              >
                Comentar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PINNED COMMENT ICONS ON BLOCKS (Matching Image 1 & Expanding into Image 2) */}
      {pinnedPositions.map(({ comment, top, right }) => {
        const isHovered = hoveredCommentId === comment.id

        return (
          <div
            key={comment.id}
            style={{
              position: 'fixed',
              top: `${top}px`,
              left: `${right}px`,
              zIndex: isHovered ? 60 : 35
            }}
            onMouseEnter={() => setHoveredCommentId(comment.id)}
            onMouseLeave={() => setHoveredCommentId(null)}
            className="select-none transition-all duration-150"
          >
            {/* COLLAPSED PIN (Matching Image 1: media_1794030710934_db603c76.png) */}
            {!isHovered ? (
              <div
                className={`w-8 h-8 rounded-full rounded-bl-xs bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 p-0.5 flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${
                  comment.resolved ? 'opacity-40 hover:opacity-100' : ''
                }`}
                title={`Comentário de ${comment.author}: "${comment.text}"`}
              >
                <div
                  className="w-6.5 h-6.5 rounded-full border-2 border-orange-500 bg-orange-500 overflow-hidden flex items-center justify-center text-white font-bold text-[10px]"
                  style={{
                    backgroundImage: `url(${comment.avatarUrl || user.avatarUrl})`,
                    backgroundSize: '320%',
                    backgroundPosition: '53.5% 35.6%'
                  }}
                >
                  {(!comment.avatarUrl && !user.avatarUrl) && 'EC'}
                </div>
              </div>
            ) : (
              /* EXPANDED COMMENT BUBBLE (Matching Image 2: media_1794030745128_85f7f3e1.png) */
              <div className="rounded-2xl rounded-bl-xs shadow-2xl p-3.5 bg-white dark:bg-[#1c1c20] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/80 min-w-[240px] max-w-sm animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full border-2 border-orange-500 bg-orange-500 shrink-0 overflow-hidden flex items-center justify-center text-white font-bold text-xs"
                    style={{
                      backgroundImage: `url(${comment.avatarUrl || user.avatarUrl})`,
                      backgroundSize: '320%',
                      backgroundPosition: '53.5% 35.6%'
                    }}
                  >
                    {(!comment.avatarUrl && !user.avatarUrl) && 'EC'}
                  </div>

                  {/* Header & Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                        {comment.author}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-normal shrink-0">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-700 dark:text-zinc-200 mt-1 whitespace-pre-wrap leading-relaxed break-words">
                      {comment.text}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => handleToggleResolved(comment.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
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
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Excluir comentário"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
