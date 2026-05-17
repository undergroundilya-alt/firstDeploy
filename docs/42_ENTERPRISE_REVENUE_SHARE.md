# Enterprise revenue-share billing

Use percentage pricing only against verified recovered ad revenue, not against the publisher’s total business revenue.

Recommended formula:

```text
Recovered ad revenue = recovered impressions × agreed RPM / 1000
Platform fee = recovered ad revenue × revenue share percent
```

Example at 10%:

```text
2,000,000 recovered impressions × $3.50 RPM / 1000 = $7,000 recovered ad revenue
$7,000 × 10% = $700 platform fee
```

Example at 20%:

```text
2,000,000 recovered impressions × $3.50 RPM / 1000 = $7,000 recovered ad revenue
$7,000 × 20% = $1,400 platform fee
```

What should be in the monthly invoice/report:

- period;
- project/domain;
- total visits;
- overlay events;
- verified recovered ad impressions;
- agreed RPM source;
- recovered revenue;
- agreed percentage;
- final platform fee.

Safer commercial model:

- minimum monthly base fee, optional;
- revenue-share only on incremental/recovered revenue;
- cap or pre-agreed traffic tier for predictability;
- daily exported report from `avp_events` / analytics tables.
