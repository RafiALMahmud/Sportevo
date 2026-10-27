# Admin deletion controls

Admins and superadmins can use **Platform Dashboard → Complexes & Commission → Manage fields** to delete one field, or **Delete complex** to remove the whole complex and its fields. The account remains when only its complex is deleted.

**Users & Owners → Delete owner & complex** removes an owner's account and their active complex in a single confirmed action. **Manage complex** opens that owner's complex first if only fields or the complex should be removed. Self-deletion still uses account settings; superadmin accounts remain protected, and only superadmins can remove admins.

Deletion archives records using `deleted_at`. Booking history, original booking quotes, wallet charges/refunds, photo records/files and activity history remain. Deleted fields disappear from public field lists, slot selection, sport search and cover photos. Removing the last field hides its complex from public browsing and the sitemap until an active field is added again.

Deleted account emails can be registered again as fresh, unverified accounts with different user IDs. Old bookings and facilities remain linked to the archived user ID. Active email duplicates remain blocked. The 2026-10-14 identifier repair handles accounts deleted before this behavior was added; it does not remove historical records or change encryption keys.

Pending or accepted bookings block deletion. Use **Resolve bookings** to view requests for the exact complex/field, reject pending requests, mark finished accepted bookings completed, or request cancellation through the existing owner/admin cancellation workflow. Deletion never silently cancels accepted bookings or reverses commission.

API: `DELETE /api/admin/turfs/{turf}/fields/{field}`; `DELETE /api/admin/turfs/{turf}`; `DELETE /api/admin/users/{user}` with JSON `{ "delete_complexes": true }` when removing an active complex owner. Both admin roles are enforced server-side; the field must belong to the specified complex. Omitting the owner cascade flag keeps the existing ownership guard.

Migration: `backend/database/migrations/2026_10_13_000002_add_soft_deletes_to_fields.php` adds a nullable archive date. It was applied locally without removing existing rows.

Validation: 93 backend tests / 700 assertions passed. Chromium and WebKit dashboard checks covered admin on a 390px screen and superadmin at 1440px: dismissed confirmations send no deletion, owner requests include the cascade flag, field deletion updates the list, active bookings return a clear error, the filtered booking workflow resolves blockers, and archived controls are disabled. These browser checks used mock records; no hosted users or facilities were deleted.

Deploy using `scripts/update-hostinger-admin-deletions.ps1`. It uploads an explicit backend file list and the frontend build, preserves `.env`, backs up the previous code/build, and applies the additive migration in maintenance mode. It checks database row counts and environment integrity before publishing the new manifest. Failure attempts to restore the previous code/build; the additive database column is retained. Logs: `backend/storage/logs/hostinger-admin-deletions-update.log`. `-Resume` retries activation of the prepared archive.

Published on 2026-10-13. The server reported `FIELD_ARCHIVE_AND_ADMIN_ROUTES_READY`, `EXISTING_DATABASE_ROWS_AND_ENV_PRESERVED` and `ADMIN_DELETIONS_UPDATE_COMPLETE`. Authenticated live WebKit checks verified field-management panels and new field metadata without mobile overflow. A desktop check verified that both active owner accounts on the users page had matching owner-and-complex deletion controls. These production checks only read listings and logged in/out; no real account, complex or field deletion was executed.
