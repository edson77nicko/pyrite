import React, { useState, useRef } from 'react'
import type { CanvasCard, CanvasConnection, Note } from '../types'
import {
  Plus,
  Trash2,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  FileText,
  Sparkles
} from 'lucide-react'

interface CanvasViewProps {
  notes?: Note[]
  onOpenNote?: (noteId: string) => void
}

const DEFAULT_CARDS: CanvasCard[] = [
  {
    id: 'c1',
    x: 120,
    y: 120,
    width: 260,
    height: 150,
    text: '💡 Arquitetura do Segundo Cérebro\n\nConectar pensamentos através de grafos e escrita livre sem atrito.',
    color: '#8b5cf6'
  },
  {
    id: 'c2',
    x: 520,
    y: 90,
    width: 270,
    height: 150,
    text: '⚡ Motor de Grafo em Física 2D\n\nForças de repulsão e atração simuladas a 60 FPS com links bidirecionais [[...]].',
    color: '#38bdf8'
  },
  {
    id: 'c3',
    x: 520,
    y: 310,
    width: 270,
    height: 150,
    text: '🤖 Inteligência Semântica\n\nDescoberta de afinidades semânticas ocultas e sínteses automáticas.',
    color: '#34d399'
  }
]

const DEFAULT_CONNECTIONS: CanvasConnection[] = [
  { id: 'conn1', from: 'c1', to: 'c2', label: 'alimenta' },
  { id: 'conn2', from: 'c1', to: 'c3', label: 'conecta com' }
]

const COLOR_PALETTE = ['#8b5cf6', '#38bdf8', '#34d399', '#f59e0b', '#ec4899', '#71717a']

