import { useMemo, useState } from "react";
import "./App.css";
import { createBooking, getBooking, searchFlights } from "./api";
import type { BookingRecord, Flight } from "./types";

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusClass(status: string): string {
  if (status === "PAID") return "status-badge--paid";
  if (status === "PAYMENT_FAILED" || status === "PAYMENT_UNREACHABLE") {
    return "status-badge--fail";
  }
  return "status-badge--pending";
}

export default function App() {
  const defaultDate = useMemo(() => todayISODate(), []);

  const [from, setFrom] = useState("DEL");
  const [to, setTo] = useState("BLR");
  const [date, setDate] = useState(defaultDate);

  const [results, setResults] = useState<Flight[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [bookingFlight, setBookingFlight] = useState<Flight | null>(null);
  const [guestId, setGuestId] = useState("guest-01");
  const [cardLast4, setCardLast4] = useState("4242");
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [lastBooking, setLastBooking] = useState<BookingRecord | null>(null);

  const [lookupId, setLookupId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<BookingRecord | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setSearchMessage(null);
    setSearchLoading(true);
    try {
      const data = await searchFlights(from.trim(), to.trim(), date);
      setResults(data.results);
      setSearchMessage(data.message ?? null);
    } catch (err) {
      setResults([]);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  function openBook(f: Flight) {
    setBookingFlight(f);
    setBookError(null);
    setLastBooking(null);
  }

  function closeModal() {
    setBookingFlight(null);
    setBookLoading(false);
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!bookingFlight) return;
    setBookLoading(true);
    setBookError(null);
    setLastBooking(null);
    try {
      const { data } = await createBooking({
        user_id: guestId.trim() || "guest",
        flight_id: bookingFlight.flight_id,
        amount: bookingFlight.price,
        currency: bookingFlight.currency,
        payment_method: { type: "card", last4: cardLast4.trim() },
      });
      setLastBooking(data);
    } catch (err) {
      setBookError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBookLoading(false);
    }
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setLookupResult(null);
    const id = lookupId.trim();
    if (!id) return;
    setLookupLoading(true);
    try {
      const data = await getBooking(id);
      setLookupResult(data);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div className="app">
      <div className="app__bg" aria-hidden />
      <div className="app__grid" aria-hidden />

      <div className="shell">
        <header className="header">
          <div className="brand">
            <h1 className="brand__title">FlightAgentic</h1>
            <p className="brand__subtitle">
              Search demo flights, compare options, and complete a booking flow backed by your
              microservices stack.
            </p>
          </div>
          <div className="pill-row">
            <span className="pill pill--accent">Live APIs</span>
            <span className="pill">Search · Book · Pay</span>
          </div>
        </header>

        <section className="panel" aria-labelledby="search-title">
          <h2 id="search-title" className="panel__title">
            Where are you going?
          </h2>
          <form className="form-grid" onSubmit={handleSearch}>
            <div className="field">
              <label htmlFor="from">From</label>
              <input
                id="from"
                name="from"
                autoComplete="off"
                placeholder="e.g. DEL"
                value={from}
                onChange={(ev) => setFrom(ev.target.value.toUpperCase())}
                maxLength={8}
              />
            </div>
            <div className="field">
              <label htmlFor="to">To</label>
              <input
                id="to"
                name="to"
                autoComplete="off"
                placeholder="e.g. BLR"
                value={to}
                onChange={(ev) => setTo(ev.target.value.toUpperCase())}
                maxLength={8}
              />
            </div>
            <div className="field">
              <label htmlFor="date">Date</label>
              <input
                id="date"
                name="date"
                type="date"
                value={date}
                onChange={(ev) => setDate(ev.target.value)}
              />
            </div>
            <div className="field">
              <label className="sr-only" htmlFor="search-btn">
                Search
              </label>
              <button
                id="search-btn"
                type="submit"
                className="btn btn--primary"
                style={{ width: "100%" }}
                disabled={searchLoading}
              >
                {searchLoading ? (
                  <>
                    <span className="spinner" aria-hidden />
                    Searching…
                  </>
                ) : (
                  "Search flights"
                )}
              </button>
            </div>
          </form>
          {searchError ? (
            <div className="alert alert--error" role="alert">
              {searchError}
            </div>
          ) : null}
          {searchMessage ? (
            <div className="alert alert--info" role="status">
              {searchMessage}
            </div>
          ) : null}
        </section>

        <section className="section" aria-label="Search results">
          <div className="section__head">
            <h2 className="section__title">Results</h2>
            {results.length > 0 ? (
              <span className="pill">{results.length} options</span>
            ) : null}
          </div>
          {results.length === 0 && !searchLoading ? (
            <div className="empty">
              Run a search with airport codes to see sample itineraries from the search service.
            </div>
          ) : (
            <div className="cards">
              {results.map((f) => (
                <article key={f.flight_id} className="card">
                  <div className="card__top">
                    <span className="airline">{f.airline}</span>
                    <span className="flight-id">{f.flight_id}</span>
                  </div>
                  <div className="route">
                    <span className="route__code">{f.from}</span>
                    <span className="route__arrow" aria-hidden>
                      →
                    </span>
                    <span className="route__code">{f.to}</span>
                  </div>
                  <div className="times">
                    <span>
                      Depart <strong>{f.depart_time}</strong>
                    </span>
                    <span>
                      Arrive <strong>{f.arrive_time}</strong>
                    </span>
                  </div>
                  <div className="price-row">
                    <div className="price">
                      {f.price}
                      <small>{f.currency}</small>
                    </div>
                    <button type="button" className="btn btn--primary" onClick={() => openBook(f)}>
                      Book
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="section panel" aria-labelledby="lookup-title">
          <h2 id="lookup-title" className="panel__title">
            Look up a booking
          </h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Paste a <code className="mono">booking_id</code> returned after you book.
          </p>
          <form className="lookup" onSubmit={handleLookup}>
            <input
              type="text"
              placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
              value={lookupId}
              onChange={(ev) => setLookupId(ev.target.value)}
              aria-label="Booking ID"
            />
            <button type="submit" className="btn btn--ghost" disabled={lookupLoading}>
              {lookupLoading ? "Loading…" : "Fetch status"}
            </button>
          </form>
          {lookupError ? (
            <div className="alert alert--error" role="alert">
              {lookupError}
            </div>
          ) : null}
          {lookupResult ? (
            <div className="alert alert--info" role="status">
              <span className={`status-badge ${statusClass(lookupResult.status)}`}>
                {lookupResult.status.replace(/_/g, " ")}
              </span>
              <p className="mono" style={{ margin: "0.75rem 0 0" }}>
                {lookupResult.booking_id}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {bookingFlight ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="book-title">
          <div className="modal">
            <div className="modal__head">
              <h3 id="book-title" className="modal__title">
                Complete booking
              </h3>
              <button type="button" className="modal__close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <p className="modal__summary">
              <strong>{bookingFlight.airline}</strong> · {bookingFlight.flight_id} ·{" "}
              {bookingFlight.from} → {bookingFlight.to} ·{" "}
              <strong>
                {bookingFlight.price} {bookingFlight.currency}
              </strong>
            </p>
            {!lastBooking ? (
              <form className="form-grid" onSubmit={handleBook} style={{ gridTemplateColumns: "1fr" }}>
                <div className="field">
                  <label htmlFor="guest">Guest / user ID</label>
                  <input
                    id="guest"
                    value={guestId}
                    onChange={(ev) => setGuestId(ev.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="field">
                  <label htmlFor="last4">Card last 4 digits</label>
                  <input
                    id="last4"
                    inputMode="numeric"
                    maxLength={4}
                    value={cardLast4}
                    onChange={(ev) => setCardLast4(ev.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="4242"
                  />
                </div>
                <p className="hint">
                  Demo rule: if the last digit is <strong>odd</strong>, payment fails. Try{" "}
                  <code className="mono">4242</code> (even) for success.
                </p>
                {bookError ? (
                  <div className="alert alert--error" role="alert">
                    {bookError}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  <button type="submit" className="btn btn--primary" disabled={bookLoading}>
                    {bookLoading ? (
                      <>
                        <span className="spinner" aria-hidden />
                        Processing…
                      </>
                    ) : (
                      "Pay & confirm"
                    )}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={closeModal}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div
                  className={`alert ${
                    lastBooking.status === "PAID" ? "alert--success" : "alert--error"
                  }`}
                  role="status"
                >
                  <span className={`status-badge ${statusClass(lastBooking.status)}`}>
                    {lastBooking.status.replace(/_/g, " ")}
                  </span>
                  <p style={{ margin: "0.65rem 0 0" }}>
                    Booking ID — copy this for lookup:
                  </p>
                  <p className="mono" style={{ margin: "0.35rem 0 0" }}>
                    {lastBooking.booking_id}
                  </p>
                </div>
                <button type="button" className="btn btn--primary" style={{ marginTop: "0.85rem", width: "100%" }} onClick={closeModal}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
