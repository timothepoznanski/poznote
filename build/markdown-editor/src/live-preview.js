// Live rendering for the Markdown editor (discussion 1582).
//
// The document stays plain Markdown and nothing is converted: this only
// decorates the source. Syntax markers are hidden while the caret is away from
// them and come back as soon as it reaches the element (inline marks) or the
// line (headings, quotes, rules), so the source can always be edited as text.
//
// Scope is inline formatting plus line-level blocks: headings, emphasis,
// strikethrough, inline code, links, images, quotes, bullets, task boxes,
// rules, backslash escapes, ==highlight== and the two HTML tags the preview
// renders inline (<u>, <span style>). A code block keeps its source and takes
// the frame of the preview's (badge, copy button), a <details> toggle folds on
// a click on its triangle, an aligned paragraph takes its alignment. Tables and
// Mermaid diagrams are whole blocks: the preview's own parser renders them
// (renderedBlocksField below), nothing of js/markdown-parser.js is redone here.
import { syntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState, Prec, findClusterBreak, RangeSet, RangeValue, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view'

export const refreshLivePreviewEffect = StateEffect.define()

// Line numbers of a code block: shown by the code_block_line_numbers setting
// (body.code-block-line-numbers) on blocks that name a language, and switched
// block by block from the button in the block's corner, as in the preview. The
// choice is kept at the block's first character and moves with the text; like
// the preview's it lasts as long as the note stays open.
const setCodeLineNumbersEffect = StateEffect.define()

class CodeLineNumbersChoice extends RangeValue {
  constructor(on) {
    super()
    this.on = on
  }

  eq(other) {
    return other.on === this.on
  }
}

const codeLineNumbersField = StateField.define({
  create() {
    return RangeSet.empty
  },
  update(value, transaction) {
    value = value.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (effect.is(setCodeLineNumbersEffect)) {
        const { pos, on } = effect.value
        value = value.update({
          filter: from => from !== pos,
          add: [new CodeLineNumbersChoice(on).range(pos)]
        })
      }
    }
    return value
  }
})

// Toggles (<details> blocks, as the slash menu writes them): open or closed
// is read from the tag's "open" attribute, and a click on the title folds or
// unfolds the block for as long as the note stays open, without touching the
// source. Same bookkeeping as the line numbers above, at the start of the
// <details> line.
const setToggleOpenEffect = StateEffect.define()

const toggleOpenField = StateField.define({
  create() {
    return RangeSet.empty
  },
  update(value, transaction) {
    value = value.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (effect.is(setToggleOpenEffect)) {
        const { pos, on } = effect.value
        value = value.update({
          filter: from => from !== pos,
          add: [new CodeLineNumbersChoice(on).range(pos)]
        })
      }
    }
    return value
  }
})

function isToggleOpen(state, toggle) {
  let choice = null
  state.field(toggleOpenField).between(toggle.from, toggle.from, (from, to, value) => {
    if (from === toggle.from) choice = value.on
  })
  return choice !== null ? choice : toggle.openByDefault
}

// The <details> blocks of a document: where each starts, where its title
// line is, where it ends. Kept per document, like the pictures further down.
const togglesCache = new WeakMap()

function getToggles(doc) {
  let toggles = togglesCache.get(doc)
  if (toggles) return toggles

  toggles = []
  const open = []
  let inFence = false
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number)
    const text = line.text
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence
      continue
    }
    if (inFence || text.indexOf('<') === -1) continue

    const opening = /<details\b([^>]*)>/i.exec(text)
    if (opening) {
      open.push({
        from: line.from,
        firstLine: number,
        summaryLine: 0,
        lastLine: 0,
        openByDefault: /(^|\s)open(\s|=|$)/i.test(opening[1])
      })
    }
    if (open.length && !open[open.length - 1].summaryLine && /<summary\b/i.test(text)) {
      open[open.length - 1].summaryLine = number
    }
    if (/<\/details\s*>/i.test(text) && open.length) {
      const toggle = open.pop()
      toggle.lastLine = number
      if (toggle.summaryLine) toggles.push(toggle)
    }
  }

  togglesCache.set(doc, toggles)
  return toggles
}

// A line that holds one media tag (the audio player and the video the slash
// menu insert, an embedded video): the preview's parser turns it into the
// element it shows, sanitised, and that element is what the editor shows in
// place of the tag. Anything the parser refuses stays as text.
const MEDIA_LINE_REGEX = /^\s*<(iframe|audio|video)\b[^>]*>\s*<\/\1>\s*$/i
// A task list embedded from the List menu (js/tasklist-embed.js writes the
// line, and fills the block the preview's parser makes of it)
const TASKLIST_EMBED_LINE_REGEX = /^\s*<div\s+class="tasklist-embed"[^>]*>.*<\/div>\s*$/i

function renderMediaLine(text) {
  if (typeof window.parseMarkdown !== 'function') return null
  try {
    const template = document.createElement('template')
    template.innerHTML = window.parseMarkdown(text)
    return template.content.querySelector('iframe, audio, video, .tasklist-embed')
  } catch (error) {
    return null
  }
}

class MediaWidget extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }

  eq(other) {
    return other.text === this.text
  }

  toDOM(view) {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-live-media'
    wrapper.setAttribute('contenteditable', 'false')
    const media = renderMediaLine(this.text)
    if (media && media.classList.contains('tasklist-embed')) {
      wrapper.classList.add('cm-live-tasklist-embed')
      wrapper.appendChild(media)
      // Its tasks arrive later, and change its height each time one is edited
      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(() => view.requestMeasure())
        this.resizeObserver.observe(wrapper)
      }
      if (typeof window.initializeTaskListEmbeds === 'function') window.initializeTaskListEmbeds(wrapper)
    } else if (media) {
      media.addEventListener('load', () => view.requestMeasure())
      media.addEventListener('loadedmetadata', () => view.requestMeasure())
      wrapper.appendChild(media)
    } else {
      wrapper.textContent = this.text
    }
    return wrapper
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
  }

  // Clicks go to the player, not to the editor
  ignoreEvent() {
    return true
  }
}

// Math, $inline$ and $$display$$: the same spans the preview's parser writes
// (.math-inline / .math-block with data-math), drawn by the same function
// (window.renderMathInElement, js/math-renderer.js, which loads KaTeX on
// demand). That function only re-runs for the first element that asked while
// KaTeX was loading, so the load is awaited here for each formula.
function renderMath(element, done) {
  if (typeof window.renderMathInElement !== 'function') return
  const render = () => {
    window.renderMathInElement(element)
    if (done) done()
  }
  if (typeof window.katex === 'undefined' && typeof window.poznoteEnsureKatex === 'function') {
    window.poznoteEnsureKatex().then(render, () => {})
  } else {
    render()
  }
}

class MathWidget extends WidgetType {
  constructor(display, source) {
    super()
    this.display = display
    this.source = source
  }

  eq(other) {
    return other.display === this.display && other.source === this.source
  }

  toDOM(view) {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-live-math' + (this.display ? ' cm-live-math-display' : '')
    wrapper.setAttribute('contenteditable', 'false')
    const math = document.createElement('span')
    math.className = this.display ? 'math-block' : 'math-inline'
    math.setAttribute('data-math', this.source)
    wrapper.appendChild(math)
    renderMath(math, () => view.requestMeasure())
    return wrapper
  }

  ignoreEvent() {
    return false
  }
}

// The parser's own two patterns (js/markdown-parser.js)
const DISPLAY_MATH_REGEX = /(?<!\\)\$\$(.+?)(?<!\\)\$\$/g
const INLINE_MATH_REGEX = /(?<![\\$])\$(?!\$)([^\s$](?:[^$]*?[^\s$])?)\$(?!\d)/g

