# Tucker Peck Retreat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bookable event pages for the Tucker Peck meditation retreat (Jan 29 – Feb 5 2027) with restricted booking window, retreat pricing, sheet recording, and 3-way email notifications.

**Architecture:** Two new static pages (`tucker-retreat.html` event page → `tucker-apply.html` application/booking page) talking to the existing Google Apps Script backend (`Code.gs`), which is extended with an `event=tucker` availability mode, a `tucker applications` sheet tab, and retreat emails. Main residency bookings get an `EVENT_BLOCKS` entry for the retreat dates.

**Tech Stack:** Static HTML/CSS/JS (Jekyll-served GitHub Pages), Google Apps Script + Google Sheets. No test framework exists — verification is via browser + expected-value checks; Apps Script changes verified after redeploy.

**Spec:** `docs/superpowers/specs/2026-07-12-tucker-retreat-design.md`

## File structure

- Create: `tucker-retreat.html` — public event page (info, photos, prices, apply button)
- Create: `tucker-apply.html` — application questions + restricted calendar + room selection + review/submit
- Modify: `Code.gs` — event block, tucker availability pricing, tucker submission handler, emails, onEdit
- Modify: `events.html` — upcoming event card

Key constants used throughout (must match everywhere):
- Event flag: `eventType: 'tucker'` in POST payload; `&event=tucker` on availability GET
- Virtual room id: `shared_tc` (€200/week, never written to calendar)
- Dorm ids: `dorm_oh` (female dorm), `dorm_bh` (male dorm), both €100/week during retreat
- Daily fee: €35 × nights
- Window: arrival 2027-01-20…2027-01-29, departure 2027-02-05…2027-02-10, default Jan 29 → Feb 7
- Emails: `theonlyfool@foolsvalley.com`, `tucker.peck@gmail.com`, + applicant
- Sheet tab: `tucker applications` (21 columns, Status = column U/21)

---

### Task 1: Event page `tucker-retreat.html`

**Files:**
- Create: `tucker-retreat.html`
- Reference: `events.html` (styling source), `assets/tucker first.png`, `assets/tucker second.png`, `assets/tucker third.png`

- [ ] **Step 1: Create the page**

Full file content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>meditation retreat with tucker peck — fools' valley</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Space+Mono:wght@400;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #f5f5f0;
            --black: #0a0a0a;
            --gray: #6b6b6b;
            --gray-light: #b0b0b0;
            --moss: #4a5d3a;
            --rust: #8b4a2b;
            --cream: #fffef8;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
            font-family: 'Space Mono', monospace;
            background: var(--bg);
            color: var(--black);
            font-size: 14px;
            line-height: 1.5;
        }

        a { color: var(--black); text-decoration: underline; }
        a:hover { text-decoration: none; background: var(--black); color: var(--bg); }

        nav {
            position: fixed;
            top: 0; left: 0; right: 0;
            padding: 1rem 2rem;
            border-bottom: 1px solid var(--black);
            background: var(--bg);
            display: flex;
            gap: 2rem;
            flex-wrap: wrap;
            font-size: 12px;
            z-index: 100;
        }

        nav a { text-transform: lowercase; }
        .nav-logo { display: flex; align-items: center; gap: 0.75rem; text-decoration: none; } .nav-logo svg { width: 32px; height: 32px; } .nav-logo span { font-family: 'EB Garamond', serif; font-style: italic; font-size: 14px; color: var(--black); } .nav-logo:hover { background: none; } .nav-logo:hover span { text-decoration: underline; }

        .nav-toggle { display: none; background: var(--bg); border: none; cursor: pointer; padding: 0.75rem; margin-left: auto; z-index: 101; }
        .nav-toggle span { display: block; width: 22px; height: 1.5px; background: var(--black); margin: 5px 0; transition: 0.3s; }
        .nav-links { display: contents; }

        @media (max-width: 600px) {
            nav { flex-wrap: nowrap; justify-content: space-between; align-items: center; }
            .nav-toggle { display: block !important; }
            .nav-links { display: none; position: absolute; top: 100%; right: 0; background: var(--bg); flex-direction: column; padding: 1.25rem 1.5rem; border: 1px solid var(--black); border-top: none; gap: 1rem; text-align: right; min-width: 160px; font-size: 14px; }
            .nav-links.open { display: flex; }
            .nav-toggle.open span:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
            .nav-toggle.open span:nth-child(2) { opacity: 0; }
            .nav-toggle.open span:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }
        }

        .hero { padding: 8rem 2rem 3rem; position: relative; }

        .hero-bg-text {
            position: absolute;
            font-family: 'Instrument Serif', serif;
            font-size: 18vw;
            color: transparent;
            -webkit-text-stroke: 1px var(--gray-light);
            top: 50%;
            right: -10%;
            transform: translateY(-50%);
            pointer-events: none;
            opacity: 0.2;
        }

        .hero-content { position: relative; z-index: 1; max-width: 640px; }

        .hero-dates {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            color: var(--moss);
            margin-bottom: 1rem;
        }

        .hero-title {
            font-family: 'EB Garamond', serif;
            font-size: clamp(2.4rem, 7vw, 4rem);
            font-weight: 400;
            line-height: 1.05;
            margin-bottom: 1.5rem;
        }

        .hero-intro { font-size: 13px; color: var(--gray); max-width: 460px; line-height: 1.8; }

        section { padding: 3rem 2rem; border-top: 1px solid var(--black); }

        .section-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.3em;
            color: var(--gray);
            margin-bottom: 2rem;
        }

        .prose { max-width: 620px; }
        .prose p { margin-bottom: 1.25rem; font-size: 13.5px; line-height: 1.8; }
        .prose em { font-family: 'EB Garamond', serif; font-style: italic; font-size: 1.1em; }

        .photo-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            max-width: 900px;
            margin-top: 2rem;
        }
        .photo-grid img {
            width: 100%;
            aspect-ratio: 4 / 3;
            object-fit: cover;
            border: 1px solid var(--black);
            filter: saturate(0.9);
        }
        @media (max-width: 700px) { .photo-grid { grid-template-columns: 1fr; } }

        .price-list { max-width: 620px; }
        .price-row {
            display: grid;
            grid-template-columns: 110px 1fr;
            gap: 1.5rem;
            padding: 1rem 0;
            border-bottom: 1px solid var(--gray-light);
            align-items: baseline;
        }
        .price-amount { font-family: 'EB Garamond', serif; font-size: 1.5rem; }
        .price-desc { font-size: 13px; color: var(--gray); line-height: 1.7; }
        .price-note { font-size: 12px; color: var(--gray); margin-top: 1.25rem; font-style: italic; }

        .apply-btn {
            display: inline-block;
            margin-top: 2.5rem;
            padding: 1rem 2.5rem;
            background: var(--black);
            color: var(--bg);
            text-decoration: none;
            font-size: 13px;
            text-transform: lowercase;
            letter-spacing: 0.05em;
            border: 1px solid var(--black);
        }
        .apply-btn:hover { background: var(--bg); color: var(--black); }

        footer {
            padding: 1rem 2rem;
            font-size: 11px;
            color: var(--gray);
            display: flex;
            justify-content: space-between;
            border-top: 1px solid var(--black);
        }
        @media (max-width: 768px) { footer { flex-direction: column; gap: 0.5rem; } }
    </style>
