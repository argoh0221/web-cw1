import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./HomePage.module.css";

const FALLBACK_FEATURED_EVENTS = [
  {
    title: "City Lights Food & Music Festival",
    date: "Sat, 12 Apr · 4:00 PM",
    location: "United Kingdom",
    description: "Taste global flavours, enjoy live performances, and explore artisan pop-ups.",
    category: "Festival",
    image:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1600&q=80",
  },
  {
    title: "StartUp Spark: Founders Night",
    date: "Thu, 24 Apr · 6:30 PM",
    location: "United Kingdom",
    description:
      "Hear from breakout founders, pitch your ideas, and grow your network over craft drinks.",
    category: "Business",
    image:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80",
  },
  {
    title: "Sunrise Yoga + Wellness Retreat",
    date: "Sun, 04 May · 7:00 AM",
    location: "United Kingdom",
    description:
      "Breathe, stretch, and reset with an immersive yoga flow followed by mindful brunch.",
    category: "Wellness",
    image:
      "https://images.unsplash.com/photo-1524499982521-1ffd58dd89ea?auto=format&fit=crop&w=1600&q=80",
  },
];

const MAX_FEATURED_EVENTS = 7;
const FALLBACK_IMAGES = FALLBACK_FEATURED_EVENTS.map((event) => event.image);
const regionDisplayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(undefined, { type: "region" })
    : null;

function shuffleArray(input) {
  const array = [...input];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }
  return array;
}

function formatFeaturedDateRange(startIso, endIso) {
  if (!startIso) {
    return "Date TBA";
  }

  try {
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : null;
    const startFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const endFormatter = end
      ? new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

    const startLabel = startFormatter.format(start);
    if (endFormatter && !Number.isNaN(end.getTime())) {
      return `${startLabel} • ${endFormatter.format(end)}`;
    }
    return startLabel;
  } catch {
    return "Date TBA";
  }
}

