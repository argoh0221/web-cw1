import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./OrganiserHomePage.module.css";
import Header from "../components/Header.jsx";

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
  { name: "Concerts", blurb: "Live gigs, arena tours & intimate sessions.", field:"music",image:"https://media.istockphoto.com/photos/crowded-concert-hall-with-scene-stage-lights-rock-show-performance-picture-id1289481257?b=1&k=20&m=1289481257&s=170667a&w=0&h=E9AEvaPx9Lv4K9unJFQynwPCjKsiWbpphw4i3fWUAcs="},
  { name: "Workshops", blurb: "Learn, build, and create side-by-side." ,field:"workshop",image:"https://i.pinimg.com/originals/22/c7/3b/22c73be30ab4d19715e07f9c404b6be6.jpg"},
  { name: "Sports", blurb: "Match days, outdoor challenges, and more." ,field:"tennis",image:"https://img.freepik.com/free-photo/sports-tools_53876-138077.jpg"},
  { name: "Festivals", blurb: "Celebrate food, art, film, and culture." ,field:"food",image:"https://travelhubster.com/wp-content/uploads/2024/04/food-festivals.jpg"},
  { name: "Tech & Business", blurb: "Talks, hackathons, and networking nights.",field:"tech" ,image:"https://pi.tedcdn.com/r/pf.tedcdn.com/images/playlists/ted_talks_education_2139172409_1200x627.jpg?c=1050%2C550&w=1050"},
  { name: "Wellness", blurb: "Retreats, yoga pop-ups, and mindful meetups." ,field:"wellness",image:"https://cdn.1and1life.com/wp-content/uploads/2022/05/10044111/yoga.jpg"},
];

const TESTIMONIALS = [
  
  {
    quote:
      "Saved 15 hours per week on admin tasks. The automated attendee communications and check-in features let me focus on creating better events.",
    name: "Lisa Johnson",
    title: "Community Event Producer",
    achievement: "15+ Hours Saved Weekly"
  },
  {
    quote:
      "Sold out my first major conference with 1,200 attendees. The ticketing and registration system handled the volume without a single issue.",
    name: "Robert Garcia",
    title: "Conference Director",
    achievement: "1,200 Attendees Sold Out"
  },
  {
    quote:
      "Expanded to 3 new cities in 12 months. The platform's scalability and multi-location features made national growth achievable.",
    name: "Sophie Williams",
    title: "Fitness Event Franchise Owner",
    achievement: "3 New Markets in 12 Months"
  }
];;

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout, authenticating } = useAuth();

  const testimonialSectionRef = useRef(null);
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
     { value: "73%", label: "Repeat Booking Rate", icon: "🔄" },
    { value: "96%", label: "Sell-through Rate", icon: "📈" },
    { value: "4.8★★★★★", label: "Organiser Satisfaction", icon: "⭐" },
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
      <Header 
        scrollToRef={scrollToRef}
        sectionRefs={{
          testimonial:testimonialSectionRef,
          featured: featuredSectionRef,
          admin: adminSectionRef,
        }}
      />

      <main className={styles.main}>

        <section className={styles.hero}>

          <div className={styles.heroContent}>
  <p className={styles.eyebrow}>Power Your Events</p>
  <h1 className={styles.heroTitle}>
    TURN YOUR VISION INTO UNFORGETTABLE EXPERIENCE
  </h1>
  <p className={styles.heroSubtitle}>
    Join thousands of successful organizers who use EventSphere to sell out events, 
    engage communities, and turn passion into profit. Everything you need to launch 
    and grow your event business in one place.
  </p>

  <div className={styles.heroActions}>
    <button
      type="button"
      className={`${styles.heroButton} ${styles.heroPrimary}`}
      onClick={() => {
    if (user) {
      
      navigate("/organiser/events");
    } else {
      
      navigate("/organiser/signup", { 
        
      });
    }
  }}
    >
      Launch New Event
    </button>
    <button
      type="button"
      className={`${styles.heroButton} ${styles.heroSecondary}`}
      onClick={() => scrollToRef(testimonialSectionRef)}
    >
      See Success Stories
    </button>
  </div>

  {user && (
    <p className={styles.signedInNote}>
      Your organizer journey starts here, <span className={styles.emphasis}>{user.email}</span>
    </p>
  )}
</div>
          <div className={styles.heroPanel}>
            
          </div>
          
        
        
        </section>

        <section ref={testimonialSectionRef} className={styles.testimonials}>

          <header className={styles.sectionHeader}>
  <h2 className={styles.sectionTitle}>Success Stories from Our Creators</h2>
  <p className={styles.sectionSubtitle}>
    See how event creators like you are achieving remarkable results and building thriving communities.
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

          <div className={styles.statsRow}>
          {quickStats.map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </div>
        </section>

        








        <section ref={featuredSectionRef} className={styles.featured}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Discover how we've helped inspire incredible events</h2>
            <p className={styles.sectionSubtitle}>
              EventSphere is a powerfully simple event ticketing platform. We take pride in simplifying online ticket sales, audience growth, and event operations – supporting event organizers across industries, from small businesses to large enterprises..
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
                          className={styles.featuredSecondary}
                          onClick={() => navigate("/events")}
                        >
                          View more hosted events
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

      <section ref={categoriesSectionRef} className={styles.categories}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Browse by vibe</h2>
            <p className={styles.sectionSubtitle}>
              Tailored categories help you quickly zero in on the experience you&apos;re after.
            </p>
          </header>

          <div className={styles.categoryGrid}>
            {EVENT_CATEGORIES.map((category) => (
              <article key={category.name} 
               className={styles.categoryCard}
               style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${category.image})`
                      }}
              >
                <h3 className={styles.categoryName}>{category.name}</h3>
                <p className={styles.categoryBlurb}>{category.blurb}</p>
                <button
                  type="button"
                  className={styles.categoryButton}
                  onClick={() => navigate("/events", { 
                    state: { 
                          presetCategory: category.field 
                            } 
                  })}
                >
                  See events
                </button>
              </article>
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
                  onClick={() => navigate("/organiser/signup")}
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
