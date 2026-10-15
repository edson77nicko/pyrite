export interface ParsedKpi {
  title: string
  value: string
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
  badge?: string
}

export interface ParsedTimelineItem {
  date: string
  title: string
  description?: string
  status?: 'done' | 'current' | 'future'
}

export interface ParsedTimeline {
  title: string
  badge?: string
  items: ParsedTimelineItem[]
}

export interface ParsedComparisonColumn {
  title: string
  subtitle?: string
  badge?: string
  highlight?: boolean
  items: string[]
}

export interface ParsedComparison {
  title: string
  badge?: string
  columns: ParsedComparisonColumn[]
}

export interface ParsedGenericCard {
  title: string
  badge?: string
  variant?: 'default' | 'gold' | 'glass' | 'highlight'
  contentLines: string[]
}

export function parseKpiBlock(lines: string[]): ParsedKpi {
  const result: ParsedKpi = {
    title: 'Métrica',
    value: '0'
  }

  for (const l of lines) {
    const colonIdx = l.indexOf(':')
    if (colonIdx === -1) continue
    const key = l.slice(0, colonIdx).trim().toLowerCase()
    const val = l.slice(colonIdx + 1).trim()

    if (key === 'title' || key === 'titulo') result.title = val
    else if (key === 'value' || key === 'valor') result.value = val
    else if (key === 'change' || key === 'variacao') result.change = val
    else if (key === 'trend' || key === 'tendencia') {
      const lower = val.toLowerCase()
      if (lower.includes('up') || lower.includes('sub') || lower.includes('alta') || lower.includes('+')) {
        result.trend = 'up'
      } else if (lower.includes('down') || lower.includes('desc') || lower.includes('queda') || lower.includes('-')) {
        result.trend = 'down'
      } else {
        result.trend = 'neutral'
      }
    } else if (key === 'subtitle' || key === 'subtitulo') result.subtitle = val
    else if (key === 'badge') result.badge = val
  }

  return result
}

export function parseHeaderMeta(headerLine: string): { title: string; badge?: string } {
  // Matches :::directive [Title Here] badge: BadgeText
  let title = ''
  let badge: string | undefined = undefined

  const titleMatch = headerLine.match(/\[(.*?)\]/)
  if (titleMatch) {
    title = titleMatch[1].trim()
  } else {
    // Fallback: remove directive name
    const parts = headerLine.replace(/^:::[a-zA-Z0-9_-]+/, '').trim()
    title = parts.split(/\s+badge:/i)[0].trim()
  }

  const badgeMatch = headerLine.match(/badge:\s*([^\s\]]+)/i)
  if (badgeMatch) {
    badge = badgeMatch[1].trim()
  }

  return { title: title || 'Cartão Embutido', badge }
}

export function parseTimelineBlock(headerLine: string, lines: string[]): ParsedTimeline {
  const { title, badge } = parseHeaderMeta(headerLine)
  const items: ParsedTimelineItem[] = []

  for (const l of lines) {
    const trimmed = l.trim()
    if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue
    const clean = trimmed.replace(/^[-*]\s*/, '')

    // Format: date | title | description
    const parts = clean.split('|').map(p => p.trim())
    if (parts.length >= 2) {
      items.push({
        date: parts[0],
        title: parts[1],
        description: parts.slice(2).join(' | ') || undefined
      })
    } else if (parts.length === 1 && parts[0]) {
      items.push({
        date: 'Etapa',
        title: parts[0]
      })
    }
  }

  return { title, badge, items }
}

