# Security Policy

## Supported Versions

Security fixes are applied to the latest published release line.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

## Reporting a Vulnerability

Do not open public issues for suspected vulnerabilities.

Use one of these channels instead:

1. GitHub Security Advisories for this repository, when enabled.
2. Private contact with the maintainer before public disclosure.

When reporting, include:

- affected version
- operating system
- reproduction steps
- impact assessment
- proof-of-concept if available

## Secrets and Local Credentials

This repository is intended to be publishable without shipping live credentials.

Expected local-only credential storage:

- `.env`
- `.env.local`
- `.software-factory/`
- `.software-factory/youtube/oauth-client.json`
- `.software-factory/youtube/oauth-tokens.json`
- desktop launcher state in the OS user data directory

These locations are excluded from git by default and must remain local.

## Security Notes

- The Electron desktop app uses context isolation, sandboxing, blocked external navigation, and validated IPC payloads.
- The YouTube OAuth flow writes credentials only under the local workspace `.software-factory/youtube/` path.
- Package installation helpers may prompt for GitHub Packages tokens, but those tokens are not persisted in the repository.
