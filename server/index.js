/* eslint-env node */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import cors from 'cors';  

dotenv.config();

const projectRoot = process.cwd();
const uploadsRoot = path.join(projectRoot, "uploads");
const eventUploadsDir = path.join(uploadsRoot, "events");

const app = express();
app.use("/uploads", express.static(uploadsRoot));
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:5173',  // frontend location
  credentials: true,  
}));

const allowedImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/jpg",
]);

const MAX_GALLERY_IMAGES = 10;

function isRemotePath(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function normaliseExternalUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, eventUploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  fileFilter: (_req, file, cb) => {
    if (allowedImageMimeTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image uploads are allowed."));
    }
  },
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

function toStoredPath(filename) {
  return path.posix.join("uploads", "events", filename);
}

function toAbsolutePath(storedPath) {
  if (isRemotePath(storedPath)) {
    throw new Error("Cannot resolve remote media path to filesystem path.");
  }
  const normalised = storedPath.startsWith("/") ? storedPath.slice(1) : storedPath;
  return path.join(projectRoot, normalised);
}

async function deleteStoredFile(storedPath) {
  if (!storedPath || isRemotePath(storedPath)) {
    return;
  }
  try {
    await fs.unlink(toAbsolutePath(storedPath));
  } catch (fileError) {
    if (fileError && fileError.code !== "ENOENT") {
      console.error("[uploads] failed to delete file", storedPath, fileError);
    }
  }
}

const eventMediaUpload = (req, res, next) => {
  if (req.is("multipart/form-data")) {
    upload.fields([
      { name: "heroImage", maxCount: 1 },
      { name: "galleryImages", maxCount: MAX_GALLERY_IMAGES },
    ])(req, res, next);
  } else {
    next();
  }
};

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "webcw1",
  };
}

const pool = mysql.createPool({
  ...getDatabaseConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function ensureUploadDirectories() {
  try {
    await fs.mkdir(eventUploadsDir, { recursive: true });
  } catch (error) {
    console.error("[startup] failed to ensure upload directories", error);
    throw error;
  }
}

ensureUploadDirectories().catch((error) => {
  console.error("[startup] upload directory initialisation failed", error);
  process.exit(1);
});

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error("[startup] JWT_SECRET environment variable must be set");
  process.exit(1);
}

const tokenCookieName = "session";
const tokenMaxAgeMs = 1000 * 60 * 60 * 6; // 6 hours

const EVENT_STATUSES = new Set(["draft", "published", "cancelled"]);
const DEFAULT_PAGE_SIZE = 100;

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

async function generateUniqueSlug(executor, title, excludeEventId = null) {
  const base = slugify(title) || `event-${Date.now()}`;
  let candidate = base;
  let attempt = 1;

  while (true) {
    const params = excludeEventId ? [candidate, excludeEventId] : [candidate];
    const [rows] = await executor.query(
      excludeEventId
        ? "SELECT id FROM events WHERE slug = ? AND id <> ? LIMIT 1"
        : "SELECT id FROM events WHERE slug = ? LIMIT 1",
      params,
    );

    if (rows.length === 0) {
      return candidate;
    }

    candidate = `${base}-${attempt}`;
    attempt += 1;
  }
}

function asMySqlDateTime(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function asIsoString(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function parseGalleryPaths(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string" && entry.length > 0);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry) => typeof entry === "string" && entry.length > 0);
      }
    } catch (error) {
      console.error("[events] failed to parse gallery paths", error);
    }
  }

  return [];
}

function normalizeStoredPath(storedPath) {
  if (!storedPath) {
    return null;
  }
  if (isRemotePath(storedPath)) {
    return storedPath;
  }
  return storedPath.startsWith("/") ? storedPath : `/${storedPath}`;
}

