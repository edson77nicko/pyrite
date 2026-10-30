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

export function distToSegment(p: DrawPoint, v: DrawPoint, w: DrawPoint): number {
  const l2 = (w.x - v.x) * (w.x - v.x) + (w.y - v.y) * (w.y - v.y)
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y)
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)))
}

function simplifyPoints(points: DrawPoint[]): DrawPoint[] {
  if (points.length <= 2) return points

  const clean: DrawPoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = clean[clean.length - 1]
    const curr = points[i]
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) < 1) continue
    clean.push(curr)
  }

  if (clean.length <= 2) return clean

  const result: DrawPoint[] = [clean[0]]
  for (let i = 1; i < clean.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = clean[i]
    const next = clean[i + 1]

    const isHorizontal = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5
    const isVertical = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5

    if (!isHorizontal && !isVertical) {
      result.push(curr)
    }
  }
  result.push(clean[clean.length - 1])

  return result
}

export function getOrthogonalConnectorPoints(
  start: DrawPoint,
  startHandle: 'top' | 'right' | 'bottom' | 'left',
  end: DrawPoint,
  endHandle?: 'top' | 'right' | 'bottom' | 'left',
  fromBounds?: { x: number; y: number; width: number; height: number },
  toBounds?: { x: number; y: number; width: number; height: number }
): DrawPoint[] {
  const OFFSET = 24

  const DIR_VECTORS: Record<'top' | 'right' | 'bottom' | 'left', { x: number; y: number }> = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  }

  const sDir = DIR_VECTORS[startHandle]

  if (!endHandle) {
    const pStartStub = { x: start.x + sDir.x * OFFSET, y: start.y + sDir.y * OFFSET }
    if (startHandle === 'right' || startHandle === 'left') {
      return simplifyPoints([
        start,
        pStartStub,
        { x: pStartStub.x, y: end.y },
        end
      ])
    } else {
      return simplifyPoints([
        start,
        pStartStub,
        { x: end.x, y: pStartStub.y },
        end
      ])
    }
  }

  const eDir = DIR_VECTORS[endHandle]
  const pStartStub = { x: start.x + sDir.x * OFFSET, y: start.y + sDir.y * OFFSET }
  const pEndStub = { x: end.x + eDir.x * OFFSET, y: end.y + eDir.y * OFFSET }

  const fromLeft = fromBounds ? fromBounds.x : start.x
  const fromRight = fromBounds ? fromBounds.x + fromBounds.width : start.x
  const fromTop = fromBounds ? fromBounds.y : start.y
  const fromBottom = fromBounds ? fromBounds.y + fromBounds.height : start.y

  const toLeft = toBounds ? toBounds.x : end.x
  const toRight = toBounds ? toBounds.x + toBounds.width : end.x
  const toTop = toBounds ? toBounds.y : end.y
  const toBottom = toBounds ? toBounds.y + toBounds.height : end.y

  const isStartHorizontal = startHandle === 'right' || startHandle === 'left'
  const isEndVertical = endHandle === 'top' || endHandle === 'bottom'

  let points: DrawPoint[] = []

  // Case 1: Start Horizontal ('right'/'left') & End Vertical ('top'/'bottom')
  // (Exatamente como nas imagens de referência!)
  if (isStartHorizontal && isEndVertical) {
    let channelX: number
    if (startHandle === 'right') {
      if (toLeft > fromRight + OFFSET * 2) {
        channelX = (fromRight + toLeft) / 2
      } else {
        channelX = Math.max(fromRight, toRight) + OFFSET
      }
    } else {
      if (toRight < fromLeft - OFFSET * 2) {
        channelX = (fromLeft + toRight) / 2
      } else {
        channelX = Math.min(fromLeft, toLeft) - OFFSET
      }
    }

    let channelY = pEndStub.y
    if (endHandle === 'top') {
      if (end.y < fromTop) {
        channelY = Math.min(channelY, fromTop - OFFSET)
      }
    } else if (endHandle === 'bottom') {
      if (end.y > fromBottom) {
        channelY = Math.max(channelY, fromBottom + OFFSET)
      }
    }

    points = [
      start,
      { x: channelX, y: start.y },
      { x: channelX, y: channelY },
      { x: end.x, y: channelY },
      end
    ]
  }
  // Case 2: Start Vertical ('top'/'bottom') & End Horizontal ('left'/'right')
  else if (!isStartHorizontal && !isEndVertical) {
    let channelY: number
    if (startHandle === 'bottom') {
      if (toTop > fromBottom + OFFSET * 2) {
        channelY = (fromBottom + toTop) / 2
      } else {
        channelY = Math.max(fromBottom, toBottom) + OFFSET
      }
    } else {
      if (toBottom < fromTop - OFFSET * 2) {
        channelY = (fromTop + toBottom) / 2
      } else {
        channelY = Math.min(fromTop, toTop) - OFFSET
      }
    }

    let channelX = pEndStub.x
    if (endHandle === 'left') {
      if (end.x < fromLeft) {
        channelX = Math.min(channelX, fromLeft - OFFSET)
      }
    } else if (endHandle === 'right') {
      if (end.x > fromRight) {
        channelX = Math.max(channelX, fromRight + OFFSET)
      }
    }

    points = [
      start,
      { x: start.x, y: channelY },
      { x: channelX, y: channelY },
      { x: channelX, y: end.y },
      end
    ]
  }
  // Case 3: Both Horizontal ('right'/'left' to 'right'/'left')
  else if (isStartHorizontal && !isEndVertical) {
    if (startHandle === 'right' && endHandle === 'left' && toLeft >= fromRight) {
      const midX = (fromRight + toLeft) / 2
      points = [
        start,
        { x: midX, y: start.y },
        { x: midX, y: end.y },
        end
      ]
    } else if (startHandle === 'left' && endHandle === 'right' && toRight <= fromLeft) {
      const midX = (fromLeft + toRight) / 2
      points = [
        start,
        { x: midX, y: start.y },
        { x: midX, y: end.y },
        end
      ]
    } else {
      const detourY = Math.abs(start.y - (Math.min(fromTop, toTop) - OFFSET)) <
        Math.abs(Math.max(fromBottom, toBottom) + OFFSET - start.y)
        ? Math.min(fromTop, toTop) - OFFSET
        : Math.max(fromBottom, toBottom) + OFFSET

      points = [
        start,
        pStartStub,
        { x: pStartStub.x, y: detourY },
        { x: pEndStub.x, y: detourY },
        pEndStub,
        end
      ]
    }
  }
  // Case 4: Both Vertical ('top'/'bottom' to 'top'/'bottom')
  else {
    if (startHandle === 'bottom' && endHandle === 'top' && toTop >= fromBottom) {
      const midY = (fromBottom + toTop) / 2
      points = [
        start,
        { x: start.x, y: midY },
        { x: end.x, y: midY },
        end
      ]
    } else if (startHandle === 'top' && endHandle === 'bottom' && toBottom <= fromTop) {
      const midY = (fromTop + toBottom) / 2
      points = [
        start,
        { x: start.x, y: midY },
        { x: end.x, y: midY },
        end
      ]
    } else {
      const detourX = Math.abs(start.x - (Math.min(fromLeft, toLeft) - OFFSET)) <
        Math.abs(Math.max(fromRight, toRight) + OFFSET - start.x)
        ? Math.min(fromLeft, toLeft) - OFFSET
        : Math.max(fromRight, toRight) + OFFSET

      points = [
        start,
        pStartStub,
        { x: detourX, y: pStartStub.y },
        { x: detourX, y: pEndStub.y },
        pEndStub,
        end
      ]
    }
  }

  return simplifyPoints(points)
}

