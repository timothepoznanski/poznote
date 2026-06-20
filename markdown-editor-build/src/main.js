import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion, startCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage, insertNewlineContinueMarkup } from '@codemirror/lang-markdown'
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { Compartment, EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, drawSelection, highlightActiveLine, keymap, placeholder } from '@codemirror/view'
import { tags as syntaxTags } from '@lezer/highlight'

const instances = new WeakMap()
let lastActiveHost = null

const setSearchEffect = StateEffect.define()
const clearSearchEffect = StateEffect.define()

const searchHighlightField = StateField.define({
  create() {
    return Decoration.none
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(clearSearchEffect)) {
        return Decoration.none
      }
      if (effect.is(setSearchEffect)) {
        const payload = effect.value || {}
        return buildSearchDecorations(payload.matches || [], payload.activeIndex)
      }
    }

    if (transaction.docChanged) {
      return Decoration.none
    }

    return value.map(transaction.changes)
  },
  provide: field => EditorView.decorations.from(field)
})

const excalidrawBlockRegex = /<div\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bexcalidraw-container\b[^"']*\1)[^>]*>[\s\S]*?<\/div>/gi

function getExcalidrawBlocks(text) {
  const source = String(text || '')
  const blocks = []
  excalidrawBlockRegex.lastIndex = 0

  let match
  while ((match = excalidrawBlockRegex.exec(source)) !== null) {
    const from = match.index
    const to = from + match[0].length
    blocks.push({
      from,
      to,
      rawHtml: match[0]
    })
  }

  return blocks
}

class ExcalidrawPlaceholderWidget extends WidgetType {
  constructor(summary) {
    super()
    this.summary = summary
  }

  eq(other) {
    return other.summary === this.summary
  }

  toDOM() {
    const placeholder = document.createElement('span')
    placeholder.className = 'markdown-excalidraw-placeholder'
    placeholder.setAttribute('contenteditable', 'false')
    placeholder.setAttribute('spellcheck', 'false')
    placeholder.setAttribute('data-summary', this.summary)
    placeholder.setAttribute('title', this.summary)
    return placeholder
  }

  ignoreEvent() {
    return false
  }
}

function buildExcalidrawSummary(rawHtml) {
  const diagramIdMatch = String(rawHtml || '').match(/\bdata-diagram-id=(['"])(.*?)\1/i)
  const diagramId = diagramIdMatch && diagramIdMatch[2] ? ' #' + diagramIdMatch[2] : ''
  return 'Excalidraw' + diagramId + ' ...'
}

function buildExcalidrawDecorations(doc) {
  const text = doc.toString()
  const decorations = []

  getExcalidrawBlocks(text).forEach(block => {
    const lineStart = block.from === 0 || text.charAt(block.from - 1) === '\n'
    const lineEnd = block.to === text.length || text.charAt(block.to) === '\n'

    decorations.push(Decoration.replace({
      widget: new ExcalidrawPlaceholderWidget(buildExcalidrawSummary(block.rawHtml)),
      block: lineStart && lineEnd
    }).range(block.from, block.to))
  })

  return Decoration.set(decorations, true)
}

const excalidrawPlaceholderField = StateField.define({
  create(state) {
    return buildExcalidrawDecorations(state.doc)
  },
  update(value, transaction) {
    if (transaction.docChanged) {
      return buildExcalidrawDecorations(transaction.state.doc)
    }

    return value.map(transaction.changes)
  },
  provide: field => EditorView.decorations.from(field)
})

const CODE_BLOCK_LANGUAGES = [
  'javascript', 'typescript', 'python', 'html', 'css', 'json', 'bash', 'powershell',
  'sql', 'php', 'java', 'csharp', 'cpp', 'go', 'rust', 'ruby', 'yaml', 'xml',
  'markdown', 'mermaid', 'text'
]

const HTML_TAGS = [
  'a', 'audio', 'br', 'code', 'details', 'div', 'em', 'iframe', 'img', 'kbd',
  'mark', 'p', 'pre', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'u', 'video'
]

const VOID_HTML_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link'])

const poznoteHighlightStyle = HighlightStyle.define([
  { tag: syntaxTags.keyword, class: 'poznote-cm-keyword' },
  { tag: [syntaxTags.atom, syntaxTags.bool, syntaxTags.null], class: 'poznote-cm-atom' },
  { tag: [syntaxTags.string, syntaxTags.character, syntaxTags.attributeValue], class: 'poznote-cm-string' },
  { tag: [syntaxTags.number, syntaxTags.integer, syntaxTags.float], class: 'poznote-cm-number' },
  { tag: [syntaxTags.comment, syntaxTags.lineComment, syntaxTags.blockComment, syntaxTags.docComment], class: 'poznote-cm-comment' },
  { tag: [syntaxTags.function(syntaxTags.variableName), syntaxTags.function(syntaxTags.propertyName), syntaxTags.definition(syntaxTags.function(syntaxTags.variableName))], class: 'poznote-cm-function' },
  { tag: [syntaxTags.variableName, syntaxTags.propertyName, syntaxTags.attributeName], class: 'poznote-cm-variable' },
  { tag: [syntaxTags.typeName, syntaxTags.className, syntaxTags.tagName], class: 'poznote-cm-type' },
  { tag: [syntaxTags.operator, syntaxTags.punctuation, syntaxTags.bracket, syntaxTags.angleBracket], class: 'poznote-cm-punctuation' },
  { tag: syntaxTags.meta, class: 'poznote-cm-meta' },
  { tag: syntaxTags.heading, class: 'poznote-cm-heading' },
  { tag: syntaxTags.link, class: 'poznote-cm-link' },
  { tag: syntaxTags.emphasis, class: 'poznote-cm-emphasis' },
  { tag: syntaxTags.strong, class: 'poznote-cm-strong' },
  { tag: syntaxTags.monospace, class: 'poznote-cm-monospace' },
  { tag: syntaxTags.strikethrough, class: 'poznote-cm-strikethrough' },
  { tag: syntaxTags.invalid, class: 'poznote-cm-invalid' }
])

const markdownBlockOptions = [
  snippetCompletion('# ${heading}', { label: '/h1', type: 'keyword', detail: 'Heading 1' }),
  snippetCompletion('## ${heading}', { label: '/h2', type: 'keyword', detail: 'Heading 2' }),
  snippetCompletion('### ${heading}', { label: '/h3', type: 'keyword', detail: 'Heading 3' }),
  snippetCompletion('- ${item}', { label: '/list', type: 'keyword', detail: 'Bullet list' }),
  snippetCompletion('1. ${item}', { label: '/numbered', type: 'keyword', detail: 'Numbered list' }),
  snippetCompletion('- [ ] ${task}', { label: '/task', type: 'keyword', detail: 'Task item' }),
  snippetCompletion('> ${quote}', { label: '/quote', type: 'keyword', detail: 'Blockquote' }),
  snippetCompletion('> Note\n> ${content}', { label: '/callout', type: 'keyword', detail: 'Callout' }),
  snippetCompletion('```${language}\n${code}\n```', { label: '/code', type: 'function', detail: 'Code block' }),
  snippetCompletion('| ${Column 1} | ${Column 2} |\n| --- | --- |\n| ${Cell 1} | ${Cell 2} |', { label: '/table', type: 'function', detail: 'Table' }),
  snippetCompletion('---', { label: '/hr', type: 'keyword', detail: 'Horizontal rule' }),
  snippetCompletion('<details>\n<summary>${summary}</summary>\n\n${content}\n</details>', { label: '/details', type: 'keyword', detail: 'Toggle block' })
]

const markdownInlineOptions = [
  snippetCompletion('**${text}**', { label: '/bold', type: 'keyword', detail: 'Bold text' }),
  snippetCompletion('*${text}*', { label: '/italic', type: 'keyword', detail: 'Italic text' }),
  snippetCompletion('`${code}`', { label: '/code', type: 'function', detail: 'Inline code' }),
  snippetCompletion('~~${text}~~', { label: '/strike', type: 'keyword', detail: 'Strikethrough' }),
  snippetCompletion('[${text}](${url})', { label: '/link', type: 'function', detail: 'Link' }),
  snippetCompletion('![${alt}](${url})', { label: '/image', type: 'function', detail: 'Image' }),
]

function buildSearchDecorations(matches, activeIndex) {
  const decorations = matches
    .filter(match => match && Number.isFinite(match.from) && Number.isFinite(match.to) && match.to > match.from)
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map((match, index) => Decoration.mark({
      class: 'search-replace-highlight' + (index === activeIndex ? ' active' : '')
    }).range(match.from, match.to))

  return Decoration.set(decorations, true)
}

function markdownCompletionSource(context) {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const languageMatch = before.match(/^(\s*```)([\w#+.-]*)$/)

  if (languageMatch) {
    const from = line.from + languageMatch[1].length
    return {
      from,
      options: CODE_BLOCK_LANGUAGES.map(language => ({
        label: language,
        type: 'keyword',
        detail: 'Code block language'
      })),
      validFor: /^[\w#+.-]*$/
    }
  }

  const htmlMatch = before.match(/<([a-zA-Z][\w-]*)?$/)
  if (htmlMatch) {
    return {
      from: context.pos - (htmlMatch[1] || '').length,
      options: HTML_TAGS.map(tag => {
        const completion = VOID_HTML_TAGS.has(tag)
          ? snippetCompletion(tag + '>', { label: tag, type: 'type', detail: 'HTML tag' })
          : snippetCompletion(tag + '>${}</' + tag + '>', { label: tag, type: 'type', detail: 'HTML tag' })
        return completion
      }),
      validFor: /^[\w-]*$/
    }
  }

  const token = context.matchBefore(/[\/#>*+\-[\]\w`!|]{0,40}$/)
  if (!token || (!context.explicit && token.text.length === 0)) {
    return null
  }

  const linePrefix = context.state.sliceDoc(line.from, token.from)
  const isAtLineStart = linePrefix.trim() === ''
  const isSlashCommand = token.text.startsWith('/')

  if (!context.explicit && !isSlashCommand) {
    return null
  }

  const options = isAtLineStart
    ? [...markdownBlockOptions, ...markdownInlineOptions]
    : markdownInlineOptions

  return {
    from: token.from,
    options,
    validFor: /^[\/#>*+\-[\]\w`!|]*$/
  }
}

function wrapSelection(prefix, suffix) {
  return function run(view) {
    const ranges = view.state.selection.ranges
    if (!ranges.some(range => !range.empty)) {
      return false
    }

    view.dispatch(view.state.changeByRange(range => {
      const selected = view.state.sliceDoc(range.from, range.to)
      const insert = prefix + selected + suffix
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelectionRange(range.from + prefix.length, range.from + prefix.length + selected.length)
      }
    }))
    return true
  }
}

function EditorSelectionRange(anchor, head) {
  return EditorSelection.range(anchor, head)
}

function runMarkdownTableEnter(host) {
  return function run() {
    if (!host || typeof window.handleMarkdownTableEnter !== 'function') {
      return false
    }

    const noteEntry = host.closest ? host.closest('.noteentry') : null
    const noteId = noteEntry && noteEntry.id ? noteEntry.id.replace(/^entry/, '') : null
    if (!noteEntry || !noteId) {
      return false
    }

    return !!window.handleMarkdownTableEnter({
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {},
      stopPropagation() {}
    }, host, noteEntry, noteId)
  }
}

function createReadOnlyExtensions(readOnly) {
  return [
    EditorState.readOnly.of(!!readOnly),
    EditorView.editable.of(!readOnly)
  ]
}

function isDarkThemeActive() {
  const root = document.documentElement
  return !!(
    root && root.getAttribute('data-theme') === 'dark' ||
    document.body && document.body.classList.contains('dark-mode')
  )
}

function createThemeExtensions() {
  return [
    EditorView.darkTheme.of(isDarkThemeActive())
  ]
}

function observeThemeChanges(instance) {
  if (typeof MutationObserver === 'undefined') {
    return null
  }

  const updateTheme = () => {
    instance.view.dispatch({
      effects: instance.themeCompartment.reconfigure(createThemeExtensions())
    })
  }

  const observer = new MutationObserver(updateTheme)
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class']
    })
  }
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    })
  }

  return observer
}

