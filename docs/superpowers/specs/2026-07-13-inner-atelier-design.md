# The Inner Atelier — Retreat Page Design

_2026-07-13. Approved by Liza._

## Overview

A standalone event page for **The Inner Atelier — Embodied Creativity, Presence & Play**, Oct 25 – Nov 1, 2026, facilitated by Diana and Dr Swan Dao. Static page only — booking rides the existing residency application flow (`residencies.html#apply` → `apply.html`); no backend or Apps Script changes.

Source text: `inner atelier/The Inner Atelier @ Fool's Valley.docx` (full text pasted in conversation, used verbatim with only typographic touch-ups). Photos: `inner atelier/fools valley x didi/fools valley/` and `.../didi/`.

## Visual concept — "daylight into night"

Fits the main site (Space Mono + EB Garamond + Instrument Serif, palette `--bg #f5f5f0` / `--black #0a0a0a` / moss `#4a5d3a` / rust `#8b4a2b`), but the page background steps darker section by section — starting standard daylight `#f5f5f0`, ending night `#0a0a0a` with cream text (the site already ends its events page in a black section, so the language is native). Transition implementation: **stepped per-section background colors with long CSS gradients between sections** (pure CSS, no JS).

Mystical elements:
- Faint constellation SVG (thin strokes, small star dots, hand-drawn feel matching the fool logo) behind the hero title.
- Moon-phase SVGs (new → waxing crescent → first quarter → waxing gibbous) as markers for the four "retreat experience" blocks; a full-moon SVG in the final apply section.
- Large EB Garamond italic pull-quote treatment for incantation-like lines.
- Photos scattered, not gridded: varying widths (40–75%), rotations between −3° and +3°, asymmetric offsets, at least two photos crossing section boundaries via negative margins.

## Assets

Copy + downscale (target ≤1600px long edge, jpeg quality ~80, via `sips`) into `assets/inner-atelier/`:

| source | new name | used in |
|---|---|---|
| `fools valley/L1001667-Edit.jpg` | `atelier-1.jpg` | §2 invitation (veiled figure & windmill) |
| `fools valley/L1001675.jpg` | `atelier-2.jpg` | §3 place (shadow self-portrait) |
| `fools valley/L1001921.jpg` | `atelier-3.jpg` | §5 experience (studio movement, wide) |
| `fools valley/L1002023.jpg` | `atelier-4.jpg` | §8 for whom (dusk hillside walkers) |
| `fools valley/L1001645.jpg` | `atelier-5.jpg` | §9 facilitators close (forest path) |
| `didi/WhatsApp Image 2026-04-08 at 09.59.02 (2).jpeg` | `diana.jpg` | §9 next to Diana's bio |

Photo order on the page is exactly the sequence Liza gave: 667edit, 675, 921, 2023, 645.

## Page structure — `inner-atelier.html`

Nav + footer identical to `events.html` / `tucker-retreat.html`. Sections top to bottom (bg progression noted):

1. **Hero** (daylight `#f5f5f0`) — kicker "oct 25 – nov 1, 2026 · retreat"; title "the inner atelier"; subtitle "embodied creativity, presence & play at fools' valley"; intro line "a retreat for those who long to slow down, reconnect with their creative aliveness, and remember the intelligence of the body." Constellation SVG behind.
2. **The invitation** — the two "Set in the wild beauty…" / "Through movement, yoga…" paragraphs; pull-quote: "This is not about becoming 'better.' It is about becoming more available…". `atelier-1.jpg` floats right, rotated ~2°, overlapping downward.
3. **The place** (first shade darker, e.g. `#eceade`) — its two paragraphs; `atelier-2.jpg` small (~40%), low-left, rotated ~−2°.
4. **Why this retreat** — its three paragraphs, narrow column.
5. **The retreat experience** (mid-dusk, e.g. `#d8d2c0` → gradient toward brown-gray) — Move / Create / Relate / Play blocks, each with a moon-phase SVG marker and its text; closing line "There will also be spacious time to rest, wander, integrate, and simply be." `atelier-3.jpg` spans ~75%, rotated ~1°.
6. **For you / leave with** (deep dusk, e.g. `#4a463d`, light text) — "This retreat may be for you if…" and "What you may leave with" as two side-by-side lists (stack on mobile).
7. **Daily rhythm** (near night, e.g. `#26241f`) — the schedule as a vertical timeline: Space Mono times, EB Garamond descriptions, thin left border with star-dot markers.
8. **For whom** — its two paragraphs; `atelier-4.jpg` offset right ~55%, rotated ~−1.5°.
9. **Facilitators** (night `#0a0a0a`, cream text) — "Diana" bio with `diana.jpg` beside it (photo left or right, ~40%, slight rotation); "Dr Swan Dao" bio below, text only. `atelier-5.jpg` closes the section small (~35%) and centered.
10. **Apply** (night) — full-moon SVG; one-line invitation; button **apply for the retreat** → `residencies.html#apply`. No prices anywhere on the page.

All copy comes from the provided text verbatim (site-style lowercase applied to headings only; body text keeps its original casing).

## Events page change

Replace the "art + movement immersion" upcoming card (currently Oct 25 – Nov 30) in `events.html` with:
- date range "Oct 25 –<br>Nov 1", year "2026"
- title "the inner atelier"
- description: "embodied creativity, presence & play — movement, art, relational practice and psychodrama with Diana and Dr Swan Dao. an intimate retreat to slow down and remember the intelligence of the body."
- tag "retreat", link `inner-atelier.html`

## Error handling / testing

- Static page: verify in browser at desktop + ~400px mobile width (photo offsets must not cause horizontal scroll — guard with `overflow-x: hidden` on body and max-widths).
- Verify the section-to-section background progression reads smoothly and text contrast stays legible at every step (especially §5–6 transition).
- Verify `residencies.html#apply` scrolls to the form.
- No backend changes → no Apps Script redeploy needed.

## Out of scope

- No changes to residencies.html calendar (its "art + movement immersion" calendar entry, if any, is separate — only the events.html card is replaced).
- No booking window enforcement — the residency flow handles dates/rooms as usual.