</head>
<body>
    <nav>
        <a href="index.html" class="nav-logo"><svg viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M 5 45 Q 4 22, 20 10 Q 40 -2, 62 5 Q 82 14, 88 38 Q 92 62, 78 78 Q 60 92, 35 88 Q 10 82, 5 58 Q 2 48, 5 45" stroke="currentColor" stroke-width="2" fill="none"/><path d="M 40 25 Q 42 19, 48 18 Q 55 18, 57 24 Q 58 32, 52 35 Q 44 37, 41 31 Q 39 28, 40 25" stroke="currentColor" stroke-width="2" fill="none"/><path d="M 48 37 Q 47 45, 48 52 Q 47 58, 48 63" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 47 63 Q 40 70, 32 78" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 49 62 Q 58 68, 65 72" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 47 48 Q 38 44, 28 42" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 49 47 Q 58 42, 68 38" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg><span>fools' valley</span></a>
        <button class="nav-toggle" aria-label="Toggle menu"><span></span><span></span><span></span></button>
        <div class="nav-links">
            <a href="residencies.html">residencies</a>
            <a href="events.html">events</a>
            <a href="saturdays.html">open saturdays</a>
            <a href="research.html">research</a>
            <a href="rooms.html">rooms</a>
            <a href="venue.html">venue</a>
        </div>
    </nav>

    <section class="hero">
        <div class="hero-bg-text">SIT</div>
        <div class="hero-content">
            <div class="hero-dates">jan 29 – feb 5, 2027 · optional extension weekend feb 6–7</div>
            <h1 class="hero-title">meditation retreat<br>with Dr. Tucker Peck</h1>
            <p class="hero-intro">
                we'd like to welcome you to a second retreat with Dr. Tucker Peck at fools' valley.
            </p>
        </div>
    </section>

    <section>
        <div class="section-label">001 / the teacher</div>
        <div class="prose">
            <p>Dr. Tucker Peck is a meditation teacher, clinical psychologist, and bestselling author of <em>Sanity and Sainthood</em>. his specialties include working with advanced meditators and using meditation to help those suffering from psychological disorders. he hosts the podcast <em>Teaching Meditation</em>.</p>
            <p>Tucker began formal training in meditation in 2005 and has studied with, among other teachers, Sharon Salzberg and Upasaka Culadasa.</p>
        </div>
        <div class="photo-grid">
            <img src="assets/tucker%20first.png" alt="Tucker Peck retreat">
            <img src="assets/tucker%20second.png" alt="Tucker Peck retreat">
            <img src="assets/tucker%20third.png" alt="Tucker Peck retreat">
        </div>
    </section>

    <section>
        <div class="section-label">002 / dates</div>
        <div class="prose">
            <p>the retreat runs <strong>friday, january 29 to friday, february 5, 2027</strong>.</p>
            <p>if you'd like to keep meditating, it's possible to stay two extra days over the weekend of <strong>february 6–7</strong> — the space stays reserved for us — though Tucker himself leaves on the 5th.</p>
            <p>you can also arrive up to a week early (from january 20) or stay a few days longer (until february 10); prices increase pro rata.</p>
        </div>
    </section>

    <section>
        <div class="section-label">003 / prices</div>
        <div class="price-list">
            <div class="price-row">
                <div class="price-amount">€35<span style="font-size:0.9rem;">/day</span></div>
                <div class="price-desc">food, facilities &amp; Tucker's travel expenses — everyone pays this</div>
            </div>
            <div class="price-row">
                <div class="price-amount">€100<span style="font-size:0.9rem;">/week</span></div>
                <div class="price-desc">a dorm bed — female dorm or male dorm</div>
            </div>
            <div class="price-row">
                <div class="price-amount">€200<span style="font-size:0.9rem;">/week</span></div>
                <div class="price-desc">a bed in a room shared by 2 people</div>
            </div>
            <div class="price-row">
                <div class="price-amount" style="font-size:1.1rem;">private</div>
                <div class="price-desc">private rooms at our normal weekly rates, depending on availability</div>
            </div>
        </div>
        <p class="price-note">arriving earlier or staying later: accommodation and daily fee are charged pro rata.</p>

        <a class="apply-btn" href="tucker-apply.html">apply &amp; choose accommodation →</a>
    </section>

    <footer>
        <span>fools' valley</span>
        <span>30 min north of lisbon</span>
        <span>things happen here</span>
    </footer>

    <script>
    (function() {
        const toggle = document.querySelector('.nav-toggle');
        const navLinks = document.querySelector('.nav-links');
        toggle.addEventListener('click', function() {
            this.classList.toggle('open');
            navLinks.classList.toggle('open');
        });
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                toggle.classList.remove('open');
                navLinks.classList.remove('open');
            });
        });
    })();
    </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Run: `open "tucker-retreat.html"` (from repo root)
Expected: page renders with nav, hero (dates line + title), bio section, all three tucker photos visible (they live in `assets/` with spaces in filenames — `%20` encoding must work), price rows (€35/day, €100/week, €200/week, private), apply button pointing at `tucker-apply.html`. Check mobile width (~400px) — photo grid stacks, hamburger menu works.

- [ ] **Step 3: Commit**

```bash
git add tucker-retreat.html
git commit -m "Add Tucker Peck retreat event page"
```

---

### Task 2: Events page card

**Files:**
- Modify: `events.html` (upcoming section, after the "new year CI festival" card which ends near line 317)

- [ ] **Step 1: Add the card**

In `events.html`, inside `<div class="events-list">` of section "001 / upcoming", insert after the closing `</a>` of the "new year CI festival &amp; intensive" card (chronological order — this is the latest event):

```html
            <a href="tucker-retreat.html" class="event-card">
                <div class="event-date">
                    <div class="event-date-range">Jan 29 –<br>Feb 5</div>
                    <div class="event-date-year">2027</div>
                </div>
                <div class="event-content">
                    <h3>meditation retreat with Tucker Peck</h3>
                    <p>a second retreat with Dr. Tucker Peck — meditation teacher, clinical psychologist, and bestselling author of Sanity and Sainthood. optional extension weekend feb 6–7.</p>
                    <span class="event-tag">retreat</span>
                </div>
            </a>
```

- [ ] **Step 2: Verify in browser**

Run: `open "events.html"`
Expected: new card appears last in upcoming list, links to `tucker-retreat.html`.

- [ ] **Step 3: Commit**

```bash
git add events.html
git commit -m "Add Tucker Peck retreat to events page"
```

---

### Task 3: Application + booking page `tucker-apply.html`

**Files:**
- Create: `tucker-apply.html`
- Reference: `apply.html` (CSS + structure source)

- [ ] **Step 1: Create the file — head & CSS**

Start the file with this head, where the `<style>` contents are **copied verbatim from `apply.html`** (everything between `<style>` at line 7 and `</style>` at line 521 — the `@import`, `:root`, all rules through the mobile media query):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>tucker peck retreat — apply — fools' valley</title>
<style>
/* === copied verbatim from apply.html lines 8–520 === */
</style>
</head>
```

- [ ] **Step 2: Add the body markup**

Append the full body (before the script):

```html
<body>

