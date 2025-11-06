import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./MyTickets.module.css";

function formatDate(value) {
  if (!value) {
    return "TBC";
  }
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export default function MyTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/me/tickets", {
        method: "GET",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Unable to load tickets.");
      }
      setTickets(payload.tickets ?? []);
    } catch (loadError) {
      console.error("[tickets] failed to load user tickets", loadError);
      setError(loadError.message || "Unable to load tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  async function handleCancel(ticket) {
    if (!window.confirm("Cancel this reservation?")) {
      return;
    }
    setPendingId(ticket.id);
    setError("");
    try {
      const response = await fetch(`/api/events/${ticket.eventId}/tickets`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok && response.status !== 404) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Unable to cancel reservation.");
      }
      await loadTickets();
    } catch (cancelError) {
      console.error("[tickets] failed to cancel reservation", cancelError);
      setError(cancelError.message || "Unable to cancel reservation.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>My tickets</h1>
          <p className={styles.subtitle}>Manage reservations and access attendee details.</p>
        </div>
        <button type="button" className={styles.browse} onClick={() => navigate("/events")}>
          Browse more events
        </button>
      </header>

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading your tickets…</div>
      ) : tickets.length === 0 ? (
        <div className={styles.empty}>
          <h2>No bookings yet.</h2>
          <p>Browse events and reserve your seat to see them here.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {tickets.map((ticket) => {
            const isActive = ticket.status === "reserved" || ticket.status === "waitlisted";
            return (
              <li key={ticket.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <div>
                    <h2>{ticket.event.title}</h2>
                    <p className={styles.meta}>
                      {formatDate(ticket.event.startAt)} · {ticket.event.city},{" "}
                      {ticket.event.countryCode}
                    </p>
                  </div>
                  <span
                    className={
                      ticket.status === "reserved"
                        ? styles.statusReserved
                        : ticket.status === "waitlisted"
                        ? styles.statusWaitlisted
                        : styles.statusCancelled
                    }
                  >
                    {ticket.status}
                  </span>
                </div>
                <div className={styles.itemBody}>
                  <div>
                    <p>
                      Quantity: <strong>{ticket.quantity}</strong>
                    </p>
                    {ticket.confirmationCode && (
                      <p>
                        Confirmation: <code>{ticket.confirmationCode}</code>
                      </p>
                    )}
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => navigate(`/events/${ticket.event.slug}`)}
                    >
                      View event
                    </button>
                    {isActive && (
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={() => handleCancel(ticket)}
                        disabled={pendingId === ticket.id}
                      >
                        {pendingId === ticket.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
