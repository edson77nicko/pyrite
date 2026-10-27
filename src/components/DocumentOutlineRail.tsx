import React, { useState, useEffect, useMemo, useRef } from 'react'

export interface OutlineItem {
  id: string
  level: number // 0 for Title, 1 for H1, 2 for H2, 3 for H3, etc.
  text: string
  domIndex?: number
}

interface DocumentOutlineRailProps {
  content: string
  noteTitle: string
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

export const DocumentOutlineRail: React.FC<DocumentOutlineRailProps> = ({
  content,
  noteTitle,
  scrollContainerRef
}) => {
  const [activeIndex, setActiveIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const isUserScrollingRef = useRef(false)

  // 1. Extract Outline Items (Title + Headings or major sections)
  const items = useMemo<OutlineItem[]>(() => {
    const list: OutlineItem[] = []

    // Always include note title as the root / top item (Level 0)
    list.push({
      id: 'title',
      level: 0,
      text: noteTitle || 'Início da nota'
    })

    // Parse Markdown Headings
    const lines = content.split('\n')
    let headingCount = 0

    lines.forEach((line, lIdx) => {
      const match = line.match(/^(#{1,6})\s+(.*)$/)
      if (match) {
        const level = match[1].length
        // Strip out wikilinks, bold, markdown tags from display text
        const cleanText = match[2]
          .replace(/\[\[(.*?)\]\]/g, '$1')
          .replace(/[\*_~`#]/g, '')
          .trim()

        if (cleanText) {
          list.push({
            id: `h_${lIdx}_${headingCount}`,
            level,
            text: cleanText,
            domIndex: headingCount
          })
          headingCount++
        }
      }
    })

    // If there are no headings in a multi-paragraph note, sample non-empty paragraphs
    if (list.length === 1 && lines.length > 3) {
      let pCount = 0
      lines.forEach((line, lIdx) => {
        const trimmed = line.trim()
        if (
          trimmed &&
          !trimmed.startsWith('```') &&
          !trimmed.startsWith(':::') &&
          !trimmed.startsWith('>') &&
          trimmed.length > 8 &&
          pCount < 14
        ) {
          list.push({
            id: `p_${lIdx}`,
            level: 3,
            text: trimmed.slice(0, 48) + (trimmed.length > 48 ? '...' : ''),
            domIndex: pCount
          })
          pCount++
        }
      })
    }

    return list
  }, [content, noteTitle])

  // 2. Scroll Spy: Track current active section as user scrolls
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      if (isUserScrollingRef.current) return

      const containerRect = container.getBoundingClientRect()
      // If near top, activate Title
      if (container.scrollTop < 60) {
        setActiveIndex(0)
        return
      }

      // Query heading elements inside the container
      const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
      if (headingElements.length === 0) {
        // Sampled paragraphs / proportional calculation
        const progress = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight)
        const targetIdx = Math.min(items.length - 1, Math.floor(progress * items.length))
        setActiveIndex(targetIdx)
        return
      }

      let currentActive = 0
      headingElements.forEach((el, idx) => {
        const rect = el.getBoundingClientRect()
        // If element has reached or scrolled past the top quarter of viewport
        if (rect.top - containerRect.top <= 140) {
          currentActive = idx + 1 // +1 because item 0 is Title
        }
      })

      setActiveIndex(Math.min(items.length - 1, Math.max(0, currentActive)))
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [items, scrollContainerRef])

  // 3. Jump to section on click
  const handleJumpTo = (index: number) => {
    const container = scrollContainerRef.current
    if (!container) return

    isUserScrollingRef.current = true
    setActiveIndex(index)

    if (index === 0) {
      container.scrollTo({ top: 0, behavior: 'smooth' })
      setTimeout(() => {
        isUserScrollingRef.current = false
      }, 500)
      return
    }

    const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const targetHeading = headingElements[index - 1] as HTMLElement | undefined

    if (targetHeading) {
      const containerRect = container.getBoundingClientRect()
      const targetRect = targetHeading.getBoundingClientRect()
      const scrollOffset = targetRect.top - containerRect.top + container.scrollTop - 24

      container.scrollTo({
        top: Math.max(0, scrollOffset),
        behavior: 'smooth'
      })
    } else {
      // Proportional scroll fallback
      const progress = index / Math.max(1, items.length - 1)
      container.scrollTo({
        top: progress * (container.scrollHeight - container.clientHeight),
        behavior: 'smooth'
      })
    }

    setTimeout(() => {
      isUserScrollingRef.current = false
    }, 600)
  }

  // If only Title exists and note is empty, don't render rail
  if (items.length <= 1 && !content.trim()) {
    return null
  }

  return (
    <nav
      aria-label="Sumário da Nota"
      className="absolute right-3.5 top-1/2 -translate-y-1/2 z-30 flex flex-col items-end py-2 px-1 select-none pointer-events-auto"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <div className="flex flex-col items-end space-y-2 py-1 max-h-[75vh] overflow-y-auto no-scrollbar">
        {items.map((item, idx) => {
          const isActive = activeIndex === idx
          const isHovered = hoveredIndex === idx

          // Tick mark width depending on heading level:
          // Title / H1: 20px, H2: 15px, H3: 11px, H4+: 8px
          let tickWidth = 'w-3'
          if (item.level === 0 || item.level === 1) tickWidth = 'w-5'
          else if (item.level === 2) tickWidth = 'w-3.5'
          else if (item.level === 3) tickWidth = 'w-2.5'
          else tickWidth = 'w-2'

          // Expand active tick slightly for visual distinction
          if (isActive) {
            tickWidth = item.level <= 1 ? 'w-6' : 'w-4.5'
          }

          return (
            <div
              key={item.id}
              onClick={() => handleJumpTo(idx)}
              onMouseEnter={() => setHoveredIndex(idx)}
              className="relative flex items-center justify-end py-1 px-1 cursor-pointer group"
              title={`${item.level === 0 ? 'Título' : `H${item.level}`}: ${item.text}`}
            >
              {/* Floating Tooltip Pill to the Left (matching user reference image) */}
              {isHovered && (
                <div
                  className="absolute right-8 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-[#141417]/95 border border-zinc-700/80 shadow-2xl text-xs text-zinc-100 flex items-center gap-2 pointer-events-none whitespace-nowrap backdrop-blur-md z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  <span
                    className="text-[10px] font-mono font-semibold px-1 py-0.2 rounded bg-zinc-800 border"
                    style={{ color: 'var(--accent)', borderColor: 'var(--accent-glow)' }}
                  >
                    {item.level === 0 ? 'TÍTULO' : `H${item.level}`}
                  </span>
                  <span className="max-w-[280px] truncate font-medium text-zinc-200">
                    {item.text}
                  </span>
                </div>
              )}

              {/* The Dash / Line mark */}
              <div
                className={`editor-outline-tick h-[2px] rounded-full transition-all duration-200 ${tickWidth} ${
                  isActive
                    ? 'h-[3px] active'
                    : isHovered
                    ? 'bg-zinc-200'
                    : 'bg-zinc-700/80 group-hover:bg-zinc-400'
                }`}
                style={isActive ? { backgroundColor: 'var(--accent)', boxShadow: 'var(--accent-tick-glow, 0 0 8px var(--accent))' } : undefined}
              />
            </div>
          )
        })}
      </div>
    </nav>
  )
}
