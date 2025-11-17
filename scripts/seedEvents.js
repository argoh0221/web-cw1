/* eslint-env node */

import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "..", ".env");

dotenv.config({ path: envPath });

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

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

async function generateUniqueSlug(connection, title) {
  const base = slugify(title);
  let candidate = base || `event-${Date.now()}`;
  let counter = 1;

  while (true) {
    const [rows] = await connection.query("SELECT id FROM events WHERE slug = ? LIMIT 1", [
      candidate,
    ]);
    if (rows.length === 0) {
      return candidate;
    }
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

function toMySqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function applyTemplate(text, data) {
  return text.replace(/\{(\w+)\}/g, (_match, key) => data[key] ?? "");
}

const BASE_EVENTS = [
  {
    title: "Global Startup Summit 2025",
    summary: "Two-day founder summit with investor matchmaking, product showcases, and a live pitch finale.",
    description:
      "Join founders and investors from 30+ countries for lightning talks, venture labs, and curated networking lounges overlooking Marina Bay.\n\nClimate tech, health tech, and AI builders each get dedicated discovery tracks, while night sessions turn into relaxed founder dinners with regional cuisine pairings and acoustic sets on the promenade.",
    start_at: "2025-04-22T09:00:00",
    end_at: "2025-04-22T18:00:00",
    timezone: "Asia/Singapore",
    venue_name: "Marina Bay Innovation Centre",
    address_line1: "8 Marina View",
    address_line2: "Level 12, Sands Tower",
    city: "Singapore",
    region: "",
    postal_code: "018960",
    country_code: "SG",
    capacity: 600,
    price_cents: 24900,
    currency_code: "SGD",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "San Francisco Climate Tech Expo",
    summary: "Summit of climate hardware demos, carbon removal pitches, and policy labs on the Embarcadero.",
    description:
      "Tour a hall of gigaton moonshots, from portable direct-air capture rigs to ocean alkalinity pilots, with founders running live stress tests and policy analysts unpacking incentives in real time.\n\nMorning keynotes pair climate scientists with venture leaders, afternoon labs tackle permitting and project finance, and the waterfront sunset showcase spotlights the top five carbon removal startups of the year.",
    start_at: "2025-04-30T09:00:00",
    end_at: "2025-05-01T17:00:00",
    timezone: "America/Los_Angeles",
    venue_name: "Pier 27 Cruise Terminal",
    address_line1: "Pier 27 The Embarcadero",
    city: "San Francisco",
    region: "CA",
    postal_code: "94111",
    country_code: "US",
    capacity: 750,
    price_cents: 29900,
    currency_code: "USD",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1455906876003-298dd8c44d09?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1533055640609-24b498dfd950?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "Lisbon Web Futures Week",
    summary: "Riverside unconference blending product roundtables, sunset sails, and Lisbon's creative tech scene.",
    description:
      "Spend five days along the Tagus mixing outdoor unconference sessions with hands-on product labs hosted inside historic warehouses at LX Factory.\n\nAfternoons feature electric tuk-tuk tours through local startups, while sunset sails and fado dinners keep networking relaxed, intimate, and endlessly scenic.",
    start_at: "2025-05-05T09:30:00",
    end_at: "2025-05-09T18:00:00",
    timezone: "Europe/Lisbon",
    venue_name: "LX Factory River Hub",
    address_line1: "Rua Rodrigues de Faria 103",
    city: "Lisbon",
    region: "",
    postal_code: "1300-501",
    country_code: "PT",
    capacity: 400,
    price_cents: 89000,
    currency_code: "EUR",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1475724017904-b712052c192a?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "Nordic Design Weekender",
    summary: "Stockholm studio tours, prototyping labs, and lantern-lit salons on Scandinavian design futures.",
    description:
      "Co-create with leading Nordic studios across three immersive days inside a repurposed waterfront gallery.\n\nMornings feature rapid prototyping sprints, afternoons unlock closed-door studio tours, and evenings bring hygge-inspired fireside salons on circular design, inclusive spaces, and the future of luminous materials.",
    start_at: "2025-05-16T10:00:00",
    end_at: "2025-05-18T17:30:00",
    timezone: "Europe/Stockholm",
    venue_name: "Atelje 23",
    address_line1: "Skeppsgatan 12",
    address_line2: "4th Floor",
    city: "Stockholm",
    region: "",
    postal_code: "11130",
    country_code: "SE",
    capacity: 240,
    price_cents: 14900,
    currency_code: "SEK",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1526498460520-4c246339dccb?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "Tokyo Night Market & Street Eats",
    summary: "Lantern-lit pop-ups, DJ sets, and chef collaborations celebrating Tokyo street food culture.",
    description:
      "Yoyogi transforms into a neon-drenched night market with 60 rotating stalls, izakaya pop-ups, and a vinyl DJ stage curated by Tokyo's top selectors.\n\nTaste limited collabs from ramen legends and dessert innovators while cultural tours decode each dish, then close the night with lantern-lit parades and projection art across ancient trees.",
    start_at: "2025-08-15T18:00:00",
    end_at: "2025-08-16T01:00:00",
    timezone: "Asia/Tokyo",
    venue_name: "Yoyogi Park Event Plaza",
    address_line1: "2-1 Yoyogi Kamizono-cho",
    city: "Tokyo",
    region: "Tokyo",
    postal_code: "151-0052",
    country_code: "JP",
    capacity: 1500,
    price_cents: 4500,
    currency_code: "JPY",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1504803546511-0a74cc0f6fad?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1528756514091-dee5ecaa3278?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "San Francisco Bay Sail & Sound",
    summary: "Daytime design summit followed by sunset catamaran concerts under the Golden Gate Bridge.",
    description:
      "Kick off with human-centred design labs overlooking the bay before boarding a twin-hull catamaran for an evening of live electronic acts and projection mapping.\n\nFloating tasting stations pair local wines with seasonal tapas while marine biologists narrate the wildlife gliding beneath the hull.",
    start_at: "2025-06-20T13:00:00",
    end_at: "2025-06-20T22:30:00",
    timezone: "America/Los_Angeles",
    venue_name: "Fort Mason Center Pier B",
    address_line1: "2 Marina Blvd",
    city: "San Francisco",
    region: "CA",
    postal_code: "94123",
    country_code: "US",
    capacity: 320,
    price_cents: 21500,
    currency_code: "USD",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1453282716202-de94e528067c?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "Andes Mountain Film Festival",
    summary: "Outdoor cinema, expedition clinics, and filmmaker Q&As across Cusco's historic plazas.",
    description:
      "Celebrate alpine storytelling under the stars with screenings of new expeditions, cinematography masterclasses at dawn, and a marketplace of gear innovators from the Andes region.\n\nEvening fireside chats pair athletes with documentarians to unpack resilience, safety, and sacred mountain stewardship before live Andean folk sets close each night.",
    start_at: "2025-06-07T14:00:00",
    end_at: "2025-06-09T23:00:00",
    timezone: "America/Lima",
    venue_name: "Plaza Cultural Cusco",
    address_line1: "Av. El Sol 401",
    city: "Cusco",
    region: "Cusco",
    postal_code: "08002",
    country_code: "PE",
    capacity: 850,
    price_cents: 6500,
    currency_code: "PEN",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1526481280695-3c4692f07e93?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1474463664050-6dcd81f9c479?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "Toronto Indie Game Expo",
    summary: "Playable prototypes, live art jams, and speed-funding pits for North America's indie studios.",
    description:
      "Walk through interactive micro-booths where studios stream playable prototypes, host live speedruns, and unpack pipelines on mini stages.\n\nDaily art jams pair concept artists with musicians, while evening speed-funding pits connect developers to publishers in ten-minute bursts.",
    start_at: "2025-07-18T10:00:00",
    end_at: "2025-07-20T19:00:00",
    timezone: "America/Toronto",
    venue_name: "Enercare Centre Hall D",
    address_line1: "100 Princes Blvd",
    city: "Toronto",
    region: "ON",
    postal_code: "M6K 3C3",
    country_code: "CA",
    capacity: 2800,
    price_cents: 17900,
    currency_code: "CAD",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  },
  {
    title: "Mexico City Culinary Lab Week",
    summary: "Chef residencies, mezcal mastery labs, and market safaris across Roma Norte.",
    description:
      "Spend five flavour-packed days in a living test kitchen with Michelin-starred guest chefs, fermentation scientists, and mezcal maestros.\n\nMornings explore market sourcing and nixtamal tortillas, afternoons dive into hands-on plating labs and fermentation clinics, and evenings end with rooftop tastings, vinyl mariachi jazz, and curated agave flights.",
    start_at: "2025-09-24T10:00:00",
    end_at: "2025-09-28T22:00:00",
    timezone: "America/Mexico_City",
    venue_name: "Casa Lumbre Test Kitchen",
    address_line1: "Calle Colima 99",
    city: "Mexico City",
    region: "CDMX",
    postal_code: "06700",
    country_code: "MX",
    capacity: 260,
    price_cents: 15800,
    currency_code: "MXN",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  },
  {
    title: "Berlin Code Jam & Microconf",
    summary: "Hands-on hackathon with lightning talks, midnight coding lounges, and micro SaaS clinics.",
    description:
      "Bring your favourite stack and spend 36 hours building alongside European indie hackers inside Factory Goerlitzer Park's lofts.\n\nMorning masterclasses cover domain modeling and pricing, afternoons host mentor office hours, and midnight coding lounges pump vinyl beats while founders ship upgrades on the big screen with live commentary.",
    start_at: "2025-09-12T09:00:00",
    end_at: "2025-09-13T18:00:00",
    timezone: "Europe/Berlin",
    venue_name: "Factory Goerlitzer Park",
    address_line1: "Lohmuehlenstrasse 65",
    city: "Berlin",
    region: "Berlin",
    postal_code: "12435",
    country_code: "DE",
    capacity: 350,
    price_cents: 14900,
    currency_code: "EUR",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  },
  {
    title: "Cape Town Coastal Wellness Retreat",
    summary: "Sunrise surf coaching, restorative yoga domes, and nutrition labs overlooking False Bay.",
    description:
      "Reset beside the ocean with sunrise surf lessons, breathwork domes, and chef-crafted plant-based meals prepared with local produce.\n\nMidday workshops unpack sleep science and mindful leadership, while twilight drum circles and tide-pool meditation walks wind down each day in Muizenberg's golden light before fireside storytelling.",
    start_at: "2025-10-05T06:30:00",
    end_at: "2025-10-07T15:00:00",
    timezone: "Africa/Johannesburg",
    venue_name: "Muizenberg Beach Pavilion",
    address_line1: "Beach Rd",
    city: "Cape Town",
    region: "Western Cape",
    postal_code: "7945",
    country_code: "ZA",
    capacity: 180,
    price_cents: 42000,
    currency_code: "ZAR",
    status: "draft",
    published_at: null,
  },
  {
    title: "Dubai Desert Polo Classic",
    summary: "Sunrise hot-air balloons, desert polo finals under the lights, and Bedouin culinary showcases.",
    description:
      "Wake up above the dunes in a hot-air balloon before daytime qualifier matches commence inside a purpose-built desert arena.\n\nAs the sun sets, lanterns ignite the evening finals, Bedouin chefs serve multi-course tasting menus, and a drone light show paints formations across the night sky.",
    start_at: "2025-11-08T06:00:00",
    end_at: "2025-11-09T22:30:00",
    timezone: "Asia/Dubai",
    venue_name: "Al Marmoom Equestrian Reserve",
    address_line1: "Al Qudra Rd",
    city: "Dubai",
    region: "Dubai",
    postal_code: "00000",
    country_code: "AE",
    capacity: 1200,
    price_cents: 145000,
    currency_code: "AED",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  },
  {
    title: "Sydney Harbour Jazz Cruise",
    summary: "Sunset harbour cruise with big band sets, a chef's tasting menu, and skyline projections.",
    description:
      "Board a glass-topped vessel for progressive dining, curated wine pairings, and three rotating jazz ensembles cruising beneath the Harbour Bridge.\n\nAerialists open the show as the Opera House lights up, while the upper deck becomes a rooftop lounge with mixologists shaking botanical spritzes beneath the southern stars.",
    start_at: "2025-11-21T17:30:00",
    end_at: "2025-11-21T22:00:00",
    timezone: "Australia/Sydney",
    venue_name: "Harbour Spirit Luxury Vessel",
    address_line1: "5 Wheat Rd",
    city: "Sydney",
    region: "NSW",
    postal_code: "2000",
    country_code: "AU",
    capacity: 220,
    price_cents: 18900,
    currency_code: "AUD",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  },
  {
    title: "Seoul AI Music Hack",
    summary: "48-hour hack sprint blending machine learning, K-pop producers, and immersive stage design.",
    description:
      "Prototype AI-driven instruments with curated dataset libraries while mentors from Seoul's label ecosystem offer arrangement feedback.\n\nNight sessions transform the venue into a holographic performance lab where teams debut interactive tracks for an audience of producers and investors.",
    start_at: "2025-08-22T08:00:00",
    end_at: "2025-08-24T20:00:00",
    timezone: "Asia/Seoul",
    venue_name: "Dongdaemun Design Plaza Sound Lab",
    address_line1: "281 Eulji-ro",
    city: "Seoul",
    region: "",
    postal_code: "04566",
    country_code: "KR",
    capacity: 420,
    price_cents: 99000,
    currency_code: "KRW",
    status: "draft",
    published_at: null,
  },
  {
    title: "Reykjavik Aurora Wellness Escape",
    summary: "Glacier hikes, geothermal spa rituals, and aurora photography classes in Iceland's south coast.",
    description:
      "Base yourself in boutique cabins where local guides lead glacier hikes, Viking breathwork, and geothermal spa rituals under glass domes.\n\nEvenings pivot to astrophotography classes, storytelling circles about Icelandic folklore, and midnight hot chocolate while the northern lights dance overhead.",
    start_at: "2025-02-18T09:00:00",
    end_at: "2025-02-21T13:00:00",
    timezone: "Atlantic/Reykjavik",
    venue_name: "Frost Lagoon Retreat",
    address_line1: "Thorlakshafnarvegur 1",
    city: "Reykjavik",
    region: "",
    postal_code: "820",
    country_code: "IS",
    capacity: 120,
    price_cents: 87500,
    currency_code: "ISK",
    status: "published",
    published_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    hero_image_path:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1453282716202-de94e528067c?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    title: "New York Piano Recital Series",
    summary: "Twelve concert pianists interpret modern classics in an intimate Carnegie Hall residency.",
    description:
      "Sip champagne in the Weill Recital lounge before settling into a candlelit hall for performances spanning Chopin to modern minimalism.\n\nPost-recital salons include Q&A sessions, vinyl listening booths, and a limited-edition art print release curated with New York illustrators and calligraphers.",
    start_at: "2025-12-12T19:30:00",
    end_at: "2025-12-12T22:15:00",
    timezone: "America/New_York",
    venue_name: "Carnegie Hall - Weill Recital Hall",
    address_line1: "881 7th Ave",
    city: "New York",
    region: "NY",
    postal_code: "10019",
    country_code: "US",
    capacity: 320,
    price_cents: 11900,
    currency_code: "USD",
    status: "draft",
    published_at: null,
    hero_image_path:
      "https://images.unsplash.com/photo-1529101091764-c3526daf38fe?auto=format&fit=crop&w=1600&q=80",
    gallery_image_paths: [
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=80",
    ],
  },
];

const LOCATIONS = [
  {
    city: "Berlin",
    country_code: "DE",
    country_name: "Germany",
    timezone: "Europe/Berlin",
    venue_name: "Spreewerk Atrium",
    address_line1: "Holzmarktstraße 33",
    address_line2: null,
    region: "",
    postal_code: "10179",
    capacity_base: 280,
    currency_code: "EUR",
  },
  {
    city: "Barcelona",
    country_code: "ES",
    country_name: "Spain",
    timezone: "Europe/Madrid",
    venue_name: "Port Vell Event Hub",
    address_line1: "Moll de la Barceloneta 1",
    address_line2: null,
    region: "",
    postal_code: "08039",
    capacity_base: 320,
    currency_code: "EUR",
  },
  {
    city: "Austin",
    country_code: "US",
    country_name: "United States",
    timezone: "America/Chicago",
    venue_name: "Warehouse Row",
    address_line1: "95 Red River St",
    address_line2: null,
    region: "TX",
    postal_code: "78701",
    capacity_base: 450,
    currency_code: "USD",
  },
  {
    city: "Cape Town",
    country_code: "ZA",
    country_name: "South Africa",
    timezone: "Africa/Johannesburg",
    venue_name: "V&A Ocean Pavilion",
    address_line1: "Dock Rd",
    address_line2: null,
    region: "Western Cape",
    postal_code: "8001",
    capacity_base: 380,
    currency_code: "ZAR",
  },
  {
    city: "Dubai",
    country_code: "AE",
    country_name: "United Arab Emirates",
    timezone: "Asia/Dubai",
    venue_name: "Skyline Innovation Deck",
    address_line1: "Sheikh Zayed Rd 1",
    address_line2: "Level 45",
    region: "",
    postal_code: "",
    capacity_base: 420,
    currency_code: "AED",
  },
  {
    city: "Toronto",
    country_code: "CA",
    country_name: "Canada",
    timezone: "America/Toronto",
    venue_name: "Harbourfront Commons",
    address_line1: "235 Queens Quay W",
    address_line2: null,
    region: "ON",
    postal_code: "M5J 2G8",
    capacity_base: 360,
    currency_code: "CAD",
  },
  {
    city: "Seoul",
    country_code: "KR",
    country_name: "South Korea",
    timezone: "Asia/Seoul",
    venue_name: "Dongdaemun Design Studio",
    address_line1: "281 Eulji-ro",
    address_line2: null,
    region: "",
    postal_code: "04566",
    capacity_base: 390,
    currency_code: "KRW",
  },
  {
    city: "Buenos Aires",
    country_code: "AR",
    country_name: "Argentina",
    timezone: "America/Argentina/Buenos_Aires",
    venue_name: "Puerto Madero Loft",
    address_line1: "Olga Cossettini 801",
    address_line2: null,
    region: "CABA",
    postal_code: "C1107BWA",
    capacity_base: 340,
    currency_code: "ARS",
  },
  {
    city: "Nairobi",
    country_code: "KE",
    country_name: "Kenya",
    timezone: "Africa/Nairobi",
    venue_name: "Karura Forest Amphitheatre",
    address_line1: "Limuru Rd",
    address_line2: null,
    region: "",
    postal_code: "",
    capacity_base: 310,
    currency_code: "KES",
  },
  {
    city: "Kuala Lumpur",
    country_code: "MY",
    country_name: "Malaysia",
    timezone: "Asia/Kuala_Lumpur",
    venue_name: "Bukit Bintang Studio",
    address_line1: "138 Jalan Bukit Bintang",
    address_line2: null,
    region: "",
    postal_code: "55100",
    capacity_base: 370,
    currency_code: "MYR",
  },
  {
    city: "Reykjavík",
    country_code: "IS",
    country_name: "Iceland",
    timezone: "Atlantic/Reykjavik",
    venue_name: "Harpa Creative Dock",
    address_line1: "Austurbakki 2",
    address_line2: null,
    region: "",
    postal_code: "101",
    capacity_base: 260,
    currency_code: "ISK",
  },
  {
    city: "Singapore",
    country_code: "SG",
    country_name: "Singapore",
    timezone: "Asia/Singapore",
    venue_name: "Marina Innovation Loft",
    address_line1: "10 Bayfront Ave",
    address_line2: "Level 22",
    region: "",
    postal_code: "018956",
    capacity_base: 410,
    currency_code: "SGD",
  },
];

const THEMES = [
  {
    titleSuffix: "Design Futures Showcase",
    summary:
      "{city}'s design community gathers for labs, prototype runways, and lightning talks on the future of spatial experiences.",
    description: [
      "{city}'s waterfront venue {venue} transforms into a playground of tactile installations, speculative studios, and rapid prototyping bays.",
      "Twilight lounges bring together material scientists and product founders from across {country} for intimate fireside chats.",
    ],
    basePrice: 18000,
    heroImage:
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80",
    ],
  },
  {
    titleSuffix: "Night Market & Soundscape",
    summary:
      "Late-night street food collabs, vinyl DJ sets, and immersive projection art celebrate {city}'s vibrant culinary scene.",
    description: [
      "Explore pop-up kitchens curated with trailblazing chefs from {country}, while light artists wash the venue in neon-drenched motion graphics.",
      "Pop-up record bars and rooftop lounges keep networking flowing until sunrise.",
    ],
    basePrice: 5500,
    heroImage:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
    ],
  },
  {
    titleSuffix: "Climate Tech Field Lab",
    summary:
      "Hands-on demos with carbon removal startups, policy briefings, and investment roundtables tackling the climate frontier.",
    description: [
      "Engineers open their living labs across {city}, from direct-air capture rigs to regenerative agriculture pilots.",
      "Investors and policymakers close the evening with scenario planning sessions tailored to {country}'s climate roadmap.",
    ],
    basePrice: 22000,
    heroImage:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=80",
    ],
  },
  {
    titleSuffix: "Wellness Sunrise Retreat",
    summary:
      "Dawn yoga sails, breathwork domes, and chef-led mindful brunches restore mind and body along {city}'s skyline.",
    description: [
      "Start with sunrise flow sessions overlooking {city}, followed by cold-plunge rituals and sound bath studios inside {venue}.",
      "Local nutritionists host interactive brunch labs featuring ingredients sourced across {country}.",
    ],
    basePrice: 8900,
    heroImage:
      "https://images.unsplash.com/photo-1528968620-8dccd5408ec7?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1600&q=80",
    ],
  },
  {
    titleSuffix: "Techno & Art Residency",
    summary:
      "Twenty-four hour art & sound takeover featuring modular synth labs, live coders, and AV collectives from {country}.",
    description: [
      "{venue} becomes a multi-sensory playground with projection-mapped walls, tactile sculptures, and live coding theatre.",
      "Night sessions invite underground DJs while morning panels explore the intersection of code, community, and culture in {city}.",
    ],
    basePrice: 12500,
    heroImage:
      "https://images.unsplash.com/photo-1504803546511-0a74cc0f6fad?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1464375117522-1311d0b733d7?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1512427691650-1d7cd20a3fa0?auto=format&fit=crop&w=1600&q=80",
    ],
  },
  {
    titleSuffix: "Founder Fireside Sessions",
    summary:
      "Cross-border founders share zero-to-one stories, tactical workshops, and curated investor matchmaking in {city}.",
    description: [
      "Small-group seminars unpack playbooks on product-market fit, hiring, and community building for founders across {country}.",
      "Close the day with relaxed rooftop mixers featuring local artisans and acoustic performances.",
    ],
    basePrice: 19500,
    heroImage:
      "https://images.unsplash.com/photo-1526948128573-703ee1aeb6fa?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1600&q=80",
    ],
  },
  {
    titleSuffix: "Culinary Lab & Wine Soirée",
    summary:
      "Experimental kitchens pair chefs, sommeliers, and fermentation scientists for a gastronomic journey through {country}.",
    description: [
      "Progressive tasting menus at {venue} spotlight seasonal produce while fermentation labs offer hands-on workshops.",
      "Live jazz and storytelling corners keep conversations flowing until late night dessert collaborations.",
    ],
    basePrice: 16000,
    heroImage:
      "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1456404823211-0a2f84f0b3b5?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1526948128573-703ee1aeb6fa?auto=format&fit=crop&w=1600&q=80",
    ],
  },
  {
    titleSuffix: "Urban Adventure Mashup",
    summary:
      "City-wide scavenger hunts, AR quests, and secret concerts reveal hidden corners of {city}.",
    description: [
      "Teams explore {city} through augmented reality missions that unlock hidden studios, local storytellers, and micro pop-ups.",
      "The finale converges at {venue} for a secret headline performance and immersive art reveal inspired by {country}.",
    ],
    basePrice: 11000,
    heroImage:
      "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1497493292307-31c376b6e479?auto=format&fit=crop&w=1600&q=80",
    ],
  },
];