function normalizeIncomingStoredPath(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (isRemotePath(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
}

function getBodyValue(body, key) {
  const value = body?.[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function mapEventRow(row, { includeInternal = false } = {}) {
  if (!row) {
    return null;
  }

  const reserved = Number(row.reservedCount ?? 0);
  const waitlisted = Number(row.waitlistedCount ?? 0);
  const cancelled = Number(row.cancelledCount ?? 0);
  const capacity = Number(row.capacity ?? 0);

  const galleryPaths = parseGalleryPaths(row.galleryImagePaths);
  const heroImagePath = row.heroImagePath ?? null;
  const heroImage = heroImagePath ? normalizeStoredPath(heroImagePath) : null;
  const normalizedGallery = galleryPaths
    .map((entry) => normalizeStoredPath(entry))
    .filter((entry) => typeof entry === "string" && entry.length > 0);
  const galleryWithHero = heroImage
    ? [heroImage, ...normalizedGallery.filter((entry) => entry !== heroImage)]
    : normalizedGallery;

  const mapped = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    description: row.description,
    startAt: asIsoString(row.startAt),
    endAt: asIsoString(row.endAt),
    timezone: row.timezone,
    venue: {
      name: row.venueName,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      region: row.region,
      postalCode: row.postalCode,
      countryCode: row.countryCode,
    },
    capacity,
    price: {
      amountCents: row.priceCents !== null ? Number(row.priceCents) : 0,
      currencyCode: row.currencyCode,
    },
    heroImage,
    galleryImages: galleryWithHero,
    status: row.status,
    publishedAt: asIsoString(row.publishedAt),
    createdAt: asIsoString(row.createdAt),
    updatedAt: asIsoString(row.updatedAt),
    createdBy: row.createdBy ?? null,
    totals: {
      reserved,
      waitlisted,
      cancelled,
    },
    availability: {
      remaining: Math.max(0, capacity - reserved),
    },
  };

  if (includeInternal) {
    mapped.heroImagePath = heroImagePath ?? null;
    mapped.galleryImagePaths = galleryPaths;
  }

  return mapped;
}

async function fetchEventAggregate(
  executor,
  { id = null, slug = null, lock = false } = {},
  { includeInternal = false } = {},
) {
  if (!id && !slug) {
    throw new Error("fetchEventAggregate requires an id or slug");
  }

  const clauses = [];
  const params = [];

  if (id) {
    clauses.push("e.id = ?");
    params.push(id);
  }
  if (slug) {
    clauses.push("e.slug = ?");
    params.push(slug);
  }

  const lockClause = lock ? "FOR UPDATE" : "";

  const [rows] = await executor.query(
    `
      SELECT
        e.id,
        e.created_by AS createdBy,
        e.title,
        e.slug,
        e.summary,
        e.description,
        e.start_at AS startAt,
        e.end_at AS endAt,
        e.timezone,
        e.venue_name AS venueName,
        e.address_line1 AS addressLine1,
        e.address_line2 AS addressLine2,
        e.city,
        e.region,
        e.postal_code AS postalCode,
        e.country_code AS countryCode,
        e.capacity,
        e.price_cents AS priceCents,
        e.currency_code AS currencyCode,
        e.hero_image_path AS heroImagePath,
        e.gallery_image_paths AS galleryImagePaths,
        e.status,
        e.published_at AS publishedAt,
        e.created_at AS createdAt,
        e.updated_at AS updatedAt,
        COALESCE(SUM(CASE WHEN t.status = 'reserved' THEN t.quantity ELSE 0 END), 0) AS reservedCount,
        COALESCE(SUM(CASE WHEN t.status = 'waitlisted' THEN t.quantity ELSE 0 END), 0) AS waitlistedCount,
        COALESCE(SUM(CASE WHEN t.status = 'cancelled' THEN t.quantity ELSE 0 END), 0) AS cancelledCount
      FROM events e
      LEFT JOIN event_tickets t ON t.event_id = e.id
      WHERE ${clauses.join(" AND ")}
      GROUP BY e.id
      ${lockClause}
    `,
    params,
  );

  return rows[0] ? mapEventRow(rows[0], { includeInternal }) : null;
}

async function logEventAudit(
  adminUserId,
  eventId,
  action,
  beforeState,
  afterState,
  executor = pool,
) {
  try {
    await executor.execute(
      `
        INSERT INTO event_audit_logs (event_id, admin_user_id, action, before_state, after_state)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        eventId,
        adminUserId ?? null,
        action,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null,
      ],
    );
  } catch (error) {
    console.error("[events] failed to log audit", error);
  }
}

function buildEventFilters(query = {}, { forAdmin = false } = {}) {
  const whereClauses = [];
  const values = [];

   if (query.createdBy) {
    whereClauses.push("e.created_by = ?");
    values.push(Number(query.createdBy));
  }



  if (forAdmin) {
    if (query.status) {
      const statuses = String(query.status)
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      const validStatuses = statuses.filter((status) => EVENT_STATUSES.has(status));
      if (validStatuses.length > 0) {
        whereClauses.push(`e.status IN (${validStatuses.map(() => "?").join(", ")})`);
        values.push(...validStatuses);
      }
    }
  } else {
    whereClauses.push("e.status = 'published'");
  }

  if (query.city) {
    whereClauses.push("LOWER(e.city) = LOWER(?)");
    values.push(String(query.city).trim());
  }

  if (query.country) {
    whereClauses.push("LOWER(e.country_code) = LOWER(?)");
    values.push(String(query.country).trim());
  }

  if (query.q) {
    const search = `%${String(query.q).trim().toLowerCase()}%`;
    whereClauses.push(
      "(LOWER(e.title) LIKE ? OR LOWER(e.summary) LIKE ? OR LOWER(e.city) LIKE ? OR LOWER(e.country_code) LIKE ?)",
    );
    values.push(search, search, search, search);
  }

  if (query.startAfter) {
    const startAfterDate = new Date(String(query.startAfter));
    if (!Number.isNaN(startAfterDate.getTime())) {
      whereClauses.push("e.start_at >= ?");
      values.push(asMySqlDateTime(startAfterDate));
    }
  }

  if (query.startBefore) {
    const startBeforeDate = new Date(String(query.startBefore));
    if (!Number.isNaN(startBeforeDate.getTime())) {
      whereClauses.push("e.start_at <= ?");
      values.push(asMySqlDateTime(startBeforeDate));
    }
  }

  

  return {
    where: whereClauses.length > 0 ? whereClauses.join(" AND ") : "1",
    values,
  };
}

function getPagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
   
  const limit = Math.min(
    1000, 
    Math.max(1, Number.parseInt(query.limit ?? 100, 10) || 100) 
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function generateConfirmationCode() {
  return crypto.randomBytes(6).toString("base64url").slice(0, 12);
}

async function listEvents(query, { forAdmin = false } = {}) {
  const { where, values } = buildEventFilters(query, { forAdmin });
  const { limit, offset, page } = getPagination(query);

  const [rows] = await pool.query(
    `
      SELECT
        e.id,
        e.created_by AS createdBy,
        e.title,
        e.slug,
        e.summary,
        e.description,
        e.start_at AS startAt,
        e.end_at AS endAt,
        e.timezone,
        e.venue_name AS venueName,
        e.address_line1 AS addressLine1,
        e.address_line2 AS addressLine2,
        e.city,
        e.region,
        e.postal_code AS postalCode,
        e.country_code AS countryCode,
        e.capacity,
        e.price_cents AS priceCents,
        e.currency_code AS currencyCode,
        e.status,
        e.published_at AS publishedAt,
        e.created_at AS createdAt,
        e.updated_at AS updatedAt,
        e.hero_image_path AS heroImagePath,
        e.gallery_image_paths AS galleryImagePaths,
        COALESCE(SUM(CASE WHEN t.status = 'reserved' THEN t.quantity ELSE 0 END), 0) AS reservedCount,
        COALESCE(SUM(CASE WHEN t.status = 'waitlisted' THEN t.quantity ELSE 0 END), 0) AS waitlistedCount,
        COALESCE(SUM(CASE WHEN t.status = 'cancelled' THEN t.quantity ELSE 0 END), 0) AS cancelledCount
      FROM events e
      LEFT JOIN event_tickets t ON t.event_id = e.id
      WHERE ${where}
      GROUP BY e.id
      ORDER BY e.start_at ASC
      LIMIT ?
      OFFSET ?
    `,
    [...values, limit, offset],
  );

  const [countRows] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM events e
      WHERE ${where}
    `,
    values,
  );

  return {
    events: rows.map((row) => mapEventRow(row, { includeInternal: forAdmin })),
    pagination: {
      page,
      limit,
      total: Number(countRows[0]?.total ?? 0),
    },
  };
}

async function ensureSchema() {
  const ddlUsers = `
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      is_organiser TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  const ddlActions = `
    CREATE TABLE IF NOT EXISTS admin_actions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      admin_user_id INT UNSIGNED NOT NULL,
      action VARCHAR(100) NOT NULL,
      target_user_id INT UNSIGNED,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_admin_user_id (admin_user_id),
      CONSTRAINT fk_admin_actions_admin FOREIGN KEY (admin_user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  const ddlEvents = `
    CREATE TABLE IF NOT EXISTS events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      created_by INT UNSIGNED DEFAULT NULL,
      title VARCHAR(180) NOT NULL,
      slug VARCHAR(200) NOT NULL UNIQUE,
      summary VARCHAR(280) NOT NULL,
      description MEDIUMTEXT NOT NULL,
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      timezone VARCHAR(50) NOT NULL,
      venue_name VARCHAR(160) NOT NULL,
      address_line1 VARCHAR(160) NOT NULL,
      address_line2 VARCHAR(160) DEFAULT NULL,
      city VARCHAR(120) NOT NULL,
      region VARCHAR(120) DEFAULT NULL,
      postal_code VARCHAR(40) DEFAULT NULL,
      country_code CHAR(2) NOT NULL,
      capacity INT UNSIGNED NOT NULL,
      price_cents INT UNSIGNED DEFAULT 0,
      currency_code CHAR(3) NOT NULL DEFAULT 'USD',
      hero_image_path VARCHAR(255) DEFAULT NULL,
      gallery_image_paths JSON DEFAULT NULL,
      status ENUM('draft','published','cancelled') NOT NULL DEFAULT 'draft',
      published_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_events_status_date (status, start_at),
      KEY idx_events_city_date (city, start_at),
      CONSTRAINT fk_events_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  const ddlEventTickets = `
    CREATE TABLE IF NOT EXISTS event_tickets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      quantity TINYINT UNSIGNED NOT NULL DEFAULT 1,
      status ENUM('reserved','waitlisted','cancelled') NOT NULL DEFAULT 'reserved',
      confirmation_code CHAR(12) NOT NULL UNIQUE,
      reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cancelled_at DATETIME DEFAULT NULL,
      waitlisted_at DATETIME DEFAULT NULL,
      UNIQUE KEY uniq_event_user (event_id, user_id),
      KEY idx_tickets_user (user_id),
      KEY idx_tickets_event_status (event_id, status),
      CONSTRAINT fk_event_tickets_event FOREIGN KEY (event_id)
        REFERENCES events(id) ON DELETE CASCADE,
      CONSTRAINT fk_event_tickets_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  const ddlEventAuditLogs = `
    CREATE TABLE IF NOT EXISTS event_audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      admin_user_id INT UNSIGNED DEFAULT NULL,
      action VARCHAR(100) NOT NULL,
      before_state JSON,
      after_state JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_event_audit_event (event_id),
      CONSTRAINT fk_event_audit_event FOREIGN KEY (event_id)
        REFERENCES events(id) ON DELETE CASCADE,
      CONSTRAINT fk_event_audit_admin FOREIGN KEY (admin_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  const connection = await pool.getConnection();
  try {
    await connection.query(ddlUsers);
    const [existingColumns] = await connection.query(
      "SHOW COLUMNS FROM users LIKE 'is_admin'",
    );
    if (existingColumns.length === 0) {
      await connection.query(
        "ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0",
      );
    }

    const [existingOrganiserColumns] = await connection.query(
    "SHOW COLUMNS FROM users LIKE 'is_organiser'",
  );
  if (existingOrganiserColumns.length === 0) {
    await connection.query(
      "ALTER TABLE users ADD COLUMN is_organiser TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin",
    );
    
  }

    await connection.query(ddlActions);
    await connection.query(ddlEvents);
    const [eventsCreatedByColumn] = await connection.query(
      "SHOW COLUMNS FROM events LIKE 'created_by'",
    );
    if (
      eventsCreatedByColumn[0] &&
      eventsCreatedByColumn[0].Null === "NO" &&
      eventsCreatedByColumn[0].Default === null
    ) {
      await connection.query(
        "ALTER TABLE events MODIFY COLUMN created_by INT UNSIGNED DEFAULT NULL",
      );
    }
    const [heroImageColumn] = await connection.query(
      "SHOW COLUMNS FROM events LIKE 'hero_image_path'",
    );
    if (heroImageColumn.length === 0) {
      await connection.query(
        "ALTER TABLE events ADD COLUMN hero_image_path VARCHAR(255) DEFAULT NULL AFTER currency_code",
      );
    }
    const [galleryImageColumn] = await connection.query(
      "SHOW COLUMNS FROM events LIKE 'gallery_image_paths'",
    );
    if (galleryImageColumn.length === 0) {
      await connection.query(
        "ALTER TABLE events ADD COLUMN gallery_image_paths JSON DEFAULT NULL AFTER hero_image_path",
      );
    }
    await connection.query(ddlEventTickets);
    await connection.query(ddlEventAuditLogs);
    console.info("[startup] database schema ready");
  } finally {
    connection.release();
  }
}

ensureSchema().catch((error) => {
  console.error("[startup] failed to ensure database schema", error);
  process.exit(1);
});

async function findUserByEmail(email) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        email,
        password_hash AS passwordHash,
        is_admin AS isAdmin,
        is_organiser AS isOrganiser,
        created_at AS createdAt
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email],
  );
  return rows[0] ?? null;
}

async function findUserById(id) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        email,
        is_admin AS isAdmin,
        is_organiser AS isOrganiser,
        created_at AS createdAt
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );
  return rows[0] ?? null;
}

function signSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      isAdmin: Boolean(user.isAdmin),
      isOrganiser: Boolean(user.isOrganiser),
    },
    jwtSecret,
    { expiresIn: tokenMaxAgeMs / 1000 },
  );
}

function setSessionCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(tokenCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: tokenMaxAgeMs,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(tokenCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.[tokenCookieName];
  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);

    

    const user = await findUserById(payload.sub);

    

    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ message: "Session is no longer valid." });
    }

    req.user = {
      id: user.id,
      email: user.email,
      isAdmin: Boolean(user.isAdmin),
      isOrganiser: Boolean(user.isOrganiser),
      createdAt: user.createdAt,
    };


    
    next();
  } catch (error) {
    console.error("[auth] failed to verify token", error);
    clearSessionCookie(res);
    res.status(401).json({ message: "Invalid session." });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Admin privileges required." });
  }
  next();
}

function requireOrganiser(req, res, next) {
  if (!req.user?.isOrganiser && !req.user?.isAdmin) {
    return res.status(403).json({ message: "Organiser privileges required." });
  }
  next();
}

async function logAdminAction(adminUserId, action, targetUserId, details = null) {
  try {
    await pool.execute(
      `
        INSERT INTO admin_actions (admin_user_id, action, target_user_id, details)
        VALUES (?, ?, ?, ?)
      `,
      [adminUserId, action, targetUserId ?? null, details ? JSON.stringify(details) : null],
    );
  } catch (error) {
    console.error("[admin] failed to log action", error);
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    console.error("[health] database check failed", error);
    res.status(500).json({ status: "error" });
  }
});

app.post("/api/register", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalisedEmail = email.trim().toLowerCase();
  if (!normalisedEmail) {
    return res.status(400).json({ message: "Email cannot be empty." });
  }

  const passwordValue = password.trim();
  if (passwordValue.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long." });
  }

  try {
    const passwordHash = await bcrypt.hash(passwordValue, 12);
    const [result] = await pool.execute(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [normalisedEmail, passwordHash],
    );

    res.status(201).json({
      id: result.insertId,
      email: normalisedEmail,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "An account with that email already exists." });
    }

    console.error("[register] failed to create user", error);
    res.status(500).json({ message: "Could not create account. Try again later." });
  }
});

app.post("/api/register/organiser", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalisedEmail = email.trim().toLowerCase();
  if (!normalisedEmail) {
    return res.status(400).json({ message: "Email cannot be empty." });
  }

  const passwordValue = password.trim();
  if (passwordValue.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long." });
  }

  

  try {
    const passwordHash = await bcrypt.hash(passwordValue, 12);
    const [result] = await pool.execute(
      "INSERT INTO users (email, password_hash, is_organiser) VALUES (?, ?, ?)",
      [normalisedEmail, passwordHash, 1]  
    );

    

    res.status(201).json({
      id: result.insertId,
      email: normalisedEmail,
      isOrganiser: true,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "An account with that email already exists." });
    }

    console.error("[register] failed to create organiser", error);
    res.status(500).json({ message: "Could not create organiser account. Try again later." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalisedEmail = email.trim().toLowerCase();
  if (!normalisedEmail) {
    return res.status(400).json({ message: "Email cannot be empty." });
  }

  try {
    const user = await findUserByEmail(normalisedEmail);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = signSession(user);
    setSessionCookie(res, token);

   

    res.json({
      user: {
        id: user.id,
        email: user.email,
        isAdmin: Boolean(user.isAdmin),
        isOrganiser: Boolean(user.isOrganiser), 
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[login] failed to authenticate user", error);
    res.status(500).json({ message: "Could not log in. Try again later." });
  }
});

app.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT id, email, is_admin AS isAdmin, is_organiser AS isOrganiser, created_at AS createdAt
        FROM users
        ORDER BY created_at DESC
      `,
    );

    res.json({
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        isAdmin: Boolean(row.isAdmin),
        isOrganiser: Boolean(row.isOrganiser),
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    console.error("[admin] failed to list users", error);
    res.status(500).json({ message: "Could not load users." });
  }
});

app.patch("/api/admin/users/:id/organiser", requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ message: "Invalid user id." });
  }

  const { isOrganiser } = req.body ?? {};
  if (typeof isOrganiser !== "boolean") {
    return res.status(400).json({ message: "isOrganiser must be provided as a boolean." });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE users SET is_organiser = ? WHERE id = ?",
      [isOrganiser ? 1 : 0, targetId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    await logAdminAction(req.user.id, "update_user_organiser", targetId, { isOrganiser });

    const updatedUser = await findUserById(targetId);
    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        isAdmin: Boolean(updatedUser.isAdmin),
        isOrganiser: Boolean(updatedUser.isOrganiser),
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error("[admin] failed to update user organiser status", error);
    res.status(500).json({ message: "Could not update user." });
  }
});

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ message: "Invalid user id." });
  }

  if (targetId === req.user.id) {
    return res.status(400).json({ message: "You cannot change your own admin status." });
  }

  const { isAdmin } = req.body ?? {};
  if (typeof isAdmin !== "boolean") {
    return res.status(400).json({ message: "isAdmin must be provided as a boolean." });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE users SET is_admin = ? WHERE id = ?",
      [isAdmin ? 1 : 0, targetId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    await logAdminAction(req.user.id, "update_user", targetId, { isAdmin });

    const updatedUser = await findUserById(targetId);
    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        isAdmin: Boolean(updatedUser.isAdmin),
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error("[admin] failed to update user", error);
    res.status(500).json({ message: "Could not update user." });
  }
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ message: "Invalid user id." });
  }

  if (targetId === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own account." });
  }

  try {
    const targetUser = await findUserById(targetId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    await pool.execute("DELETE FROM users WHERE id = ?", [targetId]);
    await logAdminAction(req.user.id, "delete_user", targetId, {
      email: targetUser.email,
    });

    res.status(204).end();
  } catch (error) {
    console.error("[admin] failed to delete user", error);
    res.status(500).json({ message: "Could not delete user." });
  }
});




