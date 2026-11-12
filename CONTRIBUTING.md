# Contributing

House rules for the site and OPEX are in [CLAUDE.md](CLAUDE.md). The documentation system is in
[docs/DOCS-PLAN.md](docs/DOCS-PLAN.md).

## Commits

- Use Conventional Commits: `feat(scope): …`, `fix: …`, `docs: …`. `pnpm changelog` builds
  [docs/changelog.md](docs/changelog.md) from them.
- A commit that changes a documented surface must also change documentation, or carry a trailer:
  ```
  Docs-Impact: none <why no docs change is needed>
  ```
  Documented surfaces are API routes and contracts, migrations, configuration, the content schema,
  auth, and shared components.
- A deliberate breaking API change needs an `API_VERSION` bump and:
  ```
  API-Break: approved <reason>
  ```

## Local checks

`pnpm install` installs two git hooks, `pre-commit` and `commit-msg`, alongside graphify's hooks:
- `pre-commit` regenerates and compares the API docs when routes are staged, and checks links and
  env docs when Markdown or config is staged;
- `commit-msg` runs the docs-impact rule.

Everything also runs in CI, so `--no-verify` only moves the failure to the pull request.

```bash
pnpm check
```

Runs typecheck, lint, the tests (including the contract tests on every response) and the build.

```bash
pnpm docs:check
```

Checks that the generated API docs are current, that links and env docs resolve, and runs the
OpenAPI lint.

```bash
pnpm docs:breaking
```

Checks for breaking API changes against `origin/main`.

```bash
pnpm docs:coverage
```

Shows which documented operations the tests exercise.

## Branch protection (GitHub settings, done by a repository admin)

For `main`:
1. Require a pull request before merging, with one approval and stale approvals dismissed on new
   commits.
2. Require these status checks to pass, and require branches to be up to date:
   - `check`
   - `docs`
   - `php-client`
   - `opex-images`
   - `dependency-audit`
3. Require conversation resolution; block force pushes and deletions.
4. Include administrators.

Until this is set, the checks report but do not block.
