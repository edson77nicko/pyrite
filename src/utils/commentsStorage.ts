import type { NoteComment } from '../types/comments'

const STORAGE_PREFIX = 'pyrite_note_comments_'
const USER_PROFILE_KEY = 'pyrite_user_profile'

export interface UserProfile {
  name: string
  avatarUrl: string
}

export const getUserProfile = (): UserProfile => {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {
    name: 'Edson Cunha',
    avatarUrl: '/comment_pin_sample.png'
  }
}

export const setUserProfile = (profile: UserProfile): void => {
  try {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile))
  } catch {}
}

export const getNoteComments = (noteId: string): NoteComment[] => {
  if (!noteId) return []
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${noteId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

export const saveAllNoteComments = (noteId: string, comments: NoteComment[]): void => {
  if (!noteId) return
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${noteId}`, JSON.stringify(comments))
    // Trigger window event so all components listening for comments update immediately
    window.dispatchEvent(new CustomEvent('pyrite_comments_updated', { detail: { noteId } }))
  } catch {}
}

export const addNoteComment = (
  noteId: string,
  data: {
    blockIndex: number
    blockSnippet: string
    text: string
    author?: string
    avatarUrl?: string
    icon?: string
    color?: string
  }
): NoteComment => {
  const comments = getNoteComments(noteId)
  const user = getUserProfile()
  const newComment: NoteComment = {
    id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    noteId,
    blockIndex: data.blockIndex,
    blockSnippet: data.blockSnippet,
    author: data.author || user.name || 'Edson Cunha',
    avatarUrl: data.avatarUrl || user.avatarUrl,
    icon: data.icon || 'user',
    color: data.color || '',
    text: data.text.trim(),
    createdAt: Date.now(),
    resolved: false
  }
  const next = [...comments, newComment]
  saveAllNoteComments(noteId, next)
  return newComment
}

export const updateNoteComment = (
  noteId: string,
  commentId: string,
  data: Partial<Pick<NoteComment, 'icon' | 'color' | 'text'>>
): NoteComment[] => {
  const comments = getNoteComments(noteId)
  const next = comments.map(c => {
    if (c.id === commentId) {
      return { ...c, ...data }
    }
    return c
  })
  saveAllNoteComments(noteId, next)
  return next
}

export const toggleCommentResolved = (noteId: string, commentId: string): NoteComment[] => {
  const comments = getNoteComments(noteId)
  const next = comments.map(c => {
    if (c.id === commentId) {
      const resolved = !c.resolved
      return {
        ...c,
        resolved,
        resolvedAt: resolved ? Date.now() : undefined
      }
    }
    return c
  })
  saveAllNoteComments(noteId, next)
  return next
}

export const deleteNoteComment = (noteId: string, commentId: string): NoteComment[] => {
  const comments = getNoteComments(noteId)
  const next = comments.filter(c => c.id !== commentId)
  saveAllNoteComments(noteId, next)
  return next
}

export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000))

  if (diffSec < 60) return 'agora'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `há ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `há ${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'}`
  const diffYears = Math.floor(diffMonths / 12)
  return `há ${diffYears} ${diffYears === 1 ? 'ano' : 'anos'}`
}
