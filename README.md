# SportEvo

[Live platform](https://sportevo.games) · [Backend setup](#setup-backend) · [Frontend setup](#setup-frontend)

SportEvo is a national Bangladesh turf and sports-complex booking platform with customer, owner, and admin roles. It supports English and Bangla, BDT pricing, and a commission-wallet model.

**Stack:** Laravel 12 + Sanctum, React 19 + Vite + Tailwind, and MySQL.

## What I built

I built the booking, owner-management, and admin workflows, including encrypted personal data, queued email, and 116 PHPUnit tests.

## Run locally

Follow the backend and frontend setup instructions below. The live site is available at [sportevo.games](https://sportevo.games).
## Project Structure

```
sportevo/
├── backend/          # Laravel API
│   ├── app/Http/Controllers/Api/   # Auth, Turf, Booking, Admin, Dashboard
│   ├── app/Http/Middleware/        # RoleMiddleware (RBAC)
│   ├── app/Models/                 # Role, User, Turf, Booking
│   ├── app/Http/Requests/          # Form request validation
│   ├── database/migrations/        # Schema
│   ├── database/seeders/           # Roles + demo accounts
│   └── routes/api.php              # API routes with role guards
│
└── frontend/         # React SPA
    └── src/
        ├── api/client.js           # Axios instance w/ auth token
        ├── context/AuthContext.jsx # Auth state provider
        ├── components/             # Layout, UI primitives, badges, cards
        └── pages/                  # Login, Register, dashboards, turfs, bookings
```

## Roles & Permissions (RBAC)

| Role | Capabilities |
|------|--------------|
| Superadmin | Everything an admin can do, plus creating/deleting/promoting other superadmins |
| Admin | Approves complexes, decides **any** booking request platform-wide, adds/deletes users & owners, sets per-complex commission, records wallet settlements |
| Turf (Complex owner) | Registers a complex, sets/edits its price, uploads photos, generates slots, accepts/rejects requests for their own complex, sees their commission wallet |
| User | Browses complexes, requests a slot, cancels, leaves a review |

Role enforcement happens in `app/Http/Middleware/RoleMiddleware.php` and via route groups in `routes/api.php`. A plain `admin` can never create, promote, or delete a `superadmin`.

## Pricing, Commission & Wallet

- Every complex sets its own `price_per_slot`; owners can edit it any time (the new price only applies to future requests).
- `commission_rate` defaults to **10%** on registration. Admins/superadmins can change it per complex, **including setting it to 0** (0% = the owner owes the platform nothing).
- When a request is **accepted**, the commission is snapshotted onto the booking (`commission_rate`, `commission_amount`) and a `wallet_entries` row of type `commission_charge` is created. Rejecting or cancelling never charges anything.
- `Turf::walletBalance()` = `SUM(commission_charge) - SUM(settlement)`. Admins record payouts via `POST /admin/turfs/{turf}/wallet/settlements`.
- Because the rate is snapshotted at accept time, changing a rate never retroactively alters past bookings.

## Privacy / Integrity

Customer identity is protected until money moves:

- While a booking is `pending`, the `user` relation is stripped from every owner-facing payload (`GET /dashboard/turf`, `GET /turfs/{turf}/schedule`). Owners see only the time and price.
- Once the owner (or an admin) **accepts**, the booking becomes `booked`, commission is charged, and the owner's next fetch returns the customer's name, email and phone.
- Platform admins/superadmins can always see all requests — that is their job.

## Email notifications

`App\Services\BookingNotificationService` sends a status email on every transition and never lets a mail failure break the request (it is wrapped in try/catch and logged):

| Event | Recipient(s) |
|-------|--------------|
| Request submitted | Customer (ack) + complex owner (new request, contact hidden) |
| Accepted | Customer (price confirmed) + owner if an admin decided |
| Rejected | Customer |
| Cancelled | Customer + complex owner |
| Completed | Customer (invites a review) |

Mail is sent **synchronously**. For production, dispatch these to the queue (`ShouldQueue`) so a slow SMTP server cannot delay booking responses, and set `QUEUE_CONNECTION=database` with a worker.

## Setup (Backend)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
# optional: switch DB_CONNECTION to mysql + set DB_* in .env
php artisan migrate --seed
php artisan storage:link   # required so uploaded turf photos resolve
php artisan serve   # http://127.0.0.1:8000
```

> `php artisan storage:link` is easy to forget — without it every uploaded turf photo 404s.

## Setup (Frontend)

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173 (proxies /api -> :8000)
```

## Demo Accounts (seeded, password = `password`)

| Role | Email |
|------|-------|
| Superadmin | superadmin@sportsevo.com |
| Admin | admin@sportsevo.com |
| Complex owner | manager@sportsevo.com, sarah@sportsevo.com |
| User | user@sportsevo.com, jane@sportsevo.com, emma@sportsevo.com |

The seeder creates 5 complexes with varied prices and commission rates (including a **0%** one), a week of bookable slots, and bookings in pending / booked / completed / cancelled states so every dashboard has data.

## Main API Endpoints

**Auth**
- `POST /api/register` — role: `user` | `turf`
- `POST /api/login`, `POST /api/logout` (auth), `GET /api/me` (auth)
- `POST /api/verify-email`, `/resend-code`, `/forgot-password`, `/reset-password`

> `GET /api/me` returns `role` as a **string** (`"admin"`), while `/api/admin/users` returns `role` as an object (`{ name }`). The frontend relies on this distinction.

**Turfs**
- `GET /api/turfs` — browse approved turfs (+`search`, `location`, `sport`)
- `GET /api/turfs/{turf}` — details incl. photos, reviews, avg rating
- `GET /api/turfs/{turf}/slots?date=` — available slots
- `POST /api/turfs` — register a complex (pending approval, commission starts at 10%)
- `GET|PUT /api/my-turf` — owner's complex + price/sports editing
- `POST /api/turfs/{turf}/slots` — generate bookable slots
- `POST /api/turfs/{turf}/photos`, `DELETE /api/turfs/{turf}/photos/{photo}`
- `GET /api/turfs/{turf}/schedule` — owner schedule (pending customers anonymised)

**Bookings**
- `POST /api/bookings` — request a slot (conflict-checked, price snapshotted)
- `GET /api/bookings` — requests / upcoming / past
- `POST /api/bookings/{booking}/cancel`
- `POST /api/bookings/{booking}/accept` — charges commission, reveals the customer
- `POST /api/bookings/{booking}/reject` — releases the slot, no charge
- `POST /api/bookings/{booking}/complete`
- `POST /api/turfs/{turf}/reviews` — one review per user per complex

**Platform (admin / superadmin)**
- `GET /api/dashboard/platform`
- `GET /api/admin/stats`
- `GET /api/admin/slots` — **all** bookings platform-wide (+`status`, `date`, `turf_id`, `search`)
- `POST /api/admin/slots/{booking}/accept` · `/reject` · `/cancel`
- `GET /api/admin/turfs` (+`status`, `search`) — includes `wallet_balance` per complex
- `POST /api/admin/turfs/{turf}/approve` · `/reject`, `DELETE /api/admin/turfs/{turf}`
- `PUT /api/admin/turfs/{turf}/commission` — `{ commission_rate: 0..100 }`
- `GET /api/admin/turfs/{turf}/wallet`, `POST /api/admin/turfs/{turf}/wallet/settlements`
- `GET /api/admin/users` (+`role`, `search`), `POST /api/admin/users`
- `POST /api/admin/users/{user}/role`, `DELETE /api/admin/users/{user}`

All protected endpoints use `Authorization: Bearer <token>` via Laravel Sanctum.