function generateAdditionalEvents(targetTotal) {
  const totalNeeded = Math.max(0, targetTotal - BASE_EVENTS.length);
  if (totalNeeded === 0) {
    return [];
  }

  const events = [];
  const baseDate = Date.UTC(2025, 0, 15, 9, 0, 0);

  for (let index = 0; index < totalNeeded; index += 1) {
    const location = LOCATIONS[index % LOCATIONS.length];
    const theme = THEMES[index % THEMES.length];
    const startDate = new Date(baseDate + index * 36 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);

    const context = {
      city: location.city,
      venue: location.venue_name,
      country: location.country_name,
    };

    const title = `${location.city} ${theme.titleSuffix}`;
    const summary = applyTemplate(theme.summary, context);
    const description = theme.description.map((paragraph) => applyTemplate(paragraph, context)).join("\n\n");

    const status = index % 7 === 0 ? "draft" : "published";
    const publishedAt =
      status === "published" ? toMySqlDateTime(new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000)) : null;

    const capacity = location.capacity_base + (index % 6) * 60 + 120;
    const priceCents = theme.basePrice + (index % 5) * 1200;

    const heroImage = theme.heroImage ? applyTemplate(theme.heroImage, context) : null;
    const galleryImages = (theme.galleryImages || []).map((image) => applyTemplate(image, context));

    events.push({
      title,
      summary,
      description,
      start_at: toMySqlDateTime(startDate),
      end_at: toMySqlDateTime(endDate),
      timezone: location.timezone,
      venue_name: location.venue_name,
      address_line1: location.address_line1,
      address_line2: location.address_line2,
      city: location.city,
      region: location.region,
      postal_code: location.postal_code,
      country_code: location.country_code,
      capacity,
      price_cents: priceCents,
      currency_code: location.currency_code,
      status,
      published_at: publishedAt,
      hero_image_path: heroImage,
      gallery_image_paths: galleryImages,
    });
  }

  return events;
}

