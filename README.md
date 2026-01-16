# Fools' Valley Website

## Structure

```
foolsvalley-package/
├── index.html          # Homepage with void imagery
├── residencies.html    # Residencies page (anti-design style)
├── events.html         # Events listing
├── saturdays.html      # Open Saturdays page
├── venue.html          # Venue hire page
├── research.html       # Research lab page
├── assets/
│   ├── void.png           # The spiral/portal (nav icon, backgrounds)
│   ├── card-back.jpeg     # Celestial tarot back (decorative borders)
│   └── border-vertical.jpeg # Vertical celestial border
└── reference/
    ├── residencies-ornate.html  # Maximalist tarot version
    ├── logos-system.html        # Logo system (card + void)
    └── logos-handdrawn.html     # SVG logo variations
```

## Design System

### Colors
- Background: `#f5f5f0` (warm cream)
- Black: `#0a0a0a` (soft black)
- Gray: `#6b6b6b`
- Moss: `#4a5d3a` (accent)
- Rust: `#8b4a2b` (accent)

### Fonts
- **Space Mono** — monospace, raw/code feeling
- **EB Garamond** — elegant serif, mystical warmth
- **Instrument Serif** — for decorative/watermark text

### Aesthetic
Neo-brutalist anti-design with mystical undertones. Raw monospace mixed with elegant serif. Broken grids, scattered elements, hand-drawn imperfection. Underground festival meets tarot manuscript.

## Usage

### Images
- `void.png` — Use as nav icon (cropped circle), hero background (low opacity), favicon
- `card-back.jpeg` — Horizontal decorative dividers
- `border-vertical.jpeg` — Sidebar decoration, vertical dividers

### Logo System
Two-sided concept:
- **Front**: The Fool reaching for a star (see logos-system.html)
- **Back**: The Void spiral (void.png)

## Deployment
Static HTML — can deploy directly to Vercel, Netlify, or any static host.

No build step required.
