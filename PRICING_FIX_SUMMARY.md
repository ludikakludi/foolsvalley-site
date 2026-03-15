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
**Simple tier breakpoints** - your stay duration determines which pricing tier applies.

### The Algorithm:

**1-6 days:** Daily rate
- Calculation: `numDays × daily rate`
- Display: "€X/day"

**7-13 days:** Weekly flat rate
- Price: Full weekly rate (same price whether 7, 10, or 13 days)
- Display: "€X/week"

**14-29 days:** 2-week flat rate
- Price: Full 2-week rate (same price whether 14, 20, or 29 days)
- Display: "€X/2 weeks"

**30+ days:** Monthly prorated
- Calculation: `monthly ÷ 30.5 × numDays`
- Display: "€X/month"

### All prices are rounded to whole numbers (no cents)

### Examples:

Given a room with: Daily €35, Weekly €180, 2-Week €300, Monthly €600

**4-day stay:**
- Falls in **1-6 days tier** → Daily rate
- Calculation: 4 × €35 = €140
- Display: "€35/day"

**10-day stay:**
- Falls in **7-13 days tier** → Weekly flat rate
- Price: €180 (same whether 7, 10, or 13 days)
- Display: "€180/week"

**20-day stay:**
- Falls in **14-29 days tier** → 2-week flat rate
- Price: €300 (same whether 14, 20, or 29 days)
- Display: "€300/2 weeks"

**28-day stay:**
- Falls in **14-29 days tier** → 2-week flat rate
- Price: €300
- Display: "€300/2 weeks"

**35-day stay:**
- Falls in **30+ days tier** → Monthly prorated
- Calculation: (€600 ÷ 30.5) × 35 = €689
- Display: "€600/month"

**60-day stay:**
- Falls in **30+ days tier** → Monthly prorated
- Calculation: (€600 ÷ 30.5) × 60 = €1,180
- Display: "€600/month"

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

### Event Blocking
- **Special events**: All rooms can be blocked during specific date ranges
- **Configured in Code.gs**: `EVENT_BLOCKS` array at top of file
- **Currently blocked**: July 4 - August 2, 2026 (Summer Event 2026)
- **Easy to manage**: Add/remove/edit event blocks in the array
- Rooms automatically show as unavailable during blocked periods

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

| Stay Duration | Tier Applied | Price Calculation | **Charge** | Display |
|--------------|--------------|-------------------|-----------|---------|
| 3 days | 1-6 days | 3 × €35 | **€105** | €35/day |
| 5 days | 1-6 days | 5 × €35 | **€175** | €35/day |
| 6 days | 1-6 days | 6 × €35 | **€210** | €35/day |
| 7 days | 7-13 days | Flat weekly rate | **€180** | €180/week |
| 10 days | 7-13 days | Flat weekly rate | **€180** | €180/week |
| 13 days | 7-13 days | Flat weekly rate | **€180** | €180/week |
| 14 days | 14-29 days | Flat 2-week rate | **€300** | €300/2 weeks |
| 20 days | 14-29 days | Flat 2-week rate | **€300** | €300/2 weeks |
| 28 days | 14-29 days | Flat 2-week rate | **€300** | €300/2 weeks |
| 29 days | 14-29 days | Flat 2-week rate | **€300** | €300/2 weeks |
| 30 days | 30+ days | (€600 ÷ 30.5) × 30 | **€590** | €600/month |
| 35 days | 30+ days | (€600 ÷ 30.5) × 35 | **€689** | €600/month |
| 60 days | 30+ days | (€600 ÷ 30.5) × 60 | **€1,180** | €600/month |

**Note:** Monthly rate for 30+ days is prorated: (monthly ÷ 30.5 × days)

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

- **Simple tier breakpoints** - your stay duration determines which pricing tier applies
- The displayed rate (e.g., "€180/week") shows which tier was applied
- **1-6 days:** Daily rate (multiplied by number of days)
- **7-13 days:** Weekly flat rate (same price for all durations in this range)
- **14-29 days:** 2-week flat rate (same price for all durations in this range)
- **30+ days:** Monthly rate prorated (monthly ÷ 30.5 × days)
- All final prices are whole numbers (no cents)
- Room availability is checked in real-time against the calendar
- Dorms and camping spots track multiple occupants per day