function getInstance(host) {
  return host ? instances.get(host) : null
}

function getValue(host) {
  const instance = getInstance(host)
  return instance ? instance.view.state.doc.toString() : ''
}

function setValue(host, value, options = {}) {
  const instance = getInstance(host)
  if (!instance) return false

  const nextValue = String(value || '')
  const currentValue = instance.view.state.doc.toString()
  if (currentValue === nextValue) return true

  const previousHead = instance.view.state.selection.main.head
  const nextHead = Math.min(previousHead, nextValue.length)
  const transaction = {
    changes: { from: 0, to: currentValue.length, insert: nextValue }
  }

  if (options.preserveSelection !== false) {
    transaction.selection = { anchor: nextHead }
  }

  instance.view.dispatch(transaction)

  return true
}

function setReadOnly(host, readOnly) {
  const instance = getInstance(host)
  if (!instance) return false

  instance.view.dispatch({
    effects: instance.readOnlyCompartment.reconfigure(createReadOnlyExtensions(!!readOnly))
  })

  host.classList.toggle('markdown-editor-readonly', !!readOnly)
  host.setAttribute('aria-readonly', readOnly ? 'true' : 'false')
  return true
}

function focus(host) {
  const instance = getInstance(host)
  if (!instance) return false
  instance.view.focus()
  return true
}

