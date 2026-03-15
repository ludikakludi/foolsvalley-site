# Apps Script Deployment Instructions

## What Changed

### 1. Simple Tier Breakpoint Pricing
- **1-6 days**: Daily rate (numDays × daily)
- **7-13 days**: Weekly flat rate
- **14-29 days**: 2-week flat rate
- **30+ days**: Monthly rate prorated (monthly ÷ 30.5 × days)
- All prices rounded to whole numbers (no cents)

### 2. Calendar-Based Availability
- Reads bookings from "valley rooms" sheet (calendar format)
- Automatically maps room names between calendar and pricing sheets
- Tracks multi-occupancy rooms (dorms: 4-6 beds, camping: 4 spots each)

### 3. Application Processing
- Sends **comprehensive emails** to theonlyfool@foolsvalley.com with ALL application responses
- Saves submissions to "applications" sheet
- **Automatically records bookings** in "valley rooms" calendar (gray text until approved)

### 4. Event Blocking
- **Block all rooms** during special events/retreats
- Configured at top of Code.gs in `EVENT_BLOCKS` array
- Currently: July 4 - August 2, 2026 blocked for Summer Event
- To add more events, edit the EVENT_BLOCKS array in Code.gs

## How to Deploy

### Option 1: Update Existing Apps Script

1. Open your Google Sheet with the residency data
2. Click **Extensions** → **Apps Script**
3. You'll see the existing code in the editor
4. **Select all the code** (Cmd+A or Ctrl+A)
5. **Delete it**
6. **Copy all the code** from `Code.gs` in this folder
7. **Paste it** into the Apps Script editor
8. Click **Save** (disk icon or Cmd+S)
9. Click **Deploy** → **Manage deployments**
10. Click the **Edit** icon (pencil) on your existing deployment
11. Set "New version" (or increment version)
12. Click **Deploy**
13. The Apps Script URL will stay the same - no need to update HTML files!

### Option 2: Create New Deployment

1. Open your Google Sheet
2. Click **Extensions** → **Apps Script**
3. Paste the code from `Code.gs`
4. Click **Save**
5. Click **Deploy** → **New deployment**
6. Select type: **Web app**
7. Settings:
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy**
9. Copy the new Web app URL
10. Update the `APPS_SCRIPT_URL` in both:
    - `apply.html` (line 654)
    - `script application sheet.html` (line 761)

## Required Google Sheet Structure

Your Google Sheet needs these sheets:

### 1. **"prices"** Sheet (Room Pricing)
Columns:
- A: Room ID (e.g., "ensuite", "oct-1", "dorm_bh", "van")
- B: Room Name (e.g., "En Suite", "Octopus Room 1", "Blue House Dorm")
- C: Building (e.g., "Blue House", "Old House", "Camping")
- D: Monthly Rate (€)
- E: 2-Week Rate (€)
- F: Weekly Rate (€)
- G: Daily Rate (€)
- H: Photo filename (e.g., "ensuite.jpg")
- I: Description

**Important Room IDs:**
- Single rooms: ensuite, sunny, normal_s, normal_m, normal_n, oct-1, oct-2, orange, yellow, green
- Dorms: dorm_bh (4 beds), dorm_oh (6 beds)
- Camping: van (4 spots), tipi (4 spots)

### 2. **"valley rooms"** Sheet (Calendar/Bookings)
Calendar format:
- **Row 1**: Room names (headers) - e.g., "en suite", "normal south", "bunk 1", "octopus 1"
- **Column A**: Dates (starting row 2)
- **Other columns**: Guest names for each room on each date

Example:
```
     | A (Date)  | B (en suite) | C (bunk 1) | D (octopus 1) |
-----|-----------|--------------|------------|---------------|
  1  | Date      | en suite     | bunk 1     | octopus 1     |
  2  | 4/1/2026  | Agartha      | Agartha    | John Smith    |
  3  | 4/2/2026  | Agartha      | Agartha    | John Smith    |
```

