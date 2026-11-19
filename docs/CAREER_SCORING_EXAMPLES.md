# Career Scoring: Worked Examples

The current `backend/ml/engine.py` implementation calculates a simple average aptitude score and two weighted recommendation values. These examples describe the current code; they are not clinical or psychometric assessments.

## Example A

Input:

```json
{"logical": 80, "creative": 60}
```

Overall score:

`(80 + 60) / 2 = 70`

Current recommendation calculations:

- UX Designer: `0.6 × 60 + 0.3 × 80 = 60`
- Product Manager: `0.5 × 80 + 0.3 × 60 = 58`

## Example B

Input:

```json
{"logical": 40, "creative": 90}
```

Overall score:

`(40 + 90) / 2 = 65`

Current recommendation calculations:

- UX Designer: `0.6 × 90 + 0.3 × 40 = 66`
- Product Manager: `0.5 × 40 + 0.3 × 90 = 47`

## Interpretation and limitations

- The current weights are implementation heuristics, not validated predictors of career performance.
- The current engine caps the upper end of suitability at 100 but does not enforce a lower score bound.
- Missing aptitude keys default to zero.
- Skill-gap values currently come from a fixed example profile.
- Do not interpret a score as an admission, hiring, salary, or employment guarantee.

When changing the scoring model, update the engine tests and this guide together.