export function drawRoundedOrthogonalPath(
  ctx: CanvasRenderingContext2D,
  points: DrawPoint[],
  radius: number = 16
) {
  if (points.length < 2) return
  if (points.length === 2) {
    ctx.moveTo(points[0].x, points[0].y)
    ctx.lineTo(points[1].x, points[1].y)
    return
  }

  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y)
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y)
    const r = Math.min(radius, d1 / 2, d2 / 2)

    ctx.arcTo(curr.x, curr.y, next.x, next.y, r)
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
}

export function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  points: DrawPoint[],
  strokeWidth: number = 2
) {
  if (points.length < 2) return
  const end = points[points.length - 1]
  const prev = points[points.length - 2]

  const angle = Math.atan2(end.y - prev.y, end.x - prev.x)
  const headLength = Math.max(12, strokeWidth * 4.5)
  const headAngle = Math.PI / 4.8 // Abertura em V elegante e limpa

  ctx.beginPath()
  ctx.moveTo(
    end.x - headLength * Math.cos(angle - headAngle),
    end.y - headLength * Math.sin(angle - headAngle)
  )
  ctx.lineTo(end.x, end.y)
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + headAngle),
    end.y - headLength * Math.sin(angle + headAngle)
  )
  ctx.stroke()
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

  // Orthogonal connectors: calculate bounds covering all orthogonal path points
  if ((el.type === 'line' || el.type === 'arrow') && (el.connectorStyle === 'orthogonal' || (el.connectorStyle !== 'straight' && !!el.startBinding))) {
    const startHandle = el.startBinding?.handle || (Math.abs(el.width) >= Math.abs(el.height) ? (el.width >= 0 ? 'right' : 'left') : (el.height >= 0 ? 'bottom' : 'top'))
    const points = getOrthogonalConnectorPoints(
      { x: el.x, y: el.y },
      startHandle,
      { x: el.x + el.width, y: el.y + el.height },
      el.endBinding?.handle
    )
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const pad = Math.max(12, (el.strokeWidth || 2) * 2)
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(20, maxX - minX + pad * 2),
      height: Math.max(20, maxY - minY + pad * 2)
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
    // Orthogonal connector hit test against all path segments
    if (el.connectorStyle === 'orthogonal' || (el.connectorStyle !== 'straight' && !!el.startBinding)) {
      const startHandle = el.startBinding?.handle || (Math.abs(el.width) >= Math.abs(el.height) ? (el.width >= 0 ? 'right' : 'left') : (el.height >= 0 ? 'bottom' : 'top'))
      const points = getOrthogonalConnectorPoints(
        { x: el.x, y: el.y },
        startHandle,
        { x: el.x + el.width, y: el.y + el.height },
        el.endBinding?.handle
      )
      for (let i = 0; i < points.length - 1; i++) {
        if (distToSegment(point, points[i], points[i + 1]) <= margin) return true
      }
      return false
    }

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
export function renderElementToCanvas(
  ctx: CanvasRenderingContext2D,
  el: DrawElement,
  isSelected: boolean = false,
  allElements?: DrawElement[]
) {
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

    case 'line':
    case 'arrow': {
      const isOrthogonal = el.connectorStyle === 'orthogonal' || (el.connectorStyle !== 'straight' && !!el.startBinding)
      const fromX = el.x
      const fromY = el.y
      const toX = el.x + el.width
      const toY = el.y + el.height

      if (isOrthogonal) {
        const startHandle = el.startBinding?.handle || (Math.abs(toX - fromX) >= Math.abs(toY - fromY) ? (toX >= fromX ? 'right' : 'left') : (toY >= fromY ? 'bottom' : 'top'))
        const fromEl = el.startBinding ? allElements?.find(e => e.id === el.startBinding!.elementId) : undefined
        const toEl = el.endBinding ? allElements?.find(e => e.id === el.endBinding!.elementId) : undefined
        const fromBounds = fromEl ? getElementBounds(fromEl) : undefined
        const toBounds = toEl ? getElementBounds(toEl) : undefined

        const points = getOrthogonalConnectorPoints(
          { x: fromX, y: fromY },
          startHandle,
          { x: toX, y: toY },
          el.endBinding?.handle,
          fromBounds,
          toBounds
        )

        ctx.beginPath()
        drawRoundedOrthogonalPath(ctx, points, 16)
        ctx.stroke()

        if (el.type === 'arrow') {
          drawArrowhead(ctx, points, el.strokeWidth || 2)
        }
      } else {
        // Straight line / arrow
        ctx.beginPath()
        ctx.moveTo(fromX, fromY)
        ctx.lineTo(toX, toY)
        ctx.stroke()

        if (el.type === 'arrow') {
          const angle = Math.atan2(toY - fromY, toX - fromX)
          const headLength = Math.max(12, (el.strokeWidth || 2) * 4.5)
          const headAngle = Math.PI / 4.8

          ctx.beginPath()
          ctx.moveTo(
            toX - headLength * Math.cos(angle - headAngle),
            toY - headLength * Math.sin(angle - headAngle)
          )
          ctx.lineTo(toX, toY)
          ctx.lineTo(
            toX - headLength * Math.cos(angle + headAngle),
            toY - headLength * Math.sin(angle + headAngle)
          )
          ctx.stroke()
        }
      }
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
      const radius = 16
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.fillStyle = '#15151a'
      ctx.fill()

      // Outer border
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Header top pill
      ctx.fillStyle = '#1a1a22'
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, 44, [16, 16, 0, 0])
      ctx.fill()

      ctx.font = '600 12px Inter, system-ui, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('📅 ' + (el.viewMode === 'list' ? 'Lista' : el.viewMode === 'kanban' ? 'Quadro' : 'Calendário'), normX + 16, normY + 22)

      // Content area
      const gridTop = normY + 48
      const gridW = normW - 24
      const gridH = Math.max(60, normH - 60)
      ctx.fillStyle = '#121216'
      ctx.beginPath()
      ctx.roundRect(normX + 12, gridTop, gridW, gridH, 8)
      ctx.fill()
      break
    }

    case 'note-card': {
      // Clean document card preview for canvas / PNG exports
      const radius = 16
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.fillStyle = el.backgroundColor || '#16161a'
      ctx.fill()

      // Outer border
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.strokeStyle = el.strokeColor || 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Header Bar
      ctx.fillStyle = '#1a1a22'
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, 44, [16, 16, 0, 0])
      ctx.fill()

      ctx.font = '600 12px Inter, system-ui, sans-serif'
      ctx.fillStyle = '#f4f4f5'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const titleText = '📄 ' + (el.noteTitle || 'Nota Importada')
      ctx.fillText(titleText, normX + 16, normY + 22, Math.min(260, normW - 32))

      // Content preview
      const contentTop = normY + 54
      const contentH = normH - 74
      if (contentH > 20) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(normX + 16, contentTop, normW - 32, contentH)
        ctx.clip()

        ctx.font = '12px Inter, system-ui, sans-serif'
        ctx.fillStyle = '#d4d4d8'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'

        const lines = (el.noteContent || '').split('\n').slice(0, 30)
        lines.forEach((l, idx) => {
          ctx.fillText(l, normX + 16, contentTop + idx * 18, normW - 32)
        })
        ctx.restore()
      }
      break
    }

    case 'table': {
      const rows = Math.max(1, el.rows || 3)
      const cols = Math.max(1, el.cols || 4)
      const radius = 12

      // Table background
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 4

      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.fillStyle = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : '#18181b'
      ctx.fill()
      ctx.restore()

      // Calculate col widths & row heights
      const colW = normW / cols
      const rowH = normH / rows

      // Clip inside table to avoid grid lines overflowing rounded corners
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.clip()

      // Render individual cell background colors if defined
      const cellStyles = el.cellStyles || {}
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r}_${c}`
          const st = cellStyles[key]
          if (st?.backgroundColor && st.backgroundColor !== 'transparent') {
            ctx.fillStyle = st.backgroundColor
            ctx.fillRect(normX + c * colW, normY + r * rowH, colW, rowH)
          }
        }
      }

      // Grid lines
      ctx.beginPath()
      ctx.strokeStyle = el.strokeColor ? el.strokeColor + '55' : 'rgba(255, 255, 255, 0.14)'
      ctx.lineWidth = 1

      // Vertical lines
      for (let c = 1; c < cols; c++) {
        const lx = normX + c * colW
        ctx.moveTo(lx, normY)
        ctx.lineTo(lx, normY + normH)
      }

      // Horizontal lines
      for (let r = 1; r < rows; r++) {
        const ly = normY + r * rowH
        ctx.moveTo(normX, ly)
        ctx.lineTo(normX + normW, ly)
      }
      ctx.stroke()

      // Render cell text contents
      const cells = el.cells || {}
      const defaultFontSize = el.fontSize || 14
      const defaultFontFamily = el.fontFamily === 'mono' ? 'monospace' : el.fontFamily === 'handwriting' ? 'Caveat, cursive, sans-serif' : 'Inter, system-ui, sans-serif'
      const padding = 12

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r}_${c}`
          const rawText = cells[key]
          if (rawText) {
            const st = cellStyles[key]
            const cellFontSize = st?.fontSize || defaultFontSize
            const cellFontFam = st?.fontFamily === 'mono' ? 'monospace' : st?.fontFamily === 'handwriting' ? 'Caveat, cursive, sans-serif' : defaultFontFamily
            const isBold = st?.isBold !== undefined ? st.isBold : el.isBold
            const isStrike = st?.isStrikethrough !== undefined ? st.isStrikethrough : el.isStrikethrough
            const isList = st?.isList !== undefined ? st.isList : el.isList
            const textAlign = (st?.textAlign || el.textAlign || 'left') as CanvasTextAlign
            const textColor = st?.textColor || el.strokeColor || '#f4f4f5'

            ctx.font = `${isBold ? 'bold' : 'normal'} ${cellFontSize}px ${cellFontFam}`
            ctx.fillStyle = textColor
            ctx.textAlign = textAlign
            ctx.textBaseline = 'middle'

            const cellX = normX + c * colW
            const cellY = normY + r * rowH
            const maxW = colW - padding * 2

            const lines = rawText.split('\n')
            const lineHeight = cellFontSize * 1.3
            const totalH = lines.length * lineHeight
            const startY = cellY + rowH / 2 - totalH / 2 + lineHeight / 2

            let tx = cellX + padding
            if (textAlign === 'center') tx = cellX + colW / 2
            else if (textAlign === 'right') tx = cellX + colW - padding

            lines.forEach((l, idx) => {
              const displayLine = isList ? `• ${l}` : l
              ctx.fillText(displayLine, tx, startY + idx * lineHeight, maxW)

              if (isStrike && displayLine) {
                const metrics = ctx.measureText(displayLine)
                const textWidth = Math.min(metrics.width, maxW)
                let strikeStartX = tx
                if (textAlign === 'center') strikeStartX = tx - textWidth / 2
                else if (textAlign === 'right') strikeStartX = tx - textWidth
                const strikeY = startY + idx * lineHeight
                ctx.beginPath()
                ctx.moveTo(strikeStartX, strikeY)
                ctx.lineTo(strikeStartX + textWidth, strikeY)
                ctx.lineWidth = 1.2
                ctx.strokeStyle = textColor
                ctx.stroke()
              }
            })
          }
        }
      }

      ctx.restore()

      // Table outer border
      ctx.beginPath()
      ctx.roundRect(normX, normY, normW, normH, radius)
      ctx.strokeStyle = el.strokeColor || 'rgba(255, 255, 255, 0.16)'
      ctx.lineWidth = el.strokeWidth || 1.5
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
