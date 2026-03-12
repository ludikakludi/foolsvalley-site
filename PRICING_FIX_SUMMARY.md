# Room Pricing & Availability System - Summary

## Problems Solved
1. Room prices were displaying inconsistently - not showing the pricing tier actually used for billing
2. All rooms were showing as available even when booked
3. Multi-occupancy rooms (dorms) weren't tracking capacity correctly

## Solution
- Backend (Apps Script) now calculates correct pricing with 4-tier system
- Calendar-based availability reads from "valley rooms" sheet
- Proper capacity tracking for dorms and camping spots

## Pricing Logic (Implemented in Code.gs)

### For stays ≥ 28 days:
- **Calculation**: Monthly rate ÷ 30.5 × number of days
- **Display**: "€X/month" (shows the monthly rate as reference)
- **Example**: 35 days, monthly rate €600 → charges €687 (600 ÷ 30.5 × 35), shows "€600/month"

### For stays 14-27 days:
Compare three options and use the cheapest:
1. **2-week pricing**: 2-week rate ÷ 14 × number of days → Display "€X/2 weeks"
2. **Weekly pricing**: Weekly rate ÷ 7 × number of days → Display "€X/week"
3. **Monthly pricing**: Full monthly rate (no proration) → Display "€X/month"

**Example**: 20 days, 2-week €300, weekly €180, monthly €600
- 2-week option: (300 ÷ 14 × 20) = €429
- Weekly option: (180 ÷ 7 × 20) = €514
- Monthly option: €600
- **Result**: Charge €429, show "€300/2 weeks"

### For stays < 14 days:
Compare two options and use the cheaper one:
1. **Weekly pricing**: Weekly rate ÷ 7 × number of days → Display "€X/week"
2. **Monthly pricing**: Full monthly rate (no proration) → Display "€X/month"

**Example**: 10 days, weekly €180, monthly €600
- Weekly option: (180 ÷ 7 × 10) = €257
- Monthly option: €600
- **Result**: Charge €257, show "€180/week"

### All prices are rounded to whole numbers (no cents)

## Availability System

### Calendar-Based Booking
- Reads from "valley rooms" sheet (calendar format)
- Each column represents a room, rows are dates, cells contain guest names
- Automatically maps room names between calendar and pricing sheets
- Supports multi-capacity rooms (dorms, camping)

### Room Name Mapping
System automatically maps variations:
- **Blue House**: "en suite" → "ensuite", "normal south" → "normal_s", etc.
- **Old House**: "octopus 1" → "oct-1", "orange" → "orange", etc.
- **Dorms**: "bunk 1-4" all map to "dorm_bh" (4 total beds)
- **Camping**: "van 1-4" all map to "van" (4 total spots)

### Capacity Tracking
- **Single rooms**: Capacity = 1
- **Blue House dorm**: Capacity = 4 beds
- **Old House dorm**: Capacity = 6 beds
- **Camping (van)**: Capacity = 4 spots
- **Camping (tipi)**: Capacity = 4 spots

System counts bookings per day and shows room as unavailable when capacity is reached.

### Automatic Calendar Recording
When someone submits an application:
- **Guest name** is automatically written to the "valley rooms" calendar
- **Gray text** (#999999) indicates pending approval
- **Cell note** says "Pending approval - from application form"
- **Date range** covers arrival to departure (arrival inclusive, departure exclusive)
- **Multi-capacity rooms** (dorms/camping): System finds first available bed/spot
- **Manual approval**: Change text from gray to black to confirm booking

## Files Changed

### 1. **Code.gs** (Backend - Apps Script)
- `calculateRoomPrice()`: 4-tier pricing logic (daily/weekly/2-week/monthly)
- Calendar parsing from "valley rooms" sheet
- Room name mapping for all buildings
- Multi-capacity availability tracking
- **Automatic calendar recording**: New bookings appear in gray text until approved
- Email notifications to theonlyfool@foolsvalley.com
- Automatic saving to "applications" sheet

### 2. **apply.html** (Frontend)
- Updated APPS_SCRIPT_URL to new deployment
- Added 2-week column to pricing table
- `normalizePriceBreakdown()`: Removes cents from display
- Connects to Code.gs backend for room data and availability

### 3. **script application sheet.html** (Alternative Frontend)
- Same updates as apply.html for consistency
- Alternative application form design

### 4. **APPS_SCRIPT_DEPLOYMENT.md** (Documentation)
- Step-by-step deployment instructions
- Google Sheet structure requirements
- Troubleshooting guide

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
- 2-week: €300 (€21.43/day)
- Monthly: €600 (€19.67/day if prorated over 30.5 days)

| Stay Duration | Options Compared | Charge | Display |
|--------------|------------------|--------|---------|
| 7 days | Weekly: (180÷7×7)=180 vs Monthly: 600 → weekly | €180 | €180/week |
| 14 days | 2wk: (300÷14×14)=300 vs Wk: 360 vs Mo: 600 → 2-week | €300 | €300/2 weeks |
| 20 days | 2wk: (300÷14×20)=429 vs Wk: 514 vs Mo: 600 → 2-week | €429 | €300/2 weeks |
| 27 days | 2wk: (300÷14×27)=579 vs Wk: 694 vs Mo: 600 → 2-week | €579 | €300/2 weeks |
| 28 days | Monthly prorated: (600÷30.5×28) = 551 | €551 | €600/month |
| 35 days | Monthly prorated: (600÷30.5×35) = 689 | €689 | €600/month |
| 60 days | Monthly prorated: (600÷30.5×60) = 1,180 | €1,180 | €600/month |

## Google Sheet Structure

### "prices" Sheet (Room Pricing)
- Column A: Room ID (e.g., "ensuite", "oct-1", "dorm_bh")
- Column B: Room Name (e.g., "En Suite", "Octopus Room 1")
- Column C: Building (e.g., "Blue House", "Old House")
- Column D: Monthly Rate (€)
- Column E: 2-Week Rate (€)
- Column F: Weekly Rate (€)
- Column G: Daily Rate (€)
- Column H: Photo filename (e.g., "ensuite.jpg")
- Column I: Description

### "valley rooms" Sheet (Calendar/Bookings)
- Row 1: Room names (header)
- Row 2+: Dates in column A, guest names in room columns
- Example: If "Agartha" appears in "bunk 1" column on April 5th, that bed is booked

### "applications" Sheet
- Auto-created when first application submitted
- Stores all application form data

## Important Notes

- The displayed rate (e.g., "€600/month") is the **base rate**, not the final charge
- For ≥ 28 days, the final charge is prorated (base rate ÷ 30.5 × days)
- For 14-27 days, the system compares 2-week, weekly, and monthly rates
- For < 14 days, the system compares weekly and monthly rates
- All final prices are whole numbers (no cents)
- Room availability is checked in real-time against the calendar
- Dorms and camping spots track multiple occupants per day
