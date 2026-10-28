import type {
  ComputedBoundary,
  ComputedEdge,
  ComputedLayout,
  ComputedNode,
  MindMapDocument,
  MindMapLineStyle,
  MindMapNode,
  MindMapPaletteId,
  MindMapStylePreset,
  MindMapThemeId
} from '../types/mindmap'

export interface ThemeConfig {
  id: MindMapThemeId
  name: string
  bg: string
  rootBg: string
  rootBorder: string
  rootText: string
  branchColors: string[]
  subtopicBg: string
  subtopicBorder: string
  subtopicText: string
  lineStyle: MindMapLineStyle
}

export const MINDMAP_PALETTES: Record<MindMapPaletteId, { name: string; colors: string[] }> = {
  rainbow: {
    name: 'Vibrante Orgânico',
    colors: ['#2563eb', '#ea580c', '#10b981', '#9333ea', '#db2777', '#06b6d4', '#eab308']
  },
  gold: {
    name: 'Pyrite Âmbar Gold',
    colors: ['#c59b27', '#eab308', '#f59e0b', '#d97706', '#ca8a04', '#b45309']
  },
  ocean: {
    name: 'Oceano & Ciano',
    colors: ['#0284c7', '#06b6d4', '#0d9488', '#3b82f6', '#6366f1', '#0ea5e9']
  },
  emerald: {
    name: 'Floresta & Esmeralda',
    colors: ['#059669', '#10b981', '#14b8a6', '#84cc16', '#22c55e', '#16a34a']
  },
  sunset: {
    name: 'Pôr do Sol',
    colors: ['#f97316', '#fb7185', '#ec4899', '#f43f5e', '#e11d48', '#fb923c']
  },
  monochrome: {
    name: 'Monocromático',
    colors: ['#e4e4e7', '#cbd5e1', '#94a3b8', '#64748b', '#71717a', '#a1a1aa']
  }
}

export const MINDMAP_THEMES: Record<string, ThemeConfig> = {
  'pyrite-classic': {
    id: 'pyrite-classic',
    name: 'Pyrite Clássico',
    bg: '#0f172a',
    rootBg: '#2563eb',
    rootBorder: '#3b82f6',
    rootText: '#ffffff',
    branchColors: MINDMAP_PALETTES.rainbow.colors,
    subtopicBg: '#1e293b',
    subtopicBorder: '#334155',
    subtopicText: '#f1f5f9',
    lineStyle: 'curved'
  },
  'pyrite-gold': {
    id: 'pyrite-gold',
    name: 'Pyrite Ouro',
    bg: '#09090b',
    rootBg: '#c59b27',
    rootBorder: '#eab308',
    rootText: '#000000',
    branchColors: MINDMAP_PALETTES.gold.colors,
    subtopicBg: '#18181b',
    subtopicBorder: '#27272a',
    subtopicText: '#fafafa',
    lineStyle: 'curved'
  },
  'pyrita-classic': {
    id: 'pyrite-classic',
    name: 'Pyrite Clássico',
    bg: '#0f172a',
    rootBg: '#2563eb',
    rootBorder: '#3b82f6',
    rootText: '#ffffff',
    branchColors: MINDMAP_PALETTES.rainbow.colors,
    subtopicBg: '#1e293b',
    subtopicBorder: '#334155',
    subtopicText: '#f1f5f9',
    lineStyle: 'curved'
  },
  'pyrita-gold': {
    id: 'pyrite-gold',
    name: 'Pyrite Ouro',
    bg: '#09090b',
    rootBg: '#c59b27',
    rootBorder: '#eab308',
    rootText: '#000000',
    branchColors: MINDMAP_PALETTES.gold.colors,
    subtopicBg: '#18181b',
    subtopicBorder: '#27272a',
    subtopicText: '#fafafa',
    lineStyle: 'curved'
  },
  'synthwave-neon': {
    id: 'synthwave-neon',
    name: 'Synthwave Neon',
    bg: '#090514',
    rootBg: '#9333ea',
    rootBorder: '#c084fc',
    rootText: '#ffffff',
    branchColors: ['#ec4899', '#06b6d4', '#a855f7', '#3b82f6', '#10b981', '#f43f5e'],
    subtopicBg: '#130d24',
    subtopicBorder: '#2e1d4d',
    subtopicText: '#f5f3ff',
    lineStyle: 'curved'
  },
  'cyber-emerald': {
    id: 'cyber-emerald',
    name: 'Cyber Esmeralda',
    bg: '#021e17',
    rootBg: '#059669',
    rootBorder: '#34d399',
    rootText: '#ffffff',
    branchColors: MINDMAP_PALETTES.emerald.colors,
    subtopicBg: '#064e3b',
    subtopicBorder: '#0f766e',
    subtopicText: '#ecfdf5',
    lineStyle: 'curved'
  },
  'pastel-dream': {
    id: 'pastel-dream',
    name: 'Pastel Elegance',
    bg: '#18151f',
    rootBg: '#e0a96d',
    rootBorder: '#f3c68f',
    rootText: '#201a15',
    branchColors: ['#f472b6', '#38bdf8', '#fbbf24', '#a78bfa', '#4ade80', '#fb923c'],
    subtopicBg: '#272332',
    subtopicBorder: '#3c354d',
    subtopicText: '#f8fafc',
    lineStyle: 'curved'
  },
  'monochrome': {
    id: 'monochrome',
    name: 'Monocromático',
    bg: '#09090b',
    rootBg: '#ffffff',
    rootBorder: '#e4e4e7',
    rootText: '#09090b',
    branchColors: MINDMAP_PALETTES.monochrome.colors,
    subtopicBg: '#18181b',
    subtopicBorder: '#27272a',
    subtopicText: '#f4f4f5',
    lineStyle: 'curved'
  }
}

export function isMindMapContent(content?: string): boolean {
  if (!content) return false
  const trimmed = content.trim()
  return (
    trimmed.startsWith('{"type":"pyrite-mindmap"') ||
    trimmed.startsWith('{\n  "type": "pyrite-mindmap"') ||
    trimmed.includes('"type": "pyrite-mindmap"') ||
    trimmed.includes('"type":"pyrite-mindmap"') ||
    trimmed.startsWith('{"type":"pyrita-mindmap"') ||
    trimmed.startsWith('{\n  "type": "pyrita-mindmap"') ||
    trimmed.includes('"type": "pyrita-mindmap"') ||
    trimmed.includes('"type":"pyrita-mindmap"')
  )
}

