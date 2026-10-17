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

export interface ParsedButton {
  label: string
  action: string
}

export function parseButtonsBlock(lines: string[]): ParsedButton[] {
  const buttons: ParsedButton[] = []
  for (const rawLine of lines) {
    const l = rawLine.trim()
    if (!l) continue

    // Format: [Label | Action] or [Label]
    const bracketMatch = l.match(/^\[(.*?)\]$/)
    if (bracketMatch) {
      const inner = bracketMatch[1]
      const pipeIdx = inner.indexOf('|')
      if (pipeIdx !== -1) {
        buttons.push({
          label: inner.slice(0, pipeIdx).trim(),
          action: inner.slice(pipeIdx + 1).trim()
        })
      } else {
        buttons.push({
          label: inner.trim(),
          action: inner.trim()
        })
      }
      continue
    }

    // Format: - Label | Action or - Label
    if (l.startsWith('-') || l.startsWith('*') || l.startsWith('•')) {
      const clean = l.replace(/^[-*•]\s*/, '').trim()
      const pipeIdx = clean.indexOf('|')
      if (pipeIdx !== -1) {
        buttons.push({
          label: clean.slice(0, pipeIdx).trim(),
          action: clean.slice(pipeIdx + 1).trim()
        })
      } else {
        buttons.push({
          label: clean,
          action: clean
        })
      }
      continue
    }

    // Default line
    buttons.push({
      label: l,
      action: l
    })
  }
  return buttons
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
        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        : kpi.trend === 'down'
        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50'

    return `
      <div class="nested-card-outer my-4 rounded-[15px] px-[5px] pb-[5px] pt-[6px] bg-[#141417] border border-white/[0.08] shadow-lg shadow-black/50 select-none" contenteditable="false" ${rawAttr}>
        <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
          <div class="flex items-center gap-2">
            <span class="text-[#c59b27] text-sm">📈</span>
            <span class="font-semibold text-zinc-200 text-xs tracking-wide">${escapeHtml(kpi.title)}</span>
          </div>
          ${kpi.badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#1c1913] text-[#d4af37] border border-[#c59b27]/25 shadow-xs">${escapeHtml(kpi.badge)}</span>` : ''}
        </div>
        <div class="nested-card-inner rounded-[10px] p-3 bg-[#0a0a0c] border border-white/[0.04] shadow-inner flex flex-col gap-2">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-2xl font-bold font-mono tracking-tight text-zinc-100">${escapeHtml(kpi.value)}</span>
            ${kpi.change ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${trendClass}">${trendIcon} ${escapeHtml(kpi.change)}</span>` : ''}
          </div>
          <div class="space-y-1">
            <div class="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span>Atingimento da Meta</span>
              <span class="text-[#d4af37] font-semibold">114%</span>
            </div>
            <div class="h-1.5 w-full bg-zinc-800/70 rounded-full overflow-hidden p-[1px]">
              <div class="h-full bg-gradient-to-r from-[#9e7922] to-[#c59b27] rounded-full" style="width: 78%"></div>
            </div>
          </div>
          ${kpi.subtitle ? `<div class="text-[10px] text-zinc-400 pt-1 border-t border-white/[0.04]">${escapeHtml(kpi.subtitle)}</div>` : ''}
        </div>
      </div>
    `
  }

  if (directive === 'timeline') {
    const tl = parseTimelineBlock(headerLine, lines)
    const itemsHtml = tl.items
      .map(
        (it, idx) => `
        <div class="flex items-start gap-3 text-xs mb-2.5">
          <div class="w-3 h-3 rounded-full ${idx === 0 ? 'bg-[#1c1913] border border-[#c59b27]' : 'bg-[#121215] border border-zinc-700/70'} mt-0.5 shrink-0 flex items-center justify-center">
            ${idx === 0 ? '<div class="w-1.5 h-1.5 rounded-full bg-[#c59b27]"></div>' : ''}
          </div>
          <div class="flex-1 bg-[#111114] rounded-[8px] p-2.5 border border-white/[0.05]">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-zinc-200 text-xs">${escapeHtml(it.title)}</span>
              <span class="font-mono text-[10px] text-zinc-400 bg-zinc-800/60 px-1.5 py-0.5 rounded border border-zinc-700/40">${escapeHtml(it.date)}</span>
            </div>
            ${it.description ? `<p class="text-[11px] text-zinc-400 leading-relaxed">${escapeHtml(it.description)}</p>` : ''}
          </div>
        </div>
      `
      )
      .join('')

    return `
      <div class="nested-card-outer my-4 rounded-[15px] px-[5px] pb-[5px] pt-[6px] bg-[#141417] border border-white/[0.08] shadow-lg shadow-black/50 select-none" contenteditable="false" ${rawAttr}>
        <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
          <div class="flex items-center gap-2">
            <span class="text-[#c59b27] text-sm">📅</span>
            <span class="font-semibold text-zinc-200 text-xs tracking-wide">${escapeHtml(tl.title)}</span>
          </div>
          ${tl.badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#1c1913] text-[#d4af37] border border-[#c59b27]/25 shadow-xs">${escapeHtml(tl.badge)}</span>` : ''}
        </div>
        <div class="nested-card-inner rounded-[10px] p-3 bg-[#0a0a0c] border border-white/[0.04] shadow-inner">
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
        <div class="rounded-[8px] p-3 border ${c.highlight ? 'bg-[#111114] border-t-2 border-t-[#c59b27] border-x-white/[0.06] border-b-white/[0.06]' : 'bg-[#111114] border border-white/[0.05]'}">
          <div class="flex items-center justify-between gap-1 pb-1.5 mb-1.5 border-b border-white/[0.05]">
            <span class="font-semibold text-zinc-100 text-xs">${escapeHtml(c.title)}</span>
            ${c.highlight ? '<span class="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#1c1913] text-[#d4af37] border border-[#c59b27]/30">★ Recomendado</span>' : ''}
          </div>
          <ul class="space-y-1 text-xs text-zinc-300">
            ${c.items.map(it => `<li class="flex items-start gap-1.5"><span class="text-[#c59b27] text-xs">✓</span><span class="leading-snug text-[11px] text-zinc-300">${escapeHtml(it)}</span></li>`).join('')}
          </ul>
        </div>
      `
      )
      .join('')

    return `
      <div class="nested-card-outer my-4 rounded-[15px] px-[5px] pb-[5px] pt-[6px] bg-[#141417] border border-white/[0.08] shadow-lg shadow-black/50 select-none" contenteditable="false" ${rawAttr}>
        <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
          <div class="flex items-center gap-2">
            <span class="text-[#c59b27] text-sm">⚖️</span>
            <span class="font-semibold text-zinc-200 text-xs tracking-wide">${escapeHtml(comp.title)}</span>
          </div>
          ${comp.badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#1c1913] text-[#d4af37] border border-[#c59b27]/25 shadow-xs">${escapeHtml(comp.badge)}</span>` : ''}
        </div>
        <div class="nested-card-inner rounded-[10px] p-3 bg-[#0a0a0c] border border-white/[0.04] shadow-inner">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
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
    <div class="nested-card-outer my-4 rounded-[15px] px-[5px] pb-[5px] pt-[6px] bg-[#141417] border border-white/[0.08] shadow-lg shadow-black/50 select-none" contenteditable="false" ${rawAttr}>
      <div class="nested-card-header flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
        <div class="flex items-center gap-2">
          <span class="text-[#c59b27] text-sm">✨</span>
          <span class="font-semibold text-zinc-200 text-xs tracking-wide">${escapeHtml(title)}</span>
        </div>
        ${badge ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#1c1913] text-[#d4af37] border border-[#c59b27]/25 shadow-xs">${escapeHtml(badge)}</span>` : ''}
      </div>
      <div class="nested-card-inner rounded-[10px] p-3 bg-[#0a0a0c] border border-white/[0.04] shadow-inner">
        ${bodyHtml}
      </div>
    </div>
  `
}

