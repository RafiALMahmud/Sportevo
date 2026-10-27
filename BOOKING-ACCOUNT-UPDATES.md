# Booking and account updates

Customers cannot request overlapping slots while they have a pending request or accepted booking, across all fields and complexes. Partial overlaps and intervals spanning midnight are covered. Adjacent slots are allowed. Rejection or completed cancellation releases the time; asking to cancel an accepted booking does not release it before the owner accepts. The API returns HTTP 409 with an explanation and leaves the requested slot available. Customer row locks serialize simultaneous booking requests across complexes.

Deleted account emails can register fresh accounts without inheriting old verification, roles, bookings or facilities. Existing historical records stay linked to their original user ID. See `ENCRYPTION.md` for the archived lookup identifiers and repair migration.

The owner registration form defaults its contact email and phone to the authenticated profile. Owners can edit these defaults. Complex name, location, price and sports remain blank; the existing `Main field` default is retained.

Validation: 103 backend tests / 778 assertions passed. Chromium and WebKit form checks passed at 390px and 1440px, covering prefilled contact details, blank facility details, preserved edits, no overflow and no browser errors. No real emails were sent by these tests.

Deploy using `scripts/update-hostinger-booking-accounts.ps1`. It backs up the affected code/build, uploads an explicit backend file list and frontend assets, applies the deleted-email identifier repair in maintenance mode, verifies archived identifiers and unchanged `.env`, then activates the new build. Failure restores the previous code/build; repaired identifiers are retained. `-Resume` retries activation of the same archive. Log: `backend/storage/logs/hostinger-booking-accounts-update.log`.

Published on 2026-10-14 after correcting a namespace typo in the deployment verification command. The server reported `DELETED_EMAIL_IDENTIFIERS_READY`, `PRIVATE_CONFIGURATION_PRESERVED`, `BOOKING_ACCOUNTS_UPDATE_COMPLETE` and application live. The public landing page serves the new build. No test registrations or bookings were created on production.

A subsequent browser report exposed unreadable frontend assets: rollback extraction under `umask 077` left the public `build` directory at mode 700. The live repair restored the uploaded assets, set public build directories to 755 and static files to 644, cleared compiled views, and verified the entry URL returns JavaScript. Chromium and WebKit rendered the live landing, login and complex directory pages afterward. Deployment scripts now normalize the complete build directory permissions, including after rollback; booking/account and frontend updates verify the main JavaScript URL before reporting success. Repair log: `backend/storage/logs/hostinger-assets-repair.log` (`FRONTEND_ASSETS_REPAIRED`).