export function createEmptyMindMapDocument(initialTitle?: string): MindMapDocument {
  const rootId = 'node_root_' + crypto.randomUUID().slice(0, 8)
  const child1Id = 'node_' + crypto.randomUUID().slice(0, 8)
  const child2Id = 'node_' + crypto.randomUUID().slice(0, 8)
  const child3Id = 'node_' + crypto.randomUUID().slice(0, 8)

  const nodes: Record<string, MindMapNode> = {
    [rootId]: {
      id: rootId,
      parentId: null,
      children: [child1Id, child2Id, child3Id],
      title: initialTitle || 'Meu Mapa Mental',
      shape: 'rounded',
      fontSize: 18,
      fontWeight: 'bold'
    },
    [child1Id]: {
      id: child1Id,
      parentId: rootId,
      children: [],
      title: 'Ideias & Objetivos',
      shape: 'rounded',
      side: 'right',
      icons: ['star']
    },
    [child2Id]: {
      id: child2Id,
      parentId: rootId,
      children: [],
      title: 'Planejamento & Estratégia',
      shape: 'rounded',
      side: 'left',
      icons: ['bulb']
    },
    [child3Id]: {
      id: child3Id,
      parentId: rootId,
      children: [],
      title: 'Ações & Execução',
      shape: 'rounded',
      side: 'right',
      icons: ['check']
    }
  }

  return {
    type: 'pyrite-mindmap',
    version: 1,
    rootId,
    nodes,
    relations: [],
    boundaries: [],
    theme: 'pyrite-classic',
    layout: 'radial',
    canvasBg: '#0f172a',
    lineStyle: 'tapered',
    mapStyle: 'organic-branch',
    paletteId: 'rainbow',
    viewport: {
      panX: 0,
      panY: 0,
      zoom: 1
    }
  }
}

/**
 * Strips markdown bold/italic asterisks, underscores, and bullet artifacts from node titles,
 * ensuring clean, readable titles in visual mindmap nodes without stray asterisks.
 */
