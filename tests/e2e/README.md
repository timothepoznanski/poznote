# On-demand checks

One command to run after a new feature or a change, to find out what it broke:

```
tests/e2e/run.sh
```

It builds an image from the working tree, uncommitted changes included, starts it
on port 8199 with empty data held in memory, and runs every check below. The dev
and production instances and their data are never touched.

| Option | Effect |
| --- | --- |
| `--no-visual` | Skip the screenshot comparison |
| `--update-visual` | Accept the current look as the new reference |
| `--all-browsers` | Run in Chromium and Firefox |
| `--grep <text>` | Only the tests whose name matches, without the PHP unit tests |
| `--serve` | Start the instance and leave it running, to work on a test |

`POZNOTE_E2E_PORT` changes the port. Node and Docker are the only requirements,
Playwright installs itself on the first run.

## What it checks

| Stage | File | What |
| --- | --- | --- |
| Image | `run.sh` | The Dockerfile builds |
| PHP | `run.sh` | Syntax of every PHP file, then `tests/run.php` |
| Notes | `specs/01-notes.spec.js` | Notes of every type, folders, tags, tasks, attachments, snapshots, reminders, links, workspaces, shares |
| Data | `specs/02-data.spec.js` | Backup, restore, export and import, each compared with the reference notes |
| Services | `specs/03-integrations.spec.js` | AI assistant, transcription, S3, Git sync, webhooks, accounts, two-factor, app passwords, admin |
| Interface | `specs/04-interface.spec.js` | Editors, slash menu, tree, search, dialogs, every page, dark theme, language, phone |
| Look | `specs/05-visual.spec.js` | Screenshots compared with the reference |
| PHP log | `run.sh` | Any deprecation, warning or fatal error logged during the run |

Beyond what each test asserts, any JavaScript error, console error or HTTP 5xx in
the browser fails the test it happens in (`page` fixture in `lib/helpers.js`).

`content/kitchen-sink.md` and `.html` hold one of every kind of content. Add a new
kind of content there, and the round trips and screenshots cover it.

## Reading a failure

```
cd tests/e2e && npx playwright show-report .results/report --host 0.0.0.0
```

The report shows each failure with a screenshot, a replayable trace and, for the
look, the reference, the new image and the difference side by side.
`.results/php-errors.txt` lists what the PHP log contained.

## Screenshots

The reference lives in `.visual-reference/` and is not committed, because fonts
and rendering differ from one machine to the next. The first run with
`--update-visual` creates it. Make it on a version you trust.

When a difference is what you wanted, run `--update-visual` to accept it. Look at
the report first: this command accepts every difference at once, wanted or not.

## What it does not check

External services are simulated by `support/mock-server.php`, so this checks
Poznote's side of the exchange, not a change at GitHub or OpenAI. OIDC sign-in, the
MCP server, the Chrome extension, the ARM image, drag and drop and real push
delivery are not covered. Passing screenshots do not mean that a page looks good,
only that it looks the same as the reference.

## Adding a check

A new feature gets its test in the spec of its domain. Use `newAccount()` so that
the test starts from nothing, and `Api` for the setup and the final assertion, even
when the action itself goes through the interface.
