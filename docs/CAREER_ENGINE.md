# Career Recommendation Engine

This note documents the current implementation in `backend/ml/engine.py`. It is intended for maintainers and does not change runtime behavior.

## Aptitude score

The engine reads the `logical` and `creative` answer values (also accepting title-case keys). Missing values default to zero. The overall score is the arithmetic mean:

`overall = (logical + creative) / 2`

The returned breakdown uses lowercase keys: `logical` and `creative`.

## Current recommendation weights

The current implementation returns two recommendations:

| Recommendation | Current calculation |
| --- | --- |
| UX Designer | `0.6 × creative + 0.3 × logical` |
| Product Manager | `0.5 × logical + 0.3 × creative` |

Each displayed suitability value is capped at 100. The engine currently uses a small fixed skill-gap profile for Python, SQL, Statistics, Machine Learning, and Communication.

## Important interpretation limits

- These values are heuristic indicators, not validated psychometric scores or employment predictions.
- The current skill-gap values are example defaults rather than measurements from a user's verified skill assessment.
- The current implementation caps recommendation scores at the upper bound but does not normalize arbitrary input values to a defined range.
- Do not present the result as a guaranteed career fit. Explain the component scores and encourage users to compare recommendations with their interests and experience.

## Safe extension workflow

1. Add tests for a proposed scoring change before changing the engine.
2. Keep the return shapes stable unless the frontend contract is updated deliberately.
3. Use anonymized, synthetic examples in tests and documentation.
4. Validate score ranges at the API boundary before accepting user-submitted values.
