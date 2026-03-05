# Jekyll Setup Guide for Fools' Valley

## What's Been Set Up

Jekyll has been configured to make editing your website easier by using reusable templates.

### Structure

```
foolsvalley-package/
├── _config.yml           # Site-wide settings (nav links, email, etc.)
├── _layouts/
│   └── default.html      # Main page template
├── _includes/
│   ├── head.html         # <head> section (fonts, CSS)
│   ├── nav.html          # Navigation bar
│   └── footer.html       # Footer
├── Gemfile               # Ruby dependencies
└── [your existing HTML files]
```

## How to Use Jekyll

### Option 1: Edit and Push Directly (Easiest)

**No local setup needed!** GitHub Pages builds your site automatically.

1. Edit your files
2. Git commit and push to GitHub
3. GitHub Pages builds and deploys automatically
4. Check your site at foolsvalley.com in 1-2 minutes

### Option 2: Test Locally (Requires Ruby 3.0+)

If you want to preview changes before pushing:

```bash
# Check your Ruby version
ruby --version
# You need Ruby 3.0 or higher

# If you need to upgrade Ruby on macOS:
brew install ruby
# Then restart your terminal

# Install Jekyll
bundle install

# Run local server
bundle exec jekyll serve

# Visit: http://localhost:4000
```

**Note:** Your system currently has Ruby 2.6, which is too old for modern Jekyll. But you don't need local Jekyll since GitHub Pages builds it for you!

### 3. Convert Pages to Use Templates

To use the Jekyll templates, add "front matter" to the top of any .html file:

**Before:**
```html
<!DOCTYPE html>
<html>
<head>
  ...all the navigation, styles, etc...
</head>
```

**After:**
```html
---
layout: default
title: events
custom_css: |
  /* Page-specific styles here */
  .event-card { ... }
---

<!-- Just your page content, no navigation or footer needed -->
<section class="hero">
  ...
</section>
```

### 4. What You Can Edit in One Place

#### Navigation Links
Edit `_config.yml`:
```yaml
nav_links:
  - name: residencies
    url: /residencies.html
  - name: events
    url: /events.html
```

#### Site Information
Edit `_config.yml`:
```yaml
title: "fools' valley"
email: slowreply@foolsvalley.com
location: "30 min north of lisbon"
```

#### Footer
Edit `_includes/footer.html`

#### Navigation Bar
Edit `_includes/nav.html`

#### Global Styles
Edit `_includes/head.html`

## Converting a Page: Example

Let's convert `events.html` as an example:

1. **Extract page-specific CSS**: Copy everything inside `<style>` tags that's unique to this page

2. **Add front matter** at the very top:
```yaml
---
layout: default
title: events
custom_css: |
  [paste page-specific CSS here]
---
```

3. **Remove these sections** (they're now in the template):
   - `<!DOCTYPE html>` and `<html>` tags
   - Entire `<head>` section
   - `<nav>` section
   - `<footer>` section
   - `</body></html>` closing tags

4. **Keep only**: The main content (everything between nav and footer)

## GitHub Pages Deployment

Good news: GitHub Pages runs Jekyll automatically!

When you push to GitHub:
1. GitHub Pages detects the `_config.yml`
2. Builds your site with Jekyll
3. Publishes to foolsvalley.com

No build step needed on your end.

## Tips

- **Start small**: Convert one page first to test
- **Direct to production is fine**: Since GitHub Pages builds automatically, you can edit and push directly
- **Keep backups**: Your original HTML files still work if you don't add front matter
- **Gradual migration**: You can have some pages use Jekyll and others stay as plain HTML
- **Local testing is optional**: Only needed if you want to preview before pushing

## Common Edits Made Easy

### Change navigation links
Edit `_config.yml` (lines 21-32)

### Update email or contact info
Edit `_config.yml` (line 14)

### Modify footer text
Edit `_includes/footer.html`

### Update fonts or colors
Edit `_includes/head.html`

## Need Help?

Jekyll documentation: https://jekyllrb.com/docs/
Liquid template syntax: https://shopify.github.io/liquid/
