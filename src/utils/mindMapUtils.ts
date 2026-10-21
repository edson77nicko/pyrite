import type {
  ComputedBoundary,
  ComputedEdge,
  ComputedLayout,
  ComputedNode,
  MindMapDocument,
  MindMapNode,
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
  lineStyle: 'curved' | 'straight' | 'rounded-elbow'
}

export const MINDMAP_THEMES: Record<MindMapThemeId, ThemeConfig> = {
  'mindomo-classic': {
    id: 'mindomo-classic',
    name: 'Mindomo Classic',
    bg: '#0f172a',
    rootBg: '#2563eb',
    rootBorder: '#3b82f6',
    rootText: '#ffffff',
    branchColors: ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf'],
    subtopicBg: '#1e293b',
    subtopicBorder: '#334155',
    subtopicText: '#f1f5f9',
    lineStyle: 'curved'
  },
  'pyrita-gold': {
    id: 'pyrita-gold',
    name: 'Pyrita Âmbar Gold',
    bg: '#09090b',
    rootBg: '#c59b27',
    rootBorder: '#eab308',
    rootText: '#000000',
    branchColors: ['#c59b27', '#eab308', '#f59e0b', '#d97706', '#fbbf24', '#ca8a04', '#e2b342'],
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
    branchColors: ['#ec4899', '#06b6d4', '#a855f7', '#3b82f6', '#10b981', '#f43f5e', '#f59e0b'],
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
    branchColors: ['#10b981', '#14b8a6', '#06b6d4', '#84cc16', '#22c55e', '#3b82f6', '#10b981'],
    subtopicBg: '#064e3b',
    subtopicBorder: '#0f766e',
    subtopicText: '#ecfdf5',
    lineStyle: 'curved'
  },
  'pastel-dream': {
    id: 'pastel-dream',
    name: 'Pastel Dream',
    bg: '#18151f',
    rootBg: '#e0a96d',
    rootBorder: '#f3c68f',
    rootText: '#201a15',
    branchColors: ['#f472b6', '#38bdf8', '#fbbf24', '#a78bfa', '#4ade80', '#fb923c', '#e879f9'],
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
    branchColors: ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#e4e4e7', '#a1a1aa', '#d4d4d8'],
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
      title: initialTitle || 'Mapa Mental',
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
      title: 'Tarefas & Ações',
      shape: 'rounded',
      side: 'right',
      icons: ['check']
    }
  }

  return {
    type: 'pyrita-mindmap',
    version: 1,
    rootId,
    nodes,
    relations: [],
    boundaries: [],
    theme: 'mindomo-classic',
    layout: 'radial',
    viewport: {
      panX: 0,
      panY: 0,
      zoom: 1
    }
  }
}

export function parseMindMapDocument(content?: string, fallbackTitle?: string): MindMapDocument {
  if (!content || !content.trim()) {
    return createEmptyMindMapDocument(fallbackTitle)
  }

  try {
    const parsed = JSON.parse(content)
    if (parsed && (parsed.type === 'pyrita-mindmap' || parsed.rootId)) {
      const rootId = parsed.rootId || Object.keys(parsed.nodes || {})[0] || 'root'
      return {
        type: 'pyrita-mindmap',
        version: parsed.version || 1,
        rootId,
        nodes: parsed.nodes || {},
        relations: Array.isArray(parsed.relations) ? parsed.relations : [],
        boundaries: Array.isArray(parsed.boundaries) ? parsed.boundaries : [],
        theme: parsed.theme || 'mindomo-classic',
        layout: parsed.layout || 'radial',
        viewport: parsed.viewport || { panX: 0, panY: 0, zoom: 1 }
      }
    }
  } catch (err) {
    console.warn('Failed to parse mind map json, falling back to empty:', err)
  }

  return createEmptyMindMapDocument(fallbackTitle)
}

export function serializeMindMapDocument(doc: MindMapDocument): string {
  return JSON.stringify(doc, null, 2)
}