// A paragraph aligned from the toolbar is a line of its own,
// <p align="center">text</p> (js/markdown-parser.js reads the same shape)
const ALIGNED_LINE_REGEX = /^( {0,3}<p\s+align\s*=\s*["']?(left|center|right|justify)["']?\s*>)(.*?)(<\/p>\s*)$/i
const ALIGN_LINE_DECORATIONS = {
  left: Decoration.line({ class: 'cm-live-align-left' }),
  center: Decoration.line({ class: 'cm-live-align-center' }),
  right: Decoration.line({ class: 'cm-live-align-right' }),
  justify: Decoration.line({ class: 'cm-live-align-justify' })
}

const toggleEdgeLineDecoration = Decoration.line({ class: 'cm-live-toggle-edge' })
const toggleFoldedLineDecoration = Decoration.line({ class: 'cm-live-toggle-folded' })
const toggleHeaderOpenDecoration = Decoration.line({ class: 'cm-live-toggle-header cm-live-toggle-open' })
const toggleHeaderClosedDecoration = Decoration.line({ class: 'cm-live-toggle-header' })

// The choice made on a block is also kept in the browser, per note: closing
// the note's tab, or reloading, no longer loses it. A block is known by its
// rank among the note's code blocks (nothing is written in the source).
const CODE_LINE_NUMBERS_KEY = 'markdown_code_line_numbers'

function codeFenceStarts(doc) {
  const starts = []
  let open = null
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number)
    const fence = /^( {0,3})(`{3,}|~{3,})/.exec(line.text)
    if (!fence) continue
    if (!open) {
      open = fence[2]
      // (a Mermaid fence is a diagram, not a code block: the preview does
      // not count it either)
      if (!/^mermaid\b/i.test(line.text.slice(fence[0].length).trim())) starts.push(line.from + fence[1].length)
    } else if (fence[2].charAt(0) === open.charAt(0) && fence[2].length >= open.length && line.text.slice(fence[0].length).trim() === '') {
      open = null
    }
  }
  return starts
}

function readStoredCodeLineNumbers() {
  try {
    const storage = window.__poznoteUserStorage || window.localStorage
    const parsed = JSON.parse(storage.getItem(CODE_LINE_NUMBERS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

function noteIdOfView(view) {
  const entry = view.dom.closest ? view.dom.closest('.noteentry') : null
  const id = entry ? (entry.getAttribute('data-note-id') || String(entry.id || '').replace(/^entry/, '')) : ''
  return /^\d+$/.test(id) ? id : ''
}

function storeCodeLineNumbers(view, blockFrom, on) {
  const noteId = noteIdOfView(view)
  const rank = codeFenceStarts(view.state.doc).indexOf(blockFrom)
  if (!noteId || rank === -1) return
  try {
    const all = readStoredCodeLineNumbers()
    const note = all[noteId] && typeof all[noteId] === 'object' ? all[noteId] : {}
    note[rank] = on ? 1 : 0
    // (most recently touched note last; the oldest go past 300 notes)
    delete all[noteId]
    all[noteId] = note
    const ids = Object.keys(all)
    ids.slice(0, Math.max(0, ids.length - 300)).forEach(id => { delete all[id] })
    const storage = window.__poznoteUserStorage || window.localStorage
    storage.setItem(CODE_LINE_NUMBERS_KEY, JSON.stringify(all))
  } catch (error) {
    // (private mode, full storage: the choice then lasts as long as the note is open)
  }
}

function restoreCodeLineNumbers(view) {
  const noteId = noteIdOfView(view)
  const note = noteId ? readStoredCodeLineNumbers()[noteId] : null
  if (!note || typeof note !== 'object') return
  const starts = codeFenceStarts(view.state.doc)
  const effects = []
  Object.keys(note).forEach(rank => {
    const pos = starts[Number(rank)]
    if (pos !== undefined) effects.push(setCodeLineNumbersEffect.of({ pos, on: !!note[rank] }))
  })
  if (effects.length) view.dispatch({ effects })
}

function areCodeLineNumbersOn(state, blockFrom, language) {
  let choice = null
  state.field(codeLineNumbersField).between(blockFrom, blockFrom, (from, to, value) => {
    if (from === blockFrom) choice = value.on
  })
  if (choice !== null) return choice
  return !!language && !!document.body && document.body.classList.contains('code-block-line-numbers')
}

// Time left for a second click before the markers under the caret are revealed
const POINTER_SETTLE_DELAY = 300

const hiddenMarker = Decoration.replace({})
const squeezedMarker = Decoration.mark({ class: 'cm-live-squeezed' })
const emptyPairMarker = Decoration.mark({ class: 'cm-live-empty-pair' })
const squeezedTailMarker = Decoration.mark({ class: 'cm-live-squeezed-tail' })
const CODE_CONTEXT_NODES = ['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'HTMLBlock', 'CommentBlock', 'Comment']

const HEADING_LINE_DECORATIONS = [1, 2, 3, 4, 5, 6].map(level =>
  Decoration.line({ class: 'cm-live-heading cm-live-h' + level })
)
const quoteLineDecoration = Decoration.line({ class: 'cm-live-quote' })
const ruleLineDecoration = Decoration.line({ class: 'cm-live-hr' })
const ruleTextDecoration = Decoration.mark({ class: 'cm-live-hr-text' })
const inlineCodeDecoration = Decoration.mark({ class: 'cm-live-inline-code' })
const bulletDecoration = Decoration.mark({ class: 'cm-live-bullet' })
const listNumberDecoration = Decoration.mark({ class: 'cm-live-list-number' })
const taskBulletDecoration = Decoration.mark({ class: 'cm-live-task-bullet' })
const taskDecoration = Decoration.mark({ class: 'cm-live-task' })
const taskCheckedDecoration = Decoration.mark({ class: 'cm-live-task cm-live-task-checked' })
const taskDoneTextDecoration = Decoration.mark({ class: 'cm-live-task-done' })
const highlightDecoration = Decoration.mark({ class: 'cm-live-mark' })
const codeLineDecoration = Decoration.line({ class: 'cm-live-code' })
const codeOpenLineDecoration = Decoration.line({ class: 'cm-live-code-open' })
const codeCloseLineDecoration = Decoration.line({ class: 'cm-live-code-close' })

const underlineDecoration = Decoration.mark({ class: 'cm-live-underline' })

// Same schemes as the preview's links, plus anything relative to the app.
function isSafeUrl(url) {
  const compact = String(url || '').replace(/[\u0000- \u007f]+/g, '').toLowerCase()
  if (!compact) return false
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)
  return !scheme || ['http', 'https', 'mailto', 'tel'].includes(scheme[1])
}

function isSafeImageUrl(url) {
  const compact = String(url || '').replace(/[\u0000- \u007f]+/g, '').toLowerCase()
  return isSafeUrl(url) || compact.startsWith('data:image/') || compact.startsWith('blob:')
}

// Only the declarations the toolbar writes are replayed, so a pasted span
// cannot restyle the editor (position, url(), ...).
const SPAN_STYLE_PROPERTIES = ['color', 'background-color', 'background', 'font-size', 'font-weight', 'font-style', 'text-decoration']

function sanitizeSpanStyle(style) {
  return String(style || '').split(';').map(declaration => {
    const separator = declaration.indexOf(':')
    if (separator === -1) return ''
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (!SPAN_STYLE_PROPERTIES.includes(property)) return ''
    if (!/^[#\w\s(),.%-]+$/.test(value) || /url|expression/i.test(value)) return ''
    return property + ':' + value
  }).filter(Boolean).join(';')
}

// A quote that opens on a callout header ("[!TIP]", or a bare "Tip", as
// js/markdown-parser.js reads them) takes the callout's colour, icon and
// title instead of the grey of a plain quote. The header is parsed by the
// preview's own function, so both always agree on what a callout is.
const KNOWN_CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution']

function parseCalloutHeader(text) {
  if (typeof window._mdParseCalloutHeader !== 'function') return null
  try {
    return window._mdParseCalloutHeader(text)
  } catch (error) {
    return null
  }
}

function getCalloutTitle(type) {
  const fallback = type.charAt(0).toUpperCase() + type.slice(1)
  return typeof window.t === 'function' ? window.t('slash_menu.callout_' + type, null, fallback) : fallback
}

// The icon, and the title too when the source only names the type
class CalloutTitleWidget extends WidgetType {
  constructor(type, title) {
    super()
    this.type = type
    this.title = title
  }

  eq(other) {
    return other.type === this.type && other.title === this.title
  }

  toDOM() {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-live-callout-title'
    if (typeof window._mdGetCalloutIconSvg === 'function') {
      const icon = document.createElement('span')
      icon.className = 'cm-live-callout-icon'
      // One of the parser's own constant SVG strings
      icon.innerHTML = window._mdGetCalloutIconSvg(this.type)
      wrapper.appendChild(icon)
    }
    if (this.title) wrapper.appendChild(document.createTextNode(this.title))
    return wrapper
  }

  ignoreEvent() {
    return false
  }
}

const calloutTitleDecoration = Decoration.mark({ class: 'cm-live-callout-title' })

// A fenced code block keeps its source and takes the frame of the preview's:
// the opening fence gives way to the language badge, the closing one to an
// empty line, both back as text once the caret is in the block.
class CodeLanguageWidget extends WidgetType {
  constructor(language) {
    super()
    this.language = language
  }

  eq(other) {
    return other.language === this.language
  }

  toDOM() {
    const badge = document.createElement('span')
    badge.className = 'cm-live-code-lang'
    badge.textContent = this.language || 'code'
    return badge
  }

  ignoreEvent() {
    return false
  }
}

// The buttons in the corner of a block: line numbers, copy, delete
class CodeActionsWidget extends WidgetType {
  constructor(numbered) {
    super()
    this.numbered = numbered
  }

  eq(other) {
    return other.numbered === this.numbered
  }

  toDOM() {
    const actions = document.createElement('span')
    actions.className = 'cm-live-code-actions'

    const translate = (key, fallback) => typeof window.t === 'function' ? window.t(key, null, fallback) : fallback
    const icons = window.poznoteCodeBlockLineNumberIcons
    const lines = document.createElement('button')
    const linesLabel = this.numbered
      ? translate('editor.code_block_line_numbers.hide', 'Hide line numbers')
      : translate('editor.code_block_line_numbers.show', 'Show line numbers')
    lines.type = 'button'
    lines.className = 'cm-live-code-lines'
    lines.tabIndex = -1
    lines.title = linesLabel
    lines.setAttribute('aria-label', linesLabel)
    lines.setAttribute('aria-pressed', this.numbered ? 'true' : 'false')
    if (icons) {
      lines.innerHTML = this.numbered ? icons.on : icons.off
    } else {
      const fallbackIcon = document.createElement('i')
      fallbackIcon.className = 'lucide lucide-list-ordered'
      lines.appendChild(fallbackIcon)
    }
    actions.appendChild(lines)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-live-code-copy'
    button.setAttribute('aria-label', 'Copy code to clipboard')
    button.title = 'Copy code'
    button.tabIndex = -1
    const icon = document.createElement('i')
    icon.className = 'lucide lucide-copy'
    button.appendChild(icon)
    actions.appendChild(button)

    // Then the bin, as on the code blocks of an HTML note (Ctrl+Z brings the
    // block back)
    const remove = document.createElement('button')
    const removeLabel = translate('editor.code_block_delete.title', 'Delete code block')
    remove.type = 'button'
    remove.className = 'cm-live-code-delete'
    remove.tabIndex = -1
    remove.title = removeLabel
    remove.setAttribute('aria-label', removeLabel)
    if (window.poznoteCodeBlockDeleteIcon) {
      remove.innerHTML = window.poznoteCodeBlockDeleteIcon
    } else {
      const removeIcon = document.createElement('i')
      removeIcon.className = 'lucide lucide-trash-2'
      remove.appendChild(removeIcon)
    }
    actions.appendChild(remove)

    return actions
  }

  // The plugin's own mousedown handler does the copying
  ignoreEvent() {
    return false
  }
}

function findFencedCodeAt(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === 'FencedCode') return node
  }
  return null
}

// The pictures of the note as the preview lists them (js/markdown-source.js):
// index, place in the source, border and width. Kept per document, which the
// editor replaces on every change.
const renderedImagesCache = new WeakMap()

function getRenderedImages(doc) {
  if (typeof window._mdListRenderedMarkdownImages !== 'function') return null
  let images = renderedImagesCache.get(doc)
  if (!images) {
    images = new Map()
    try {
      window._mdListRenderedMarkdownImages(doc.toString()).forEach(image => images.set(image.from, image))
    } catch (error) {
      images = new Map()
    }
    renderedImagesCache.set(doc, images)
  }
  return images
}

// `source` is the picture as the preview knows it, when it does: the widget
// then carries the same data-markdown-image-index, border class and width, and
// the image menu (js/note-image-menu.js) resizes, borders and deletes it
// through the source as it does in the preview.
class ImageWidget extends WidgetType {
  constructor(src, alt, source) {
    super()
    this.src = src
    this.alt = alt
    this.source = source || null
  }

  eq(other) {
    const a = this.source
    const b = other.source
    return other.src === this.src && other.alt === this.alt && !!a === !!b &&
      (!a || (a.index === b.index && a.borderClass === b.borderClass && a.width === b.width && a.title === b.title))
  }

  toDOM(view) {
    // A wrapper of its own: the resize handle is added next to the picture,
    // which must not happen among the children of an editor line
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-live-image-wrap'
    wrapper.setAttribute('contenteditable', 'false')

    const image = document.createElement('img')
    image.className = 'cm-live-image'
    image.alt = this.alt
    image.title = (this.source && this.source.title) || this.alt
    image.draggable = false
    if (this.source) {
      image.setAttribute('data-markdown-image-index', String(this.source.index))
      if (this.source.borderClass) image.classList.add(this.source.borderClass)
      if (this.source.width) {
        image.setAttribute('width', String(this.source.width))
        image.style.width = this.source.width + 'px'
      }
    }
    // The line grows once the picture is in: let the editor measure it again.
    image.addEventListener('load', () => view.requestMeasure())
    image.addEventListener('error', () => view.requestMeasure())
    image.src = this.src
    wrapper.appendChild(image)
    return wrapper
  }

  ignoreEvent() {
    return false
  }
}

function buildLivePreviewDecorations(view, armedPair, pendingFormat) {
  const { state } = view
  const doc = state.doc
  const selection = state.selection.ranges
  const tree = syntaxTree(state)
  const decorations = []
  const indentedListLines = new Set()

  // Nothing is revealed while the editor is not the one being typed in
  const focused = view.hasFocus
  // The two live views of the note's view button (js/markdown-view-modes.js),
  // told apart by <body data-markdown-live-syntax>, the account's
  // markdown_live_show_syntax setting. "Live preview" ('1'): the syntax comes
  // back under the caret. "Rich text" ('0'): it never does, and what is
  // written is formatted from the toolbar, the shortcuts and the menus. A formula has no other way of being edited
  // than its source, so it keeps coming back either way (touchesContent).
  const revealSyntax = !!document.body && document.body.getAttribute('data-markdown-live-syntax') === '1'
  const touchesContent = (from, to) => focused && selection.some(range => range.from <= to && range.to >= from)
  const touches = (from, to) => revealSyntax && touchesContent(from, to)
  const touchesLines = (from, to) => touches(doc.lineAt(from).from, doc.lineAt(to).to)
  // Rich text: the empty pair of markers a formatting command just wrote
  // around the caret, see findEmptyMarkerPair()
  const emptyPair = revealSyntax ? null : (armedPair || null)
  const holdsEmptyPair = node => !!emptyPair && doc.lineAt(node.from).number <= emptyPair.line && doc.lineAt(node.to).number >= emptyPair.line
  // Syntax that comes back under the caret is taken out of the line (a
  // replace decoration). Syntax that never comes back stays in the line,
  // squeezed to nothing by CSS: Firefox cannot hold a caret next to an
  // uneditable inline element, and the arrow keys stuck in front of a bold
  // word when the markers were replaced.
  // atomicTo widens what the caret steps over as one piece beyond what is
  // hidden: an escaped character goes with its backslash, or the caret could
  // stop between the two and typing there would split the pair.
  const neverShown = []
  const hide = (from, to, atomicTo) => {
    if (to <= from) return
    if (revealSyntax) {
      decorations.push(hiddenMarker.range(from, to))
    } else {
      // A marker that ends its line (the closing ` of inline code, ** of bold
      // typed last) keeps a place in the layout, at a size of nothing: taken
      // out of it, the browser had no "after the marker" left to put the
      // caret in, and there was no way to type past the end of the code
      const marker = to === doc.lineAt(to).to ? squeezedTailMarker : squeezedMarker
      decorations.push(marker.range(from, to))
      neverShown.push(squeezedMarker.range(from, Math.max(to, atomicTo || 0)))
    }
  }
  const skipSpaces = pos => {
    while (pos < doc.length && /[ \t]/.test(doc.sliceString(pos, pos + 1))) pos++
    return pos
  }
  const isInsideCode = pos => {
    for (let node = tree.resolveInner(pos, 1); node; node = node.parent) {
      if (CODE_CONTEXT_NODES.includes(node.name)) return true
    }
    return false
  }

  // Narrower than isInsideCode(): the grammar reads a line of HTML as an HTML
  // block, which is exactly what an aligned paragraph is
  const isInsideCodeBlock = pos => {
    for (let node = tree.resolveInner(pos, 1); node; node = node.parent) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true
    }
    return false
  }

  function decorateHeading(node, level) {
    const lastLine = doc.lineAt(node.to)
    const setext = node.name.startsWith('Setext')
    for (let line = doc.lineAt(node.from); ; line = doc.line(line.number + 1)) {
      // The === / --- line under a Setext heading keeps the text size
      if (!(setext && line.number === lastLine.number && line.from > node.from)) {
        decorations.push(HEADING_LINE_DECORATIONS[level - 1].range(line.from))
      }
      if (line.number >= lastLine.number) break
    }

    // Rich text: a heading just inserted from a menu is a line with nothing
    // to see on it, its "## " being hidden. A placeholder at the heading's
    // size says where the title goes, until the first character is typed.
    if (!revealSyntax && !setext && !/[^#\s]/.test(doc.sliceString(node.from, node.to))) {
      const fallback = 'Heading ' + level
      const label = typeof window.t === 'function' ? window.t('slash_menu.heading_' + level, null, fallback) : fallback
      decorations.push(Decoration.line({
        class: 'cm-live-heading-empty',
        attributes: { 'data-placeholder': label }
      }).range(doc.lineAt(node.from).from))
    }
  }

  function decorateLink(node) {
    const marks = node.node.getChildren('LinkMark')
    const url = node.node.getChild('URL')
    if (marks.length < 4 || !url) return
    const textFrom = marks[0].to
    const textTo = marks[1].from
    if (textTo <= textFrom || !doc.sliceString(textFrom, textTo).trim()) return

    const href = doc.sliceString(url.from, url.to)
    decorations.push(Decoration.mark({
      class: 'cm-live-link',
      attributes: isSafeUrl(href) ? { 'data-live-href': href } : {}
    }).range(textFrom, textTo))

    if (!touches(node.from, node.to)) {
      hide(marks[0].from, marks[0].to)
      hide(marks[1].from, node.to)
    }
  }

  // Returns true when the image was swapped for the picture.
  function decorateImage(node) {
    const url = node.node.getChild('URL')
    if (!url) return false
    const src = doc.sliceString(url.from, url.to)
    if (!isSafeImageUrl(src)) return false

    // As the preview lists it: with its {width=... .img-with-border} block,
    // which is part of the picture and goes with it
    const images = getRenderedImages(doc)
    const source = images ? images.get(node.from) : null
    const to = source ? Math.max(source.to, node.to) : node.to
    if (touches(node.from, to)) return false

    const marks = node.node.getChildren('LinkMark')
    const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : ''
    decorations.push(Decoration.replace({ widget: new ImageWidget(src, alt, source) }).range(node.from, to))
    return true
  }

  // <u>, <span style> and ==highlight== are not part of the Markdown grammar:
  // they are paired here, one line at a time. Other tags stay as text, which
  // is also how the preview shows them.
  function decorateInlineHtml(line) {
    const text = line.text
    if (text.indexOf('<') === -1 && text.indexOf('==') === -1) return

    if (text.indexOf('<') !== -1) {
      const tagRegex = /<(\/?)(u|span)\b([^<>]*)>/gi
      const open = []
      let match
      while ((match = tagRegex.exec(text))) {
        const from = line.from + match.index
        const to = from + match[0].length
        const name = match[2].toLowerCase()
        if (isInsideCode(from)) continue

        if (!match[1]) {
          open.push({ name, from, to, attrs: match[3] })
          continue
        }

        let index = open.length - 1
        while (index >= 0 && open[index].name !== name) index--
        if (index < 0) continue
        const opening = open[index]
        open.length = index

        let decoration = null
        if (name === 'span') {
          const styleMatch = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(opening.attrs)
          const style = styleMatch ? sanitizeSpanStyle(styleMatch[2]) : ''
          if (!style) continue
          decoration = Decoration.mark({ attributes: { style } })
        } else {
          decoration = underlineDecoration
        }

        if (from > opening.to) decorations.push(decoration.range(opening.to, from))
        // An empty pair just written around the caret is handled as one, below
        if (emptyPair && opening.from === emptyPair.from) continue
        if (!touches(opening.from, to)) {
          hide(opening.from, opening.to)
          hide(from, to)
        }
      }
    }

    if (text.indexOf('==') !== -1) {
      const highlightRegex = /==(?=\S)([^\n]*?\S)==/g
      let match
      while ((match = highlightRegex.exec(text))) {
        const from = line.from + match.index
        const to = from + match[0].length
        if (isInsideCode(from)) continue
        decorations.push(highlightDecoration.range(from + 2, to - 2))
        if (!touches(from, to)) {
          hide(from, from + 2)
          hide(to - 2, to)
        }
      }
    }
  }

  function decorateFencedCode(node) {
    const firstLine = doc.lineAt(node.from)
    const lastLine = doc.lineAt(node.to)
    if (lastLine.number === firstLine.number) return

    const marks = node.node.getChildren('CodeMark')
    const closing = marks.length > 1 ? marks[marks.length - 1] : null
    const closed = !!closing && closing.from >= lastLine.from
    const info = node.node.getChild('CodeInfo')
    const language = info ? doc.sliceString(info.from, info.to).trim().split(/\s+/)[0] : ''

    const numbered = areCodeLineNumbersOn(state, node.from, language)
    const lastCodeLine = closed ? lastLine.number - 1 : lastLine.number
    const digits = String(Math.max(1, lastCodeLine - firstLine.number)).length

    for (let line = firstLine; ; line = doc.line(line.number + 1)) {
      decorations.push(codeLineDecoration.range(line.from))
      if (numbered && line.number > firstLine.number && line.number <= lastCodeLine) {
        decorations.push(Decoration.line({
          class: 'cm-live-code-numbered',
          attributes: {
            'data-code-line': String(line.number - firstLine.number),
            style: '--cm-live-code-digits:' + digits + 'ch'
          }
        }).range(line.from))
      }
      if (line.number >= lastLine.number) break
    }
    decorations.push(codeOpenLineDecoration.range(firstLine.from))
    decorations.push(codeCloseLineDecoration.range(lastLine.from))
    decorations.push(Decoration.widget({ widget: new CodeActionsWidget(numbered), side: 1 }).range(firstLine.to))

    if (touchesLines(node.from, node.to)) return
    if (firstLine.to > node.from) {
      decorations.push(Decoration.replace({ widget: new CodeLanguageWidget(language) }).range(node.from, firstLine.to))
    }
    if (closed) hide(closing.from, lastLine.to)
  }

  // Returns true when the quote is a callout, which then gets its own look
  function decorateCallout(node) {
    const parent = node.node.parent
    if (parent && parent.name === 'Blockquote') return false

    const firstLine = doc.lineAt(node.from)
    const prefix = /^\s*>\s?/.exec(firstLine.text)
    if (!prefix) return false
    const content = firstLine.text.slice(prefix[0].length)
    const callout = parseCalloutHeader(content)
    if (!callout) return false

    const typeClass = KNOWN_CALLOUT_TYPES.includes(callout.type) ? ' cm-live-callout-' + callout.type : ''
    const lineDecoration = Decoration.line({ class: 'cm-live-callout' + typeClass })
    const lastLine = doc.lineAt(node.to)
    for (let line = firstLine; ; line = doc.line(line.number + 1)) {
      decorations.push(lineDecoration.range(line.from))
      if (line.number >= lastLine.number) break
    }

    const contentFrom = firstLine.from + prefix[0].length
    const bracket = /^\s*\[![A-Za-z][A-Za-z0-9_-]*\][+-]?[ \t]*/.exec(content)
    if (bracket) {
      const bracketTo = contentFrom + bracket[0].length
      // A title of its own follows the marker: it stays as text, in the colour
      if (callout.customTitle && firstLine.to > bracketTo) {
        decorations.push(calloutTitleDecoration.range(bracketTo, firstLine.to))
      }
      if (!touchesLines(firstLine.from, firstLine.to)) {
        decorations.push(Decoration.replace({
          widget: new CalloutTitleWidget(callout.type, callout.customTitle ? '' : getCalloutTitle(callout.type))
        }).range(contentFrom, bracketTo))
      }
      return true
    }

    // "Tip", "**Tip**", "Tip: text": the word is the title, the icon goes ahead
    const word = /^(\s*)((?:\*\*|__)?(?:Note|Tip|Important|Warning|Caution)(?:\*\*|__)?)/i.exec(content)
    if (word) {
      const wordFrom = contentFrom + word[1].length
      decorations.push(Decoration.widget({ widget: new CalloutTitleWidget(callout.type, ''), side: -1 }).range(wordFrom))
      decorations.push(calloutTitleDecoration.range(wordFrom, wordFrom + word[2].length))
    }
    return true
  }

  // <details> blocks: the tags give way to a title with its triangle, and a
  // folded block hides its body. Everything comes back as text while the
  // caret is in the block, which is also how a folded one is edited.
  function decorateToggles(visibleFrom, visibleTo) {
    getToggles(doc).forEach(toggle => {
      const first = doc.line(toggle.firstLine)
      const last = doc.line(toggle.lastLine)
      if (last.to < visibleFrom || first.from > visibleTo) return
      if (touches(first.from, last.to)) return

      const isOpen = isToggleOpen(state, toggle)
      for (let number = toggle.firstLine; number <= toggle.lastLine; number++) {
        const line = doc.line(number)
        if (line.to < visibleFrom || line.from > visibleTo) continue
        if (decoratedToggleLines.has(number)) continue
        decoratedToggleLines.add(number)

        const text = line.text
        const tagRegex = /<\/?(?:details|summary)\b[^>]*>/gi
        let rest = text
        let match
        while ((match = tagRegex.exec(text))) {
          hide(line.from + match.index, line.from + match.index + match[0].length)
          rest = rest.replace(match[0], '')
        }

        if (number === toggle.summaryLine) {
          decorations.push((isOpen ? toggleHeaderOpenDecoration : toggleHeaderClosedDecoration).range(line.from))
        } else if (!rest.trim() && (number === toggle.firstLine || number === toggle.lastLine)) {
          // Nothing left on the line of <details> or </details>
          decorations.push(toggleEdgeLineDecoration.range(line.from))
        } else if (!isOpen && number > toggle.summaryLine) {
          decorations.push(toggleFoldedLineDecoration.range(line.from))
        }
      }
    })
  }

  // <p align="...">text</p>: the line takes the alignment, and the tags
  // step aside until the caret comes to the line
  function decorateAlignment(line) {
    if (line.text.indexOf('align') === -1) return
    const match = ALIGNED_LINE_REGEX.exec(line.text)
    if (!match || isInsideCodeBlock(line.from)) return

    decorations.push(ALIGN_LINE_DECORATIONS[match[2].toLowerCase()].range(line.from))
    if (touchesLines(line.from, line.to)) return
    // Rich text, a line just aligned with nothing on it yet: its two tags are
    // all it holds. Like an empty pair of markers they keep a place in the
    // layout, with a strut between them for the caret to be drawn against.
    if (!revealSyntax && !match[3]) {
      const middle = line.from + match[1].length
      decorations.push(emptyPairMarker.range(line.from, middle))
      decorations.push(Decoration.widget({ widget: new EmptyPairWidget('align', ''), side: 1 }).range(middle))
      if (line.to > middle) decorations.push(emptyPairMarker.range(middle, line.to))
      neverShown.push(squeezedMarker.range(line.from, middle))
      if (line.to > middle) neverShown.push(squeezedMarker.range(middle, line.to))
      return
    }
    hide(line.from, line.from + match[1].length)
    hide(line.to - match[4].length, line.to)
  }

  function decorateMedia(line) {
    if (line.text.indexOf('<') === -1) return
    if (!MEDIA_LINE_REGEX.test(line.text) && !TASKLIST_EMBED_LINE_REGEX.test(line.text)) return
    if (isInsideCodeBlock(line.from) || touchesLines(line.from, line.to)) return
    if (!renderMediaLine(line.text)) return
    decorations.push(Decoration.replace({ widget: new MediaWidget(line.text) }).range(line.from, line.to))
  }

  // $...$ and a $$...$$ that fits on one line; a display formula spread over
  // several lines is a block (renderedBlocksField)
  function decorateMath(line) {
    const text = line.text
    if (text.indexOf('$') === -1) return
    const taken = []

    const collect = (regex, display) => {
      regex.lastIndex = 0
      let match
      while ((match = regex.exec(text))) {
        const from = line.from + match.index
        const to = from + match[0].length
        if (taken.some(range => from < range.to && to > range.from)) continue
        if (isInsideCode(from)) continue
        taken.push({ from, to })
        if (touchesContent(from, to)) continue
        decorations.push(Decoration.replace({ widget: new MathWidget(display, match[1].trim()) }).range(from, to))
      }
    }

    collect(DISPLAY_MATH_REGEX, true)
    collect(INLINE_MATH_REGEX, false)
  }

  // A bare address in the text, and one between angle brackets: links, as
  // the preview makes of them (linkifyPlainUrls in js/markdown-parser.js, the
  // same rule: after a space or a bracket, without the punctuation that ends
  // the sentence). The address stays as it is written; it is followed on a
  // click like any other link.
  function decorateBareUrls(line) {
    const text = line.text
    if (text.indexOf('http') === -1) return
    const urlRegex = /(^|[\s(])((?:https?:\/\/)[^\s<]+)/g
    let match
    while ((match = urlRegex.exec(text))) {
      let url = match[2]
      while (/[),.;!?*_~]$/.test(url)) url = url.slice(0, -1)
      if (!url) continue
      const from = line.from + match.index + match[1].length
      const to = from + url.length
      if (isInsideCode(from)) continue
      let inLink = false
      for (let node = tree.resolveInner(from, 1); node; node = node.parent) {
        if (node.name === 'Link' || node.name === 'Image' || node.name === 'Autolink' || node.name === 'HTMLTag') inLink = true
      }
      if (inLink || !isSafeUrl(url)) continue
      decorations.push(Decoration.mark({ class: 'cm-live-link', attributes: { 'data-live-href': url } }).range(from, to))
    }
  }

  const decoratedToggleLines = new Set()
  let lastHtmlLine = -1

  for (const visible of view.visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        const name = node.name

        const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(name)
        if (heading) {
          // "====" being typed under a paragraph is not its underline yet
          if (name.startsWith('Setext') && emptyPair && doc.lineAt(node.to).number === emptyPair.line) return
          decorateHeading(node, Number(heading[1]))
          return
        }

        switch (name) {
          case 'HeaderMark': {
            const parent = node.node.parent
            if (!parent || !parent.name.startsWith('ATXHeading') || touchesLines(parent.from, parent.to)) return
            if (node.from === parent.from) {
              hide(node.from, Math.min(skipSpaces(node.to), parent.to))
            } else {
              hide(node.from, node.to)
            }
            return
          }

          case 'EmphasisMark':
          case 'StrikethroughMark': {
            const parent = node.node.parent
            if (parent && !touches(parent.from, parent.to)) hide(node.from, node.to)
            return
          }

          case 'InlineCode': {
            const marks = node.node.getChildren('CodeMark')
            if (marks.length < 2) return
            const from = marks[0].to
            const to = marks[marks.length - 1].from
            if (to <= from) return
            decorations.push(inlineCodeDecoration.range(from, to))
            if (!touches(node.from, node.to)) {
              hide(marks[0].from, marks[0].to)
              hide(marks[marks.length - 1].from, marks[marks.length - 1].to)
            }
            return false
          }

          case 'Link':
            decorateLink(node)
            return

          // <https://example.com>
          case 'Autolink': {
            const address = node.node.getChild('URL')
            if (!address) return
            const href = doc.sliceString(address.from, address.to)
            if (!isSafeUrl(href)) return
            decorations.push(Decoration.mark({ class: 'cm-live-link', attributes: { 'data-live-href': href } }).range(address.from, address.to))
            if (!touches(node.from, node.to)) {
              hide(node.from, address.from)
              hide(address.to, node.to)
            }
            return false
          }

          case 'Image':
            if (decorateImage(node)) return false
            return

          case 'Blockquote': {
            if (decorateCallout(node)) return
            const lastLine = doc.lineAt(node.to)
            for (let line = doc.lineAt(node.from); ; line = doc.line(line.number + 1)) {
              decorations.push(quoteLineDecoration.range(line.from))
              if (line.number >= lastLine.number) break
            }
            return
          }

          case 'QuoteMark': {
            if (touchesLines(node.from, node.to)) return
            const next = doc.sliceString(node.to, node.to + 1)
            const markEnd = next === ' ' ? node.to + 1 : node.to
            hide(node.from, markEnd)
            // Rich text, a quote line with nothing on it yet (the body of a
            // quote or of a callout just inserted): its hidden "> " is text
            // of no size, and the caret drawn against it had no height, so
            // the quote looked as if the caret was not in it. A strut of the
            // line's height gives it one.
            if (!revealSyntax && markEnd === doc.lineAt(node.from).to) {
              decorations.push(Decoration.widget({ widget: new EmptyPairWidget('quote', ''), side: 1 }).range(markEnd))
            }
            return
          }

          case 'ListMark': {
            const item = node.node.parent
            const list = item && item.parent
            // Rich text: a bullet or a number is one piece with the space
            // after it. The caret does not stop inside it, and Backspace at
            // the start of the item's text takes the whole marker away
            // instead of the space alone (which left "-text").
            if (!revealSyntax && list && doc.lineAt(node.from).to > node.to) {
              neverShown.push(squeezedMarker.range(node.from, skipSpaces(node.to)))
            }
            // Set in from the margin like the lists of the preview and of an
            // HTML note, each level 24px further (the source indents a
            // level by two or three spaces only)
            if (list) {
              let depth = 0
              for (let parent = list.parent; parent; parent = parent.parent) {
                if (parent.name === 'BulletList' || parent.name === 'OrderedList') depth++
              }
              const lineFrom = doc.lineAt(node.from).from
              if (!indentedListLines.has(lineFrom)) {
                indentedListLines.add(lineFrom)
                // (the base depends on how wide the marker itself is; items
                // are spaced as the <li> of the preview are)
                const base = list.name === 'OrderedList' ? 13 : (item.getChild('Task') ? 22 : 19)
                decorations.push(Decoration.line({
                  attributes: { style: 'margin-left:' + (base + depth * 16) + 'px;padding-top:3px;padding-bottom:3px' }
                }).range(lineFrom))
              }
              if (list.name === 'OrderedList') decorations.push(listNumberDecoration.range(node.from, node.to))
            }
            if (!list || list.name !== 'BulletList') return
            const isTask = !!item.getChild('Task')
            decorations.push((isTask ? taskBulletDecoration : bulletDecoration).range(node.from, node.to))
            return
          }

          case 'TaskMarker': {
            const checked = /x/i.test(doc.sliceString(node.from, node.to))
            decorations.push((checked ? taskCheckedDecoration : taskDecoration).range(node.from, node.to))
            if (!revealSyntax && doc.lineAt(node.from).to > node.to) {
              neverShown.push(squeezedMarker.range(node.from, skipSpaces(node.to)))
            }
            // A ticked task reads struck through, as in the preview
            const lineEnd = doc.lineAt(node.to).to
            const textFrom = skipSpaces(node.to)
            if (checked && lineEnd > textFrom) {
              decorations.push(taskDoneTextDecoration.range(textFrom, lineEnd))
            }
            return
          }

          case 'HorizontalRule': {
            if (touchesLines(node.from, node.to) || holdsEmptyPair(node)) return
            decorations.push(ruleLineDecoration.range(doc.lineAt(node.from).from))
            decorations.push(ruleTextDecoration.range(node.from, node.to))
            return
          }

          case 'Escape':
            if (!touches(node.from, node.to)) hide(node.from, node.from + 1, node.to)
            return

          case 'FencedCode':
            // "~~~~" being typed is not a code block yet
            if (emptyPair && doc.lineAt(node.from).number === emptyPair.line) return false
            // A Mermaid block is drawn as its diagram while the caret is away
            // (renderedBlocksField); its source needs no frame of its own then
            decorateFencedCode(node)
            return false

          case 'CodeBlock':
          case 'HTMLBlock':
          case 'Table':
            return false
        }
      }
    })

    decorateToggles(visible.from, visible.to)

    for (let pos = visible.from; pos <= visible.to;) {
      const line = doc.lineAt(pos)
      if (line.number > lastHtmlLine) {
        decorateAlignment(line)
        decorateMedia(line)
        decorateMath(line)
        decorateInlineHtml(line)
        decorateBareUrls(line)
        lastHtmlLine = line.number
      }
      pos = line.to + 1
    }
  }

  // The empty pair itself: out of sight, the caret staying in its middle.
  // Not taken out of the layout like the rest of the hidden syntax: a line
  // holding nothing else would then have no place for a caret at all, and the
  // browser sent what was typed to the line above. Text of no size keeps one.
  if (emptyPair) {
    decorations.push(emptyPairMarker.range(emptyPair.from, emptyPair.pos))
    decorations.push(Decoration.widget({ widget: new EmptyPairWidget(emptyPair.marker, emptyPair.style), side: 1 }).range(emptyPair.pos))
    decorations.push(emptyPairMarker.range(emptyPair.pos, emptyPair.hideTo || emptyPair.to))
    // Standing against the closing markers of a bold word, the empty pair
    // keeps Markdown from reading the word as bold at all: its opening
    // markers are hidden here and the word drawn as it will be again once a
    // character is typed
    if (emptyPair.nested && !isPairMark(tree.resolveInner(emptyPair.outerFrom, 1))) {
      hide(emptyPair.outerFrom, emptyPair.outerTo)
      const width = emptyPair.outerTo - emptyPair.outerFrom
      const classes = '*_'.indexOf(emptyPair.marker) === -1 ? ''
        : (width >= 2 ? 'poznote-cm-strong' : '') + (width !== 2 ? ' poznote-cm-emphasis' : '')
      if (classes.trim() && emptyPair.from > emptyPair.outerTo) {
        decorations.push(Decoration.mark({ class: classes.trim() }).range(emptyPair.outerTo, emptyPair.from))
      }
    }
  }

  // A format waiting for its first character: the same strut, nothing hidden
  if (pendingFormat && !revealSyntax && pendingFormat.pos <= doc.length) {
    decorations.push(Decoration.widget({ widget: new EmptyPairWidget(pendingFormat.prefix.charAt(0), ''), side: 1 }).range(pendingFormat.pos))
  }

  // With the syntax never shown, the hidden text must not be a place the
  // caret can stop in or a character Backspace can take alone: each hidden
  // stretch is crossed, and deleted, as one piece.
  // (not a formula: its source is edited in place, the caret has to get in)
  const hidden = revealSyntax ? [] : neverShown.concat(decorations.filter(range =>
    range.to > range.from && range.value.point && !(range.value.widget instanceof MathWidget)
  ))

  return {
    decorations: Decoration.set(decorations, true),
    atomic: Decoration.set(hidden, true)
  }
}

