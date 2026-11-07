import React, { useState, useEffect } from 'react'
import {
  MessageSquare,
  Check,
  RotateCcw,
  Trash2,
  X,
  CornerDownRight
} from 'lucide-react'
import type { NoteComment } from '../types/comments'
import {
  getNoteComments,
  toggleCommentResolved,
  deleteNoteComment,
  formatRelativeTime,
  getUserProfile
} from '../utils/commentsStorage'

interface Props {
  noteId: string
  isOpen: boolean
  onClose: () => void
  onSelectComment: (comment: NoteComment) => void
}

type TabType = 'open' | 'resolved' | 'all'

export const NoteCommentsModal: React.FC<Props> = ({
  noteId,
  isOpen,
  onClose,
  onSelectComment
}) => {
  const [comments, setComments] = useState<NoteComment[]>(() => getNoteComments(noteId))
  const [activeTab, setActiveTab] = useState<TabType>('open')
  const user = getUserProfile()

  const reload = () => {
    setComments(getNoteComments(noteId))
  }

  useEffect(() => {
    if (isOpen) {
      reload()
    }
    const handleUpdate = (e: any) => {
      if (!e.detail?.noteId || e.detail.noteId === noteId) {
        reload()
      }
    }
    window.addEventListener('pyrite_comments_updated', handleUpdate)
    return () => window.removeEventListener('pyrite_comments_updated', handleUpdate)
  }, [noteId, isOpen])

  if (!isOpen) return null

  const openComments = comments.filter(c => !c.resolved)
  const resolvedComments = comments.filter(c => c.resolved)

  const displayedComments = activeTab === 'open'
    ? openComments
    : activeTab === 'resolved'
      ? resolvedComments
      : comments

  const handleToggle = (e: React.MouseEvent, commentId: string) => {
    e.stopPropagation()
    toggleCommentResolved(noteId, commentId)
    reload()
  }

  const handleDelete = (e: React.MouseEvent, commentId: string) => {
    e.stopPropagation()
    deleteNoteComment(noteId, commentId)
    reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100">
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#16161b] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-zinc-300 animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
            <span className="font-semibold text-sm text-zinc-100">Comentários da Nota</span>
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-400">
              {comments.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs: Abertos, Resolvidos, Todos */}
        <div className="flex items-center gap-1 px-5 pt-3 pb-2 border-b border-zinc-800/60 bg-zinc-950/20 text-xs">
          <button
            onClick={() => setActiveTab('open')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'open'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <span>Abertos</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'open' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
              {openComments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('resolved')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'resolved'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <span>Resolvidos</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'resolved' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
              {resolvedComments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <span>Todos</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'all' ? 'bg-zinc-700 text-zinc-200 font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
              {comments.length}
            </span>
          </button>
        </div>

        {/* Comment List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-chat-scrollbar">
          {displayedComments.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-500 text-xs">
              <MessageSquare className="w-8 h-8 stroke-1 text-zinc-600 mb-2" />
              <span>Nenhum comentário {activeTab === 'open' ? 'aberto' : activeTab === 'resolved' ? 'resolvido' : 'nesta nota'}.</span>
            </div>
          ) : (
            displayedComments.map(c => (
              <div
                key={c.id}
                onClick={() => {
                  onSelectComment(c)
                  onClose()
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer group ${
                  c.resolved
                    ? 'border-zinc-800/60 bg-zinc-900/20 opacity-70 hover:opacity-100 hover:border-zinc-700'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/50 shadow-sm'
                }`}
              >
                {/* Header line: Avatar, Author, Relative time */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full border-2 border-orange-500 bg-orange-500 overflow-hidden flex items-center justify-center text-white font-bold text-[10px]"
                      style={{
                        backgroundImage: `url(${c.avatarUrl || user.avatarUrl})`,
                        backgroundSize: '320%',
                        backgroundPosition: '53.5% 35.6%'
                      }}
                    >
                      {(!c.avatarUrl && !user.avatarUrl) && 'EC'}
                    </div>
                    <span className="font-semibold text-xs text-zinc-200">{c.author}</span>
                  </div>

                  <span className="text-[11px] text-zinc-500">{formatRelativeTime(c.createdAt)}</span>
                </div>

                {/* Block snippet excerpt where it was added */}
                {c.blockSnippet && (
                  <div className="flex items-center gap-1.5 px-2 py-1 mb-2 rounded bg-black/30 border-l-2 border-[var(--accent)] text-[11px] text-zinc-400 italic truncate">
                    <CornerDownRight className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="truncate">{c.blockSnippet}</span>
                  </div>
                )}

                {/* Comment content */}
                <div className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {c.text}
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/60">
                  <span className="text-[10px] text-zinc-500 group-hover:text-[var(--accent)] transition-colors flex items-center gap-1">
                    <span>Clique para rolar até a linha</span>
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggle(e, c.id)}
                      className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                        c.resolved
                          ? 'text-amber-400 hover:bg-amber-500/15'
                          : 'text-emerald-400 hover:bg-emerald-500/15'
                      }`}
                      title={c.resolved ? 'Reabrir comentário' : 'Marcar como resolvido'}
                    >
                      {c.resolved ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, c.id)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                      title="Excluir comentário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
