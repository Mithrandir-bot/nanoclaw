---
name: property-lookup
description: Query county property appraiser data for real estate deal analysis. Pull property details, valuations, sales history, and comparable sales from Florida county ArcGIS APIs. No API key needed.
allowed-tools: Bash(property-lookup:*),Bash(curl:*)
---

# Property Lookup Tool

Query Florida county property appraiser databases for property details, valuations, sales history, and comparable sales. Data comes from official county ArcGIS REST APIs -- free, no authentication required.

## Quick Start

```bash
# Look up a property by folio number
property-lookup search --county miami-dade --folio "0141370560830"

# Search by address
property-lookup search --county miami-dade --address "123 Main St"

# Search by ZIP code (returns multiple properties)
property-lookup search --county miami-dade --zip 33139 --limit 50

# Pull comparable sales (sold properties near an address)
property-lookup comps --county miami-dade --address "123 Main St" --radius 0.5 --months 6

# Get market stats for a ZIP code
property-lookup market --county miami-dade --zip 33139
```

## Commands

### search -- Property Lookup

```bash
property-lookup search --county <county> [options]
```

Options:
- `--folio <id>` -- Search by folio/parcel number
- `--address <addr>` -- Search by street address (partial match)
- `--zip <code>` -- Search by ZIP code
- `--limit <n>` -- Max results (default: 10, max: 500)
- `--format json|table` -- Output format (default: table)

Returns: address, owner, beds/baths/sqft, year built, lot size, assessed value, last 3 sales (date + price), zoning, land use

### comps -- Comparable Sales

```bash
property-lookup comps --county <county> --address <addr> [options]
```

Options:
- `--radius <miles>` -- Search radius in miles (default: 0.5)
- `--months <n>` -- Look back period in months (default: 6)
- `--beds <n>` -- Filter by bedroom count
- `--min-sqft <n>` -- Minimum living area
- `--max-sqft <n>` -- Maximum living area
- `--limit <n>` -- Max comps to return (default: 10)
- `--format json|table` -- Output format (default: table)

Returns: comparable properties sorted by distance, with sale price, date, sqft, price/sqft, beds/baths

### market -- Market Statistics

```bash
property-lookup market --county <county> --zip <code>
```

Returns: median sale price, median price/sqft, total sales count, average days between sales, value distribution

## Supported Counties

| County | ID | Data Source |
|--------|----|-------------|
| Miami-Dade | `miami-dade` | MD_ComparableSales/MapServer (228 fields, 20K record limit) |
| Broward | `broward` | GeoHub ArcGIS |
| Palm Beach | `palm-beach` | Parcels/MapServer |

## Tips

- Miami-Dade has the richest data (228 fields including 3 years of valuations and 3 most recent sales)
- Use `--format json` when you need to process results programmatically
- For deal analysis, always pull comps AND do a direct property search
- ZIP-level queries can return many results -- use `--limit` to cap
- Address search uses partial matching -- "123 Main" matches "123 Main St", "123 Main Ave", etc.