app.get("/api/events", async (req, res) => {
  try {
    const result = await listEvents(req.query ?? {}, { forAdmin: false });
    res.json(result);
  } catch (error) {
    console.error("[events] failed to list public events", error);
    res.status(500).json({ message: "Could not load events." });
  }
});

app.get("/api/events/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) {
    return res.status(400).json({ message: "Invalid event identifier." });
  }

  try {
    const event = await fetchEventAggregate(pool, { slug });
    if (!event || event.status !== "published") {
      return res.status(404).json({ message: "Event not found." });
    }
    res.json({ event });
  } catch (error) {
    console.error("[events] failed to fetch event by slug", error);
    res.status(500).json({ message: "Could not load event." });
  }
});

app.post("/api/events/:id/tickets", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  const quantity = Number.parseInt(req.body?.quantity ?? "1", 10) || 1;

  if (!Number.isInteger(eventId) || eventId < 1) {
    return res.status(400).json({ message: "Invalid event id." });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return res.status(400).json({ message: "Quantity must be between 1 and 10." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const event = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true },
    );
    if (!event || event.status !== "published") {
      await connection.rollback();
      return res.status(404).json({ message: "Event not found or not available." });
    }

    const userId = req.user.id;

    const [ticketRows] = await connection.query(
      `
        SELECT *
        FROM event_tickets
        WHERE event_id = ? AND user_id = ?
        FOR UPDATE
      `,
      [eventId, userId],
    );

    const existingTicket = ticketRows[0] ?? null;

    const availableSeats = Math.max(0, event.capacity - event.totals.reserved + (existingTicket?.status === "reserved" ? existingTicket.quantity : 0));
    const shouldWaitlist = availableSeats < quantity;

    const status = shouldWaitlist ? "waitlisted" : "reserved";
    const now = asMySqlDateTime(new Date());

    if (existingTicket) {
      await connection.execute(
        `
          UPDATE event_tickets
          SET quantity = ?,
              status = ?,
              reserved_at = CASE WHEN ? = 'reserved' THEN ? ELSE reserved_at END,
              waitlisted_at = CASE WHEN ? = 'waitlisted' THEN ? ELSE waitlisted_at END,
              cancelled_at = NULL
          WHERE id = ?
        `,
        [
          quantity,
          status,
          status,
          status === "reserved" ? now : existingTicket.reserved_at,
          status,
          status === "waitlisted" ? now : existingTicket.waitlisted_at,
          existingTicket.id,
        ],
      );
    } else {
      await connection.execute(
        `
          INSERT INTO event_tickets (
            event_id,
            user_id,
            quantity,
            status,
            confirmation_code,
            reserved_at,
            waitlisted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          eventId,
          userId,
          quantity,
          status,
          generateConfirmationCode(),
          status === "reserved" ? now : null,
          status === "waitlisted" ? now : null,
        ],
      );
    }

    const updatedEvent = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true },
    );
    await connection.commit();

    const [ticketResult] = await pool.query(
      `
        SELECT
          id,
          event_id AS eventId,
          user_id AS userId,
          quantity,
          status,
          confirmation_code AS confirmationCode,
          reserved_at AS reservedAt,
          waitlisted_at AS waitlistedAt,
          cancelled_at AS cancelledAt
        FROM event_tickets
        WHERE event_id = ? AND user_id = ?
        LIMIT 1
      `,
      [eventId, userId],
    );

    res.status(existingTicket ? 200 : 201).json({
      ticket: ticketResult[0]
        ? {
            id: ticketResult[0].id,
            eventId: ticketResult[0].eventId,
            userId: ticketResult[0].userId,
            quantity: ticketResult[0].quantity,
            status: ticketResult[0].status,
            confirmationCode: ticketResult[0].confirmationCode,
            reservedAt: asIsoString(ticketResult[0].reservedAt),
            waitlistedAt: asIsoString(ticketResult[0].waitlistedAt),
            cancelledAt: asIsoString(ticketResult[0].cancelledAt),
          }
        : null,
      event: updatedEvent,
    });
  } catch (error) {
    await connection.rollback();
    console.error("[tickets] failed to reserve seats", error);
    res.status(500).json({ message: "Could not complete reservation." });
  } finally {
    connection.release();
  }
});

app.delete("/api/events/:id/tickets", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId < 1) {
    return res.status(400).json({ message: "Invalid event id." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [ticketRows] = await connection.query(
      `
        SELECT *
        FROM event_tickets
        WHERE event_id = ? AND user_id = ?
        FOR UPDATE
      `,
      [eventId, req.user.id],
    );

    const ticket = ticketRows[0];
    if (!ticket || ticket.status === "cancelled") {
      await connection.rollback();
      return res.status(404).json({ message: "Reservation not found." });
    }

    const now = asMySqlDateTime(new Date());

    await connection.execute(
      `
        UPDATE event_tickets
        SET status = 'cancelled',
            cancelled_at = ?
        WHERE id = ?
      `,
      [now, ticket.id],
    );

    await connection.commit();
    res.status(204).end();
  } catch (error) {
    await connection.rollback();
    console.error("[tickets] failed to cancel reservation", error);
    res.status(500).json({ message: "Could not cancel reservation." });
  } finally {
    connection.release();
  }
});

app.get("/api/me/tickets", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT
          t.id,
          t.event_id AS eventId,
          t.user_id AS userId,
          t.quantity,
          t.status,
          t.confirmation_code AS confirmationCode,
          t.reserved_at AS reservedAt,
          t.waitlisted_at AS waitlistedAt,
          t.cancelled_at AS cancelledAt,
          e.title,
          e.slug,
          e.start_at AS startAt,
          e.end_at AS endAt,
          e.city,
          e.country_code AS countryCode,
          e.venue_name AS venueName,
          e.status AS eventStatus
        FROM event_tickets t
        INNER JOIN events e ON e.id = t.event_id
        WHERE t.user_id = ?
        ORDER BY e.start_at ASC
      `,
      [req.user.id],
    );

    const tickets = rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      userId: row.userId,
      quantity: row.quantity,
      status: row.status,
      confirmationCode: row.confirmationCode,
      reservedAt: asIsoString(row.reservedAt),
      waitlistedAt: asIsoString(row.waitlistedAt),
      cancelledAt: asIsoString(row.cancelledAt),
      event: {
        title: row.title,
        slug: row.slug,
        startAt: asIsoString(row.startAt),
        endAt: asIsoString(row.endAt),
        city: row.city,
        countryCode: row.countryCode,
        venueName: row.venueName,
        status: row.eventStatus,
      },
    }));

    res.json({ tickets });
  } catch (error) {
    console.error("[tickets] failed to list user reservations", error);
    res.status(500).json({ message: "Could not load your reservations." });
  }
});

