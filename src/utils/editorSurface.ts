const ATOMIC_BLOCK = '[data-raw-code], [data-raw-table], [data-type="callout"], [data-raw-img], [data-raw-artifact], hr'

export function editorParagraph(gap = false): HTMLParagraphElement {
  const paragraph = document.createElement('p')
  paragraph.className = `editor-paragraph${gap ? ' editor-gap' : ''}`
  if (gap) paragraph.dataset.editorGap = ''
  paragraph.innerHTML = '<br>'
  return paragraph
}

export function ensureEditorLandingZones(root: HTMLElement): void {
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement) || !child.matches(ATOMIC_BLOCK)) continue
    if (!child.previousElementSibling || child.previousElementSibling.matches(ATOMIC_BLOCK)) child.before(editorParagraph(true))
    if (!child.nextElementSibling || child.nextElementSibling.matches(ATOMIC_BLOCK)) child.after(editorParagraph(true))
  }
  if (!root.lastElementChild || root.lastElementChild.tagName !== 'P') root.append(editorParagraph(true))
  for (const paragraph of Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-editor-gap]'))) {
    if (paragraph.textContent?.trim()) { delete paragraph.dataset.editorGap; paragraph.classList.remove('editor-gap') }
  }
}

export function placeEditorCaret(root: HTMLElement, element: HTMLElement, atEnd = false): void {
  root.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(!atEnd)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function exitEditorBlock(root: HTMLElement, block: HTMLElement): void {
  let paragraph = block.nextElementSibling as HTMLElement | null
  if (!paragraph || paragraph.tagName !== 'P') { paragraph = editorParagraph(true); block.after(paragraph) }
  placeEditorCaret(root, paragraph)
}

/** Insert a document-level block while preserving the content around the caret. */
export function insertEditorBlock(root: HTMLElement, html: string): HTMLElement {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : document.createRange()
  const activeBlock = document.activeElement?.closest(ATOMIC_BLOCK)
  if (activeBlock && root.contains(activeBlock)) { range.setStartAfter(activeBlock); range.collapse(true) }
  else if (!root.contains(range.startContainer)) { range.selectNodeContents(root); range.collapse(false) }
  range.deleteContents()
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const block = template.content.firstElementChild as HTMLElement
  let anchor: Node = range.startContainer
  while (anchor !== root && anchor.parentNode !== root && anchor.parentNode) anchor = anchor.parentNode
  if (anchor === root) root.insertBefore(block, root.childNodes[range.startOffset] || null)
  else if (anchor instanceof HTMLElement && anchor.matches(ATOMIC_BLOCK)) anchor.after(block)
  else {
    const tail = range.cloneRange()
    tail.setEndAfter(anchor)
    const remaining = tail.extractContents()
    if (anchor.textContent?.trim()) anchor.parentNode!.insertBefore(block, anchor.nextSibling)
    else anchor.parentNode!.replaceChild(block, anchor)
    block.after(remaining)
  }
  ensureEditorLandingZones(root)
  exitEditorBlock(root, block)
  return block
}

/** Turn a click on blank canvas into a real, editable line at that position. */
export function focusBlankEditorLine(root: HTMLElement, clientY: number): void {
  // If user has an active text selection, never clear it or insert extra lines
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed && (sel.toString().trim().length ?? 0) > 0) {
    return
  }

  const children = Array.from(root.children) as HTMLElement[]
  if (children.length === 0) {
    const p = editorParagraph()
    root.append(p)
    placeEditorCaret(root, p)
    return
  }

  // If clicking alongside an existing block/line, place caret on that block without creating a new line
  const current = children.find(child => {
    const rect = child.getBoundingClientRect()
    return clientY >= rect.top && clientY <= rect.bottom
  })
  if (current) {
    placeEditorCaret(root, current)
    return
  }

  // If clicking below all content
  const last = children.at(-1)
  const bottom = last?.getBoundingClientRect().bottom || root.getBoundingClientRect().top
  if (clientY >= bottom) {
    if (last?.tagName === 'P' && !last.textContent?.trim()) {
      placeEditorCaret(root, last)
      return
    }
    const paragraph = editorParagraph()
    root.append(paragraph)
    placeEditorCaret(root, paragraph)
    return
  }

  // If clicking in blank space above or between lines
  const next = children.find(child => child.getBoundingClientRect().top > clientY)
  if (next) {
    const paragraph = editorParagraph(true)
    next.before(paragraph)
    placeEditorCaret(root, paragraph)
    return
  }
}
