# Event Management – Registration Flow

The project now includes a Node.js API that hashes passwords with `bcryptjs`, stores accounts in MySQL, and provides an authenticated admin dashboard for managing users.

## Prerequisites

- Node.js 18 or newer
- npm 9+
- A running MySQL 8 instance (or start the bundled `docker-compose` MySQL service)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and adjust credentials (or set a `DATABASE_URL` environment variable). Ensure `JWT_SECRET` is a long, random string.
3. Ensure MySQL is running and reachable with the configured credentials. The API will automatically provision the `users`, `admin_actions`, `events`, `event_tickets`, and `event_audit_logs` tables on startup.
4. (Optional) Seed a few showcase events for local testing:
   ```bash
   npm run seed:events
   ```

## Running locally

In one terminal start the registration/admin API (defaults to port `4000`):
```bash
npm run dev:server
```

In another terminal run the Vite dev server (defaults to port `5173`):
```bash
npm run dev
```

The Vite dev server proxies `/api/*` requests to the API, so the sign-up page and admin dashboard work without additional configuration.

## Creating an initial admin

After starting the API and MySQL, you can promote an admin in one of two ways:

1. Run the helper script (recommended):
   ```bash
   npm run seed:admin -- --email admin@example.com --password "StrongPass123!"
   ```
   The script hashes the password, creates the user if it does not exist, and ensures the `is_admin` flag is set. You can also provide `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables instead of CLI flags.

2. Promote an existing user manually with SQL:

```sql
UPDATE users SET is_admin = 1 WHERE email = 'admin@example.com';
-- or create a dedicated admin
INSERT INTO users (email, password_hash, is_admin)
VALUES ('admin@example.com', '$2a$12$hashedpasswordhere', 1);
```

> Tip: use `bcryptjs` or any bcrypt CLI to generate the password hash if you insert directly.

Once at least one admin exists, sign in through `/admin/login` to reach the admin dashboard.

## API

### Public routes

- `POST /api/register` – create a user; responds with `201` and user metadata.
- `POST /api/login` – authenticate a user (sets an HTTP-only session cookie).
- `POST /api/logout` – destroy the current session.
- `GET /api/me` – return the currently authenticated user (requires a valid session).
- `GET /api/health` – check database connectivity.
- `GET /api/events` – list published events; supports `q`, `city`, `country`, `startAfter`, and `startBefore` filters.
- `GET /api/events/:slug` – fetch a published event including remaining capacity.

### Authenticated attendee routes

- `GET /api/me/tickets` – list reservations for the signed-in user.
- `POST /api/events/:id/tickets` – reserve seats or join the waitlist for an event (body: `{ quantity }`).
- `DELETE /api/events/:id/tickets` – cancel the current user’s reservation.

### Admin routes (session must belong to a user with `is_admin = 1`)

- `GET /api/admin/users` – list users in reverse creation order.
- `PATCH /api/admin/users/:id` – update `is_admin` for the target user.
- `DELETE /api/admin/users/:id` – delete the target user.
- `GET /api/admin/events` – list all events with capacity and waitlist totals.
- `POST /api/admin/events` – create a new event (draft, published, or cancelled).
- `PATCH /api/admin/events/:id` – update details, capacity, pricing, or status.
- `DELETE /api/admin/events/:id` – delete an event (removes associated tickets).
- `GET /api/admin/events/:id/attendees` – view reservations and waitlisted users for auditing.

Admin mutations are logged in the `admin_actions` table; event lifecycle changes are recorded in `event_audit_logs`.

## Sign-in pages

- `/login` – standard user sign in; successful admins will be redirected to the dashboard automatically.
- `/admin/login` – restricted admin sign in that blocks non-admin accounts.
- `/my-tickets` – authenticated attendee hub listing reservations with cancellation controls.

## Browsing & booking

- `/events` – public catalogue with keyword, city, and country filters.
- `/events/:slug` – detailed event page with seat availability, waitlist messaging, and ticket actions.

## Admin dashboard

Navigate to `/admin` after signing in. The dashboard allows you to:

- View registered users and their roles.
- Promote or demote users to/from admin.
- Delete user accounts (with confirmation prompts).
- Refresh the list and log out.
- Jump to the event manager for publishing and auditing (`/admin/events`).

## Event manager

The admin event workspace (`/admin/events`) provides:

- Creation and editing of global events with venue metadata and pricing.
- Status toggles (draft, published, cancelled) with automatic timestamping.
- Live capacity visibility including waitlisted counts.
- Access to attendee rosters with confirmation codes for door teams.

## Tooling

- `npm run dev:server` – run the API with file watching.
- `npm run dev` – run the Vite development server.
- `npm run lint` – run ESLint.
- `npm run build` – build the production bundle.
- `npm run seed:events` – seed a global showcase calendar (Singapore, San Francisco, Tokyo, Berlin, Cape Town, Sydney, and more).

## Docker notes

`docker-compose.yml` provisions MySQL; you can extend it to run the API in a container if desired. When serving the built React app behind another web server (Nginx, etc.), ensure `/api` requests are reverse-proxied to the Node.js API so the sign-up page and admin dashboard continue to function.
