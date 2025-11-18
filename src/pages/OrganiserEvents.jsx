import React, { useCallback, useEffect, useMemo, useState, useId } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import styles from "./OrganiserEvents.module.css";
import COUNTRIES from "../data/countries.js";
import Header from "../components/Header.jsx";

const EMPTY_FORM = {
  title: "",
  summary: "",
  description: "",
  startAt: "",
  endAt: "",
  timezone: "UTC",
  venueName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
  capacity: "100",
  priceCents: "0",
  currencyCode: "USD",
  status: "draft",
};

const MAX_GALLERY_IMAGES = 10;

const HERO_INPUT_MODES = {
  UPLOAD: "upload",
  URL: "url",
};

function isRemoteSource(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function normaliseExternalInput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toDateInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) {
    return "—";
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

function eventToForm(event) {
  return {
    title: event.title,
    summary: event.summary,
    description: event.description,
    startAt: toDateInput(event.startAt),
    endAt: toDateInput(event.endAt),
    timezone: event.timezone,
    venueName: event.venue.name,
    addressLine1: event.venue.addressLine1,
    addressLine2: event.venue.addressLine2 ?? "",
    city: event.venue.city,
    region: event.venue.region ?? "",
    postalCode: event.venue.postalCode ?? "",
    countryCode: event.venue.countryCode,
    capacity: String(event.capacity),
    priceCents: String(event.price.amountCents ?? 0),
    currencyCode: event.price.currencyCode ?? "USD",
    status: event.status,
  };
}

function serialiseForm(form) {
  const start = form.startAt ? new Date(form.startAt) : null;
  const end = form.endAt ? new Date(form.endAt) : null;

  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
    timezone: form.timezone.trim() || "UTC",
    venueName: form.venueName.trim(),
    addressLine1: form.addressLine1.trim(),
    addressLine2: form.addressLine2.trim() || null,
    city: form.city.trim(),
    region: form.region.trim() || null,
    postalCode: form.postalCode.trim() || null,
    countryCode: form.countryCode.trim().toUpperCase(),
    capacity: Number(form.capacity) || 0,
    priceCents: Math.max(0, Number(form.priceCents) || 0),
    currencyCode: form.currencyCode.trim().toUpperCase() || "USD",
    status: form.status,
  };
}

function toStoredPathFromUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  if (isRemoteSource(url)) {
    return url;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return parsed.toString();
    }
    return parsed.pathname.replace(/^\//, "");
  } catch {
    if (url.startsWith("/")) {
      return url.slice(1);
    }
    return url;
  }
}

function makeFileId(file) {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
}

function makeUniqueId(prefix = "entry") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createObjectUrl(file) {
  if (!file) {
    return null;
  }

  try {
    const globalUrl = typeof globalThis !== "undefined" ? globalThis.URL : undefined;
    if (globalUrl && typeof globalUrl.createObjectURL === "function") {
      return globalUrl.createObjectURL(file);
    }
    if (
      typeof window !== "undefined" &&
      window.webkitURL &&
      typeof window.webkitURL.createObjectURL === "function"
    ) {
      return window.webkitURL.createObjectURL(file);
    }
  } catch {
    // ignore and fall back
  }
  return null;
}

function revokeObjectUrl(url) {
  if (typeof url !== "string" || !url.startsWith("blob:")) {
    return;
  }
  try {
    const globalUrl = typeof globalThis !== "undefined" ? globalThis.URL : undefined;
    if (globalUrl && typeof globalUrl.revokeObjectURL === "function") {
      globalUrl.revokeObjectURL(url);
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.webkitURL &&
      typeof window.webkitURL.revokeObjectURL === "function"
    ) {
      window.webkitURL.revokeObjectURL(url);
    }
  } catch {
    // ignore revoke errors
  }
}

