import type { DrawDocument, DrawElement, DrawPoint, DrawViewport } from '../types/draw'

export function isDrawContent(content?: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  return (
    trimmed.startsWith('{"type":"pyrita-draw"') ||
    trimmed.startsWith('{\n  "type": "pyrita-draw"') ||
    trimmed.includes('"type": "pyrita-draw"') ||
    trimmed.includes('"type":"pyrita-draw"')
  )
}

export function createEmptyDrawDocument(initialTitle?: string): DrawDocument {
  const elements: DrawElement[] = []

  if (initialTitle) {
    elements.push({
      id: 'title_' + crypto.randomUUID(),
      type: 'text',
      x: 100,
      y: 80,
      width: 320,
      height: 48,
      strokeColor: '#e4e4e7',
      backgroundColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      fillStyle: 'none',
      text: initialTitle,
      fontSize: 28,
      fontFamily: 'sans',
      textAlign: 'left'
    })
  }

  return {
    type: 'pyrita-draw',
    version: 1,
    elements,
    viewport: {
      panX: 0,
      panY: 0,
      zoom: 1
    }
  }
}

export function parseDrawDocument(content?: string, fallbackTitle?: string): DrawDocument {
  if (!content || !content.trim()) {
    return createEmptyDrawDocument(fallbackTitle)
  }

  try {
    const parsed = JSON.parse(content)
    if (parsed && parsed.type === 'pyrita-draw' && Array.isArray(parsed.elements)) {
      return {
        type: 'pyrita-draw',
        version: 1,
        elements: parsed.elements || [],
        viewport: parsed.viewport || { panX: 0, panY: 0, zoom: 1 }
      }
    }
  } catch {
    // If not valid JSON, return empty
  }

  return createEmptyDrawDocument(fallbackTitle)
}

export function serializeDrawDocument(doc: DrawDocument): string {
  return JSON.stringify(doc, null, 2)
}

// Helper: Calculate bounding box of element
export function getElementBounds(el: DrawElement): { x: number; y: number; width: number; height: number } {
  if (el.type === 'freedraw' && el.points && el.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of el.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const padding = (el.strokeWidth || 2) * 2
    return {
      x: el.x + minX - padding,
      y: el.y + minY - padding,
      width: Math.max(20, maxX - minX + padding * 2),
      height: Math.max(20, maxY - minY + padding * 2)
    }
  }

  const x = el.width < 0 ? el.x + el.width : el.x
  const y = el.height < 0 ? el.y + el.height : el.y
  const width = Math.abs(el.width)
  const height = Math.abs(el.height)

  return { x, y, width, height }
}

// Helper: Point in element detection (hit testing)
export function isPointInElement(point: DrawPoint, el: DrawElement): boolean {
  const bounds = getElementBounds(el)
  const margin = Math.max(8, el.strokeWidth * 2)

  if (
    point.x < bounds.x - margin ||
    point.x > bounds.x + bounds.width + margin ||
    point.y < bounds.y - margin ||
    point.y > bounds.y + bounds.height + margin
  ) {
    return false
  }

  if (el.type === 'freedraw' && el.points) {
    const px = point.x - el.x
    const py = point.y - el.y
    for (const p of el.points) {
      const dist = Math.hypot(p.x - px, p.y - py)
      if (dist <= margin) return true
    }
    return false
  }

  if (el.type === 'line' || el.type === 'arrow') {
    const x1 = el.x
    const y1 = el.y
    const x2 = el.x + el.width
    const y2 = el.y + el.height
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)
    if (l2 === 0) return Math.hypot(point.x - x1, point.y - y1) <= margin
    const t = Math.max(0, Math.min(1, ((point.x - x1) * (x2 - x1) + (point.y - y1) * (y2 - y1)) / l2))
    const projX = x1 + t * (x2 - x1)
    const projY = y1 + t * (y2 - y1)
    return Math.hypot(point.x - projX, point.y - projY) <= margin
  }

  return true
}