export function cleanNodeTitle(rawTitle: string): string {
  if (!rawTitle) return ''
  let title = rawTitle.trim()

  // 1. Remove wrapping bold/italic markdown: **Title** or ***Title*** or *Title* or __Title__
  title = title.replace(/^(\*{1,3}|_{1,3})(.+?)\1$/, '$2').trim()

  // 2. Remove inline bold/italic wrappers at start/middle, e.g. **Etapa 1:** Detalhe -> Etapa 1: Detalhe
  title = title.replace(/\*{2,3}([^*]+)\*{2,3}/g, '$1')
  title = title.replace(/_{2,3}([^_]+)_{2,3}/g, '$1')
  title = title.replace(/(^|\s)\*([^*]+)\*(\s|$)/g, '$1$2$3')

  // 3. Remove leading bullets, colons or dashes left over, e.g. "- Title"
  title = title.replace(/^[\s*_:\u2013\u2014-]+/, '')

  // 4. Remove leading hashes, e.g. "### Title" -> "Title"
  title = title.replace(/^#{1,6}\s*/, '')

  // 5. Final cleanup of trailing and leading leftovers
  title = title.replace(/^[\s*_:\u2013\u2014-]+/, '')
  title = title.replace(/[\s*_-]+$/, '')

  return title.trim()
}

/**
 * Converts a structured Markdown outline into a full interactive MindMapDocument.
 * Handles headings (#, ##, ###), bullet lists (- , * , 1. ), multi-asterisk levels (*, **, ***),
 * task checkboxes ([ ] / [x]), and indented subtopics, distributing Level 1 children symmetrically.
 */
export function parseMarkdownToMindMap(content: string, fallbackTitle?: string, baseDoc?: MindMapDocument): MindMapDocument {
  const rootId = 'node_root_' + Math.random().toString(36).substring(2, 9)
  const nodes: Record<string, MindMapNode> = {}

  const rawLines = content
    .split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.trim().length > 0)

  let rootTitle = fallbackTitle || 'Meu Mapa Mental'
  let linesToProcess = rawLines

  // If first non-empty line is H1 (e.g. # Title), treat as root title
  const h1Match = rawLines[0]?.match(/^#\s+(.+)$/)
  if (h1Match) {
    rootTitle = cleanNodeTitle(h1Match[1])
    linesToProcess = rawLines.slice(1)
  }

  nodes[rootId] = {
    id: rootId,
    parentId: null,
    children: [],
    title: rootTitle || 'Meu Mapa Mental',
    shape: 'rounded',
    fontSize: 18,
    fontWeight: 'bold'
  }

  const stack: { level: number; id: string }[] = [{ level: 0, id: rootId }]
  let l1Counter = 0
  let currentHeadingDepth = 0
  let currentHeadingBaseIndent: number | null = null

  for (const line of linesToProcess) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Check if line combined bullet with heading (e.g. "- ### Pricing Low-Ticket" or "* ### Canal")
    const bulletHeadingMatch = line.match(/^(\s*)(?:[-*+]|\d+[.)]|[a-zA-Z][.)])\s+(#{1,6})\s+(.+)$/)
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/)
    const multiAsteriskMatch = line.match(/^(\s*)(\*{1,6})\s+(.+)$/)
    const bulletMatch = line.match(/^(\s*)(?:[-+]|\d+[.)]|[a-zA-Z][.)])\s+(.+)$/)

    let depth = 1
    let title = ''

    if (bulletHeadingMatch) {
      const headingLevel = bulletHeadingMatch[2].length
      // If author/AI used 3 hashes directly on a list item, normalize to level 1 if at top level
      depth = currentHeadingDepth === 0 ? (headingLevel === 3 ? 1 : Math.max(1, headingLevel - 1)) : currentHeadingDepth + 1
      title = bulletHeadingMatch[3]
    } else if (headingMatch) {
      const headingLevel = headingMatch[1].length
      // If author jumped straight from # Root to ### Section, normalize to level 1 for first branch
      depth = currentHeadingDepth === 0 && headingLevel === 3 ? 1 : Math.max(1, headingLevel - 1)
      currentHeadingDepth = depth
      currentHeadingBaseIndent = null
      title = headingMatch[2]
    } else if (multiAsteriskMatch) {
      const leadingSpaces = multiAsteriskMatch[1].replace(/\t/g, '  ').length
      const asteriskCount = multiAsteriskMatch[2].length
      if (asteriskCount > 1) {
        // When author/AI uses ** or ***, each asterisk explicitly denotes depth level!
        depth = asteriskCount
      } else {
        // Single asterisk: treat like a bullet
        if (currentHeadingDepth > 0) {
          if (currentHeadingBaseIndent === null) currentHeadingBaseIndent = leadingSpaces
          const relativeIndent = Math.max(0, leadingSpaces - currentHeadingBaseIndent)
          depth = currentHeadingDepth + 1 + Math.floor(relativeIndent / 2)
        } else {
          depth = 1 + Math.floor(leadingSpaces / 2)
        }
      }
      title = multiAsteriskMatch[3]
    } else if (bulletMatch) {
      const leadingSpaces = bulletMatch[1].replace(/\t/g, '  ').length
      if (currentHeadingDepth > 0) {
        if (currentHeadingBaseIndent === null) currentHeadingBaseIndent = leadingSpaces
        const relativeIndent = Math.max(0, leadingSpaces - currentHeadingBaseIndent)
        depth = currentHeadingDepth + 1 + Math.floor(relativeIndent / 2)
      } else {
        depth = 1 + Math.floor(leadingSpaces / 2)
      }
      title = bulletMatch[2]
    } else {
      // Bold heading line like **Etapa 1**
      const boldHeadingMatch = trimmed.match(/^(\*{2,6})\s*([^*]+?)\s*\1$/)
      if (boldHeadingMatch) {
        depth = boldHeadingMatch[1].length === 2 ? 1 : boldHeadingMatch[1].length - 1
        currentHeadingDepth = depth
        currentHeadingBaseIndent = null
        title = boldHeadingMatch[2]
      } else {
        depth = currentHeadingDepth > 0 ? currentHeadingDepth + 1 : 1
        title = trimmed
      }
    }

    if (!title) continue

    // Checkbox support: [ ] or [x]
    let task: { completed?: boolean } | undefined = undefined
    const checkboxMatch = title.trim().match(/^\[([ xX])\]\s*(.*)$/)
    if (checkboxMatch) {
      task = { completed: checkboxMatch[1].toLowerCase() === 'x' }
      title = checkboxMatch[2]
    }

    // Clean any markdown asterisks/formatting from title
    title = cleanNodeTitle(title)
    if (!title) continue

    // Stack unwinding to find immediate parent
    while (stack.length > 1 && stack[stack.length - 1].level >= depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    const nodeId = 'node_' + Math.random().toString(36).substring(2, 9)
    const isLevel1 = parent.id === rootId

    let side: 'left' | 'right' | undefined = undefined
    if (isLevel1) {
      side = l1Counter % 2 === 0 ? 'right' : 'left'
      l1Counter++
    }

    nodes[nodeId] = {
      id: nodeId,
      parentId: parent.id,
      children: [],
      title: title || 'Tópico',
      shape: depth >= 3 ? 'underline' : 'rounded',
      side,
      task
    }

    if (nodes[parent.id]) {
      nodes[parent.id].children.push(nodeId)
    }

    stack.push({ level: depth, id: nodeId })
  }

  // Fallback children if none were parsed
  if (nodes[rootId].children.length === 0) {
    const c1 = 'node_' + Math.random().toString(36).substring(2, 9)
    const c2 = 'node_' + Math.random().toString(36).substring(2, 9)
    nodes[rootId].children = [c1, c2]
    nodes[c1] = { id: c1, parentId: rootId, children: [], title: 'Ideias Iniciais', shape: 'rounded', side: 'right' }
    nodes[c2] = { id: c2, parentId: rootId, children: [], title: 'Objetivos', shape: 'rounded', side: 'left' }
  }

  return {
    type: 'pyrite-mindmap',
    version: 1,
    rootId,
    nodes,
    relations: baseDoc?.relations || [],
    boundaries: baseDoc?.boundaries || [],
    theme: baseDoc?.theme || 'pyrite-classic',
    layout: baseDoc?.layout || 'radial',
    canvasBg: baseDoc?.canvasBg || '#0f172a',
    lineStyle: baseDoc?.lineStyle || 'tapered',
    mapStyle: baseDoc?.mapStyle || 'organic-branch',
    paletteId: baseDoc?.paletteId || 'rainbow',
    colorizeNodeBg: baseDoc?.colorizeNodeBg ?? false,
    customPalettes: baseDoc?.customPalettes || {},
    viewport: baseDoc?.viewport || { panX: 0, panY: 0, zoom: 1 }
  }
}

/**
 * Serializes a MindMapDocument into a clean, human-readable Markdown outline.
 * Ideal for feeding mindmap structure into LLMs or exporting to markdown files.
 */
export function mindMapToMarkdownOutline(doc: MindMapDocument): string {
  const root = doc.nodes[doc.rootId]
  if (!root) return '# Meu Mapa Mental\n'

  const lines: string[] = []
  lines.push(`# ${cleanNodeTitle(root.title)}`)

  const appendChildren = (nodeId: string, depth: number) => {
    const node = doc.nodes[nodeId]
    if (!node || !node.children) return

    for (const childId of node.children) {
      const child = doc.nodes[childId]
      if (!child) continue

      const cleanTitle = cleanNodeTitle(child.title)
      const taskPrefix = child.task ? `[${child.task.completed ? 'x' : ' '}] ` : ''

      if (depth === 1) {
        lines.push(`\n## ${taskPrefix}${cleanTitle}`)
      } else {
        const indent = '  '.repeat(depth - 1)
        lines.push(`${indent}- ${taskPrefix}${cleanTitle}`)
      }

      appendChildren(childId, depth + 1)
    }
  }

  appendChildren(doc.rootId, 1)
  return lines.join('\n')
}

