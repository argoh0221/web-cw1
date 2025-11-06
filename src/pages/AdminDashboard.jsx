import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./AdminDashboard.module.css";

function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(() => new Set());

  const updatePending = useCallback((id, shouldAdd) => {
    setPending((prev) => {
      const updated = new Set(prev);
      if (shouldAdd) {
        updated.add(id);
      } else {
        updated.delete(id);
      }
      return updated;
    });
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "GET",
        credentials: "include",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Unable to load users.");
      }

      setUsers(payload.users ?? []);
    } catch (loadError) {
      console.error("[admin] failed to fetch users", loadError);
      setError(loadError.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleToggleAdmin(targetUser) {
    if (!window.confirm(`Toggle admin for ${targetUser.email}?`)) {
      return;
    }

    updatePending(targetUser.id, true);

    try {
      const response = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ isAdmin: !targetUser.isAdmin }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Unable to update user.");
      }

      setUsers((current) =>
        current.map((userRecord) =>
          userRecord.id === targetUser.id ? payload.user : userRecord,
        ),
      );
    } catch (toggleError) {
      console.error("[admin] failed to update user", toggleError);
      setError(toggleError.message || "Unable to update user.");
    } finally {
      updatePending(targetUser.id, false);
    }
  }

  async function handleDeleteUser(targetUser) {
    if (!window.confirm(`Delete account ${targetUser.email}? This cannot be undone.`)) {
      return;
    }

    updatePending(targetUser.id, true);

    try {
      const response = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to delete user.");
      }

      setUsers((current) => current.filter((userRecord) => userRecord.id !== targetUser.id));
    } catch (deleteError) {
      console.error("[admin] failed to delete user", deleteError);
      setError(deleteError.message || "Unable to delete user.");
    } finally {
      updatePending(targetUser.id, false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>
            Signed in as <span className={styles.emphasis}>{user?.email}</span>
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.homeButton}
            onClick={() => navigate("/")}
          >
            Main page
          </button>
          <button
            className={styles.manageEventsButton}
            onClick={() => navigate("/admin/events")}
            type="button"
          >
            Manage events
          </button>
          <button className={styles.refreshButton} onClick={loadUsers} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className={styles.logoutButton} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className={styles.errorBanner}>
          {error}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading users…</div>
      ) : (
        <div className={styles.tableContainer}>
          {users.length === 0 ? (
            <p className={styles.emptyMessage}>No registered users found.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th className={styles.actionsHeader}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((userRecord) => {
                  const disabled = pending.has(userRecord.id) || userRecord.id === user?.id;
                  return (
                    <tr key={userRecord.id}>
                      <td>{userRecord.id}</td>
                      <td>{userRecord.email}</td>
                      <td>
                        <span
                          className={
                            userRecord.isAdmin ? styles.badgeAdmin : styles.badgeStandard
                          }
                        >
                          {userRecord.isAdmin ? "Admin" : "User"}
                        </span>
                      </td>
                      <td>{new Date(userRecord.createdAt).toLocaleString()}</td>
                      <td className={styles.rowActions}>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => handleToggleAdmin(userRecord)}
                          disabled={disabled}
                        >
                          {userRecord.isAdmin ? "Remove admin" : "Make admin"}
                        </button>
                        <button
                          className={styles.dangerButton}
                          type="button"
                          onClick={() => handleDeleteUser(userRecord)}
                          disabled={disabled}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
