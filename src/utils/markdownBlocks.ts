export interface LiveBlock {
  id: string
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'task'
    | 'bullet'
    | 'number'
    | 'paragraph'
    | 'quote'
    | 'callout'
    | 'code'
    | 'hr'
    | 'empty'
  text: string
  checked?: boolean
  calloutType?: string
  codeLang?: string
}

/**
 * Parses a raw Markdown string into structured LiveBlocks.
 * Notice: All markdown prefixes (# , ## , - [ ], etc.) are stripped from `text`
 * so the editor surface never shows raw markdown syntax!
 */
export function parseMarkdownToBlocks(markdown: string): LiveBlock[] {
  const lines = markdown.split('\n')
  const blocks: LiveBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({
        id: `blk_code_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'code',
        text: codeLines.join('\n'),
        codeLang: lang
      })
      continue
    }

    // Callout > [!NOTE]
    if (line.trim().startsWith('> [!')) {
      const match = line.trim().match(/> \[!([A-Z]+)\]\s*(.*)/i)
      const calloutType = (match ? match[1] : 'NOTE').toUpperCase()
      const title = match && match[2] ? match[2].trim() : ''
      const calloutLines: string[] = []
      if (title) calloutLines.push(title)
      i++
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        calloutLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({
        id: `blk_callout_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'callout',
        text: calloutLines.join('\n'),
        calloutType
      })
      continue
    }

    // Blockquote >
    if (line.trim().startsWith('> ') && !line.trim().startsWith('> [!')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ') && !lines[i].trim().startsWith('> [!')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({
        id: `blk_quote_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'quote',
        text: quoteLines.join('\n')
      })
      continue
    }

    // Headings
    if (line.startsWith('# ')) {
      blocks.push({
        id: `blk_h1_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'h1',
        text: line.slice(2)
      })
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({
        id: `blk_h2_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'h2',
        text: line.slice(3)
      })
      i++
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push({
        id: `blk_h3_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'h3',
        text: line.slice(4)
      })
      i++
      continue
    }
    if (line.startsWith('#### ')) {
      blocks.push({
        id: `blk_h4_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'h4',
        text: line.slice(5)
      })
      i++
      continue
    }

    // Interactive Checklist items: - [ ] or - [x]
    const taskMatch = line.match(/^(\s*)-\s\[([ xX])\]\s(.*)$/)
    if (taskMatch) {
      blocks.push({
        id: `blk_task_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'task',
        checked: taskMatch[2].toLowerCase() === 'x',
        text: taskMatch[3]
      })
      i++
      continue
    }

    // Unordered list: - item or * item
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      blocks.push({
        id: `blk_bullet_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'bullet',
        text: line.trim().replace(/^[-*]\s/, '')
      })
      i++
      continue
    }

    // Numbered list: 1. item
    const numMatch = line.trim().match(/^(\d+)\.\s(.*)$/)
    if (numMatch) {
      blocks.push({
        id: `blk_num_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'number',
        text: numMatch[2]
      })
      i++
      continue
    }

    // Divider ---
    if (line.trim() === '---' || line.trim() === '***') {
      blocks.push({
        id: `blk_hr_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'hr',
        text: ''
      })
      i++
      continue
    }

    // Empty line
    if (!line.trim()) {
      blocks.push({
        id: `blk_empty_${i}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'empty',
        text: ''
      })
      i++
      continue
    }

    // Regular paragraph
    blocks.push({
      id: `blk_p_${i}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'paragraph',
      text: line
    })
    i++
  }

  // Ensure there is at least one block to type in
  if (blocks.length === 0) {
    blocks.push({
      id: `blk_initial_${Date.now()}`,
      type: 'paragraph',
      text: ''
    })
  }

  return blocks
}

/**
 * Converts LiveBlocks back to pristine Markdown representation
 */
export function blocksToMarkdown(blocks: LiveBlock[]): string {
  return blocks
    .map(b => {
      switch (b.type) {
        case 'h1':
          return `# ${b.text}`
        case 'h2':
          return `## ${b.text}`
        case 'h3':
          return `### ${b.text}`
        case 'h4':
          return `#### ${b.text}`
        case 'task':
          return `- [${b.checked ? 'x' : ' '}] ${b.text}`
        case 'bullet':
          return `- ${b.text}`
        case 'number':
          return `1. ${b.text}`
        case 'hr':
          return '---'
        case 'empty':
          return ''
        case 'quote':
          return b.text
            .split('\n')
            .map(l => `> ${l}`)
            .join('\n')
        case 'callout': {
          const lines = b.text.split('\n')
          const first = lines[0] || ''
          const rest = lines.slice(1)
          const restStr = rest.length > 0 ? '\n' + rest.map(l => `> ${l}`).join('\n') : ''
          return `> [!${b.calloutType || 'NOTE'}] ${first}${restStr}`
        }
        case 'code':
          return `\`\`\`${b.codeLang || ''}\n${b.text}\n\`\`\``
        case 'paragraph':
        default:
          return b.text
      }
    })
    .join('\n')
}
