# NextStep Maintenance Guide

## Local verification

Run the isolated backend tests from the backend directory:

```bash
python -m unittest discover -s tests -v
```

The test suite should not require production user data, external Gemini calls, live SMTP, or Firebase credentials.

## Adding a career recommendation

1. Write down the user-facing purpose and the scoring assumptions.
2. Add synthetic test cases for typical and boundary scores.
3. Preserve the existing response keys unless a coordinated API change is planned.
4. Update the career-engine documentation when weights or recommendations change.
5. Avoid wording that implies a heuristic is a guaranteed career outcome.

## Deployment review

- Use provider-managed secrets for Flask, database, and Firebase credentials.
- Ensure production CORS origins are explicit.
- Verify ownership checks on all user-specific routes.
- Keep uploaded documents private and enforce limits on file size and type.
- Review dependency and workflow changes before merging.

See `SECURITY_BASELINE.md` for the repository's security checklist.
