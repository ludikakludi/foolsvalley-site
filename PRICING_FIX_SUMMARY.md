# Room Pricing Display Fix - Summary

## Problem
Room prices were displaying inconsistently - some showed daily rates, some weekly, some monthly, regardless of the actual stay duration and pricing tier being used for billing.

## Solution
Fixed the pricing calculation in the backend (Apps Script) to correctly implement your pricing rules and display the appropriate rate tier.

## New Pricing Logic (Implemented in Code.gs)

### For stays ≥ 28 days:
- **Calculation**: Monthly rate ÷ 30.5 × number of days
- **Display**: "€X/month" (shows the monthly rate as reference)
- **Example**: 35 days, monthly rate €600 → charges €687 (600 ÷ 30.5 × 35), shows "€600/month"

### For stays < 28 days:
Compare two options and use the cheaper one:

**Option A - Monthly pricing:**
- Full monthly rate (no proration)
- Display: "€X/month"

**Option B - Weekly pricing:**
- Weekly rate ÷ 7 × number of days
- Display: "€X/week"

**Example 1**: 20 days, weekly €180, monthly €600
- Weekly option: (180 ÷ 7 × 20) = €514
- Monthly option: €600
- **Result**: Charge €514, show "€180/week"

**Example 2**: 20 days, weekly €200, monthly €500
- Weekly option: (200 ÷ 7 × 20) = €571
- Monthly option: €500
- **Result**: Charge €500, show "€500/month"

### All prices are rounded to whole numbers (no cents)

## Files Changed

### 1. **Code.gs** (NEW - Backend)
- Complete rewrite of pricing calculation logic
- Function `calculateRoomPrice()` implements the exact rules above
- Ensures backend sends the correct price tier used for billing

### 2. **apply.html** (Frontend)
- Line ~1006-1020: Added `normalizePriceBreakdown()` function
- Line ~1071: Apply normalized breakdown to room cards
- Line ~1127: Apply normalized breakdown to review section
- Function now just ensures no cents are displayed (backend does the heavy lifting)

### 3. **script application sheet.html** (Frontend)
- Line ~1078-1092: Added `normalizePriceBreakdown()` function
- Line ~1138: Apply normalized breakdown to room cards
- Line ~1188: Apply normalized breakdown to review section
- Same cleanup as apply.html

### 4. **APPS_SCRIPT_DEPLOYMENT.md** (NEW - Documentation)
- Step-by-step instructions for deploying the updated Apps Script
- Google Sheet structure requirements
- Testing checklist

## Next Steps

1. **Deploy the Apps Script** (see APPS_SCRIPT_DEPLOYMENT.md):
   - Copy Code.gs to your Apps Script editor
   - Deploy as new version
   - No need to update HTML files if you update existing deployment

2. **Test different stay durations**:
   - Short stays (< 7 days)
   - Medium stays (7-27 days)
   - Long stays (≥ 28 days)
   - Verify prices match expectations

3. **Verify Google Sheet structure**:
   - Rooms sheet has daily, weekly, and monthly rates
   - All three rate columns are populated
   - Rates are reasonable (weekly should be < 7× daily, monthly should be < 4.3× weekly)

## Pricing Examples

Given a room with:
- Daily: €35
- Weekly: €180 (€25.71/day)
- Monthly: €600 (€19.67/day if prorated over 30.5 days)

| Stay Duration | Calculation | Charge | Display |
|--------------|-------------|--------|---------|
| 7 days | (180 ÷ 7 × 7) = 180 vs 600 → weekly cheaper | €180 | €180/week |
| 14 days | (180 ÷ 7 × 14) = 360 vs 600 → weekly cheaper | €360 | €180/week |
| 21 days | (180 ÷ 7 × 21) = 540 vs 600 → weekly cheaper | €540 | €180/week |
| 27 days | (180 ÷ 7 × 27) = 694 vs 600 → monthly cheaper | €600 | €600/month |
| 28 days | (600 ÷ 30.5 × 28) = 551 | €551 | €600/month |
| 35 days | (600 ÷ 30.5 × 35) = 689 | €689 | €600/month |
| 60 days | (600 ÷ 30.5 × 60) = 1,180 | €1,180 | €600/month |

## Important Notes

- The displayed rate (e.g., "€600/month") is the **base rate**, not the final charge
- For ≥ 28 days, the final charge is prorated (base rate ÷ 30.5 × days)
- For < 28 days, the system picks monthly OR weekly, whichever is cheaper
- All final prices are whole numbers (no cents)
