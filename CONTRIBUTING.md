# Contributing

## Development Setup

1. Install Node.js 20+.
2. Install dependencies with `npm install`.
3. Run checks with `npm run check` before opening a PR.

## Branching

- Prefer feature branches over direct pushes to the default branch.
- Keep changes focused and small.

## Pull Requests

Before opening a PR:

1. Run `npm run check`.
2. Verify no local credentials are staged.
3. Update docs if behavior changed.
4. Add tests for logic changes when practical.

## Secrets

Never commit:

- `.env`
- `.env.local`
- `.software-factory/`
- OAuth tokens or client secrets
- API keys, PATs, connection strings, or private keys

## Releases

- Desktop `.exe` assets should be built from the current source state.
- Validate release artifacts before public distribution.
- If a credential was ever pasted into a terminal or chat during release work, rotate it.