export function parseMindMapDocument(content?: string, fallbackTitle?: string, baseDoc?: MindMapDocument): MindMapDocument {
  if (!content || !content.trim()) {
    return createEmptyMindMapDocument(fallbackTitle)
  }

  const raw = content.trim()

  // 1. If wrapped in markdown code blocks (e.g. ```json ... ```), extract the inner content
  let jsonCandidate = raw
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    jsonCandidate = codeBlockMatch[1].trim()
  }

  // 2. Try JSON parsing
  try {
    if (jsonCandidate.startsWith('{') && jsonCandidate.endsWith('}')) {
      const parsed = JSON.parse(jsonCandidate)
      if (parsed && (parsed.type === 'pyrite-mindmap' || parsed.type === 'pyrita-mindmap' || parsed.rootId || parsed.nodes)) {
        const rootId = parsed.rootId || Object.keys(parsed.nodes || {})[0] || 'root'
        const theme = parsed.theme && MINDMAP_THEMES[parsed.theme as MindMapThemeId] ? parsed.theme : (baseDoc?.theme || 'pyrite-classic')
        return {
          type: 'pyrite-mindmap',
          version: parsed.version || 1,
          rootId,
          nodes: parsed.nodes || {},
          relations: Array.isArray(parsed.relations) ? parsed.relations : (baseDoc?.relations || []),
          boundaries: Array.isArray(parsed.boundaries) ? parsed.boundaries : (baseDoc?.boundaries || []),
          theme,
          layout: parsed.layout || baseDoc?.layout || 'radial',
          canvasBg: parsed.canvasBg || baseDoc?.canvasBg || '#0f172a',
          lineStyle: parsed.lineStyle || baseDoc?.lineStyle || 'tapered',
          mapStyle: parsed.mapStyle || baseDoc?.mapStyle || 'organic-branch',
          paletteId: parsed.paletteId || baseDoc?.paletteId || 'rainbow',
          colorizeNodeBg: parsed.colorizeNodeBg ?? baseDoc?.colorizeNodeBg ?? false,
          customPalettes: parsed.customPalettes || baseDoc?.customPalettes || {},
          viewport: parsed.viewport || baseDoc?.viewport || { panX: 0, panY: 0, zoom: 1 }
        }
      }
    }
  } catch {
    // If not valid JSON, proceed to Markdown outline parser
  }

  // 3. Fallback: Parse as Markdown outline (supports AI-generated lists/outlines)
  return parseMarkdownToMindMap(raw, fallbackTitle, baseDoc)
}

export function serializeMindMapDocument(doc: MindMapDocument): string {
  return JSON.stringify(doc, null, 2)
}

// Node dimensions calculation based on content
export function estimateNodeDimensions(node: MindMapNode, isRoot: boolean): { width: number; height: number } {
  const text = node.title || 'Tópico'
  const isUnderline = node.shape === 'underline'
  const charWidth = isRoot ? 9.5 : 8
  const basePaddingX = isUnderline ? 12 : isRoot ? 36 : 28
  const iconsWidth = (node.icons && node.icons.length > 0) ? node.icons.length * 20 + 8 : 0
  const taskWidth = node.task ? 24 : 0
  const noteIndicatorWidth = node.note ? 20 : 0
  const linkIndicatorWidth = node.link ? 20 : 0

  const contentWidth = text.length * charWidth + basePaddingX + iconsWidth + taskWidth + noteIndicatorWidth + linkIndicatorWidth
  const width = Math.max(isRoot ? 140 : isUnderline ? 60 : 110, Math.min(380, Math.round(contentWidth)))
  const height = isUnderline ? 26 : isRoot ? 48 : (node.note || (node.icons && node.icons.length > 2) ? 42 : 36)

  return { width, height }
}

interface SubtreeMetric {
  id: string
  width: number
  height: number
  totalHeight: number
  children: SubtreeMetric[]
}

function computeSubtreeMetrics(
  nodeId: string,
  nodes: Record<string, MindMapNode>,
  isRoot: boolean,
  gapY: number
): SubtreeMetric {
  const node = nodes[nodeId] || { id: nodeId, title: 'Tópico', children: [], parentId: null }
  const { width, height } = estimateNodeDimensions(node, isRoot)

  if (node.collapsed || !node.children || node.children.length === 0) {
    return {
      id: nodeId,
      width,
      height,
      totalHeight: height,
      children: []
    }
  }

  const childMetrics = node.children
    .filter(cid => !!nodes[cid])
    .map(cid => computeSubtreeMetrics(cid, nodes, false, gapY))

  const childrenTotalHeight = childMetrics.reduce((sum, cm) => sum + cm.totalHeight, 0) + Math.max(0, childMetrics.length - 1) * gapY
  const totalHeight = Math.max(height, childrenTotalHeight)

  return {
    id: nodeId,
    width,
    height,
    totalHeight,
    children: childMetrics
  }
}

// Generate tapered organic branch path (thick at parent, smoothly tapering down to child)
export function createTaperedEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number = 7,
  w2: number = 2,
  side: 'left' | 'right' | 'bottom' = 'right'
): string {
  if (side === 'bottom') {
    const deltaY = Math.abs(y2 - y1)
    const ctrlDist = Math.max(20, deltaY * 0.5)
    const p1x = x1 - w1 / 2
    const p2x = x2 - w2 / 2
    const p3x = x2 + w2 / 2
    const p4x = x1 + w1 / 2

    return `M ${p1x} ${y1} C ${p1x} ${y1 + ctrlDist}, ${p2x} ${y2 - ctrlDist}, ${p2x} ${y2} L ${p3x} ${y2} C ${p3x} ${y2 - ctrlDist}, ${p4x} ${y1 + ctrlDist}, ${p4x} ${y1} Z`
  }

  const deltaX = Math.abs(x2 - x1)
  const ctrlDistance = Math.max(24, deltaX * 0.55)

  if (side === 'right') {
    const p1y = y1 - w1 / 2
    const p2y = y2 - w2 / 2
    const p3y = y2 + w2 / 2
    const p4y = y1 + w1 / 2

    const ctrl1X = x1 + ctrlDistance
    const ctrl2X = x2 - ctrlDistance

    return `M ${x1} ${p1y} C ${ctrl1X} ${p1y}, ${ctrl2X} ${p2y}, ${x2} ${p2y} L ${x2} ${p3y} C ${ctrl2X} ${p3y}, ${ctrl1X} ${p4y}, ${x1} ${p4y} Z`
  } else {
    const p1y = y1 - w1 / 2
    const p2y = y2 - w2 / 2
    const p3y = y2 + w2 / 2
    const p4y = y1 + w1 / 2

    const ctrl1X = x1 - ctrlDistance
    const ctrl2X = x2 + ctrlDistance

    return `M ${x1} ${p1y} C ${ctrl1X} ${p1y}, ${ctrl2X} ${p2y}, ${x2} ${p2y} L ${x2} ${p3y} C ${ctrl2X} ${p3y}, ${ctrl1X} ${p4y}, ${x1} ${p4y} Z`
  }
}

