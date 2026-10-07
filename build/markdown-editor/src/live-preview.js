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
import { Prec, RangeSet, RangeValue, StateEffect, StateField } from '@codemirror/state'
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

function renderMediaLine(text) {
  if (typeof window.parseMarkdown !== 'function') return null
  try {
    const template = document.createElement('template')
    template.innerHTML = window.parseMarkdown(text)
    return template.content.querySelector('iframe, audio, video')
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
    if (media) {
      media.addEventListener('load', () => view.requestMeasure())
      media.addEventListener('loadedmetadata', () => view.requestMeasure())
      wrapper.appendChild(media)
    } else {
      wrapper.textContent = this.text
    }
    return wrapper
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

// The buttons in the corner of a block: line numbers, then copy
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

function buildLivePreviewDecorations(view, armedPair) {
  const { state } = view
  const doc = state.doc
  const selection = state.selection.ranges
  const tree = syntaxTree(state)
  const decorations = []

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
        if (!touches(opening.from, to)) {
          hide(opening.from, opening.to)
          hide(from, to)
        }
      }
    }

    if (text.indexOf('==') !== -1) {
      const highlightRegex = /==(?=\S)([^=\n]*?\S)==/g
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
    hide(line.from, line.from + match[1].length)
    hide(line.to - match[4].length, line.to)
  }

  function decorateMedia(line) {
    if (line.text.indexOf('<') === -1 || !MEDIA_LINE_REGEX.test(line.text)) return
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
            hide(node.from, next === ' ' ? node.to + 1 : node.to)
            return
          }

          case 'ListMark': {
            const item = node.node.parent
            const list = item && item.parent
            if (!list || list.name !== 'BulletList') return
            const isTask = !!item.getChild('Task')
            decorations.push((isTask ? taskBulletDecoration : bulletDecoration).range(node.from, node.to))
            return
          }

          case 'TaskMarker': {
            const checked = /x/i.test(doc.sliceString(node.from, node.to))
            decorations.push((checked ? taskCheckedDecoration : taskDecoration).range(node.from, node.to))
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
    decorations.push(Decoration.widget({ widget: new EmptyPairWidget(emptyPair.marker), side: 1 }).range(emptyPair.pos))
    decorations.push(emptyPairMarker.range(emptyPair.pos, emptyPair.to))
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
    return block
  }

  destroy(dom) {
    if (dom && dom._livePreviewResizeObserver) dom._livePreviewResizeObserver.disconnect()
  }

  ignoreEvent() {
    return false
  }
}

