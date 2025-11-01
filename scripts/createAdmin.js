/* eslint-env node */

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

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

async function ensureSchema(connection) {
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
}

function parseArguments() {
  const args = process.argv.slice(2);
  let email = process.env.ADMIN_EMAIL || "";
  let password = process.env.ADMIN_PASSWORD || "";

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--email" && typeof args[index + 1] === "string") {
      email = args[index + 1];
      index += 1;
    } else if (current === "--password" && typeof args[index + 1] === "string") {
      password = args[index + 1];
      index += 1;
    }
  }

  if (!email) {
    console.error("[seed] admin email must be provided via --email or ADMIN_EMAIL");
    process.exit(1);
  }

  if (!password) {
    console.error("[seed] admin password must be provided via --password or ADMIN_PASSWORD");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("[seed] admin password must be at least 8 characters long");
    process.exit(1);
  }

  return { email: email.trim().toLowerCase(), password };
}

async function main() {
  const { email, password } = parseArguments();

  const pool = mysql.createPool({
    ...getDatabaseConfig(),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  const connection = await pool.getConnection();
  try {
    await ensureSchema(connection);

    const passwordHash = await bcrypt.hash(password, 12);
    const [existingRows] = await connection.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    if (existingRows.length > 0) {
      const userId = existingRows[0].id;
      await connection.execute(
        "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
        [passwordHash, userId],
      );
      console.info(`[seed] updated admin user ${email} (id=${userId})`);
    } else {
      const [result] = await connection.execute(
        "INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, 1)",
        [email, passwordHash],
      );
      console.info(`[seed] created admin user ${email} (id=${result.insertId})`);
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[seed] failed to create admin user", error);
  process.exit(1);
});
