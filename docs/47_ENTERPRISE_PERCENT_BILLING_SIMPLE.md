# Enterprise percentage billing — simple method

Do not charge a percentage of the customer's total website revenue. Charge only from recovered advertising revenue that can be calculated from AdProof telemetry and an agreed RPM.

## Formula

```text
Recovered revenue = recovered ad impressions × agreed RPM / 1000
Your fee = recovered revenue × agreed percentage
```

## Example at 30%

```text
Recovered ad impressions: 2,000,000
Agreed RPM: $3.50
Recovered revenue: 2,000,000 × 3.50 / 1000 = $7,000
Your 30% fee: $7,000 × 0.30 = $2,100
Customer keeps: $4,900
```

## What must be shown in invoice/report

1. Billing period.
2. Customer/project/site.
3. Recovered ad impressions.
4. Agreed RPM source or contract value.
5. Recovered revenue.
6. Your percentage.
7. Final fee.

## Stronger proof method

Use a holdout group:

```text
90% of detected adblock visitors: recovery enabled
10% of detected adblock visitors: detect-only control group
```

Then bill from the incremental lift, not from a guessed number. This makes the calculation auditable and easier to explain to enterprise clients.
