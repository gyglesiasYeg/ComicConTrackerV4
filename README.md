# Comic Con Tracker V4 - Real Refresh

This version replaces the fake refresh button with a real backend endpoint:

- Frontend: Next.js web app for iPhone/PWA use
- Backend: `/api/refresh` runs on Vercel Functions
- Optional scraper service: Firecrawl API key for dynamic convention pages
- Storage: browser localStorage for the easy version

## Required for reliable dynamic pages
Add this Vercel environment variable:

FIRECRAWL_API_KEY=your_firecrawl_key

Without the key, the backend tries direct fetch first, which may fail on dynamic/blocked pages.
