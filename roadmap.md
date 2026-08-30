# Realtyz Project Roadmap

## Active Tasks

1. [DONE] Show 3 metric cards in the same row on mobile view (`Landing.tsx`)
2. [IN PROGRESS] Auto-link Gmail, Calendar, and YouTube on initial Google Sign-In
   - Update Google OAuth scopes on `/auth` to request Gmail + Calendar + YouTube
   - Update OAuth callback / token exchange to store tokens for all three services
   - Reflect all three services as connected in "חשבונות גוגל" card instantly
3. [PENDING] Reduce top padding space to only 15px for the "All-in-One" section in `Landing.tsx`
