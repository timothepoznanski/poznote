# Stylesheets

Plain CSS, no build step: the files in this directory are served as they are
(edit, reload). This note explains how they are organised and loaded, how the
themes work and which variables a custom stylesheet can rely on.

## Layout

| Path | What it styles |
|---|---|
| `components/` | shared component bases, loaded before the page stylesheets on every page (`@components` in the manifest). A page may add properties on top; it must not redefine what the base owns. |
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
- **Every other page names itself and `src/css_assets.php` says what that
  means.** The `<head>` holds one call:

      <?php poznoteRenderStylesheets('trash'); ?>
      <?php poznoteRenderStylesheets('admin/users', ['prefix' => '../']); ?>

  `poznoteCssManifest()` maps the page key (its path under `src/public/`,
  without the extension) to an ordered list; entries starting with `@` are
  groups (`@modals`, `@theme`, `@icon-sidebar`, `@home`) expanded in place.
  Order is cascade order. To give every page a new stylesheet, add it to a
  group; to change one page, edit its list. Cache-busting goes through
  `poznoteAsset()`, one scheme for all of them.
- Exceptions that still link by hand: `index.php` (bundles, a media-scoped
  link and an inline `<style>` in the middle), `api_export_attachments.php`
  (writes a standalone document), and the password-gate `<head>` of
  `settings.php`, `public_note.php` and `public_folder.php`.
- `tests/css-manifest.test.php` checks the manifest: every file exists, no
  group is undefined, no page lists a stylesheet twice, the dark layer is never
  loaded before its tokens, and each key belongs to a page that renders it.
- An admin-uploaded custom stylesheet (Settings > Custom CSS) is injected last
  in `<head>` on every page by `config.php`, so it overrides everything here.
- Because bundles are plain concatenation, one unbalanced brace silently
  disables every file that follows it. `php tools/css-check.php` checks all
  files in a second; run it before committing CSS.

## Themes

- **One carrier: `data-theme` on `<html>`.** `js/theme-init.js` (and
  `js/excalidraw-theme-init.js` on the drawing page) runs synchronously in
  `<head>` and sets `html[data-theme='dark'|'light']`, plus `html.theme-black`
  for the black variant, before first paint. Write dark rules as
  `html[data-theme='dark'] X` and black ones as
  `html.theme-black[data-theme='dark'] X`, nothing else.
- `js/theme-manager.js` also adds `body.dark-mode` / `body.black-mode` at
  `DOMContentLoaded`. **Never style against those classes.** They arrive after
  first paint, so they cover strictly less than the attribute at equal
  specificity; they are kept only so an admin's custom stylesheet written
  against them keeps working.
- Light values are the defaults in each component file. Dark overrides live in
  `dark-mode/*.css` (index order: variables, layout, menus, editor, modals,
  components, pages, markdown, kanban, icons, calendar) or, for page-specific
  files, next to the light rules in the same file.
- The black theme only swaps the `--dm-*` values (`dark-mode/variables.css`),
  it has no rules of its own. Keep it that way.
- Every page loads the whole `@theme` group, never a slice of it. Nineteen of
  them used to load part of it, which is how `markdown_syntax.php` ended up
  rendering the icon sidebar with no dark styling at all.

## Components

`components/buttons.css` owns `.btn` and its `-primary` / `-secondary` /
`-danger` / `-success` variants. Before it existed the class was defined in
thirteen page stylesheets, fifteen pages loaded two of them, and `.btn`
resolved to eleven different things depending on which file came last; three of
those results carried `gap` and `align-items` on a `display: inline-block`,
where neither does anything.

The rule for anything in `components/`: **a page stylesheet may add properties
the base does not set (a margin, a hover transform), never redefine the ones it
owns.** If a page really needs a different button, that is a new class, not a
second `.btn`.

`components/forms.css` is the baseline for text inputs, textareas and selects.
Without it they kept the browser's own white and pure black, which no token can
reach: a palette could darken a page and leave its fields glowing. Checkboxes,
radios, colour pickers and ranges are deliberately absent, the browser paints
them and a background there breaks their native rendering.

`tools/css-check.php` runs in CI and holds six lines:

- brace and comment balance, because the stylesheets are concatenated at request
  time and one unclosed brace silently kills every rule after it in the bundle;
- one carrier, and one spelling of it. `html[data-theme='dark']`, with single
  quotes, plus `html.theme-black[data-theme='dark']`. No `body.dark-mode`, and
  not the two other spellings that were in use: `:root[data-theme='dark']` is
  (0,2,0) because `:root` is a pseudo-class, a bare `[data-theme='dark']` is
  (0,1,0), and the canonical form is (0,1,1). They are not interchangeable, and
  thirteen targets used to be styled through more than one of them, so which
  rule won was settled by a spelling nobody had chosen;
- a colour ratchet. `tools/css-check.baseline.json` holds the number of colour
  literals left outside the palette file, and the check fails when a change adds
  any. Counted: hex, the `white` / `black` keywords, and any functional colour
  (`rgba()`, `hsl()`, `oklch()`...) whose arguments name no variable. Raising the
  baseline is allowed but has to be a decision, written in the commit.
  `css/components/` is stricter still: a shared base must be entirely tokens,
  since it is the layer a palette most needs to reach;
- the component-base rule below, enforced: outside `css/components/`, a
  stylesheet may not redefine a property the base owns **on the base's own
  selector**. Restyling in context (`.shares-page .btn-success`) stays legal, and
  so does `@media`, because a viewport is a context;
