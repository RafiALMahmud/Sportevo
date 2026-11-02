# Free maps and Google sign-in

Implemented 2 November 2026 for the GitHub code release. This does not deploy the changes to Hostinger.

## Maps: no card or Google Maps key

The final implementation uses self-hosted Leaflet 1.9.4 and OpenStreetMap's standard raster tiles. Google Maps JavaScript was replaced at the owner's request after its live API returned `BillingNotEnabledMapError`. The Google Maps loader and key are no longer used or included in builds.

The `/explore` page supports name, area, sport and Other sport filters, browser location with consent, 5/10/25/50/100 km radii, nearest-first results, clicking a map point to search around it, and Search this area after panning/zooming. Clicking a complex pin opens its name, configured field pricing and View fields link. Pagination and search areas persist in the URL. Map/list toggles reuse the map. Missing location permission and tile/network failures retain list search. The homepage, directory and navbar link to map search. Complex pages offer a directions link.

Owners choose and drag a pin during registration or from My Profile. Coordinate entry is also available. Latitude/longitude must be valid and provided together; clearing both removes a pin, while omitting both preserves it. Existing complexes have null coordinates until their owners set a pin and remain in ordinary directory results. Public map pins include only approved, active complexes with active fields and coordinates; no customer, owner contact or payment data is included. Results are capped at 300 pins with a zoom-in notice. Slot, price, booking, advance-payment and deletion rules remain unchanged.

Laravel performs straight-line Haversine distance calculations with a bounding-box prefilter and supports MySQL and SQLite. User position is supplied for the current search; it is not saved on the account. URLs/browser history and infrastructure access logs can contain the search coordinates.

OSM attribution remains visible. Tiles use normal browser caching and referrers, without offline downloads or prefetch. The public tile service is best-effort, subject to its usage policy and capacity limits; free map data does not guarantee unlimited free tile hosting. At higher traffic, select a suitable tile provider. Optional `VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION` let you configure another provider; also update the server CSP for its tile host. Read [OSM's tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Google signup and sign-in

Google Identity Services renders its genuine popup button on Login/Register and a connection button in My Profile. New Google users supply their mandatory phone and select Customer or Complex owner. New owners go directly to the complex registration form and must fill complex/field/address/pricing/sports/payment details. Contact email and phone prefill from the account. An incomplete-owner flag prevents navigation races from sending them to scheduling prematurely. Returning owners with a complex continue to the main field schedule.

Laravel verifies the signed Google ID token using `firebase/php-jwt`, fixed-origin cached Google certificates, RS256, issuer, audience/authorized party, expiry/issued-at, verified email and a short-lived session-bound nonce. Nonces are hashed in the session, limited to five and consumed once. Pending signup claims are encrypted for ten minutes even when session-wide encryption is disabled. All writes use existing Sanctum CSRF/session authentication and auth rate limiting. The existing 45-minute inactivity expiry applies.

Existing accounts are never linked or signed in by matching email alone. Users first sign in with their password, then connect the matching verified Google identity from My Profile. Roles, passwords, account email, personal data and booking history are preserved. Google subject identifiers are encrypted and indexed by keyed hashes, hidden from responses/activity metadata, and released when an account is soft deleted so a fresh account cannot inherit old history. No OAuth access/refresh token or client secret is stored.

## Configuration and deployment

Maps need no credentials. For Google sign-in, use a standard **Web application** OAuth client with the AI-agent checkbox unchecked. Configure Google branding/audience and permitted website origins. The popup flow uses no redirect URI. Use configured test users while validating an OAuth app in Testing; prepare its public consent settings before public rollout.

Set matching public client IDs, without committing their local configuration:

```env
# frontend/.env.local, used when building browser assets
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# backend/.env on each environment
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Client IDs are public identifiers. A client secret is not required by this flow and must never go in a `VITE_` variable. Restrict origins to the actual development/production sites. The local configuration uses the replacement Client ID provided by the owner; production configuration has not been uploaded to Hostinger.

Install locked PHP/JS dependencies, apply `2026_11_02_000001_add_google_identity_and_complex_coordinates.php`, rebuild frontend assets, and refresh Laravel config/views as part of a coordinated backend/frontend deployment. The migration adds nullable pin/identity fields and does not reset data or alter encryption keys. Its rollback refuses to discard existing pins or Google connections. Local migration has been applied. Do not publish only the frontend to an older backend.

The coordinated Hostinger helper is `scripts/update-hostinger-maps-auth.ps1`. Run it with `-PrepareOnly` to build and validate the private archive, then `-UsePrepared` in an interactive PowerShell window to upload and activate that exact archive. Enter SSH passwords only in that window. If upload succeeds but activation fails, inspect `backend/storage/logs/hostinger-maps-auth-update.log` before using `-Resume`, which targets the saved upload rather than building a different release. A failed upload requires `-UsePrepared` again.

The helper installs locked production PHP dependencies in a private staging directory before maintenance, saves the previous code/vendor/build/environment, fingerprints existing account and financial records, applies only the new migration, and changes only the production Google client ID. It retains old hashed frontend assets and checks JavaScript MIME types to prevent the previous blank-page deployment failure. Failed activation attempts restore the prior code, vendor, manifest and environment; additive schema columns remain. No seeders, database resets, test accounts or test emails run against production. Public map/auth behavior must be verified after successful activation.

Security headers permit first-party geolocation, Google sign-in frames/resources and the OSM tile host. Scripts use per-response Vite CSP nonces and strict-dynamic; inline scripts and unsafe-eval remain disallowed. Cross-Origin-Opener-Policy permits the sign-in popup. API CSP remains restricted.

## Validation

Backend tests cover signed/invalid/expired/replayed identity tokens, account linking and role preservation, mandatory phones and both signup roles, real session cookies, deleted-account identifier reuse, encrypted/expired pending signup, certificate caching/outage handling, nearby ordering/pagination, map bounds and DTO privacy, pin ownership/validation/clear behavior and CSP/permissions headers. Browser fixtures cover phone/desktop Chromium/WebKit map interactions and filters, pagination, map reuse, light/dark themes, Bangla, both signup roles, owner onboarding/contact prefills/pin selection and existing-account conflicts.

Google's real sign-in iframe loads with the configured client. Automated tests use signed test tokens and provider fixtures; a real person's Google consent/login requires manual validation. No customer or booking records are modified by the automated tests. Composer and npm dependency audits were checked and affected existing dependencies patched.