// Tables, Mermaid diagrams and display formulas over several lines: whole
// blocks, shown as the preview shows them.
// The block's own source goes through the preview's parser
// (window.parseMarkdown, js/markdown-parser.js) and the result stands in for
// its lines until the caret enters the block, which brings the source back to
// edit. Nothing of the rendering is redone here.
//
// A widget over several lines has to come from a state field, not from the
// view plugin above, hence this second source of decorations. It knows the
// selection but not whether the editor has the focus.
const renderedBlocksCache = new WeakMap()

function getRenderedBlocks(doc) {
  let blocks = renderedBlocksCache.get(doc)
  if (blocks) return blocks

  blocks = []
  const isTableStart = typeof window.isMarkdownTableStart === 'function' ? window.isMarkdownTableStart : null
  const isTableRow = typeof window.isMarkdownTableRowLine === 'function' ? window.isMarkdownTableRowLine : null
  let fence = null

  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number)
    const text = line.text
    const fenceMatch = /^\s*(```+|~~~+)\s*([^\s`]*)/.exec(text)

    if (fence) {
      if (fenceMatch && fenceMatch[1].charAt(0) === fence.marker && !fenceMatch[2]) {
        if (fence.mermaid) blocks.push({ kind: 'mermaid', from: fence.from, to: line.to })
        fence = null
      }
      continue
    }
    if (fenceMatch) {
      fence = { marker: fenceMatch[1].charAt(0), from: line.from, mermaid: fenceMatch[2].toLowerCase() === 'mermaid' }
      continue
    }

    // A display formula over several lines: $$ alone, the formula, $$ alone
    if (text.trim() === '$$') {
      let closing = number + 1
      while (closing <= doc.lines && doc.line(closing).text.trim() !== '$$') closing++
      if (closing <= doc.lines) {
        blocks.push({ kind: 'math', from: line.from, to: doc.line(closing).to })
        number = closing
        continue
      }
    }

    if (isTableStart && isTableRow && text.indexOf('|') !== -1 && number < doc.lines &&
        isTableStart(text, doc.line(number + 1).text)) {
      let last = number + 1
      while (last < doc.lines && isTableRow(doc.line(last + 1).text)) last++
      blocks.push({ kind: 'table', from: line.from, to: doc.line(last).to })
      number = last
    }
  }

  renderedBlocksCache.set(doc, blocks)
  return blocks
}

class RenderedBlockWidget extends WidgetType {
  constructor(kind, source, folded) {
    super()
    this.kind = kind
    this.source = source
    this.folded = folded
  }

  eq(other) {
    return other.kind === this.kind && other.source === this.source && other.folded === this.folded
  }

  toDOM(view) {
    const block = document.createElement('div')
    block.className = 'cm-live-block cm-live-block-' + this.kind + (this.folded ? ' cm-live-block-folded' : '')
    block.setAttribute('contenteditable', 'false')
    try {
      block.innerHTML = window.parseMarkdown(this.source)
    } catch (error) {
      block.textContent = this.source
    }

    // A diagram is drawn after the fact, and takes its height then
    if (this.kind === 'mermaid' && typeof window.initMermaid === 'function') {
      setTimeout(() => window.initMermaid(), 0)
    }
    // Formulas: a display block, or the cells of a table
    if (block.querySelector('.math-block, .math-inline')) renderMath(block)
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => view.requestMeasure())
      observer.observe(block)
      block._livePreviewResizeObserver = observer
    }
    if (this.kind === 'table') setupTableEditing(view, block)
    return block
  }

  destroy(dom) {
    if (dom && dom._livePreviewResizeObserver) dom._livePreviewResizeObserver.disconnect()
  }

  // Rich text: a table is edited in its drawn form (setupTableEditing), the
  // editor leaves what happens inside it alone
  ignoreEvent() {
    return this.kind === 'table' && !isSyntaxRevealed()
  }
}

// --- Tables edited where they are drawn (rich text) --------------------------
// The source of a table never comes back in the rich text view. A click in a
// cell turns that cell into a one-line text field holding the cell's own
// Markdown; Enter, Tab, or a click elsewhere writes it back into the note and
// the table is drawn again. A right click opens the menu the preview has for
// its tables (js/table-context-menu.js: rows, columns, alignment, delete).

// The line and the stretch of it (between two pipes) a drawn cell stands for
function locateTableCell(view, block, cell) {
  const row = cell.closest('tr')
  const table = cell.closest('table')
  if (!row || !table) return null
  const rowIndex = Array.from(table.querySelectorAll('tr')).indexOf(row)
  const cellIndex = Array.from(row.children).indexOf(cell)
  const doc = view.state.doc
  let blockPos
  try {
    blockPos = view.posAtDOM(block)
  } catch (error) {
    return null
  }
  const tableBlock = getRenderedBlocks(doc).find(candidate => candidate.kind === 'table' && blockPos >= candidate.from && blockPos <= candidate.to)
  if (!tableBlock || rowIndex < 0 || cellIndex < 0) return null
  // (the line under the header is the |---|---| one)
  const lineNumber = doc.lineAt(tableBlock.from).number + (rowIndex === 0 ? 0 : rowIndex + 1)
  if (lineNumber > doc.lineAt(tableBlock.to).number) return null
  const line = doc.line(lineNumber)
  const pipes = []
  for (let index = 0; index < line.text.length; index++) {
    if (line.text.charAt(index) === '|' && line.text.charAt(index - 1) !== '\\') pipes.push(index)
  }
  const leading = /^\s*\|/.test(line.text)
  const start = leading ? pipes[cellIndex] + 1 : (cellIndex === 0 ? 0 : pipes[cellIndex - 1] + 1)
  const end = leading ? pipes[cellIndex + 1] : pipes[cellIndex]
  if (start === undefined || Number.isNaN(start)) return null
  return {
    tableBlock,
    line,
    rowIndex,
    cellIndex,
    rowCount: table.querySelectorAll('tr').length,
    columnCount: row.children.length,
    start,
    stop: end === undefined ? line.text.length : end
  }
}

function findTableBlockElement(view, blockFrom) {
  return Array.from(view.dom.querySelectorAll('.cm-live-block-table')).find(element => {
    try {
      return view.posAtDOM(element) === blockFrom
    } catch (error) {
      return false
    }
  }) || null
}

function editTableCellAt(view, blockFrom, rowIndex, cellIndex) {
  const block = findTableBlockElement(view, blockFrom)
  const rows = block ? block.querySelectorAll('tr') : []
  const cell = rows[rowIndex] ? rows[rowIndex].children[cellIndex] : null
  if (cell) startTableCellEdit(view, block, cell)
}

function startTableCellEdit(view, block, cell) {
  if (block._liveEditingCell === cell || view.state.readOnly) return
  if (block._liveEditingCell && block._liveFinishEdit) block._liveFinishEdit(true)
  const located = locateTableCell(view, block, cell)
  if (!located) return

  const raw = located.line.text.slice(located.start, located.stop).trim()
  const originalHtml = cell.innerHTML
  cell.textContent = raw.replace(/\\\|/g, '|')
  cell.setAttribute('contenteditable', 'plaintext-only')
  if (cell.contentEditable !== 'plaintext-only') cell.setAttribute('contenteditable', 'true')
  cell.classList.add('cm-live-cell-editing')
  block._liveEditingCell = cell

  let finished = false
  const finish = (commit, move) => {
    if (finished) return
    finished = true
    cell.removeEventListener('keydown', onKeyDown)
    cell.removeEventListener('blur', onBlur)
    block._liveEditingCell = null
    block._liveFinishEdit = null
    const blockFrom = located.tableBlock.from
    const text = cell.textContent.replace(/\s*[\r\n]+\s*/g, ' ').trim().replace(/\\?\|/g, '\\|')
    cell.removeAttribute('contenteditable')
    cell.classList.remove('cm-live-cell-editing')

    let changed = false
    if (commit && text !== raw) {
      // (the cell's place is looked up again: the note may have moved on)
      const now = locateTableCell(view, block, cell)
      if (now) {
        changed = true
        view.dispatch({
          changes: { from: now.line.from + now.start, to: now.line.from + now.stop, insert: ' ' + text + ' ' },
          userEvent: 'input'
        })
      }
    }
    if (!changed) cell.innerHTML = originalHtml

    if (!move) return
    let rowIndex = located.rowIndex
    let cellIndex = located.cellIndex
    if (move === 'down') {
      rowIndex++
    } else {
      cellIndex += move === 'next' ? 1 : -1
      if (cellIndex >= located.columnCount) {
        cellIndex = 0
        rowIndex++
      } else if (cellIndex < 0) {
        cellIndex = located.columnCount - 1
        rowIndex--
      }
    }
    if (rowIndex < 0) return
    if (rowIndex >= located.rowCount) {
      if (move !== 'next') return
      // Tab out of the last cell: one more row
      const tableBlock = getRenderedBlocks(view.state.doc).find(candidate => candidate.kind === 'table' && candidate.from === blockFrom)
      if (!tableBlock) return
      view.dispatch({
        changes: { from: tableBlock.to, insert: '\n|' + '  |'.repeat(located.columnCount) },
        userEvent: 'input'
      })
    }
    // (the table was drawn again if anything changed: its cells are new ones)
    requestAnimationFrame(() => editTableCellAt(view, blockFrom, rowIndex, cellIndex))
  }
  const onKeyDown = event => {
    // Nothing typed in a cell is for the editor or for the page's shortcuts
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true, 'down')
    } else if (event.key === 'Tab') {
      event.preventDefault()
      finish(true, event.shiftKey ? 'previous' : 'next')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
      view.focus()
    } else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
      // Select all: all of the cell (the browser would take the whole note,
      // and the next key would replace it)
      event.preventDefault()
      const all = document.createRange()
      all.selectNodeContents(cell)
      const current = window.getSelection()
      current.removeAllRanges()
      current.addRange(all)
    }
  }
  const onBlur = () => finish(true)
  block._liveFinishEdit = finish
  cell.addEventListener('keydown', onKeyDown)
  cell.addEventListener('blur', onBlur)

  cell.focus()
  const range = document.createRange()
  range.selectNodeContents(cell)
  range.collapse(false)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function setupTableEditing(view, block) {
  // What is typed in a cell stays in the cell: the page listens for "/" and
  // for its shortcuts on everything editable inside a note
  ;['keypress', 'keyup', 'beforeinput', 'input', 'paste', 'cut', 'copy'].forEach(type => {
    block.addEventListener(type, event => {
      if (block._liveEditingCell) event.stopPropagation()
    })
  })
  block.addEventListener('paste', event => {
    if (!block._liveEditingCell || !event.clipboardData) return
    // One line of plain text, whatever was copied
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ')
    document.execCommand('insertText', false, text)
  })

  block.addEventListener('mousedown', event => {
    if (isSyntaxRevealed() || event.button !== 0) return
    const cell = event.target.closest ? event.target.closest('td, th') : null
    if (!cell || cell === block._liveEditingCell) return
    // A link or a checkbox in the cell keeps its own click
    if (event.target.closest('a, input, button')) return
    event.preventDefault()
    startTableCellEdit(view, block, cell)
  })

  block.addEventListener('contextmenu', event => {
    if (isSyntaxRevealed() || view.state.readOnly) return
    const cell = event.target.closest ? event.target.closest('td, th') : null
    const table = cell ? cell.closest('table') : null
    const noteEntry = view.dom.closest('.noteentry')
    if (!cell || !table || !noteEntry || typeof window.showMdTableContextMenu !== 'function') return
    // (while a cell is being typed in, the browser's own menu: copy, paste)
    if (block._liveEditingCell === cell) return
    if (block._liveFinishEdit) block._liveFinishEdit(true)
    const located = locateTableCell(view, block, cell)
    if (!located) return
    event.preventDefault()
    event.stopPropagation()
    // The menu works on the note's source, by line: both are handed to it
    // as they are now
    noteEntry.setAttribute('data-markdown-content', view.state.doc.toString())
    table.setAttribute('data-start-line', String(view.state.doc.lineAt(located.tableBlock.from).number - 1))
    // (the editor keeps the focus, so that Ctrl+Z takes back what the menu does)
    view.focus()
    window.showMdTableContextMenu(event.clientX, event.clientY, table, cell, noteEntry)
  })
}