<nav>
  <a href="https://foolsvalley.com" class="logo">fools' valley</a>
  <div class="links">
    <a href="tucker-retreat.html">retreat info</a>
    <a href="https://foolsvalley.com/events.html">events</a>
    <a href="https://foolsvalley.com/rooms.html">rooms</a>
  </div>
</nav>

<main>
  <div style="margin-bottom: 2rem;">
    <a href="tucker-retreat.html" style="font-family:'Inter',sans-serif; font-size:0.85rem; color:var(--text-light); text-decoration:none; display:inline-flex; align-items:center; gap:0.3rem;">
      ← back to retreat info
    </a>
  </div>

  <h1>apply &amp; choose accommodation</h1>
  <p class="subtitle">meditation retreat with Dr. Tucker Peck · 29 jan – 5 feb 2027</p>

  <!-- QUESTIONS SECTION -->
  <div class="section" id="questions-section">
    <div class="step-label">001 / about you</div>
    <h2>application</h2>

    <div class="field" id="field-email">
      <label>Email *</label>
      <input type="email" id="q-email">
      <div class="error-msg">please enter a valid email</div>
    </div>

    <div class="field" id="field-name">
      <label>What's your name? *</label>
      <input type="text" id="q-name">
      <div class="error-msg">required</div>
    </div>

    <div class="field" id="field-phone">
      <label>What's your phone number? *</label>
      <input type="text" id="q-phone">
      <div class="error-msg">required</div>
    </div>

    <div class="field" id="field-emergency">
      <label>Who's an emergency contact, both name and number? *</label>
      <input type="text" id="q-emergency">
      <div class="error-msg">required</div>
    </div>

    <div class="field" id="field-heard">
      <label>How did you learn about the retreat? *</label>
      <div class="hint">if you haven't been on retreat with us before, tell us the name of the person you learned about the retreat from. don't just write "friend" or "colleague" — tell us that person's name.</div>
      <div class="radio-group">
        <label class="radio-option">
          <input type="radio" name="heard" value="person">
          <span class="radio-label">I learned about it from:
            <input type="text" id="q-heard-person" placeholder="their name" style="margin-left:0.4rem; padding:0.3rem 0.6rem; font-family:'EB Garamond',serif; font-size:0.95rem; border:1px solid var(--border); border-radius:4px; background:var(--card-bg);">
          </span>
        </label>
        <label class="radio-option">
          <input type="radio" name="heard" value="been-before">
          <span class="radio-label">I've been on retreat with Tucker before.</span>
        </label>
        <label class="radio-option">
          <input type="radio" name="heard" value="other">
          <span class="radio-label">Other:
            <input type="text" id="q-heard-other" style="margin-left:0.4rem; padding:0.3rem 0.6rem; font-family:'EB Garamond',serif; font-size:0.95rem; border:1px solid var(--border); border-radius:4px; background:var(--card-bg);">
          </span>
        </label>
      </div>
      <div class="error-msg">please answer this question</div>
    </div>

    <div class="field">
      <label>Any food allergies or dietary restrictions?</label>
      <div class="hint">if the chef is unable to accommodate a particular dietary need, you might need to pay her extra or possibly bring your own food — but she's usually very impressive at accommodating everyone.</div>
      <textarea id="q-dietary" rows="2"></textarea>
    </div>

    <div class="field">
      <label>Do you currently have, or have you in the past been diagnosed with or treated for, any mental health conditions?</label>
      <div class="hint">if you're certain we already know this info about you (eg you've been on a retreat with us in the past and this information hasn't changed), it's OK to leave this blank. if you'd rather talk about this privately, please leave it blank and contact Tucker. we do not usually exclude people based on this information, but it's helpful for us to know, as it can change the way meditation might affect you.</div>
      <textarea id="q-mental" rows="3"></textarea>
    </div>

    <div class="field" id="field-conduct">
      <label>Code of conduct *</label>
      <label class="radio-option" style="margin-top:0.5rem;">
        <input type="checkbox" id="q-conduct">
        <span class="radio-label">Yes — I have actually read the retreat code of conduct and agree to abide by it. I won't contact Tucker asking if I can have an exception to these rules (something that occurs often enough that it got added to the registration form!).</span>
      </label>
      <div class="error-msg">required</div>
    </div>

    <div class="field" id="field-waiver">
      <label>Waiver *</label>
      <div class="hint">by typing my name below, I am electronically signing the waiver found at <a href="http://meditatewithtucker.com/retreat-waiver" target="_blank" rel="noopener" style="color:var(--text);">meditatewithtucker.com/retreat-waiver</a></div>
      <input type="text" id="q-waiver" placeholder="type your full name">
      <div class="error-msg">required</div>
    </div>

    <div class="field" id="field-payment">
      <label>Payment *</label>
      <div class="hint">I am going to send payment for the retreat within the next few minutes, or I've already sent it. (you'll see your total below once you've chosen accommodation)</div>
      <div style="background:var(--highlight); border-radius:8px; padding:1rem 1.2rem; font-size:0.85rem; margin-bottom:0.8rem; font-family:'Inter',sans-serif; line-height:1.8;">
        Name: Christopher William Wray<br>
        IBAN: BE36 9671 7217 6881<br>
        Swift/BIC: TRWIBEB1XXX <span style="color:var(--text-light);">(use when sending money from outside SEPA)</span><br>
        Bank: Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium
      </div>
      <div class="radio-group">
        <label class="radio-option">
          <input type="radio" name="payment" value="paying">
          <span class="radio-label">Of course, Tucker! It must be annoying when people sign up and don't pay. You'd need to reconcile the two registration lists and then contact people who only paid or only registered. What kind of person would do a thing like that?</span>
        </label>
        <label class="radio-option">
          <input type="radio" name="payment" value="not-paying">
          <span class="radio-label">No, Tucker. I'm not going to send payment. THAT KIND OF PERSON IS ME!</span>
        </label>
      </div>
      <div class="error-msg">please choose one</div>
    </div>
  </div>

  <!-- DATES SECTION -->
  <div class="section" id="dates-section" style="border-top:1px solid var(--border); padding-top:3rem; margin-top:3rem;">
    <div class="step-label">002 / when</div>
    <h2>your dates</h2>

    <p style="margin-bottom:0.3rem; color: var(--text-light);">
      the retreat runs <strong>fri 29 jan – fri 5 feb 2027</strong>. you can arrive up to a week early (from jan 20) and stay longer (until feb 10). your stay must include the full retreat.
    </p>
    <p style="margin-bottom:1.5rem; font-size:0.9rem; color: var(--text-light); font-style:italic;">
      feb 6–7 is the optional meditation weekend — the space stays reserved for us; Tucker leaves on the 5th.
    </p>

    <div class="date-selection-mode" id="date-mode">click a day jan 20–29 to change arrival · a day feb 5–10 to change departure</div>

    <div class="calendar-container">
      <div class="calendar-header">
        <button onclick="calendarPrev()">&larr;</button>
        <h3 id="calendar-title"></h3>
        <button onclick="calendarNext()">&rarr;</button>
      </div>
      <div class="calendar-grid" id="calendar-grid"></div>
    </div>

    <div class="date-info" id="date-summary">
      <strong>Arrival:</strong> <span id="arrival-display"></span><br>
      <strong>Departure:</strong> <span id="departure-display"></span><br>
      <strong>Duration:</strong> <span id="duration-display"></span>
    </div>
  </div>

  <!-- ROOMS SECTION -->
  <div class="section" id="rooms-section" style="border-top:1px solid var(--border); padding-top:3rem; margin-top:3rem;">
    <div class="step-label">003 / where</div>
    <h2>choose your accommodation</h2>
    <p style="margin-bottom:0.5rem; color: var(--text-light);">
      showing accommodation available for your dates. dorm beds are €100/week, a bed in a shared room €200/week, private rooms at our normal weekly rates — all pro rata for extra days.
    </p>
    <p style="margin-bottom:1.5rem; font-size:0.9rem; color: var(--text-light);">
      + &euro;35/day per person for food, facilities &amp; Tucker's travel expenses is added on top.
    </p>

    <div id="rooms-container">
      <div class="rooms-loading">
        <div class="spinner"></div><br>
        checking availability...
      </div>
    </div>
  </div>

  <!-- REVIEW SECTION -->
  <div class="section" id="review-section" style="display:none; border-top:1px solid var(--border); padding-top:3rem; margin-top:3rem;">
    <div class="step-label">004 / review</div>
    <h2>review &amp; submit</h2>

    <div class="review-section">
      <h3>stay details</h3>
      <div class="review-row"><span class="label">arrival</span><span class="value" id="rev-arrival"></span></div>
      <div class="review-row"><span class="label">departure</span><span class="value" id="rev-departure"></span></div>
      <div class="review-row"><span class="label">duration</span><span class="value" id="rev-duration"></span></div>
      <div class="review-row"><span class="label">accommodation</span><span class="value" id="rev-room"></span></div>
    </div>

    <div class="review-section" id="rev-pricing-section">
      <h3>pricing</h3>
      <div class="review-row"><span class="label">accommodation</span><span class="value" id="rev-room-price"></span></div>
      <div class="review-row" style="font-size: 0.85rem; color: var(--text-light);"><span class="label">daily fee (food, facilities &amp; travel)</span><span class="value" id="rev-daily-fee"></span></div>
      <div class="review-row" style="font-weight: 600; padding-top: 0.5rem; margin-top: 0.5rem; border-top: 1px solid var(--border);"><span class="label">total</span><span class="value" id="rev-total"></span></div>
    </div>

    <div class="btn-row">
      <div></div>
      <button class="btn btn-primary" id="btn-submit" onclick="submitApplication()">submit application</button>
    </div>
  </div>

  <!-- SUCCESS -->
  <div class="section" id="success-section" style="display:none;"></div>

