# Comic Con Tracker V15.8 Appearance Date Fix

This package contains a safer replacement for:

pages/api/days.js

## What was wrong in V15.7

1. `pages/api/days.js` still had a Nicolas Cage-only safe override, so Nicolas Cage working did not prove the date system worked for everyone.
2. The updater depended heavily on finding a guest name and date text close together in scraped page text.
3. `pages/index.js` also contains a Nicolas Cage-only `officialDays` map. That should be removed or left only as a temporary fallback, because it makes one guest look fixed while everyone else still depends on the scraper.

## What this replacement changes

- Removes the Nicolas Cage hardcoded override from the API.
- Looks in structured JSON/CMS-like blocks as well as plain text blocks.
- Follows likely guest profile links when found.
- Supports short dates, full day names, and mapped event dates.
- Still updates only `guest.days`.
- Still returns `TBD` only when it cannot find clear day/date text.

## Required manual cleanup in pages/index.js

Find this block:

```js
const officialDays={
  nycc:{
    'nicolas cage':['Saturday','Sunday'],
    'nicholas cage':['Saturday','Sunday']
  }
};
```

Replace it with:

```js
const officialDays={};
```

Then change the header text from:

```jsx
<span>TRACKER V15.7</span>
```

to:

```jsx
<span>TRACKER V15.8</span>
```

Also change the home notice from `V15.7 Safe Source Days:` to `V15.8 Safer Source Days:`.

## Deploy

1. Replace `pages/api/days.js` with the file in this zip.
2. Make the small `pages/index.js` edits above.
3. Commit to GitHub.
4. Vercel should redeploy from the GitHub commit.
5. After deployment, open the deployed site in a fresh/private browser window.
6. Open NYCC > Details > Update Appearance Days.

## Important expectation

This does not invent appearance days. It will populate days when the official/source/profile page exposes clear day/date text. If the source does not expose days for a guest yet, the app should keep `TBD`.
