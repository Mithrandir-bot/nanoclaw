# Hedgerow — Wide-Net Event Catalog (pilot + lead gen)

For the pilot we cast wide to learn what businesses actually want — including sports-for-bars (even if its unit economics look weak; it's a great lead-gen magnet). Each event type needs: an objective **settlement oracle**, ideally a **hedge venue**, and a clear **target SMB**.

| Event type | Example promo | Target SMB | Settlement oracle | Hedge / pricing venue | Status |
|---|---|---|---|---|---|
| **Local sports outcome** | "Free wings if the Bucs win" | Bars, restaurants, breweries, pizza | Official league result | **Polymarket** (deep, API) / Kalshi | Hedgeable; lead-gen magnet |
| **Sports margin / prop** | "Win by 14+ → 20% off" | Same | Official result | Polymarket/Kalshi | Hedgeable; longer odds = cheaper |
| **Season milestone** | "Make the playoffs → sale" | Sports retail, merch, hotels near stadium | Official standings | Polymarket/Kalshi | Hedgeable; multi-week |
| **Rain on a date** | "Rains on your event → refund" | Weddings, tours, festivals, golf, food trucks | **NWS (api.weather.gov)** | Parametric (self-insure, capped) | Live oracle wired |
| **Snow on a date** | "Snows by X → money back" | Furniture, car dealers, jewelry, HVAC (high-ticket) | NWS daily snowfall | Parametric (self-insure, capped) | Live oracle wired |
| **Heat threshold** | "Hits 95°F → free scoops" | Ice cream, pools, A/C, beverages | NWS daily high | Parametric (self-insure, capped) | Live oracle wired |
| **Gas/fuel price** | "Gas tops $X → fuel rebate" / "drops below $Y → bonus" | Gas stations, auto, delivery/fleet, rideshare | **EIA / AAA** published price | **RBOB futures via IBKR** (real hedge) | Adjacency — objective + hedgeable |
| **Marquee race/event** | "If the favorite wins the Indy 500…" | Event-tied retail/hospitality | Official result | Polymarket/Kalshi | Hedgeable, seasonal |

**Excluded (deliberately):** elections/politics (toxic + correlated), anything the customer can influence (moral hazard), and anything without a clean public oracle. Catastrophes (flood/hurricane) are correlated/unbounded → never self-insured.

## Pilot framing
- **Lead-gen net (wide):** offer sports (bars) + weather (outdoor/retail) + a couple of novelty/seasonal options on the landing to see what converts. Sports is the cheapest customer-acquisition hook even if margins are thin — it gets businesses in the door and teaches us which verticals lean in.
- **Economic backbone (narrow):** the high-volume, small-ticket, well-diversified **rain/snow** book (per `pricing-rules.md`) is where the near-certain-profit comes from. Sports is hedged-thin; weather is the money.
- **Hedge routing:** sports → Polymarket/Kalshi; fuel → RBOB futures (IBKR); weather → parametric self-insure within caps. Admission control (`/api/admit`) enforces per-promo/client/cluster/peril limits across all of it.