app.get("/api/admin/events", requireAuth, requireAdmin, async (req, res) => {
  
  try {

    const filters = req.query ?? {};

    const result = await listEvents(req.query ?? {}, { forAdmin: true });

    

    res.json(result);
  } catch (error) {
    console.error("[admin events] failed to list events", error);
    res.status(500).json({ message: "Could not load events." });
  }
});

app.post("/api/admin/events", requireAuth, requireAdmin, async (req, res) => {
  const {
    title,
    summary,
    description,
    startAt,
    endAt,
    timezone,
    venueName,
    addressLine1,
    addressLine2,
    city,
    region,
    postalCode,
    countryCode,
    capacity,
    priceCents,
    currencyCode,
    status,
  } = req.body ?? {};

  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ message: "Title is required." });
  }
  if (typeof summary !== "string" || !summary.trim()) {
    return res.status(400).json({ message: "Summary is required." });
  }
  if (typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ message: "Description is required." });
  }
  if (typeof startAt !== "string" || typeof endAt !== "string") {
    return res.status(400).json({ message: "Start and end times are required." });
  }
  if (typeof timezone !== "string" || !timezone.trim()) {
    return res.status(400).json({ message: "Timezone is required." });
  }
  if (typeof venueName !== "string" || !venueName.trim()) {
    return res.status(400).json({ message: "Venue name is required." });
  }
  if (typeof addressLine1 !== "string" || !addressLine1.trim()) {
    return res.status(400).json({ message: "Address line 1 is required." });
  }
  if (typeof city !== "string" || !city.trim()) {
    return res.status(400).json({ message: "City is required." });
  }
  if (typeof countryCode !== "string" || countryCode.trim().length !== 2) {
    return res.status(400).json({ message: "Country code must be a 2-letter ISO code." });
  }

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return res.status(400).json({ message: "Start/end date range is invalid." });
  }

  const capacityValue = Number.parseInt(capacity, 10);
  if (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 100000) {
    return res.status(400).json({ message: "Capacity must be between 1 and 100000." });
  }

  const statusValue =
    typeof status === "string" && EVENT_STATUSES.has(status.toLowerCase())
      ? status.toLowerCase()
      : "draft";

  const priceValue = Number.isFinite(Number(priceCents)) ? Math.max(0, Number(priceCents)) : 0;
  const currencyValue = typeof currencyCode === "string" && currencyCode.trim()
    ? currencyCode.trim().toUpperCase()
    : "USD";

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const slug = await generateUniqueSlug(connection, title);
    const publishedAt = statusValue === "published" ? asMySqlDateTime(new Date()) : null;

    const [result] = await connection.execute(
      `
        INSERT INTO events (
          created_by,
          title,
          slug,
          summary,
          description,
          start_at,
          end_at,
          timezone,
          venue_name,
          address_line1,
          address_line2,
          city,
          region,
          postal_code,
          country_code,
          capacity,
          price_cents,
          currency_code,
          status,
          published_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        title.trim(),
        slug,
        summary.trim(),
        description.trim(),
        asMySqlDateTime(startDate),
        asMySqlDateTime(endDate),
        timezone.trim(),
        venueName.trim(),
        addressLine1.trim(),
        addressLine2?.trim() || null,
        city.trim(),
        region?.trim() || null,
        postalCode?.trim() || null,
        countryCode.trim().toUpperCase(),
        capacityValue,
        Math.round(priceValue),
        currencyValue,
        statusValue,
        publishedAt,
      ],
    );

    const eventId = result.insertId;
    const event = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true },
    );
    await logEventAudit(req.user.id, eventId, "create", null, event, connection);

    await connection.commit();
    res.status(201).json({ event });
  } catch (error) {
    await connection.rollback();
    console.error("[admin events] failed to create event", error);
    res.status(500).json({ message: "Could not create event." });
  } finally {
    connection.release();
  }
});


app.get("/api/admin/event-creators", requireAuth, requireAdmin, async (req, res) => {
  let connection;
  try {
    
    connection = await pool.getConnection();
    
    const [rows] = await connection.query(
      `
        SELECT DISTINCT 
          u.id,
          u.email,
          u.is_Admin as isAdmin,
          u.is_Organiser as isOrganiser,
          COUNT(e.id) as eventCount,
          SUM(CASE WHEN e.status = 'published' THEN 1 ELSE 0 END) as publishedCount,
          SUM(CASE WHEN e.status = 'draft' THEN 1 ELSE 0 END) as draftCount,
          SUM(CASE WHEN e.status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
        FROM users u
        INNER JOIN events e ON u.id = e.created_by
        GROUP BY u.id, u.email, u.is_Admin, u.is_Organiser
        ORDER BY u.is_Admin DESC, u.is_Organiser DESC, eventCount DESC
      `
    );

    
    res.json({ users: rows });
    
  } catch (error) {
    console.error("[admin] failed to load event creators - 详细错误:", error);
    res.status(500).json({ 
      message: "Could not load event creators.",
      error: error.message 
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.post(
  "/api/admin/events/:id/media",
  requireAuth,
  requireAdmin,
  eventMediaUpload,
  async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId < 1) {
      return res.status(400).json({ message: "Invalid event id." });
    }

    const heroFile = req.files?.heroImage?.[0] ?? null;
    const galleryFiles = Array.isArray(req.files?.galleryImages)
      ? req.files.galleryImages
      : [];

    const newUploads = [];
    const heroUpload = heroFile ? { storedPath: toStoredPath(heroFile.filename) } : null;
    if (heroUpload) {
      newUploads.push(heroUpload.storedPath);
    }

    const galleryUploads = galleryFiles.map((file) => {
      const storedPath = toStoredPath(file.filename);
      newUploads.push(storedPath);
      return { storedPath };
    });

    const cleanupNewUploads = async () => {
      if (!newUploads.length) {
        return;
      }
      await Promise.all(newUploads.map((storedPath) => deleteStoredFile(storedPath)));
      newUploads.length = 0;
    };

    const heroImageModeRaw = String(getBodyValue(req.body, "heroImageMode") || "").toLowerCase();
    const heroImageMode = heroImageModeRaw === "url" ? "url" : "upload";
    const heroImageUrlRaw = getBodyValue(req.body, "heroImageUrl");
    const heroImageUrl =
      heroImageMode === "url" ? normaliseExternalUrl(heroImageUrlRaw) : null;
    if (heroImageMode === "url" && heroImageUrlRaw && !heroImageUrl) {
      await cleanupNewUploads();
      return res.status(400).json({ message: "Hero image URL must be a valid http(s) URL." });
    }

    const removeHeroRaw = getBodyValue(req.body, "removeHeroImage");
    const removeHero =
      typeof removeHeroRaw === "string" &&
      ["true", "1", "yes", "on"].includes(removeHeroRaw.toLowerCase());

    let parsedExistingGallery = null;
    const existingGalleryRaw = getBodyValue(req.body, "existingGallery");
    if (typeof existingGalleryRaw === "string" && existingGalleryRaw.trim()) {
      try {
        const parsed = JSON.parse(existingGalleryRaw);
        if (Array.isArray(parsed)) {
          parsedExistingGallery = parsed;
        }
      } catch {
        await cleanupNewUploads();
        return res.status(400).json({ message: "existingGallery must be valid JSON." });
      }
    }

    let galleryUrlUploads = [];
    const galleryImageUrlsRaw = getBodyValue(req.body, "galleryImageUrls");
    if (typeof galleryImageUrlsRaw === "string" && galleryImageUrlsRaw.trim()) {
      try {
        const parsed = JSON.parse(galleryImageUrlsRaw);
        if (!Array.isArray(parsed)) {
          throw new Error("galleryImageUrls must be an array");
        }
        const seen = new Set();
        const normalised = [];
        for (const entry of parsed) {
          const url = normaliseExternalUrl(entry);
          if (!url) {
            throw new Error("Invalid gallery URL");
          }
          if (!seen.has(url)) {
            seen.add(url);
            normalised.push(url);
          }
        }
        galleryUrlUploads = normalised;
      } catch {
        await cleanupNewUploads();
        return res.status(400).json({ message: "Gallery image URLs must be valid http(s) URLs." });
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const event = await fetchEventAggregate(
        connection,
        { id: eventId, lock: true },
        { includeInternal: true },
      );
      if (!event) {
        await connection.rollback();
        await cleanupNewUploads();
        return res.status(404).json({ message: "Event not found." });
      }

      const existingGalleryPaths = event.galleryImagePaths ?? [];
      let galleryKeepPaths = existingGalleryPaths;

      if (parsedExistingGallery) {
        const normalized = parsedExistingGallery
          .map(normalizeIncomingStoredPath)
          .filter(Boolean);
        if (normalized.length > 0) {
          galleryKeepPaths = normalized.filter((path) => existingGalleryPaths.includes(path));
        } else {
          galleryKeepPaths = [];
        }
      }

      galleryKeepPaths = galleryKeepPaths.filter(
        (path, index, array) => array.indexOf(path) === index,
      );

      const finalGalleryPaths = [];
      const appendGalleryPath = (value) => {
        if (!value) {
          return;
        }
        if (!finalGalleryPaths.includes(value)) {
          finalGalleryPaths.push(value);
        }
      };

      galleryKeepPaths.forEach(appendGalleryPath);
      galleryUrlUploads.forEach(appendGalleryPath);
      galleryUploads.forEach((upload) => appendGalleryPath(upload.storedPath));

      if (finalGalleryPaths.length > MAX_GALLERY_IMAGES) {
        await connection.rollback();
        await cleanupNewUploads();
        return res
          .status(400)
          .json({ message: `An event can have up to ${MAX_GALLERY_IMAGES} gallery images.` });
      }

      const removedGalleryPaths = existingGalleryPaths.filter(
        (path) => !galleryKeepPaths.includes(path) && !isRemotePath(path),
      );

      const existingHeroPath = event.heroImagePath ?? null;
      let newHeroPath = existingHeroPath;
      const heroPathsToDelete = [];

      if (heroUpload) {
        newHeroPath = heroUpload.storedPath;
        if (
          existingHeroPath &&
          existingHeroPath !== newHeroPath &&
          !isRemotePath(existingHeroPath)
        ) {
          heroPathsToDelete.push(existingHeroPath);
        }
      } else if (heroImageMode === "url") {
        if (heroImageUrl) {
          newHeroPath = heroImageUrl;
          if (
            existingHeroPath &&
            existingHeroPath !== heroImageUrl &&
            !isRemotePath(existingHeroPath)
          ) {
            heroPathsToDelete.push(existingHeroPath);
          }
        } else if (removeHero && existingHeroPath) {
          if (!isRemotePath(existingHeroPath)) {
            heroPathsToDelete.push(existingHeroPath);
          }
          newHeroPath = null;
        }
      } else if (removeHero && existingHeroPath) {
        if (!isRemotePath(existingHeroPath)) {
          heroPathsToDelete.push(existingHeroPath);
        }
        newHeroPath = null;
      }

      const heroChanged = newHeroPath !== existingHeroPath;
      const galleryChanged =
        JSON.stringify(finalGalleryPaths) !== JSON.stringify(existingGalleryPaths);

      if (!heroChanged && !galleryChanged) {
        await connection.rollback();
        await cleanupNewUploads();
        const eventCopy = { ...event };
        delete eventCopy.heroImagePath;
        delete eventCopy.galleryImagePaths;
        return res.json({ event: eventCopy });
      }

      const updates = [];
      const params = [];

      if (heroChanged) {
        updates.push("hero_image_path = ?");
        params.push(newHeroPath);
      }

      if (galleryChanged) {
        updates.push("gallery_image_paths = ?");
        params.push(JSON.stringify(finalGalleryPaths));
      }

      updates.push("updated_at = CURRENT_TIMESTAMP");

      await connection.execute(
        `UPDATE events SET ${updates.join(", ")} WHERE id = ?`,
        [...params, eventId],
      );

    const updatedEvent = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true },
    );

      await logEventAudit(req.user.id, eventId, "update_media", event, updatedEvent, connection);

      await connection.commit();

    await Promise.all(heroPathsToDelete.map((storedPath) => deleteStoredFile(storedPath)));
    await Promise.all(removedGalleryPaths.map((storedPath) => deleteStoredFile(storedPath)));

    const publicEvent = {
      ...updatedEvent,
      heroImage: updatedEvent.heroImagePath
        ? normalizeStoredPath(updatedEvent.heroImagePath)
        : updatedEvent.heroImage,
      galleryImages: [
        ...(Array.isArray(updatedEvent.galleryImagePaths)
          ? updatedEvent.galleryImagePaths
              .map((entry) => normalizeStoredPath(entry))
              .filter(Boolean)
          : []),
      ],
    };
    delete publicEvent.heroImagePath;
    delete publicEvent.galleryImagePaths;

    res.json({ event: publicEvent });
  } catch (error) {
    await connection.rollback();
    await cleanupNewUploads();
      console.error("[admin events] failed to update media", error);
      res.status(500).json({ message: "Could not update event media." });
    } finally {
      connection.release();
    }
  },
);

app.get("/api/organiser/events", requireAuth, requireOrganiser, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    
    const filterResult = buildEventFilters(req.query ?? {}, { forOrganiser: true });
    const originalWhere = filterResult.where;
    const values = filterResult.values;
    
    
    const organiserWhere = originalWhere.replace(/e\.status\s*=\s*'published'/, '1=1');
    
    
    
    const pagination = getPagination(req.query);
    const limit = pagination.limit;
    const offset = pagination.offset;
    const page = pagination.page;
    
    const [rows] = await connection.query(
      `
        SELECT
          e.id,
          e.created_by AS createdBy,
          e.title,
          e.slug,
          e.summary,
          e.description,
          e.start_at AS startAt,
          e.end_at AS endAt,
          e.timezone,
          e.venue_name AS venueName,
          e.address_line1 AS addressLine1,
          e.address_line2 AS addressLine2,
          e.city,
          e.region,
          e.postal_code AS postalCode,
          e.country_code AS countryCode,
          e.capacity,
          e.price_cents AS priceCents,
          e.currency_code AS currencyCode,
          e.status,
          e.published_at AS publishedAt,
          e.created_at AS createdAt,
          e.updated_at AS updatedAt,
          e.hero_image_path AS heroImagePath,
          e.gallery_image_paths AS galleryImagePaths,
          COALESCE(SUM(CASE WHEN t.status = 'reserved' THEN t.quantity ELSE 0 END), 0) AS reservedCount,
          COALESCE(SUM(CASE WHEN t.status = 'waitlisted' THEN t.quantity ELSE 0 END), 0) AS waitlistedCount,
          COALESCE(SUM(CASE WHEN t.status = 'cancelled' THEN t.quantity ELSE 0 END), 0) AS cancelledCount
        FROM events e
        LEFT JOIN event_tickets t ON t.event_id = e.id
        WHERE ${organiserWhere} AND e.created_by = ?
        GROUP BY e.id
        ORDER BY e.start_at ASC
        LIMIT ?
        OFFSET ?
      `,
      [...values, req.user.id, limit, offset]
    );

    
    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS total FROM events e WHERE ${organiserWhere} AND e.created_by = ?`,
      [...values, req.user.id]
    );

    res.json({
      events: rows.map((row) => mapEventRow(row, { includeInternal: true })),
      pagination: {
        page,
        limit,
        total: Number(countRows[0]?.total ?? 0),
      },
    });
    
  } catch (error) {
    console.error("[organiser] failed to list events", error);
    res.status(500).json({ message: "Could not load your events." });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get("/api/organiser/events/:id", requireAuth, requireOrganiser, async (req, res) => {
  const eventId = Number(req.params.id);
  
  try {
    const [rows] = await pool.query(
      `
        SELECT
          e.id,
          e.created_by AS createdBy,
          e.title,
          e.slug,
          e.summary,
          e.description,
          e.start_at AS startAt,
          e.end_at AS endAt,
          e.timezone,
          e.venue_name AS venueName,
          e.address_line1 AS addressLine1,
          e.address_line2 AS addressLine2,
          e.city,
          e.region,
          e.postal_code AS postalCode,
          e.country_code AS countryCode,
          e.capacity,
          e.price_cents AS priceCents,
          e.currency_code AS currencyCode,
          e.status,
          e.published_at AS publishedAt,
          e.created_at AS createdAt,
          e.updated_at AS updatedAt,
          e.hero_image_path AS heroImagePath,
          e.gallery_image_paths AS galleryImagePaths,
          COALESCE(SUM(CASE WHEN t.status = 'reserved' THEN t.quantity ELSE 0 END), 0) AS reservedCount
        FROM events e
        LEFT JOIN event_tickets t ON t.event_id = e.id
        WHERE e.id = ? AND e.created_by = ?
        GROUP BY e.id
      `,
      [eventId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Event not found or access denied." });
    }

    const event = mapEventRow(rows[0], { includeInternal: true });
    res.json({ event });
  } catch (error) {
    console.error("[organiser] failed to get event", error);
    res.status(500).json({ message: "Could not load event." });
  }
});


app.delete("/api/organiser/events/:id", requireAuth, requireOrganiser, async (req, res) => {
  const eventId = Number(req.params.id);
  
  try {
    
    const [eventRows] = await pool.query(
      "SELECT id, title FROM events WHERE id = ? AND created_by = ?",
      [eventId, req.user.id]
    );
    
    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found or access denied." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

     
      await connection.execute(
        'DELETE FROM event_tickets WHERE event_id = ?',
        [eventId]
      );

      
      await connection.execute(
        'DELETE FROM events WHERE id = ?',
        [eventId]
      );

      await connection.commit();
      res.json({ message: "Event deleted successfully." });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[organiser] failed to delete event", error);
    res.status(500).json({ message: "Could not delete event." });
  }
});


app.patch("/api/organiser/events/:id", requireAuth, requireOrganiser, async (req, res) => {
  const eventId = Number(req.params.id);
  
  try {
    
    const [eventRows] = await pool.query(
      "SELECT id, status FROM events WHERE id = ? AND created_by = ?",
      [eventId, req.user.id]
    );
    
    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found or access denied." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      
      const allowedFields = [
        'title', 'summary', 'description', 'startAt', 'endAt', 'timezone',
        'venueName', 'addressLine1', 'addressLine2', 'city', 'region', 
        'postalCode', 'countryCode', 'capacity', 'priceCents', 'currencyCode'
      ];
      
      const updates = [];
      const values = [];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          const dbField = field === 'startAt' ? 'start_at' :
                         field === 'endAt' ? 'end_at' :
                         field === 'venueName' ? 'venue_name' :
                         field === 'addressLine1' ? 'address_line1' :
                         field === 'addressLine2' ? 'address_line2' :
                         field === 'postalCode' ? 'postal_code' :
                         field === 'countryCode' ? 'country_code' :
                         field === 'priceCents' ? 'price_cents' :
                         field === 'currencyCode' ? 'currency_code' : field;
          
          updates.push(`${dbField} = ?`);
          
          
          if (field === 'startAt' || field === 'endAt') {
            values.push(asMySqlDateTime(new Date(req.body[field])));
          } else {
            values.push(req.body[field]);
          }
        }
      }
      
      if (req.body.status) {
        if (req.body.status === 'draft') {
          // 允许改为草稿
          updates.push('status = ?');
          values.push('draft');
          updates.push('published_at = NULL'); // 清除发布时间
        } else if (req.body.status !== 'published') {
          // 允许改为 cancelled
          updates.push('status = ?');
          values.push(req.body.status);
        } else {
          // 不允许改为 published
          await connection.rollback();
          return res.status(403).json({ 
            message: "Only administrators can publish events." 
          });
        }
      }
      
      if (updates.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: "No valid fields to update." });
      }
      
      updates.push('updated_at = CURRENT_TIMESTAMP');
      
      const query = `UPDATE events SET ${updates.join(', ')} WHERE id = ?`;
      await connection.execute(query, [...values, eventId]);
      
      
      const updatedEvent = await fetchEventAggregate(
        connection,
        { id: eventId, lock: true },
        { includeInternal: true }
      );
      
      await logEventAudit(req.user.id, eventId, "update", eventRows[0], updatedEvent, connection);
      await connection.commit();
      
      res.json({ event: updatedEvent });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[organiser] failed to update event", error);
    res.status(500).json({ message: "Could not update event." });
  }
});


