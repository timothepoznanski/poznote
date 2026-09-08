# Isolation suite

The tests in `tests/` cover the pure functions in `src/lib`: no database, no
session, no server. That is the half of the code that cannot hurt anyone. This
directory covers the other half.

One question, asked of every route the API exposes: **can one account reach
another account's data?**

```
POZNOTE_TEST_PASSWORD=<admin password> php tests/integration/run.php
```

## What it does

It creates two throwaway accounts through the admin API. The *owner* is filled
with one of everything the API can address by id, each carrying a marker string
unique to the run:

> note, second note, tasklist note, trashed note, folder, sibling folder,
> workspace, tag, task, attachment, snapshot, reminder, note share, folder
> share, backup archive, a written setting

The *stranger* then sends every route in the router with the owner's
identifiers substituted in, and each answer has to be a refusal. Two assertions
per route, and the second is the one that matters:

1. the status is 403 or 404, and
2. the body contains no trace of the owner.

The status alone would not be enough. The accounts have separate databases
whose id sequences both start at 1, so "note 2" exists for both of them and a
200 can be perfectly correct. The marker check therefore runs on every
response whatever the status, and the suite refuses to start unless the
stranger's id space is disjoint from the owner's.

The status alone would not be enough in the other direction either. A route
that answers 400 because the body was malformed has told us nothing about
ownership, because the ownership check never ran. So every refusal is paired
with a **control**: the identical request, sent by the owner, has to succeed. A
route whose control fails is reported as inconclusive rather than passing.

Beyond the replay it checks:

- **impersonation** - the stranger's credentials with the owner's `X-User-ID`,
  which must be refused on every route;
- **share tokens** - a read-only link cannot write, a folder token is not a
  note token, an invented token opens nothing;
- **workspace scoping** - naming the owner's workspace in a query string does
  not widen what the stranger sees;
- **path traversal** - the two routes that take a caller-supplied filename
  cannot be walked out of the account's own directory;
- **the detectors themselves** - shown a fabricated leak and a fabricated
  success, both have to object. An assertion that something did not happen
  passes just as happily once it has stopped working.

## Why it is not in CI

It needs a running instance, and CI has none. `tests/run.php` globs its own
directory only, so nothing here is picked up by the unit suite.

Run it before a release, and after touching anything that decides who may see
what: `auth.php`, the router in `src/public/api/v1/index.php`, or a
controller's `WHERE` clause.

## Adding a route

`routeTable()` in `isolation.test.php` is checked against the router at run
time. Add a route to the API without saying what isolation means for it and
the suite fails, naming it. The classifications are `OWNED` (takes one of the
owner's identifiers, must be refused), `SCOPED` (addresses no particular
object, must return only the caller's own data), `ADMIN` (a plain account must
be turned away), `PUBLIC_TOKEN` (covered by the share-token group) and
`EXCLUDED`, which carries a reason.

For a write route, give it a `body` that would succeed if ownership were not
enforced. An empty body on a route that validates its input turns the whole
check into an assertion about 400s.

## Safety

The suite creates and deletes accounts and fires deliberately destructive
requests. Point it at a development instance, never at one holding real data.
Throwaway accounts are removed on the way out, including when the run dies part
way through.

| Variable | Default | |
| --- | --- | --- |
| `POZNOTE_TEST_URL` | `http://127.0.0.1:8042` | the dev instance |
| `POZNOTE_TEST_USER` | `admin` | must be an administrator |
| `POZNOTE_TEST_PASSWORD` | *(required)* | |
