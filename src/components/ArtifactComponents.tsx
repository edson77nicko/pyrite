import React from 'react'
import { NestedCard } from './NestedCard'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Calendar,
  Layers,
  CheckCircle2,
  Circle,
  Sparkles,
  Check,
  ArrowUpRight
} from 'lucide-react'

/**
 * Universal Wikilink Parser for Artifacts:
 * Parses [[Target]] or [[Target|Alias]] into interactive clickable note buttons.
 */
export function renderWikilinks(text?: string, onNavigate?: (title: string) => void): React.ReactNode {
  if (!text) return text
  const parts: (string | React.ReactNode)[] = []
  let cursor = 0
  const regex = /\[\[(.*?)\]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.substring(cursor, match.index))
    }
    const rawTarget = match[1]
    const [targetName, alias] = rawTarget.split('|')
    const displayName = (alias || targetName).split('#')[0].trim()
    const destination = targetName.split('#')[0].trim()

    parts.push(
      <button
        key={`wikilink-${match.index}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (onNavigate) onNavigate(destination)
        }}
        className="inline-flex items-center text-amber-300 hover:text-amber-100 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40 hover:border-amber-500/70 rounded px-1.5 py-0.5 mx-0.5 font-medium transition-all text-[11px] cursor-pointer shadow-xs"
        title={`Abrir nota: ${destination}`}
      >
        <span className="underline decoration-amber-500/40 hover:decoration-amber-300 underline-offset-2">
          {displayName}
        </span>
      </button>
    )
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    parts.push(text.substring(cursor))
  }
  return parts.length > 0 ? <>{parts}</> : text
}

// ==========================================
// 1. KPI / Metric Card (Craft Edition)
// ==========================================
export interface KpiCardProps {
  title: string
  value: string
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
  badge?: string
  progress?: number // e.g. 85 for 85%
  benchmark?: string
  className?: string
  onNavigate?: (title: string) => void
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  change,
  trend = 'neutral',
  subtitle,
  badge,
  progress = 76,
  benchmark = 'Meta Superada',
  className = '',
  onNavigate
}) => {
  return (
    <NestedCard
      title={renderWikilinks(title, onNavigate)}
      icon={<Activity className="w-3.5 h-3.5 text-[#c59b27]" />}
      badge={badge}
      size="md"
      variant="default"
      className={className}
    >
      <div className="flex flex-col gap-2.5 justify-between h-full">
        {/* Main metric row */}
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100 flex items-center gap-1.5">
            {value}
            <span className="text-[10px] font-sans font-normal text-zinc-500 uppercase tracking-widest ml-1">
              Índice
            </span>
          </div>

          {change && (
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                trend === 'up'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : trend === 'down'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50'
              }`}
            >
              {trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
              {trend === 'down' && <TrendingDown className="w-3 h-3 text-rose-400" />}
              {trend === 'neutral' && <Minus className="w-3 h-3 text-zinc-400" />}
              <span>{change}</span>
            </div>
          )}
        </div>

        {/* Micro-Progress Bar & Attainment Indicator */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>Progresso da Meta</span>
            <span className="text-[#d4af37] font-semibold">{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-800/70 rounded-full overflow-hidden p-[1px]">
            <div
              className="h-full bg-gradient-to-r from-[#9e7922] to-[#c59b27] rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>

        {/* Subtitle & Micro-footer */}
        <div className="pt-1 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-zinc-400">
          <span className="truncate">{renderWikilinks(subtitle, onNavigate) || 'Comparativo histórico baseado no Vault'}</span>
          <span className="shrink-0 font-mono text-[9px] text-[#c59b27] bg-[#1a1711] px-1.5 py-0.5 rounded border border-[#c59b27]/20">
            {benchmark}
          </span>
        </div>
      </div>
    </NestedCard>
  )
}

// ==========================================
// 2. Timeline / Roadmap Card (Craft Edition)
// ==========================================
export interface TimelineItem {
  date: string
  title: string
  description?: string
  status?: 'done' | 'current' | 'future'
  tag?: string
}

export interface TimelineCardProps {
  title: string
  badge?: string
  items: TimelineItem[]
  className?: string
  onNavigate?: (title: string) => void
}

