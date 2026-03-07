# Apps Script Deployment Instructions

## What Changed

The pricing calculation has been updated to correctly implement your pricing rules:

**Pricing Logic:**
- **≥ 28 days**: Monthly price ÷ 30.5 × number of days (show as "€X/month")
- **< 28 days**: Compare monthly price vs weekly price, use whichever is cheaper:
  - If monthly price ≤ (weekly rate ÷ 7 × days): Charge full monthly price (show as "€X/month")
  - If weekly is cheaper: Charge prorated weekly (show as "€X/week")
- All prices are rounded to whole numbers (no cents)

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

### 1. **Rooms** Sheet
Columns:
- A: Room ID (e.g., "oct-1", "blue-dorm")
- B: Room Name (e.g., "Octopus Room 1")
- C: Building (e.g., "Octopus House", "Blue House", "Old House", "Camping")
- D: Description
- E: Photo filename (e.g., "octopus-1.jpg")
- F: Capacity (1 for private rooms, 4+ for dorms)
- G: Daily Rate (€)
- H: Weekly Rate (€)
- I: Monthly Rate (€)
- J: Active (TRUE/FALSE)

### 2. **Bookings** Sheet
Columns:
- A: Room ID
- B: Arrival Date
- C: Departure Date
- D: Status ("confirmed", "pending", "cancelled")

### 3. **Applications** Sheet
This will be populated automatically when people submit applications.

## Testing

After deployment:
1. Visit your application page
2. Select dates for different durations:
   - **< 7 days**: Should show appropriate pricing
   - **7-27 days**: Should show weekly or monthly rate (whichever is cheaper)
   - **≥ 28 days**: Should show monthly rate with "€X/month"
3. Check that all prices are rounded (no cents)

## Troubleshooting

**"Required sheets not found" error:**
- Make sure your sheet tabs are named exactly: "Rooms", "Bookings", "Applications"

**Dates not working:**
- Ensure dates in the Bookings sheet are formatted as dates, not text

**Empty room list:**
- Check that rooms have Active = TRUE in column J
- Verify the Rooms sheet has data starting from row 2 (row 1 is headers)

## Need Help?

Check the Apps Script logs:
1. In Apps Script editor, click **Executions** (left sidebar)
2. Look for errors in recent runs