function buildRenderedBlockDecorations(state) {
  if (typeof window.parseMarkdown !== 'function') return Decoration.none

  const doc = state.doc
  const selection = state.selection.ranges
  const toggles = getToggles(doc)
  const decorations = []

  // Rich text: a table stays drawn whatever the caret does, it is edited in
  // its drawn form (setupTableEditing)
  const keepTables = !isSyntaxRevealed()
  getRenderedBlocks(doc).forEach(block => {
    if (!(keepTables && block.kind === 'table') &&
        selection.some(range => range.from <= block.to && range.to >= block.from)) return

    // Inside a folded toggle the block goes with the rest of its body
    const number = doc.lineAt(block.from).number
    const toggle = toggles.find(candidate => number > candidate.summaryLine && number < candidate.lastLine)
    const toggleFrom = toggle ? doc.line(toggle.firstLine).from : 0
    const toggleTo = toggle ? doc.line(toggle.lastLine).to : 0
    const folded = !!toggle && !isToggleOpen(state, toggle) &&
      !selection.some(range => range.from <= toggleTo && range.to >= toggleFrom)

    decorations.push(Decoration.replace({
      widget: new RenderedBlockWidget(block.kind, doc.sliceString(block.from, block.to), folded),
      block: true
    }).range(block.from, block.to))
  })

  return Decoration.set(decorations, true)
}

const renderedBlocksField = StateField.define({
  create(state) {
    return buildRenderedBlockDecorations(state)
  },
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection ||
        transaction.effects.some(effect => effect.is(setToggleOpenEffect) || effect.is(refreshLivePreviewEffect))) {
      return buildRenderedBlockDecorations(transaction.state)
    }
    return value
  },
  provide: field => EditorView.decorations.from(field)
})

// Rich text: Bold, Italic, Strikethrough... with nothing selected write an
// empty pair of markers and leave the caret in the middle ("**|**"), for the
// text to come. Until that text is typed the pair is not what it will be:
// "****" alone on a line is a horizontal rule to Markdown, "~~~~" opens a code
// block, "====" under a paragraph turns it into a heading, and "**" is two
// stars. The pair around the caret is found here, so that it can be kept out
// of sight and out of the block rules while it is empty, and taken back out
// of the note if the caret leaves without anything having been typed.
export function findEmptyMarkerPair(state) {
  const selection = state.selection
  if (selection.ranges.length !== 1 || !selection.main.empty) return null
  const pos = selection.main.head
  const line = state.doc.lineAt(pos)
  const offset = pos - line.from

  // The pair of tags Color, Highlight and Underline write when nothing is
  // selected: <span style="color: ...">|</span>, <u>|</u>
  const opening = /<(u|span)\b([^<>]*)>$/i.exec(line.text.slice(0, offset))
  if (opening) {
    const closing = new RegExp('^</' + opening[1] + '\\s*>', 'i').exec(line.text.slice(offset))
    if (closing) {
      const styleMatch = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(opening[2])
      return {
        from: pos - opening[0].length,
        to: pos + closing[0].length,
        pos,
        line: line.number,
        marker: 'tag',
        style: styleMatch ? sanitizeSpanStyle(styleMatch[2]) : '',
        text: opening[0] + closing[0]
      }
    }
  }

  const marker = line.text.charAt(offset - 1)
  if (!marker || '*_~=`'.indexOf(marker) === -1 || line.text.charAt(offset) !== marker) return null

  let before = 0
  while (offset - 1 - before >= 0 && line.text.charAt(offset - 1 - before) === marker) before++
  let after = 0
  while (offset + after < line.text.length && line.text.charAt(offset + after) === marker) after++
  if ((marker === '~' || marker === '=') ? before !== 2 : before > 3) return null
  if (before === after) {
    return { from: pos - before, to: pos + after, pos, line: line.number, marker, text: marker.repeat(before * 2) }
  }

  // Italic asked for at the end of a bold word: "**word*|***", the pair
  // standing against the stars that close the bold. The extra markers behind
  // it must be the closing ones of a format opened earlier on the line; they
  // are hidden with the pair (hideTo), which Markdown cannot tell them from
  // while it is empty.
  const extra = after - before
  if (extra < 1 || extra > 3 || marker === '`') return null
  const head = line.text.slice(0, offset - before)
  const outer = head.lastIndexOf(marker.repeat(extra))
  if (outer === -1 || !/\S/.test(head.charAt(outer + extra)) || head.charAt(outer + extra) === marker) return null
  // (exactly that many: "***word*|**" is a caret inside the three stars that
  // close "***word", not a pair)
  if (outer > 0 && head.charAt(outer - 1) === marker) return null
  return {
    from: pos - before,
    to: pos + before,
    hideTo: pos + after,
    nested: true,
    outerFrom: line.from + outer,
    outerTo: line.from + outer + extra,
    pos,
    line: line.number,
    marker,
    text: marker.repeat(before * 2)
  }
}

// A link to another note opens in the app, like the same link in the preview
// (js/note-reference.js); any other opens in a new tab.
function followLink(href) {
  const internal = /(?:^|\/)index\.php\?[^#\s]*\bnote=(\d+)\b|^\?[^#\s]*\bnote=(\d+)\b/.exec(href)
  if (internal && typeof window.navigateToNote === 'function') {
    window.navigateToNote(internal[1] || internal[2])
    return
  }
  window.open(href, '_blank', 'noopener')
}

// What stands in the middle of an empty pair until its text is typed. The
// two halves of the pair are text of no size, and a caret drawn between them
// had no height: this gives it one. For inline code it is also the start of
// the code's grey ground, so that one sees where the code will go.
class EmptyPairWidget extends WidgetType {
  constructor(marker, style) {
    super()
    this.marker = marker
    this.style = style || ''
  }

  eq(other) {
    return other.marker === this.marker && other.style === this.style
  }

  toDOM() {
    const strut = document.createElement('span')
    strut.className = 'cm-live-pair-strut' + (this.marker === '`' ? ' cm-live-pair-code' : '')
    strut.setAttribute('aria-hidden', 'true')
    // A colour or a highlight about to be typed in: a mark in that colour
    if (this.style) {
      strut.classList.add('cm-live-pair-color')
      strut.setAttribute('style', this.style)
    }
    return strut
  }

  ignoreEvent() {
    return false
  }
}

// Literal typing, the other half of the "Rich text" view (the syntax is never
// shown, markdown_live_show_syntax off): what is typed is text, never formatting.
// A character Markdown would read as syntax where it is typed goes into the
// source behind a backslash, which the note then shows as the plain character
// (the backslash itself is hidden with the rest of the syntax). Formatting
// comes from the toolbar, the shortcuts, the slash menu and the right-click
// menu, which write their Markdown themselves and do not come through here;
// nor does pasted text, which keeps its Markdown.
function isSyntaxRevealed() {
  return !!document.body && document.body.getAttribute('data-markdown-live-syntax') === '1'
}

// Places where what is typed is the source itself: code, the source of a
// table or of a formula while it is open for editing
function isRawTypingContext(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText'].includes(node.name)) return true
  }
  if (getRenderedBlocks(state.doc).some(block => pos >= block.from && pos <= block.to)) return true

  const line = state.doc.lineAt(pos)
  const offset = pos - line.from
  for (const regex of [DISPLAY_MATH_REGEX, INLINE_MATH_REGEX]) {
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(line.text))) {
      if (offset > match.index && offset < match.index + match[0].length) return true
    }
  }
  return false
}

const LINE_PREFIX_REGEX = /^\s*(?:(?:[-*+]|\d+[.)])\s+|>\s?)*\s*$/

// `before` is the text of the line up to the character being typed
function needsEscape(character, before) {
  const previous = before.slice(-1)
  const lineStart = LINE_PREFIX_REGEX.test(before)

  switch (character) {
    case '*':
    case '`':
    case '[':
    case '<':
    case '$':
    case '\\':
      return true
    case '_':
      // snake_case is not emphasis: only an underscore that could open one
      return !/[A-Za-z0-9]/.test(previous)
    case '~':
      return previous === '~'
    case '=':
      return previous === '=' || lineStart
    case '#':
    case '>':
    case '-':
    case '+':
    case '|':
      return lineStart
    case '.':
    case ')':
      // "1." and "1)" open a numbered list
      return /^\s*\d{1,9}$/.test(before)
    default:
      return false
  }
}

// Rich text, in a code block whose fences are not shown.
function findClosedFence(state, pos) {
  for (const side of [-1, 1]) {
    for (let node = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
      if (node.name !== 'FencedCode') continue
      const marks = node.getChildren('CodeMark')
      const first = state.doc.lineAt(node.from)
      const last = state.doc.lineAt(node.to)
      if (marks.length > 1 && last.number > first.number && marks[marks.length - 1].from >= last.from) {
        return { first, last }
      }
      return null
    }
  }
  return null
}

// Out of the block, onto the line under it, made if there is none (or if the
// one there has text on it)
function leaveFenceChanges(state, fence) {
  const doc = state.doc
  const next = fence.last.number < doc.lines ? doc.line(fence.last.number + 1) : null
  if (next && !next.text.trim()) return { changes: [], target: next.from }
  return { changes: [{ from: fence.last.to, insert: '\n' }], target: fence.last.to + 1 }
}

// Enter on an empty last line of the block, or on the (invisible) line of its
// closing fence, leaves the block: without it Enter only ever adds lines of
// code, and a block ending the note could not be left at all.
function leaveCodeBlockOnEnter(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const fence = findClosedFence(state, main.head)
  if (!fence) return false

  const line = state.doc.lineAt(main.head)
  const onClosingFence = line.number === fence.last.number
  const onEmptyLastLine = line.number === fence.last.number - 1 && line.number > fence.first.number && !line.text.trim()
  if (!onClosingFence && !onEmptyLastLine) return false

  const leave = leaveFenceChanges(state, fence)
  const changes = leave.changes.slice()
  // The empty line that asked to leave goes, unless it is all the block holds
  if (onEmptyLastLine && line.number - 1 > fence.first.number) {
    changes.push({ from: line.from - 1, to: line.to })
  }
  const transaction = state.update({ changes })
  view.dispatch({
    changes,
    selection: { anchor: transaction.changes.mapPos(leave.target, 1) },
    userEvent: 'input',
    scrollIntoView: true
  })
  return true
}

// Arrow down from the last line of a block that ends the note
function leaveCodeBlockOnArrowDown(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const fence = findClosedFence(state, main.head)
  if (!fence || fence.last.number < state.doc.lines) return false
  if (state.doc.lineAt(main.head).number < fence.last.number - 1) return false

  view.dispatch({
    changes: { from: fence.last.to, insert: '\n' },
    selection: { anchor: fence.last.to + 1 },
    userEvent: 'input',
    scrollIntoView: true
  })
  return true
}

// Rich text: the markers of bold, italic, strikethrough and highlight only
// count when they touch their text. A space typed at the very end of a bold
// word would give "**word **", which Markdown reads as plain text between
// stray stars, and the same goes for a space typed at its very start or for a
// line broken there. The two functions below find the hidden markers the caret
// is standing against, on the inside: the closing ones in front of it
// (returns where they end) and the opening ones behind it (where they start).
const HIGHLIGHT_REGEX = /==(?=\S)([^\n]*?\S)==/g

function isPairMark(node) {
  return node.name === 'EmphasisMark' || node.name === 'StrikethroughMark'
}

function findHighlightEdges(state, pos) {
  const line = state.doc.lineAt(pos)
  const edges = []
  if (line.text.indexOf('==') === -1) return edges
  HIGHLIGHT_REGEX.lastIndex = 0
  let match
  while ((match = HIGHLIGHT_REGEX.exec(line.text))) {
    const from = line.from + match.index
    edges.push({ from, to: from + match[0].length })
  }
  return edges
}

function findClosingMarksEnd(state, pos) {
  const tree = syntaxTree(state)
  const highlights = findHighlightEdges(state, pos)
  let end = pos
  for (;;) {
    const node = tree.resolveInner(end, 1)
    if (isPairMark(node) && node.from === end && node.parent && node.to === node.parent.to) {
      end = node.to
      continue
    }
    const at = end
    if (highlights.some(highlight => highlight.to - 2 === at)) {
      end += 2
      continue
    }
    return end
  }
}

function findOpeningMarksStart(state, pos) {
  const tree = syntaxTree(state)
  const highlights = findHighlightEdges(state, pos)
  let start = pos
  for (;;) {
    const node = tree.resolveInner(start, -1)
    if (isPairMark(node) && node.to === start && node.parent && node.from === node.parent.from) {
      start = node.from
      continue
    }
    const at = start
    if (highlights.some(highlight => highlight.from + 2 === at)) {
      start -= 2
      continue
    }
    return start
  }
}

