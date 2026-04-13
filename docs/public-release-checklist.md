# Public Release Checklist

## GitHub Settings

- Branch protection on default branch
- Secret scanning enabled
- Automated security fixes enabled
- Dependabot enabled
- Code scanning enabled

## Repository Hygiene

- `LICENSE` present
- `SECURITY.md` present
- `CONTRIBUTING.md` present
- issue templates present
- PR template present

## Secrets Review

- `.env` not tracked
- `.software-factory/` not tracked
- no tokens or connection strings in tracked files
- rotate any credential that was ever pasted into terminal or chat during release work

## Release Artifacts

- build desktop `.exe` from current source
- build installer `.exe` from current source
- validate both artifacts before wide release
- prefer validation on a clean machine or disposable VM

## OAuth / Local Storage

- YouTube OAuth client and token files remain under local `.software-factory/youtube/`
- desktop launcher state remains under OS user data directory
- no MCP or OAuth credentials are written to tracked repository files