function hasFocus(host) {
  const instance = getInstance(host)
  return !!(instance && instance.view.hasFocus)
}

function getLastActiveEditor() {
  return lastActiveHost && getInstance(lastActiveHost) ? lastActiveHost : null
}

function getSelectionOffsets(host) {
  const instance = getInstance(host)
  if (!instance) return null
  const range = instance.view.state.selection.main
  return {
    start: Math.min(range.from, range.to),
    end: Math.max(range.from, range.to)
  }
}

function setSelection(host, start, end = start) {
  const instance = getInstance(host)
  if (!instance) return false

  const docLength = instance.view.state.doc.length
  const anchor = Math.max(0, Math.min(start, docLength))
  const head = Math.max(0, Math.min(end, docLength))

  instance.view.dispatch({
    selection: { anchor, head },
    effects: EditorView.scrollIntoView(head, { y: 'nearest' })
  })
  instance.view.focus()
  return true
}

function replaceRange(host, start, end, replacement) {
  const instance = getInstance(host)
  if (!instance) return false

  const docLength = instance.view.state.doc.length
  const from = Math.max(0, Math.min(start, docLength))
  const to = Math.max(from, Math.min(end, docLength))
  const insert = String(replacement || '')
  const head = from + insert.length

  instance.view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: head },
    scrollIntoView: true,
    userEvent: 'input'
  })
  instance.view.focus()
  return true
}