// "Back to normal text" of the command menus (js/slash-command.js): is the
// caret inside bold, italic, strikethrough, inline code, a highlight, an
// underline or a colour, and where does the outermost of them end. Read from
// the source, so it answers the same in every view of the editor.
function spanStyleProperty(tag) {
  const match = /^<span\s+style\s*=\s*["']\s*(background-color|color)\s*:/i.exec(tag)
  return match ? match[1].toLowerCase() : ''
}

const INLINE_FORMAT_NODES = ['Emphasis', 'StrongEmphasis', 'Strikethrough', 'InlineCode']
const INLINE_FORMAT_MARKERS = { '**': 'StrongEmphasis', '__': 'StrongEmphasis', '*': 'Emphasis', '_': 'Emphasis', '~~': 'Strikethrough', '`': 'InlineCode' }

// The stars that close bold and italic together ("***word***"), around the
// caret: { from, to } of that run, or null. A caret inside the run is where
// one of the two was left and the other goes on: what is typed there takes
// the format of the stars still to its right.
function closingEmphasisRun(state, pos) {
  const line = state.doc.lineAt(pos)
  const text = line.text
  const at = pos - line.from
  const star = text.charAt(at) || text.charAt(at - 1)
  if (star !== '*' && star !== '_') return null
  let from = at
  let to = at
  while (from > 0 && text.charAt(from - 1) === star) from--
  while (to < text.length && text.charAt(to) === star) to++
  if (to - from !== 3 || from === 0 || /\s/.test(text.charAt(from - 1))) return null
  if (syntaxTree(state).resolveInner(line.from + from, 1).name !== 'EmphasisMark') return null
  return { from: line.from + from, to: line.from + to }
}

// Where the caret goes to leave `marker` (bold, italic...) and nothing else:
// past the end of that format, or, at the end of text both bold and italic,
// past the stars of the one that is left only
export function findInlineFormatExit(state, marker) {
  const main = state.selection.main
  if (main.empty && /^[*_]{1,2}$/.test(marker || '')) {
    const run = closingEmphasisRun(state, main.head)
    if (run && main.head === run.from) return main.head + marker.length
  }
  return findInlineFormatEnd(state, marker)
}

// With `marker`, only that format counts (is the caret in bold?)
export function findInlineFormatEnd(state, marker) {
  const main = state.selection.main
  if (!main.empty) return null
  const pos = main.head
  if (/^[*_]{1,2}$/.test(marker || '')) {
    const run = closingEmphasisRun(state, pos)
    if (run && pos > run.from && pos < run.to) {
      const left = run.to - pos
      return (marker.length === 2 ? left >= 2 : left % 2 === 1) ? run.to : null
    }
  }
  let end = -1
  const take = (from, to) => {
    if (from < pos && pos < to && to > end) end = to
  }
  const wanted = marker ? [INLINE_FORMAT_MARKERS[marker] || ''] : INLINE_FORMAT_NODES

  for (const side of [-1, 1]) {
    for (let node = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') return null
      if (wanted.includes(node.name)) take(node.from, node.to)
    }
  }
  if (!marker || marker === '==') {
    findHighlightEdges(state, pos).forEach(highlight => take(highlight.from, highlight.to))
  }

  const line = state.doc.lineAt(pos)
  // "color" and "background-color" ask for a <span style> of that kind
  const spanKind = marker === 'color' || marker === 'background-color' ? marker : ''
  if ((!marker || marker === '<u>' || spanKind) && line.text.indexOf('<') !== -1) {
    const tagRegex = /<(\/?)(u|span)\b[^<>]*>/gi
    const open = []
    let match
    while ((match = tagRegex.exec(line.text))) {
      const name = match[2].toLowerCase()
      if (marker === '<u>' && name !== 'u') continue
      if (spanKind && name !== 'span') continue
      if (spanKind && !match[1] && spanStyleProperty(match[0]) !== spanKind) continue
      if (!match[1]) {
        open.push({ name, from: line.from + match.index })
        continue
      }
      let index = open.length - 1
      while (index >= 0 && open[index].name !== name) index--
      if (index < 0) continue
      take(open[index].from, line.from + match.index + match[0].length)
      open.length = index
    }
  }
  return end === -1 ? null : end
}

// The empty pair of markers a formatting command wrote around the caret, as
// opposed to a caret reported between the two stars that close a bold word
export function findUntypedPair(state) {
  const pair = findEmptyMarkerPair(state)
  if (!pair || pair.marker === 'tag' || pair.nested) return pair
  const node = syntaxTree(state).resolveInner(pair.from, 1)
  return isPairMark(node) ? null : pair
}

// "**word |**": a space left against the inside of closing markers, by a
// deletion (the "/" that opened the command menu after "word ", Backspace on
// the last letter of "word b"). Markdown no longer reads that as bold and the
// stars show. Returns what it takes to put the space after the markers.
function findStrandedSpace(state) {
  const main = state.selection.main
  if (!main.empty) return null
  const line = state.doc.lineAt(main.head)
  const before = line.text.slice(0, main.head - line.from)
  const after = line.text.slice(main.head - line.from)
  if (isRawTypingContext(state, main.head)) return null

  const closing = /^(?:\*{1,3}|_{1,3}|~~|==)/.exec(after)
  const spaces = /[ \t ]+$/.exec(before)
  if (closing && spaces) {
    const marks = closing[0]
    const text = before.slice(0, spaces.index)
    const opening = text.lastIndexOf(marks)
    if (opening !== -1 && opening + marks.length < text.length && !/\s/.test(text.charAt(opening + marks.length)) &&
        !isPairMark(syntaxTree(state).resolveInner(main.head, 1))) {
      return { from: line.from + spaces.index, to: main.head + marks.length, marks, spaces: spaces[0] }
    }
  }

  // The same at the other end, "**| word**": the first word of a bold
  // stretch was deleted and its space is now against the opening markers
  const opened = /(?:\*{1,3}|_{1,3}|~~|==)$/.exec(before)
  const lead = /^[ \t ]+(?=\S)/.exec(after)
  if (opened && lead) {
    const marks = opened[0]
    const rest = after.slice(lead[0].length)
    const close = rest.indexOf(marks)
    const start = line.from + opened.index
    if (close > 0 && !/\s/.test(rest.charAt(close - 1)) && before.charAt(opened.index - 1) !== marks.charAt(0) &&
        !isPairMark(syntaxTree(state).resolveInner(start, 1))) {
      return { from: start, to: main.head + lead[0].length, marks, spaces: lead[0], leading: true }
    }
  }
  return null
}

function moveStrandedSpaceOut(view, stranded) {
  view.dispatch({
    changes: { from: stranded.from, to: stranded.to, insert: stranded.leading ? stranded.spaces + stranded.marks : stranded.marks + stranded.spaces },
    selection: { anchor: stranded.to },
    userEvent: 'input'
  })
}

// Out of the formatting the caret is in: an empty pair of markers nothing was
// typed in goes, and the caret moves past the closing marker of what is left
// With `marker`, only out of that format (out of the code, still in the bold)
export function leaveInlineFormat(view, marker) {
  let done = false
  if (marker) {
    const markerEnd = findInlineFormatExit(view.state, marker)
    if (markerEnd === null) return false
    view.dispatch({ selection: { anchor: markerEnd }, scrollIntoView: true })
    return true
  }
  // What is typed next is normal text: the space that waited behind a bold
  // word for the next bold word (literalTypingInput) no longer does
  const livePlugin = view.plugin(livePreviewPlugin)
  if (livePlugin && livePlugin.pendingSpace) {
    livePlugin.pendingSpace = null
    done = true
  }
  const stranded = findStrandedSpace(view.state)
  if (stranded) {
    moveStrandedSpaceOut(view, stranded)
    return true
  }
  const pair = findUntypedPair(view.state)
  if (pair) {
    view.dispatch({ changes: { from: pair.from, to: pair.to }, selection: { anchor: pair.from }, userEvent: 'delete' })
    done = true
  }
  const end = findInlineFormatEnd(view.state)
  if (end !== null) {
    view.dispatch({ selection: { anchor: end }, scrollIntoView: true })
    done = true
  }
  return done
}

// Enter at the very end (or the very start) of a bold word breaks the line
// outside its markers, and an empty pair nothing was typed in goes first
function leaveMarksOnEnter(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false

  const livePlugin = view.plugin(livePreviewPlugin)
  const pair = livePlugin ? livePlugin.emptyPair : null
  if (pair && pair.marker !== 'tag' && main.head >= pair.from && main.head <= (pair.hideTo || pair.to) &&
      state.sliceDoc(pair.from, pair.to) === pair.text) {
    view.dispatch({ changes: { from: pair.from, to: pair.to }, selection: { anchor: pair.from }, userEvent: 'delete' })
    return false
  }
  if (isRawTypingContext(state, main.head)) return false

  const end = findClosingMarksEnd(state, main.head)
  const start = end > main.head ? main.head : findOpeningMarksStart(state, main.head)
  if (end > main.head) view.dispatch({ selection: { anchor: end } })
  else if (start < main.head) view.dispatch({ selection: { anchor: start } })
  // The line itself is broken by the editor's own Enter
  return false
}

// Rich text, a line aligned from the menus: <p align="center">text</p>, the
// two tags never shown. The text between them is all there is to the line as
// far as the person typing can tell, so the caret is kept between the tags
// and Enter, Backspace and Delete are made to act on the line as a whole:
// left to the editor they would cut the line in two between its tags, or
// delete one tag and leave the other in the note as text.
function findAlignedLine(state, pos) {
  const line = state.doc.lineAt(pos)
  if (line.text.indexOf('align') === -1) return null
  const match = ALIGNED_LINE_REGEX.exec(line.text)
  if (!match) return null
  for (let node = syntaxTree(state).resolveInner(line.from, 1); node; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return null
  }
  const innerFrom = line.from + match[1].length
  return {
    line,
    align: match[2].toLowerCase(),
    opening: match[1],
    innerFrom,
    innerTo: innerFrom + match[3].length
  }
}

// Where a caret reported in front of the opening tag, or behind the closing
// one, belongs: inside the line it was put on, or on the neighbouring line
// when it was walking out of this one with an arrow key
function alignedCaretTarget(state, head, previousHead) {
  const aligned = findAlignedLine(state, head)
  if (!aligned || (head >= aligned.innerFrom && head <= aligned.innerTo)) return head
  const leaving = previousHead !== null && previousHead >= aligned.innerFrom && previousHead <= aligned.innerTo
  if (head < aligned.innerFrom) {
    if (!leaving || aligned.line.number === 1) return aligned.innerFrom
    return alignedCaretTarget(state, aligned.line.from - 1, null)
  }
  if (!leaving || aligned.line.number === state.doc.lines) return aligned.innerTo
  return alignedCaretTarget(state, aligned.line.to + 1, null)
}

const alignedCaretFilter = EditorState.transactionFilter.of(transaction => {
  if (!transaction.selection && !transaction.docChanged) return transaction
  if (isSyntaxRevealed()) return transaction
  const selection = transaction.newSelection
  if (selection.ranges.length !== 1 || !selection.main.empty) return transaction
  const head = selection.main.head
  const before = transaction.startState.selection.main
  const previousHead = !transaction.docChanged && before.empty ? before.head : null
  const target = alignedCaretTarget(transaction.state, head, previousHead)
  if (target === head) return transaction
  return [transaction, { selection: { anchor: target }, sequential: true }]
})

function alignedLineAtCaret(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return null
  const main = view.state.selection.main
  if (!main.empty) return null
  const aligned = findAlignedLine(view.state, main.head)
  if (!aligned || main.head < aligned.innerFrom || main.head > aligned.innerTo) return null
  return aligned
}

// Enter: the text behind the caret goes to a new line, aligned the same way
function splitAlignedLineOnEnter(view) {
  // (in live preview too, where the tags are in sight: a line broken between
  // them is no longer an aligned line, and the note shows the tags as text)
  const main = view.state.selection.main
  if (view.state.readOnly || !main.empty) return false
  const aligned = findAlignedLine(view.state, main.head)
  if (!aligned || main.head < aligned.innerFrom || main.head > aligned.innerTo) return false
  const head = main.head
  const insert = '</p>\n' + aligned.opening
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + insert.length },
    userEvent: 'input',
    scrollIntoView: true
  })
  return true
}

// Backspace at the start of the line takes its alignment away, as it takes a
// bullet away at the start of a list item
function unalignLineOnBackspace(view) {
  const aligned = alignedLineAtCaret(view)
  if (!aligned || view.state.selection.main.head !== aligned.innerFrom) return false
  view.dispatch({
    changes: [
      { from: aligned.line.from, to: aligned.innerFrom },
      { from: aligned.innerTo, to: aligned.line.to }
    ],
    selection: { anchor: aligned.line.from },
    userEvent: 'delete.backward',
    scrollIntoView: true
  })
  return true
}

// Delete at the end of the line brings the text of the next line up into it
function joinAlignedLineOnDelete(view) {
  const aligned = alignedLineAtCaret(view)
  if (!aligned || view.state.selection.main.head !== aligned.innerTo) return false
  const { state } = view
  if (aligned.line.number < state.doc.lines) {
    const next = state.doc.line(aligned.line.number + 1)
    const nextAligned = findAlignedLine(state, next.from)
    const text = nextAligned ? state.sliceDoc(nextAligned.innerFrom, nextAligned.innerTo) : next.text
    view.dispatch({
      changes: [
        { from: aligned.innerTo, insert: text },
        { from: aligned.line.to, to: next.to }
      ],
      selection: { anchor: aligned.innerTo },
      userEvent: 'delete.forward'
    })
  }
  return true
}

const LIST_ITEM_PREFIX_REGEX = /^(\s*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/

// Enter on a list item, or a quote line, with nothing on it leaves the list
// (the quote): the marker goes and the line is an ordinary empty one. The
// editor's own Enter first spaces the list out and keeps the marker, which
// reads as "the list will not let go" when the markers are bullets.
function leaveEmptyItemOnEnter(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  if (!line.text || !/^\s*(?:(?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?|>)[ \t]*$/.test(line.text)) return false
  const name = syntaxTree(state).resolveInner(line.from + /^\s*/.exec(line.text)[0].length, 1).name
  if (name !== 'ListMark' && name !== 'QuoteMark') return false
  // Out of a quote, an empty line stays between it and what is typed next:
  // a line of text right under a quote is read as one more line of the quote
  const quote = name === 'QuoteMark'
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: quote ? '\n' : '' },
    selection: { anchor: line.from + (quote ? 1 : 0) },
    userEvent: 'delete',
    scrollIntoView: true
  })
  return true
}

// The inline pieces of a line that hide their syntax: bold, italic,
// strikethrough, inline code, links, highlights, <u> and <span style>. Each
// with where it starts and ends and where its text does (openTo..closeFrom).
function findInlineConstructs(state, line) {
  const constructs = []
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      const name = node.name
      if (name === 'FencedCode' || name === 'CodeBlock' || name === 'Image') return false
      if (node.from < line.from || node.to > line.to) return
      const first = node.node.firstChild
      const last = node.node.lastChild
      if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough') {
        if (first && last && first !== last && isPairMark(first) && isPairMark(last)) {
          constructs.push({ from: node.from, to: node.to, openTo: first.to, closeFrom: last.from, kind: 'mark' })
        }
      } else if (name === 'InlineCode') {
        if (first && last && first.from !== last.from && first.name === 'CodeMark' && last.name === 'CodeMark') {
          constructs.push({ from: node.from, to: node.to, openTo: first.to, closeFrom: last.from, kind: 'code' })
        }
        return false
      } else if (name === 'Link') {
        const marks = node.node.getChildren('LinkMark')
        if (marks.length >= 4 && node.node.getChild('URL')) {
          constructs.push({ from: node.from, to: node.to, openTo: marks[0].to, closeFrom: marks[1].from, kind: 'link' })
        }
      }
    }
  })
  findHighlightEdges(state, line.from).forEach(highlight => {
    constructs.push({ from: highlight.from, to: highlight.to, openTo: highlight.from + 2, closeFrom: highlight.to - 2, kind: 'mark' })
  })
  if (line.text.indexOf('<') !== -1) {
    const tagRegex = /<(\/?)(u|span)\b[^<>]*>/gi
    const open = []
    let match
    while ((match = tagRegex.exec(line.text))) {
      const name = match[2].toLowerCase()
      const from = line.from + match.index
      if (!match[1]) {
        open.push({ name, from, to: from + match[0].length })
        continue
      }
      let index = open.length - 1
      while (index >= 0 && open[index].name !== name) index--
      if (index < 0) continue
      constructs.push({ from: open[index].from, to: from + match[0].length, openTo: open[index].to, closeFrom: from, kind: 'mark' })
      open.length = index
    }
  }
  return constructs
}

// One character back from `pos`, a backslash escape counting as one
function characterStartBefore(state, pos, lineFrom) {
  if (pos <= lineFrom) return pos
  const escape = syntaxTree(state).resolveInner(pos, -1)
  if (escape.name === 'Escape' && escape.to === pos) return escape.from
  const text = state.sliceDoc(Math.max(lineFrom, pos - 2), pos)
  return pos - (text.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text) ? 2 : 1)
}

function characterEndAfter(state, pos, lineTo) {
  if (pos >= lineTo) return pos
  const escape = syntaxTree(state).resolveInner(pos, 1)
  if (escape.name === 'Escape' && escape.from === pos) return escape.to
  const text = state.sliceDoc(pos, Math.min(lineTo, pos + 2))
  return pos + (text.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text) ? 2 : 1)
}

// A piece left with no text goes whole, markers included
function widenOverEmptyConstructs(constructs, range) {
  for (let widened = true; widened;) {
    widened = false
    for (const construct of constructs) {
      if (construct.openTo === range.from && construct.closeFrom === range.to) {
        range = { from: construct.from, to: construct.to }
        widened = true
      }
    }
  }
  return range
}

// Backspace right behind a bold word, Delete right in front of one: the key
// is on the hidden markers, and deleting those alone would leave their twins
// in the note as stars. It takes the letter on the other side of them
// instead, which is what the eye expects. Same for a link, a highlight, a
// colour.
function deleteAcrossHiddenMarkers(view, forward) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  const constructs = findInlineConstructs(state, line)
  if (!constructs.length) return false

  let pos = main.head
  let crossed = false
  for (let moved = true; moved;) {
    moved = false
    for (const construct of constructs) {
      if (!forward && construct.to === pos && construct.closeFrom < pos) {
        pos = construct.closeFrom
        moved = crossed = true
      } else if (forward && construct.from === pos && construct.openTo > pos) {
        pos = construct.openTo
        moved = crossed = true
      }
    }
  }

  // Inside a link, on the last letter of its text: the link goes with it
  // (an empty [](address) cannot be seen, clicked or deleted afterwards)
  const inLink = constructs.find(construct => construct.kind === 'link' &&
    (forward ? pos === construct.openTo : pos === construct.closeFrom))
  let range = forward
    ? { from: pos, to: characterEndAfter(state, pos, line.to) }
    : { from: characterStartBefore(state, pos, line.from), to: pos }
  if (!crossed && !(inLink && range.from === inLink.openTo && range.to === inLink.closeFrom)) return false
  if (range.from === range.to) {
    // Nothing on that side of the markers but more markers: an empty piece
    const empty = constructs.find(construct => construct.openTo === pos && construct.closeFrom === pos)
    if (!empty) return false
    range = { from: empty.from, to: empty.to }
  }
  range = widenOverEmptyConstructs(constructs, range)
  view.dispatch({
    changes: range,
    selection: { anchor: range.from },
    userEvent: forward ? 'delete.forward' : 'delete.backward',
    scrollIntoView: true
  })
  return true
}

// What deleting the selection may take: everything in it, except the hidden
// markers of a piece the selection only covers in part. "bold wo[rd** and]"
// keeps the two stars, or the first half of the bold word would lose its
// closing markers. `dropEmptied`: a piece whose text is selected whole goes
// with its markers (Backspace); typing over it keeps them (the new text takes
// the format).
function safeDeletionRanges(state, from, to, dropEmptied) {
  const first = state.doc.lineAt(from)
  const last = state.doc.lineAt(to)
  if (last.number - first.number > 400) return null
  let keep = []
  const drop = []
  // Markers kept inside the selection: the closing ones of a piece that
  // starts before it, the opening ones of a piece that ends after it
  const closings = []
  const openings = []
  for (let number = first.number; number <= last.number; number++) {
    for (const construct of findInlineConstructs(state, state.doc.line(number))) {
      if (construct.to <= from || construct.from >= to) continue
      if (construct.from >= from && construct.to <= to) continue
      const emptied = from <= construct.openTo && to >= construct.closeFrom
      if (emptied && dropEmptied) {
        drop.push({ from: construct.from, to: construct.to })
      } else {
        const opening = { from: construct.from, to: construct.openTo }
        const closing = { from: construct.closeFrom, to: construct.to }
        keep.push(opening, closing)
        if (construct.from < from && closing.from >= from && closing.to <= to) closings.push(closing)
        if (construct.to > to && opening.from >= from && opening.to <= to) openings.push(opening)
      }
    }
  }
  if (!keep.length && !drop.length) return null
  // "**bold wo[rd** and **an]other**": what is left of the two bold words
  // comes together, and the markers that would meet in the middle ("****")
  // go, leaving one bold stretch
  for (const closing of closings) {
    const opening = openings.find(candidate => !candidate.merged && candidate.from >= closing.to &&
      state.sliceDoc(candidate.from, candidate.to) === state.sliceDoc(closing.from, closing.to))
    if (!opening) continue
    opening.merged = closing.merged = true
  }
  keep = keep.filter(kept => !kept.merged)

  let ranges = [{ from, to }].concat(drop)
  for (const kept of keep) {
    if (drop.some(dropped => dropped.from <= kept.from && dropped.to >= kept.to)) continue
    const next = []
    for (const range of ranges) {
      if (kept.to <= range.from || kept.from >= range.to) {
        next.push(range)
        continue
      }
      if (kept.from > range.from) next.push({ from: range.from, to: kept.from })
      if (kept.to < range.to) next.push({ from: kept.to, to: range.to })
    }
    ranges = next
  }
  ranges.sort((a, b) => a.from - b.from)
  const merged = []
  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to)
    else if (range.to > range.from) merged.push({ from: range.from, to: range.to })
  }
  return merged
}

// Bold (or italic, a colour...) over a selection. The markers are written
// one line at a time, around the text of each line: never around a bullet, the
// "##" of a heading, the tags of an aligned line or an empty line, and never
// from one paragraph into the next, all of which Markdown reads as stars
// rather than as bold. A selection inside a word that is already bold takes
// the bold off that part; one that overlaps a bold word makes one bold
// stretch of the two. Returns the changes and the stretches that were
// formatted, or null when there is nothing to format.
const LINE_BLOCK_PREFIX_REGEX = /^\s*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+|(?:>[ \t]?)+(?:\[![^\]\n]*\][ \t]*)?)?/
const UNWRAPPABLE_LINE_REGEX = /^\s*(?:\||<\/?(?:details|summary|iframe|audio|video|div)\b|(?:\*{3,}|-{3,}|_{3,})\s*$|\$\$)/

// Italic asked for in the middle of a bold word (or bold in an italic one),
// rich text: an empty "**" or "*" pair written there would sit against the
// word's own stars, and Markdown could no longer tell which are which until a
// letter is typed. Nothing is written yet: the format is remembered at the
// caret, and goes into the note around the first character typed.
// Returns false when the caret is not in such a place.
export function armPendingFormat(view, prefix, suffix) {
  if (isSyntaxRevealed() || prefix !== suffix || !/^[*_]{1,3}$/.test(prefix)) return false
  const livePlugin = view.plugin(livePreviewPlugin)
  const main = view.state.selection.main
  if (!livePlugin || !main.empty) return false
  const line = view.state.doc.lineAt(main.head)
  const around = findInlineConstructs(view.state, line).find(construct =>
    construct.kind === 'mark' && construct.openTo < main.head && main.head < construct.closeFrom &&
    view.state.sliceDoc(construct.from, construct.from + 1) === prefix.charAt(0))
  if (!around) return false
  livePlugin.pendingFormat = { pos: main.head, prefix, suffix }
  view.dispatch({ effects: refreshLivePreviewEffect.of(null) })
  return true
}

// Is the caret writing in that format (its button is then shown lit, and
// pressing it again leaves the format), or does the selection lie in it.
// Counts the pair a command just wrote and the format waiting for its first
// character, both of which are "on" as far as the person typing can tell.
// The space typed at the end of a bold word waits outside the markers for the
// next word (literalTypingInput), which takes it back in: until then the
// format is still the one being written, for the buttons and the shortcuts
function heldPendingSpace(view) {
  const livePlugin = view.plugin(livePreviewPlugin)
  const pending = livePlugin ? livePlugin.pendingSpace : null
  const main = view.state.selection.main
  if (!pending || !main.empty || main.head !== pending.to) return null
  return view.state.sliceDoc(pending.from, pending.to) === pending.marks + pending.spaces ? pending : null
}

