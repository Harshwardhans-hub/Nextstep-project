# Career scoring regression matrix

The scoring engine is intentionally isolated from Flask routes and external services. Run its focused tests from the backend directory:

```bash
python -m unittest tests.test_engine -v
```

## Covered behavior

| Area | Regression case | Expected result |
|---|---|---|
| Aptitude analysis | Lowercase answer keys | Numeric mean and lowercase breakdown |
| Aptitude analysis | Title-case answer keys | Same normalized output shape |
| Missing answers | Empty answer mapping | Both dimensions default to zero |
| Skill gaps | Skill and score arrays | Matching lengths and bounded values |
| Recommendations | Known logical/creative scores | Stable ordering and weighted results |
| Recommendations | Very large input scores | Suitability capped at 100 |

## Interpretation limits

The present engine is a deterministic demonstration model. Its weights and skill-gap values are hard-coded and must not be presented as a validated psychometric assessment or a guarantee of career outcomes. Before using it for consequential student guidance, validate the scoring rubric with qualified educators, test representative cohorts, document calibration, and provide students with an explanation and a way to challenge inaccurate profile data.

## Safe change workflow

1. Add a focused unit test for the intended scoring behavior.
2. Keep calculation logic deterministic and independent from database, authentication, and network calls.
3. Update the explanation of weights whenever the rubric changes.
4. Run the focused test and then the full backend test suite.