function getCoordsAtPos(host, position) {
  const instance = getInstance(host)
  if (!instance) return null
  const docLength = instance.view.state.doc.length
  const pos = Math.max(0, Math.min(position, docLength))
  return instance.view.coordsAtPos(pos)
}

function scrollToPos(host, position, y = 'nearest') {
  const instance = getInstance(host)
  if (!instance) return false
  const docLength = instance.view.state.doc.length
  const pos = Math.max(0, Math.min(position, docLength))
  instance.view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y })
  })
  instance.view.focus()
  return true
}

function revealPos(host, position, y = 'nearest') {
  const instance = getInstance(host)
  if (!instance) return false
  const docLength = instance.view.state.doc.length
  const pos = Math.max(0, Math.min(position, docLength))
  instance.view.dispatch({
    effects: EditorView.scrollIntoView(pos, { y })
  })
  return true
}

function findMatches(host, query) {
  const instance = getInstance(host)
  if (!instance || !query) {
    clearSearch(host)
    return []
  }

  const text = instance.view.state.doc.toString()
  const needle = String(query).toLowerCase()
  const haystack = text.toLowerCase()
  const hiddenBlocks = getExcalidrawBlocks(text)
  const matches = []
  let index = 0
  let hiddenIndex = 0

  while (needle && (index = haystack.indexOf(needle, index)) !== -1) {
    const from = index
    const to = index + needle.length

    while (hiddenIndex < hiddenBlocks.length && hiddenBlocks[hiddenIndex].to <= from) {
      hiddenIndex++
    }

    const hiddenBlock = hiddenBlocks[hiddenIndex]
    const isHidden = hiddenBlock && hiddenBlock.from < to && hiddenBlock.to > from
    if (!isHidden) {
      matches.push({ from, to })
    }

    index += Math.max(needle.length, 1)
  }

  setSearchMatches(host, matches, matches.length ? 0 : -1)
  return matches
}

function setSearchMatches(host, matches, activeIndex) {
  const instance = getInstance(host)
  if (!instance) return false

  instance.view.dispatch({
    effects: setSearchEffect.of({
      matches,
      activeIndex
    })
  })

  if (matches[activeIndex]) {
    instance.view.dispatch({
      effects: EditorView.scrollIntoView(matches[activeIndex].from, { y: 'center' })
    })
  }

  return true
}

function clearSearch(host) {
  const instance = getInstance(host)
  if (!instance) return false
  instance.view.dispatch({ effects: clearSearchEffect.of(null) })
  return true
}

