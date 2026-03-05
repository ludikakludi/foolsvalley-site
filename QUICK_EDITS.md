# Quick Reference: Common Edits

## Navigation

**File:** `_config.yml` (lines 25-37)

```yaml
nav_links:
  - name: residencies
    url: /residencies.html
  - name: new page      # Add new nav item
    url: /new-page.html
```

## Site Info

**File:** `_config.yml` (lines 3-6, 20-22)

```yaml
title: "fools' valley"
email: slowreply@foolsvalley.com
location: "30 min north of lisbon"
```

## Footer

**File:** `_includes/footer.html`

```html
<footer>
    <span class="footer-left">{{ site.title }}</span>
    <span>{{ site.location }}</span>
    <span>you found it</span>  <!-- Edit this -->
</footer>
```

## Colors & Fonts

**File:** `_includes/head.html` (lines 10-18)

```css
:root {
    --bg: #f5f5f0;       /* Background */
    --black: #0a0a0a;    /* Text */
    --gray: #6b6b6b;
    --moss: #4a5d3a;     /* Accent */
    --rust: #8b4a2b;     /* Accent */
    --cream: #fffef8;
}
```

## Converting a Page to Use Templates

1. Add to top of file:
```yaml
---
layout: default
title: your page
---
```

2. Delete these sections:
- Everything before first `<section>` (head, nav)
- `<footer>` at the end
- `</body></html>` at the end

3. Keep:
- All your content sections
- Page-specific JavaScript

4. If you have page-specific CSS, add it to front matter:
```yaml
---
layout: default
title: your page
custom_css: |
  .your-class { color: red; }
---
```

## Deploying Changes

```bash
git add .
git commit -m "your message"
git push
```

Wait 1-2 minutes, then check foolsvalley.com
