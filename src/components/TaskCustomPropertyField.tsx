import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'
import type { TaskPropertyConfig, TaskItem } from '../types/tasks'
import { STATUS_GROUPS, type PropertyItem } from '../utils/taskProperties'

interface Props {
  prop: TaskPropertyConfig
  task: TaskItem
  items: PropertyItem[]
  onChange: (value: any) => void
}

const inputCls =
  'w-full bg-[#1b1b20] hover:bg-[#222228] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors'

export const Pill: React.FC<{ item: PropertyItem }> = ({ item }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium max-w-full"
    style={{ backgroundColor: `${item.color}20`, color: item.color }}
  >
    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
    <span className="truncate">{item.name}</span>
  </span>
)

export const TaskCustomPropertyField: React.FC<Props> = ({ prop, task, items, onChange }) => {
  const value = task.customValues?.[prop.id]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  switch (prop.type) {
    case 'text':
      return <input className={inputCls} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Vazio" />
    case 'url':
      return <input className={inputCls} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="https://" />
    case 'number':
      return (
        <input
          type="number"
          className={inputCls}
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder="0"
        />
      )
    case 'date':
      return <input type="date" className={`${inputCls} [color-scheme:dark]`} value={value || ''} onChange={e => onChange(e.target.value || undefined)} />
    case 'checkbox':
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`w-4 h-4 mt-1 rounded-[5px] flex items-center justify-center cursor-pointer transition-all ${
            value ? 'bg-emerald-500 text-zinc-950' : 'border border-zinc-700 hover:border-zinc-500'
          }`}
        >
          {value && <Check className="w-3 h-3 stroke-[3]" />}
        </button>
      )
    case 'multiselect': {
      const selected: string[] = Array.isArray(value) ? value : []
      return (
        <div className="flex flex-wrap gap-1.5 items-center">
          {items.map(it => {
            const on = selected.includes(it.id)
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onChange(on ? selected.filter(s => s !== it.id) : [...selected, it.id])}
                className={`cursor-pointer transition-opacity ${on ? 'opacity-100' : 'opacity-40 hover:opacity-80'}`}
              >
                <Pill item={it} />
              </button>
            )
          })}
          {items.length === 0 && <span className="text-[11px] text-zinc-600">Sem opções</span>}
        </div>
      )
    }
    case 'select':
    case 'status': {
      const current = items.find(i => i.id === value)
      return (
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between bg-[#1b1b20] hover:bg-[#222228] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
          >
            {current ? <Pill item={current} /> : <span className="text-zinc-600">Vazio</span>}
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          </button>
          {open && (
            <div className="absolute z-50 top-full left-0 mt-1 w-full bg-[#1a1a1f] border border-zinc-700/60 rounded-xl shadow-md p-1 space-y-0.5 max-h-56 overflow-y-auto custom-chat-scrollbar">
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:bg-zinc-800/40 cursor-pointer"
                >
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}
              {prop.type === 'status'
                ? STATUS_GROUPS.map(g => {
                    const gi = items.filter(i => (i.group || 'todo') === g.id)
                    if (!gi.length) return null
                    return (
                      <div key={g.id}>
                        <div className="px-2.5 pt-1 pb-0.5 text-[10px] text-zinc-500">{g.label}</div>
                        {gi.map(it => (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => {
                              onChange(it.id)
                              setOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                              it.id === value ? 'bg-zinc-800/80' : 'hover:bg-zinc-800/40'
                            }`}
                          >
                            <Pill item={it} />
                            {it.id === value && <Check className="w-3.5 h-3.5 text-zinc-400" />}
                          </button>
                        ))}
                      </div>
                    )
                  })
                : items.map(it => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        onChange(it.id)
                        setOpen(false)
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                        it.id === value ? 'bg-zinc-800/80' : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <Pill item={it} />
                      {it.id === value && <Check className="w-3.5 h-3.5 text-zinc-400" />}
                    </button>
                  ))}
              {items.length === 0 && <div className="px-2.5 py-1.5 text-[11px] text-zinc-600">Sem opções</div>}
            </div>
          )}
        </div>
      )
    }
    default:
      return null
  }
}
