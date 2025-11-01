## Docker Quickstart for EventSphere

This guide walks collaborators through installing Docker, provisioning the stack, and running the app end-to-end in containers.

> **Prerequisites**
>
> - Modern OS with virtualization enabled (Windows 10/11 Pro, macOS 12+, Ubuntu 22.04+, etc.)
> - Admin rights on the machine to install Docker Desktop / Docker Engine

---

### 1. Install Docker

Choose the instructions for your platform:

| Platform | Install Steps |
| --- | --- |
| **macOS** | Download and install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/). During setup, grant the requested privileges and restart if prompted. |
| **Windows (WSL2 recommended)** | Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/). When prompted, enable WSL 2 and the Hyper-V features. After installation, ensure Docker Desktop reports “Running”. |
| **Linux** | Follow the official Docker Engine docs for your distribution (e.g., [Ubuntu guide](https://docs.docker.com/engine/install/ubuntu/)). Enable the Docker service and add your user to the `docker` group (`sudo usermod -aG docker $USER`). Log out/in to apply group changes. |

Verify Docker is working:

```bash
docker version
docker compose version
docker run hello-world
```

All commands should succeed without needing `sudo` (on Linux after the group change).

---

### 2. Environment setup

1. Clone the repository and install JavaScript dependencies (still required for tooling, linting, etc.):
   ```bash
   git clone <repo-url>
   cd web-cw1-react/web-cw1
   npm install
   ```
2. Copy the environment template and update secrets:
   ```bash
   cp .env.example .env
   # then edit .env to set DB credentials and JWT_SECRET
   ```
3. (Optional) seed an initial admin once the database is running:
   ```bash
   npm run seed:admin -- --email admin@example.com --password "StrongPass123!"
   ```

---

### 3. Start services with Docker Compose

All containers are defined in `docker-compose.yml`.

```bash
# From web-cw1-react/web-cw1
docker compose up --build
```

This starts:
- **db** – MySQL 8 with credentials taken from `.env`
- **api** – Express registration/admin API (port 4000 inside the network)
- **web** – Vite dev server proxying to the API (port 5173 exposed to the host)

When the stack is healthy:
- Frontend is available at http://localhost:5173
- API is reachable in the browser/devtools at http://localhost:4000/api/health
- MySQL listens on localhost:3306 (for Adminer, MySQL Workbench, etc.)

Stop everything:

```bash
docker compose down
```

Tear down volumes as well (this deletes the database snapshot):

```bash
docker compose down --volumes
```

---

### 4. Working inside containers

Most day-to-day commands run through Docker or NPM scripts. Common tasks:

```bash
# Restart services after a code change
docker compose up --build api web

# Attach to server logs
docker compose logs -f api

# Run lint checks (host machine, uses local node_modules)
npm run lint

# Build production bundle locally
npm run build

# Execute MySQL CLI inside container
docker compose exec db mysql -u webcw1 -pwebcw1_pass webcw1
```

If you need a shell inside the API container (e.g., to inspect env vars):

```bash
docker compose exec api /bin/sh
```

---

### 5. Local development without Docker

If you prefer to run services on the host:

```bash
npm run dev:server   # start Express API (default port 4000)
npm run dev          # start Vite dev server (default port 5173)
```

Ensure MySQL 8 is running and `.env` matches your local credentials.

---

### 6. Resetting or reseeding the database

```bash
# Drop and recreate the Docker DB volume
docker compose down --volumes
docker compose up -d db

# Reseed admin (after DB is up)
npm run seed:admin -- --email admin@example.com --password "NewPass123!"
```

---

### 7. Troubleshooting

- **Port conflicts**: stop other processes on 4000/5173/3306 or change the ports in `.env` / `docker-compose.yml`.
- **JWT_SECRET missing**: the API exits if `JWT_SECRET` isn’t set—double-check `.env` is loaded (`docker compose` automatically injects it).
- **Cannot connect to DB**: confirm the `db` container is healthy (`docker compose ps`) and the creds in `.env` match.
- **Permissions errors on Linux**: ensure your user is in the `docker` group or prefix commands with `sudo`.

For any other issue, check container logs: `docker compose logs -f`.

---

With Docker running, collaborators can start coding after `docker compose up --build`, open http://localhost:5173, and authenticate via `/login` (users) or `/admin/login` (admins). Happy shipping!