const TARGET_TOTAL_EVENTS = 200;
const sampleEvents = [...BASE_EVENTS, ...generateAdditionalEvents(TARGET_TOTAL_EVENTS)];

async function seedEvents() {
  const config = getDatabaseConfig();
  const connection = await mysql.createConnection(config);

  try {
    const force = process.argv.includes("--force");

    const [countRows] = await connection.query("SELECT COUNT(*) AS total FROM events");
    let existingCount = Number(countRows[0]?.total ?? 0);

    if (force && existingCount > 0) {
      console.info("[seed] --force flag detected. Clearing existing events…");
      await connection.query("DELETE FROM events");
      await connection.query("ALTER TABLE events AUTO_INCREMENT = 1");
      existingCount = 0;
    }

    if (!force && existingCount >= TARGET_TOTAL_EVENTS) {
      console.info(
        `[seed] events table already has ${existingCount} rows (target ${TARGET_TOTAL_EVENTS}); skipping seeding.`,
      );
      return;
    }

    const [adminRows] = await connection.query(
      "SELECT id FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1",
    );
    const adminId = adminRows[0]?.id ?? null;

    await connection.beginTransaction();

    const eventsToInsert = sampleEvents.slice(existingCount, TARGET_TOTAL_EVENTS);

    if (eventsToInsert.length === 0) {
      console.info("[seed] no additional events required.");
      await connection.rollback();
      return;
    }

    for (const event of eventsToInsert) {
      const slug = await generateUniqueSlug(connection, event.title);
      await connection.query(
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
            hero_image_path,
            gallery_image_paths,
            status,
            published_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          adminId,
          event.title,
          slug,
          event.summary,
          event.description,
          event.start_at,
          event.end_at,
          event.timezone,
          event.venue_name,
          event.address_line1,
          event.address_line2 ?? null,
          event.city,
          event.region || null,
          event.postal_code || null,
          event.country_code,
          event.capacity,
          event.price_cents,
          event.currency_code,
          event.hero_image_path ?? null,
          event.gallery_image_paths && event.gallery_image_paths.length > 0
            ? JSON.stringify(event.gallery_image_paths)
            : null,
          event.status,
          event.published_at,
        ],
      );
    }

    await connection.commit();
    console.info(
      `[seed] inserted ${eventsToInsert.length} event(s); total should now be ${existingCount + eventsToInsert.length}`,
    );
  } catch (error) {
    await connection.rollback();
    console.error("[seed] failed to insert sample events", error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

seedEvents().catch((error) => {
  console.error("[seed] failed", error);
  process.exit(1);
});