**Room name mappings** (case-insensitive):
- "en suite" → ensuite
- "normal south" → normal_s, "normal middle" → normal_m, "normal north" → normal_n
- "bunk 1", "bunk 2", "bunk 3", "bunk 4" → dorm_bh
- "octopus 1" → oct-1, "octopus 2" → oct-2
- "van 1", "van 2", "van 3", "van 4" → van
- "tipi 1", "tipi 2", "tipi 3", "tipi 4" → tipi

### 3. **"applications"** Sheet
Auto-created on first submission. Stores all application form data.

## Managing Event Blocks

To block all rooms during special events (retreats, workshops, etc.):

1. Open Code.gs in Apps Script editor
2. Find the `EVENT_BLOCKS` array near the top (around line 12)
3. Add/edit/remove event blocks:

```javascript
const EVENT_BLOCKS = [
  {
    name: 'Summer Event 2026',
    startDate: '2026-07-04',  // July 4, 2026 (inclusive)
    endDate: '2026-08-02'     // August 2, 2026 (exclusive - Aug 2 is free)
  },
  {
    name: 'Winter Retreat',
    startDate: '2026-12-20',
    endDate: '2027-01-05'
  }
];
```

4. Save and redeploy
5. All rooms will automatically be unavailable during these periods

**Note:** Use format `YYYY-MM-DD` for dates. End date is exclusive (checkout day is free).

## Testing

After deployment, test these scenarios:

### Pricing Tests
1. Visit your application page
2. Select dates for different durations:
   - **< 7 days**: Should show weekly or monthly (whichever cheaper)
   - **7-13 days**: Should show weekly or monthly (whichever cheaper)
   - **14-27 days**: Should show 2-week, weekly, or monthly (whichever cheapest)
   - **≥ 28 days**: Should show "€X/month" with prorated calculation
3. Check that all prices are rounded (no cents)
4. Verify the price breakdown shows the correct tier (e.g., "€300/2 weeks")

### Availability Tests
1. Select dates in April 2026
2. Verify booked rooms don't appear (e.g., "TC hub" rooms if Agartha is booked)
3. Test dorm capacity:
   - Blue House dorm (4 beds): Should disappear when all 4 bunks booked
   - Old House dorm (6 beds): Should disappear when all 6 bunks booked
4. Test multi-day bookings: Room should be unavailable if ANY day in range is booked
5. **Test event blocking**:
   - Try booking dates July 4 - August 2, 2026
   - ALL rooms should be unavailable (Summer Event 2026)
   - Try dates that overlap partially (e.g., July 1-10)
   - Should also show no rooms available

### Application Submission Tests
1. Fill out and submit an application
2. Check email arrives at theonlyfool@foolsvalley.com
3. Verify data appears in "applications" sheet
4. **Check "valley rooms" calendar**:
   - Guest name should appear in correct room column(s)
   - Text should be **gray** (#999999)
   - Cell should have a note: "Pending approval - from application form"
   - Booking should cover all dates from arrival to departure
   - For dorms/camping: Check it used an available bed/spot
5. **Manual approval**: Change text color from gray to black to confirm booking

## Troubleshooting

**"Required sheets not found" error:**
- Make sure sheet tabs are named exactly: "prices", "valley rooms", "applications"
- Sheet names are case-sensitive

**Rooms showing as available when booked:**
- Check "valley rooms" sheet has dates in column A
- Verify guest names are in correct room columns
- Check room names match expected format (e.g., "en suite" not "ensuite")
- Review Apps Script execution logs for mapping errors

**Empty room list:**
- Verify the "prices" sheet has data starting from row 2 (row 1 is headers)
- Check all rate columns (D, E, F, G) have numeric values
- Make sure room IDs in column A match expected format

**Wrong prices displaying:**
- Verify rate columns are in correct order: D=monthly, E=2-week, F=weekly, G=daily
- Check rates are reasonable (2-week < monthly, weekly < 2-week, etc.)
- Review Apps Script logs to see which pricing tier was selected

**Dorms showing wrong capacity:**
- Blue House dorm (dorm_bh): Should have 4 beds total
- Old House dorm (dorm_oh): Should have 6 beds total
- Check calendar has correct number of "bunk" columns for each dorm

## Need Help?

Check the Apps Script logs:
1. In Apps Script editor, click **Executions** (left sidebar)
2. Look for errors in recent runs
