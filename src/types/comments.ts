export interface NoteComment {
  id: string
  noteId: string
  blockIndex: number
  blockSnippet: string
  author: string
  avatarUrl?: string
  icon?: string // 'user' | 'message' | 'star' | 'flame' | 'check' | 'alert'
  color?: string // optional custom color, defaults to 'var(--accent)'
  text: string
  createdAt: number
  resolved: boolean
  resolvedAt?: number
}
