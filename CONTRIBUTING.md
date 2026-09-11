# Contributing to Poznote

Thanks for taking the time to contribute. This page is short on purpose, there are only two things you really need to get right.

## 1. Send your pull request to `dev`, not `main`

`main` is the release branch. It only ever receives merges from `dev`, so a pull request opened against `main` cannot be merged as is.

Start from `dev` and target `dev`:

```bash
git clone https://github.com/<your-username>/poznote.git
cd poznote
git checkout dev
git checkout -b my-feature
```

When you open the pull request, GitHub preselects `main` in the base branch dropdown. Change it to `dev`.

If you already branched off `main`, rebase onto `dev` before opening the pull request, otherwise your branch will carry every merge commit that `main` has accumulated:

```bash
git remote add upstream https://github.com/timothepoznanski/poznote.git
git fetch upstream
git rebase upstream/dev
```

## 2. Commit with an email linked to your GitHub account

This one is easy to miss and cannot be fixed after the merge. GitHub credits a commit to an account by matching the author email. If your git config uses a local or made up address, such as `you@MacBook-Pro.local`, your commit lands in the project anonymously and you never show up in the contributors list.

Check what you are about to commit with:

```bash
git config user.email
```

If it is not an address listed under **GitHub > Settings > Emails**, use the noreply address GitHub gives you on that same page:

```bash
git config user.email "ID+username@users.noreply.github.com"
```

It keeps your real address private and is always recognised.

Already pushed a commit with the wrong address? Fix it and force push to your branch:

```bash
git commit --amend --author="username <ID+username@users.noreply.github.com>"
git push --force-with-lease
```

## Checks

Four checks run automatically on your pull request: PHP syntax, PHP unit tests, stylesheets, and JavaScript linting. On a first contribution a maintainer has to approve the run, so do not worry if they look stuck at first.

You do not need to run anything locally. If you would rather catch a mistake before pushing, these are the same commands CI uses:

```bash
php tests/run.php                                     # unit tests
php tools/css-check.php                               # stylesheets
find . -name "*.php" -print0 | xargs -0 -n1 php -l >/dev/null   # PHP syntax
npx --yes oxlint@1.55.0 src poznote-url-saver \
    excalidraw-build markdown-editor-build            # JavaScript
```

The first three only need PHP. The last one needs Node, and only its `correctness` errors fail the build, warnings are fine to leave alone.

## Running a dev instance

`docker-compose-dev.yml` bind mounts `./src` and `./data`, so your edits are live without rebuilding:

```bash
cp .env.template .env    # set HTTP_WEB_PORT
docker compose -f docker-compose-dev.yml up -d
```

## A few conventions

- Keep a pull request to one subject. Small and focused gets reviewed faster.
- Dark mode rules go in `src/public/css/dark-mode/`, written as `html[data-theme='dark'] X`, with single quotes and no other spelling. See [src/public/css/README.md](src/public/css/README.md).
- User facing strings go through the translation helpers, never hardcoded.
- Do not edit a generated bundle under `src/public/js/excalidraw-dist` or `src/public/js/codemirror-dist` without rebuilding it from its source directory.

## Bugs and ideas

Open an [issue](https://github.com/timothepoznanski/poznote/issues) for a bug, or a [discussion](https://github.com/timothepoznanski/poznote/discussions) for a feature idea or a question. Both are read.