export function parseComparisonBlock(headerLine: string, lines: string[]): ParsedComparison {
  const { title, badge } = parseHeaderMeta(headerLine)
  const columns: ParsedComparisonColumn[] = []
  let currentColumn: ParsedComparisonColumn | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('### ')) {
      if (currentColumn) {
        columns.push(currentColumn)
      }
      const rawTitle = trimmed.slice(4).trim()
      const isHighlight = rawTitle.toLowerCase().includes('(destaque)') || rawTitle.toLowerCase().includes('*')
      currentColumn = {
        title: rawTitle.replace(/\(destaque\)/gi, '').replace(/\*/g, '').trim(),
        highlight: isHighlight,
        items: []
      }
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentColumn) {
        currentColumn = {
          title: 'Geral',
          items: []
        }
      }
      currentColumn.items.push(trimmed.slice(2).trim())
    }
  }

  if (currentColumn) {
    columns.push(currentColumn)
  }

  return { title, badge, columns }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderArtifactHtml(headerLine: string, lines: string[]): string {
  const directive = headerLine.replace(/^:::/, '').trim().split(/[\s\[]/)[0].toLowerCase()
  const rawBlock = [headerLine, ...lines, ':::'].join('\n')
  const rawAttr = `data-raw-artifact="${encodeURIComponent(rawBlock)}"`

  if (directive === 'kpi' || directive === 'metric') {
    const kpi = parseKpiBlock(lines)
    const trendIcon = kpi.trend === 'up' ? '↗' : kpi.trend === 'down' ? '↘' : '•'
    const trendClass =
      kpi.trend === 'up'
        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
        : kpi.trend === 'down'
        ? 'bg-rose-950/60 text-rose-300 border-rose-800/40'
        : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'

    return `
      <div class="nested-card-outer my-4 rounded-[20px] p-[10px] bg-gradient-to-b from-[#221c12] to-[#161410] border border-amber-500/30 shadow-xl shadow-amber-950/20 select-none" contenteditable="false" ${rawAttr}>
        <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pt-1 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-amber-400 text-sm">📈</span>
            <span class="font-semibold text-zinc-100 text-xs tracking-wide">${escapeHtml(kpi.title)}</span>
          </div>
          ${kpi.badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40 shadow-sm">${escapeHtml(kpi.badge)}</span>` : ''}
        </div>
        <div class="nested-card-inner rounded-[10px] p-3.5 bg-[#0c0c0e] border border-amber-500/20 shadow-inner flex flex-col justify-between">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-2xl font-bold font-mono tracking-tight text-zinc-100">${escapeHtml(kpi.value)}</span>
            ${kpi.change ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border ${trendClass}">${trendIcon} ${escapeHtml(kpi.change)}</span>` : ''}
          </div>
          ${kpi.subtitle ? `<div class="text-[11px] text-zinc-400 mt-1 leading-snug">${escapeHtml(kpi.subtitle)}</div>` : ''}
        </div>
      </div>
    `
  }

  if (directive === 'timeline') {
    const tl = parseTimelineBlock(headerLine, lines)
    const itemsHtml = tl.items
      .map(
        (it, idx) => `
        <div class="flex items-start gap-3 text-xs mb-3">
          <div class="w-2.5 h-2.5 rounded-full ${idx === 0 ? 'bg-amber-400 ring-4 ring-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-zinc-600'} mt-1 shrink-0"></div>
          <div class="flex-1 bg-zinc-900/60 rounded-[8px] p-2.5 border border-zinc-800/60">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-zinc-100">${escapeHtml(it.title)}</span>
              <span class="font-mono text-[10px] text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/30">${escapeHtml(it.date)}</span>
            </div>
            ${it.description ? `<p class="text-[11px] text-zinc-400 leading-relaxed">${escapeHtml(it.description)}</p>` : ''}
          </div>
        </div>
      `
      )
      .join('')

    return `
      <div class="nested-card-outer my-4 rounded-[20px] p-[10px] bg-[#18181c] border border-zinc-800/80 shadow-xl shadow-black/40 select-none" contenteditable="false" ${rawAttr}>
        <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pt-1 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-amber-400 text-sm">📅</span>
            <span class="font-semibold text-zinc-100 text-xs tracking-wide">${escapeHtml(tl.title)}</span>
          </div>
          ${tl.badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40 shadow-sm">${escapeHtml(tl.badge)}</span>` : ''}
        </div>
        <div class="nested-card-inner rounded-[10px] p-3.5 bg-[#0c0c0e] border border-zinc-800/70 shadow-inner">
          ${itemsHtml}
        </div>
      </div>
    `
  }

  if (directive === 'comparison' || directive === 'versus') {
    const comp = parseComparisonBlock(headerLine, lines)
    const colsHtml = comp.columns
      .map(
        c => `
        <div class="rounded-[8px] p-3 border ${c.highlight ? 'bg-amber-950/20 border-amber-500/40' : 'bg-zinc-900/50 border-zinc-800/80'}">
          <div class="font-semibold text-zinc-100 text-xs pb-1.5 mb-1.5 border-b border-zinc-800/70">${escapeHtml(c.title)}</div>
          <ul class="space-y-1 text-xs text-zinc-300">
            ${c.items.map(it => `<li class="flex items-start gap-1.5"><span class="text-amber-400">•</span><span>${escapeHtml(it)}</span></li>`).join('')}
          </ul>
        </div>
      `
      )
      .join('')

    return `
      <div class="nested-card-outer my-4 rounded-[20px] p-[10px] bg-[#18181c] border border-zinc-800/80 shadow-xl shadow-black/40 select-none" contenteditable="false" ${rawAttr}>
        <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pt-1 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-amber-400 text-sm">⚖️</span>
            <span class="font-semibold text-zinc-100 text-xs tracking-wide">${escapeHtml(comp.title)}</span>
          </div>
          ${comp.badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40 shadow-sm">${escapeHtml(comp.badge)}</span>` : ''}
        </div>
        <div class="nested-card-inner rounded-[10px] p-3.5 bg-[#0c0c0e] border border-zinc-800/70 shadow-inner">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${colsHtml}
          </div>
        </div>
      </div>
    `
  }

  // Generic card / nested
  const { title, badge } = parseHeaderMeta(headerLine)
  const bodyHtml = lines.map(l => `<p class="my-1 text-xs text-zinc-300 leading-relaxed">${escapeHtml(l)}</p>`).join('')

  return `
    <div class="nested-card-outer my-4 rounded-[20px] p-[10px] bg-[#18181c] border border-zinc-800/80 shadow-xl shadow-black/40 select-none" contenteditable="false" ${rawAttr}>
      <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pt-1 pb-2.5">
        <div class="flex items-center gap-2">
          <span class="text-amber-400 text-sm">✨</span>
          <span class="font-semibold text-zinc-100 text-xs tracking-wide">${escapeHtml(title)}</span>
        </div>
        ${badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40 shadow-sm">${escapeHtml(badge)}</span>` : ''}
      </div>
      <div class="nested-card-inner rounded-[10px] p-3.5 bg-[#0c0c0e] border border-zinc-800/70 shadow-inner">
        ${bodyHtml}
      </div>
    </div>
  `
}

