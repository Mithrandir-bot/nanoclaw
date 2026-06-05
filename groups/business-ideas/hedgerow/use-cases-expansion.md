# Hedgerow - Expanded Use Cases (Gemini 3 + Grok 4.3, vetted 2026-06-02)

All vetted against the design rule: clean BINARY yes/no trigger, real public oracle, genuine business pain, no margins/props/subjective-cancellation. Odds bands are rough; the calculator computes the real per-city/date number.

## Tier A - Weather / RAIN (always priceable, strong pain) - best fits
| Business | Trigger (oracle) | Promo line | Pain / insurable interest | Odds |
|---|---|---|---|---|
| Car washes | Rain >= 0.01 in on Saturday (NWS) | "Rains this Saturday? Free wash next week." | Weekend rain guts 40-60% of weekly revenue | low-med |
| Golf courses | Rain >= 0.5 in on a weekend day (NWS) | "Free round if it rains this weekend." | Rain cancels tee times + food/beverage | low-med |
| Farmers markets / produce stands | Rain >= 0.25 in on market day (NWS) | "Double your produce if it rains Saturday." | Empties foot traffic, spoils unsold stock | low-med |
| Breweries with beer gardens | Rain >= 0.25 in Fri-Sun (NWS) | "Free flight if it rains this weekend." | Rain kills peak patio + event revenue | low-med |
| Drive-in / outdoor cinema | Rain >= 0.1 in on show night (NWS) | "Second ticket free if it rains on movie night." | Single-night events forced to refund | low-med |
| Roofing / gutter co. | Rain >= 3 in in 24h (NWS) | "A 3-inch deluge? Your repair is 50% off." | Storms halt work + create the backlog | low |
| Landscaping / contractors | Rain >= 0.5 in on a scheduled workday (NWS) | "Rained-out workday this week? Next service half off." | Rain = idle crews, delayed jobs | low-med |

## Tier B - Weather / HEAT, COLD, SNOW
| Business | Trigger (oracle) | Promo line | Pain | Odds |
|---|---|---|---|---|
| HVAC / AC repair | Heat index >= 100F for 3+ days (NWS) | "Free tune-up if we hit a 100-degree heat wave." | Heat waves overload systems, spike costs | low |
| Pool & spa service | High >= 95F in a 7-day window (NWS) | "Free extra service if we hit 95+." | Heat = emergency calls, churn | low |
| Garden centers / nurseries | Late frost: low <= 32F after a spring date (NWS) | "A late frost? We replace your plants free." | Frost = immediate product loss | low (novel) |
| Ski / snowboard shops | New snow >= 6 in in region within 7 days (NWS) | "Free boot fit if we get a foot of snow this week." | Low-snow years stall high-margin gear | low |
| Ice cream trucks / mobile dessert | High >= 90F on weekend (NWS) | "Free extra scoop if it hits 90+." | Heat directly drives weekend volume | low-med |

## Tier C - Novel clean oracles
| Business | Trigger (oracle) | Promo line | Pain | Odds |
|---|---|---|---|---|
| Race / marathon organizers | AQI >= 150 (EPA AirNow) | "Code Red air day? Full refund." | Smoke/smog forces cancellations | low (novel oracle) |

## Tier D - Non-weather (caveats)
| Business | Trigger (oracle) | Promo line | Note |
|---|---|---|---|
| Taxi / rideshare fleets | Gas >= $4.00/gal (EIA/AAA) | "10% ride credit if gas tops $4 this month." | FUEL is preview-only until a real implied-vol feed is wired (not bindable yet) |
| Sports retail / team merch | Team makes playoffs / wins championship (official) | "Team makes the playoffs? 20% off jerseys." | SPORTS depends on a liquid market existing |

## Explicitly EXCLUDED (fail the rule)
- Construction "wind delay" - no clean public on-site wind oracle; gust vs sustained is subjective.
- Player props / point margins ("double-double", "win by 14") - prop/spread, casino-ish, often no liquid market.
- Event "attendance drop" - verifiable only by internal audit, no public real-time oracle.
- Anything triggered on a subjective "cancellation" - settle on the measured weather, not the cancellation decision.