- no two `@keyframes` of the same name with different bodies. The name is one
  global namespace and the last definition loaded wins, silently: an emptied
  `slideDown` killed the search bar's opening animation, and a `heartbeat`
  declared-but-unused in `settings.css` replaced the real one on seven pages.
  Same-named blocks that agree are fine (`from`/`to` and `0%`/`100%` compare
  equal);
- no empty rule. A declaration block with nothing in it says nothing to anyone
  but the parser, and an empty `@keyframes` is how the first of those two bugs
  stayed hidden.
- the same colour ratchet over the markup. The CSS one guards `src/public/css`
  and nothing else, so it read clean while 534 literals sat in the project's own
  PHP and JS: inline `style` attributes, `<style>` blocks in a page, colours
  handed to a script. A theme reaches none of them. Files that legitimately hold
  colours are listed in `markup_exempt` in the baseline with a reason each: email
  HTML (mail clients have no `var()`), standalone exports that render outside the
  app, and colours that are data rather than chrome, like the brand colours of
  programming languages or the folder palette a user picks from.

## Writing a palette

Everything a theme has to repaint is a token, so a custom stylesheet (Settings >
Custom CSS, injected last on every page) can be nothing but a list of overrides.
Two blocks, the shape a Catppuccin-style theme already has: light values on
`:root`, dark values on `:root[data-theme='dark']`, and the black variant on
`html.theme-black[data-theme='dark']` if you want a third.

Light, on `:root`:

    surfaces   --pz-bg --pz-surface --pz-surface-hover --pz-surface-sunken
    text       --pz-text --pz-text-secondary --pz-text-muted --pz-text-subtle
               --pz-text-inverse
    borders    --pz-border-light --pz-border --pz-border-strong
    accent     --pz-accent --pz-accent-hover --pz-accent-strong --pz-accent-soft
               --pz-accent-rgb --pz-link
    status     --pz-danger --pz-danger-hover --pz-danger-strong --pz-danger-soft
               --pz-success --pz-success-hover --pz-success-strong --pz-success-soft
               --pz-warning --pz-warning-hover --pz-warning-strong --pz-warning-soft
    icons      --pz-icon

Dark, the same shape under `--dm-`:

    surfaces   --dm-content-bg --dm-bg --dm-sidebar-bg --dm-sidebar-surface
               --dm-surface --dm-surface-hover --dm-surface-raised --dm-code-bg
    text       --dm-text-bright --dm-text --dm-text-muted --dm-text-subtle
    borders    --dm-border --dm-border-light
    accent     --dm-accent --dm-accent-hover --dm-accent-soft --dm-active
    status     --dm-danger --dm-danger-hover --dm-danger-soft
               --dm-success --dm-success-hover --dm-success-soft
               --dm-warning --dm-warning-hover --dm-warning-soft
    icons      --dm-icon --dm-icon-hover
    tabs       --dm-tabbar-bg --dm-tab-bg --dm-tab-hover-bg --dm-tab-active-bg

Every semantic family has the same four steps, so there are only four questions
per family: the fill, its hover, the deep shade for text on the wash, and the
wash itself.

Measured on eight pages: overriding the surface, text, border and accent tokens
leaves 0 surfaces carrying a colour of the app's own.

### How the dark layer is ordered

Write a dark rule the way the light layer does it: the generic first, the
variant scoped to the same context after it. The layer used to have this
backwards. `html[data-theme='dark'] .modal-buttons button` is (0,2,2) and
`html[data-theme='dark'] .btn-primary` is (0,2,1), so the generic rule beat the
variant and the only way out was `!important` on the variant, which then
flattened every rule that styles a button IN context: the tinted row actions of
the shares page, the `.danger` item of a table menu, the scoped buttons of the
admin user list. `dark-mode/modals.css` now carries
`html[data-theme='dark'] .modal-buttons button.btn-primary` and friends, at
(0,3,2), and the variants in `components.css` are plain weight again.

If you find yourself reaching for `!important` in `dark-mode/`, check first
whether a generic rule in the same layer is simply more specific than the
variant you are writing. That is usually what is happening.

Two things are still out of reach and need rules of your own: the dark theme's
own `--dm-*` values behave differently (see above), and about two dozen very
pale washes sit between the neutral scale and the status scale and are still
literal.

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
| `--pz-link` | `#2e8cfa` | hyperlinks in notes |
| `--pz-accent-strong` | `#0b4da6` | selected note/folder title in the sidebar |
| `--pz-accent-soft` | `#e3f2fd` | active item background |
| `--pz-success` | `#28a745` | success alerts, enabled states |
| `--pz-warning` | `#ffc107` | warning alerts, badges |

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
  everything else. Dark rules use the `--dm-*` tokens wherever the value is one of them
  (`#252526` is `--dm-content-bg`, `#333333` is `--dm-surface`, ...); a `#333`
  in a dark rule is a surface, never `--pz-text`.
- Prefer one rule with grouped selectors over two identical rules (the folder
  and note action menus in `folders/actions-menu.css` are the model); rules
  that are byte-identical in two files always loaded together are duplicates,
  delete one.
- Keep the literal family name `'Inter'` in font stacks: the "main font"
  setting swaps fonts by re-declaring `@font-face 'Inter'`
  (`js/theme-init.js`), not by editing `font-family` rules.
- `.initially-hidden` is the plain `display:none` helper (low specificity);
  rules with higher specificity that set `display` must re-assert it.
