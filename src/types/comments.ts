export interface NoteComment {
  id: string
  noteId: string
  blockIndex: number
  blockSnippet: string
  author: string
  avatarUrl?: string
  text: string
  createdAt: number
  resolved: boolean
  resolvedAt?: number
}
