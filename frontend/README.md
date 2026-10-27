# Sportsevo frontend

React 19 + Vite + Tailwind. Run `npm install`, then `npm run dev`; the API must be running on port 8000. Vite proxies both `/api` and `/storage`. Keep `VITE_DEMO_MODE=false` to use the real platform.

For a production-built local preview, run `powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1` from the workspace root, then open http://localhost:8001. The script builds into Laravel's ignored `public/build` folder and starts a local PHP server plus email worker. It does not replace existing port-8000/5173 development servers.

Routes load their dashboard code on demand. Search inputs stay responsive: the homepage submits explicitly, while platform filters debounce and cancel stale requests. The public sport catalogue is cached for five minutes; bookings, prices and customer data are not cached in that catalogue. Reduced-motion preferences are respected.

Browser performance checks: `node scripts/performance-smoke.cjs` (Windows Edge by default; set `BROWSER_PATH` for another Chromium executable). It checks the actual locally hosted homepage at desktop/mobile sizes, scroll frame timings, request counts while typing and lazy login loading. A separately labelled populated-page fixture and expired-CSRF test intercept API requests and never write to your real data. See [the performance report](../PERFORMANCE.md) for measured results and limitations.

Owner dashboard:
- Register one complex with its initial field.
- Add/edit independently priced fields, select their sports, upload their photos and generate non-overlapping slots.
- Select a field and date for its schedule; accept/reject requests and mark ended bookings complete.
- Use **Mark unavailable** on an open future slot for phone/offline bookings or maintenance. Supply a reason, then use **Reopen slot** when it becomes bookable again. Existing online requests/bookings cannot be overwritten by these controls.
- View the platform commission percentage, debt, settlements and reversal credits.
- Decide cancellation requests, moderate reviews and request complex deletion.

Platform dashboard:
- Manage registrations, accounts, booking decisions, commission rates and settlements.
- Use **Cancellations & History** for the cancellation/refund chain, complex deletion requests, review moderation, searchable activity exports and email-delivery status/retry.
- Admins cannot enter the owner dashboard.

Customers select a field on the complex page before requesting a slot. Accepted booking cancellations require owner approval; only admins can subsequently reverse the owner's platform commission. Reviews require an accepted/completed booking that has ended.

Authentication uses HttpOnly session cookies and CSRF protection. Multipart uploads let the browser set their content type/boundary.

Checks: `npm run build`, `npm run lint`. See the root README for database migration, SMTP/queue-worker setup, timezone behavior and operational policies.