function resolveFeaturedImage(heroImage, galleryImages, index) {
  if (heroImage) {
    return heroImage;
  }
  if (Array.isArray(galleryImages) && galleryImages.length > 0) {
    return galleryImages[0];
  }
  return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

function toCountryLabel(countryCode) {
  if (!countryCode || typeof countryCode !== "string") {
    return null;
  }
  const trimmed = countryCode.trim().toUpperCase();
  if (trimmed.length !== 2) {
    return trimmed;
  }
  try {
    if (regionDisplayNames) {
      return regionDisplayNames.of(trimmed) ?? trimmed;
    }
  } catch (error) {
    console.error("[home featured] failed to resolve country name", error);
  }
  return trimmed;
}

const EVENT_CATEGORIES = [
  { name: "Concerts", blurb: "Live gigs, arena tours & intimate sessions." },
  { name: "Workshops", blurb: "Learn, build, and create side-by-side." },
  { name: "Sports", blurb: "Match days, outdoor challenges, and more." },
  { name: "Festivals", blurb: "Celebrate food, art, film, and culture." },
  { name: "Tech & Business", blurb: "Talks, hackathons, and networking nights." },
  { name: "Wellness", blurb: "Retreats, yoga pop-ups, and mindful meetups." },
];

const TESTIMONIALS = [
  {
    quote:
      "Booked three events this month alone. Smooth checkout, instant tickets, and handy reminders.",
    name: "Riya Patel",
    title: "Music Enthusiast",
  },
  {
    quote:
      "Our venue sold out within days. The organiser tools make launching and tracking events easy.",
    name: "James Turner",
    title: "Event Host",
  },
  {
    quote:
      "I follow my favourite fitness coaches and never miss a session. The waitlist feature is clutch.",
    name: "Amelia Grant",
    title: "Community Member",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout, authenticating } = useAuth();

  const categoriesSectionRef = useRef(null);
  const featuredSectionRef = useRef(null);
  const adminSectionRef = useRef(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredEvents, setFeaturedEvents] = useState(() =>
    FALLBACK_FEATURED_EVENTS.slice(0, MAX_FEATURED_EVENTS),
  );

  const isAdmin = user?.isAdmin ?? false;

  const quickStats = useMemo(
    () => [
      { value: "4,500+", label: "Events hosted nationwide" },
      { value: "320K", label: "Tickets booked last month" },
      { value: "4.9★", label: "Average attendee rating" },
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchFeaturedEvents() {
      try {
        const response = await fetch("/api/events");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load featured events.");
        }

        const events = (payload.events ?? []).filter((event) => event.status === "published");
        if (events.length === 0) {
          if (!cancelled) {
            setFeaturedEvents(FALLBACK_FEATURED_EVENTS.slice(0, MAX_FEATURED_EVENTS));
            setFeaturedIndex(0);
          }
          return;
        }

        const adapted = events
          .filter((event) => event.slug)
          .map((event, index) => {
            const description = event.summary || event.description || "Discover something special this week.";
            const countryName =
              toCountryLabel(event.venue?.countryCode) || toCountryLabel(event.countryCode);
            const locationLabel = countryName || event.timezone || "Online";
            return {
              id: event.id,
              slug: event.slug,
              title: event.title,
              category: event.venue?.name || "Featured",
              date: formatFeaturedDateRange(event.startAt, event.endAt),
              location: locationLabel,
              description,
              image: resolveFeaturedImage(event.heroImage, event.galleryImages, index),
            };
          });

        if (adapted.length === 0) {
          if (!cancelled) {
            setFeaturedEvents(FALLBACK_FEATURED_EVENTS.slice(0, MAX_FEATURED_EVENTS));
            setFeaturedIndex(0);
          }
          return;
        }

        const selected = shuffleArray(adapted).slice(0, MAX_FEATURED_EVENTS);
        if (!cancelled && selected.length > 0) {
          setFeaturedEvents(selected);
          setFeaturedIndex(0);
        }
      } catch (error) {
        console.error("[home featured] failed to load events", error);
        if (!cancelled) {
          setFeaturedEvents(FALLBACK_FEATURED_EVENTS.slice(0, MAX_FEATURED_EVENTS));
          setFeaturedIndex(0);
        }
      }
    }

    fetchFeaturedEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (featuredEvents.length <= 1) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % featuredEvents.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [featuredEvents.length]);

  useEffect(() => {
    if (featuredIndex >= featuredEvents.length) {
      setFeaturedIndex(0);
    }
  }, [featuredEvents.length, featuredIndex]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function navigateAdmin() {
    if (isAdmin) {
      navigate("/admin");
    } else {
      navigate("/admin/login");
    }
  }

  function scrollToRef(ref) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showPrevFeatured() {
    if (featuredEvents.length <= 1) {
      return;
    }
    setFeaturedIndex((prev) => (prev === 0 ? featuredEvents.length - 1 : prev - 1));
  }

  function showNextFeatured() {
    if (featuredEvents.length <= 1) {
      return;
    }
    setFeaturedIndex((prev) => (prev + 1) % featuredEvents.length);
  }

  function selectFeatured(index) {
    if (index < 0 || index >= featuredEvents.length) {
      return;
    }
    setFeaturedIndex(index);
  }

  const handleViewEvent = useCallback(
    (slug) => {
      if (slug) {
        navigate(`/events/${slug}`);
      } else {
        navigate("/events");
      }
    },
    [navigate],
  );

  return (
    <div className={styles.page}>
      <header className={styles.navbar}>
        <button
          type="button"
          className={styles.brand}
          aria-label="Go to home"
          onClick={() => navigate("/")}
        >
          Event<span className={styles.brandAccent}>Sphere</span>
        </button>

        <nav className={styles.navLinks} aria-label="Main navigation">
          <button type="button" className={styles.navLink} onClick={() => navigate("/events")}>
            Events
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => scrollToRef(featuredSectionRef)}
          >
            Featured
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={() => scrollToRef(adminSectionRef)}
          >
            Organisers
          </button>
        </nav>

        <div className={styles.navActions}>
          {user ? (
            <>
              <span className={styles.navUser}>{user.email}</span>
              {isAdmin && (
                <button
                  type="button"
                  className={`${styles.navButton} ${styles.navGhost}`}
                  onClick={() => navigate("/admin")}
                >
                  Admin
                </button>
              )}
              <button
                type="button"
                className={`${styles.navButton} ${styles.navGhost}`}
                onClick={() => navigate("/my-tickets")}
              >
                My tickets
              </button>
              <button
                type="button"
                className={`${styles.navButton} ${styles.navPrimary}`}
                onClick={handleLogout}
                disabled={authenticating}
              >
                {authenticating ? "Signing out…" : "Log out"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`${styles.navButton} ${styles.navGhost}`}
                onClick={() => navigate("/login")}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`${styles.navButton} ${styles.navPrimary}`}
                onClick={() => navigate("/signup")}
              >
                Create Account
              </button>
            </>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>Browse. Book. Belong.</p>
            <h1 className={styles.heroTitle}>
              Discover unforgettable events and lock in your tickets in seconds.
            </h1>
            <p className={styles.heroSubtitle}>
              From headline concerts to secret supper clubs, EventSphere curates the best happenings
              in your city and beyond. Filter by mood, invite friends, and keep every e-ticket in
              one secure wallet.
            </p>

            <div className={styles.heroActions}>
              <button
                type="button"
                className={`${styles.heroButton} ${styles.heroPrimary}`}
                onClick={() => navigate("/events")}
              >
                Start browsing
              </button>
              <button
                type="button"
                className={`${styles.heroButton} ${styles.heroSecondary}`}
                onClick={() => scrollToRef(featuredSectionRef)}
              >
                Explore featured events
              </button>
            </div>

            {user && (
              <p className={styles.signedInNote}>
                Signed in as <span className={styles.emphasis}>{user.email}</span>
              </p>
            )}
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.heroCard}>
              <span className={styles.heroCardLabel}>Tonight in your area</span>
              <h2 className={styles.heroCardTitle}>Indie Night at The Warehouse</h2>
              <p className={styles.heroCardMeta}>Doors open 8:00 PM · Tickets from £18</p>
              <button
                type="button"
                className={styles.heroCardButton}
                onClick={() => navigate("/signup")}
              >
                Reserve seat
              </button>
              <div className={styles.heroCardFoot}>Only 14 tickets left</div>
            </div>
          </div>
        </section>

        <section className={styles.statsRow}>
          {quickStats.map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </section>

        <section ref={categoriesSectionRef} className={styles.categories}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Browse by vibe</h2>
            <p className={styles.sectionSubtitle}>
              Tailored categories help you quickly zero in on the experience you&apos;re after.
            </p>
          </header>

          <div className={styles.categoryGrid}>
            {EVENT_CATEGORIES.map((category) => (
              <article key={category.name} className={styles.categoryCard}>
                <h3 className={styles.categoryName}>{category.name}</h3>
                <p className={styles.categoryBlurb}>{category.blurb}</p>
                <button
                  type="button"
                  className={styles.categoryButton}
                  onClick={() => navigate("/signup")}
                >
                  See events
                </button>
              </article>
            ))}
          </div>
        </section>

        <section ref={featuredSectionRef} className={styles.featured}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Featured this week</h2>
            <p className={styles.sectionSubtitle}>
              Handpicked lineups selling fast. Join the crowd before tickets disappear.
            </p>
          </header>

          <div className={styles.featuredCarousel}>
            <div className={styles.featuredViewport}>
              <div
                className={styles.featuredTrack}
                style={{ transform: `translateX(-${featuredIndex * 100}%)` }}
              >
                {featuredEvents.map((event, index) => (
                  <article
                    key={event.slug || event.title || index}
                    className={styles.featuredSlide}
                  >
                    <button
                      type="button"
                      className={styles.featuredImage}
                      onClick={() => handleViewEvent(event.slug)}
                    >
                      <img src={event.image} alt={event.title} loading="lazy" />
                      <span className={styles.featuredCategory}>{event.category}</span>
                    </button>
                    <div className={styles.featuredDetails}>
                      <h3>{event.title}</h3>
                      <p className={styles.featuredMeta}>{event.date}</p>
                      <p className={styles.featuredLocation}>{event.location}</p>
                      <p className={styles.featuredDescription}>{event.description}</p>
                      <div className={styles.featuredActions}>
                        <button
                          type="button"
                          className={styles.featuredPrimary}
                          onClick={() => handleViewEvent(event.slug)}
                        >
                          View event
                        </button>
                        <button
                          type="button"
                          className={styles.featuredSecondary}
                          onClick={() => navigate("/events")}
                        >
                          View more events
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            {featuredEvents.length > 1 && (
              <>
                <button
                  type="button"
                  className={`${styles.carouselNav} ${styles.carouselNavPrev}`}
                  onClick={showPrevFeatured}
                  aria-label="Previous featured event"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={`${styles.carouselNav} ${styles.carouselNavNext}`}
                  onClick={showNextFeatured}
                  aria-label="Next featured event"
                >
                  ›
                </button>
              </>
            )}
          </div>
          {featuredEvents.length > 1 && (
            <div className={styles.carouselIndicators}>
              {featuredEvents.map((event, index) => (
                <button
                  key={event.slug || event.title || index}
                  type="button"
                  className={`${styles.carouselDot} ${
                    index === featuredIndex ? styles.carouselDotActive : ""
                  }`}
                  onClick={() => selectFeatured(index)}
                  aria-label={`View ${event.title}`}
                />
              ))}
            </div>
          )}
        </section>

        <section className={styles.testimonials}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Why attendees love EventSphere</h2>
            <p className={styles.sectionSubtitle}>
              Real voices from people exploring, booking, and hosting on our platform.
            </p>
          </header>

          <div className={styles.testimonialGrid}>
            {TESTIMONIALS.map((testimonial) => (
              <blockquote key={testimonial.name} className={styles.testimonialCard}>
                <p className={styles.testimonialQuote}>&ldquo;{testimonial.quote}&rdquo;</p>
                <footer className={styles.testimonialFooter}>
                  <span className={styles.testimonialName}>{testimonial.name}</span>
                  <span className={styles.testimonialTitle}>{testimonial.title}</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        <section ref={adminSectionRef} className={styles.adminSection}>
          <div className={styles.adminCard}>
            <h2 className={styles.adminTitle}>For organisers & venue teams</h2>
            <p className={styles.adminCopy}>
              Publish events, review registrations, and manage entry lists with our built-in admin
              dashboard. Keep tabs on sales, guest notes, and check-ins in real time.
            </p>
            <div className={styles.adminActions}>
              <button
                type="button"
                className={`${styles.adminButton} ${styles.adminPrimary}`}
                onClick={navigateAdmin}
              >
                {isAdmin ? "Open admin dashboard" : "Admin sign in"}
              </button>
              {!isAdmin && (
                <button
                  type="button"
                  className={`${styles.adminButton} ${styles.adminGhost}`}
                  onClick={() => navigate("/signup")}
                >
                  Become an organiser
                </button>
              )}
            </div>
            <p className={styles.adminFootnote}>
              Need elevated permissions? Reach out to your EventSphere account manager to upgrade
              your profile.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