</main>

<footer>
  fools' valley · 30 min north of lisbon · <a href="mailto:slowreply@foolsvalley.com">slowreply@foolsvalley.com</a>
</footer>
```

- [ ] **Step 3: Add the script**

Append before `</body></html>`:

```html
<script>
// ============================================================
// CONFIG
// ============================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyZQ6gWYvnMVnRdjPEsvlDNIkyFxSm3fe1c0r1HbHOKrOhsaapVLWrZKWxp-Np_YVSWAA/exec';
const ROOM_PHOTOS_BASE = 'https://foolsvalley.com/assets/rooms/';

const ROOM_PHOTO_MAP = {
  // Old House
  chafariz:  'IMG_3325-806x1024.webp',
  isabel:    'IMG_3374_1-1-768x1024.webp',
  library:   'IMG_1314-1024x768.webp',
  studio:    'IMG_3298-1-1-768x1024.webp',
  galeria:   'IMG_3211_1-893x1024.webp',
  dorm_oh:   'IMG_1326-1-1024x768.webp',
  // M / Octopus House
  mbig:      'IMG_1037-2-1024x768.webp',
  mcurve:    'IMG_0071-1024x768.webp',
  mdouble:   'IMG_1036_1-1024x768.webp',
  // The Villa / TC House
  apartment: 'apartment-3.jpg',
  ensuite:   'photo_2026-01-03-14.59.17-1024x768.webp',
  sunny:     'photo_2026-01-03-14.59.03-1024x768.webp',
  normal_s:  'small-south.jpg',
  normal_m:  'photo_2026-01-03-14.59.13-1-768x1024.webp',
  normal_n:  'small-north.png',
  pool:      'photo_2026-01-03-15.04.38-1024x768.webp',
  downstairs:'photo_2026-01-03-15.04.23-1024x768.webp',
  dorm_bh:   'photo_2026-01-03-15.04.51-1024x768.webp',
  // shared room: one of the small TC rooms
  shared_tc: 'photo_2026-01-03-14.59.13-1-768x1024.webp',
};

// Booking window (months are 0-indexed)
const WINDOW_START       = new Date(2027, 0, 20); // earliest arrival
const LATEST_ARRIVAL     = new Date(2027, 0, 29); // retreat start
const EARLIEST_DEPARTURE = new Date(2027, 1, 5);  // retreat end
const WINDOW_END         = new Date(2027, 1, 10); // latest departure

// ============================================================
// STATE
// ============================================================
let calendarMonth = 0;    // January
let calendarYear = 2027;
let arrivalDate = new Date(2027, 0, 29);  // default: retreat start
let departureDate = new Date(2027, 1, 7); // default: incl. extension weekend
let availableRooms = [];
let selectedRoom = null;
let fallbackMode = false;

// ============================================================
// CALENDAR
// ============================================================
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function renderCalendar() {
  document.getElementById('calendar-title').textContent = MONTHS[calendarMonth] + ' ' + calendarYear;
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  DAYS.forEach(d => {
    const div = document.createElement('div');
    div.className = 'day-label';
    div.textContent = d;
    grid.appendChild(div);
  });

  const firstDay = new Date(calendarYear, calendarMonth, 1);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  for (let i = 0; i < startDow; i++) {
    const div = document.createElement('div');
    div.className = 'day';
    grid.appendChild(div);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calendarYear, calendarMonth, d);
    const div = document.createElement('div');
    div.className = 'day';
    div.textContent = d;

    const isArrivalOption = date >= WINDOW_START && date <= LATEST_ARRIVAL;
    const isDepartureOption = date >= EARLIEST_DEPARTURE && date <= WINDOW_END;

    if (date.getTime() === arrivalDate.getTime()) div.classList.add('selected-arrival');
    else if (date.getTime() === departureDate.getTime()) div.classList.add('selected-departure');
    else if (date > arrivalDate && date < departureDate) div.classList.add('in-range');

    if (isArrivalOption) {
      div.classList.add('selectable');
      div.addEventListener('click', () => { arrivalDate = date; updateDates(); });
    } else if (isDepartureOption) {
      div.classList.add('selectable');
      div.addEventListener('click', () => { departureDate = date; updateDates(); });
    } else {
      div.classList.add('disabled');
    }

    grid.appendChild(div);
  }
}

function calendarPrev() {
  if (calendarYear === 2027 && calendarMonth === 0) return; // clamp to Jan 2027
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
}

function calendarNext() {
  if (calendarYear === 2027 && calendarMonth === 1) return; // clamp to Feb 2027
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
}