export default function AdminEvents() {
  const navigate = useNavigate();
  const heroUrlInputId = useId();
  const galleryUrlInputId = useId();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialised, setInitialised] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM }));
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [attendees, setAttendees] = useState([]);
  const [attendeeEventId, setAttendeeEventId] = useState(null);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const [heroImageFile, setHeroImageFile] = useState(null);
  const [heroImagePreview, setHeroImagePreview] = useState("");
  const [existingHero, setExistingHero] = useState(null);
  const [removeHero, setRemoveHero] = useState(false);
  const [heroInputKey, setHeroInputKey] = useState(0);
  const [heroInputMode, setHeroInputMode] = useState(HERO_INPUT_MODES.UPLOAD);
  const [heroUrl, setHeroUrl] = useState("");
  const [heroUrlDraft, setHeroUrlDraft] = useState("");
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [existingGallery, setExistingGallery] = useState([]);
  const [galleryUrlEntries, setGalleryUrlEntries] = useState([]);
  const [galleryUrlInput, setGalleryUrlInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (formOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
  }, [formOpen]);

  const gallerySlotsRemaining = useMemo(() => {
    const keepCount = existingGallery.filter((item) => item.keep).length;
    const pendingUrlCount = galleryUrlEntries.length;
    return Math.max(0, MAX_GALLERY_IMAGES - keepCount - galleryFiles.length - pendingUrlCount);
  }, [existingGallery, galleryFiles, galleryUrlEntries]);

  const loadEvents = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError("");
    try {
      const response = await fetch("/api/admin/events", {
        method: "GET",
        credentials: "include",
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Unable to load events.");
      }

      setEvents(payload.events ?? []);
    } catch (loadError) {
      console.error("[admin events] failed to load", loadError);
      setError(loadError.message || "Unable to load events.");
    } finally {
      if (showSpinner) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
      setInitialised(true);
    }
  }, []);

  useEffect(() => {
    loadEvents({ showSpinner: true });
  }, [loadEvents]);

  const totals = useMemo(() => {
    const published = events.filter((entry) => entry.status === "published").length;
    const draft = events.filter((entry) => entry.status === "draft").length;
    const cancelled = events.filter((entry) => entry.status === "cancelled").length;
    return { published, draft, cancelled };
  }, [events]);

  const resetMediaState = useCallback(() => {
    if (heroImagePreview) {
      revokeObjectUrl(heroImagePreview);
    }
    galleryFiles.forEach((item) => {
      if (item.preview) {
        revokeObjectUrl(item.preview);
      }
    });
    setHeroImageFile(null);
    setHeroImagePreview("");
    setExistingHero(null);
    setRemoveHero(false);
    setHeroInputMode(HERO_INPUT_MODES.UPLOAD);
    setHeroUrl("");
    setHeroUrlDraft("");
    setGalleryFiles([]);
    setExistingGallery([]);
    setGalleryUrlEntries([]);
    setGalleryUrlInput("");
    setHeroInputKey((value) => value + 1);
  }, [heroImagePreview, galleryFiles]);

  const updateForm = useCallback((field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleCountryInputChange = useCallback(
    (value) => {
      setCountryInput(value);
      const trimmed = value.trim();
      if (!trimmed) {
        updateForm("countryCode", "");
        return;
      }

      const lowerTrimmed = trimmed.toLowerCase();
      const matchedCountry = COUNTRIES.find(
        (country) =>
          country.name.toLowerCase().startsWith(lowerTrimmed) ||
          country.code.toLowerCase() === lowerTrimmed,
      );

      if (matchedCountry) {
        updateForm("countryCode", matchedCountry.code);
        return;
      }

      if (trimmed.length === 2) {
        updateForm("countryCode", trimmed.toUpperCase());
      } else {
        updateForm("countryCode", "");
      }
    },
    [updateForm],
  );

  const resetForm = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setCountryInput("");
    resetMediaState();
  }, [resetMediaState]);

  const handleOpenCreate = useCallback(() => {
    resetMediaState();
    setForm({ ...EMPTY_FORM });
    setCountryInput("");
    setEditingId(null);
    setClosing(false);
    setFormOpen(true);
  }, [resetMediaState]);

  const closeForm = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setFormOpen(false);
      setClosing(false);
      setEditingId(null);
      resetMediaState();
      setForm({ ...EMPTY_FORM });
      setCountryInput("");
    }, 220);
  }, [resetMediaState]);

  const startEditing = useCallback(
    (eventItem) => {
      resetMediaState();
      setEditingId(eventItem.id);
      const nextForm = eventToForm(eventItem);
      setForm(nextForm);

      const matchedCountry = COUNTRIES.find(
        (country) => country.code === (nextForm.countryCode || "").toUpperCase(),
      );
      setCountryInput(matchedCountry ? matchedCountry.name : nextForm.countryCode || "");

      if (eventItem.heroImage) {
        const storedPath = eventItem.heroImagePath ?? toStoredPathFromUrl(eventItem.heroImage);
        setExistingHero(
          storedPath
            ? {
                url: eventItem.heroImage,
                path: storedPath,
              }
            : null,
        );
        if (isRemoteSource(eventItem.heroImage)) {
          setHeroInputMode(HERO_INPUT_MODES.URL);
          setHeroUrl(eventItem.heroImage);
          setHeroUrlDraft(eventItem.heroImage);
        } else {
          setHeroInputMode(HERO_INPUT_MODES.UPLOAD);
          setHeroUrl("");
          setHeroUrlDraft("");
        }
      } else {
        setExistingHero(null);
        setHeroInputMode(HERO_INPUT_MODES.UPLOAD);
        setHeroUrl("");
        setHeroUrlDraft("");
      }
      setRemoveHero(false);

      const galleryItems = (eventItem.galleryImages ?? []).map((url, index) => {
        const storedPath =
          eventItem.galleryImagePaths?.[index] ?? toStoredPathFromUrl(url);
        if (!storedPath) {
          return null;
        }
        return {
          url,
          path: storedPath,
          keep: true,
        };
      });

      setExistingGallery(galleryItems.filter(Boolean));
      setClosing(false);
      setFormOpen(true);
    },
    [resetMediaState],
  );

  const cancelEditing = useCallback(() => {
    closeForm();
  }, [closeForm]);

  const handleHeroImageChange = useCallback((event) => {
    if (heroInputMode !== HERO_INPUT_MODES.UPLOAD) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (heroImagePreview) {
      revokeObjectUrl(heroImagePreview);
    }
    setHeroImageFile(file);
    const nextPreview = createObjectUrl(file);
    if (nextPreview) {
      setHeroImagePreview(nextPreview);
    } else if (typeof FileReader !== "undefined") {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        setHeroImagePreview(result);
      };
      reader.readAsDataURL(file);
    } else {
      setHeroImagePreview("");
    }
    setHeroUrl("");
    setHeroUrlDraft("");
    setHeroInputMode(HERO_INPUT_MODES.UPLOAD);
    setRemoveHero(false);
  }, [heroImagePreview, heroInputMode]);

  const handleClearHero = useCallback(() => {
    if (heroImagePreview) {
      revokeObjectUrl(heroImagePreview);
    }
    setHeroImageFile(null);
    setHeroImagePreview("");
    if (heroInputMode === HERO_INPUT_MODES.URL) {
      setHeroUrl("");
      setHeroUrlDraft("");
    }
    setHeroInputMode(HERO_INPUT_MODES.UPLOAD);
    setHeroInputKey((value) => value + 1);
    setRemoveHero(false);
  }, [heroImagePreview, heroInputMode]);

  const handleMarkHeroForRemoval = useCallback(() => {
    setRemoveHero(true);
  }, []);

  const handleRestoreHero = useCallback(() => {
    setRemoveHero(false);
  }, []);

  const handleApplyHeroUrl = useCallback(() => {
    const trimmed = normaliseExternalInput(heroUrlDraft);
    if (!trimmed) {
      return;
    }
    if (heroImagePreview) {
      revokeObjectUrl(heroImagePreview);
    }
    setHeroImageFile(null);
    setHeroImagePreview("");
    setHeroInputKey((value) => value + 1);
    setHeroUrl(trimmed);
    setHeroUrlDraft(trimmed);
    setHeroInputMode(HERO_INPUT_MODES.URL);
    setRemoveHero(false);
    setExistingHero({
      url: trimmed,
      path: trimmed,
      keep: true,
    });
  }, [heroImagePreview, heroUrlDraft]);

  const handleHeroUrlInputKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleApplyHeroUrl();
      }
    },
    [handleApplyHeroUrl],
  );

  const handleGalleryFilesChange = useCallback(
    (event) => {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) {
        return;
      }

      const keepCount = existingGallery.filter((item) => item.keep).length;
      const remainingSlots =
        MAX_GALLERY_IMAGES - keepCount - galleryFiles.length - galleryUrlEntries.length;
      if (remainingSlots <= 0) {
        event.target.value = "";
        return;
      }

      const acceptedFiles = files.slice(0, remainingSlots);
      const entries = acceptedFiles.map((file) => {
        const id = makeFileId(file);
        const preview = createObjectUrl(file);

        if (!preview && typeof FileReader !== "undefined") {
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            setGalleryFiles((prev) =>
              prev.map((item) => (item.id === id ? { ...item, preview: result } : item)),
            );
          };
          reader.readAsDataURL(file);
        }

        return {
          id,
          file,
          preview: preview || "",
        };
      });

      setGalleryFiles((prev) => [...prev, ...entries]);
      event.target.value = "";
    },
    [existingGallery, galleryFiles, galleryUrlEntries],
  );

  const handleRemoveNewGallery = useCallback((index) => {
    setGalleryFiles((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed?.preview) {
        revokeObjectUrl(removed.preview);
      }
      return next;
    });
  }, []);

  const handleGalleryUrlInputChange = useCallback((value) => {
    setGalleryUrlInput(value);
  }, []);

  const handleAddGalleryUrl = useCallback(() => {
    const trimmed = normaliseExternalInput(galleryUrlInput);
    if (!trimmed || gallerySlotsRemaining <= 0) {
      return;
    }
    const alreadyQueued =
      existingGallery.some((item) => item.keep && item.path === trimmed) ||
      galleryUrlEntries.some((item) => item.url === trimmed);
    if (alreadyQueued) {
      setGalleryUrlInput("");
      return;
    }
    setGalleryUrlEntries((prev) => [
      ...prev,
      {
        id: makeUniqueId("gallery-url"),
        url: trimmed,
      },
    ]);
    setGalleryUrlInput("");
  }, [galleryUrlInput, gallerySlotsRemaining, existingGallery, galleryUrlEntries]);

  const handleRemoveGalleryUrlEntry = useCallback((id) => {
    setGalleryUrlEntries((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleToggleExistingGallery = useCallback((path) => {
    setExistingGallery((prev) =>
      prev.map((item) =>
        item.path === path
          ? {
              ...item,
              keep: !item.keep,
            }
          : item,
      ),
    );
  }, []);

  const uploadMedia = useCallback(
    async (eventId) => {
      const keepGalleryPaths = existingGallery
        .filter((item) => item.keep && item.path)
        .map((item) => item.path);
      const trimmedHeroUrl = normaliseExternalInput(heroUrl);
      const galleryChanged =
        existingGallery.some((item) => !item.keep) ||
        galleryFiles.length > 0 ||
        galleryUrlEntries.length > 0;
      const heroChanged =
        Boolean(heroImageFile) ||
        (heroInputMode === HERO_INPUT_MODES.URL &&
          trimmedHeroUrl &&
          trimmedHeroUrl !== (existingHero?.path ?? "")) ||
        (removeHero && (existingHero || heroInputMode === HERO_INPUT_MODES.URL));

      if (!heroChanged && !galleryChanged) {
        return;
      }

      const formData = new FormData();
      formData.append("existingGallery", JSON.stringify(keepGalleryPaths));
      formData.append("heroImageMode", heroInputMode);

      if (heroInputMode === HERO_INPUT_MODES.URL && trimmedHeroUrl) {
        formData.append("heroImageUrl", trimmedHeroUrl);
      }

      if (heroInputMode === HERO_INPUT_MODES.UPLOAD && heroImageFile) {
        formData.append("heroImage", heroImageFile);
      }
      if (removeHero && (!heroImageFile || heroInputMode === HERO_INPUT_MODES.URL)) {
        formData.append("removeHeroImage", "true");
      }
      galleryFiles.forEach((item) => {
        formData.append("galleryImages", item.file);
      });
      if (galleryUrlEntries.length > 0) {
        formData.append(
          "galleryImageUrls",
          JSON.stringify(
            galleryUrlEntries
              .map((item) => normaliseExternalInput(item.url))
              .filter((value) => value.length > 0),
          ),
        );
      }

      const response = await fetch(`/api/admin/events/${eventId}/media`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Unable to update event media.");
      }
    },
    [
      existingGallery,
      galleryFiles,
      galleryUrlEntries,
      heroImageFile,
      heroInputMode,
      heroUrl,
      removeHero,
      existingHero,
    ],
  );

  const handleCreate = useCallback(
    async (event) => {
      event.preventDefault();
      setCreating(true);
      setError("");

      try {
        const payload = serialiseForm(form);
        const response = await fetch("/api/admin/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.message || "Unable to create event.");
        }

        const createdEventId = body.event?.id;
        if (createdEventId) {
          await uploadMedia(createdEventId);
        }

        await loadEvents();
        closeForm();
      } catch (createError) {
        console.error("[admin events] create failed", createError);
        setError(createError.message || "Unable to create event.");
      } finally {
        setCreating(false);
      }
    },
    [form, loadEvents, uploadMedia, closeForm],
  );

  const handleUpdate = useCallback(
    async (event) => {
      event.preventDefault();
      if (!editingId) {
        return;
      }

      setSaving(true);
      setError("");

      try {
        const payload = serialiseForm(form);
        const response = await fetch(`/api/admin/events/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.message || "Unable to update event.");
        }

        await uploadMedia(editingId);

        await loadEvents();
        closeForm();
      } catch (updateError) {
        console.error("[admin events] update failed", updateError);
        setError(updateError.message || "Unable to update event.");
      } finally {
        setSaving(false);
      }
    },
    [form, editingId, loadEvents, uploadMedia, closeForm],
  );

  const updateStatus = useCallback(
    async (eventId, status) => {
      setError("");
      try {
        const response = await fetch(`/api/admin/events/${eventId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ status }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.message || "Unable to update status.");
        }

        await loadEvents();
      } catch (statusError) {
        console.error("[admin events] status failed", statusError);
        setError(statusError.message || "Unable to update status.");
      }
    },
    [loadEvents],
  );

  const deleteEvent = useCallback(
    async (eventId) => {
      if (!window.confirm("Delete this event including all reservations?")) {
        return;
      }

      setError("");
      try {
        const response = await fetch(`/api/admin/events/${eventId}`, {
          method: "DELETE",
          credentials: "include",
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || "Unable to delete event.");
        }

        if (editingId === eventId) {
          cancelEditing();
        }
        await loadEvents();
      } catch (deleteError) {
        console.error("[admin events] delete failed", deleteError);
        setError(deleteError.message || "Unable to delete event.");
      }
    },
    [cancelEditing, editingId, loadEvents],
  );

  const loadAttendees = useCallback(
    async (eventId) => {
      if (attendeeEventId === eventId) {
        setAttendeeEventId(null);
        setAttendees([]);
        return;
      }

      setLoadingAttendees(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/events/${eventId}/attendees`, {
          method: "GET",
          credentials: "include",
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || "Unable to load attendees.");
        }

        setAttendeeEventId(eventId);
        setAttendees(payload.attendees ?? []);
      } catch (attendeesError) {
        console.error("[admin events] failed to load attendees", attendeesError);
        setError(attendeesError.message || "Unable to load attendees.");
      } finally {
        setLoadingAttendees(false);
      }
    },
    [attendeeEventId],
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove("modal-open");
      if (heroImagePreview) {
        revokeObjectUrl(heroImagePreview);
      }
      galleryFiles.forEach((item) => {
        if (item.preview) {
          revokeObjectUrl(item.preview);
        }
      });
    };
  }, [heroImagePreview, galleryFiles]);

  const isEditing = Boolean(editingId);
  const activeEvent = useMemo(
    () => (isEditing ? events.find((item) => item.id === editingId) ?? null : null),
    [isEditing, events, editingId],
  );

  const heroPreviewUrl = useMemo(() => {
    if (heroImagePreview) {
      return heroImagePreview;
    }
    if (heroInputMode === HERO_INPUT_MODES.URL) {
      const trimmed = heroUrl.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    if (removeHero) {
      return "";
    }
    if (existingHero?.url) {
      if (existingHero.url.startsWith("http")) {
        return existingHero.url;
      }
      return existingHero.url.startsWith("/")
        ? existingHero.url
        : `/${existingHero.url}`;
    }
    if (existingHero?.path) {
      if (existingHero.path.startsWith("http")) {
        return existingHero.path;
      }
      return `/${existingHero.path}`;
    }
    return "";
  }, [existingHero, heroImagePreview, heroInputMode, heroUrl, removeHero]);

  const resolvedExistingGallery = useMemo(
    () =>
      existingGallery.map((item) => {
        let resolvedUrl = "";
        if (item.url) {
          resolvedUrl = item.url.startsWith("http")
            ? item.url
            : item.url.startsWith("/")
              ? item.url
              : `/${item.url}`;
        } else if (item.path) {
          resolvedUrl = `/${item.path}`;
        }
        return {
          ...item,
          resolvedUrl,
        };
      }),
    [existingGallery],
  );

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const first = new Date(a.startAt).getTime();
      const second = new Date(b.startAt).getTime();
      if (Number.isNaN(first) || Number.isNaN(second)) {
        return 0;
      }
      return first - second;
    });
  }, [events]);

  const heroStatusLabel = useMemo(() => {
    if (heroImageFile) {
      return heroImageFile.name;
    }
    if (heroInputMode === HERO_INPUT_MODES.URL && heroUrl.trim()) {
      return "External URL attached";
    }
    if (removeHero) {
      return "Hero image will be removed";
    }
    if (heroPreviewUrl) {
      return "Hero image attached";
    }
    return "No hero image yet";
  }, [heroImageFile, heroInputMode, heroPreviewUrl, heroUrl, removeHero]);

  return (
    <div className={styles.page}>
              <Header/>
    <div className={styles.contentPage}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Event operations</h1>
          <p className={styles.subtitle}>
            Create experiences, upload promotional imagery, and monitor bookings across the globe.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.backButton} onClick={() => navigate("/admin")}
            aria-label="Back to admin dashboard"
          >
            ← Dashboard
          </button>
          <button type="button" className={styles.linkButton} onClick={() => navigate("/events")}>
            View public events
          </button>
        </div>
      </header>

      <section className={styles.stats} aria-label="Event metrics">
        <article>
          <p>Published</p>
          <strong>{totals.published}</strong>
        </article>
        <article>
          <p>Drafts</p>
          <strong>{totals.draft}</strong>
        </article>
        <article>
          <p>Cancelled</p>
          <strong>{totals.cancelled}</strong>
        </article>
      </section>

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {formOpen
        ? createPortal(
            (
              <div
                className={`${styles.modalOverlay} ${closing ? styles.modalOverlayClosing : ""}`}
                role="dialog"
                aria-modal="true"
              >
                <div
                  className={`${styles.modalContent} ${closing ? styles.modalContentClosing : ""}`}
                >
            <header className={styles.modalHeader}>
              <div>
                <h2>{isEditing ? "Edit event" : "Create new event"}</h2>
                <p className={styles.tableSummary}>
                  {isEditing
                    ? `Updating ${activeEvent?.title ?? "selected event"}`
                    : "Provide the core event details, imagery, and publishing status."}
                </p>
              </div>
              <button type="button" className={styles.modalClose} onClick={cancelEditing} aria-label="Close form">
                <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M6.22 6.22a.75.75 0 0 1 1.06 0L10 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L11.06 10l2.72 2.72a.75.75 0 1 1-1.06 1.06L10 11.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L8.94 10 6.22 7.28a.75.75 0 0 1 0-1.06Z"
                  />
                </svg>
                Close
              </button>
            </header>

            <form className={styles.form} onSubmit={isEditing ? handleUpdate : handleCreate}>
              <div className={styles.formGrid}>
                <label>
                  <span>Title</span>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                    placeholder="Event name"
                  />
                </label>
                <label>
                  <span>Summary</span>
                  <input
                    type="text"
                    required
                    value={form.summary}
                    onChange={(event) => updateForm("summary", event.target.value)}
                    placeholder="Short teaser"
                  />
                </label>
                <label>
                  <span>Timezone</span>
                  <input
                    type="text"
                    required
                    value={form.timezone}
                    onChange={(event) => updateForm("timezone", event.target.value)}
                    placeholder="e.g. Europe/Lisbon"
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => updateForm("status", event.target.value)}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  <span>Capacity</span>
                  <input
                    type="number"
                    min="0"
                    value={form.capacity}
                    onChange={(event) => updateForm("capacity", event.target.value)}
                  />
                </label>
                <label>
                  <span>Price (cents)</span>
                  <input
                    type="number"
                    min="0"
                    value={form.priceCents}
                    onChange={(event) => updateForm("priceCents", event.target.value)}
                  />
                </label>
                <label>
                  <span>Currency</span>
                  <input
                    type="text"
                    value={form.currencyCode}
                    onChange={(event) => updateForm("currencyCode", event.target.value.toUpperCase())}
                  />
                </label>
                <label>
                  <span>Start</span>
                  <input
                    type="datetime-local"
                    required
                    value={form.startAt}
                    onChange={(event) => updateForm("startAt", event.target.value)}
                  />
                </label>
                <label>
                  <span>End</span>
                  <input
                    type="datetime-local"
                    required
                    value={form.endAt}
                    onChange={(event) => updateForm("endAt", event.target.value)}
                  />
                </label>
              </div>

              <label>
                <span>Description</span>
                <textarea
                  value={form.description}
                  required
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="Share the full experience, programming, and perks."
                />
              </label>

              <div className={styles.formGrid}>
                <label>
                  <span>Venue name</span>
                  <input
                    type="text"
                    required
                    value={form.venueName}
                    onChange={(event) => updateForm("venueName", event.target.value)}
                  />
                </label>
                <label>
                  <span>Address line 1</span>
                  <input
                    type="text"
                    required
                    value={form.addressLine1}
                    onChange={(event) => updateForm("addressLine1", event.target.value)}
                  />
                </label>
                <label>
                  <span>Address line 2</span>
                  <input
                    type="text"
                    value={form.addressLine2}
                    onChange={(event) => updateForm("addressLine2", event.target.value)}
                  />
                </label>
                <label>
                  <span>City</span>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(event) => updateForm("city", event.target.value)}
                  />
                </label>
                <label>
                  <span>Region / State</span>
                  <input
                    type="text"
                    value={form.region}
                    onChange={(event) => updateForm("region", event.target.value)}
                  />
                </label>
                <label>
                  <span>Postal code</span>
                  <input
                    type="text"
                    value={form.postalCode}
                    onChange={(event) => updateForm("postalCode", event.target.value)}
                  />
                </label>
            <label>
              <span>Country</span>
              <input
                type="text"
                required
                value={countryInput}
                onChange={(event) => handleCountryInputChange(event.target.value)}
                list="country-options"
                placeholder="Start typing a country"
                autoComplete="off"
              />
            </label>
              </div>

              <section className={styles.mediaSection} aria-label="Event imagery">
                <article className={styles.mediaCard}>
                  <header className={styles.mediaCardHeader}>
                    <div>
                      <h3>Hero image</h3>
                      <p>{heroStatusLabel}</p>
                    </div>
                    <label
                      className={`${styles.mediaUpload} ${
                        heroInputMode === HERO_INPUT_MODES.URL ? styles.mediaUploadDisabled : ""
                      }`}
                    >
                      <input
                        key={heroInputKey}
                        type="file"
                        accept="image/*"
                        disabled={heroInputMode === HERO_INPUT_MODES.URL}
                        onChange={handleHeroImageChange}
                      />
                      <span>Upload</span>
                    </label>
                  </header>
                  <div className={styles.heroUrlControls}>
                    <div className={styles.mediaField}>
                      <label htmlFor={heroUrlInputId}>External URL</label>
                      <input
                        id={heroUrlInputId}
                        type="url"
                        placeholder="https://example.com/hero.jpg"
                        value={heroUrlDraft}
                        onChange={(event) => setHeroUrlDraft(event.target.value)}
                        onKeyDown={handleHeroUrlInputKeyDown}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyHeroUrl}
                      disabled={!normaliseExternalInput(heroUrlDraft)}
                    >
                      Attach URL
                    </button>
                  </div>
                  <div className={styles.heroPreview}>
                    {heroPreviewUrl ? (
                      <img src={heroPreviewUrl} alt="Hero preview" />
                    ) : (
                      <div className={styles.mediaPlaceholder}>No hero selected</div>
                    )}
                    {removeHero && !heroImageFile && (
                      <span className={styles.removeBadge}>Hero will be removed</span>
                    )}
                  </div>
                  <div className={styles.mediaActions}>
                    {(heroImageFile ||
                      (heroInputMode === HERO_INPUT_MODES.URL && normaliseExternalInput(heroUrl))) && (
                      <button type="button" onClick={handleClearHero}>
                        {heroInputMode === HERO_INPUT_MODES.URL ? "Clear URL" : "Clear new image"}
                      </button>
                    )}
                    {existingHero && !removeHero && (
                      <button type="button" onClick={handleMarkHeroForRemoval}>
                        Remove stored hero
                      </button>
                    )}
                    {removeHero && (
                      <button type="button" onClick={handleRestoreHero}>
                        Keep stored hero
                      </button>
                    )}
                  </div>
                </article>

                <article className={styles.mediaCard}>
                  <header className={styles.mediaCardHeader}>
                    <div>
                      <h3>Gallery</h3>
                      <p>{gallerySlotsRemaining > 0 ? `${gallerySlotsRemaining} slots left` : "Maximum reached"}</p>
                    </div>
                    <label
                      className={`${styles.mediaUpload} ${
                        gallerySlotsRemaining <= 0 ? styles.mediaUploadDisabled : ""
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={gallerySlotsRemaining <= 0}
                        onChange={handleGalleryFilesChange}
                      />
                      <span>Add images</span>
                    </label>
                  </header>

                  <div className={styles.galleryGrid}>
                    {resolvedExistingGallery.length === 0 &&
                    galleryFiles.length === 0 &&
                    galleryUrlEntries.length === 0 ? (
                      <div className={styles.mediaPlaceholder}>No gallery images yet</div>
                    ) : (
                      <>
                        {resolvedExistingGallery.map((item) => (
                          <figure
                            className={`${styles.galleryItem} ${item.keep ? "" : styles.galleryItemRemoved}`}
                            key={item.path}
                          >
                            <img src={item.resolvedUrl} alt="Existing gallery" />
                            <figcaption>
                              <button type="button" onClick={() => handleToggleExistingGallery(item.path)}>
                                {item.keep ? "Remove" : "Undo"}
                              </button>
                            </figcaption>
                          </figure>
                        ))}
                        {galleryFiles.map((item, index) => (
                          <figure className={styles.galleryItem} key={item.id}>
                            <img src={item.preview} alt="New gallery upload preview" />
                            <figcaption>
                              <button type="button" onClick={() => handleRemoveNewGallery(index)}>
                                Remove
                              </button>
                            </figcaption>
                          </figure>
                        ))}
                        {galleryUrlEntries.map((item) => (
                          <figure
                            className={`${styles.galleryItem} ${styles.galleryItemRemote}`}
                            key={item.id}
                          >
                            <img src={item.url} alt="External gallery preview" />
                            <figcaption>
                              <button type="button" onClick={() => handleRemoveGalleryUrlEntry(item.id)}>
                                Remove
                              </button>
                            </figcaption>
                          </figure>
                        ))}
                      </>
                    )}
                  </div>
                  <div className={styles.galleryUrlControls}>
                    <div className={styles.mediaField}>
                      <label htmlFor={galleryUrlInputId}>Add external URL</label>
                      <input
                        id={galleryUrlInputId}
                        type="url"
                        placeholder="https://example.com/gallery.jpg"
                        value={galleryUrlInput}
                        onChange={(event) => handleGalleryUrlInputChange(event.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddGalleryUrl}
                      disabled={
                        gallerySlotsRemaining <= 0 || !normaliseExternalInput(galleryUrlInput)
                      }
                    >
                      Add URL
                    </button>
                  </div>
              </article>
            </section>

              <datalist id="country-options">
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.name}>
                    {country.name} ({country.code})
                  </option>
                ))}
              </datalist>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isEditing ? saving : creating}
                >
                  {isEditing ? (saving ? "Saving…" : "Save changes") : creating ? "Creating…" : "Create event"}
                </button>
                {isEditing ? (
                  <button type="button" className={styles.secondaryButton} onClick={cancelEditing} disabled={saving}>
                    Cancel
                  </button>
                ) : (
                  <button type="button" className={styles.secondaryButton} onClick={resetForm} disabled={creating}>
                    Reset form
                  </button>
                )}
              </div>
            </form>
                </div>
              </div>
            ),
            document.body,
          )
        : null}

      <section className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h2>All events</h2>
          <div className={styles.tableActions}>
            <button type="button" className={styles.createButton} onClick={handleOpenCreate}>
              Create event
            </button>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => loadEvents({ showSpinner: !initialised })}
              disabled={loading || refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {!initialised ? (
          <div className={styles.loading}>Loading events…</div>
        ) : events.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No events yet</h3>
            <p>Create your first event to populate the public catalog.</p>
          </div>
        ) : (
          <div
            className={`${styles.tableWrapper} ${refreshing ? styles.tableWrapperRefreshing : ""}`}
          >
            {refreshing && (
              <div className={styles.tableLoading} aria-hidden="true">
                <span className={styles.tableLoadingSpinner} />
                <span>Refreshing…</span>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Schedule</th>
                  <th>Location</th>
                  <th>Availability</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((eventItem) => {
                  const availability = eventItem.availability.remaining;
                  const capacity = eventItem.capacity || 0;
                  const reserved = eventItem.totals?.reserved ?? 0;
                  const tableHero = eventItem.heroImage
                    ? eventItem.heroImage.startsWith("http")
                      ? eventItem.heroImage
                      : eventItem.heroImage.startsWith("/")
                        ? eventItem.heroImage
                        : `/${eventItem.heroImage}`
                    : "";
                  return (
                    <tr key={eventItem.id}>
                      <td>
                        <strong>{eventItem.title}</strong>
                        <p className={styles.tableSummary}>{eventItem.summary}</p>
                        {tableHero && (
                          <img
                            className={styles.tableThumb}
                            src={tableHero}
                            alt=""
                            aria-hidden="true"
                          />
                        )}
                      </td>
                      <td>
                        <p className={styles.tableMeta}>{formatDate(eventItem.startAt)}</p>
                        <p className={styles.tableMeta}>→ {formatDate(eventItem.endAt)}</p>
                      </td>
                      <td>
                        <p className={styles.tableMeta}>{eventItem.venue.name}</p>
                        <p className={styles.tableMeta}>
                          {eventItem.venue.city}, {eventItem.venue.countryCode}
                        </p>
                      </td>
                      <td>
                        <p className={styles.tableMeta}>
                          {reserved} sold · {capacity} capacity
                        </p>
                        <p className={styles.tableMeta}>{availability} seats remaining</p>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            eventItem.status === "published"
                              ? styles.statusPublished
                              : eventItem.status === "draft"
                                ? styles.statusDraft
                                : styles.statusCancelled
                          }`}
                        >
                          {eventItem.status}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" onClick={() => startEditing(eventItem)}>
                            Edit
                          </button>
                          <button type="button" onClick={() => navigate(`/events/${eventItem.slug}`)}>
                            View
                          </button>
                          <button type="button" onClick={() => loadAttendees(eventItem.id)}>
                            {attendeeEventId === eventItem.id ? "Hide attendees" : "Attendees"}
                          </button>
                          {eventItem.status !== "published" && (
                            <button type="button" onClick={() => updateStatus(eventItem.id, "published")}>
                              Publish
                            </button>
                          )}
                          {eventItem.status !== "draft" && (
                            <button type="button" onClick={() => updateStatus(eventItem.id, "draft")}>
                              Draft
                            </button>
                          )}
                          {eventItem.status !== "cancelled" && (
                            <button type="button" onClick={() => updateStatus(eventItem.id, "cancelled")}>
                              Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => deleteEvent(eventItem.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {attendeeEventId && (
        <section className={styles.attendeesSection}>
          <header className={styles.attendeesHeader}>
            <div>
              <h3>Attendees</h3>
              <p className={styles.tableSummary}>
                {events.find((item) => item.id === attendeeEventId)?.title ?? "Selected event"}
              </p>
            </div>
            <button type="button" onClick={() => setAttendeeEventId(null)} disabled={loadingAttendees}>
              Close
            </button>
          </header>
          {loadingAttendees ? (
            <div className={styles.loading}>Loading attendee list…</div>
          ) : attendees.length === 0 ? (
            <p className={styles.tableMeta}>No reservations yet.</p>
          ) : (
            <ul className={styles.attendeeList}>
              {attendees.map((person) => (
                <li key={person.id}>
                  <div>
                    <strong>{person.email}</strong>
                    <p className={styles.tableMeta}>
                      {person.quantity} ticket(s) · {person.status}
                    </p>
                  </div>
                  <code>{person.confirmationCode}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
    </div>
  );
}