// Canvas rendering engine with hand-drawn organic aesthetic
export function renderElementToCanvas(ctx: CanvasRenderingContext2D, el: DrawElement) {
  ctx.save()

  ctx.strokeStyle = el.strokeColor || '#e4e4e7'
  ctx.fillStyle = el.backgroundColor || 'transparent'
  ctx.lineWidth = el.strokeWidth || 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (el.strokeStyle === 'dashed') {
    ctx.setLineDash([8, 6])
  } else if (el.strokeStyle === 'dotted') {
    ctx.setLineDash([3, 5])
  } else {
    ctx.setLineDash([])
  }

  const normX = el.width < 0 ? el.x + el.width : el.x
  const normY = el.height < 0 ? el.y + el.height : el.y
  const normW = Math.abs(el.width)
  const normH = Math.abs(el.height)

  const hasFill = el.backgroundColor && el.backgroundColor !== 'transparent' && el.fillStyle !== 'none'
  const isSemi = el.fillStyle === 'semi'

  if (hasFill) {
    ctx.fillStyle = el.backgroundColor
    if (isSemi) {
      ctx.globalAlpha = 0.25
    }
  }

  switch (el.type) {
    case 'rectangle': {
      const radius = Math.min(12, normW / 4, normH / 4)
      ctx.beginPath()
      if (radius > 2) {
        ctx.roundRect(normX, normY, normW, normH, radius)
      } else {
        ctx.rect(normX, normY, normW, normH)
      }

      if (hasFill) {
        ctx.fill()
      }

      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'diamond': {
      const midX = normX + normW / 2
      const midY = normY + normH / 2

      ctx.beginPath()
      ctx.moveTo(midX, normY)
      ctx.lineTo(normX + normW, midY)
      ctx.lineTo(midX, normY + normH)
      ctx.lineTo(normX, midY)
      ctx.closePath()

      if (hasFill) {
        ctx.fill()
      }

      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'ellipse': {
      const rx = normW / 2
      const ry = normH / 2
      const cx = normX + rx
      const cy = normY + ry

      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)

      if (hasFill) {
        ctx.fill()
      }

      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'line': {
      ctx.beginPath()
      ctx.moveTo(el.x, el.y)
      ctx.lineTo(el.x + el.width, el.y + el.height)
      ctx.stroke()
      break
    }

    case 'arrow': {
      const fromX = el.x
      const fromY = el.y
      const toX = el.x + el.width
      const toY = el.y + el.height

      // Main line
      ctx.beginPath()
      ctx.moveTo(fromX, fromY)
      ctx.lineTo(toX, toY)
      ctx.stroke()

      // Arrowhead
      const angle = Math.atan2(toY - fromY, toX - fromX)
      const headLength = Math.max(12, (el.strokeWidth || 2) * 4)
      const headAngle = Math.PI / 6

      ctx.beginPath()
      ctx.moveTo(toX, toY)
      ctx.lineTo(
        toX - headLength * Math.cos(angle - headAngle),
        toY - headLength * Math.sin(angle - headAngle)
      )
      ctx.moveTo(toX, toY)
      ctx.lineTo(
        toX - headLength * Math.cos(angle + headAngle),
        toY - headLength * Math.sin(angle + headAngle)
      )
      ctx.stroke()
      break
    }

    case 'freedraw': {
      if (!el.points || el.points.length === 0) break

      ctx.beginPath()
      const pts = el.points
      ctx.moveTo(el.x + pts[0].x, el.y + pts[0].y)

      if (pts.length === 1) {
        ctx.arc(el.x + pts[0].x, el.y + pts[0].y, el.strokeWidth / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (pts.length === 2) {
        ctx.lineTo(el.x + pts[1].x, el.y + pts[1].y)
      } else {
        // Curve smoothing
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = el.x + (pts[i].x + pts[i + 1].x) / 2
          const yc = el.y + (pts[i].y + pts[i + 1].y) / 2
          ctx.quadraticCurveTo(el.x + pts[i].x, el.y + pts[i].y, xc, yc)
        }
        ctx.lineTo(el.x + pts[pts.length - 1].x, el.y + pts[pts.length - 1].y)
      }
      ctx.stroke()
      break
    }

    case 'text': {
      const fontSize = el.fontSize || 20
      const fontFamily = el.fontFamily === 'mono' ? 'monospace' : el.fontFamily === 'handwriting' ? 'Caveat, cursive, sans-serif' : 'Inter, system-ui, sans-serif'
      ctx.font = `${fontSize}px ${fontFamily}`
      ctx.fillStyle = el.strokeColor || '#e4e4e7'
      ctx.textAlign = (el.textAlign || 'left') as CanvasTextAlign
      ctx.textBaseline = 'top'

      const lines = (el.text || '').split('\n')
      const lineHeight = fontSize * 1.3
      const textX = el.textAlign === 'center' ? el.x + el.width / 2 : el.textAlign === 'right' ? el.x + el.width : el.x

      lines.forEach((line, idx) => {
        ctx.fillText(line, textX, el.y + idx * lineHeight)
      })
      break
    }
  }

  ctx.restore()
}

// Background grid pattern renderer (Excalidraw dot grid)
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: DrawViewport
) {
  const gridSize = 24 * viewport.zoom
  const offsetX = (viewport.panX * viewport.zoom) % gridSize
  const offsetY = (viewport.panY * viewport.zoom) % gridSize

  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'

  const startX = offsetX < 0 ? offsetX + gridSize : offsetX
  const startY = offsetY < 0 ? offsetY + gridSize : offsetY

  const dotSize = Math.max(1, Math.min(2.5, 1.2 * viewport.zoom))

  for (let x = startX; x < width; x += gridSize) {
    for (let y = startY; y < height; y += gridSize) {
      ctx.beginPath()
      ctx.arc(x, y, dotSize, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}
