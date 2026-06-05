# Hedgerow review 2 + new use cases - GROK 4.3

**PART 1 - FULL REVIEW**

All 23 scenarios marked "ok": true. 422/404 responses are expected and surface as friendly caveats. No layout overlaps, no broken CTAs, no failed checkouts.

- **weather-tampa-blankThreshold-oneclick**: PASS (autofills 11.6", shows clean $860/$3,000 result at 22%, scroll + lead capture works)
- **weather-too-soon/+5d & weather-too-far/+200d**: PASS (correct window enforcement, 422 with clear message)
- **weather-hurricane-miami-sept**: PASS (404 + season-block message)
- **weather-too-likely-miami-rain02 & weather-unknown-city & weather-empty-city**: PASS (friendly "enter U.S. city" messages)
- **sports-real-matchup & sports-gibberish-nomarket-lead**: PASS (no-market message + lead capture shown)
- **fuel-estimate-requestquote**: PASS (27% shown, result panel + fuel lead capture)
- **weather-exposure-too-low**: PASS (flags field + message)
- **ai-designer-handoff & preset-chip**: PASS (populates calculator correctly)
- **checkout-card/ach/usdc, partner-affiliate-form, chat-widget, faq-accordion, nav-links, mobile-hamburger, mobile-sticky-cta, waitlist-submit**: PASS (no regressions)

**Top 5 highest-value improvements**
1. In `weatherThresholdGroup`, add an explicit "(edit if desired)" note next to the autofilled value so users know the 11.6" was suggested.
2. On sports "no live market" states (sports-real-matchup), prefill the lead-capture email field if the user has already typed one in the main CTA form.
3. Surface a one-line "Settled by NWS / EIA / official standings" badge on the hero + vertical cards (currently only visible after pricing).
4. In the result panel, add a direct "Copy promo text" button (copy the exact trigger phrasing users will advertise).
5. Make the AI designer output pre-select the matching category chip automatically when "Use this promo" is clicked, eliminating the extra category dropdown step.

**PART 2 - NEW BUSINESS USE CASES**

1. **Golf courses**  
   (a) Golf course/outdoor facility  
   (b) Rain ≥0.5 in on Saturday or Sunday, settled by NWS daily summary  
   (c) "Free round if it rains this weekend"  
   (d) Rain cancels tee times and food/beverage revenue  
   (e) Low (15-25%)

2. **Farmers markets / produce stands**  
   (a) Farmers market stall or roadside stand  
   (b) Rain ≥0.25 in on market day, settled by NWS  
   (c) "Double your produce if it rains Saturday"  
   (d) Rain empties foot traffic and spoils unsold inventory  
   (e) Low (15-25%)

3. **Ski & snowboard shops**  
   (a) Specialty winter sports retailer  
   (b) New snowfall ≥6 in in the resort region within 7 days, settled by NWS snowfall totals  
   (c) "Free boot fitting if we get a foot of snow this week"  
   (d) Low snow = slow early-season sales of high-margin gear  
   (e) Low (10-20%)

4. **Pool & spa service companies**  
   (a) Pool maintenance / chemical service route  
   (b) High temperature ≥95°F on any day in a 7-day window, settled by NWS daily max  
   (c) "Free extra chemical service if we hit 95°+"  
   (d) Heat spikes = emergency calls and customer churn  
   (e) Low (10-18%)

5. **Outdoor movie / drive-in theaters**  
   (a) Drive-in or pop-up outdoor cinema  
   (b) Rain ≥0.1 in on show night, settled by NWS hourly  
   (c) "Second ticket free if it rains on movie night"  
   (d) Rain forces refunds or cancellations of single-night events  
   (e) Low (15-25%)

6. **Breweries with beer gardens**  
   (a) Brewery taproom with outdoor seating  
   (b) Rain ≥0.25 in on Friday-Sunday, settled by NWS  
   (c) "Free flight if it rains this weekend"  
   (d) Rain kills peak patio revenue and event space sales  
   (e) Low (18-28%)

7. **Taxi / rideshare fleets**  
   (a) Local taxi or small fleet operator  
   (b) Published local gas price ≥$4.00/gal, settled by EIA/AAA weekly average  
   (c) "10% ride credit if gas tops $4 this month"  
   (d) Fuel spikes directly erode driver margins and retention  
   (e) Medium (25-35%)

8. **HVAC installation & repair**  
   (a) Residential/commercial HVAC contractor  
   (b) Heat index ≥100°F for 3+ consecutive days, settled by NWS  
   (c) "Free filter service if we hit a 100° heat wave"  
   (d) Extreme heat causes system failures and emergency overload  
   (e) Low (12-20%)

9. **Construction / landscaping crews**  
   (a) Small general contractor or landscaping company  
   (b) Rain ≥0.5 in on a scheduled workday, settled by NWS daily  
   (c) "Free half-day if rain cancels your job this week"  
   (d) Rain days = idle labor and delayed milestones  
   (e) Low (15-25%)

10. **Ice cream trucks & mobile dessert vendors**  
    (a) Ice cream truck or mobile dessert cart  
    (b) High temperature ≥90°F on weekend, settled by NWS  
    (c) "Free extra scoop if it hits 90°+"  
    (d) Heat directly drives weekend sales volume  
    (e) Low (15-22%)