function closingMarksHold(marks, prefix) {
  if (/^[*_]{1,3}$/.test(prefix)) {
    const width = (marks.match(/[*_]/g) || []).length
    return prefix.length === 3 ? width === 3 : (prefix.length === 2 ? width >= 2 : width % 2 === 1)
  }
  if (prefix === '<u>') return marks.toLowerCase().indexOf('</u>') !== -1
  return /^(?:~~|==|`)$/.test(prefix) && marks.indexOf(prefix) !== -1
}

// The shortcut or button of a format whose word ends with such a waiting
// space: out of the format, the space stays where it is
export function leavePendingSpace(view, prefix) {
  const pending = heldPendingSpace(view)
  if (!pending || !closingMarksHold(pending.marks, prefix)) return false
  view.plugin(livePreviewPlugin).pendingSpace = null
  return true
}

export function isFormatActiveAt(view, prefix, suffix) {
  const { state } = view
  const main = state.selection.main
  const livePlugin = view.plugin(livePreviewPlugin)
  const spanKind = prefix === 'color' || prefix === 'background-color' ? prefix : ''
  if (main.empty) {
    const held = heldPendingSpace(view)
    if (held && closingMarksHold(held.marks, prefix)) return true
    const waiting = livePlugin ? livePlugin.pendingFormat : null
    if (waiting && waiting.pos === main.head) {
      // "*" italic, "**" bold, "***" both; several formats carried over a
      // line break wait together ("**<u>")
      if (waiting.prefix === prefix || pendingFormatHolds(waiting, prefix)) return true
    }
    const pair = findUntypedPair(state)
    if (pair && pair.marker === 'tag') {
      const opening = pair.text.slice(0, pair.pos - pair.from)
      if (spanKind ? spanStyleProperty(opening) === spanKind : opening.toLowerCase() === prefix) return true
    } else if (pair && /^[*_]{1,2}$/.test(prefix) && '*_'.indexOf(pair.marker) !== -1) {
      const width = pair.text.length / 2
      if (prefix.length === 2 ? width >= 2 : width % 2 === 1) return true
      // (italic at the end of a bold word: the bold is still on)
      if (pair.nested && prefix.length === 2 && pair.outerTo - pair.outerFrom >= 2) return true
      if (pair.nested && prefix.length === 1 && (pair.outerTo - pair.outerFrom) % 2 === 1) return true
    } else if (pair && pair.text === prefix + suffix) {
      return true
    }
    return findInlineFormatEnd(state, prefix) !== null
  }
  const line = state.doc.lineAt(main.from)
  if (main.to > line.to) return false
  return findInlineConstructs(state, line).some(construct => {
    const opening = state.sliceDoc(construct.from, construct.openTo)
    if (spanKind ? spanStyleProperty(opening) !== spanKind : opening.toLowerCase() !== prefix) return false
    return (construct.openTo <= main.from && main.to <= construct.closeFrom) || (construct.from === main.from && construct.to === main.to)
  })
}

const SPAN_PROPERTY_REGEX = /^<span\s+style\s*=\s*["']\s*(background-color|color)\s*:/i

// What a piece colours: 'color' for a colour span, 'background-color' for a
// highlight, which is written either as a span or as ==text==
function spanFamilyOf(state, construct) {
  const opening = state.sliceDoc(construct.from, construct.openTo)
  if (opening === '==') return 'background-color'
  const match = SPAN_PROPERTY_REGEX.exec(opening)
  return match ? match[1].toLowerCase() : ''
}

// The selection is the whole piece: its markers are not shown, so it may
// start and end on either side of them
function selectsWholeConstruct(construct, start, end) {
  return start >= construct.from && start <= construct.openTo && end >= construct.closeFrom && end <= construct.to
}

// "None" in the colour palettes: the colour (or the highlight) leaves the
// selected text, and only it. A coloured stretch the selection cuts into
// closes before the selection and opens again after it.
export function clearSpanChanges(state, from, to, property) {
  const changes = []
  const firstLine = state.doc.lineAt(from).number
  const lastLine = state.doc.lineAt(to).number
  if (lastLine - firstLine > 2000) return null
  for (let number = firstLine; number <= lastLine; number++) {
    const line = state.doc.line(number)
    const start = Math.max(from, line.from)
    const end = Math.min(to, line.to)
    if (start >= end) continue
    for (const construct of findInlineConstructs(state, line)) {
      // (no property: every inline format goes, "Clear formatting"; a link
      // is not a format)
      if (property ? spanFamilyOf(state, construct) !== property : construct.kind === 'link') continue
      if (construct.to <= start || construct.from >= end) continue
      const opening = state.sliceDoc(construct.from, construct.openTo)
      const closing = state.sliceDoc(construct.closeFrom, construct.to)
      const fromInside = start > construct.openTo
      const toInside = end < construct.closeFrom
      // (markers never against a space on their inner side: Markdown would
      // not read "**one **" as bold)
      let closeAt = start
      while (closeAt > construct.openTo && /\s/.test(state.sliceDoc(closeAt - 1, closeAt))) closeAt--
      let openAt = end
      while (openAt < construct.closeFrom && /\s/.test(state.sliceDoc(openAt, openAt + 1))) openAt++
      if (fromInside && closeAt > construct.openTo) changes.push({ from: closeAt, insert: closing })
      else changes.push({ from: construct.from, to: construct.openTo })
      if (toInside && openAt < construct.closeFrom) changes.push({ from: openAt, insert: opening })
      else changes.push({ from: construct.closeFrom, to: construct.to })
    }
  }
  if (!changes.length) return null
  changes.sort((a, b) => a.from - b.from || (a.to || a.from) - (b.to || b.from))
  return { changes, from, to }
}

// Over several lines the format goes on or off for all of them: off when
// every line already has it, on otherwise (the lines that have it are left
// as they are), instead of each line toggling on its own
export function wrapSelectionChanges(state, from, to, prefix, suffix) {
  const wrapped = wrapSelectionLines(state, from, to, prefix, suffix, false)
  if (wrapped && wrapped.off && wrapped.on) return wrapSelectionLines(state, from, to, prefix, suffix, true)
  return wrapped
}

function wrapSelectionLines(state, from, to, prefix, suffix, onOnly) {
  let off = 0
  let on = 0
  // (underline toggles like the markers do)
  const isMarker = (prefix === suffix && /^(?:\*{1,3}|_{1,3}|~~|==|`)$/.test(prefix)) || (prefix === '<u>' && suffix === '</u>')
  const spanMatch = SPAN_PROPERTY_REGEX.exec(prefix)
  const spanProperty = spanMatch ? spanMatch[1].toLowerCase() : ''
  const changes = []
  const stretches = []
  const firstLine = state.doc.lineAt(from).number
  const lastLine = state.doc.lineAt(to).number
  if (lastLine - firstLine > 2000) return null

  for (let number = firstLine; number <= lastLine; number++) {
    const line = state.doc.line(number)
    if (!line.text.trim() || UNWRAPPABLE_LINE_REGEX.test(line.text)) continue
    let inCode = false
    for (let node = syntaxTree(state).resolveInner(line.from, 1); node; node = node.parent) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') inCode = true
    }
    if (inCode) continue

    let contentFrom = line.from + LINE_BLOCK_PREFIX_REGEX.exec(line.text)[0].length
    let contentTo = line.to
    const aligned = ALIGNED_LINE_REGEX.exec(line.text)
    if (aligned) {
      contentFrom = line.from + aligned[1].length
      contentTo = line.to - aligned[4].length
    }
    let start = Math.max(from, contentFrom)
    let end = Math.min(to, contentTo)
    while (start < end && /\s/.test(state.sliceDoc(start, start + 1))) start++
    while (end > start && /\s/.test(state.sliceDoc(end - 1, end))) end--
    if (start >= end) continue

    const constructs = findInlineConstructs(state, line)
    let handled = false
    // A colour over text that already has one replaces it: the spans of the
    // same kind that lie inside the selection go
    // (a highlight is one thing, whether ==yellow== or a span of another
    // colour: either replaces the other. And the piece goes too when the
    // selection is its text, between markers that are not shown.)
    const family = spanProperty || (prefix === '==' ? 'background-color' : '')
    if (family) {
      for (const construct of constructs) {
        if (spanFamilyOf(state, construct) !== family) continue
        if (prefix === '==' && state.sliceDoc(construct.from, construct.openTo) === '==') continue
        const whole = selectsWholeConstruct(construct, start, end)
        if (!whole && (construct.from < start || construct.to > end)) continue
        if (whole) {
          start = construct.from
          end = construct.to
        }
        changes.push({ from: construct.from, to: construct.openTo }, { from: construct.closeFrom, to: construct.to })
        construct.melted = true
      }
    }
    if (isMarker) {
      const same = constructs.filter(construct =>
        state.sliceDoc(construct.from, construct.openTo).toLowerCase() === prefix && state.sliceDoc(construct.closeFrom, construct.to).toLowerCase() === suffix)
      // The selection with its own markers, or text inside the format: off
      // (its markers are not shown: the selection may start or end on either
      // side of them, it is the whole piece all the same)
      const exact = same.find(construct =>
        start >= construct.from && start <= construct.openTo && end >= construct.closeFrom && end <= construct.to)
      const inside = exact || same.find(construct => construct.openTo <= start && end <= construct.closeFrom)
      if (inside && onOnly) {
        stretches.push({ from: start, to: end })
        handled = true
      } else if (inside) {
        off++
        const innerStart = exact ? inside.openTo : start
        const innerEnd = exact ? inside.closeFrom : end
        if (innerStart === inside.openTo) changes.push({ from: inside.from, to: inside.openTo })
        else changes.push({ from: innerStart, insert: suffix })
        if (innerEnd === inside.closeFrom) changes.push({ from: inside.closeFrom, to: inside.to })
        else changes.push({ from: innerEnd, insert: prefix })
        stretches.push({ from: innerStart, to: innerEnd })
        handled = true
      } else {
        // Overlapping pieces of the same format melt into the new one
        for (const construct of same) {
          if (construct.from >= end || construct.to <= start) continue
          start = Math.min(start, construct.from)
          end = Math.max(end, construct.to)
          changes.push({ from: construct.from, to: construct.openTo }, { from: construct.closeFrom, to: construct.to })
          construct.melted = true
        }
      }
    }
    if (handled) continue

    // A piece of another format the selection only cuts into is taken whole,
    // or the two formats would cross instead of nesting
    for (let widened = true; widened;) {
      widened = false
      for (const construct of constructs) {
        if (construct.melted) continue
        const startsInside = start > construct.from && start < construct.to
        const endsInside = end > construct.from && end < construct.to
        if (startsInside && endsInside) {
          // Inside the piece: kept between its markers
          if (start < construct.openTo) {
            start = construct.openTo
            widened = true
          }
          if (end > construct.closeFrom) {
            end = construct.closeFrom
            widened = true
          }
        } else if (startsInside) {
          // (from its text to past its end, "**[word**]": the whole piece)
          start = construct.from
          widened = true
        } else if (endsInside) {
          end = construct.to
          widened = true
        }
      }
    }
    changes.push({ from: start, insert: prefix }, { from: end, insert: suffix })
    stretches.push({ from: start, to: end })
    on++
  }
  if (!stretches.length) return null
  changes.sort((a, b) => a.from - b.from || (a.to || a.from) - (b.to || b.from))
  return { changes, from: stretches[0].from, to: stretches[stretches.length - 1].to, off, on }
}

// Cut, and a paste or a drop over a selection, delete without going through
// the keys above: the same care is taken of half-covered markers here. A
// paste of several lines into an aligned line also gives each line its own
// pair of tags, instead of spreading one pair over all of them.
const protectMarkersFilter = EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || isSyntaxRevealed()) return transaction
  const cut = transaction.isUserEvent('delete.cut')
  const paste = transaction.isUserEvent('input.paste') || transaction.isUserEvent('input.drop')
  if (!cut && !paste) return transaction
  const changes = []
  transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    changes.push({ from: fromA, to: toA, text: inserted.toString() })
  })
  if (changes.length !== 1) return transaction
  const change = changes[0]
  const state = transaction.startState

  let text = change.text
  if (paste && text.indexOf('\n') !== -1) {
    const aligned = findAlignedLine(state, change.from)
    if (aligned && change.from >= aligned.innerFrom && change.to <= aligned.innerTo) {
      text = text.split('\n').join('</p>\n' + aligned.opening)
    }
  }
  const safe = change.to > change.from ? safeDeletionRanges(state, change.from, change.to, cut) : null
  if (!safe && text === change.text) return transaction

  const ranges = safe && safe.length ? safe : (change.to > change.from ? [{ from: change.from, to: change.to }] : [])
  const at = ranges.length ? ranges[0].from : change.from
  const specs = ranges.map((range, index) => (index === 0 ? { from: range.from, to: range.to, insert: text } : { from: range.from, to: range.to }))
  if (!specs.length) specs.push({ from: at, insert: text })
  return {
    changes: specs,
    selection: { anchor: at + text.length },
    userEvent: cut ? 'delete.cut' : 'input.paste',
    scrollIntoView: true
  }
})

function deleteSelectionSafely(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const selection = view.state.selection
  if (selection.ranges.length !== 1 || selection.main.empty) return false
  const ranges = safeDeletionRanges(view.state, selection.main.from, selection.main.to, true)
  if (!ranges || !ranges.length) return false
  view.dispatch({
    changes: ranges,
    selection: { anchor: ranges[0].from },
    userEvent: 'delete.selection',
    scrollIntoView: true
  })
  return true
}

// Enter in a list item, in front of a space: the space would open the new
// item ("-  rest"), where the marker and its spaces are one piece and what is
// typed lands behind them, stuck to the next word. It goes, as the editor's
// own Enter does on a plain line.
function dropSpacesAfterCaretOnEnter(view) {
  const { state } = view
  const main = state.selection.main
  if (state.readOnly || !main.empty) return false
  const line = state.doc.lineAt(main.head)
  const prefix = LIST_ITEM_PREFIX_REGEX.exec(line.text)
  if (!prefix || main.head < line.from + prefix[0].length) return false
  if (syntaxTree(state).resolveInner(line.from + prefix[1].length, 1).name !== 'ListMark') return false
  let end = main.head
  while (end < line.to && /[ \t]/.test(state.sliceDoc(end, end + 1))) end++
  if (end > main.head && end < line.to) view.dispatch({ changes: { from: main.head, to: end }, userEvent: 'delete' })
  return false
}

// Enter inside a bold word (or a link, a colour, some inline code): the line
// is about to be cut there, by the editor or by one of the handlers above,
// and each half needs its own markers: "- **bo|ld**" would otherwise become
// "- **bo" and "- ld**", two lines of stars. At the edge of a word the caret
// simply steps outside it first.
function carryFormatsOverEnter(view, format) {
  setTimeout(() => {
    const livePlugin = view.plugin(livePreviewPlugin)
    const main = view.state.selection.main
    if (!livePlugin || !main.empty || view.state.readOnly) return
    livePlugin.pendingFormat = { pos: main.head, prefix: format.prefix, suffix: format.suffix }
    view.dispatch({ effects: refreshLivePreviewEffect.of(null) })
  }, 0)
}

// The format waiting at the caret for its first character is asked for
// again: it is turned off
export function dropPendingFormat(view, prefix) {
  const livePlugin = view.plugin(livePreviewPlugin)
  const waiting = livePlugin ? livePlugin.pendingFormat : null
  const main = view.state.selection.main
  if (!waiting || !main.empty || waiting.pos !== main.head || !pendingFormatHolds(waiting, prefix)) return false
  // (the other formats waiting with it stay)
  const kept = []
  for (const piece of splitPendingFormat(waiting)) {
    if (/^[*_]{1,3}$/.test(piece.prefix) && /^[*_]{1,2}$/.test(prefix)) {
      const left = piece.prefix.length - prefix.length
      if (left > 0) kept.push({ prefix: piece.prefix.slice(0, left), suffix: piece.suffix.slice(0, left) })
    } else if (!pendingFormatHolds({ prefix: piece.prefix }, prefix)) {
      kept.push(piece)
    }
  }
  livePlugin.pendingFormat = kept.length
    ? { pos: waiting.pos, prefix: kept.map(piece => piece.prefix).join(''), suffix: kept.slice().reverse().map(piece => piece.suffix).join('') }
    : null
  view.dispatch({ effects: refreshLivePreviewEffect.of(null) })
  return true
}

// "**<u>" + "</u>**" as its formats, outermost first
function splitPendingFormat(waiting) {
  const pieces = []
  const openings = waiting.prefix.match(/<[^<>]+>|\*{1,3}|_{1,3}|~~|==|`/g) || []
  const closings = (waiting.suffix.match(/<\/[^<>]+>|\*{1,3}|_{1,3}|~~|==|`/g) || []).reverse()
  openings.forEach((prefix, index) => pieces.push({ prefix, suffix: closings[index] || '' }))
  return pieces
}

function pendingFormatHolds(waiting, prefix) {
  if (prefix === 'color' || prefix === 'background-color') {
    return (waiting.prefix.match(/<span\b[^<>]*>/gi) || []).some(tag => spanStyleProperty(tag) === prefix)
  }
  if (/^[*_]{1,3}$/.test(prefix)) {
    const stars = (waiting.prefix.match(/[*_]/g) || []).length
    return prefix.length === 3 ? stars === 3 : (prefix.length === 2 ? stars >= 2 : stars % 2 === 1)
  }
  return waiting.prefix.toLowerCase().indexOf(prefix.toLowerCase()) !== -1
}

function splitInlineFormatsOnEnter(view) {
  // (in live preview too: the stars are in sight there, but a bold word cut
  // over two list items is no more wanted)
  if (view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const waitingPlugin = view.plugin(livePreviewPlugin)
  const waitingFormat = waitingPlugin ? waitingPlugin.pendingFormat : null
  if (waitingFormat && waitingFormat.pos === main.head && !isSyntaxRevealed() &&
      state.doc.lineAt(main.head).text.replace(LIST_ITEM_PREFIX_REGEX, '').trim() === '' && !LIST_ITEM_PREFIX_REGEX.test(state.doc.lineAt(main.head).text)) {
    carryFormatsOverEnter(view, waitingFormat)
    return false
  }
  // Raw places are left alone, inline code excepted: it is one of the
  // formats found below, and cannot run over two lines either
  let inInlineCode = false
  for (let node = syntaxTree(state).resolveInner(main.head, -1); node; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return false
    if (node.name === 'InlineCode') inInlineCode = true
  }
  if (!inInlineCode && isRawTypingContext(state, main.head)) return false
  const line = state.doc.lineAt(main.head)
  const constructs = findInlineConstructs(state, line)
  if (!constructs.length) return false

  let pos = main.head
  // (the formats whose text ends at the caret, innermost first)
  const ended = []
  for (let moved = true; moved;) {
    moved = false
    for (const construct of constructs) {
      if (construct.openTo === pos && construct.closeFrom > pos) {
        pos = construct.from
        moved = true
      } else if (construct.closeFrom === pos && construct.openTo < pos) {
        pos = construct.to
        ended.push(construct)
        moved = true
      }
    }
  }
  const around = constructs
    .filter(construct => construct.openTo < pos && pos < construct.closeFrom)
    .sort((a, b) => a.from - b.from)
  if (!around.length) {
    if (pos !== main.head) view.dispatch({ selection: { anchor: pos } })
    // Rich text: bold typed up to the end of the line goes on on the next
    // one, as it does in an HTML note. Nothing is written until a character
    // is typed (armPendingFormat), so a line left empty stays empty.
    const carried = ended.filter(construct => construct.kind === 'mark')
    if (carried.length && !isSyntaxRevealed()) {
      carryFormatsOverEnter(view, {
        prefix: carried.slice().reverse().map(construct => state.sliceDoc(construct.from, construct.openTo)).join(''),
        suffix: carried.map(construct => state.sliceDoc(construct.closeFrom, construct.to)).join('')
      })
    }
    return false
  }
  const closing = around.slice().reverse().map(construct => state.sliceDoc(construct.closeFrom, construct.to)).join('')
  const opening = around.map(construct => state.sliceDoc(construct.from, construct.openTo)).join('')
  view.dispatch({
    changes: { from: pos, insert: closing + opening },
    selection: { anchor: pos + closing.length },
    userEvent: 'input'
  })
  // (the markers just written around the caret are not an empty pair waiting
  // for its text, which the next handler would take back)
  const livePlugin = view.plugin(livePreviewPlugin)
  if (livePlugin) livePlugin.emptyPair = null
  // Once the line is broken, the caret goes inside the markers reopened on
  // the new line: what is typed next carries the format on
  setTimeout(() => {
    const head = view.state.selection.main.head
    if (view.state.selection.main.empty && view.state.sliceDoc(head, head + opening.length) === opening) {
      view.dispatch({ selection: { anchor: head + opening.length } })
    }
  }, 0)
  // The line itself is broken by whoever comes next
  return false
}

// Ctrl+Backspace and Ctrl+Delete take a word, and would take the hidden
// markers standing next to it with it. The word is found past those markers,
// and what is deleted keeps the markers of any format it only covers in part.
function deleteWordSafely(view, forward) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  const constructs = findInlineConstructs(state, line)
  if (!constructs.length) return false

  let pos = main.head
  for (let moved = true; moved;) {
    moved = false
    for (const construct of constructs) {
      if (!forward && construct.to === pos && construct.closeFrom < pos) {
        pos = construct.closeFrom
        moved = true
      } else if (forward && construct.from === pos && construct.openTo > pos) {
        pos = construct.openTo
        moved = true
      }
    }
  }
  const target = view.moveByGroup(EditorSelection.cursor(pos), forward).head
  let from = Math.min(pos, target)
  let to = Math.max(pos, target)
  // (a word, not the line break and what follows)
  from = Math.max(from, line.from)
  to = Math.min(to, line.to)
  if (from === to) return false
  let ranges = safeDeletionRanges(state, from, to, true)
  if (!ranges) {
    if (pos === main.head) return false
    ranges = [{ from, to }]
  }
  if (!ranges.length) return true
  const widened = ranges.map(range => widenOverEmptyConstructs(constructs, range))
  view.dispatch({
    changes: widened,
    selection: { anchor: widened[0].from },
    userEvent: forward ? 'delete.forward' : 'delete.backward',
    scrollIntoView: true
  })
  return true
}

