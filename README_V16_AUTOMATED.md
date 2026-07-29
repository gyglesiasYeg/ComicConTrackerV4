# Comic Con Tracker V16.0 Automated Refresh Package

Replace these files in GitHub:

```text
pages/index.js
pages/api/refresh.js
pages/api/days.js
pages/api/prices.js
pages/api/photo.js
pages/api/img.js
package.json
```

## What V16.0 fixes

### 1. Frontend guest filtering no longer blocks new real guests
The older app had frontend rules that effectively allowed Edmonton only if a guest appeared in a hardcoded list, and forced Calgary to always show 0 guests. V16.0 changes the frontend filter so it keeps person/junk protection but does not block real new guests just because they were not manually listed.

### 2. Refresh no longer uses locked lists as the only source
The old backend used hardcoded `LOCKED` lists as the exclusive source for Edmonton/NYCC/Calgary. V16.0 keeps those as safe fallback seeds, but also runs the live parser and merges the result. This prevents known good guests from disappearing while allowing new guests to appear when the source page exposes them.

### 3. Appearance days remain automated
The safer V15.8/V16.0 appearance-day updater remains included. It updates only `guest.days` and keeps `TBD` if source/profile pages do not expose clear day/date text.

### 4. Pricing remains automated
The V15.9/V16.0 pricing updater remains included. It updates only `guest.auto` and `guest.photo` when source/Epic pages expose readable prices.

## What is intentionally still allowed as fallback

These are not harmful hardcoding because they only improve fallback display and do not block fresh data:

- Known photo fallbacks
- Known For fallback text
- Starter convention definitions
- Event date mappings used only to convert visible dates to weekdays

## Deployment steps

1. Replace the files above in your GitHub repo.
2. Commit with:

```text
V16.0 automate guests days and pricing safely
```

3. Let Vercel redeploy.
4. Open the app in a fresh/private browser.
5. Test in this order:
   - App loads and header says `TRACKER V16.0`
   - Edmonton opens
   - Refresh This Convention works
   - Update Appearance Days works
   - Update Pricing works
   - Guests tab opens
   - Calgary stays clean unless actual guest data is parsed
   - Existing photos still display

## Note

This package does not invent guest lists, appearance days, or prices. It automates from available source pages and preserves `TBD` when data is not exposed clearly.