app.post(
  "/api/organiser/events/:id/media",
  requireAuth,
  requireOrganiser,
  eventMediaUpload,
  async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId < 1) {
      return res.status(400).json({ message: "Invalid event id." });
    }

    const heroFile = req.files?.heroImage?.[0] ?? null;
    const galleryFiles = Array.isArray(req.files?.galleryImages)
      ? req.files.galleryImages
      : [];

    const newUploads = [];
    const heroUpload = heroFile ? { storedPath: toStoredPath(heroFile.filename) } : null;
    if (heroUpload) {
      newUploads.push(heroUpload.storedPath);
    }

    const galleryUploads = galleryFiles.map((file) => {
      const storedPath = toStoredPath(file.filename);
      newUploads.push(storedPath);
      return { storedPath };
    });

    const cleanupNewUploads = async () => {
      if (!newUploads.length) {
        return;
      }
      await Promise.all(newUploads.map((storedPath) => deleteStoredFile(storedPath)));
      newUploads.length = 0;
    };

    const heroImageModeRaw = String(getBodyValue(req.body, "heroImageMode") || "").toLowerCase();
    const heroImageMode = heroImageModeRaw === "url" ? "url" : "upload";
    const heroImageUrlRaw = getBodyValue(req.body, "heroImageUrl");
    const heroImageUrl =
      heroImageMode === "url" ? normaliseExternalUrl(heroImageUrlRaw) : null;
    if (heroImageMode === "url" && heroImageUrlRaw && !heroImageUrl) {
      await cleanupNewUploads();
      return res.status(400).json({ message: "Hero image URL must be a valid http(s) URL." });
    }

    const removeHeroRaw = getBodyValue(req.body, "removeHeroImage");
    const removeHero =
      typeof removeHeroRaw === "string" &&
      ["true", "1", "yes", "on"].includes(removeHeroRaw.toLowerCase());

    let parsedExistingGallery = null;
    const existingGalleryRaw = getBodyValue(req.body, "existingGallery");
    if (typeof existingGalleryRaw === "string" && existingGalleryRaw.trim()) {
      try {
        const parsed = JSON.parse(existingGalleryRaw);
        if (Array.isArray(parsed)) {
          parsedExistingGallery = parsed;
        }
      } catch {
        await cleanupNewUploads();
        return res.status(400).json({ message: "existingGallery must be valid JSON." });
      }
    }

    let galleryUrlUploads = [];
    const galleryImageUrlsRaw = getBodyValue(req.body, "galleryImageUrls");
    if (typeof galleryImageUrlsRaw === "string" && galleryImageUrlsRaw.trim()) {
      try {
        const parsed = JSON.parse(galleryImageUrlsRaw);
        if (!Array.isArray(parsed)) {
          throw new Error("galleryImageUrls must be an array");
        }
        const seen = new Set();
        const normalised = [];
        for (const entry of parsed) {
          const url = normaliseExternalUrl(entry);
          if (!url) {
            throw new Error("Invalid gallery URL");
          }
          if (!seen.has(url)) {
            seen.add(url);
            normalised.push(url);
          }
        }
        galleryUrlUploads = normalised;
      } catch {
        await cleanupNewUploads();
        return res.status(400).json({ message: "Gallery image URLs must be valid http(s) URLs." });
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      
      const [eventRows] = await connection.execute(
        'SELECT id, created_by FROM events WHERE id = ?',
        [eventId]
      );
      
      if (eventRows.length === 0) {
        await connection.rollback();
        await cleanupNewUploads();
        return res.status(404).json({ message: "Event not found." });
      }
      
      const event = eventRows[0];
      if (event.created_by !== req.user.id && !req.user.isAdmin) {
        await connection.rollback();
        await cleanupNewUploads();
        return res.status(403).json({ 
          message: "Access denied. You can only manage media for your own events." 
        });
      }

      
      const eventAggregate = await fetchEventAggregate(
        connection,
        { id: eventId, lock: true },
        { includeInternal: true }
      );
      if (!eventAggregate) {
        await connection.rollback();
        await cleanupNewUploads();
        return res.status(404).json({ message: "Event not found." });
      }

      const existingGalleryPaths = eventAggregate.galleryImagePaths ?? [];
      let galleryKeepPaths = existingGalleryPaths;

      if (parsedExistingGallery) {
        const normalized = parsedExistingGallery
          .map(normalizeIncomingStoredPath)
          .filter(Boolean);
        if (normalized.length > 0) {
          galleryKeepPaths = normalized.filter((path) => existingGalleryPaths.includes(path));
        } else {
          galleryKeepPaths = [];
        }
      }

      galleryKeepPaths = galleryKeepPaths.filter(
        (path, index, array) => array.indexOf(path) === index,
      );

      const finalGalleryPaths = [];
      const appendGalleryPath = (value) => {
        if (!value) {
          return;
        }
        if (!finalGalleryPaths.includes(value)) {
          finalGalleryPaths.push(value);
        }
      };

      galleryKeepPaths.forEach(appendGalleryPath);
      galleryUrlUploads.forEach(appendGalleryPath);
      galleryUploads.forEach((upload) => appendGalleryPath(upload.storedPath));

      if (finalGalleryPaths.length > MAX_GALLERY_IMAGES) {
        await connection.rollback();
        await cleanupNewUploads();
        return res
          .status(400)
          .json({ message: `An event can have up to ${MAX_GALLERY_IMAGES} gallery images.` });
      }

      const removedGalleryPaths = existingGalleryPaths.filter(
        (path) => !galleryKeepPaths.includes(path) && !isRemotePath(path),
      );

      const existingHeroPath = eventAggregate.heroImagePath ?? null;
      let newHeroPath = existingHeroPath;
      const heroPathsToDelete = [];

      if (heroUpload) {
        newHeroPath = heroUpload.storedPath;
        if (
          existingHeroPath &&
          existingHeroPath !== newHeroPath &&
          !isRemotePath(existingHeroPath)
        ) {
          heroPathsToDelete.push(existingHeroPath);
        }
      } else if (heroImageMode === "url") {
        if (heroImageUrl) {
          newHeroPath = heroImageUrl;
          if (
            existingHeroPath &&
            existingHeroPath !== heroImageUrl &&
            !isRemotePath(existingHeroPath)
          ) {
            heroPathsToDelete.push(existingHeroPath);
          }
        } else if (removeHero && existingHeroPath) {
          if (!isRemotePath(existingHeroPath)) {
            heroPathsToDelete.push(existingHeroPath);
          }
          newHeroPath = null;
        }
      } else if (removeHero && existingHeroPath) {
        if (!isRemotePath(existingHeroPath)) {
          heroPathsToDelete.push(existingHeroPath);
        }
        newHeroPath = null;
      }

      const heroChanged = newHeroPath !== existingHeroPath;
      const galleryChanged =
        JSON.stringify(finalGalleryPaths) !== JSON.stringify(existingGalleryPaths);

      if (!heroChanged && !galleryChanged) {
        await connection.rollback();
        await cleanupNewUploads();
        const eventCopy = { ...eventAggregate };
        delete eventCopy.heroImagePath;
        delete eventCopy.galleryImagePaths;
        return res.json({ event: eventCopy });
      }

      const updates = [];
      const params = [];

      if (heroChanged) {
        updates.push("hero_image_path = ?");
        params.push(newHeroPath);
      }

      if (galleryChanged) {
        updates.push("gallery_image_paths = ?");
        params.push(JSON.stringify(finalGalleryPaths));
      }

      updates.push("updated_at = CURRENT_TIMESTAMP");

      await connection.execute(
        `UPDATE events SET ${updates.join(", ")} WHERE id = ?`,
        [...params, eventId],
      );

      const updatedEvent = await fetchEventAggregate(
        connection,
        { id: eventId, lock: true },
        { includeInternal: true },
      );

      await logEventAudit(req.user.id, eventId, "update_media", eventAggregate, updatedEvent, connection);

      await connection.commit();

      await Promise.all(heroPathsToDelete.map((storedPath) => deleteStoredFile(storedPath)));
      await Promise.all(removedGalleryPaths.map((storedPath) => deleteStoredFile(storedPath)));

      const publicEvent = {
        ...updatedEvent,
        heroImage: updatedEvent.heroImagePath
          ? normalizeStoredPath(updatedEvent.heroImagePath)
          : updatedEvent.heroImage,
        galleryImages: [
          ...(Array.isArray(updatedEvent.galleryImagePaths)
            ? updatedEvent.galleryImagePaths
                .map((entry) => normalizeStoredPath(entry))
                .filter(Boolean)
            : []),
        ],
      };
      delete publicEvent.heroImagePath;
      delete publicEvent.galleryImagePaths;

      res.json({ event: publicEvent });
    } catch (error) {
      await connection.rollback();
      await cleanupNewUploads();
      console.error("[organiser events] failed to update media", error);
      res.status(500).json({ message: "Could not update event media." });
    } finally {
      connection.release();
    }
  },
);

