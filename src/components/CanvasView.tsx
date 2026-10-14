import React, { useState, useRef } from 'react'
import type { CanvasCard, CanvasConnection, Note } from '../types'
import { Plus, Trash2, ArrowRight, ZoomIn, ZoomOut } from 'lucide-react'

interface CanvasViewProps {
  notes?: Note[]
  onOpenNote?: (noteId: string) => void
}

const DEFAULT_CARDS: CanvasCard[] = [
  {
    id: 'c1',
    x: 100,
    y: 100,
    width: 260,
    height: 140,
    text: '💡 Conceito Central\nConstruir um segundo cérebro focado em grafos e escrita rápida.',
    color: '#8b5cf6'
  },
  {
    id: 'c2',
    x: 450,
    y: 80,
    width: 260,
    height: 140,
    text: '⚡ Motor de Grafo 2D\nFísica de forças em tempo real, nós conectados via [[wikilinks]].',
    color: '#38bdf8'
  },
  {
    id: 'c3',
    x: 450,
    y: 280,
    width: 260,
    height: 140,
    text: '🤖 Inteligência Semântica\nAuto-sugestão de links e resumo automático das notas.',
    color: '#34d399'
  }
]

const DEFAULT_CONNECTIONS: CanvasConnection[] = [
  { id: 'conn1', from: 'c1', to: 'c2', label: 'alimenta' },
  { id: 'conn1', from: 'c1', to: 'c3', label: 'conecta com' }
]

const COLOR_PALETTE = ['#8b5cf6', '#38bdf8', '#34d399', '#f59e0b', '#ec4899', '#71717a']

export const CanvasView: React.FC<CanvasViewProps> = () => {
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

  const handleAddCard = () => {
    const newCard: CanvasCard = {
      id: `c_${Date.now()}`,
      x: -pan.x + 200 + Math.random() * 80,
      y: -pan.y + 150 + Math.random() * 80,
      width: 240,
      height: 130,
      text: 'Novo cartão de ideias...',
      color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
    }
    saveCanvas([...cards, newCard], connections)
    setSelectedCardId(newCard.id)
  }

  const handleDeleteCard = (cardId: string) => {
    const updatedCards = cards.filter(c => c.id !== cardId)
    const updatedConns = connections.filter(c => c.from !== cardId && c.to !== cardId)
    saveCanvas(updatedCards, updatedConns)
    if (selectedCardId === cardId) setSelectedCardId(null)
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

  // Mouse handlers for dragging & canvas panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-card') || (e.target as HTMLElement).closest('button')) {
      return
    }
    isPanningRef.current = true
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    setSelectedCardId(null)
    setConnectingFromId(null)
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

  return (
    <div
      className="relative w-full h-full bg-zinc-950 overflow-hidden select-none"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Floating Canvas Controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-lg p-1.5 shadow-xl">
        <button
          onClick={handleAddCard}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo Cartão</span>
        </button>

        <div className="h-4 w-px bg-zinc-800" />

        <button
          onClick={() => setZoom(z => Math.min(2, z + 0.1))}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors text-xs font-mono"
          title="Resetar Posição"
        >
          {Math.round(zoom * 100)}%
        </button>

        {connectingFromId && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-xs font-medium animate-pulse">
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Clique no cartão destino</span>
          </div>
        )}
      </div>

      {/* SVG Connections Layer */}
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
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#8b5cf6" />
          </marker>
        </defs>

        {connections.map(conn => {
          const fromCard = cards.find(c => c.id === conn.from)
          const toCard = cards.find(c => c.id === conn.to)
          if (!fromCard || !toCard) return null

          const x1 = fromCard.x + fromCard.width / 2
          const y1 = fromCard.y + fromCard.height / 2
          const x2 = toCard.x + toCard.width / 2
          const y2 = toCard.y + toCard.height / 2

          return (
            <g key={conn.id}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#8b5cf6"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                markerEnd="url(#canvas-arrow)"
              />
              {conn.label && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 8}
                  fill="#c084fc"
                  fontSize="12"
                  textAnchor="middle"
                  className="bg-zinc-900 font-sans"
                >
                  {conn.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Cards Layer */}
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
              className={`canvas-card absolute rounded-xl p-3 shadow-2xl flex flex-col justify-between border cursor-move transition-shadow ${
                isSelected ? 'ring-2 ring-violet-500 border-transparent' : 'border-zinc-800'
              } ${isConnectingSource ? 'ring-2 ring-amber-400' : ''}`}
              style={{
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                backgroundColor: '#18181b',
                borderTop: `4px solid ${card.color}`
              }}
              onMouseDown={(e) => handleCardMouseDown(e, card)}
            >
              <textarea
                value={card.text}
                onChange={(e) => handleUpdateCardText(card.id, e.target.value)}
                className="w-full h-full bg-transparent resize-none text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none selectable-text leading-relaxed font-sans"
                placeholder="Escreva seu pensamento..."
              />

              {/* Card Footer Controls */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-zinc-500">
                <div className="flex items-center gap-1">
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => handleChangeCardColor(card.id, c)}
                      className="w-3 h-3 rounded-full hover:scale-125 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartConnect(card.id)}
                    className="p-1 hover:text-violet-400 hover:bg-zinc-800 rounded transition-colors"
                    title="Conectar com outro cartão"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCard(card.id)}
                    className="p-1 hover:text-rose-400 hover:bg-zinc-800 rounded transition-colors"
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
    </div>
  )
}
