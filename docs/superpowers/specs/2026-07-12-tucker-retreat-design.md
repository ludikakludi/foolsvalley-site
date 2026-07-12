# Tucker Peck Meditation Retreat — Design

_2026-07-12. Approved by Liza._

## Overview

Add a bookable event to the fools' valley site: **Meditation retreat with Dr. Tucker Peck, Jan 29 – Feb 5 2027**, with an optional self-guided extension weekend (Feb 6–7; Tucker leaves on the 5th). Mirrors the existing residency pattern: static event page → application/booking page → same Apps Script backend → same Google Sheet (`valley rooms` calendar) → notification emails.

## Pages

### 1. `tucker-retreat.html` (new event page)

Styled like `events.html` / `summer-camp.html` (Space Mono + EB Garamond, same nav/footer).

Content:
- Title + dates: Jan 29 – Feb 5, 2027.
- Intro (lightly polished from Liza's text): "We'd like to welcome you to a second retreat with Dr. Tucker Peck at fools' valley." Tucker bio: meditation teacher, clinical psychologist, bestselling author of *Sanity and Sainthood*; specialties: advanced meditators, meditation for psychological disorders; hosts the podcast *Teaching Meditation*; formal training since 2005; studied with Sharon Salzberg and Upasaka Culadasa, among others.
- Note: possible to stay Feb 6–7 to keep meditating — space stays reserved; Tucker leaves Feb 5.
- Three photos: `assets/tucker first.png`, `assets/tucker second.png`, `assets/tucker third.png`.
- Prices:
  - €35/day — food, facilities, Tucker's travel expenses (everyone pays this).
  - €100/week — dorm bed (female dorm or male dorm).
  - €200/week — bed in a room shared by 2 people.
  - Private rooms at normal weekly rates, depending on availability.
  - Arriving earlier / staying later: prices increase pro rata.
- Button: **apply & choose accommodation** → `tucker-apply.html`.

### 2. `tucker-apply.html` (new application + booking page)

Adapted clone of `apply.html`, same Apps Script URL. Sections in order:

**A. Application questions** (\* = required):
1. Email \*
2. What's your name? \*
3. What's your phone number? \*
4. Who's an emergency contact, both name and number? \*
5. If you haven't been on retreat with us before, what is the name of the person you learned about the retreat from? Don't just write "friend" or "colleague," but tell us that person's name. \* — choice: free-text name / "I've been on retreat with Tucker before." / Other (free text).
6. Any food allergies or dietary restrictions? (optional; note about chef possibly charging extra or bringing own food, but she's usually very impressive at accommodating everyone)
7. Mental health conditions question (optional; verbatim per Liza's text incl. "leave blank and contact Tucker" note).
8. "I have actually read the retreat code of conduct and agree to abide by it. I won't contact Tucker asking if I can have an exception to these rules (something that occurs often enough that it got added to the registration form!)." \* — checkbox "Yes".
9. Waiver: "By typing my name below, I am electronically signing the waiver found at http://meditatewithtucker.com/retreat-waiver" \* — text input.
10. Payment commitment \* — shows bank details (Name: Christopher William Wray, IBAN: BE36 9671 7217 6881, Swift/BIC: TRWIBEB1XXX — use when sending money from outside SEPA, Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium) and radio:
    - "Of course, Tucker! It must be annoying when people sign up and don't pay. You'd need to reconcile the two registration lists and then contact people who only paid or only registered. What kind of person would do a thing like that?"
    - "No, Tucker. I'm not going to send payment. THAT KIND OF PERSON IS ME!"

**B. Calendar** — restricted:
- Selectable window: Jan 20 – Feb 10, 2027 only.
- Arrival must be Jan 20–29; departure must be Feb 5–10 (stay always includes the retreat).
- Default pre-selection: Jan 29 → Feb 5 (7 nights).
- No Monday rule, no codewords.

**C. Room selection** — fetched via `?action=availability&from=…&to=…&event=tucker`:
- **female dorm** = `dorm_oh` (old house dorm, 6 beds), €100/week pro rata.
- **male dorm** = `dorm_bh` (TC house dorm, 4 beds), €100/week pro rata.
- **shared room (2 people)** = virtual id `shared_tc`, €200/week pro rata; photo = a small TC room (`normal_m` photo, `photo_2026-01-03-14.59.13-1-768x1024.webp`); always shown; labeled "we'll assign your room"; NOT written to the calendar sheet.
- Private rooms: normal weekly rate ÷ 7 × nights, only if actually free for the chosen dates.
- Camping / tipi / van spots are NOT offered (January retreat).
- €35/day fee added to every option, shown in breakdown.

**D. Review & submit** — dates, room, price breakdown (accommodation + €35/day × nights = total), then POST to Apps Script with `eventType: 'tucker'`.

## Backend — `Code.gs`

(Repo copy edited; Liza re-pastes into Apps Script editor and redeploys.)

1. **Block main residency bookings**: add to `EVENT_BLOCKS`:
   `{ name: 'Tucker Peck Retreat 2027', startDate: '2027-01-29', endDate: '2027-02-05', exceptEvent: 'tucker' }`
   `handleAvailability` skips a block when `e.parameter.event` matches the block's `exceptEvent`, so the retreat page can still see rooms while normal residency applications can't book those dates. (End date exclusive as with the existing block — Feb 5 itself stays free for residency arrivals, matching retreat checkout morning.)
2. **Retreat pricing** when `event=tucker`:
   - fee = 35 × nights (instead of 20).
   - room price = weekly ÷ 7 × nights (rounded); dorms overridden to €100/week; append virtual `shared_tc` room at €200/week (always available).
   - Camping building filtered out.
3. **Retreat submission** (`data.application.eventType === 'tucker'`):
   - Appends to a new **`tucker applications`** tab (auto-created with headers: timestamp, name, email, phone, emergency contact, heard-from, dietary, mental health, code of conduct, waiver signature, payment commitment, arrival, departure, nights, room name/id, room price, daily fee, total, status).
   - Writes the booking into `valley rooms` in gray via existing `recordBookingInCalendar`, except `shared_tc` (skipped — assigned manually).
   - `onEdit` trigger extended to also handle the `tucker applications` tab's status column (yes → black, no → remove), same as the main flow.
4. **Emails**: notification with all answers, accommodation, and price breakdown sent to `theonlyfool@foolsvalley.com`, `tucker.peck@gmail.com`, and the applicant's email (applicant gets a confirmation-flavored version of the same content).

## Other changes

- `events.html`: add upcoming event card — "meditation retreat with Tucker Peck", Jan 29 – Feb 5, 2027, tag "retreat", linking to `tucker-retreat.html`.

## Error handling

- Same patterns as `apply.html`: fetch timeout + fallback message; submission failure keeps the form intact and re-enables the button.
- Calendar/email failures in Apps Script are logged but don't fail the submission (existing behavior).

## Testing

- Local: open pages in browser; verify calendar restrictions (can't arrive after Jan 29, can't leave before Feb 5, window bounded Jan 20/Feb 10), pricing math for default week (dorm: 100 + 245 = €345) and pro-rata cases (e.g. 9 nights dorm: round(100/7×9)=129 + 315 = €444).
- After redeploy: one test submission end-to-end — sheet row appears in `tucker applications`, gray name in `valley rooms`, all three emails arrive; verify main `apply.html` shows no rooms for dates overlapping Jan 29 – Feb 5 2027.

## Deployment

1. Commit + push site pages (GitHub Pages picks them up).
2. Copy updated `Code.gs` into the Apps Script editor (per `APPS_SCRIPT_DEPLOYMENT.md`), save, deploy new version of the existing web-app deployment (URL unchanged).