export const CanvasView: React.FC<CanvasViewProps> = ({ notes = [], onOpenNote }) => {
  const [cards, setCards] = useState<CanvasCard[]>(() => {
    const saved = localStorage.getItem('pyrite_canvas_cards')
    return saved ? JSON.parse(saved) : DEFAULT_CARDS
  })

  const [connections, setConnections] = useState<CanvasConnection[]>(() => {
    const saved = localStorage.getItem('pyrite_canvas_conns')
    return saved ? JSON.parse(saved) : DEFAULT_CONNECTIONS
  })

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)
  const [showNotePicker, setShowNotePicker] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const draggingCardRef = useRef<{ id: string; startX: number; startY: number; cardX: number; cardY: number } | null>(null)

  const saveCanvas = (newCards: CanvasCard[], newConns: CanvasConnection[]) => {
    setCards(newCards)
    setConnections(newConns)
    localStorage.setItem('pyrite_canvas_cards', JSON.stringify(newCards))
    localStorage.setItem('pyrite_canvas_conns', JSON.stringify(newConns))
  }

  const handleAddCard = (customText?: string, title?: string, noteId?: string) => {
    const newCard: CanvasCard = {
      id: `c_${Date.now()}`,
      x: -pan.x + 220 + Math.random() * 80,
      y: -pan.y + 160 + Math.random() * 80,
      width: 260,
      height: 150,
      text: customText || 'Novo pensamento...',
      title,
      noteId,
      color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
    }
    saveCanvas([...cards, newCard], connections)
    setSelectedCardId(newCard.id)
  }

  const handleAddNoteCard = (note: Note) => {
    handleAddCard(note.content.slice(0, 180) + '...', note.title, note.id)
    setShowNotePicker(false)
  }

  const handleDeleteCard = (cardId: string) => {
    const updatedCards = cards.filter(c => c.id !== cardId)
    const updatedConns = connections.filter(c => c.from !== cardId && c.to !== cardId)
    saveCanvas(updatedCards, updatedConns)
    if (selectedCardId === cardId) setSelectedCardId(null)
  }

  const handleDeleteConnection = (connId: string) => {
    const updatedConns = connections.filter(c => c.id !== connId)
    saveCanvas(cards, updatedConns)
  }

  const handleUpdateCardText = (cardId: string, newText: string) => {
    const updated = cards.map(c => c.id === cardId ? { ...c, text: newText } : c)
    saveCanvas(updated, connections)
  }

  const handleChangeCardColor = (cardId: string, color: string) => {
    const updated = cards.map(c => c.id === cardId ? { ...c, color } : c)
    saveCanvas(updated, connections)
  }

  const handleStartConnect = (cardId: string) => {
    if (!connectingFromId) {
      setConnectingFromId(cardId)
    } else {
      if (connectingFromId !== cardId) {
        const newConn: CanvasConnection = {
          id: `conn_${Date.now()}`,
          from: connectingFromId,
          to: cardId
        }
        saveCanvas(cards, [...connections, newConn])
      }
      setConnectingFromId(null)
    }
  }

  // Mouse pan & drag handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-card') || (e.target as HTMLElement).closest('button')) {
      return
    }
    isPanningRef.current = true
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    setSelectedCardId(null)
    setConnectingFromId(null)
    setShowNotePicker(false)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingCardRef.current) {
      const { id, startX, startY, cardX, cardY } = draggingCardRef.current
      const dx = (e.clientX - startX) / zoom
      const dy = (e.clientY - startY) / zoom
      setCards(prev => prev.map(c => c.id === id ? { ...c, x: cardX + dx, y: cardY + dy } : c))
      return
    }

    if (isPanningRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      })
    }
  }

  const handleMouseUp = () => {
    if (draggingCardRef.current) {
      localStorage.setItem('pyrite_canvas_cards', JSON.stringify(cards))
      draggingCardRef.current = null
    }
    isPanningRef.current = false
  }

  const handleCardMouseDown = (e: React.MouseEvent, card: CanvasCard) => {
    e.stopPropagation()
    setSelectedCardId(card.id)
    draggingCardRef.current = {
      id: card.id,
      startX: e.clientX,
      startY: e.clientY,
      cardX: card.x,
      cardY: card.y
    }
  }

  const handleDoubleClickCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-card')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = (e.clientX - rect.left - pan.x) / zoom
    const clickY = (e.clientY - rect.top - pan.y) / zoom

    const newCard: CanvasCard = {
      id: `c_${Date.now()}`,
      x: clickX - 130,
      y: clickY - 75,
      width: 260,
      height: 150,
      text: 'Nova ideia...',
      color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
    }
    saveCanvas([...cards, newCard], connections)
    setSelectedCardId(newCard.id)
  }

  return (
    <div
      className="relative w-full h-full bg-[#0d0d10] overflow-hidden select-none"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClickCanvas}
    >
      {/* Dot Grid Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, #52525b 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
      />

      {/* 1. Floating Canvas Action Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-1.5 shadow-2xl">
        <button
          onClick={() => handleAddCard()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 rounded-lg text-xs font-semibold transition-all shadow-md shadow-amber-950/30 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo Cartão</span>
        </button>

        {notes.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowNotePicker(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/60 rounded-lg text-xs font-medium transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Inserir Nota</span>
            </button>

            {showNotePicker && (
              <div className="absolute top-10 left-0 w-56 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl p-1 z-30 max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] uppercase font-semibold text-zinc-500">
                  Notas do Vault
                </div>
                {notes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleAddNoteCard(n)}
                    className="w-full text-left px-2 py-1.5 hover:bg-zinc-800 rounded-lg text-xs text-zinc-300 hover:text-white truncate"
                  >
                    {n.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="h-4 w-px bg-zinc-800" />

        <button
          onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          className="px-2 py-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors text-xs font-mono"
          title="Resetar Zoom e Câmera"
        >
          {Math.round(zoom * 100)}%
        </button>

        {connectingFromId && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-medium animate-pulse">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Clique no cartão de destino</span>
          </div>
        )}
      </div>

      {/* 2. Curved Cubic Bezier SVG Connections Layer */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <defs>
          <marker
            id="canvas-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8b5cf6" />
          </marker>
        </defs>

        {connections.map((conn, index) => {
          const fromCard = cards.find(c => c.id === conn.from)
          const toCard = cards.find(c => c.id === conn.to)
          if (!fromCard || !toCard) return null

          const x1 = fromCard.x + fromCard.width / 2
          const y1 = fromCard.y + fromCard.height / 2
          const x2 = toCard.x + toCard.width / 2
          const y2 = toCard.y + toCard.height / 2

          // Smooth cubic bezier curve control points
          const dx = Math.abs(x2 - x1) * 0.5
          const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`

          return (
            <g key={`${conn.id}_${index}`} className="cursor-pointer pointer-events-auto group" onClick={() => handleDeleteConnection(conn.id)}>
              <path
                d={pathData}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                markerEnd="url(#canvas-arrow)"
                className="group-hover:stroke-rose-400 transition-colors"
              />
              {conn.label && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 8}
                  fill="#c084fc"
                  fontSize="11"
                  textAnchor="middle"
                  className="font-sans font-medium"
                >
                  {conn.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* 3. Cards Layer */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {cards.map(card => {
          const isSelected = card.id === selectedCardId
          const isConnectingSource = card.id === connectingFromId

          return (
            <div
              key={card.id}
              className={`canvas-card absolute rounded-2xl p-4 shadow-2xl flex flex-col justify-between border cursor-move transition-all backdrop-blur-sm ${
                isSelected
                  ? 'ring-2 ring-amber-400/80 border-transparent shadow-amber-950/40'
                  : 'border-zinc-800/80 hover:border-zinc-700'
              } ${isConnectingSource ? 'ring-2 ring-amber-400' : ''}`}
              style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                backgroundColor: '#16161a',
                borderTop: `4px solid ${card.color}`
              }}
              onMouseDown={(e) => handleCardMouseDown(e, card)}
            >
              {card.title && (
                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-zinc-800 text-xs font-semibold text-zinc-100">
                  <span className="truncate">{card.title}</span>
                  {card.noteId && onOpenNote && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenNote(card.noteId!)
                      }}
                      className="p-1 hover:text-amber-400 rounded text-[10px]"
                      title="Abrir nota no Editor"
                    >
                      ↗
                    </button>
                  )}
                </div>
              )}

              <textarea
                value={card.text}
                onChange={(e) => handleUpdateCardText(card.id, e.target.value)}
                className="w-full flex-1 bg-transparent resize-none text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none selectable-text leading-relaxed font-sans"
                placeholder="Escreva sua ideia aqui..."
              />

              {/* Card Footer Controls */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-zinc-500">
                <div className="flex items-center gap-1.5">
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => handleChangeCardColor(card.id, c)}
                      className="w-2.5 h-2.5 rounded-full hover:scale-150 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartConnect(card.id)}
                    className="p-1 hover:text-amber-400 hover:bg-zinc-800 rounded-md transition-colors"
                    title="Conectar com outro cartão (clique aqui, depois no outro)"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCard(card.id)}
                    className="p-1 hover:text-rose-400 hover:bg-zinc-800 rounded-md transition-colors"
                    title="Excluir cartão"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 4. Canvas Helper Pill */}
      <div className="absolute bottom-5 left-5 z-20 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-xl px-3.5 py-1.5 text-xs text-zinc-500 shadow-xl flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>Dê duplo clique para criar um cartão em qualquer lugar</span>
      </div>
    </div>
  )
}
