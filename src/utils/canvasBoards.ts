import type { CanvasCard, CanvasConnection, Note } from '../types'
export interface CanvasBoard { id: string; name: string; cards: CanvasCard[]; connections: CanvasConnection[]; view: { x: number; y: number; zoom: number } }
export interface CanvasDocument { version: 1; activeBoardId: string; boards: CanvasBoard[] }
const id = () => crypto.randomUUID()
export function createBoard(name: string, example = false): CanvasBoard {
  const board: CanvasBoard = { id: id(), name, cards: [], connections: [], view: { x: 0, y: 0, zoom: 1 } }
  if (example) {
    board.view.y = 60
    board.cards = [
      { id: id(), title: '1. Objetivo', text: 'Exemplo: organizar o lançamento de um projeto.\n\nTroque este texto pelo resultado que você quer alcançar.', x: 40, y: 60, width: 280, height: 210, color: '#71717a' },
      { id: id(), title: '2. Referências', text: 'Use “Vincular nota” para trazer pesquisas e anotações do cofre.\n\nO cartão acompanha o conteúdo da nota.', x: 400, y: 60, width: 280, height: 210, color: '#71717a' },
      { id: id(), title: '3. Próximo passo', text: 'Escreva a próxima ação e conecte os cartões para explicar como as ideias se relacionam.', x: 400, y: 350, width: 280, height: 210, color: '#71717a' }
    ]
    board.connections = [{ id: id(), from: board.cards[0].id, to: board.cards[1].id, label: 'precisa de' }, { id: id(), from: board.cards[1].id, to: board.cards[2].id, label: 'orienta' }]
  }
  return board
}
export function isCanvasDocument(value: unknown): value is CanvasDocument {
  const doc = value as CanvasDocument | null
  return !!doc && doc.version === 1 && typeof doc.activeBoardId === 'string' && Array.isArray(doc.boards) && doc.boards.length > 0 && doc.boards.some(board => board?.id === doc.activeBoardId) && doc.boards.every(board =>
    !!board && typeof board.id === 'string' && typeof board.name === 'string' && Array.isArray(board.cards) && Array.isArray(board.connections) &&
    board.cards.every(card => !!card && (card.title === undefined || typeof card.title === 'string') && (card.noteId === undefined || typeof card.noteId === 'string') && (card.notePath === undefined || typeof card.notePath === 'string') && typeof card.id === 'string' && typeof card.text === 'string' && typeof card.color === 'string' && [card.x, card.y, card.width, card.height].every(Number.isFinite) && card.width > 0 && card.height > 0) &&
    board.connections.every(edge => !!edge && typeof edge.id === 'string' && typeof edge.from === 'string' && typeof edge.to === 'string' && (edge.label === undefined || typeof edge.label === 'string')) &&
    !!board.view && [board.view.x, board.view.y, board.view.zoom].every(Number.isFinite) && board.view.zoom > 0)
}
export function notePath(note: Note, vaultPath?: string): string {
  const file = note.filePath?.replace(/\\/g, '/')
  const root = vaultPath?.replace(/\\/g, '/').replace(/\/+$/, '')
  if (file && root && file.toLowerCase().startsWith(root.toLowerCase() + '/')) return file.slice(root.length + 1)
  return `${note.folder && note.folder !== 'Início' ? note.folder + '/' : ''}${note.title}.md`
}
export function linkedNote(card: CanvasCard, notes: Note[], vaultPath?: string): Note | undefined {
  return notes.find(note => note.id === card.noteId) || notes.find(note => card.notePath && notePath(note, vaultPath).toLowerCase() === card.notePath.toLowerCase())
}
export function initialCanvas(storage: Pick<Storage, 'getItem'>, importLegacy: boolean): CanvasDocument {
  const example = createBoard('Meu primeiro projeto', true)
  const boards = [example]
  if (importLegacy) {
    const cards = JSON.parse(storage.getItem('pyrite_canvas_cards') || '[]')
    const connections = JSON.parse(storage.getItem('pyrite_canvas_conns') || '[]')
    if (Array.isArray(cards) && cards.length) {
      const legacy = { ...createBoard('Canvas anterior'), cards, connections }
      if (isCanvasDocument({ version: 1, activeBoardId: legacy.id, boards: [legacy] })) boards.push(legacy)
    }
  }
  return { version: 1, activeBoardId: boards.length > 1 ? boards[1].id : example.id, boards }
}
