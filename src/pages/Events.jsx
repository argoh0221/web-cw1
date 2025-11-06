import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Events.module.css";
import COUNTRIES from "../data/countries.js";

function formatDate(value) {
  if (!value) {
    return "Date TBC";
  }

  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatPrice(amountCents, currencyCode = "USD") {
  const amount = Number(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Free";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `${currencyCode} ${(amount / 100).toFixed(0)}`;
  }
}

const QUICK_FILTERS = ["Music", "Wellness", "Tech", "Food", "Design"];

function normaliseCountryInput(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function resolveCountryCode(value) {
  const trimmed = normaliseCountryInput(value);
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  const exactMatch = COUNTRIES.find((country) => country.name.toLowerCase() === lower);
  if (exactMatch) {
    return exactMatch.code;
  }

  const startsWithMatch = COUNTRIES.find((country) => country.name.toLowerCase().startsWith(lower));
  if (startsWithMatch) {
    return startsWithMatch.code;
  }

  if (trimmed.length === 2) {
    const codeMatch = COUNTRIES.find((country) => country.code.toLowerCase() === lower);
    if (codeMatch) {
      return codeMatch.code;
    }
    return trimmed.toUpperCase();
  }

  return "";
}

function resolveCountryName(code) {
  if (!code) {
    return "";
  }
  const match = COUNTRIES.find((country) => country.code === code.toUpperCase());
  return match ? match.name : code;
}

const FALLBACK_EVENT_IMAGES = [
  "https://images.unsplash.com/photo-1506157786151-b8491531f063?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1530023367847-a683933f4177?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1525182008055-f88b95ff7980?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512427691650-1d7cd20a3fa0?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1492724441997-5dc865305da7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1515169067865-5387ec356754?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1497493292307-31c376b6e479?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
];

function resolveImagePath(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  if (value.startsWith("http")) {
    return value;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function getFallbackImage(event) {
  if (!event) {
    return FALLBACK_EVENT_IMAGES[0];
  }
  const key = event.slug || event.title || event.id || "";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(index);
    hash |= 0;
  }
  const normalized = Math.abs(hash);
  return FALLBACK_EVENT_IMAGES[normalized % FALLBACK_EVENT_IMAGES.length];
}

function getHeroImage(event) {
  if (!event) {
    return getFallbackImage(event);
  }

  const hero = resolveImagePath(event.heroImage);
  if (hero) {
    return hero;
  }

  if (Array.isArray(event.galleryImages)) {
    const [firstGallery] = event.galleryImages;
    if (firstGallery) {
      const resolved = resolveImagePath(firstGallery);
      if (resolved) {
        return resolved;
      }
    }
  }

  return getFallbackImage(event);
}

export default function EventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [sortOrder, setSortOrder] = useState("upcoming");

  const hasFilters = useMemo(
    () => Boolean(query.trim() || city.trim() || countryInput.trim()),
    [query, city, countryInput],
  );

  const fetchEvents = useCallback(
    async (overrides = {}) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        const nextQuery = overrides.query ?? query;
        const nextCity = overrides.city ?? city;
        const nextCountry = overrides.country ?? country;

        if (nextQuery.trim()) {
          params.set("q", nextQuery.trim());
        }
        if (nextCity.trim()) {
          params.set("city", nextCity.trim());
        }
        if (nextCountry.trim()) {
          params.set("country", nextCountry.trim());
        }

        params.set("limit", "200");

        const queryString = params.toString();
        const response = await fetch(`/api/events${queryString ? `?${queryString}` : ""}`, {
          method: "GET",
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load events.");
        }

        setEvents(payload.events ?? []);
      } catch (loadError) {
        console.error("[events] failed to load list", loadError);
        setError(loadError.message || "Unable to load events.");
      } finally {
        setLoading(false);
      }
    },
    [query, city, country],
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function handleSubmit(event) {
    event.preventDefault();
    fetchEvents({ query, city, country });
  }

  function handleReset() {
    setQuery("");
    setCity("");
    setCountry("");
    setCountryInput("");
    fetchEvents({ query: "", city: "", country: "" });
  }

  function handleQuickFilter(term) {
    setQuery(term);
    fetchEvents({ query: term, city, country });
  }

  function handleCountryChange(value) {
    setCountryInput(value);
    const resolvedCode = resolveCountryCode(value);
    setCountry(resolvedCode);
  }

  const sortedEvents = useMemo(() => {
    const cloned = [...events];
    cloned.sort((a, b) => {
      const first = new Date(a.startAt).getTime();
      const second = new Date(b.startAt).getTime();
      if (Number.isNaN(first) || Number.isNaN(second)) {
        return 0;
      }
      return sortOrder === "upcoming" ? first - second : second - first;
    });
    return cloned;
  }, [events, sortOrder]);

  const insights = useMemo(() => {
    if (sortedEvents.length === 0) {
      return {
        totalEvents: 0,
        totalCities: 0,
        seatsRemaining: 0,
      };
    }

    const citySet = new Set(sortedEvents.map((entry) => entry.venue.city));
    const seats = sortedEvents.reduce(
      (acc, entry) => acc + Math.max(0, entry.availability.remaining),
      0,
    );

    return {
      totalEvents: sortedEvents.length,
      totalCities: citySet.size,
      seatsRemaining: seats,
    };
  }, [sortedEvents]);

  const formatNumber = (value) => {
    if (typeof value === "number") {
      return value.toLocaleString();
    }
    return value;
  };

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate("/", { replace: true })}
      >
        ← Back to home
      </button>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}>Global Calendar</p>
          <h1>Discover events without borders</h1>
          <p>
            Curated festivals, summits, and intimate experiences from every corner of the world.
            Filter by destination, follow your interests, and secure your seat in seconds.
          </p>
        </div>
        <dl className={styles.heroStats}>
          <div>
            <dt>Live events</dt>
            <dd>{formatNumber(insights.totalEvents)}</dd>
          </div>
          <div>
            <dt>Cities</dt>
            <dd>{formatNumber(insights.totalCities)}</dd>
          </div>
          <div>
            <dt>Seats open</dt>
            <dd>{formatNumber(insights.seatsRemaining)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.controls}>
        <form className={styles.filters} onSubmit={handleSubmit}>
          <div className={styles.filterRow}>
            <label className={styles.field}>
              <span>Search</span>
              <input
                type="text"
                placeholder="Pick a keyword, artist, or venue"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>City</span>
              <input
                type="text"
                placeholder="Any city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Country</span>
              <input
                type="text"
                placeholder="Any country"
                value={countryInput}
                onChange={(event) => handleCountryChange(event.target.value)}
                list="event-country-options"
                autoComplete="off"
              />
            </label>
            <label className={styles.field}>
              <span>Sort</span>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                <option value="upcoming">Soonest first</option>
                <option value="recent">Newest announcements</option>
              </select>
            </label>
          </div>
          <div className={styles.filterActions}>
            <div className={styles.quickFilters}>
              <span>Trending:</span>
              {QUICK_FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter}
                  onClick={() => handleQuickFilter(filter)}
                  className={styles.quickFilterButton}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className={styles.filterButtons}>
              <button type="submit" className={styles.primaryButton} disabled={loading}>
                {loading ? "Searching…" : "Apply filters"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleReset}
                disabled={loading || !hasFilters}
              >
                Reset
              </button>
            </div>
          </div>
        </form>
        <datalist id="event-country-options">
          {COUNTRIES.map((countryOption) => (
            <option key={countryOption.code} value={countryOption.name}>
              {countryOption.name} ({countryOption.code})
            </option>
          ))}
        </datalist>
      </section>

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading the latest line-up…</div>
      ) : sortedEvents.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No events match your filters just yet.</h2>
          <p>Try a different city or keyword, or check back soon for new drops.</p>
        </div>
      ) : (
        <section className={styles.grid} aria-label="Event results">
          {sortedEvents.map((eventItem) => {
            const priceLabel = formatPrice(
              eventItem.price?.amountCents,
              eventItem.price?.currencyCode,
            );
            const remaining = eventItem.availability.remaining;
            const capacity = eventItem.capacity || 0;
            const progress =
              capacity > 0 ? Math.min(100, Math.round(((capacity - remaining) / capacity) * 100)) : 0;
            const imageSrc = getHeroImage(eventItem);
            const locationLabel = [
              eventItem.venue.city,
              resolveCountryName(eventItem.venue.countryCode),
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <article className={styles.card} key={eventItem.id}>
                <header className={styles.cardHeader}>
                  <span className={styles.cardBadge}>{eventItem.venue.city}</span>
                  <span className={`${styles.status} ${styles[`status-${eventItem.status}`]}`}>
                    {eventItem.status}
                  </span>
                </header>

                <figure className={styles.cardMedia}>
                  <img src={imageSrc} alt={`${eventItem.title} promotional imagery`} loading="lazy" />
                </figure>

                <div className={styles.cardBody}>
                  <div className={styles.cardMeta}>
                    <p className={styles.cardDate}>{formatDate(eventItem.startAt)}</p>
                    <h2>{eventItem.title}</h2>
                    <p className={styles.cardSummary}>{eventItem.summary}</p>
                  </div>

                  <dl className={styles.cardDetails}>
                    <div>
                      <dt>Venue</dt>
                      <dd>{eventItem.venue.name}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{locationLabel || "Worldwide"}</dd>
                    </div>
                    <div>
                      <dt>Pricing</dt>
                      <dd>{priceLabel}</dd>
                    </div>
                  </dl>
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.capacity}>
                    <div className={styles.capacityBar}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <p>
                      {remaining} seats left · {capacity} total
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.viewButton}
                    onClick={() => navigate(`/events/${eventItem.slug}`)}
                  >
                    View details
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
