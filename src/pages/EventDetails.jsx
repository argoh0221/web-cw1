import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./EventDetails.module.css";
import Header from "../components/Header.jsx";

function formatDate(value, options) {
  if (!value) {
    return "";
  }
  try {
    return new Date(value).toLocaleString(undefined, options);
  } catch {
    return value;
  }
}

function resolveImagePath(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  if (value.startsWith("http")) {
    return value;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

const EVENT_GALLERIES = {
  "global-startup-summit-2025": [
    "https://images.unsplash.com/photo-1518604722295-08f07c07c4ca?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80",
  ],
  "san-francisco-climate-tech-expo": [
    "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1524141068087-444e29e79e2f?auto=format&fit=crop&w=1400&q=80",
  ],
  "lisbon-web-futures-week": [
    "https://images.unsplash.com/photo-1512427691650-1d7cd20a3fa0?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1400&q=80",
  ],
  "nordic-design-weekender": [
    "https://images.unsplash.com/photo-1529429617124-aee0014819be?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8b?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80",
  ],
  "tokyo-night-market-street-eats": [
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1526481280695-3c469928b67b?auto=format&fit=crop&w=1400&q=80",
  ],
  "san-francisco-bay-sail-sound": [
    "https://images.unsplash.com/photo-1478479405421-ce83c92fbab2?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1507537406049-8fbbbe0b179c?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1545259742-2ea3ebf61fa8?auto=format&fit=crop&w=1400&q=80",
  ],
  "andes-mountain-film-festival": [
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1523419409543-0c1df022bdd7?auto=format&fit=crop&w=1400&q=80",
  ],
  "toronto-indie-game-expo": [
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1573497491208-6b1acb260507?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80",
  ],
  "mexico-city-culinary-lab-week": [
    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1533777419517-3e4017e2e15f?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1528712306091-ed0763094c98?auto=format&fit=crop&w=1400&q=80",
  ],
  "berlin-code-jam-microconf": [
    "https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1400&q=80",
  ],
  "cape-town-coastal-wellness-retreat": [
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1524499982521-1ffd58dd89ea?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=1400&q=80",
  ],
  "dubai-desert-polo-classic": [
    "https://images.unsplash.com/photo-1499744632587-37bce04ab0a3?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1496619684348-0f0603d1cd5d?auto=format&fit=crop&w=1400&q=80",
  ],
  "sydney-harbour-jazz-cruise": [
    "https://images.unsplash.com/photo-1526481280695-3c469928b67b?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80",
  ],
  "seoul-ai-music-hack": [
    "https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1573496130141-209d200cebd0?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80",
  ],
  "reykjavik-aurora-wellness-escape": [
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=80",
  ],
  "new-york-piano-recital-series": [
    "https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1454922915609-78549ad709bb?auto=format&fit=crop&w=1400&q=80",
  ],
  default: [
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=80",
  ],
};

const EVENT_EXPERIENCES = {
  "global-startup-summit-2025": [
    "Book investor matchmaking sessions with tier-one funds and accelerators.",
    "Prototype deals inside climate, health, and AI discovery tracks.",
    "Wind down with rooftop founder dinners and marina-light pitch finales.",
  ],
  "san-francisco-climate-tech-expo": [
    "Watch live demos of carbon removal hardware and gigaton pilots.",
    "Join policy labs featuring climate economists and regulators.",
    "Network during a sunset showcase curated for climate investors.",
  ],
  "lisbon-web-futures-week": [
    "Co-create inside riverside unconference pods each morning.",
    "Tour LX Factory studios and meet Lisbon founders in situ.",
    "Sail at sunset with live fado and small-group product roundtables.",
  ],
  "nordic-design-weekender": [
    "Collaborate on circular design sprints with Nordic studios.",
    "Access closed-door studio walkthroughs across Stockholm.",
    "Share hygge salons with fika, storytelling, and ambient sets.",
  ],
  "tokyo-night-market-street-eats": [
    "Sample limited-run dishes from Tokyo chefs in neon-drenched lanes.",
    "Experience vinyl DJ culture and projection art beneath lanterns.",
    "Join storytelling walks decoding Japan's street food heritage.",
  ],
  "san-francisco-bay-sail-sound": [
    "Prototype experiences in shoreline design labs before sailing.",
    "Enjoy progressive dining paired with Napa and Sonoma pours.",
    "Dance under the Golden Gate while electronic artists perform live.",
  ],
  "andes-mountain-film-festival": [
    "See expedition premieres projected across Cusco's plazas.",
    "Sharpen cinematography chops in sunrise masterclasses.",
    "Swap stories with climbers beside nightly fireside performances.",
  ],
  "toronto-indie-game-expo": [
    "Play-test unreleased titles and share feedback in real time.",
    "Catch art jams, soundtrack sessions, and live speedruns.",
    "Pitch publishers in rapid-fire funding rounds tailored to indies.",
  ],
  "mexico-city-culinary-lab-week": [
    "Cook with Michelin guest chefs and fermentation scientists.",
    "Explore markets and nixtamal workshops in Roma Norte.",
    "Sip curated agave flights atop rooftops scored by vinyl mariachi.",
  ],
  "berlin-code-jam-microconf": [
    "Hack alongside European makers across 36 continuous build hours.",
    "Drop into mentor salons on pricing, growth, and product strategy.",
    "Ship code live while VJs remix commits into reactive visuals.",
  ],
  "cape-town-coastal-wellness-retreat": [
    "Catch sunrise waves with pro surf coaches in False Bay.",
    "Reset in geodesic breathwork domes and chef-led nutrition labs.",
    "End the day with drum circles, tide-pool meditations, and stargazing.",
  ],
  "dubai-desert-polo-classic": [
    "Float above the dunes at dawn in hot-air balloons.",
    "Watch lantern-lit polo finals followed by drone light shows.",
    "Dine on Bedouin tasting menus crafted by celebrated desert chefs.",
  ],
  "sydney-harbour-jazz-cruise": [
    "Cruise past the Opera House as big bands rotate on stage.",
    "Sip botanical spritzes from the sky lounge mixology bar.",
    "Capture skyline portraits with an onboard professional photographer.",
  ],
  "seoul-ai-music-hack": [
    "Prototype generative instruments with curated ML datasets.",
    "Collaborate with K-pop producers and holographic stage designers.",
    "Debut AI-powered tracks during the closing immersive showcase.",
  ],
  "reykjavik-aurora-wellness-escape": [
    "Hike glaciers and soak in geothermal spas with local guides.",
    "Practice Viking breathwork and mindful cold plunges overlooking lagoons.",
    "Learn aurora photography before shooting the northern lights at midnight.",
  ],
  "new-york-piano-recital-series": [
    "Savour a pre-concert champagne reception in Carnegie Hall's salon.",
    "Experience modern takes on classical repertoire in an intimate hall.",
    "Meet the pianists during post-show salons with vinyl listening and art.",
  ],
  default: [
    "Join immersive workshops led by local creators and industry experts.",
    "Experience live entertainment paired with regional food and drink.",
    "Connect with a global community through curated networking lounges.",
  ],
};

export default function EventDetails() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const eventId = event?.id ?? null;

  const loadTicket = useCallback(
    async (targetEventId) => {
      if (!user) {
        setTicket(null);
        return;
      }

      try {
        const response = await fetch("/api/me/tickets", {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        const match = payload.tickets?.find((entry) => entry.eventId === targetEventId) ?? null;
        setTicket(match);
        if (match?.quantity) {
          setQuantity(match.quantity);
        }
      } catch (ticketError) {
        console.error("[event] failed to load existing reservation", ticketError);
      }
    },
    [user],
  );

  const loadEvent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${slug}`, {
        method: "GET",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Event not found.");
      }
      setEvent(payload.event);
      await loadTicket(payload.event.id);
    } catch (loadError) {
      console.error("[event] failed to load detail", loadError);
      setError(loadError.message || "Unable to load event.");
    } finally {
      setLoading(false);
    }
  }, [slug, loadTicket]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    if (eventId) {
      loadTicket(eventId);
    }
  }, [user, eventId, loadTicket]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [event?.id]);

  const availabilityLabel = useMemo(() => {
    if (!event) {
      return "";
    }
    if (event.availability.remaining === 0) {
      return "Currently full — join the waitlist";
    }
    return `${event.availability.remaining} seats left`;
  }, [event]);

  const descriptionParagraphs = useMemo(() => {
    if (!event?.description) {
      return [];
    }
    return event.description.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  }, [event]);

  const galleryKey = event?.slug ?? slug;
  const fallbackGallery = useMemo(
    () => EVENT_GALLERIES[galleryKey] ?? EVENT_GALLERIES.default,
    [galleryKey],
  );
  const galleryImages = useMemo(() => {
    const images = [];
    const seen = new Set();

    const addImage = (value) => {
      const resolved = resolveImagePath(value);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        images.push(resolved);
      }
    };

    if (event) {
      addImage(event.heroImage);
      if (Array.isArray(event.galleryImages)) {
        event.galleryImages.forEach((entry) => addImage(entry));
      }
    }

    if (images.length === 0) {
      fallbackGallery.forEach((entry) => addImage(entry));
    }

    return images;
  }, [event, fallbackGallery]);
  const experiences = EVENT_EXPERIENCES[galleryKey] ?? EVENT_EXPERIENCES.default;
  const hasMultipleImages = galleryImages.length > 1;

  useEffect(() => {
    if (activeImageIndex >= galleryImages.length) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, galleryImages.length]);

  async function handleReserve() {
    if (!event) {
      return;
    }

    if (!user) {
      navigate("/login", { state: { from: `/events/${event.slug}` } });
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${event.id}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ quantity }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Could not reserve tickets.");
      }
      setTicket(payload.ticket);
      setEvent(payload.event);
    } catch (reserveError) {
      console.error("[event] failed to reserve tickets", reserveError);
      setError(reserveError.message || "Could not reserve tickets.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!event) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${event.id}/tickets`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok && response.status !== 404) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Could not cancel reservation.");
      }

      setTicket(null);
      await loadEvent();
    } catch (cancelError) {
      console.error("[event] failed to cancel reservation", cancelError);
      setError(cancelError.message || "Could not cancel reservation.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>Loading event…</div>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className={styles.page}>
        <div className={styles.centerError}>{error}</div>
      </div>
    );
  }

  if (!event) {
    return null;
  }

  const isReserved = ticket?.status === "reserved";
  const isWaitlisted = ticket?.status === "waitlisted";

  const showPrevImage = () => {
    setActiveImageIndex((current) =>
      current === 0 ? galleryImages.length - 1 : current - 1,
    );
  };

  const showNextImage = () => {
    setActiveImageIndex((current) =>
      current === galleryImages.length - 1 ? 0 : current + 1,
    );
  };

  return (
    <div className={styles.page}>
      <Header/>

      <div className={styles.contentPage}>
        
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate("/events", { replace: true })}
      >
        ← Back to events
      </button>

      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{event.venue.city}</p>
          <h1 className={styles.title}>{event.title}</h1>
          <p className={styles.subtitle}>{event.summary}</p>
        </div>

      </header>

      {error && (
        <div role="alert" className={styles.errorBanner}>
          {error}
        </div>
      )}

      <section className={styles.contentBookingWrap}>

      <section className={styles.gallerySection}>
        <div className={styles.galleryViewport}>
          <img
            src={galleryImages[activeImageIndex]}
            alt={`${event.title} preview ${activeImageIndex + 1}`}
            className={styles.galleryImage}
            loading="lazy"
          />
          {hasMultipleImages && (
            <div className={styles.galleryNav}>
              <button type="button" onClick={showPrevImage} aria-label="Previous photo">
                ‹
              </button>
              <button type="button" onClick={showNextImage} aria-label="Next photo">
                ›
              </button>
            </div>
          )}
        </div>
        {hasMultipleImages && (
          <div className={styles.galleryThumbs}>
            {galleryImages.map((image, index) => (
              <button
                type="button"
                key={image}
                className={`${styles.galleryThumb} ${
                  index === activeImageIndex ? styles.galleryThumbActive : ""
                }`}
                onClick={() => setActiveImageIndex(index)}
                aria-label={`View photo ${index + 1}`}
              >
                <img src={image} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        
      </section>

      

      <section className={styles.totalWrap}>

      
      <section className={styles.bookingWrap}>
        <div className={styles.content}>
        

        <article className={styles.description}>
          <h2>About this event</h2>
          {descriptionParagraphs.length > 0 ? (
            descriptionParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)
          ) : (
            <p>{event.description}</p>
          )}
        </article>

        <div className={styles.heroMeta}>
          <div>
            <span>Starts</span>
            <strong>{formatDate(event.startAt, { dateStyle: "full", timeStyle: "short" })}</strong>
          </div>
          <div>
            <span>Ends</span>
            <strong>{formatDate(event.endAt, { dateStyle: "full", timeStyle: "short" })}</strong>
          </div>
          <div>
            <span>Venue</span>
            <strong>{event.venue.name}</strong>
          </div>
          <div>
            <span>Location</span>
            <strong>
              {event.venue.addressLine1}
              {event.venue.addressLine2 ? `, ${event.venue.addressLine2}` : ""}, {event.venue.city},{" "}
              {event.venue.countryCode}
            </strong>
          </div>
          </div>

        
      </div>
      <section className={styles.experiences}>
        <h2>What you will experience</h2>
        <ul className={styles.experienceList}>
          {experiences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

        
      </section>
      

      <aside className={styles.sidebar}>
          <div className={styles.card}>
            <h2>Tickets</h2>
            <p className={styles.availability}>{availabilityLabel}</p>

            {ticket && (
              <div className={styles.ticketStatus}>
                <h4>
                  You have <strong>{ticket.quantity}</strong> seat
                  {ticket.quantity > 1 ? "s" : ""} reserved.
                </h4>
                <p className={styles.ticketTag}>
                  Status:{" "}
                  <span
                    className={
                      isReserved
                        ? styles.statusReserved
                        : isWaitlisted
                          ? styles.statusWaitlisted
                          : styles.statusCancelled
                    }
                  >
                    {ticket.status}
                  </span>
                </p>
                {ticket.confirmationCode && (
                  <div>
                  <p> Confirmation code:</p>
                  <p className={styles.code}>
                     <code>{ticket.confirmationCode}</code>
                  </p>
                  </div>
                )}
              </div>
            )}

            <label className={styles.quantityField}>
              <span>Quantity(maxmum:10)</span>
              <input
                type="number"
                min="1"
                max="10"
                value={quantity}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setQuantity(Number.isNaN(value) ? 1 : value);
                }}
                disabled={saving}
              />
            </label>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleReserve}
                disabled={saving}
              >
                {saving ? "Saving…" : isReserved ? "Update reservation" : "Reserve seats"}
              </button>
              {ticket && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel reservation
                </button>
              )}
            </div>

           
          </div>
        </aside>

        </section>

      </section>

      
    </div>
    </div>
  );
}
