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

### How It Works:
**Daily rate is the baseline.** Tier prices (weekly/2-week/monthly) act as discounts and are only used when they're cheaper.

### The Algorithm:

**For stays ≥ 28 days:**
The system ONLY compares:
1. **Daily option**: `numDays × daily rate`
2. **Monthly option**: Monthly rate prorated (`monthly ÷ 30.5 × numDays`)

Weekly and 2-week rates are NOT offered for long stays.

**For stays < 28 days:**
The system compares ALL options:
1. **Daily option**: `numDays × daily rate`
2. **Weekly option**: Full weekly rate (not prorated) - only if cheaper than daily total
3. **2-week option**: Full 2-week rate (not prorated) - only if cheaper than daily total
4. **Monthly option**: Full monthly rate - only if cheaper than daily total

The system picks the **cheapest option** and displays which tier was used.

### All prices are rounded to whole numbers (no cents)

### Examples:

**4-day stay** (daily €35, weekly €180, 2-week €300, monthly €600):
- Daily: 4 × 35 = €140
- Weekly: €180 (not cheaper)
- **Result**: Charge €140, show "€35/day"

**6-day stay** (same rates):
- Daily: 6 × 35 = €210
- Weekly: €180 (cheaper!)
- **Result**: Charge €180, show "€180/week"

**10-day stay** (same rates):
- Daily: 10 × 35 = €350
- Weekly: €180 (cheaper!)
- 2-week: €300 (not cheaper than weekly)
- Monthly: €600 (not cheaper)
- **Result**: Charge €180, show "€180/week"

**20-day stay** (same rates):
- Daily: 20 × 35 = €700
- Weekly: €180 (cheaper!)
- 2-week: €300 (cheaper than weekly!)
- Monthly: €600 (not cheaper than 2-week)
- **Result**: Charge €300, show "€300/2 weeks"

**28-day stay** (same rates):
- Daily: 28 × 35 = €980
- Monthly prorated: (600 ÷ 30.5 × 28) = €551
- Weekly/2-week NOT offered for stays ≥ 28 days
- **Result**: Charge €551, show "€600/month"

**30-day stay** (same rates):
- Daily: 30 × 35 = €1,050
- Monthly prorated: (600 ÷ 30.5 × 30) = €590
- Weekly/2-week NOT offered for stays ≥ 28 days
- **Result**: Charge €590, show "€600/month"

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

### Checkout/Checkin Logic
- **Checkout date is FREE**: When someone books April 1-5, only April 1,2,3,4 are marked as occupied
- **April 5 is available**: Another guest can check in the same day as previous checkout
- **Same-day turnaround**: This allows back-to-back bookings with checkout/checkin on the same day

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
- **Comprehensive email notifications**: Sends ALL application responses to theonlyfool@foolsvalley.com
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

## Pricing Examples Table

Given a room with:
- Daily: €35
- Weekly: €180
- 2-week: €300
- Monthly: €600

| Stay Duration | Daily Calc | Weekly | 2-Week | Monthly | **Winner** | Display |
|--------------|------------|--------|--------|---------|------------|---------|
| 3 days | 3×35 = **€105** | €180 | €300 | €600 | Daily | €35/day |
| 4 days | 4×35 = **€140** | €180 | €300 | €600 | Daily | €35/day |
| 6 days | 6×35 = €210 | **€180** | €300 | €600 | Weekly | €180/week |
| 7 days | 7×35 = €245 | **€180** | €300 | €600 | Weekly | €180/week |
| 10 days | 10×35 = €350 | **€180** | €300 | €600 | Weekly | €180/week |
| 14 days | 14×35 = €490 | €180 | **€300** | €600 | 2-Week | €300/2 weeks |
| 20 days | 20×35 = €700 | €180 | **€300** | €600 | 2-Week | €300/2 weeks |
| 27 days | 27×35 = €945 | €180 | **€300** | €600 | 2-Week | €300/2 weeks |
| **28 days** | 28×35 = €980 | N/A* | N/A* | **€551** | Monthly | €600/month |
| **35 days** | 35×35 = €1,225 | N/A* | N/A* | **€689** | Monthly | €600/month |
| **60 days** | 60×35 = €2,100 | N/A* | N/A* | **€1,180** | Monthly | €600/month |

\* For stays ≥ 28 days, only daily and monthly (prorated) options are compared. Weekly/2-week rates do not apply.

Monthly rate for ≥28 days is prorated: (monthly ÷ 30.5 × days)

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

- **Daily rate is the baseline** - tier prices are discounts that apply when cheaper
- The displayed rate (e.g., "€180/week") shows which tier discount was applied
- For ≥ 28 days, monthly rate is prorated (monthly ÷ 30.5 × days)
- For < 28 days, tier prices are FULL prices (not prorated)
- All final prices are whole numbers (no cents)
- Room availability is checked in real-time against the calendar
- Dorms and camping spots track multiple occupants per day
