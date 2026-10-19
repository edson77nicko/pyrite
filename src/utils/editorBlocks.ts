export interface CodeBlockData {
  language: string
  title: string
  content: string
}

export interface CalloutData {
  type: string
  title: string
  content: string
}

export function parseCodeInfo(info: string): Pick<CodeBlockData, 'language' | 'title'> {
  const match = info.match(/(?:^|\s)title=("(?:[^"\\]|\\.)*")\s*$/)
  if (match) {
    try { return { language: info.slice(0, match.index).trim(), title: JSON.parse(match[1]) } }
    catch { /* Keep unfamiliar fence info intact. */ }
  }
  return { language: info.trim(), title: '' }
}

export function serializeCodeBlock(block: CodeBlockData): string {
  const longestFence = Math.max(0, ...(block.content.match(/`+/g) || []).map(value => value.length))
  const fence = '`'.repeat(Math.max(3, longestFence + 1))
  const language = block.language.replace(/[\r\n`]/g, '').trim()
  const title = block.title ? `${language ? ' ' : ''}title=${JSON.stringify(block.title.replace(/[\r\n]/g, ' '))}` : ''
  return `${fence}${language}${title}\n${block.content}\n${fence}`
}

export function serializeCallout(block: CalloutData): string {
  const type = block.type.replace(/[^a-z]/gi, '').toUpperCase() || 'NOTE'
  const title = block.title.replace(/[\r\n]/g, ' ').trim()
  return `> [!${type}]${title ? ` ${title}` : ''}\n${block.content.split('\n').map(line => `> ${line}`).join('\n')}`
}
