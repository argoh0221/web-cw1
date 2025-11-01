import React, { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./HomePage.module.css";

const FEATURED_EVENTS = [
  {
    title: "City Lights Food & Music Festival",
    date: "Sat, 12 Apr · 4:00 PM",
    location: "Riverfront Park, London",
    description: "Taste global flavours, enjoy live performances, and explore artisan pop-ups.",
    category: "Festival",
  },
  {
    title: "StartUp Spark: Founders Night",
    date: "Thu, 24 Apr · 6:30 PM",
    location: "Canvas Hub, Manchester",
    description:
      "Hear from breakout founders, pitch your ideas, and grow your network over craft drinks.",
    category: "Business",
  },
  {
    title: "Sunrise Yoga + Wellness Retreat",
    date: "Sun, 04 May · 7:00 AM",
    location: "Seaside Studio, Brighton",
    description:
      "Breathe, stretch, and reset with an immersive yoga flow followed by mindful brunch.",
    category: "Wellness",
  },
];

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

  const isAdmin = user?.isAdmin ?? false;

  const quickStats = useMemo(
    () => [
      { value: "4,500+", label: "Events hosted nationwide" },
      { value: "320K", label: "Tickets booked last month" },
      { value: "4.9★", label: "Average attendee rating" },
    ],
    [],
  );

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
          <button
            type="button"
            className={styles.navLink}
            onClick={() => scrollToRef(categoriesSectionRef)}
          >
            Discover
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
                onClick={() => navigate("/signup")}
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

          <div className={styles.eventGrid}>
            {FEATURED_EVENTS.map((event) => (
              <article key={event.title} className={styles.eventCard}>
                <div className={styles.eventBadge}>{event.category}</div>
                <h3 className={styles.eventTitle}>{event.title}</h3>
                <p className={styles.eventMeta}>{event.date}</p>
                <p className={styles.eventLocation}>{event.location}</p>
                <p className={styles.eventDescription}>{event.description}</p>
                <button
                  type="button"
                  className={styles.eventButton}
                  onClick={() => navigate("/signup")}
                >
                  Get tickets
                </button>
              </article>
            ))}
          </div>
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
