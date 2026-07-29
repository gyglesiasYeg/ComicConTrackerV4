# Comic Con Tracker V16.2 Emergency Stable Rollback

This package is meant to get the app loading again.

What changed:
- Removed the Update Pricing button and pricing frontend function temporarily.
- Kept Refresh This Convention.
- Kept Update Appearance Days.
- Kept photo lookup and existing guest display.
- Header now shows TRACKER V16.2.

Why:
The pricing flow was causing the app to hang or break. This rollback removes the unstable pricing path so the tracker can load again while preserving the working appearance-date and refresh features.

Replace these files:
- pages/index.js
- pages/api/refresh.js
- pages/api/days.js
- pages/api/photo.js
- pages/api/img.js
- package.json

Commit message:
V16.2 emergency rollback stable app without pricing
