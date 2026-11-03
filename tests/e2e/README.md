# On-demand checks

One command to run after a new feature or a change, to find out what it broke:

```
tests/e2e/run.sh --jobs 3
```

It builds an image from the working tree, uncommitted changes included, starts
throwaway instances from port 8199 with empty data held in memory, and runs every
check below. The dev and production instances and their data are never touched.

| Option | Effect |
| --- | --- |
| `--jobs <n>` | Spread the spec files over n instances run at once (about 2 hours 30 with 1, 1 hour with 3 on 4 cores) |
| `--no-visual` | Skip the screenshot comparison |
| `--update-visual` | Accept the current look as the new reference |
| `--all-browsers` | Run in Chromium and Firefox |
| `--grep <text>` | Only the tests whose name matches, without the PHP unit tests nor the coverage stage |
| `--serve` | Start the instances and leave them running, to work on a test |

`POZNOTE_E2E_PORT` changes the first port, `POZNOTE_E2E_JOBS` the default number of
jobs. Instance n listens on the first port plus n, its MCP server on that plus 1000.
Node and Docker are the only requirements, Playwright installs itself on the first
run. More jobs than cores makes the timing tests flaky.

## What it checks

| Stage | File | What |
| --- | --- | --- |
| Image | `run.sh` | The Dockerfile and the MCP server image build |
| PHP | `run.sh` | Syntax of every PHP file, then `tests/run.php` |
| API basics | `specs/01` to `04` | Notes, data round trips, services, every page, as a first pass |
| Notes | `specs/10-notes.spec.js` | Creating, the note toolbar, the lifecycle, tabs, the tree, tags, search, workspaces, shortcuts, the dashboard |
| Rich text | `specs/11-richtext.spec.js` | Every format from each way of triggering it, the slash menu, tables, code blocks, clipboard, media |
| Markdown | `specs/12-markdown.spec.js` | Every view, the source editor, the toolbar, the slash menu, the rendering of every syntax, Mermaid |
| Organize | `specs/13-organize.spec.js` | Tasks, kanban, diary, reminders, attachments, revisions, graph, mentions, shared workspaces, offline |
| Data | `specs/14-data.spec.js` | Exports, backups, restores, imports, local and S3 backups, Git sync, webhooks, public shares, the Chrome extension |
| Settings | `specs/15-settings.spec.js` | Every card of the settings page with its visible effect, themes, languages, fonts, customisation |
| Platform | `specs/16-platform.spec.js` | Sign-in, passwords, two-factor, OAuth, OIDC, admin pages, every REST route, the AI assistant, every MCP tool |
| Speed dial | `specs/17-speed-dial.spec.js` | Tiles, groups, filter, size, colours, order, background, boards, the menus that fill it |
| Look | `specs/05-visual.spec.js` | Screenshots compared with the reference |
| PHP log | `run.sh` | Any deprecation, warning or fatal error logged during the run |
| Coverage | `lib/coverage.js` | Every feature has its test, and every route, page, setting, slash entry... of the code belongs to a feature |

Beyond what each test asserts, any JavaScript error, console error or HTTP 5xx in
the browser fails the test it happens in (`page` fixture in `lib/helpers.js`).

`content/kitchen-sink.md` and `.html` hold one of every kind of content. Add a new
kind of content there, and the round trips and screenshots cover it.

## The list of features

`features/*.json` lists everything Poznote does, one catalog per domain, and
`FEATURES.md` is that list with the tests that check each feature, written by
`node lib/coverage.js` (run it on its own, it needs no instance).

`lib/inventory.js` reads the code for what it offers: routes, pages, `data-action`
values, slash menu entries, settings, settings cards, MCP tools, themes, languages
and dialogs. The coverage stage fails on anything found there that no feature
claims, on a feature with no test, and on a route or page that the run never
reached successfully. So a new route or setting cannot slip in untested: the run
says what to add.

## Reading a failure

```
cd tests/e2e && npx playwright show-report .results/report --host 0.0.0.0
```

The report shows each failure with a screenshot, a replayable trace and, for the
look, the reference, the new image and the difference side by side. With
`--jobs`, `.results/job-<n>.log` holds the output of each job.
`.results/php-errors.txt` lists what the PHP log contained.

A test marked `test.fail(true, 'BUG: ...')` checks the right behaviour of a known
Poznote bug: it passes while the bug is there, and fails once it is fixed, which is
the moment to remove the mark. The coverage stage lists them.

## Screenshots

The reference lives in `.visual-reference/` and is not committed, because fonts
and rendering differ from one machine to the next. The first run with
`--update-visual` creates it. Make it on a version you trust.

When a difference is what you wanted, run `--update-visual` to accept it. Look at
the report first: this command accepts every difference at once, wanted or not.

## What it does not check

External services are simulated by `support/mock-server.php` (an OpenAI-compatible
server, an MCP server, a Git forge, an S3 bucket, an OIDC provider, a webhook
receiver) and by an SMTP server that `specs/13-organize.spec.js` starts in the
instance, so this checks Poznote's side of the exchange, not a
change at GitHub or OpenAI. Dictation from a real microphone, real push delivery,
the ARM image and the Firefox look are not covered. Passing screenshots do not mean
that a page looks good, only that it looks the same as the reference.

## Adding a check

A new feature gets its entry in the catalog of its domain and its test in the spec
of the same domain, linked by `covers('<feature id>')`. Use `newAccount()` so that
the test starts from nothing, and `Api` for the setup and the final assertion, even
when the action itself goes through the interface: click the real button, press
the real key, then check what changed on screen and what was stored.
