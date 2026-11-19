# Security Baseline

This checklist is for contributors preparing local, staging, or production deployments.

## Secrets and configuration

- Never commit `.env` files, Firebase service-account JSON files, private keys, database URLs containing passwords, or access tokens.
- Use `.env.example` files containing placeholders only.
- The repository currently contains a tracked `backend/.env` path. Treat any credential that has ever been stored in that file as potentially exposed: rotate it with its provider, remove the file from the tracked branch, and clean Git history where required. Deleting the file in a later commit alone does not erase it from earlier commits.
- Keep production `SECRET_KEY` values random and unique. Do not use development defaults in a deployed environment.
- Restrict Firebase credentials and API keys to the minimum services, APIs, and origins required.

## Authentication and authorization

- Enforce authorization on the server for every user-owned record; hiding UI controls is not access control.
- Add tests proving one user cannot read, update, or delete another user's records.
- Avoid logging bearer tokens, passwords, service-account data, or complete credential-bearing request headers.

## Before deployment

- Confirm production CORS origins are explicit rather than wildcarded.
- Verify debug mode is disabled and HTTPS is enforced by the deployment platform.
- Rotate credentials after accidental commits, even when the file was later deleted.
- Review GitHub Actions logs and repository history for accidental secret output.

This document is guidance only; it does not alter the application's current configuration.