// Delete at the end of a line brings the next line up: its text, not the
// bullet, the "##" or the ">" it starts with, which would otherwise show up
// as characters in the middle of the joined line
function joinNextLineOnDelete(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  if (main.head !== line.to || line.number === state.doc.lines || !line.text.trim()) return false
  if (isRawTypingContext(state, main.head)) return false
  const next = state.doc.line(line.number + 1)
  const prefix = LINE_BLOCK_PREFIX_REGEX.exec(next.text)[0]
  if (!prefix.trim()) return false
  const name = syntaxTree(state).resolveInner(next.from + /^\s*/.exec(next.text)[0].length, 1).name
  if (name !== 'ListMark' && name !== 'HeaderMark' && name !== 'QuoteMark') return false
  view.dispatch({ changes: { from: line.to, to: next.from + prefix.length }, userEvent: 'delete.forward' })
  return true
}

// Enter at the very start of a heading's text makes room above it; the
// heading stays the heading (the editor would leave an empty "##" line there
// and turn the title under it into ordinary text)
function openLineAboveHeadingOnEnter(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  const mark = /^ {0,3}#{1,6}[ \t]+/.exec(line.text)
  if (!mark || main.head > line.from + mark[0].length || line.length === mark[0].length) return false
  if (syntaxTree(state).resolveInner(line.from + /^ */.exec(line.text)[0].length, 1).name !== 'HeaderMark') return false
  view.dispatch({
    changes: { from: line.from, insert: '\n' },
    selection: { anchor: line.from + 1 + mark[0].length },
    userEvent: 'input',
    scrollIntoView: true
  })
  return true
}

// Rich text, next to a table (which is never shown as source): Backspace
// and Delete must not pull a line of text into the table's last or first row,
// and Enter at its end starts a line under it instead of a table row.
function findTableEdge(state, pos) {
  return getRenderedBlocks(state.doc).find(block => block.kind === 'table' && (block.to === pos || block.from === pos)) || null
}

function guardTableOnBackspace(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  if (findTableEdge(state, main.head)) return true
  if (main.head !== line.from || line.number === 1) return false
  const table = findTableEdge(state, line.from - 1)
  if (!table || table.to !== line.from - 1) return false
  // An empty line under the table goes; a line of text stays where it is
  if (!line.length) view.dispatch({ changes: { from: line.from - 1, to: line.from }, userEvent: 'delete.backward' })
  return true
}

function guardTableOnDelete(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  const atTable = findTableEdge(state, main.head)
  if (atTable && atTable.from === main.head) return true
  if (main.head !== line.to || line.number === state.doc.lines) return false
  const next = state.doc.line(line.number + 1)
  const table = findTableEdge(state, next.from)
  if (atTable) {
    // At the end of the table: an empty line under it goes
    if (!next.length) view.dispatch({ changes: { from: line.to, to: next.to }, userEvent: 'delete.forward' })
    return true
  }
  if (!table || table.from !== next.from) return false
  if (!line.length) view.dispatch({ changes: { from: line.from, to: next.from }, userEvent: 'delete.forward' })
  return true
}

function leaveTableOnEnter(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const main = view.state.selection.main
  const table = main.empty ? findTableEdge(view.state, main.head) : null
  if (!table) return false
  const at = table.to === main.head ? table.to : table.from
  // After the table: a line under it. In front of it: a line above it.
  view.dispatch(table.to === main.head
    ? { changes: { from: at, insert: '\n' }, selection: { anchor: at + 1 }, userEvent: 'input', scrollIntoView: true }
    : { changes: { from: at, insert: '\n' }, selection: { anchor: at }, userEvent: 'input', scrollIntoView: true })
  return true
}

// An arrow key in the empty pair a formatting command just wrote: the pair
// is given up. (Its two halves are not drawn, so the arrow would otherwise
// only step from the middle of the pair to its edge, with nothing to see.)
function dropArmedPairOnArrow(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const livePlugin = view.plugin(livePreviewPlugin)
  const pair = livePlugin ? livePlugin.emptyPair : null
  const main = view.state.selection.main
  if (!pair || !main.empty || main.head < pair.from || main.head > (pair.hideTo || pair.to)) return false
  if (view.state.sliceDoc(pair.from, pair.to) !== pair.text) return false
  view.dispatch({ changes: { from: pair.from, to: pair.to }, selection: { anchor: pair.from }, userEvent: 'delete' })
  return true
}

// Rich text, the arrow keys along a line: the two sides of markers that are
// not drawn are one place on the screen, and an arrow pressed there moved
// nothing. In the middle of a line they are now one stop, as in any rich
// text editor: at the end of a bold word the caret is in the bold (what is
// typed there is bold), in front of it the caret is outside. At the very end
// of a line the stop outside is kept: Arrow right there is the way out of the
// format when nothing follows it.
function hiddenMarkerStops(state, line) {
  const constructs = findInlineConstructs(state, line)
  const walk = (pos, from, to) => {
    for (let moved = true; moved;) {
      moved = false
      for (const construct of constructs) {
        if (construct[from] === pos && construct[to] !== pos) {
          pos = construct[to]
          moved = true
        }
      }
    }
    return pos
  }
  return {
    pastClosing: pos => walk(pos, 'closeFrom', 'to'),
    pastOpening: pos => walk(pos, 'from', 'openTo'),
    beforeClosing: pos => walk(pos, 'to', 'closeFrom'),
    beforeOpening: pos => walk(pos, 'openTo', 'from')
  }
}

// (raw places keep the editor's own arrows; inline code is not one of them
// here, its backticks are hidden like any other marker)
function arrowsLeftAlone(state, pos) {
  if (!isRawTypingContext(state, pos)) return false
  for (const side of [-1, 1]) {
    for (let node = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true
      if (node.name === 'InlineCode') return false
    }
  }
  return true
}

function arrowRightOverHiddenMarkers(view) {
  if (isSyntaxRevealed()) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  if (main.head === line.to || arrowsLeftAlone(state, main.head)) return false
  const stops = hiddenMarkerStops(state, line)
  let pos = stops.pastClosing(main.head)
  // (end of the line: the stop outside the format stays)
  if (pos > main.head && pos === line.to) return false
  pos = stops.pastOpening(pos)
  if (pos === main.head || pos === line.to) return false
  // The editor's own arrow then moves one character from there
  view.dispatch({ selection: { anchor: pos } })
  return false
}

function arrowLeftOverHiddenMarkers(view) {
  if (isSyntaxRevealed()) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  if (main.head === line.from || arrowsLeftAlone(state, main.head)) return false
  const stops = hiddenMarkerStops(state, line)
  // On the far side of markers already: same place as their near side
  const here = stops.beforeOpening(stops.beforeClosing(main.head))
  if (here < main.head) {
    if (here === line.from) {
      view.dispatch({ selection: { anchor: here }, scrollIntoView: true, userEvent: 'select' })
      return true
    }
    view.dispatch({ selection: { anchor: here } })
    return false
  }
  // One character to the left, then through the markers found there
  const before = line.from + findClusterBreak(line.text, main.head - line.from, false)
  const target = stops.beforeOpening(stops.beforeClosing(before))
  if (target === before) return false
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true, userEvent: 'select' })
  return true
}

// Backspace in the empty pair a formatting command just wrote takes the
// pair back
function deleteArmedPairOnBackspace(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const livePlugin = view.plugin(livePreviewPlugin)
  const pair = livePlugin ? livePlugin.emptyPair : null
  const main = view.state.selection.main
  if (!pair || !main.empty || main.head < pair.from || main.head > (pair.hideTo || pair.to)) return false
  if (view.state.sliceDoc(pair.from, pair.to) !== pair.text) return false
  view.dispatch({ changes: { from: pair.from, to: pair.to }, selection: { anchor: pair.from }, userEvent: 'delete.backward' })
  return true
}

// The same two keys from the other side: Backspace at the start of the line
// under an aligned one, Delete at the end of the line above one. The line
// break they delete has a tag on its other side.
function joinIntoAlignedLineOnBackspace(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  const line = state.doc.lineAt(main.head)
  if (!main.empty || main.head !== line.from || line.number === 1 || findAlignedLine(state, line.from)) return false
  const previous = findAlignedLine(state, line.from - 1)
  if (!previous) return false
  view.dispatch({
    changes: [
      { from: previous.innerTo, insert: line.text },
      { from: previous.line.to, to: line.to }
    ],
    selection: { anchor: previous.innerTo },
    userEvent: 'delete.backward',
    scrollIntoView: true
  })
  return true
}

function joinAlignedLineBelowOnDelete(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  const line = state.doc.lineAt(main.head)
  if (!main.empty || main.head !== line.to || line.number === state.doc.lines || findAlignedLine(state, line.from)) return false
  const next = findAlignedLine(state, line.to + 1)
  if (!next) return false
  // An empty line simply goes; text takes the next line's text, unaligned
  const changes = line.length === 0
    ? { from: line.from, to: next.line.from }
    : { from: line.to, to: next.line.to, insert: state.sliceDoc(next.innerFrom, next.innerTo) }
  view.dispatch({ changes, selection: { anchor: line.to }, userEvent: 'delete.forward' })
  return true
}

// Backspace on the space that waits behind a bold word: once the last one is
// gone the caret is back inside the markers, where the word ends
function deletePendingSpaceOnBackspace(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const livePlugin = view.plugin(livePreviewPlugin)
  const pending = livePlugin ? livePlugin.pendingSpace : null
  const main = view.state.selection.main
  if (!pending || !main.empty || main.head !== pending.to) return false
  if (view.state.sliceDoc(pending.from, pending.to) !== pending.marks + pending.spaces) return false
  const spaces = pending.spaces.slice(0, -1)
  view.dispatch({
    changes: { from: pending.to - 1, to: pending.to },
    selection: { anchor: spaces ? pending.to - 1 : pending.from },
    userEvent: 'delete.backward'
  })
  livePlugin.pendingSpace = spaces ? { from: pending.from, to: pending.to - 1, marks: pending.marks, spaces } : null
  return true
}

const SPACES_REGEX = /^[ \t\u00a0]+$/

// Rich text, Tab on a line of text: four spaces at the caret, as in an HTML
// note (non-breaking ones in turn, or Markdown shows a single space). The
// editor's own Tab indents the line, and a line indented twice is read as a
// code block. In a list, in code and in a table Tab keeps its own meaning.
export function insertTabSpacesInText(view) {
  if (isSyntaxRevealed() || view.state.readOnly || !view.plugin(livePreviewPlugin)) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  if (LIST_ITEM_PREFIX_REGEX.test(line.text) || /^\s*\|/.test(line.text)) return false
  if (isRawTypingContext(state, main.head)) return false
  const insert = '\u00a0 \u00a0 '
  view.dispatch({ changes: { from: main.head, insert }, selection: { anchor: main.head + insert.length }, userEvent: 'input.type', scrollIntoView: true })
  return true
}

export function swallowShiftTabInText(view) {
  if (isSyntaxRevealed() || view.state.readOnly || !view.plugin(livePreviewPlugin)) return false
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  if (LIST_ITEM_PREFIX_REGEX.test(line.text) || /^\s*\|/.test(line.text) || isRawTypingContext(view.state, view.state.selection.main.head)) return false
  return true
}

