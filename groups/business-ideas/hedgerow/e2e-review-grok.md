# E2E click-through analysis — GROK 4.3

**1. PER-FEATURE VERDICT**  
- weather pricing (one-click+scroll): **PASS** (weather-tampa-blankThreshold-oneclick)  
- 6 can't-price states: **PASS** (weather-too-soon-+5d, weather-too-far-+200d, weather-hurricane-miami-sept, weather-too-likely-miami-rain02, weather-unknown-city, weather-exposure-too-low, weather-empty-city)  
- sports: **PASS** (sports-real-matchup, sports-gibberish-nomarket-lead)  
- fuel: **PASS** (fuel-estimate-requestquote)  
- AI-designer handoff: **FAIL** (ai-designer-handoff)  
- checkout (card/ACH/USDC): **PASS** (checkout-card, checkout-ach, checkout-usdc)  
- waitlist: **PASS** (waitlist-submit)  
- partner/affiliate: **PASS** (partner-affiliate-form)  
- chat: **PASS** (chat-widget)  
- FAQ: **PASS** (faq-accordion)  
- nav: **PASS** (nav-links-desktop)  
- mobile hamburger: **PASS** (mobile-hamburger)  
- sticky CTA: **PASS** (mobile-sticky-cta)  

**2. REAL BUGS**  
ai-designer-handoff: `calcResultVisible=false` after populating `category=sports` + long-sentence `matchup`. Sports pricing expects live Polymarket/Kalshi markets; the handoff feeds a non-trading event so the calculator correctly returns no odds (server behavior).  

**3. TOP 5 FIXES**  
1. AI handoff — restrict `matchup` generation to currently trading sports events or switch category to weather/fuel on handoff (ai-designer-handoff).  
2. (none further supported by data; all other flows PASS).
