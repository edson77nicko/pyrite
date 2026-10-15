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
  Sparkles
} from 'lucide-react'

// ==========================================
// 1. KPI / Metric Card
// ==========================================
export interface KpiCardProps {
  title: string
  value: string
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
  badge?: string
  className?: string
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  change,
  trend = 'neutral',
  subtitle,
  badge,
  className = ''
}) => {
  return (
    <NestedCard
      title={title}
      icon={<Activity className="w-3.5 h-3.5" />}
      badge={badge}
      size="md"
      variant="gold"
      className={className}
    >
      <div className="flex flex-col gap-1.5 justify-between h-full">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="text-2xl font-bold font-mono tracking-tight text-zinc-100">
            {value}
          </div>

          {change && (
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium shadow-sm ${
                trend === 'up'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                  : trend === 'down'
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
              }`}
            >
              {trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
              {trend === 'down' && <TrendingDown className="w-3 h-3 text-rose-400" />}
              {trend === 'neutral' && <Minus className="w-3 h-3 text-zinc-400" />}
              <span>{change}</span>
            </div>
          )}
        </div>

        {subtitle && (
          <div className="text-[11px] text-zinc-400 leading-snug">
            {subtitle}
          </div>
        )}
      </div>
    </NestedCard>
  )
}

// ==========================================
// 2. Timeline / Roadmap Card
// ==========================================
export interface TimelineItem {
  date: string
  title: string
  description?: string
  status?: 'done' | 'current' | 'future'
}

export interface TimelineCardProps {
  title: string
  badge?: string
  items: TimelineItem[]
  className?: string
}

export const TimelineCard: React.FC<TimelineCardProps> = ({
  title,
  badge,
  items,
  className = ''
}) => {
  return (
    <NestedCard
      title={title}
      icon={<Calendar className="w-3.5 h-3.5" />}
      badge={badge}
      size="md"
      variant="default"
      className={className}
    >
      <div className="relative pl-3 space-y-4 pt-1">
        {/* Continuous connector line */}
        <div className="absolute left-[17px] top-2 bottom-2 w-[2px] bg-zinc-800" />

        {items.map((item, idx) => {
          const isDone = item.status === 'done'
          const isCurrent = item.status === 'current' || (!item.status && idx === 0)

          return (
            <div key={idx} className="relative flex items-start gap-3 text-xs group">
              {/* Node indicator */}
              <div className="relative z-10 shrink-0 mt-0.5">
                {isDone ? (
                  <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-[#0c0c0e] flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-[#0c0c0e]" />
                  </div>
                ) : isCurrent ? (
                  <div className="w-3 h-3 rounded-full bg-amber-400 ring-4 ring-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 ring-4 ring-[#0c0c0e] ml-0.5" />
                )}
              </div>

              {/* Inset Sub-node Item */}
              <div className="flex-1 bg-zinc-900/60 rounded-[8px] p-2.5 border border-zinc-800/60 hover:border-amber-500/30 transition-colors shadow-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-zinc-100">{item.title}</span>
                  <span className="font-mono text-[10px] text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/30">
                    {item.date}
                  </span>
                </div>
                {item.description && (
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {item.description}
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
// 3. Comparison / Side-by-Side Card
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
}

export const ComparisonCard: React.FC<ComparisonCardProps> = ({
  title,
  badge,
  columns,
  className = ''
}) => {
  return (
    <NestedCard
      title={title}
      icon={<Layers className="w-3.5 h-3.5" />}
      badge={badge}
      size="md"
      variant="default"
      className={className}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {columns.map((col, cIdx) => (
          <div
            key={cIdx}
            className={`rounded-[8px] p-3 border transition-all flex flex-col justify-between ${
              col.highlight
                ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                : 'bg-zinc-900/50 border-zinc-800/80'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1 pb-2 mb-2 border-b border-zinc-800/70">
                <div>
                  <h4 className="font-semibold text-zinc-100 text-xs">{col.title}</h4>
                  {col.subtitle && <p className="text-[10px] text-zinc-500">{col.subtitle}</p>}
                </div>
                {col.badge && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 border border-zinc-700/60">
                    {col.badge}
                  </span>
                )}
              </div>

              <ul className="space-y-1.5 text-xs text-zinc-300">
                {col.items.map((it, itIdx) => (
                  <li key={itIdx} className="flex items-start gap-1.5">
                    <span className="text-amber-400 text-xs mt-0.5">•</span>
                    <span className="leading-snug">{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </NestedCard>
  )
}

// ==========================================
// 4. Action / Task Steps Card
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
}

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  badge,
  items,
  className = ''
}) => {
  return (
    <NestedCard
      title={title}
      icon={<Sparkles className="w-3.5 h-3.5" />}
      badge={badge}
      size="md"
      variant="gold"
      className={className}
    >
      <div className="space-y-1.5">
        {items.map((it, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 p-2 rounded-[8px] bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700/80 transition-colors"
          >
            {it.completed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            )}
            <span
              className={`text-xs ${
                it.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
              }`}
            >
              {it.text}
            </span>
          </div>
        ))}
      </div>
    </NestedCard>
  )
}