function updateDates() {
  const days = Math.round((departureDate - arrivalDate) / (1000*60*60*24));
  document.getElementById('arrival-display').textContent = formatDate(arrivalDate);
  document.getElementById('departure-display').textContent = formatDate(departureDate);
  document.getElementById('duration-display').textContent = days + ' nights';
  selectedRoom = null;
  document.getElementById('review-section').style.display = 'none';
  renderCalendar();
  fetchAvailability();
}

function formatDate(d) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function formatDateISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ============================================================
// FETCH AVAILABILITY
// ============================================================
async function fetchAvailability() {
  const container = document.getElementById('rooms-container');
  container.innerHTML = '<div class="rooms-loading"><div class="spinner"></div><br>checking availability...</div>';
  selectedRoom = null;
  fallbackMode = false;

  const from = formatDateISO(arrivalDate);
  const to = formatDateISO(departureDate);

  try {
    const url = APPS_SCRIPT_URL + '?action=availability&from=' + from + '&to=' + to + '&event=tucker';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await resp.json();

    if (data.error) {
      showFallback(container, "We couldn't check availability right now: " + data.error);
      return;
    }

    availableRooms = data.rooms || [];
    if (availableRooms.length === 0) {
      showFallback(container, 'No rooms appear available for your selected dates, but this might be a data issue.');
      return;
    }

    renderRooms();
  } catch (err) {
    console.error('Availability check error:', err);
    showFallback(container, "Couldn't reach the availability system. Please describe what accommodation you'd like below.");
  }
}

function showFallback(container, msg) {
  fallbackMode = true;
  container.innerHTML = '';
  const fb = document.createElement('div');
  fb.className = 'rooms-fallback';
  fb.innerHTML = '<h4>room selection unavailable</h4>' +
    '<p>' + msg + '</p>' +
    '<p>no worries — just tell us what kind of accommodation you\'re interested in (dorm bed, shared room, private room) and we\'ll get back to you with options and pricing.</p>' +
    '<div class="field"><label>what type of accommodation are you interested in?</label>' +
    '<textarea id="f-room-preference" style="width:100%;padding:0.8rem 1rem;font-family:EB Garamond,serif;font-size:1.05rem;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);min-height:80px;resize:vertical;"></textarea></div>' +
    '<button class="btn btn-primary" style="margin-top:1rem;" onclick="if(document.getElementById(\'f-room-preference\').value.trim().length > 0) showReviewSection();">continue to review</button>';
  container.appendChild(fb);
}

// ============================================================
// ROOMS
// ============================================================
function renderRooms() {
  const container = document.getElementById('rooms-container');
  container.innerHTML = '';

  const retreatIds = ['dorm_oh', 'dorm_bh', 'shared_tc'];
  const retreatRooms = availableRooms.filter(r => retreatIds.includes(r.id));
  const privateRooms = availableRooms.filter(r => !retreatIds.includes(r.id));

  if (retreatRooms.length > 0) {
    container.appendChild(buildGroup('dorms & shared room', retreatRooms));
  }

  const buildingLabels = {
    'Octopus House': 'private rooms — m / octopus house',
    'Old House': 'private rooms — the old house',
    'Blue House': 'private rooms — the villa'
  };
  ['Octopus House', 'Old House', 'Blue House'].forEach(b => {
    const rs = privateRooms.filter(r => r.building === b);
    if (rs.length > 0) container.appendChild(buildGroup(buildingLabels[b], rs));
  });
}

function buildGroup(title, rooms) {
  const group = document.createElement('div');
  group.className = 'building-group';
  const h3 = document.createElement('h3');
  h3.innerHTML = title;
  group.appendChild(h3);

  rooms.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    card.dataset.roomId = room.id;

    const inner = document.createElement('div');
    inner.className = 'room-card-inner';

    const photoFile = ROOM_PHOTO_MAP[room.id] || room.photo;
    if (photoFile) {
      const img = document.createElement('img');
      img.src = ROOM_PHOTOS_BASE + photoFile;
      img.alt = room.name;
      img.loading = 'lazy';
      inner.appendChild(img);
    } else {
      const noPhoto = document.createElement('div');
      noPhoto.className = 'no-photo';
      noPhoto.textContent = 'photo coming';
      inner.appendChild(noPhoto);
    }

    const info = document.createElement('div');
    info.className = 'room-card-info';
    var displayName = room.name.replace(/ \(\d+ beds? available\)/, '').replace(/ \(\d+ spots? available\)/, '');
    info.innerHTML = '<h4>' + displayName + '</h4>' +
      '<div class="room-desc">' + (room.desc || '') + '</div>' +
      '<div class="room-price">€' + room.roomPrice + ' <span style="font-weight:400;">(' + room.priceBreakdown + ')</span>' +
      '<span class="breakdown">+ €' + room.dailyFee + ' food, facilities & travel (' + room.numDays + ' days × €35)</span></div>';
    inner.appendChild(info);

    card.appendChild(inner);
    card.addEventListener('click', () => {
      document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedRoom = room;
      showReviewSection();
    });

    group.appendChild(card);
  });

  return group;
}

