import type { DrawDocument, DrawElement, DrawPoint, DrawViewport } from '../types/draw'

export function isDrawContent(content?: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  return (
    trimmed.startsWith('{"type":"pyrite-draw"') ||
    trimmed.startsWith('{\n  "type": "pyrite-draw"') ||
    trimmed.includes('"type": "pyrite-draw"') ||
    trimmed.includes('"type":"pyrite-draw"') ||
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
    type: 'pyrite-draw',
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
    if (parsed && (parsed.type === 'pyrite-draw' || parsed.type === 'pyrita-draw') && Array.isArray(parsed.elements)) {
      return {
        type: 'pyrite-draw',
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
export function wrapTextLines(text: string, maxWidth: number, fontSize: number = 18, isBold: boolean = false): string[] {
  if (!text) return ['']
  const charWidth = fontSize * (isBold ? 0.62 : 0.54)
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / charWidth))

  const result: string[] = []
  const paragraphs = text.split('\n')

  for (const para of paragraphs) {
    if (para.length === 0) {
      result.push('')
      continue
    }

    const words = para.split(' ')
    let currentLine = ''

    for (const word of words) {
      if (!currentLine) {
        currentLine = word
      } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
        currentLine += ' ' + word
      } else {
        result.push(currentLine)
        currentLine = word
      }
    }
    if (currentLine) {
      result.push(currentLine)
    }
  }

  return result.length > 0 ? result : ['']
}

export function getElementAnchorPoint(
  el: DrawElement,
  handle: 'top' | 'right' | 'bottom' | 'left'
): DrawPoint {
  const bounds = getElementBounds(el)
  switch (handle) {
    case 'top':
      return { x: bounds.x + bounds.width / 2, y: bounds.y }
    case 'right':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }
    case 'bottom':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }
    case 'left':
      return { x: bounds.x, y: bounds.y + bounds.height / 2 }
  }
}

export function findClosestAnchor(
  targetEl: DrawElement,
  point: DrawPoint
): { handle: 'top' | 'right' | 'bottom' | 'left'; point: DrawPoint } {
  const handles: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left']
  let bestHandle: 'top' | 'right' | 'bottom' | 'left' = 'top'
  let bestPoint = getElementAnchorPoint(targetEl, 'top')
  let bestDist = Math.hypot(point.x - bestPoint.x, point.y - bestPoint.y)

  for (const h of handles) {
    const pt = getElementAnchorPoint(targetEl, h)
    const d = Math.hypot(point.x - pt.x, point.y - pt.y)
    if (d < bestDist) {
      bestDist = d
      bestHandle = h
      bestPoint = pt
    }
  }

  return { handle: bestHandle, point: bestPoint }
}