// Generate path based on lineStyle
export function createEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineStyle: MindMapLineStyle = 'tapered',
  side: 'left' | 'right' | 'bottom' = 'right'
): string {
  if (lineStyle === 'tapered') {
    return createTaperedEdgePath(x1, y1, x2, y2, 4, 1.8, side)
  }

  if (lineStyle === 'rounded-elbow') {
    if (side === 'bottom') {
      const midY = (y1 + y2) / 2
      return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
    }
    const midX = (x1 + x2) / 2
    return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
  }

  // Default 'curved' (cubic bezier)
  if (side === 'bottom') {
    const deltaY = Math.abs(y2 - y1)
    const ctrlDist = Math.max(20, deltaY * 0.5)
    return `M ${x1} ${y1} C ${x1} ${y1 + ctrlDist}, ${x2} ${y2 - ctrlDist}, ${x2} ${y2}`
  }

  const deltaX = Math.abs(x2 - x1)
  const ctrlDistance = Math.max(24, deltaX * 0.55)
  const ctrl1X = side === 'right' ? x1 + ctrlDistance : x1 - ctrlDistance
  const ctrl2X = side === 'right' ? x2 - ctrlDistance : x2 + ctrlDistance

  return `M ${x1} ${y1} C ${ctrl1X} ${y1}, ${ctrl2X} ${y2}, ${x2} ${y2}`
}

