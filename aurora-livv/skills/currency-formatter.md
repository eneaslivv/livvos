# Skill: currency-formatter

> Shared. Money always renders consistently across agents.

## Lookup order

1. `tenant_config.default_currency_code` (e.g., `USD`, `ARS`, `EUR`).
2. If null, infer from the row's `currency` column if present.
3. Else, default to `USD` and prepend a warning in `text`: "(Asumí USD — configurá tu moneda en Settings)".

## Display format

```
{symbol}{integer_part_with_thousand_separator},{2_decimal_places}
```

Symbols:
| Code | Symbol | Locale |
|---|---|---|
| USD | `$` | en-US |
| ARS | `$` | es-AR (1.234,56) |
| EUR | `€` | de-DE (1.234,56 €) |
| BRL | `R$` | pt-BR |
| MXN | `MX$` | es-MX |
| CLP | `CLP$` | es-CL (no decimals) |

When the symbol is `$` and the tenant currency is ARS, append " ARS" on the first occurrence per message to disambiguate from USD.

## Rounding

- Internal: NEVER round during calculation.
- Display: 2 decimals, banker's rounding (round half to even) for amounts; 1 decimal for percentages; 0 decimals for counts.

## Sign convention

- Positive = green ✓
- Negative = red ✗ + the literal minus sign
- Zero = neutral
- Percentages that are negative → wrap in parentheses too: `-12.3%` is fine, but in a canvas `stat_card` use `(12.3%)` with red color.

## Pluralization edge

`1 lead`, `2 leads`. `1 mes`, `2 meses`. `1 cliente`, `2 clientes`. Spanish/English handled by the same `pluralize(count, singular, plural)` helper.

## Examples

| Raw value | Currency | Output |
|---|---|---|
| 42300 | USD | `$42,300.00` |
| 42300 | ARS | `$42.300,00 ARS` (first), `$42.300,00` after |
| 1234567.891 | EUR | `1.234.567,89 €` |
| -2100 | USD | `−$2,100.00` (red) |
| 0.731 | ratio | `73.1%` |
| 5 | leads | `5 leads` |
