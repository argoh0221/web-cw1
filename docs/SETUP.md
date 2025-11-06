# Collaborator Setup Guide

Welcome aboard! Follow this checklist to get the EventSphere project running locally with the full sample dataset.

---

## 1. System Requirements

- **Node.js** 18+ (check with `node -v`)
- **npm** 9+ (comes with Node 18)
- **MySQL** 8.x (or a compatible cloud instance; ensure you can create databases and users)

If you use Docker, you can spin up MySQL with the included `docker-compose.yml`.

---

## 2. Install Dependencies

```bash
npm install
```

This installs both backend and frontend dependencies (express, mysql2, Vite, etc.).

---

## 3. Configure Environment Variables

1. Copy the example env file if provided:

   ```bash
   cp .env.example .env
   ```

   If `.env.example` is not available, create `.env` manually.

2. Update the following keys in `.env` so they match your local MySQL setup:

   ```ini
   DB_HOST=localhost
   DB_PORT=3306
  DB_USER=webcw1         # or your preferred user
   DB_PASSWORD=********  # database user password
   DB_NAME=webcw1        # database name to use/create

   JWT_SECRET=replace_with_a_secure_random_string

   # Optional overrides
   PORT=4000
   VITE_API_PROXY_TARGET=http://localhost:4000
   ```

3. Ensure the database exists (create it if necessary):

   ```bash
   mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS webcw1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```

---

## 4. Seed the Database

We provide scripts to create an admin account and populate events.

### 4.1 Seed an Admin User

```bash
npm run seed:admin -- --email admin@example.com --password "StrongPass123!"
```

> Update the email/password as needed. The script hashes the password and ensures the account has admin privileges.

### 4.2 Seed Events

1. Decide how many events you want. Open `scripts/seedEvents.js` and set:

   ```js
   const TARGET_TOTAL_EVENTS = 200; // or any number you prefer
   ```

2. Seed the events table:

   ```bash
   npm run seed:events -- --force
   ```

   - `--force` clears existing events (and associated tickets) before seeding.
   - Run without `--force` if you only want to top up missing rows up to `TARGET_TOTAL_EVENTS`.

3. Verify rows were added:

   ```bash
   mysql -uwebcw1 -pUserpw_v9ZmQb1sL4 webcw1 -e "SELECT COUNT(*) FROM events;"
   ```

   Replace credentials with those in your `.env`.

---

## 5. Start the Servers

### 5.1 Backend API (Express)

```bash
npm run dev:server
```

This runs on the port specified by `PORT` (default 4000). Keep this terminal open.

### 5.2 Frontend (Vite dev server)

In a second terminal:

```bash
npm run dev
```

By default the site is served at `http://localhost:5173`. Vite automatically proxies API requests to the backend.

---

## 6. Access the App

- **Public site:** `http://localhost:5173`
- **Event listing:** `/events`
- **Admin dashboard:** `/admin`
  - Sign in with the admin credentials seeded earlier.
- **Admin event manager:** `/admin/events`

Uploaded media goes into the local `uploads` folder and is available via the `/uploads` route.

---

## 7. Optional: Useful Commands

- **Lint the codebase**

  ```bash
  npm run lint
  ```

- **Build the production bundle**

  ```bash
  npm run build
  ```

- **Reset seeds quickly**

  ```bash
  npm run seed:events -- --force
  ```

  Adjust `TARGET_TOTAL_EVENTS` beforehand if you want a different count.

---

Need help? Reach out on the project Slack channel or open an issue. Happy hacking!