export function calculateMindMapLayout(doc: MindMapDocument): ComputedLayout {
  const { rootId, nodes, layout, theme: themeId, boundaries = [], paletteId = 'rainbow', lineStyle = 'tapered' } = doc
  const theme = MINDMAP_THEMES[themeId] || MINDMAP_THEMES['pyrite-classic']
  const allPalettes: Record<string, { name: string; colors: string[] }> = {
    ...MINDMAP_PALETTES,
    ...(doc.customPalettes || {})
  }
  const palette = allPalettes[paletteId] || MINDMAP_PALETTES.rainbow
  const activeBranchColors = palette.colors && palette.colors.length > 0 ? palette.colors : MINDMAP_PALETTES.rainbow.colors

  const computedNodes: ComputedNode[] = []
  const computedEdges: ComputedEdge[] = []
  const computedBoundaries: ComputedBoundary[] = []

  const rootNode = nodes[rootId]
  if (!rootNode) {
    return {
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: { minX: -400, maxX: 400, minY: -300, maxY: 300 }
    }
  }

  const gapX = 52
  const gapY = 16
  const rootDim = estimateNodeDimensions(rootNode, true)

  computedNodes.push({
    id: rootId,
    x: 0,
    y: 0,
    width: rootDim.width,
    height: rootDim.height,
    side: 'center',
    level: 0,
    node: rootNode,
    branchColor: theme.rootBorder
  })

  // Check if root is collapsed: if collapsed, don't layout any children!
  if (rootNode.collapsed) {
    return {
      nodes: computedNodes,
      edges: [],
      boundaries: [],
      bounds: {
        minX: -rootDim.width / 2 - 80,
        maxX: rootDim.width / 2 + 80,
        minY: -rootDim.height / 2 - 60,
        maxY: rootDim.height / 2 + 60
      }
    }
  }

  // Separate root children based on layout & side
  const rootChildren = (rootNode.children || []).filter(cid => !!nodes[cid])
  const rightChildren: string[] = []
  const leftChildren: string[] = []

  const isBranchMode = doc.colorDistribution === 'branch'

  // Global branch color mapping to keep color hierarchy perfectly standard and harmonious
  const branchColorMap: Record<string, string> = {}
  rootChildren.forEach((cid, index) => {
    branchColorMap[cid] = activeBranchColors[index % activeBranchColors.length]
  })

  if (layout === 'right') {
    rightChildren.push(...rootChildren)
  } else if (layout === 'left') {
    leftChildren.push(...rootChildren)
  } else if (layout === 'org-chart' || layout === 'tree-bottom') {
    rightChildren.push(...rootChildren)
  } else {
    // 'radial' - alternate or preserve explicit node.side
    rootChildren.forEach((cid, index) => {
      const child = nodes[cid]
      if (child.side === 'left') {
        leftChildren.push(cid)
      } else if (child.side === 'right') {
        rightChildren.push(cid)
      } else {
        if (index % 2 === 0) rightChildren.push(cid)
        else leftChildren.push(cid)
      }
    })
  }

  // Helper to layout a side (right or left)
  const layoutSideTree = (
    childIds: string[],
    side: 'left' | 'right',
    startX: number
  ) => {
    if (childIds.length === 0) return

    const metrics = childIds.map(cid => computeSubtreeMetrics(cid, nodes, false, gapY))
    const totalSideHeight = metrics.reduce((sum, m) => sum + m.totalHeight, 0) + Math.max(0, metrics.length - 1) * gapY
    let currentY = -totalSideHeight / 2

    metrics.forEach((metric) => {
      // In hierarchy mode, all Level 1 nodes share the exact same Stage 1 color!
      const branchColor = isBranchMode
        ? (branchColorMap[metric.id] || activeBranchColors[0])
        : activeBranchColors[0]
      const branchCenterY = currentY + metric.totalHeight / 2

      // Position branch root - check if node has custom position
      const nodeObj = nodes[metric.id]
      const nodeX = (nodeObj.customX != null)
        ? nodeObj.customX
        : (side === 'right' ? startX + metric.width / 2 : startX - metric.width / 2)

      const nodeY = (nodeObj.customY != null)
        ? nodeObj.customY
        : branchCenterY

      positionSubtree(metric, nodeX, nodeY, side, 1, branchColor)

      // Connect Root to this main branch
      const rootAnchorX = side === 'right' ? rootDim.width / 2 : -rootDim.width / 2
      const rootAnchorY = 0
      const targetAnchorX = side === 'right' ? nodeX - metric.width / 2 : nodeX + metric.width / 2
      const targetAnchorY = nodeObj.shape === 'underline' ? nodeY + metric.height / 2 - 1 : nodeY

      const effectiveLineStyle = nodeObj.branchStyle || lineStyle
      const isTapered = effectiveLineStyle === 'tapered'

      computedEdges.push({
        id: `edge_${rootId}_${metric.id}`,
        fromId: rootId,
        toId: metric.id,
        path: isTapered
          ? createTaperedEdgePath(rootAnchorX, rootAnchorY, targetAnchorX, targetAnchorY, 8.5, 2.5, side)
          : createEdgePath(rootAnchorX, rootAnchorY, targetAnchorX, targetAnchorY, effectiveLineStyle, side),
        color: nodeObj.branchColor || branchColor,
        width: 3.5,
        style: 'solid',
        isTapered
      })

      currentY += metric.totalHeight + gapY
    })
  }

  // Recursive placement of subtrees
  const positionSubtree = (
    metric: SubtreeMetric,
    x: number,
    y: number,
    side: 'left' | 'right',
    level: number,
    inheritedBranchColor: string
  ) => {
    const node = nodes[metric.id]
    // In hierarchy mode, each stage/level has its own standardized color!
    const stageColor = isBranchMode
      ? inheritedBranchColor
      : (activeBranchColors[(level - 1) % activeBranchColors.length] || activeBranchColors[0])
    const effectiveColor = node.branchColor || stageColor

    computedNodes.push({
      id: metric.id,
      x,
      y,
      width: metric.width,
      height: metric.height,
      side,
      level,
      node,
      branchColor: effectiveColor
    })

    if (node.collapsed || metric.children.length === 0) return

    const childrenTotalHeight = metric.children.reduce((sum, cm) => sum + cm.totalHeight, 0) + Math.max(0, metric.children.length - 1) * gapY
    let childY = y - childrenTotalHeight / 2

    metric.children.forEach(childMetric => {
      const childCenterY = childY + childMetric.totalHeight / 2
      const childObj = nodes[childMetric.id]

      const childNodeX = (childObj.customX != null)
        ? childObj.customX
        : (side === 'right' ? x + metric.width / 2 + gapX + childMetric.width / 2 : x - metric.width / 2 - gapX - childMetric.width / 2)

      const childNodeY = (childObj.customY != null)
        ? childObj.customY
        : childCenterY

      positionSubtree(childMetric, childNodeX, childNodeY, side, level + 1, effectiveColor)

      // Edge from parent to child (exact baseline alignment for underline shapes)
      const fromAnchorX = side === 'right' ? x + metric.width / 2 : x - metric.width / 2
      const fromAnchorY = node.shape === 'underline' ? y + metric.height / 2 - 1 : y
      const toAnchorX = side === 'right' ? childNodeX - childMetric.width / 2 : childNodeX + childMetric.width / 2
      const toAnchorY = childObj.shape === 'underline' ? childNodeY + childMetric.height / 2 - 1 : childNodeY

      const effectiveLineStyle = childObj.branchStyle || lineStyle
      const isTapered = effectiveLineStyle === 'tapered'
      const w1 = level === 1 ? 3.5 : Math.max(1.5, 2.8 - level * 0.4)
      const w2 = Math.max(1.5, 2.2 - level * 0.4)

      const nextLevel = level + 1
      const childStageColor = isBranchMode
        ? effectiveColor
        : (activeBranchColors[(nextLevel - 1) % activeBranchColors.length] || activeBranchColors[0])

      computedEdges.push({
        id: `edge_${metric.id}_${childMetric.id}`,
        fromId: metric.id,
        toId: childMetric.id,
        path: isTapered
          ? createTaperedEdgePath(fromAnchorX, fromAnchorY, toAnchorX, toAnchorY, w1, w2, side)
          : createEdgePath(fromAnchorX, fromAnchorY, toAnchorX, toAnchorY, effectiveLineStyle, side),
        color: childObj.branchColor || childStageColor,
        width: w1,
        style: 'solid',
        isTapered
      })

      childY += childMetric.totalHeight + gapY
    })
  }

  // Layout Right & Left sides
  if (layout === 'org-chart') {
    // Org Chart Layout (Top-Down)
    const metrics = rootChildren.map(cid => computeSubtreeMetrics(cid, nodes, false, gapY))
    const totalWidth = metrics.reduce((sum, m) => sum + m.width, 0) + Math.max(0, metrics.length - 1) * 36
    let currentX = -totalWidth / 2
    const startY = rootDim.height / 2 + 60

    metrics.forEach((metric, branchIndex) => {
      const branchColor = isBranchMode
        ? activeBranchColors[branchIndex % activeBranchColors.length]
        : activeBranchColors[0]
      const centerX = currentX + metric.width / 2

      const positionVerticalSubtree = (m: SubtreeMetric, posX: number, posY: number, lvl: number) => {
        const nd = nodes[m.id]
        const actualX = nd.customX != null ? nd.customX : posX
        const actualY = nd.customY != null ? nd.customY : posY

        const lvlColor = isBranchMode
          ? branchColor
          : (activeBranchColors[(lvl - 1) % activeBranchColors.length] || activeBranchColors[0])
        const actualColor = nd.branchColor || lvlColor

        computedNodes.push({
          id: m.id,
          x: actualX,
          y: actualY,
          width: m.width,
          height: m.height,
          side: 'bottom',
          level: lvl,
          node: nd,
          branchColor: actualColor
        })

        if (nd.collapsed || m.children.length === 0) return

        const chWidth = m.children.reduce((sum, c) => sum + c.width, 0) + Math.max(0, m.children.length - 1) * 24
        let chX = actualX - chWidth / 2
        const nextY = actualY + m.height / 2 + 50

        m.children.forEach(cm => {
          const cmX = chX + cm.width / 2
          const childNd = nodes[cm.id]
          const actualChildX = childNd.customX != null ? childNd.customX : cmX
          const actualChildY = childNd.customY != null ? childNd.customY : nextY

          positionVerticalSubtree(cm, actualChildX, actualChildY, lvl + 1)

          // Edge
          const isTapered = lineStyle === 'tapered'
          const childLvlColor = isBranchMode
            ? branchColor
            : (activeBranchColors[lvl % activeBranchColors.length] || activeBranchColors[0])

          computedEdges.push({
            id: `edge_${m.id}_${cm.id}`,
            fromId: m.id,
            toId: cm.id,
            path: isTapered
              ? createTaperedEdgePath(actualX, actualY + m.height / 2, actualChildX, actualChildY - cm.height / 2, 3.5, 2, 'bottom')
              : createEdgePath(actualX, actualY + m.height / 2, actualChildX, actualChildY - cm.height / 2, lineStyle, 'bottom'),
            color: childNd.branchColor || childLvlColor,
            width: 2,
            style: 'solid',
            isTapered
          })

          chX += cm.width + 24
        })
      }

      const branchObj = nodes[metric.id]
      const actualBranchX = branchObj.customX != null ? branchObj.customX : centerX
      const actualBranchY = branchObj.customY != null ? branchObj.customY : startY

      positionVerticalSubtree(metric, actualBranchX, actualBranchY, 1)

      const isRootTapered = lineStyle === 'tapered'
      computedEdges.push({
        id: `edge_${rootId}_${metric.id}`,
        fromId: rootId,
        toId: metric.id,
        path: isRootTapered
          ? createTaperedEdgePath(0, rootDim.height / 2, actualBranchX, actualBranchY - metric.height / 2, 7.5, 2.5, 'bottom')
          : createEdgePath(0, rootDim.height / 2, actualBranchX, actualBranchY - metric.height / 2, lineStyle, 'bottom'),
        color: branchObj.branchColor || branchColor,
        width: 3,
        style: 'solid',
        isTapered: isRootTapered
      })

      currentX += metric.width + 36
    })
  } else {
    // Horizontal (Radial / Right / Left)
    layoutSideTree(rightChildren, 'right', rootDim.width / 2 + gapX)
    layoutSideTree(leftChildren, 'left', -rootDim.width / 2 - gapX)
  }

  // Calculate Boundaries around branches
  const nodePositionMap = new Map<string, ComputedNode>()
  computedNodes.forEach(cn => nodePositionMap.set(cn.id, cn))

  boundaries.forEach(b => {
    const targetNodes: ComputedNode[] = []
    const collectDescendants = (id: string) => {
      const cn = nodePositionMap.get(id)
      if (cn) {
        targetNodes.push(cn)
        const nd = nodes[id]
        if (nd && !nd.collapsed && nd.children) {
          nd.children.forEach(collectDescendants)
        }
      }
    }
    collectDescendants(b.rootNodeId)

    if (targetNodes.length > 0) {
      let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity
      targetNodes.forEach(tn => {
        bMinX = Math.min(bMinX, tn.x - tn.width / 2 - 16)
        bMaxX = Math.max(bMaxX, tn.x + tn.width / 2 + 16)
        bMinY = Math.min(bMinY, tn.y - tn.height / 2 - 16)
        bMaxY = Math.max(bMaxY, tn.y + tn.height / 2 + 16)
      })

      computedBoundaries.push({
        id: b.id,
        boundary: b,
        rect: {
          x: bMinX,
          y: bMinY,
          width: bMaxX - bMinX,
          height: bMaxY - bMinY
        }
      })
    }
  })

  // Calculate layout bounds accurately based on rendered nodes & boundaries
  if (computedNodes.length === 0) {
    return {
      nodes: computedNodes,
      edges: computedEdges,
      boundaries: computedBoundaries,
      bounds: { minX: -200, maxX: 200, minY: -150, maxY: 150 }
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  computedNodes.forEach(cn => {
    minX = Math.min(minX, cn.x - cn.width / 2 - 40)
    maxX = Math.max(maxX, cn.x + cn.width / 2 + 40)
    minY = Math.min(minY, cn.y - cn.height / 2 - 40)
    maxY = Math.max(maxY, cn.y + cn.height / 2 + 40)
  })

  computedBoundaries.forEach(cb => {
    minX = Math.min(minX, cb.rect.x - 20)
    maxX = Math.max(maxX, cb.rect.x + cb.rect.width + 20)
    minY = Math.min(minY, cb.rect.y - 20)
    maxY = Math.max(maxY, cb.rect.y + cb.rect.height + 20)
  })

  return {
    nodes: computedNodes,
    edges: computedEdges,
    boundaries: computedBoundaries,
    bounds: { minX, maxX, minY, maxY }
  }
}

// Tree Mutators
export function addNode(
  doc: MindMapDocument,
  parentId: string,
  title = 'Novo Tópico',
  side?: 'left' | 'right'
): { updatedDoc: MindMapDocument; newId: string } {
  const newId = 'node_' + crypto.randomUUID().slice(0, 8)
  const parent = doc.nodes[parentId]
  if (!parent) return { updatedDoc: doc, newId: '' }

  const effectiveSide = side || parent.side || (parent.id === doc.rootId ? 'right' : undefined)
  const isParentRoot = parent.id === doc.rootId

  // Inherit style preset
  const defaultShape = doc.mapStyle === 'organic-branch'
    ? (isParentRoot ? 'rounded' : 'underline')
    : doc.mapStyle === 'pills'
    ? 'capsule'
    : doc.mapStyle === 'technical'
    ? 'rectangle'
    : doc.mapStyle === 'minimal-lines'
    ? 'underline'
    : 'rounded'

  const newNode: MindMapNode = {
    id: newId,
    parentId,
    children: [],
    title,
    side: effectiveSide,
    shape: defaultShape
  }

  const updatedNodes = {
    ...doc.nodes,
    [parentId]: {
      ...parent,
      collapsed: false,
      children: [...(parent.children || []), newId]
    },
    [newId]: newNode
  }

  return {
    updatedDoc: {
      ...doc,
      nodes: updatedNodes
    },
    newId
  }
}

export function addSiblingNode(
  doc: MindMapDocument,
  siblingId: string,
  title = 'Novo Tópico',
  before = false
): { updatedDoc: MindMapDocument; newId: string } {
  const sibling = doc.nodes[siblingId]
  if (!sibling || !sibling.parentId) return { updatedDoc: doc, newId: '' }

  const parent = doc.nodes[sibling.parentId]
  if (!parent) return { updatedDoc: doc, newId: '' }

  const newId = 'node_' + crypto.randomUUID().slice(0, 8)
  const siblings = [...parent.children]
  const index = siblings.indexOf(siblingId)

  if (before) {
    siblings.splice(Math.max(0, index), 0, newId)
  } else {
    siblings.splice(index + 1, 0, newId)
  }

  const newNode: MindMapNode = {
    id: newId,
    parentId: parent.id,
    children: [],
    title,
    side: sibling.side,
    shape: sibling.shape || 'rounded'
  }

  return {
    updatedDoc: {
      ...doc,
      nodes: {
        ...doc.nodes,
        [parent.id]: {
          ...parent,
          children: siblings
        },
        [newId]: newNode
      }
    },
    newId
  }
}

export function deleteNode(doc: MindMapDocument, nodeId: string): MindMapDocument {
  if (nodeId === doc.rootId) return doc // Cannot delete root
  const nodeToDelete = doc.nodes[nodeId]
  if (!nodeToDelete) return doc

  const toDelete = new Set<string>()
  const collect = (id: string) => {
    toDelete.add(id)
    const nd = doc.nodes[id]
    if (nd && nd.children) {
      nd.children.forEach(collect)
    }
  }
  collect(nodeId)

  const nextNodes = { ...doc.nodes }
  if (nodeToDelete.parentId && nextNodes[nodeToDelete.parentId]) {
    const p = nextNodes[nodeToDelete.parentId]
    nextNodes[nodeToDelete.parentId] = {
      ...p,
      children: p.children.filter(cid => cid !== nodeId)
    }
  }

  toDelete.forEach(id => {
    delete nextNodes[id]
  })

  const nextRelations = (doc.relations || []).filter(
    r => !toDelete.has(r.fromId) && !toDelete.has(r.toId)
  )
  const nextBoundaries = (doc.boundaries || []).filter(
    b => !toDelete.has(b.rootNodeId)
  )

  return {
    ...doc,
    nodes: nextNodes,
    relations: nextRelations,
    boundaries: nextBoundaries
  }
}

export function updateNode(
  doc: MindMapDocument,
  nodeId: string,
  updates: Partial<MindMapNode>
): MindMapDocument {
  const current = doc.nodes[nodeId]
  if (!current) return doc

  const updatedNode = { ...current }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) {
      delete (updatedNode as any)[key]
    } else {
      (updatedNode as any)[key] = value
    }
  }

  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [nodeId]: updatedNode
    }
  }
}