// ============================================================
// REVIEW
// ============================================================
function showReviewSection() {
  const reviewSection = document.getElementById('review-section');
  reviewSection.style.display = 'block';
  populateReview();
  setTimeout(() => {
    reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function populateReview() {
  document.getElementById('rev-arrival').textContent = formatDate(arrivalDate);
  document.getElementById('rev-departure').textContent = formatDate(departureDate);
  const days = Math.round((departureDate - arrivalDate) / (1000*60*60*24));
  document.getElementById('rev-duration').textContent = days + ' nights';

  const pricingSection = document.getElementById('rev-pricing-section');

  if (fallbackMode) {
    const pref = document.getElementById('f-room-preference');
    document.getElementById('rev-room').textContent = 'Preference: ' + (pref ? pref.value : 'not specified');
    pricingSection.style.display = 'none';
  } else if (selectedRoom) {
    var cleanName = selectedRoom.name.replace(/ \(\d+ beds? available\)/, '').replace(/ \(\d+ spots? available\)/, '');
    document.getElementById('rev-room').textContent = cleanName;
    pricingSection.style.display = 'block';
    document.getElementById('rev-room-price').innerHTML = '€' + selectedRoom.roomPrice + ' <span style="font-weight:400; font-size:0.9rem;">(' + selectedRoom.priceBreakdown + ')</span>';
    document.getElementById('rev-daily-fee').innerHTML = '€' + selectedRoom.dailyFee + ' <span style="font-weight:400; font-size:0.85rem; color: var(--text-light);">(' + days + ' days × €35)</span>';
    document.getElementById('rev-total').textContent = '€' + (selectedRoom.roomPrice + selectedRoom.dailyFee);
  }
}

// ============================================================
// VALIDATION + SUBMIT
// ============================================================
function getHeardFrom() {
  const checked = document.querySelector('input[name="heard"]:checked');
  if (!checked) return '';
  if (checked.value === 'been-before') return "I've been on retreat with Tucker before.";
  if (checked.value === 'person') {
    const name = document.getElementById('q-heard-person').value.trim();
    return name ? 'Learned about the retreat from: ' + name : '';
  }
  const other = document.getElementById('q-heard-other').value.trim();
  return other ? 'Other: ' + other : '';
}

function validateForm() {
  let firstError = null;

  function check(fieldId, ok) {
    const field = document.getElementById(fieldId);
    if (!ok) {
      field.classList.add('error');
      if (!firstError) firstError = field;
    } else {
      field.classList.remove('error');
    }
  }

  const email = document.getElementById('q-email').value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  check('field-email', emailRegex.test(email));
  check('field-name', document.getElementById('q-name').value.trim().length > 0);
  check('field-phone', document.getElementById('q-phone').value.trim().length > 0);
  check('field-emergency', document.getElementById('q-emergency').value.trim().length > 0);
  check('field-heard', getHeardFrom().length > 0);
  check('field-conduct', document.getElementById('q-conduct').checked);
  check('field-waiver', document.getElementById('q-waiver').value.trim().length > 0);
  check('field-payment', !!document.querySelector('input[name="payment"]:checked'));

  if (firstError) {
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  return true;
}

async function submitApplication() {
  if (!validateForm()) return;

  if (!fallbackMode && !selectedRoom) {
    alert('Please choose your accommodation first.');
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = 'submitting...';

  const days = Math.round((departureDate - arrivalDate) / (1000*60*60*24));
  const paymentChecked = document.querySelector('input[name="payment"]:checked');

  const payload = {
    action: 'submit',
    application: {
      eventType: 'tucker',
      name: document.getElementById('q-name').value.trim(),
      email: document.getElementById('q-email').value.trim(),
      phone: document.getElementById('q-phone').value.trim(),
      emergencyContact: document.getElementById('q-emergency').value.trim(),
      heardFrom: getHeardFrom(),
      dietary: document.getElementById('q-dietary').value.trim(),
      mentalHealth: document.getElementById('q-mental').value.trim(),
      codeOfConduct: 'yes',
      waiverSignature: document.getElementById('q-waiver').value.trim(),
      paymentCommitment: paymentChecked ? paymentChecked.closest('.radio-option').querySelector('.radio-label').textContent.trim() : '',
      arrivalDate: formatDate(arrivalDate),
      departureDate: formatDate(departureDate),
      arrivalDateISO: formatDateISO(arrivalDate),
      departureDateISO: formatDateISO(departureDate),
      numDays: days,
      roomName: fallbackMode ? 'none' : selectedRoom.name.replace(/ \(\d+ beds? available\)/, ''),
      roomId: fallbackMode ? 'none' : selectedRoom.id,
      building: fallbackMode ? '' : (selectedRoom.building || ''),
      roomPrice: fallbackMode ? 0 : selectedRoom.roomPrice,
      priceBreakdown: fallbackMode ? '' : selectedRoom.priceBreakdown,
      dailyFee: fallbackMode ? 0 : selectedRoom.dailyFee,
      totalPrice: fallbackMode ? 0 : (selectedRoom.roomPrice + selectedRoom.dailyFee),
      roomPreference: fallbackMode ? (document.getElementById('f-room-preference') ? document.getElementById('f-room-preference').value.trim() : '') : ''
    }
  };

  try {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();

    if (data.success) {
      document.getElementById('success-section').style.display = 'block';
      document.getElementById('success-section').innerHTML = `
        <div class="success-screen">
          <div class="checkmark">✓</div>
          <h2>application sent</h2>
          <p>thank you! you'll receive a confirmation email with your booking details. we'll be in touch to confirm your spot.</p>
          <br><br>
          <a href="tucker-retreat.html" class="btn btn-secondary" style="display:inline-block; text-decoration:none;">back to retreat info</a>
        </div>
      `;
      setTimeout(() => {
        document.getElementById('success-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      alert('Something went wrong: ' + (data.error || 'Unknown error'));
      btn.disabled = false;
      btn.textContent = 'submit application';
    }
  } catch (err) {
    alert('Could not submit. Please check your connection and try again.\n\n' + err.message);
    btn.disabled = false;
    btn.textContent = 'submit application';
  }
}

// ============================================================
// INIT
// ============================================================
renderCalendar();
updateDates();
</script>

</body>
</html>
```

Note: `updateDates()` on init populates the date summary AND triggers the first availability fetch for the default Jan 29 → Feb 7 selection.

- [ ] **Step 4: Verify in browser**

Run: `open "tucker-apply.html"`
Expected:
- All question fields render; heard-from radios with inline text inputs; payment box shows the Wray/Wise bank details.
- Calendar opens on January 2027; ← is a no-op on Jan 2027; → goes to Feb 2027 and is then a no-op.
- Jan 20–29 and Feb 5–10 are selectable; everything else gray/disabled. Jan 29 shows as selected arrival, Feb 7 as selected departure, range highlighted between. Summary shows "9 nights".
- Clicking Jan 25 changes arrival (departure stays Feb 7); clicking Feb 10 changes departure.
- Rooms section fetches (against the **currently deployed** backend, which doesn't yet know `event=tucker` — it will ignore the param and show normal prices; that's expected until Task 5–6 are deployed. What must work now: fetch fires, cards render, clicking a card opens review with room price + fee + total summing correctly from whatever the API returned).
- Submit with empty form highlights the required fields and scrolls to the first error; filling all required fields passes validation.

- [ ] **Step 5: Commit**

```bash
git add tucker-apply.html
git commit -m "Add Tucker retreat application and booking page"
```

---

### Task 4: `Code.gs` — event block + tucker availability pricing

**Files:**
- Modify: `Code.gs:13-21` (EVENT_BLOCKS), `Code.gs:108-339` (handleAvailability), `Code.gs:344-427` (checkRoomAvailability)

- [ ] **Step 1: Add the retreat block to `EVENT_BLOCKS`**

Replace the `EVENT_BLOCKS` array (lines 13–21) with:

```javascript
const EVENT_BLOCKS = [
  {
    name: 'Summer Event 2026',
    startDate: '2026-07-04',  // July 4, 2026
    endDate: '2026-08-02'     // August 2, 2026 (exclusive - Aug 2 is free)
  },
  {
    name: 'Tucker Peck Retreat 2027',
    startDate: '2027-01-29',  // Jan 29, 2027
    endDate: '2027-02-05',    // Feb 5, 2027 (exclusive - Feb 5 checkout morning stays free)
    exceptEvent: 'tucker'     // requests with ?event=tucker bypass this block
  }
  // Add more event blocks here as needed
];
```

- [ ] **Step 2: Thread the `event` parameter through availability**

In `handleAvailability` (line 108), right after reading `from`/`to`, add:

```javascript
    const eventParam = e.parameter.event || '';
```

In `checkRoomAvailability`, change the signature (line 344) to:

```javascript
function checkRoomAvailability(room, bookings, fromDate, toDate, eventParam) {
```

and change the event-block loop (line 374) to skip excepted blocks:

```javascript
  for (const eventBlock of EVENT_BLOCKS) {
    // Blocks can be bypassed for their own event's booking page
    if (eventBlock.exceptEvent && eventBlock.exceptEvent === eventParam) continue;
    const blockStart = new Date(eventBlock.startDate);
    const blockEnd = new Date(eventBlock.endDate);
    ...  // rest unchanged
```

- [ ] **Step 3: Tucker pricing + dorm renaming + camping filter + shared room**

In `handleAvailability`, immediately before the `// Check availability and calculate prices` loop (line 303), add dorm renaming:

```javascript
    // Tucker retreat: dorms are offered as gendered dorms
    if (eventParam === 'tucker') {
      for (const room of rooms) {
        if (room.id === 'dorm_oh') room.name = 'Female dorm';
        if (room.id === 'dorm_bh') room.name = 'Male dorm';
      }
    }
```

Replace the availability/pricing loop (lines 304–331) with:

```javascript
    const availableRooms = [];

    for (const room of rooms) {
      // Tucker retreat: no camping/tipi/van in January
      if (eventParam === 'tucker' && (room.building === 'Camping' || room.id === 'van' || room.id === 'tipi')) {
        continue;
      }

      const available = checkRoomAvailability(room, bookings, fromDate, toDate, eventParam);

      if (available.isAvailable) {
        let pricing, dailyFee;

        if (eventParam === 'tucker') {
          // Retreat pricing: weekly rate pro rata, dorms €100/week, fee €35/day
          const weeklyRate = (room.id === 'dorm_oh' || room.id === 'dorm_bh') ? 100 : room.weekly;
          pricing = {
            roomPrice: Math.round((weeklyRate / 7) * numDays),
            priceBreakdown: '€' + weeklyRate + '/week'
          };
          dailyFee = numDays * 35;
        } else {
          pricing = calculateRoomPrice(room.daily, room.weekly, room.twoWeek, room.monthly, numDays);
          dailyFee = numDays * 20;
        }

        const totalPrice = pricing.roomPrice + dailyFee;

        availableRooms.push({
          id: room.id,
          name: available.displayName,
          building: room.building,
          desc: room.desc,
          photo: room.photo,
          roomPrice: pricing.roomPrice,
          priceBreakdown: pricing.priceBreakdown,
          dailyFee: dailyFee,
          totalPrice: totalPrice,
          numDays: numDays,
          availableCount: available.availableCount
        });
      }
    }

    // Tucker retreat: virtual "shared room" option, assigned manually — always offered
    if (eventParam === 'tucker') {
      const sharedPrice = Math.round((200 / 7) * numDays);
      const sharedFee = numDays * 35;
      availableRooms.push({
        id: 'shared_tc',
        name: 'Shared room (2 people)',
        building: 'Blue House',
        desc: "a bed in a double room shared with one other retreatant — we'll assign the specific room",
        photo: '',
        roomPrice: sharedPrice,
        priceBreakdown: '€200/week',
        dailyFee: sharedFee,
        totalPrice: sharedPrice + sharedFee,
        numDays: numDays,
        availableCount: 2
      });
    }

    return jsonResponse({ rooms: availableRooms });
```

- [ ] **Step 4: Verify pricing math**

Run: `node -e "const n=9; console.log(Math.round(100/7*n), Math.round(200/7*n), n*35);"`
Expected: `129 257 315` (9-night dorm €129 + €315 fee = €444; shared €257 + €315 = €572). Also for n=7: `100 200 245`.

- [ ] **Step 5: Commit**

```bash
git add Code.gs
git commit -m "Code.gs: Tucker retreat event block and availability pricing"
```

---

### Task 5: `Code.gs` — tucker submission, emails, onEdit

**Files:**
- Modify: `Code.gs:478-482` (handleSubmission entry), `Code.gs:813-886` (onEdit)
- Add: new functions `handleTuckerSubmission`, `buildTuckerSummary`, `sendTuckerNotification` (place after `sendApplicationNotification`, ~line 808)

- [ ] **Step 1: Route tucker submissions**

Add near the top of the file (next to the other sheet-name constants, line 9):

```javascript
const TUCKER_APPLICATIONS_SHEET = 'tucker applications';
```

In `handleSubmission` (line 478), route by event type:

```javascript
function handleSubmission(data) {
  try {
    const app = data.application;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (app.eventType === 'tucker') {
      return handleTuckerSubmission(app, ss);
    }

    let appSheet = ss.getSheetByName(APPLICATIONS_SHEET);
    ...  // rest unchanged
```

- [ ] **Step 2: Add the tucker handler + emails**

Insert after `sendApplicationNotification` (after line 808):

```javascript
// ============================================================
// TUCKER PECK RETREAT SUBMISSION
// ============================================================
function handleTuckerSubmission(app, ss) {
  let sheet = ss.getSheetByName(TUCKER_APPLICATIONS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(TUCKER_APPLICATIONS_SHEET);
    sheet.appendRow([
      'Timestamp',            // A
      'Name',                 // B
      'Email',                // C
      'Phone',                // D
      'Emergency Contact',    // E
      'Heard From',           // F
      'Dietary',              // G
      'Mental Health',        // H
      'Code of Conduct',      // I
      'Waiver Signature',     // J
      'Payment Commitment',   // K
      'Arrival Date',         // L
      'Departure Date',       // M
      'Num Nights',           // N
      'Room Name',            // O
      'Room ID',              // P
      'Room Price',           // Q
      'Price Breakdown',      // R
      'Daily Fee',            // S
      'Total Price',          // T
      'Status'                // U (column 21)
    ]);
    const headerRange = sheet.getRange(1, 1, 1, 21);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f3f3f3');
  }

  sheet.appendRow([
    new Date(),
    app.name,
    app.email,
    app.phone || '',
    app.emergencyContact || '',
    app.heardFrom || '',
    app.dietary || '',
    app.mentalHealth || '',
    app.codeOfConduct || '',
    app.waiverSignature || '',
    app.paymentCommitment || '',
    app.arrivalDateISO,
    app.departureDateISO,
    app.numDays,
    app.roomName,
    app.roomId,
    app.roomPrice,
    app.priceBreakdown,
    app.dailyFee,
    app.totalPrice,
    'pending'
  ]);

  // Record in valley rooms calendar — except the virtual shared room (assigned manually)
  if (app.roomId && app.roomId !== 'shared_tc' && app.roomId !== 'none') {
    try {
      recordBookingInCalendar({
        name: app.name,
        roomId: app.roomId,
        arrivalDate: app.arrivalDateISO,
        departureDate: app.departureDateISO
      }, ss);
    } catch (calendarErr) {
      Logger.log('Tucker calendar recording failed: ' + calendarErr.message);
    }
  }

  try {
    sendTuckerNotification(app);
  } catch (emailErr) {
    Logger.log('Tucker email notification failed: ' + emailErr.message);
  }

  return jsonResponse({ success: true });
}

function buildTuckerSummary(app) {
  return `
============================================================
PARTICIPANT
============================================================

Name: ${app.name}
Email: ${app.email}
Phone: ${app.phone || 'Not provided'}
Emergency contact: ${app.emergencyContact || 'Not provided'}

============================================================
DATES & ACCOMMODATION
============================================================

Arrival: ${app.arrivalDate}
Departure: ${app.departureDate}
Duration: ${app.numDays} nights
(retreat runs Jan 29 - Feb 5, 2027; optional meditation weekend Feb 6-7)

Accommodation: ${app.roomName}${app.roomId === 'shared_tc' ? ' (room to be assigned manually)' : ''}
${app.roomPreference ? 'Accommodation preference (room selection was unavailable): ' + app.roomPreference : ''}

============================================================
PRICE BREAKDOWN
============================================================

Accommodation: €${app.roomPrice} (${app.priceBreakdown}, ${app.numDays} nights pro rata)
Daily fee (food, facilities & Tucker's travel): €${app.dailyFee} (${app.numDays} days × €35)
TOTAL: €${app.totalPrice}

============================================================
APPLICATION ANSWERS
============================================================

How did you learn about the retreat?
${app.heardFrom || 'Not specified'}

Food allergies or dietary restrictions:
${app.dietary || 'None given'}

Mental health conditions:
${app.mentalHealth || 'Left blank'}

Code of conduct agreed: ${app.codeOfConduct || 'no'}

Waiver signed (typed name): ${app.waiverSignature}
(waiver: http://meditatewithtucker.com/retreat-waiver)

Payment commitment:
${app.paymentCommitment || 'Not specified'}
`;
}

function sendTuckerNotification(app) {
  const summary = buildTuckerSummary(app);

  // To fools' valley + Tucker
  MailApp.sendEmail(
    'theonlyfool@foolsvalley.com,tucker.peck@gmail.com',
    'Tucker Retreat registration: ' + app.name,
    'New registration for the meditation retreat with Tucker Peck (Jan 29 - Feb 5, 2027):\n' + summary +
    '\nFull record in the "tucker applications" tab of the booking spreadsheet.'
  );

  // Confirmation to the participant
  MailApp.sendEmail(
    app.email,
    "Your registration — meditation retreat with Tucker Peck at fools' valley",
    'Dear ' + app.name + ',\n\n' +
    'Thank you for registering for the meditation retreat with Dr. Tucker Peck at fools\' valley (Jan 29 - Feb 5, 2027). ' +
    'Here is a copy of your registration:\n' + summary +
    '\nIf anything looks wrong, or you have any questions, just reply to this email.\n\n' +
    "fools' valley\n"
  );
}
```

- [ ] **Step 3: Extend `onEdit` for the tucker tab**

In `onEdit` (line 813), replace the sheet-name guard and column constants (lines 828–859) with:

```javascript
    const sheetName = sheet.getName();
    if (sheetName !== APPLICATIONS_SHEET && sheetName !== TUCKER_APPLICATIONS_SHEET) {
      Logger.log('Not an applications sheet, exiting');
      return;
    }

    const isTucker = sheetName === TUCKER_APPLICATIONS_SHEET;

    // Status column: X (24) for residency applications, U (21) for tucker applications
    const statusColumn = isTucker ? 21 : 24;
    if (range.getColumn() !== statusColumn) {
      Logger.log('Not status column (expected ' + statusColumn + '), exiting');
      return;
    }

    const row = range.getRow();
    if (row === 1) {
      Logger.log('Header row, exiting');
      return;
    }

    const newStatus = range.getValue().toString().toLowerCase().trim();
    Logger.log('Status value (trimmed): "' + newStatus + '"');

    // Get application data from this row
    const appData = sheet.getRange(row, 1, 1, statusColumn).getValues()[0];
    const applicantName = appData[1];                        // Column B: Name (both sheets)
    const arrivalDate = isTucker ? appData[11] : appData[12];   // tucker: L / residency: M
    const departureDate = isTucker ? appData[12] : appData[13]; // tucker: M / residency: N
    const roomId = isTucker ? appData[15] : appData[16];        // tucker: P / residency: Q

    // Shared room isn't in the calendar — nothing to update
    if (isTucker && roomId === 'shared_tc') {
      Logger.log('Shared room booking - no calendar entry to update');
      return;
    }
```

(The rest of `onEdit` — the null check, `yes`/`no` handling via `updateBookingColor` / `removeBookingFromCalendar` — stays unchanged; those functions already accept these values.)

- [ ] **Step 4: Syntax-check the file**

Run: `node --check Code.gs`
Expected: no output (exit 0). (Apps Script globals like `SpreadsheetApp` aren't executed by `--check`, only parsed.)

- [ ] **Step 5: Commit**

```bash
git add Code.gs
git commit -m "Code.gs: Tucker retreat submissions, emails, and status trigger"
```

---

### Task 6: Verification & deployment

**Files:** none (verification + manual deployment)

- [ ] **Step 1: Local sanity pass**

- `node --check Code.gs` → exit 0.
- Open `tucker-retreat.html`, `tucker-apply.html`, `events.html` in browser; click through: events card → retreat page → apply button → apply page.
- On `tucker-apply.html`: default dates Jan 29 → Feb 7 (9 nights); calendar clamped to Jan/Feb 2027; arrival clicks only work Jan 20–29, departure only Feb 5–10; validation blocks empty submit.

- [ ] **Step 2: Commit any fixes, push**

```bash
git push
```

GitHub Pages serves the new pages at foolsvalley.com within a few minutes.

- [ ] **Step 3: Deploy the Apps Script (manual — Liza or with her logged-in browser)**

Per `APPS_SCRIPT_DEPLOYMENT.md`: open the Google Sheet → Extensions → Apps Script → replace the script contents with the updated `Code.gs` → Save → Deploy → Manage deployments → edit the existing deployment → New version → Deploy. The URL must stay the same (`AKfycbyZQ6...` — already hardcoded in both apply pages).

- [ ] **Step 4: End-to-end test (after deployment)**

1. `tucker-apply.html`: default dates → rooms list shows Female dorm / Male dorm at €129 (€100/week), Shared room at €257 (€200/week), private rooms at weekly-pro-rata prices, each + €315 fee; no camping/tipi.
2. Submit a test registration (use your own email) with a dorm → check: row in `tucker applications` tab; gray name in `valley rooms` on Jan 29–Feb 6 rows in a master bunk / TC bunk column; three emails arrive (theonlyfool@, tucker.peck@gmail.com, participant) with answers + price breakdown.
3. Submit a test with **shared room** → row in tab, NO calendar entry, emails note "room to be assigned manually".
4. Set Status = `yes` on the test row → name turns black in calendar. Set `no` → name removed.
5. Main flow regression: on `apply.html` pick a Monday arrival covering Feb 1 2027 → no rooms offered (event block). Pick dates in e.g. March 2027 → rooms offered as usual. Also verify a normal residency submission still works.
6. Clean up test rows/calendar cells afterwards.

---

## Self-review notes

- Spec coverage: event page (T1), events card (T2), questions/calendar/rooms/review (T3), block + pricing + shared room + dorm renaming + camping filter (T4), sheet tab + calendar write + skip shared + 3-way emails + onEdit (T5), deployment + e2e (T6). ✓
- Type consistency: `eventType: 'tucker'` (payload) / `event=tucker` (query) / `shared_tc` / `arrivalDateISO` / `TUCKER_APPLICATIONS_SHEET` used consistently across T3–T5. `recordBookingInCalendar` is called with an object exposing `name`, `roomId`, `arrivalDate`, `departureDate` — the only fields it reads (Code.gs:576-652). ✓
- Known limitation (accepted): tucker availability treats requests atomically per date-range; two simultaneous applicants could race for the last dorm bed — same behavior as the existing residency flow.