function createEditor(host, options = {}) {
  if (!host) return null

  const existing = getInstance(host)
  if (existing) {
    setValue(host, options.value || '', { preserveSelection: false })
    setReadOnly(host, !!options.readOnly)
    return existing
  }

  const readOnlyCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const placeholderText = String(options.placeholder || '')

  host.textContent = ''
  host.removeAttribute('contenteditable')
  host.setAttribute('data-codemirror-enabled', 'true')
  host.classList.add('markdown-codemirror-host')

  const updateListener = EditorView.updateListener.of(update => {
    if (!update.docChanged) return

    const value = update.state.doc.toString()
    host.setAttribute('data-codemirror-value', value)

    try {
      host.dispatchEvent(new Event('input', { bubbles: true }))
    } catch (error) {
      // Ignore synthetic event failures in older browsers.
    }
  })

  const domHandlers = EditorView.domEventHandlers({
    focus() {
      lastActiveHost = host

      try {
        host.dispatchEvent(new FocusEvent('focus', { bubbles: false }))
      } catch (error) {
        host.dispatchEvent(new Event('focus'))
      }
    }
  })

  const state = EditorState.create({
    doc: String(options.value || ''),
    extensions: [
      history(),
      drawSelection(),
      bracketMatching(),
      closeBrackets({
        brackets: ['(', '[', '{', "'", '"']
      }),
      EditorView.inputHandler.of((view, from, to, insert) => {
        if (insert !== '*' && insert !== '_' && insert !== '~' && insert !== '`') return false
        const doc = view.state.doc
        const charAfter = to < doc.length ? doc.sliceString(to, to + 1) : ''
        // Skip if next char is same (avoid tripling on existing pair)
        if (charAfter === insert) return false
        view.dispatch({
          changes: { from, to, insert: insert + insert },
          selection: { anchor: from + 1 }
        })
        return true
      }),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        addKeymap: false
      }),
      markdownLanguage.data.of({
        autocomplete: markdownCompletionSource
      }),
      syntaxHighlighting(poznoteHighlightStyle),
      autocompletion({
        activateOnTyping: true,
        icons: true
      }),
      highlightSelectionMatches(),
      searchHighlightField,
      excalidrawPlaceholderField,
      placeholder(placeholderText),
      EditorView.lineWrapping,
      readOnlyCompartment.of(createReadOnlyExtensions(!!options.readOnly)),
      themeCompartment.of(createThemeExtensions()),
      updateListener,
      domHandlers,
      keymap.of([
        { key: 'Enter', run: runMarkdownTableEnter(host) },
        { key: 'Enter', run: insertNewlineContinueMarkup },
        { key: 'Mod-Space', run: startCompletion },
        { key: 'Ctrl-Space', run: startCompletion },
        { key: 'Mod-b', run: wrapSelection('**', '**') },
        ...closeBracketsKeymap,
        ...completionKeymap,
        { key: 'Mod-i', run: wrapSelection('*', '*') },
        indentWithTab,
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap
      ])
    ]
  })

  const view = new EditorView({
    state,
    parent: host
  })

  const instance = {
    view,
    readOnlyCompartment,
    themeCompartment,
    themeObserver: null
  }
  instance.themeObserver = observeThemeChanges(instance)

  instances.set(host, instance)
  host.setAttribute('data-codemirror-value', state.doc.toString())
  setReadOnly(host, !!options.readOnly)

  return instance
}

function destroyEditor(host) {
  const instance = getInstance(host)
  if (!instance) return false
  if (instance.themeObserver) {
    instance.themeObserver.disconnect()
  }
  instance.view.destroy()
  instances.delete(host)
  if (lastActiveHost === host) {
    lastActiveHost = null
  }
  host.removeAttribute('data-codemirror-enabled')
  host.classList.remove('markdown-codemirror-host')
  return true
}

window.PoznoteMarkdownCodeMirror = {
  createEditor,
  destroyEditor,
  getValue,
  getLastActiveEditor,
  setValue,
  setReadOnly,
  focus,
  hasFocus,
  getSelectionOffsets,
  setSelection,
  replaceRange,
  getCoordsAtPos,
  scrollToPos,
  revealPos,
  findMatches,
  setSearchMatches,
  clearSearch,
  isCodeMirrorEditor(host) {
    return !!getInstance(host)
  }
}