export function toggleCollapse(doc: MindMapDocument, nodeId: string): MindMapDocument {
  const current = doc.nodes[nodeId]
  if (!current || !current.children || current.children.length === 0) return doc

  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [nodeId]: {
        ...current,
        collapsed: !current.collapsed
      }
    }
  }
}

// Reset custom manual dragging to return to neat automatic layout
export function resetNodePositions(doc: MindMapDocument): MindMapDocument {
  const nextNodes: Record<string, MindMapNode> = {}
  for (const [id, node] of Object.entries(doc.nodes)) {
    const { customX: _customX, customY: _customY, ...cleanNode } = node
    nextNodes[id] = cleanNode
  }
  return {
    ...doc,
    nodes: nextNodes
  }
}

// Apply Map Style Preset (Organic Branch, Modern Cards, Pills, Technical, Minimal Lines)
export function applyMapStylePreset(doc: MindMapDocument, preset: MindMapStylePreset): MindMapDocument {
  const nextNodes: Record<string, MindMapNode> = {}

  let targetLineStyle: MindMapLineStyle = 'tapered'
  if (preset === 'organic-branch') targetLineStyle = 'tapered'
  else if (preset === 'technical') targetLineStyle = 'rounded-elbow'
  else if (preset === 'minimal-lines') targetLineStyle = 'curved'

  for (const [id, node] of Object.entries(doc.nodes)) {
    const isRoot = id === doc.rootId
    const isMainTopic = node.parentId === doc.rootId

    let newShape = node.shape
    if (preset === 'organic-branch') {
      newShape = isRoot ? 'rounded' : isMainTopic ? 'rounded' : 'underline'
    } else if (preset === 'modern-cards') {
      newShape = 'rounded'
    } else if (preset === 'pills') {
      newShape = 'capsule'
    } else if (preset === 'technical') {
      newShape = 'rectangle'
    } else if (preset === 'minimal-lines') {
      newShape = isRoot ? 'rounded' : 'underline'
    }

    nextNodes[id] = {
      ...node,
      shape: newShape,
      branchStyle: undefined
    }
  }

  return {
    ...doc,
    mapStyle: preset,
    lineStyle: targetLineStyle,
    nodes: nextNodes
  }
}

export function exportToMarkdown(doc: MindMapDocument): string {
  const root = doc.nodes[doc.rootId]
  if (!root) return ''

  const lines: string[] = []

  const traverse = (nodeId: string, depth: number) => {
    const node = doc.nodes[nodeId]
    if (!node) return

    const indent = '  '.repeat(depth)
    const prefix = depth === 0 ? '# ' : depth === 1 ? '## ' : `${indent}- `
    let line = `${prefix}${node.title}`

    if (node.task) {
      line += node.task.completed ? ' [x]' : ' [ ]'
    }
    if (node.link) {
      line += ` (${node.link})`
    }
    lines.push(line)

    if (node.note) {
      lines.push(`${indent}  > ${node.note.replace(/\n/g, `\n${indent}  > `)}`)
    }

    if (node.children) {
      node.children.forEach(cid => traverse(cid, depth + 1))
    }
  }

  traverse(doc.rootId, 0)
  return lines.join('\n')
}