export const TimelineCard: React.FC<TimelineCardProps> = ({
  title,
  badge,
  items,
  className = '',
  onNavigate
}) => {
  return (
    <NestedCard
      title={renderWikilinks(title, onNavigate)}
      icon={<Calendar className="w-3.5 h-3.5 text-[#c59b27]" />}
      badge={badge}
      size="md"
      variant="default"
      className={className}
    >
      <div className="relative pl-3 space-y-3 pt-1">
        {/* Continuous connector line */}
        <div className="absolute left-[17px] top-2.5 bottom-2.5 w-[1px] bg-zinc-800/90" />

        {items.map((item, idx) => {
          const isDone = item.status === 'done'
          const isCurrent = item.status === 'current' || (!item.status && idx === 0)

          return (
            <div key={idx} className="relative flex items-start gap-3 text-xs group">
              {/* Stepper Node Indicator */}
              <div className="relative z-10 shrink-0 mt-0.5">
                {isDone ? (
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center shadow-xs">
                    <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[2.5]" />
                  </div>
                ) : isCurrent ? (
                  <div className="w-3.5 h-3.5 rounded-full bg-[#1c1913] border border-[#c59b27] flex items-center justify-center shadow-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#c59b27]" />
                  </div>
                ) : (
                  <div className="w-3 h-3 rounded-full bg-[#121215] border border-zinc-700/70 ml-0.5 mt-0.5" />
                )}
              </div>

              {/* Inset Sub-node Item with Neutral Dark Surface */}
              <div className="flex-1 bg-[#111114] rounded-[8px] p-2.5 border border-white/[0.05] hover:border-white/[0.1] transition-all shadow-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
                    {renderWikilinks(item.title, onNavigate)}
                    {isCurrent && (
                      <span className="text-[9px] font-sans px-1.5 py-0.2 rounded-full bg-[#1c1912] text-[#d4af37] border border-[#c59b27]/30">
                        Ativo
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800/60 px-1.5 py-0.5 rounded border border-zinc-700/40">
                      {item.date}
                    </span>
                  </div>
                </div>

                {item.description && (
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {renderWikilinks(item.description, onNavigate)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </NestedCard>
  )
}

// ==========================================
// 3. Comparison / Decision Matrix Card
// ==========================================
export interface ComparisonColumn {
  title: string
  subtitle?: string
  badge?: string
  highlight?: boolean
  items: string[]
}

export interface ComparisonCardProps {
  title: string
  badge?: string
  columns: ComparisonColumn[]
  className?: string
  onNavigate?: (title: string) => void
}

export const ComparisonCard: React.FC<ComparisonCardProps> = ({
  title,
  badge,
  columns,
  className = '',
  onNavigate
}) => {
  return (
    <NestedCard
      title={renderWikilinks(title, onNavigate)}
      icon={<Layers className="w-3.5 h-3.5 text-[#c59b27]" />}
      badge={badge}
      size="md"
      variant="default"
      className={className}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {columns.map((col, cIdx) => (
          <div
            key={cIdx}
            className={`rounded-[8px] p-3 border transition-all flex flex-col justify-between ${
              col.highlight
                ? 'bg-[#111114] border-t-2 border-t-[#c59b27] border-x-white/[0.06] border-b-white/[0.06] shadow-sm'
                : 'bg-[#111114] border border-white/[0.05]'
            }`}
          >
            <div>
              {/* Column Header */}
              <div className="flex items-center justify-between gap-1 pb-2 mb-2 border-b border-white/[0.05]">
                <div>
                  <h4 className="font-semibold text-zinc-100 text-xs flex items-center gap-1.5">
                    {renderWikilinks(col.title, onNavigate)}
                  </h4>
                  {col.subtitle && <p className="text-[10px] text-zinc-500">{renderWikilinks(col.subtitle, onNavigate)}</p>}
                </div>
                {col.highlight ? (
                  <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#1c1913] text-[#d4af37] border border-[#c59b27]/30">
                    ★ Recomendado
                  </span>
                ) : col.badge ? (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/70 text-zinc-400 border border-zinc-700/50">
                    {col.badge}
                  </span>
                ) : null}
              </div>

              {/* Items List */}
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {col.items.map((it, itIdx) => (
                  <li key={itIdx} className="flex items-start gap-1.5">
                    <span className="text-[#c59b27] text-xs mt-0.5 shrink-0">✓</span>
                    <span className="leading-snug text-[11px] text-zinc-300">{renderWikilinks(it, onNavigate)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bottom Verdict Row */}
            <div className="mt-3 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-zinc-500">
              <span>{col.highlight ? 'Arquitetura Principal' : 'Alternativa'}</span>
              <ArrowUpRight className="w-3 h-3 text-zinc-500" />
            </div>
          </div>
        ))}
      </div>
    </NestedCard>
  )
}

// ==========================================
// 4. Action / Task Steps Card (Craft Edition)
// ==========================================
export interface ActionCardItem {
  text: string
  completed?: boolean
}

export interface ActionCardProps {
  title: string
  badge?: string
  items: ActionCardItem[]
  className?: string
  onNavigate?: (title: string) => void
}

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  badge,
  items,
  className = '',
  onNavigate
}) => {
  const completedCount = items.filter(i => i.completed).length
  const totalCount = items.length
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <NestedCard
      title={renderWikilinks(title, onNavigate)}
      icon={<Sparkles className="w-3.5 h-3.5 text-[#c59b27]" />}
      badge={badge || `${completedCount}/${totalCount} Concluídas`}
      size="md"
      variant="default"
      className={className}
    >
      <div className="space-y-2">
        {/* Progress header bar */}
        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pb-1 border-b border-white/[0.04]">
          <span>Status do Checklist</span>
          <span className="text-[#d4af37] font-semibold">{percentage}%</span>
        </div>

        <div className="space-y-1.5">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-2 rounded-[8px] bg-[#111114] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
            >
              {it.completed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              )}
              <span
                className={`text-xs ${
                  it.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
                }`}
              >
                {renderWikilinks(it.text, onNavigate)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </NestedCard>
  )
}