// Node dimensions calculation based on content
export function estimateNodeDimensions(node: MindMapNode, isRoot: boolean): { width: number; height: number } {
  const text = node.title || 'Tópico'
  const charWidth = isRoot ? 9.5 : 8
  const basePaddingX = isRoot ? 36 : 28
  const iconsWidth = (node.icons && node.icons.length > 0) ? node.icons.length * 20 + 8 : 0
  const taskWidth = node.task ? 24 : 0
  const noteIndicatorWidth = node.note ? 20 : 0
  const linkIndicatorWidth = node.link ? 20 : 0

  const contentWidth = text.length * charWidth + basePaddingX + iconsWidth + taskWidth + noteIndicatorWidth + linkIndicatorWidth
  const width = Math.max(isRoot ? 140 : 110, Math.min(340, Math.round(contentWidth)))
  const height = isRoot ? 48 : (node.note || (node.icons && node.icons.length > 2) ? 42 : 36)

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

export function calculateMindMapLayout(doc: MindMapDocument): ComputedLayout {
  const { rootId, nodes, layout, theme: themeId, boundaries = [] } = doc
  const theme = MINDMAP_THEMES[themeId] || MINDMAP_THEMES['mindomo-classic']

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

  const gapX = 54
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

  // Separate root children based on layout & side
  const rootChildren = (rootNode.children || []).filter(cid => !!nodes[cid])
  const rightChildren: string[] = []
  const leftChildren: string[] = []

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

    metrics.forEach((metric, branchIndex) => {
      const branchColor = theme.branchColors[branchIndex % theme.branchColors.length]
      const branchCenterY = currentY + metric.totalHeight / 2

      // Position branch root
      const nodeX = side === 'right'
        ? startX + metric.width / 2
        : startX - metric.width / 2

      positionSubtree(metric, nodeX, branchCenterY, side, 1, branchColor)

      // Connect Root to this main branch
      const rootAnchorX = side === 'right' ? rootDim.width / 2 : -rootDim.width / 2
      const rootAnchorY = 0
      const targetAnchorX = side === 'right' ? nodeX - metric.width / 2 : nodeX + metric.width / 2
      const targetAnchorY = branchCenterY

      const deltaX = Math.abs(targetAnchorX - rootAnchorX)
      const ctrlDistance = Math.max(30, deltaX * 0.55)
      const ctrl1X = side === 'right' ? rootAnchorX + ctrlDistance : rootAnchorX - ctrlDistance
      const ctrl2X = side === 'right' ? targetAnchorX - ctrlDistance : targetAnchorX + ctrlDistance

      computedEdges.push({
        id: `edge_${rootId}_${metric.id}`,
        fromId: rootId,
        toId: metric.id,
        path: `M ${rootAnchorX} ${rootAnchorY} C ${ctrl1X} ${rootAnchorY}, ${ctrl2X} ${targetAnchorY}, ${targetAnchorX} ${targetAnchorY}`,
        color: nodes[metric.id]?.branchColor || branchColor,
        width: 3,
        style: 'solid'
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
    const effectiveColor = node.branchColor || inheritedBranchColor

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
      const childNodeX = side === 'right'
        ? x + metric.width / 2 + gapX + childMetric.width / 2
        : x - metric.width / 2 - gapX - childMetric.width / 2

      positionSubtree(childMetric, childNodeX, childCenterY, side, level + 1, effectiveColor)

      // Edge from parent to child
      const fromAnchorX = side === 'right' ? x + metric.width / 2 : x - metric.width / 2
      const fromAnchorY = y
      const toAnchorX = side === 'right' ? childNodeX - childMetric.width / 2 : childNodeX + childMetric.width / 2
      const toAnchorY = childCenterY

      const deltaX = Math.abs(toAnchorX - fromAnchorX)
      const ctrlDistance = Math.max(24, deltaX * 0.5)
      const ctrl1X = side === 'right' ? fromAnchorX + ctrlDistance : fromAnchorX - ctrlDistance
      const ctrl2X = side === 'right' ? toAnchorX - ctrlDistance : toAnchorX + ctrlDistance

      computedEdges.push({
        id: `edge_${metric.id}_${childMetric.id}`,
        fromId: metric.id,
        toId: childMetric.id,
        path: `M ${fromAnchorX} ${fromAnchorY} C ${ctrl1X} ${fromAnchorY}, ${ctrl2X} ${toAnchorY}, ${toAnchorX} ${toAnchorY}`,
        color: nodes[childMetric.id]?.branchColor || effectiveColor,
        width: Math.max(1.5, 2.5 - level * 0.3),
        style: 'solid'
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
      const branchColor = theme.branchColors[branchIndex % theme.branchColors.length]
      const centerX = currentX + metric.width / 2

      const positionVerticalSubtree = (m: SubtreeMetric, posX: number, posY: number, lvl: number) => {
        const nd = nodes[m.id]
        computedNodes.push({
          id: m.id,
          x: posX,
          y: posY,
          width: m.width,
          height: m.height,
          side: 'bottom',
          level: lvl,
          node: nd,
          branchColor
        })

        if (nd.collapsed || m.children.length === 0) return

        const chWidth = m.children.reduce((sum, c) => sum + c.width, 0) + Math.max(0, m.children.length - 1) * 24
        let chX = posX - chWidth / 2
        const nextY = posY + m.height / 2 + 50

        m.children.forEach(cm => {
          const cmX = chX + cm.width / 2
          positionVerticalSubtree(cm, cmX, nextY, lvl + 1)

          // Edge
          computedEdges.push({
            id: `edge_${m.id}_${cm.id}`,
            fromId: m.id,
            toId: cm.id,
            path: `M ${posX} ${posY + m.height / 2} C ${posX} ${posY + m.height / 2 + 25}, ${cmX} ${nextY - cm.height / 2 - 25}, ${cmX} ${nextY - cm.height / 2}`,
            color: branchColor,
            width: 2,
            style: 'solid'
          })

          chX += cm.width + 24
        })
      }

      positionVerticalSubtree(metric, centerX, startY, 1)

      computedEdges.push({
        id: `edge_${rootId}_${metric.id}`,
        fromId: rootId,
        toId: metric.id,
        path: `M 0 ${rootDim.height / 2} C 0 ${rootDim.height / 2 + 30}, ${centerX} ${startY - metric.height / 2 - 30}, ${centerX} ${startY - metric.height / 2}`,
        color: branchColor,
        width: 3,
        style: 'solid'
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
    // Find all descendants of b.rootNodeId that are in computedNodes
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

  // Calculate layout bounds
  let minX = -400, maxX = 400, minY = -300, maxY = 300
  computedNodes.forEach(cn => {
    minX = Math.min(minX, cn.x - cn.width / 2 - 100)
    maxX = Math.max(maxX, cn.x + cn.width / 2 + 100)
    minY = Math.min(minY, cn.y - cn.height / 2 - 80)
    maxY = Math.max(maxY, cn.y + cn.height / 2 + 80)
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

  const newNode: MindMapNode = {
    id: newId,
    parentId,
    children: [],
    title,
    side: effectiveSide,
    shape: 'rounded'
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

  // Collect all descendants recursively
  const toDelete = new Set<string>()
  const collect = (id: string) => {
    toDelete.add(id)
    const nd = doc.nodes[id]
    if (nd && nd.children) {
      nd.children.forEach(collect)
    }
  }
  collect(nodeId)

  // Remove from parent's children
  const nextNodes = { ...doc.nodes }
  if (nodeToDelete.parentId && nextNodes[nodeToDelete.parentId]) {
    const p = nextNodes[nodeToDelete.parentId]
    nextNodes[nodeToDelete.parentId] = {
      ...p,
      children: p.children.filter(cid => cid !== nodeId)
    }
  }

  // Delete all collected
  toDelete.forEach(id => {
    delete nextNodes[id]
  })

  // Clean relations and boundaries
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

  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [nodeId]: {
        ...current,
        ...updates
      }
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
