/* eslint-env node */

import express from "express";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

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

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  console.error("[startup] JWT_SECRET environment variable must be set");
  process.exit(1);
}

const tokenCookieName = "session";
const tokenMaxAgeMs = 1000 * 60 * 60 * 6; // 6 hours

async function ensureSchema() {
  const ddlUsers = `
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
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
    await connection.query(ddlActions);
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
        SELECT id, email, is_admin AS isAdmin, created_at AS createdAt
        FROM users
        ORDER BY created_at DESC
      `,
    );

    res.json({
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        isAdmin: Boolean(row.isAdmin),
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    console.error("[admin] failed to list users", error);
    res.status(500).json({ message: "Could not load users." });
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

const port = Number(process.env.PORT || process.env.APP_PORT || 4000);
app.listen(port, () => {
  console.info(`[startup] registration API listening on port ${port}`);
});