function buildRenderedBlockDecorations(state) {
  if (typeof window.parseMarkdown !== 'function') return Decoration.none

  const doc = state.doc
  const selection = state.selection.ranges
  const toggles = getToggles(doc)
  const decorations = []

  getRenderedBlocks(doc).forEach(block => {
    if (selection.some(range => range.from <= block.to && range.to >= block.from)) return

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
        transaction.effects.some(effect => effect.is(setToggleOpenEffect))) {
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
function findEmptyMarkerPair(state) {
  const selection = state.selection
  if (selection.ranges.length !== 1 || !selection.main.empty) return null
  const pos = selection.main.head
  const line = state.doc.lineAt(pos)
  const offset = pos - line.from
  const marker = line.text.charAt(offset - 1)
  if (!marker || '*_~=`'.indexOf(marker) === -1 || line.text.charAt(offset) !== marker) return null

  let before = 0
  while (offset - 1 - before >= 0 && line.text.charAt(offset - 1 - before) === marker) before++
  let after = 0
  while (offset + after < line.text.length && line.text.charAt(offset + after) === marker) after++
  if (before !== after) return null
  if ((marker === '~' || marker === '=') ? before !== 2 : before > 3) return null

  return { from: pos - before, to: pos + after, pos, line: line.number, marker, text: marker.repeat(before * 2) }
}

// What stands in the middle of an empty pair until its text is typed. The
// two halves of the pair are text of no size, and a caret drawn between them
// had no height: this gives it one. For inline code it is also the start of
// the code's grey ground, so that one sees where the code will go.
class EmptyPairWidget extends WidgetType {
  constructor(marker) {
    super()
    this.marker = marker
  }

  eq(other) {
    return other.marker === this.marker
  }

  toDOM() {
    const strut = document.createElement('span')
    strut.className = 'cm-live-pair-strut' + (this.marker === '`' ? ' cm-live-pair-code' : '')
    strut.setAttribute('aria-hidden', 'true')
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

const richTextKeymap = Prec.highest(keymap.of([
  { key: 'Enter', run: leaveCodeBlockOnEnter },
  { key: 'ArrowDown', run: leaveCodeBlockOnArrowDown }
]))

const literalTypingInput = Prec.highest(EditorView.inputHandler.of((view, from, to, text) => {
  if (isSyntaxRevealed() || view.state.readOnly || !text) return false

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
  let redirected = false
  if (from === to) {
    const marker = syntaxTree(view.state).resolveInner(from, 1)
    if ((marker.name === 'HeaderMark' || marker.name === 'QuoteMark') && marker.from === from) {
      let after = marker.to
      while (after < view.state.doc.lineAt(from).to && view.state.doc.sliceString(after, after + 1) === ' ') after++
      from = to = after
      redirected = true
    }
  }

  // Same for the empty pair of markers a formatting command just wrote: the
  // text goes in its middle, wherever in the pair the caret was reported
  const livePlugin = view.plugin(livePreviewPlugin)
  const pair = livePlugin ? livePlugin.emptyPair : null
  if (pair && from === to && from >= pair.from && from <= pair.to && from !== pair.pos) {
    from = to = pair.pos
    redirected = true
  }

  if (isRawTypingContext(view.state, from)) return false

  const line = view.state.doc.lineAt(from)
  let before = line.text.slice(0, from - line.from)
  let insert = ''
  let escaped = false
  for (const character of text) {
    if (character === '\n') {
      before = ''
    } else if (needsEscape(character, before)) {
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
    this.rebuild(view)

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
    // An empty pair counts from the change that wrote it, not when the caret
    // merely walks into four stars that were already in the note (a rule)
    if (update.docChanged) {
      this.emptyPair = isSyntaxRevealed() ? null : findEmptyMarkerPair(update.state)
      this.changedAt = Date.now()
    } else if (!this.emptyPair && update.selectionSet && Date.now() - (this.changedAt || 0) < 400 && !isSyntaxRevealed()) {
      // The toolbar and the menus write the pair, then place the caret in it
      // in a second step
      this.emptyPair = findEmptyMarkerPair(update.state)
    }

    // The caret left an empty pair of markers without typing in it: the pair
    // goes, or it would stay in the note as a rule, a fence or stray stars
    if (this.emptyPair && update.selectionSet && !update.docChanged) {
      const pair = this.emptyPair
      const main = update.state.selection.main
      // (anywhere in the pair: the browser cannot hold a caret between two
      // stretches of text that are not drawn, and reports its start instead)
      if (!(main.empty && main.head >= pair.from && main.head <= pair.to)) {
        this.emptyPair = null
        setTimeout(() => {
          const state = this.view.state
          if (pair.to > state.doc.length || state.sliceDoc(pair.from, pair.to) !== pair.text) return
          this.view.dispatch({ changes: { from: pair.from, to: pair.to }, userEvent: 'delete' })
        }, 0)
      }
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
    const built = buildLivePreviewDecorations(view, this.emptyPair)
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
          view.dispatch({
            effects: setCodeLineNumbersEffect.of({
              pos: block.from,
              on: !areCodeLineNumbersOn(view.state, block.from, language)
            })
          })
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

      // Ctrl/Cmd + click follows a link; a plain click edits it
      const link = target.closest('[data-live-href]')
      if (link && (event.ctrlKey || event.metaKey)) {
        const href = link.getAttribute('data-live-href')
        if (isSafeUrl(href)) {
          window.open(href, '_blank', 'noopener')
          event.preventDefault()
          return true
        }
      }

      clearTimeout(this.refreshTimer)
      this.pointerDown = true
      return false
    },

    click(event, view) {
      const target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement
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
  livePreviewPlugin,
  EditorView.atomicRanges.of(view => {
    const plugin = view.plugin(livePreviewPlugin)
    return plugin ? plugin.atomic : Decoration.none
  }),
  EditorView.editorAttributes.of({ class: 'cm-live-preview' })
]
