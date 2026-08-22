# Stylesheets

Plain CSS, no build step: the files in this directory are served as they are
(edit, reload). This note explains how they are organised and loaded, how the
themes work and which variables a custom stylesheet can rely on.

## Layout

| Path | What it styles |
|---|---|
| `base.css`, `layout.css`, `utilities.css`, `variables.css` | index.php shell: fonts, columns, hide/show helpers |
| `sidebar.css`, `icon-sidebar*.css`, `searchbars.css`, `menus.css`, `toolbar.css`, `tabs.css`, `outline.css` | left column, icon rail, menus, note toolbar, tab bar |
| `notes/`, `folders/` | note rows and folder rows of the sidebar tree, note editor (`notes/noteentry.css`), folder/note action menus (`folders/actions-menu.css`) |
| `modals/`, `modal-alerts.css` | dialogs shared by index.php and the standalone pages |
| `markdown.css`, `code-blocks.css`, `syntax-highlight.css`, `checklists.css`, `table-picker.css`, `slash-commands.css`, `emoji-*.css` | editor features |
| `kanban.css`, `calendar.css`, `dashboard.css`, `tasks*.css`, `diary.css`, `graph.css`, `excalidraw*.css` | views and tools |
| `home/`, `settings.css`, `list_tags.css`, `favorites.css`, `trash.css`, `workspaces.css`, `users.css`, `git-sync.css`, `backup_export.css`, `restore_import/`, `attachments*/`, `admin-tools.css`, `webhooks.css`, `info.css` | standalone pages (one file per page, plus `shared/` for the list pages) |
| `public_note.css`, `public_folder.css`, `login.css` | pages served without a session |
| `dark-mode/` | the dark/black theme layer, see below |
| `lucide.css` | generated icon CSS (`tools/generate-lucide-icons.py`), never edited by hand |

## How pages load CSS

- `index.php` loads two concatenated bundles built at request time by
  `index_css.php` (`?group=core` and `?group=modals`, file order is defined
  there and matters for the cascade), `index-mobile.css` as a media-scoped link
  between them, then `dark_mode_css.php` (all of `dark-mode/`) and
  `syntax-highlight.css`.
- Every other page links its stylesheets one by one in its `<head>` (look at
  `favorites.php` for the usual set: lucide, the modal files, the page file, the
  ten `dark-mode/*.css`, the icon sidebar). Cache-busting goes through
  `poznoteAsset('css/...')` in `config.php`.
- An admin-uploaded custom stylesheet (Settings > Custom CSS) is injected last
  in `<head>` on every page by `config.php`, so it overrides everything here.
- Because bundles are plain concatenation, one unbalanced brace silently
  disables every file that follows it. `php tools/css-check.php` checks all
  files in a second; run it before committing CSS.

## Themes

- `js/theme-init.js` runs synchronously in `<head>` and sets
  `html[data-theme='dark'|'light']` (plus `html.theme-black` for the black
  variant) before first paint; `js/theme-manager.js` later also adds
  `body.dark-mode` / `body.black-mode`. Dark rules are written against both
  carriers (`html[data-theme='dark'] X, body.dark-mode X`); `data-theme` is the
  one that is always present.
- Light values are the defaults in each component file. Dark overrides live in
  `dark-mode/*.css` (index order: variables, layout, menus, editor, modals,
  components, pages, markdown, kanban, icons, calendar) or, for page-specific
  files, next to the light rules in the same file.
- The black theme only swaps the `--dm-*` values (`dark-mode/variables.css`),
  it has no rules of its own. Keep it that way.

## Variables

Defined in `dark-mode/variables.css`, the one stylesheet every page loads.

Light (on `:root`):

| Variable | Default | Used for |
|---|---|---|
| `--pz-accent` | `#007db8` | brand blue: links, active states, primary buttons, focus rings |
| `--pz-accent-hover` | `#005a8a` | hover/darker variant |
| `--pz-accent-rgb` | `0, 125, 184` | tints: `rgba(var(--pz-accent-rgb), 0.1)` |
| `--pz-text` | `#333333` | main text |
| `--pz-text-muted` | `#6b7280` | secondary text, icons |
| `--pz-text-subtle` | `#9ca3af` | placeholders, hints |
| `--pz-border` | `#e0e0e0` | default borders, separators |
| `--pz-border-strong` | `#d1d5db` | inputs, menus, cards |
| `--pz-surface` | `#f8f9fa` | panels, cards, code backgrounds |
| `--pz-surface-hover` | `#f3f4f6` | hover rows and items |
| `--pz-danger` | `#dc3545` | destructive actions, errors |

Dark and black (on `html[data-theme='dark']` / `html.theme-black[data-theme='dark']`):
`--dm-text`, `--dm-text-muted`, `--dm-bg`, `--dm-content-bg`, `--dm-sidebar-bg`,
`--dm-sidebar-surface`, `--dm-surface`, `--dm-surface-hover`, `--dm-border`,
`--dm-border-light`, `--dm-accent`, `--dm-active`, `--dm-code-bg`,
`--dm-tabbar-bg`, `--dm-tab-bg`, `--dm-tab-hover-bg`, `--dm-tab-active-bg`.

These names are part of the custom-CSS contract: rename nothing, add freely.
Re-theming example for a custom stylesheet:

```css
:root {
    --pz-accent: #7c3aed; --pz-accent-hover: #5b21b6; --pz-accent-rgb: 124, 58, 237;
    --pz-text: #2b2118; --pz-border: #e6dccb; --pz-surface: #f7f1e6;   /* sepia-ish light */
}
html[data-theme='dark'] { --dm-accent: #a78bfa; --dm-bg: #1a1625; --dm-content-bg: #1a1625; }
```

## Conventions

- New colours: use the `--pz-*` tokens in light rules and `--dm-*` in dark
  rules when the colour is one of the tokens above; literals are fine for
  everything else. Dark rules keep literals for now (a `#333` there is a dark
  surface, not text: do not map it to `--pz-text`).
- Prefer one rule with grouped selectors over two identical rules (the folder
  and note action menus in `folders/actions-menu.css` are the model); rules
  that are byte-identical in two files always loaded together are duplicates,
  delete one.
- Keep the literal family name `'Inter'` in font stacks: the "main font"
  setting swaps fonts by re-declaring `@font-face 'Inter'`
  (`js/theme-init.js`), not by editing `font-family` rules.
- `.initially-hidden` is the plain `display:none` helper (low specificity);
  rules with higher specificity that set `display` must re-assert it.