// Where the text of a line starts, past the bullet, number, task box, "#" or
// ">" that rich text never shows
function lineTextStart(state, line) {
  const item = LIST_ITEM_PREFIX_REGEX.exec(line.text)
  if (item && syntaxTree(state).resolveInner(line.from + item[1].length, 1).name === 'ListMark') return line.from + item[0].length
  const block = /^ {0,3}(?:#{1,6}[ \t]+|(?:>[ \t]?)+)/.exec(line.text)
  if (block) {
    const name = syntaxTree(state).resolveInner(line.from + /^ */.exec(line.text)[0].length, 1).name
    if (name === 'HeaderMark' || name === 'QuoteMark') return line.from + block[0].length
  }
  return line.from
}

// Home goes to the start of the text, not in front of a marker that is not
// drawn (where Backspace would glue the line to the one above, marker and all)
function homeToTextStart(view, extend) {
  if (isSyntaxRevealed()) return false
  const { state } = view
  const main = state.selection.main
  const line = state.doc.lineAt(main.head)
  const start = lineTextStart(state, line)
  // (only where the editor's own Home would end up in front of the marker:
  // on a wrapped line it goes to the start of the row the caret is on)
  if (start === line.from || main.head <= start || view.moveToLineBoundary(main, false).head >= start) return false
  view.dispatch({ selection: extend ? EditorSelection.range(main.anchor, start) : EditorSelection.cursor(start), scrollIntoView: true, userEvent: 'select' })
  return true
}

// Backspace with the caret in front of such a marker acts on the item, as if
// the caret stood at the start of its text
function backspaceBeforeHiddenMarker(view) {
  if (isSyntaxRevealed() || view.state.readOnly) return false
  const { state } = view
  const main = state.selection.main
  if (!main.empty) return false
  const line = state.doc.lineAt(main.head)
  const start = lineTextStart(state, line)
  if (start === line.from || main.head >= start) return false
  view.dispatch({ selection: { anchor: start } })
  return false
}

const richTextKeymap = Prec.highest(keymap.of([
  { key: 'Tab', run: insertTabSpacesInText, shift: swallowShiftTabInText },
  { key: 'Home', run: view => homeToTextStart(view, false), shift: view => homeToTextStart(view, true) },
  { key: 'Backspace', run: backspaceBeforeHiddenMarker },
  { key: 'Backspace', run: guardTableOnBackspace },
  { key: 'Delete', run: guardTableOnDelete },
  { key: 'Enter', run: leaveTableOnEnter },
  { key: 'Backspace', run: deleteSelectionSafely },
  { key: 'Delete', run: deleteSelectionSafely },
  { key: 'Backspace', run: deleteArmedPairOnBackspace },
  { key: 'ArrowLeft', run: dropArmedPairOnArrow },
  { key: 'ArrowRight', run: dropArmedPairOnArrow },
  { key: 'ArrowLeft', run: arrowLeftOverHiddenMarkers },
  { key: 'ArrowRight', run: arrowRightOverHiddenMarkers },
  { key: 'Backspace', run: deletePendingSpaceOnBackspace },
  { key: 'Mod-Backspace', run: view => deleteWordSafely(view, false) },
  { key: 'Mod-Delete', run: view => deleteWordSafely(view, true) },
  { key: 'Enter', run: dropSpacesAfterCaretOnEnter },
  { key: 'Enter', run: openLineAboveHeadingOnEnter },
  { key: 'Enter', run: splitInlineFormatsOnEnter },
  { key: 'Enter', run: splitAlignedLineOnEnter },
  { key: 'Backspace', run: unalignLineOnBackspace },
  { key: 'Delete', run: joinAlignedLineOnDelete },
  { key: 'Backspace', run: joinIntoAlignedLineOnBackspace },
  { key: 'Delete', run: joinAlignedLineBelowOnDelete },
  { key: 'Backspace', run: view => deleteAcrossHiddenMarkers(view, false) },
  { key: 'Delete', run: view => deleteAcrossHiddenMarkers(view, true) },
  { key: 'Delete', run: joinNextLineOnDelete },
  { key: 'Enter', run: leaveEmptyItemOnEnter },
  { key: 'Enter', run: leaveMarksOnEnter },
  { key: 'Enter', run: leaveCodeBlockOnEnter },
  { key: 'ArrowDown', run: leaveCodeBlockOnArrowDown }
]))

const literalTypingInput = Prec.highest(EditorView.inputHandler.of((view, from, to, text) => {
  if (isSyntaxRevealed() || view.state.readOnly || !text) return false
  // Once the place or the document has been changed here, the insertion is
  // made here too
  let redirected = false

  // Typed with the caret against a drawn table: the text is not a cell of
  // its last row, it goes on a line of its own
  if (from === to) {
    const table = findTableEdge(view.state, from)
    if (table) {
      const after = table.to === from
      const insert = after ? '\n' + text : text + '\n'
      view.dispatch({
        changes: { from, insert },
        selection: { anchor: after ? from + insert.length : from + text.length },
        userEvent: 'input.type',
        scrollIntoView: true
      })
      return true
    }
  }

  // Typed over a selection that covers only part of a bold word (or a link, a
  // colour...): its hidden markers stay, see safeDeletionRanges()
  if (from < to && text.length <= 2) {
    const ranges = safeDeletionRanges(view.state, from, to, false)
    if (ranges && ranges.length && !(ranges.length === 1 && ranges[0].from === from && ranges[0].to === to)) {
      view.dispatch({ changes: ranges, selection: { anchor: ranges[0].from }, userEvent: 'delete.selection' })
      from = to = ranges[0].from
      redirected = true
    }
  }

  // Typed over a selection that starts on hidden syntax (a whole quote line,
  // "> " included): the browser replaces what it draws and leaves the hidden
  // marker in the line, so the marker comes back here in front of the typed
  // character. It is not typed text, and must not be escaped as if it were.
  if (from < to && text.length > 1) {
    const replaced = view.state.sliceDoc(from, to)
    let kept = 0
    while (kept < text.length - 1 && kept < replaced.length && text.charAt(kept) === replaced.charAt(kept)) kept++
    from += kept
    text = text.slice(kept)
  }

  // On a fence line of a code block (the badge's line, or the empty line that
  // closes the block) nothing typed may land in the fence itself: it goes to
  // the code, as a first or as a new last line
  if (from === to) {
    const fence = findClosedFence(view.state, from)
    const fenceLine = fence ? view.state.doc.lineAt(from).number : 0
    if (fence && (fenceLine === fence.first.number || fenceLine === fence.last.number)) {
      const at = fenceLine === fence.first.number ? fence.first.to + 1 : fence.last.from
      const empty = fence.last.number === fence.first.number + 1
      const insert = fenceLine === fence.first.number && !empty ? text : text + '\n'
      view.dispatch({
        changes: { from: at, insert },
        selection: { anchor: at + text.length },
        userEvent: 'input.type',
        scrollIntoView: true
      })
      return true
    }
  }

  // The caret can sit in front of a line's hidden marker ("## " of a heading
  // just inserted on an empty line, "> " of a quote): the browser cannot tell
  // the two sides of text that is not drawn apart. Nobody means to type in
  // front of a marker they cannot see: the text goes after it.
  if (from === to) {
    const marker = syntaxTree(view.state).resolveInner(from, 1)
    if ((marker.name === 'HeaderMark' || marker.name === 'QuoteMark') && marker.from === from) {
      let after = marker.to
      while (after < view.state.doc.lineAt(from).to && view.state.doc.sliceString(after, after + 1) === ' ') after++
      from = to = after
      redirected = true
    }
    // Same in front of, or inside, the marker of a list item (bullet, number,
    // task box): the text belongs to the item
    const itemLine = view.state.doc.lineAt(from)
    const itemMarker = LIST_ITEM_PREFIX_REGEX.exec(itemLine.text)
    if (itemMarker && from < itemLine.from + itemMarker[0].length &&
        syntaxTree(view.state).resolveInner(itemLine.from + itemMarker[1].length, 1).name === 'ListMark') {
      from = to = itemLine.from + itemMarker[0].length
      redirected = true
    }
  }

  const livePlugin = view.plugin(livePreviewPlugin)
  const pair = livePlugin ? livePlugin.emptyPair : null

  // The first character typed into a format that was waiting for it
  // (armPendingFormat): the two go into the note together
  const waiting = livePlugin ? livePlugin.pendingFormat : null
  if (waiting && from === to && view.state.selection.main.empty && view.state.selection.main.head === waiting.pos &&
      Array.from(text).length === 1 && !/\s/.test(text)) {
    const typedText = (needsEscape(text, view.state.doc.lineAt(waiting.pos).text.slice(0, waiting.pos - view.state.doc.lineAt(waiting.pos).from)) ? '\\' : '') + text
    const insert = waiting.prefix + typedText + waiting.suffix
    livePlugin.pendingFormat = null
    view.dispatch({
      changes: { from: waiting.pos, insert },
      selection: { anchor: waiting.pos + waiting.prefix.length + typedText.length },
      userEvent: 'input.type',
      scrollIntoView: true
    })
    return true
  }

  // The caret was put on the far side of hidden markers ("Back to normal
  // text" moves it past the closing ** of a bold word) and the browser, which
  // cannot tell the two sides of text it does not draw apart, typed on the
  // near side. The editor's own caret is the one that counts.
  const caret = view.state.selection.main
  if (!redirected && from === to && caret.empty && caret.head !== from && !(pair && from >= pair.from && from <= (pair.hideTo || pair.to))) {
    // (only syntax that is never shown lies between the two)
    const low = Math.min(from, caret.head)
    const high = Math.max(from, caret.head)
    let covered = low
    if (livePlugin && view.state.doc.lineAt(low).number === view.state.doc.lineAt(high).number) {
      livePlugin.atomic.between(low, high, (hiddenFrom, hiddenTo) => {
        if (hiddenFrom <= covered && hiddenTo > covered) covered = hiddenTo
      })
    }
    if (covered >= high) {
      from = to = caret.head
      redirected = true
    }
  }

  // A space at the edge of a bold word (see findClosingMarksEnd) is written
  // outside the markers, where the note shows it just the same. Typed at the
  // end, it is remembered: the word typed next takes the space back in with
  // it, so that a sentence typed in bold stays one stretch of bold.
  if (from === to && livePlugin) {
    const { state } = view
    const pending = livePlugin.pendingSpace
    const held = pending && from === pending.to &&
      state.sliceDoc(pending.from, pending.to) === pending.marks + pending.spaces ? pending : null

    if (SPACES_REGEX.test(text)) {
      let at = -1
      let anchor = -1
      let next = null
      if (held) {
        at = from
        anchor = from + text.length
        next = { from: held.from, to: anchor, marks: held.marks, spaces: held.spaces + text }
      } else if (pair && pair.nested && from >= pair.from && from <= pair.hideTo) {
        // An italic asked for at the end of a bold word, then a space: the
        // pair has no room in front of it, it goes, and the space is written
        // after the bold
        view.dispatch({
          changes: [{ from: pair.from, to: pair.to }, { from: pair.hideTo, insert: text }],
          selection: { anchor: pair.hideTo - (pair.to - pair.from) + text.length },
          userEvent: 'input.type',
          scrollIntoView: true
        })
        return true
      } else if (pair && '*_~='.indexOf(pair.marker) !== -1 && from >= pair.from && from <= pair.to) {
        // Nothing typed in the pair yet: the space goes in front of it
        at = pair.from
        anchor = pair.pos + text.length
      } else if (!isRawTypingContext(state, from)) {
        const end = findClosingMarksEnd(state, from)
        const start = end > from ? from : findOpeningMarksStart(state, from)
        if (end > from && /\S/.test(state.sliceDoc(from - 1, from))) {
          at = end
          anchor = end + text.length
          next = { from, to: anchor, marks: state.sliceDoc(from, end), spaces: text }
        } else if (start < from && /\S/.test(state.sliceDoc(from, from + 1))) {
          at = start
          anchor = from + text.length
        }
      }
      if (at !== -1) {
        view.dispatch({
          changes: { from: at, insert: text },
          selection: { anchor },
          userEvent: 'input.type',
          scrollIntoView: true
        })
        livePlugin.pendingSpace = next
        return true
      }
    } else if (held && !/^\s/.test(text)) {
      const inside = held.from + held.spaces.length
      view.dispatch({
        changes: { from: held.from, to: held.to, insert: held.spaces + held.marks },
        selection: { anchor: inside },
        userEvent: 'input.type'
      })
      from = to = inside
      redirected = true
    }
  }

  // Same for the empty pair of markers a formatting command just wrote: the
  // text goes in its middle, wherever in the pair the caret was reported
  if (pair && from === to && from >= pair.from && from <= (pair.hideTo || pair.to) && from !== pair.pos) {
    from = to = pair.pos
    redirected = true
  }

  if (isRawTypingContext(view.state, from)) return false

  const line = view.state.doc.lineAt(from)
  let before = line.text.slice(0, from - line.from)
  let insert = ''
  let escaped = false
  // One character at a time is typing. A longer text comes from the page
  // (a menu writing a link through the DOM), from a paste or from dictation:
  // like pasted text it keeps its Markdown.
  const typed = Array.from(text).length === 1
  for (const character of text) {
    if (character === '\n') {
      before = ''
    } else if (typed && needsEscape(character, before)) {
      insert += '\\'
      escaped = true
    }
    insert += character
    if (character !== '\n') before += character
  }

  // The editor's own pairing of * _ ~ ` would turn one typed marker into an
  // empty pair of them, and its HTML support closes a tag on ">": these go
  // in as typed, past the other input handlers
  if (!escaped && !redirected && !/[*_~`>]/.test(text)) return false

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.type',
    scrollIntoView: true
  })
  return true
}))

function findTaskMarkerAt(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'TaskMarker') return node
    if (node.name === 'Task') return node.getChild('TaskMarker')
  }
  return null
}

const livePreviewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view
    this.pointerDown = false
    this.stale = false
    this.emptyPair = null
    this.pendingSpace = null
    this.pendingFormat = null
    this.rebuild(view)
    // (once the editor sits in its note: the choices are kept per note)
    setTimeout(() => {
      try {
        restoreCodeLineNumbers(this.view)
      } catch (error) {
        // (the editor was closed in the meantime)
      }
    }, 0)

    // Markers stay as they are while a pointer selection is being dragged:
    // revealing them mid-drag would move the text under the pointer. They
    // also wait a moment after the button is released, or the second click of
    // a double-click would land on text the first one had just pushed aside.
    this.refreshTimer = null
    this.onPointerUp = () => {
      if (!this.pointerDown) return
      clearTimeout(this.refreshTimer)
      this.refreshTimer = setTimeout(() => {
        this.pointerDown = false
        if (this.stale) {
          this.stale = false
          this.view.dispatch({ effects: refreshLivePreviewEffect.of(null) })
        }
      }, POINTER_SETTLE_DELAY)
    }
    document.addEventListener('mouseup', this.onPointerUp, true)
    document.addEventListener('dragend', this.onPointerUp, true)
  }

  update(update) {
    // A format waiting for its first character (armPendingFormat) is given
    // up as soon as the caret moves or the note changes
    if (this.pendingFormat && (update.docChanged || (update.selectionSet && update.state.selection.main.head !== this.pendingFormat.pos))) {
      this.pendingFormat = null
    }

    // The space typed after a bold word only waits for the word that follows
    // it while the caret stays behind it (literalTypingInput)
    if (this.pendingSpace && (update.docChanged || update.selectionSet) &&
        update.state.selection.main.head !== this.pendingSpace.to) {
      this.pendingSpace = null
    }

    // A deletion left a space against the inside of closing markers: it goes
    // after them, and waits there for the next word like a space just typed
    if (update.docChanged && !isSyntaxRevealed() && !update.state.readOnly && findStrandedSpace(update.state)) {
      setTimeout(() => {
        const stranded = findStrandedSpace(this.view.state)
        if (!stranded || isSyntaxRevealed()) return
        moveStrandedSpaceOut(this.view, stranded)
        if (!stranded.leading) {
          this.pendingSpace = { from: stranded.from, to: stranded.to, marks: stranded.marks, spaces: stranded.spaces }
        }
      }, 0)
    }

    // An empty pair counts from the change that wrote it, not when the caret
    // merely walks into four stars that were already in the note (a rule)
    if (update.docChanged) {
      this.emptyPair = isSyntaxRevealed() ? null : findUntypedPair(update.state)
      this.changedAt = Date.now()
    } else if (!this.emptyPair && update.selectionSet && Date.now() - (this.changedAt || 0) < 400 && !isSyntaxRevealed()) {
      // The toolbar and the menus write the pair, then place the caret in it
      // in a second step
      this.emptyPair = findUntypedPair(update.state)
    }

    // The caret left an empty pair of markers without typing in it: the pair
    // goes, or it would stay in the note as a rule, a fence or stray stars
    if (this.emptyPair && update.selectionSet && !update.docChanged) {
      const pair = this.emptyPair
      const main = update.state.selection.main
      // (anywhere in the pair: the browser cannot hold a caret between two
      // stretches of text that are not drawn, and reports its start instead)
      if (!(main.empty && main.head >= pair.from && main.head <= (pair.hideTo || pair.to))) {
        this.emptyPair = null
        setTimeout(() => {
          const state = this.view.state
          if (pair.to > state.doc.length || state.sliceDoc(pair.from, pair.to) !== pair.text) return
          this.view.dispatch({ changes: { from: pair.from, to: pair.to }, userEvent: 'delete' })
        }, 0)
      }
    }

    // Same when the editor itself is left (the title, another note): the
    // caret never moves then. A menu that takes the focus for a moment and
    // gives it back keeps its pair.
    if (this.emptyPair && update.focusChanged && !update.view.hasFocus) {
      const pair = this.emptyPair
      setTimeout(() => {
        const state = this.view.state
        if (this.view.hasFocus || this.emptyPair !== pair || state.readOnly) return
        if (pair.to > state.doc.length || state.sliceDoc(pair.from, pair.to) !== pair.text) return
        this.emptyPair = null
        this.view.dispatch({ changes: { from: pair.from, to: pair.to }, userEvent: 'delete' })
      }, 300)
    }

    const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state)
    const refreshed = update.transactions.some(transaction =>
      transaction.effects.some(effect => effect.is(refreshLivePreviewEffect) || effect.is(setCodeLineNumbersEffect) || effect.is(setToggleOpenEffect))
    )

    if (update.docChanged || update.viewportChanged || treeChanged || refreshed) {
      this.rebuild(update.view)
      this.stale = false
      return
    }

    if (update.selectionSet || update.focusChanged) {
      if (this.pointerDown) {
        this.stale = true
        return
      }
      this.rebuild(update.view)
    }
  }

  rebuild(view) {
    const built = buildLivePreviewDecorations(view, this.emptyPair, this.pendingFormat)
    this.decorations = built.decorations
    this.atomic = built.atomic
  }

  destroy() {
    clearTimeout(this.refreshTimer)
    document.removeEventListener('mouseup', this.onPointerUp, true)
    document.removeEventListener('dragend', this.onPointerUp, true)
  }
}, {
  decorations: plugin => plugin.decorations,
  eventHandlers: {
    mousedown(event, view) {
      const target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement
      if (!target) return false

      // A right click on a picture or a diagram opens its menu
      // (js/note-image-menu.js). Left to itself the browser would also put the
      // caret there, the source would come back in place of the picture, and
      // the menu would be acting on an element that is gone.
      if (event.button === 2 && target.closest('.cm-live-image-wrap, .markdown-excalidraw-render')) {
        event.preventDefault()
        return true
      }
      if (event.button !== 0) return false

      // A click on a task box ticks it, like in the preview
      const task = target.closest('.cm-live-task')
      if (task && !view.state.readOnly) {
        const marker = findTaskMarkerAt(view.state, view.posAtDOM(task))
        if (marker) {
          const checked = /x/i.test(view.state.doc.sliceString(marker.from, marker.to))
          view.dispatch({
            changes: { from: marker.from, to: marker.to, insert: checked ? '[ ]' : '[x]' },
            userEvent: 'input'
          })
          event.preventDefault()
          return true
        }
      }

      // The triangle of a toggle folds and unfolds it; a click on the title
      // itself puts the caret there, which is how the title is edited
      const toggleHeader = target.closest('.cm-live-toggle-header')
      const toggleHeaderLeft = toggleHeader
        ? toggleHeader.getBoundingClientRect().left + (parseFloat(window.getComputedStyle(toggleHeader).paddingLeft) || 0)
        : 0
      if (toggleHeader && event.clientX <= toggleHeaderLeft + 22) {
        const line = view.state.doc.lineAt(view.posAtDOM(toggleHeader))
        const toggle = getToggles(view.state.doc).find(candidate => candidate.summaryLine === line.number)
        if (toggle) {
          view.dispatch({ effects: setToggleOpenEffect.of({ pos: toggle.from, on: !isToggleOpen(view.state, toggle) }) })
          event.preventDefault()
          return true
        }
      }

      // The language badge opens the picker the preview uses
      // (js/code-block-language.js); the click handler below does it, this
      // only keeps the caret out of the block
      if (target.closest('.cm-live-code-lang')) {
        event.preventDefault()
        return true
      }

      // Line numbers of a code block, on or off
      const lines = target.closest('.cm-live-code-lines')
      if (lines) {
        const block = findFencedCodeAt(view.state, view.posAtDOM(lines))
        if (block) {
          const info = block.getChild('CodeInfo')
          const language = info ? view.state.doc.sliceString(info.from, info.to).trim().split(/\s+/)[0] : ''
          const numbered = !areCodeLineNumbersOn(view.state, block.from, language)
          view.dispatch({ effects: setCodeLineNumbersEffect.of({ pos: block.from, on: numbered }) })
          storeCodeLineNumbers(view, block.from, numbered)
        }
        event.preventDefault()
        return true
      }

      // The bin of a code block: the block goes, with the line it stood on
      const remove = target.closest('.cm-live-code-delete')
      if (remove) {
        const block = view.state.readOnly ? null : findFencedCodeAt(view.state, view.posAtDOM(remove))
        if (block) {
          const doc = view.state.doc
          const from = doc.lineAt(block.from).from
          let to = doc.lineAt(block.to).to
          if (to < doc.length) to++
          else if (from > 0) {
            view.dispatch({ changes: { from: from - 1, to }, selection: { anchor: from - 1 }, userEvent: 'delete', scrollIntoView: true })
            view.focus()
            event.preventDefault()
            return true
          }
          view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: 'delete', scrollIntoView: true })
          view.focus()
        }
        event.preventDefault()
        return true
      }

      // The copy button of a code block, as in the preview
      const copy = target.closest('.cm-live-code-copy')
      if (copy) {
        const block = findFencedCodeAt(view.state, view.posAtDOM(copy))
        const text = block ? block.getChild('CodeText') : null
        const code = text ? view.state.doc.sliceString(text.from, text.to) : ''
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(code).then(() => {
            const icon = copy.querySelector('i')
            if (!icon) return
            icon.className = 'lucide lucide-check'
            setTimeout(() => { icon.className = 'lucide lucide-copy' }, 1200)
          }).catch(() => {})
        }
        event.preventDefault()
        return true
      }

      // Live preview: Ctrl/Cmd + click follows a link, a plain click edits it.
      // Rich text: there is no address to edit under the caret, a plain click
      // follows the link as it does in the preview. Either way the click
      // handler below does the opening; this keeps the caret where it is.
      const link = target.closest('[data-live-href]')
      if (link && (event.ctrlKey || event.metaKey || !isSyntaxRevealed()) && isSafeUrl(link.getAttribute('data-live-href'))) {
        event.preventDefault()
        return true
      }

      clearTimeout(this.refreshTimer)
      this.pointerDown = true
      return false
    },

    click(event, view) {
      const target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement

      const link = target && event.button === 0 ? target.closest('[data-live-href]') : null
      if (link && (event.ctrlKey || event.metaKey || !isSyntaxRevealed())) {
        const href = link.getAttribute('data-live-href')
        if (isSafeUrl(href)) {
          followLink(href)
          event.preventDefault()
          return true
        }
      }
      const badge = target && event.button === 0 ? target.closest('.cm-live-code-lang') : null
      if (!badge || view.state.readOnly || typeof window.openCodeBlockLanguageModal !== 'function') return false

      const block = findFencedCodeAt(view.state, view.posAtDOM(badge) + 1)
      if (!block) return false
      const info = block.getChild('CodeInfo')
      const blockFrom = block.from

      window.openCodeBlockLanguageModal({
        language: info ? view.state.doc.sliceString(info.from, info.to).trim() : '',
        // The block is looked up again: the modal stayed open for a while
        apply(language) {
          const current = findFencedCodeAt(view.state, Math.min(blockFrom + 1, view.state.doc.length))
          if (!current) return
          const currentInfo = current.getChild('CodeInfo')
          const opening = current.getChild('CodeMark')
          const from = currentInfo ? currentInfo.from : (opening ? opening.to : current.from)
          const to = currentInfo ? currentInfo.to : from
          view.dispatch({ changes: { from, to, insert: language }, userEvent: 'input' })
          // Back from the modal, so that Ctrl+Z reaches the change
          view.focus()
        }
      })
      event.preventDefault()
      return true
    }
  }
})

export const livePreview = [
  codeLineNumbersField,
  toggleOpenField,
  renderedBlocksField,
  literalTypingInput,
  richTextKeymap,
  alignedCaretFilter,
  protectMarkersFilter,
  livePreviewPlugin,
  EditorView.atomicRanges.of(view => {
    const plugin = view.plugin(livePreviewPlugin)
    return plugin ? plugin.atomic : Decoration.none
  }),
  EditorView.editorAttributes.of({ class: 'cm-live-preview' })
]