export function updateConnectedLines(
  elements: DrawElement[],
  movedElementIds: string[]
): DrawElement[] {
  if (movedElementIds.length === 0) return elements
  const movedSet = new Set(movedElementIds)
  const elementMap = new Map(elements.map(el => [el.id, el]))

  let hasChanged = false

  const updated = elements.map(el => {
    if (el.type !== 'line' && el.type !== 'arrow') return el

    const startBound = el.startBinding && movedSet.has(el.startBinding.elementId)
    const endBound = el.endBinding && movedSet.has(el.endBinding.elementId)

    if (!startBound && !endBound) return el

    let newStartX = el.x
    let newStartY = el.y
    let newEndX = el.x + el.width
    let newEndY = el.y + el.height

    if (el.startBinding) {
      const fromEl = elementMap.get(el.startBinding.elementId)
      if (fromEl) {
        const pt = getElementAnchorPoint(fromEl, el.startBinding.handle)
        newStartX = pt.x
        newStartY = pt.y
      }
    }

    if (el.endBinding) {
      const toEl = elementMap.get(el.endBinding.elementId)
      if (toEl) {
        const pt = getElementAnchorPoint(toEl, el.endBinding.handle)
        newEndX = pt.x
        newEndY = pt.y
      }
    }

    const newWidth = newEndX - newStartX
    const newHeight = newEndY - newStartY

    if (
      newStartX !== el.x ||
      newStartY !== el.y ||
      newWidth !== el.width ||
      newHeight !== el.height
    ) {
      hasChanged = true
      return {
        ...el,
        x: newStartX,
        y: newStartY,
        width: newWidth,
        height: newHeight
      }
    }

    return el
  })

  return hasChanged ? updated : elements
}

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

  if (el.type === 'text') {
    const fontSize = el.fontSize || 18
    const lineHeight = fontSize * 1.25
    const width = Math.max(40, Math.abs(el.width))
    const lines = wrapTextLines(el.text || '', width, fontSize, !!el.isBold)
    const realHeight = Math.max(fontSize * 1.25, lines.length * lineHeight)
    return {
      x: el.width < 0 ? el.x + el.width : el.x,
      y: el.height < 0 ? el.y + el.height : el.y,
      width,
      height: realHeight
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
export function renderElementToCanvas(ctx: CanvasRenderingContext2D, el: DrawElement, isSelected: boolean = false) {
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
      const radius = Math.min(8, normW / 6, normH / 6)
      ctx.beginPath()
      if (radius > 2) {
        ctx.roundRect(normX, normY, normW, normH, radius)
      } else {
        ctx.rect(normX, normY, normW, normH)
      }

      if (hasFill) ctx.fill()
      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'roundedRect': {
      const radius = Math.min(24, normW / 3, normH / 3)
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      if (hasFill) ctx.fill()
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

      if (hasFill) ctx.fill()
      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'triangle': {
      const midX = normX + normW / 2
      ctx.beginPath()
      ctx.moveTo(midX, normY)
      ctx.lineTo(normX + normW, normY + normH)
      ctx.lineTo(normX, normY + normH)
      ctx.closePath()

      if (hasFill) ctx.fill()
      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'triangleDown': {
      const midX = normX + normW / 2
      ctx.beginPath()
      ctx.moveTo(normX, normY)
      ctx.lineTo(normX + normW, normY)
      ctx.lineTo(midX, normY + normH)
      ctx.closePath()

      if (hasFill) ctx.fill()
      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'parallelogram': {
      const skew = Math.min(24, normW * 0.2)
      ctx.beginPath()
      ctx.moveTo(normX + skew, normY)
      ctx.lineTo(normX + normW, normY)
      ctx.lineTo(normX + normW - skew, normY + normH)
      ctx.lineTo(normX, normY + normH)
      ctx.closePath()

      if (hasFill) ctx.fill()
      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()
      break
    }

    case 'cylinder': {
      const ry = Math.min(16, normH * 0.15)
      const cx = normX + normW / 2

      ctx.beginPath()
      // Top ellipse
      ctx.ellipse(cx, normY + ry, normW / 2, ry, 0, 0, Math.PI * 2)
      if (hasFill) ctx.fill()
      if (isSemi) ctx.globalAlpha = 1.0
      ctx.stroke()

      // Body
      ctx.beginPath()
      ctx.moveTo(normX, normY + ry)
      ctx.lineTo(normX, normY + normH - ry)
      ctx.ellipse(cx, normY + normH - ry, normW / 2, ry, 0, 0, Math.PI, false)
      ctx.lineTo(normX + normW, normY + ry)
      if (hasFill) ctx.fill()
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

      if (hasFill) ctx.fill()
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

    case 'sticky': {
      // FigJam-like Sticky Note / Post-it
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
      ctx.shadowOffsetX = 0

      const radius = 6
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.fillStyle = el.backgroundColor || '#ffd8a8'
      ctx.fill()
      ctx.restore()

      // Subtle contrast border
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Render text inside sticky note
      const padding = 16
      const innerW = Math.max(20, normW - padding * 2)
      const fontSize = el.fontSize || 16
      const fontFamily = el.fontFamily === 'mono' ? 'monospace' : el.fontFamily === 'handwriting' ? 'Caveat, cursive, sans-serif' : 'Inter, system-ui, sans-serif'
      const fontWeight = el.isBold ? 'bold' : 'normal'
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
      ctx.fillStyle = '#18181b'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      const rawLines = (el.text || '').split('\n')
      const lineHeight = fontSize * 1.3
      let currentY = normY + padding

      if (!el.text && isSelected) {
        ctx.fillStyle = 'rgba(24, 24, 27, 0.35)'
        ctx.fillText('Nota adesiva...', normX + padding, normY + padding)
      } else {
        for (const rawLine of rawLines) {
          const wrapped = wrapTextLines(rawLine, el.isList ? innerW - 14 : innerW, fontSize, !!el.isBold)
          wrapped.forEach((line, lineIdx) => {
            if (currentY + lineHeight > normY + normH - padding + 4) return

            if (el.isList && lineIdx === 0 && rawLine.trim().length > 0) {
              ctx.beginPath()
              ctx.arc(normX + padding + 4, currentY + fontSize * 0.45, 2.5, 0, Math.PI * 2)
              ctx.fill()
            }

            const textX = el.isList ? normX + padding + 14 : normX + padding
            ctx.fillText(line, textX, currentY)

            if (el.isStrikethrough && line) {
              const textMetrics = ctx.measureText(line)
              const strikeY = currentY + fontSize * 0.5
              ctx.beginPath()
              ctx.moveTo(textX, strikeY)
              ctx.lineTo(textX + textMetrics.width, strikeY)
              ctx.lineWidth = 1.5
              ctx.strokeStyle = '#18181b'
              ctx.stroke()
            }

            currentY += lineHeight
          })
        }
      }
      break
    }

    case 'data-task': {
      // Data Task Frame (Calendar / Kanban / List representation)
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
      ctx.shadowBlur = 16
      ctx.shadowOffsetY = 6

      const radius = 12
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.fillStyle = '#141418'
      ctx.fill()
      ctx.restore()

      // Outer border
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Header top pill
      ctx.fillStyle = '#222228'
      ctx.beginPath()
      ctx.roundRect(normX + 16, normY + 16, 110, 26, 6)
      ctx.fill()

      ctx.font = '600 12px Inter, system-ui, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('📅 ' + (el.viewMode === 'list' ? 'Lista' : el.viewMode === 'kanban' ? 'Quadro' : 'Calendário'), normX + 16 + 55, normY + 16 + 13)

      // Title & Subtitle
      ctx.font = 'bold 16px Inter, system-ui, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(el.text || 'Tarefas do Projeto', normX + 16, normY + 68)

      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.fillStyle = '#8e8e93'
      ctx.fillText('Banco de dados de tarefas e acompanhamento de prazos', normX + 16, normY + 88)

      // Content area
      const gridTop = normY + 104
      const gridW = normW - 32
      const gridH = Math.max(60, normH - 120)
      ctx.fillStyle = '#1e1e24'
      ctx.beginPath()
      ctx.roundRect(normX + 16, gridTop, gridW, gridH, 8)
      ctx.fill()
      ctx.strokeStyle = '#2e2e38'
      ctx.lineWidth = 1
      ctx.stroke()
      break
    }

    case 'text': {
      const fontSize = el.fontSize || 18
      const fontFamily = el.fontFamily === 'mono' ? 'monospace' : el.fontFamily === 'handwriting' ? 'Caveat, cursive, sans-serif' : 'Inter, system-ui, sans-serif'
      const fontWeight = el.isBold ? 'bold' : 'normal'
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
      ctx.fillStyle = el.strokeColor || '#e4e4e7'
      ctx.textAlign = (el.textAlign || 'left') as CanvasTextAlign
      ctx.textBaseline = 'top'

      const lines = wrapTextLines(el.text || '', normW, fontSize, !!el.isBold)
      const lineHeight = fontSize * 1.25

      lines.forEach((line, idx) => {
        let textX = normX
        if (el.textAlign === 'center') textX = normX + normW / 2
        else if (el.textAlign === 'right') textX = normX + normW

        ctx.fillText(line, textX, normY + idx * lineHeight)

        if (el.isStrikethrough && line) {
          const textMetrics = ctx.measureText(line)
          let lineStartX = textX
          if (el.textAlign === 'center') lineStartX = textX - textMetrics.width / 2
          else if (el.textAlign === 'right') lineStartX = textX - textMetrics.width
          const strikeY = normY + idx * lineHeight + fontSize * 0.5
          ctx.beginPath()
          ctx.moveTo(lineStartX, strikeY)
          ctx.lineTo(lineStartX + textMetrics.width, strikeY)
          ctx.lineWidth = 1.5
          ctx.strokeStyle = el.strokeColor || '#e4e4e7'
          ctx.stroke()
        }
      })
      break
    }
  }

  // Render centered text inside closed shapes (rectangle, ellipse, diamond, etc.)
  const isClosedShape = ['rectangle', 'roundedRect', 'diamond', 'ellipse', 'triangle', 'triangleDown', 'parallelogram', 'cylinder'].includes(el.type)
  if (isClosedShape) {
    const hasText = el.text && el.text.trim().length > 0
    if (hasText) {
      const fontSize = el.fontSize || 16
      const fontFamily = el.fontFamily === 'mono' ? 'monospace' : el.fontFamily === 'handwriting' ? 'Caveat, cursive, sans-serif' : 'Inter, system-ui, sans-serif'
      ctx.font = `${fontSize}px ${fontFamily}`
      ctx.fillStyle = el.strokeColor || '#f4f4f5'
      ctx.textAlign = (el.textAlign || 'center') as CanvasTextAlign
      ctx.textBaseline = 'middle'

      const lines = (el.text || '').split('\n')
      const lineHeight = fontSize * 1.25
      const totalH = lines.length * lineHeight
      const startY = normY + normH / 2 - totalH / 2 + lineHeight / 2

      const textX = el.textAlign === 'left' ? normX + 16 : el.textAlign === 'right' ? normX + normW - 16 : normX + normW / 2

      lines.forEach((line, idx) => {
        ctx.fillText(line, textX, startY + idx * lineHeight)
      })
    } else if (isSelected) {
      // FigJam-like placeholder: "Adicionar texto"
      const fontSize = 14
      ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`
      ctx.fillStyle = '#71717a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Adicionar texto', normX + normW / 2, normY + normH / 2)
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