app.post("/api/organiser/events", requireAuth, requireOrganiser, async (req, res) => {
  const {
    title,
    summary,
    description,
    startAt,
    endAt,
    timezone,
    venueName,
    addressLine1,
    addressLine2,
    city,
    region,
    postalCode,
    countryCode,
    capacity,
    priceCents,
    currencyCode,
    status,
  } = req.body ?? {};


  const errors = {};

  
  if (typeof title !== "string" || !title.trim()) {
    errors.title = "Title is required.";
  }
  if (typeof summary !== "string" || !summary.trim()) {
    errors.summary = "Summary is required.";
  }
  if (typeof description !== "string" || !description.trim()) {
    errors.description = "Description is required.";
  }
  if (typeof startAt !== "string" || typeof endAt !== "string") {
    errors.startAt = "Start and end times are required.";
  }
  if (typeof timezone !== "string" || !timezone.trim()) {
    errors.timezone = "Timezone is required.";
  }
  if (typeof venueName !== "string" || !venueName.trim()) {
    errors.venueName = "Venue name is required.";
  }
  if (typeof addressLine1 !== "string" || !addressLine1.trim()) {
    errors.addressLine1 = "Address line 1 is required.";
  }
  if (typeof city !== "string" || !city.trim()) {
    errors.city = "City is required.";
  }
  if (typeof countryCode !== "string" || countryCode.trim().length !== 2) {
    errors.countryCode = "Country code must be a 2-letter ISO code.";
  }

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    errors.dateRange = "Start/end date range is invalid.";
  }

  const capacityValue = Number.parseInt(capacity, 10);
  if (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 100000) {
    errors.capacity = "Capacity must be between 1 and 100000.";
  }

  
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ 
      message: "Please fix the form errors.",
      errors 
    });
  }

  const statusValue =
    typeof status === "string" && EVENT_STATUSES.has(status.toLowerCase())
      ? status.toLowerCase()
      : "draft";

  const priceValue = Number.isFinite(Number(priceCents)) ? Math.max(0, Number(priceCents)) : 0;
  const currencyValue = typeof currencyCode === "string" && currencyCode.trim()
    ? currencyCode.trim().toUpperCase()
    : "USD";

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const slug = await generateUniqueSlug(connection, title);
    const publishedAt = status === "published" ? asMySqlDateTime(new Date()) : null;

    const [result] = await connection.execute(
      `
        INSERT INTO events (
          created_by,
          title,
          slug,
          summary,
          description,
          start_at,
          end_at,
          timezone,
          venue_name,
          address_line1,
          address_line2,
          city,
          region,
          postal_code,
          country_code,
          capacity,
          price_cents,
          currency_code,
          status,
          published_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,  
        title.trim(),
        slug,
        summary.trim(),
        description.trim(),
        asMySqlDateTime(new Date(startAt)),
        asMySqlDateTime(new Date(endAt)),
        timezone.trim(),
        venueName.trim(),
        addressLine1.trim(),
        addressLine2?.trim() || null,
        city.trim(),
        region?.trim() || null,
        postalCode?.trim() || null,
        countryCode.trim().toUpperCase(),
        Number(capacity),
        Math.round(Number(priceCents || 0)),
        (currencyCode?.trim().toUpperCase() || "USD"),
        status || "draft",
        publishedAt,
      ]
    );

    const eventId = result.insertId;
    const event = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true }
    );
    
    await logEventAudit(req.user.id, eventId, "create", null, event, connection);
    await connection.commit();
    
    res.status(201).json({ event });
  } catch (error) {
    await connection.rollback();
    console.error("[organiser] failed to create event", error);
    res.status(500).json({ message: "Could not create event." });
  } finally {
    connection.release();
  }
});


app.get("/api/organiser/events/:id/attendees", requireAuth, requireOrganiser, async (req, res) => {
  const eventId = Number(req.params.id);
  
  try {
    // check events belongs to current organiser
    const [eventRows] = await pool.query(
      "SELECT created_by FROM events WHERE id = ?",
      [eventId]
    );
    
    if (eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    
    if (eventRows[0].created_by !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: "You can only view attendees for your own events." });
    }

    const [rows] = await pool.query(
      `
        SELECT
          t.id,
          t.user_id AS userId,
          u.email,
          t.quantity,
          t.status,
          t.confirmation_code AS confirmationCode,
          t.reserved_at AS reservedAt,
          t.waitlisted_at AS waitlistedAt,
          t.cancelled_at AS cancelledAt
        FROM event_tickets t
        INNER JOIN users u ON u.id = t.user_id
        WHERE t.event_id = ?
        ORDER BY t.status ASC, t.reserved_at ASC
      `,
      [eventId]
    );

    const attendees = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.email,
      quantity: row.quantity,
      status: row.status,
      confirmationCode: row.confirmationCode,
      reservedAt: asIsoString(row.reservedAt),
      waitlistedAt: asIsoString(row.waitlistedAt),
      cancelledAt: asIsoString(row.cancelledAt),
    }));

    res.json({ attendees });
  } catch (error) {
    console.error("[organiser] failed to list attendees", error);
    res.status(500).json({ message: "Could not load attendees." });
  }
});

app.patch("/api/admin/events/:id", requireAuth, requireAdmin, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId < 1) {
    return res.status(400).json({ message: "Invalid event id." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const event = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true },
    );
    if (!event) {
      await connection.rollback();
      return res.status(404).json({ message: "Event not found." });
    }

    const beforeState = event;

    const updates = [];
    const params = [];

    if (typeof req.body?.title === "string" && req.body.title.trim() && req.body.title.trim() !== event.title) {
      const newSlug =
        typeof req.body.slug === "string" && req.body.slug.trim()
          ? req.body.slug.trim().toLowerCase()
          : await generateUniqueSlug(connection, req.body.title.trim(), eventId);
      updates.push("title = ?", "slug = ?");
      params.push(req.body.title.trim(), newSlug);
    } else if (typeof req.body?.slug === "string" && req.body.slug.trim()) {
      const slugCandidate = req.body.slug.trim().toLowerCase();
      const uniqueSlug = await generateUniqueSlug(connection, slugCandidate, eventId);
      updates.push("slug = ?");
      params.push(uniqueSlug);
    }

    if (typeof req.body?.summary === "string" && req.body.summary.trim()) {
      updates.push("summary = ?");
      params.push(req.body.summary.trim());
    }

    if (typeof req.body?.description === "string" && req.body.description.trim()) {
      updates.push("description = ?");
      params.push(req.body.description.trim());
    }

    if (req.body?.startAt || req.body?.endAt) {
      const newStart = req.body.startAt ? new Date(req.body.startAt) : new Date(event.startAt);
      const newEnd = req.body.endAt ? new Date(req.body.endAt) : new Date(event.endAt);
      if (
        Number.isNaN(newStart.getTime()) ||
        Number.isNaN(newEnd.getTime()) ||
        newEnd <= newStart
      ) {
        await connection.rollback();
        return res.status(400).json({ message: "Start/end date range is invalid." });
      }
      if (req.body.startAt) {
        updates.push("start_at = ?");
        params.push(asMySqlDateTime(newStart));
      }
      if (req.body.endAt) {
        updates.push("end_at = ?");
        params.push(asMySqlDateTime(newEnd));
      }
    }

    if (typeof req.body?.timezone === "string" && req.body.timezone.trim()) {
      updates.push("timezone = ?");
      params.push(req.body.timezone.trim());
    }

    if (typeof req.body?.venueName === "string" && req.body.venueName.trim()) {
      updates.push("venue_name = ?");
      params.push(req.body.venueName.trim());
    }

    if (typeof req.body?.addressLine1 === "string" && req.body.addressLine1.trim()) {
      updates.push("address_line1 = ?");
      params.push(req.body.addressLine1.trim());
    }

    if (req.body?.addressLine2 !== undefined) {
      updates.push("address_line2 = ?");
      params.push(req.body.addressLine2?.trim() || null);
    }

    if (typeof req.body?.city === "string" && req.body.city.trim()) {
      updates.push("city = ?");
      params.push(req.body.city.trim());
    }

    if (req.body?.region !== undefined) {
      updates.push("region = ?");
      params.push(req.body.region?.trim() || null);
    }

    if (req.body?.postalCode !== undefined) {
      updates.push("postal_code = ?");
      params.push(req.body.postalCode?.trim() || null);
    }

    if (typeof req.body?.countryCode === "string" && req.body.countryCode.trim()) {
      const cc = req.body.countryCode.trim();
      if (cc.length !== 2) {
        await connection.rollback();
        return res.status(400).json({ message: "Country code must be a 2-letter ISO code." });
      }
      updates.push("country_code = ?");
      params.push(cc.toUpperCase());
    }

    if (req.body?.capacity !== undefined) {
      const newCapacity = Number.parseInt(req.body.capacity, 10);
      if (!Number.isInteger(newCapacity) || newCapacity < event.totals.reserved) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Capacity cannot be lower than the number of reserved tickets." });
      }
      updates.push("capacity = ?");
      params.push(newCapacity);
    }

    if (req.body?.priceCents !== undefined) {
      const newPrice = Number(req.body.priceCents);
      if (!Number.isFinite(newPrice) || newPrice < 0) {
        await connection.rollback();
        return res.status(400).json({ message: "Price must be a positive number." });
      }
      updates.push("price_cents = ?");
      params.push(Math.round(newPrice));
    }

    if (req.body?.currencyCode !== undefined) {
      const newCurrency = String(req.body.currencyCode || "").trim();
      if (newCurrency && newCurrency.length !== 3) {
        await connection.rollback();
        return res.status(400).json({ message: "Currency code must be a 3-letter ISO code." });
      }
      updates.push("currency_code = ?");
      params.push(newCurrency ? newCurrency.toUpperCase() : event.price.currencyCode);
    }

    if (req.body?.status) {
      const nextStatus = String(req.body.status).toLowerCase();
      if (!EVENT_STATUSES.has(nextStatus)) {
        await connection.rollback();
        return res.status(400).json({ message: "Invalid status value." });
      }
      updates.push("status = ?");
      params.push(nextStatus);
      if (nextStatus === "published" && !event.publishedAt) {
        updates.push("published_at = ?");
        params.push(asMySqlDateTime(new Date()));
      }
      if (nextStatus === "draft") {
        updates.push("published_at = NULL");
      }
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "No valid fields provided for update." });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    await connection.execute(
      `
        UPDATE events
        SET ${updates.join(", ")}
        WHERE id = ?
      `,
      [...params, eventId],
    );

    const updatedEvent = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true },
    );
    await logEventAudit(req.user.id, eventId, "update", beforeState, updatedEvent, connection);

    await connection.commit();
    res.json({ event: updatedEvent });
  } catch (error) {
    await connection.rollback();
    console.error("[admin events] failed to update event", error);
    res.status(500).json({ message: "Could not update event." });
  } finally {
    connection.release();
  }
});

app.delete("/api/admin/events/:id", requireAuth, requireAdmin, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId < 1) {
    return res.status(400).json({ message: "Invalid event id." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const event = await fetchEventAggregate(
      connection,
      { id: eventId, lock: true },
      { includeInternal: true },
    );
    if (!event) {
      await connection.rollback();
      return res.status(404).json({ message: "Event not found." });
    }

    await connection.execute("DELETE FROM events WHERE id = ?", [eventId]);
    await logEventAudit(req.user.id, eventId, "delete", event, null, connection);

    await connection.commit();
    const mediaPaths = [];
    if (event.heroImagePath) {
      mediaPaths.push(event.heroImagePath);
    }
    if (Array.isArray(event.galleryImagePaths)) {
      mediaPaths.push(...event.galleryImagePaths);
    }
    await Promise.all(mediaPaths.map((storedPath) => deleteStoredFile(storedPath)));
    res.status(204).end();
  } catch (error) {
    await connection.rollback();
    console.error("[admin events] failed to delete event", error);
    res.status(500).json({ message: "Could not delete event." });
  } finally {
    connection.release();
  }
});

app.get("/api/admin/events/:id/attendees", requireAuth, requireAdmin, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId < 1) {
    return res.status(400).json({ message: "Invalid event id." });
  }

  try {
    const event = await fetchEventAggregate(
      pool,
      { id: eventId },
      { includeInternal: true },
    );
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    const [rows] = await pool.query(
      `
        SELECT
          t.id,
          t.user_id AS userId,
          u.email,
          t.quantity,
          t.status,
          t.confirmation_code AS confirmationCode,
          t.reserved_at AS reservedAt,
          t.waitlisted_at AS waitlistedAt,
          t.cancelled_at AS cancelledAt
        FROM event_tickets t
        INNER JOIN users u ON u.id = t.user_id
        WHERE t.event_id = ?
        ORDER BY t.status ASC, t.reserved_at ASC
      `,
      [eventId],
    );

    const attendees = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.email,
      quantity: row.quantity,
      status: row.status,
      confirmationCode: row.confirmationCode,
      reservedAt: asIsoString(row.reservedAt),
      waitlistedAt: asIsoString(row.waitlistedAt),
      cancelledAt: asIsoString(row.cancelledAt),
    }));

    const eventResponse = { ...event };
    delete eventResponse.heroImagePath;
    delete eventResponse.galleryImagePaths;

    res.json({ event: eventResponse, attendees });
  } catch (error) {
    console.error("[admin events] failed to list attendees", error);
    res.status(500).json({ message: "Could not load attendees." });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("[uploads] multer error", err);
    return res.status(400).json({ message: err.message });
  }

  if (err && err.message === "Only image uploads are allowed.") {
    return res.status(400).json({ message: err.message });
  }

  next(err);
});

const port = Number(process.env.PORT || process.env.APP_PORT || 4000);
app.listen(port, () => {
  console.info(`[startup] registration API listening on port ${port}`);
});
