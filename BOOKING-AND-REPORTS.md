# Booking notifications, fields and reports

Owners can select **Other sport** while registering the first field, adding a field or editing one, then enter a game/sport name. Names are validated, reused through the sport catalogue and available in customer dropdowns. Customers can also select **Other sport** in either search form and type a sport name (partial names supported). Only approved complexes appear in public results.

Opening a complex now shows its fields as cards. Choose a field to open its dedicated photo gallery and booking slots page at `/turfs/{complexId}/fields/{fieldId}`. The “Choose a different field” link returns to the field selection page. Each field keeps its own price, photos and availability.

Complex owners can enable or disable **Email me when a booking request is sent** under Booking notifications on their dashboard. It defaults to enabled, including for existing complexes. New requests notify the owner account email and the complex contact email if they differ. Matching addresses receive one copy. Messages identify the complex, field, booking number and start time without exposing customer contact details before acceptance. Customer confirmation emails continue regardless of the owner's setting.

Emails use the platform SMTP sender and the existing tracked outbox. Keep the queue worker running locally or configure a worker/cron runner on hosting. Queued delivery is not a guarantee of inbox arrival. Platform admins can inspect failed emails through the existing email operations interface.

Customers and owners have a **Report an issue to admin** button on their dashboards. They can submit a subject and explanation, view their report history and read admin replies. Admins have a **View issue reports** dashboard button and can reply or set a report to Open, In progress or Resolved. Reports are stored in the admin inbox; report submissions do not send email notifications. Submission is limited to five reports per minute per authenticated user. Report text and replies are encrypted in the database.

Apply the database migration with `php artisan migrate --force` when deploying, rebuild the frontend with `npm run build:local` from `frontend`, and restart queue workers with `php artisan queue:restart` through the hosting process manager. The new migration has been applied to this local workspace.

The homepage now has a public **Contact us** form for complaints, information requests and other questions. It requires a name, email, subject and message, stores personal details encrypted, and creates one tracked email notification for every current admin/superadmin. Submissions appear in the dashboard's Contact inbox with a new-message banner and count that refresh every 30 seconds while the dashboard is visible. Admins can mark messages New, In progress or Resolved; the sender's email link opens their mail client for a reply.

The public form allows three requests per minute and fifteen per hour per IP, validates field lengths and email format, and includes a honeypot. Invalid submissions do not generate emails. Public submission responses return only confirmation and a reference number. These contact notifications are separate from the existing authenticated issue reports, whose behavior is unchanged.

Migration `2026_10_13_000001_create_contact_messages_table` was applied locally and on Hostinger on 2026-10-13. The contact form and inbox are live at https://sportevo.games. Validation: 84 backend tests / 602 assertions passed, frontend build and lint passed with existing warnings, and browser checks verified the form, admin inbox/status workflow and responsive layouts using mocked APIs (no test emails sent).
