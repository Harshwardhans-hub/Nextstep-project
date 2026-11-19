# NextStep Testing Guide

## Backend unit tests

The career engine is intentionally tested without starting the Flask application or connecting to external services.

From the repository root:

```bash
cd backend
python -m unittest discover -s tests -v
```

The suite covers the existing aptitude-score calculation, recommendation weights, skill-gap response shape, and boundary behavior currently implemented by the engine.

## What should be tested for new features

- Career scoring: normal, missing, boundary, and malformed inputs.
- User-owned records: a user must not be able to retrieve or mutate another user's data.
- File uploads: extension allow-lists, size limits, content validation, and storage permissions.
- Authentication: missing, expired, and invalid Firebase tokens.
- External integrations: mock Gemini, Firebase, SMTP, and storage clients; do not call live services from unit tests.

## Test data and privacy

Use synthetic names, scores, email addresses, and documents. Never place real student records, access tokens, passwords, API keys, or Firebase credentials in test fixtures or CI logs.

## CI

The backend GitHub Actions workflow runs the unittest suite on pushes and pull requests to `main`. Keep tests deterministic and independent of developer-specific environment files.
