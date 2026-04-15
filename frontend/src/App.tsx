import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { createBooking, getBooking, searchFlights } from "./api";
import type { BookingRecord, Flight } from "./types";

type TimePreference = "any" | "morning" | "afternoon" | "evening" | "night";
type SortPreference = "recommended" | "price_low" | "depart_early";
type TopPage = "search" | "trips" | "track" | "policies" | "account";

interface ParsedPrompt {
  fromCode?: string;
  toCode?: string;
  dateISO?: string;
  budget?: number;
  timePreference?: TimePreference;
  travelers?: number;
}

interface DecoratedFlight extends Flight {
  recommendationScore: number;
}

interface SavedTrip {
  booking_id: string;
  route: string;
  flight_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

const CITY_TO_CODE: Record<string, string> = {
  delhi: "DEL",
  mumbai: "BOM",
  bombay: "BOM",
  bengaluru: "BLR",
  bangalore: "BLR",
  chennai: "MAA",
  kolkata: "CCU",
  calcutta: "CCU",
  hyderabad: "HYD",
  pune: "PNQ",
  goa: "GOI",
  ahmedabad: "AMD",
  jaipur: "JAI",
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusClass(status: string): string {
  if (status === "PAID") return "status-badge--paid";
  if (status === "PAYMENT_FAILED" || status === "PAYMENT_UNREACHABLE") return "status-badge--fail";
  return "status-badge--pending";
}

function timeBucketFromHour(hour: number): TimePreference {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function parseHour(time: string): number {
  const [h] = time.split(":");
  const parsed = Number(h);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLocationToCode(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  if (CITY_TO_CODE[cleaned]) return CITY_TO_CODE[cleaned];
  return cleaned.toUpperCase().slice(0, 3);
}

function parsePrompt(prompt: string, fallbackYear: number): ParsedPrompt {
  const text = prompt.toLowerCase();
  const parsed: ParsedPrompt = {};

  const routeWithFrom = text.match(/from\s+([a-zA-Z ]+?)\s+to\s+([a-zA-Z ]+)/i);
  const simpleRoute = text.match(/\b([a-zA-Z]{3,})\s+to\s+([a-zA-Z]{3,})\b/i);
  const routeMatch = routeWithFrom ?? simpleRoute;
  if (routeMatch) {
    const src = routeMatch[1]?.trim();
    const dst = routeMatch[2]?.trim();
    if (src) parsed.fromCode = normalizeLocationToCode(src);
    if (dst) parsed.toCode = normalizeLocationToCode(dst);
  }

  const budgetMatch =
    text.match(/\b(?:budget|under|below|max(?:imum)?)\s*(?:of|is|inr|rs)?\s*(\d{3,6})\b/i) ??
    text.match(/\b(\d{3,6})\s*(?:inr|rs)\b/i);
  if (budgetMatch?.[1]) parsed.budget = Number(budgetMatch[1]);

  if (text.includes("morning")) parsed.timePreference = "morning";
  else if (text.includes("afternoon")) parsed.timePreference = "afternoon";
  else if (text.includes("evening")) parsed.timePreference = "evening";
  else if (text.includes("night")) parsed.timePreference = "night";

  const travelerMatch =
    text.match(/\b(\d{1,2})\s*(?:traveler|travellers|travelers|passenger|passengers|person|persons|people|pax)\b/i) ??
    text.match(/\bfor\s+(\d{1,2})\b/i);
  if (travelerMatch?.[1]) parsed.travelers = Number(travelerMatch[1]);

  const dateMatch = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\b/i);
  if (dateMatch?.[1] && dateMatch?.[2]) {
    const day = Number(dateMatch[1]);
    const month = MONTHS[dateMatch[2].toLowerCase()];
    if (month && day >= 1 && day <= 31) {
      const dd = String(day).padStart(2, "0");
      const mm = String(month).padStart(2, "0");
      parsed.dateISO = `${fallbackYear}-${mm}-${dd}`;
    }
  }

  return parsed;
}

export default function App() {
  const defaultDate = useMemo(() => todayISODate(), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const [activePage, setActivePage] = useState<TopPage>("search");
  const [from, setFrom] = useState("DEL");
  const [to, setTo] = useState("BLR");
  const [date, setDate] = useState(defaultDate);
  const [travelers, setTravelers] = useState("1");
  const [cabinClass, setCabinClass] = useState("economy");
  const [maxBudget, setMaxBudget] = useState("");
  const [preferredTime, setPreferredTime] = useState<TimePreference>("any");
  const [sortBy, setSortBy] = useState<SortPreference>("recommended");
  const [smartPrompt, setSmartPrompt] = useState("Delhi to Mumbai on 16 April evening with budget 6000 for 2 persons");
  const [promptNotice, setPromptNotice] = useState<string | null>(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem("fa_user"));

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

  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>(() => {
    try {
      const raw = localStorage.getItem("fa_trips");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedTrip[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [openPolicy, setOpenPolicy] = useState<string | null>("cancellation");

  const filteredResults = useMemo(() => {
    const budgetNum = Number(maxBudget);
    const hasBudget = Number.isFinite(budgetNum) && budgetNum > 0;
    const decorated: DecoratedFlight[] = results.map((flight) => {
      let score = 100;
      score -= Math.min(flight.price / 50, 45);
      if (hasBudget && flight.price <= budgetNum) score += 18;
      if (hasBudget && flight.price > budgetNum) score -= 25;
      if (preferredTime !== "any" && timeBucketFromHour(parseHour(flight.depart_time)) === preferredTime) score += 12;
      return { ...flight, recommendationScore: score };
    });

    const visible = decorated.filter((flight) => {
      if (hasBudget && flight.price > budgetNum) return false;
      if (preferredTime !== "any" && timeBucketFromHour(parseHour(flight.depart_time)) !== preferredTime) return false;
      return true;
    });

    return [...visible].sort((a, b) => {
      if (sortBy === "price_low") return a.price - b.price;
      if (sortBy === "depart_early") return parseHour(a.depart_time) - parseHour(b.depart_time);
      return b.recommendationScore - a.recommendationScore;
    });
  }, [results, maxBudget, preferredTime, sortBy]);

  const cheapestVisible = useMemo(
    () => (filteredResults.length ? Math.min(...filteredResults.map((f) => f.price)) : null),
    [filteredResults],
  );
  const paidTrips = useMemo(() => savedTrips.filter((trip) => trip.status === "PAID").length, [savedTrips]);
  const failedTrips = useMemo(() => savedTrips.filter((trip) => trip.status !== "PAID").length, [savedTrips]);

  useEffect(() => {
    if (currentUser) localStorage.setItem("fa_user", currentUser);
    else localStorage.removeItem("fa_user");
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem("fa_trips", JSON.stringify(savedTrips));
  }, [savedTrips]);

  async function performSearch(nextFrom: string, nextTo: string, nextDate: string) {
    setSearchError(null);
    setSearchMessage(null);
    setSearchLoading(true);
    try {
      const data = await searchFlights(nextFrom.trim(), nextTo.trim(), nextDate);
      setResults(data.results);
      setSearchMessage(data.message ?? null);
      setActivePage("search");
    } catch (err) {
      setResults([]);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handlePromptSearch(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parsePrompt(smartPrompt, currentYear);
    const nextFrom = parsed.fromCode ?? from;
    const nextTo = parsed.toCode ?? to;
    const nextDate = parsed.dateISO ?? date;
    const nextTravelers = parsed.travelers && parsed.travelers >= 1 ? String(parsed.travelers) : travelers;
    if (parsed.budget) setMaxBudget(String(parsed.budget));
    if (parsed.timePreference) setPreferredTime(parsed.timePreference);
    setTravelers(nextTravelers);
    setFrom(nextFrom);
    setTo(nextTo);
    setDate(nextDate);
    setPromptNotice(`Searching ${nextFrom} to ${nextTo} on ${nextDate} for ${nextTravelers} traveler(s).`);
    await performSearch(nextFrom, nextTo, nextDate);
  }

  async function handleManualSearch(e: React.FormEvent) {
    e.preventDefault();
    await performSearch(from, to, date);
  }

  function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    const displayName = authMode === "signup" ? name.trim() || "Traveler" : email.split("@")[0] || "Traveler";
    setCurrentUser(displayName);
    setAuthOpen(false);
    setPassword("");
    setPromptNotice(`Welcome ${displayName}.`);
  }

  function handleLogout() {
    setCurrentUser(null);
    setPromptNotice("Logged out.");
  }

  function openBook(flight: Flight) {
    setBookingFlight(flight);
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
      setSavedTrips((prev) => [
        {
          booking_id: data.booking_id,
          route: `${bookingFlight.from} -> ${bookingFlight.to}`,
          flight_id: bookingFlight.flight_id,
          amount: bookingFlight.price,
          currency: bookingFlight.currency,
          status: data.status,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
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
      <div className="topbar">
        <div className="topbar__inner">
          <div className="logo">FlightAgentic</div>
          <nav className="topnav">
            {[
              ["search", "Search"],
              ["trips", "My Trips"],
              ["track", "Track"],
              ["policies", "Policies"],
              ["account", "Account"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`topnav__link ${activePage === id ? "topnav__link--active" : ""}`}
                onClick={() => setActivePage(id as TopPage)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="topbar__actions">
            {currentUser ? (
              <>
                <span className="user-chip">{currentUser}</span>
                <button type="button" className="btn btn--ghost" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => setAuthOpen(true)}>
                Login / Sign up
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="shell">
        <section className="hero panel">
          <h1 className="brand__title">Book smarter with prompt search</h1>
          <p className="brand__subtitle">Plan trips using natural language, then compare and book instantly.</p>
          <form className="hero__prompt" onSubmit={handlePromptSearch}>
            <textarea
              className="prompt-box"
              value={smartPrompt}
              onChange={(ev) => setSmartPrompt(ev.target.value)}
              placeholder="Delhi to Mumbai on 16 April evening with budget 6000 for 2 persons"
            />
            <button type="submit" className="btn btn--primary" disabled={searchLoading}>
              {searchLoading ? "Searching..." : "Search"}
            </button>
          </form>
          {promptNotice ? <div className="alert alert--info">{promptNotice}</div> : null}
        </section>

        {activePage === "search" ? (
          <section className="page-grid">
            <article className="panel">
              <h2 className="panel__title">Flight Search</h2>
              <form className="form-grid" onSubmit={handleManualSearch}>
                <div className="field">
                  <label htmlFor="from">From</label>
                  <input id="from" value={from} onChange={(e) => setFrom(e.target.value.toUpperCase())} />
                </div>
                <div className="field">
                  <label htmlFor="to">To</label>
                  <input id="to" value={to} onChange={(e) => setTo(e.target.value.toUpperCase())} />
                </div>
                <div className="field">
                  <label htmlFor="date">Date</label>
                  <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="travelers">Persons</label>
                  <input id="travelers" type="number" min={1} max={9} value={travelers} onChange={(e) => setTravelers(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="cabin">Cabin</label>
                  <select id="cabin" value={cabinClass} onChange={(e) => setCabinClass(e.target.value)}>
                    <option value="economy">Economy</option>
                    <option value="premium_economy">Premium Economy</option>
                    <option value="business">Business</option>
                  </select>
                </div>
                <button type="submit" className="btn btn--primary">Run search</button>
              </form>
              <div className="filters-grid">
                <div className="field">
                  <label htmlFor="budget">Budget</label>
                  <input id="budget" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="time">Time</label>
                  <select id="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value as TimePreference)}>
                    <option value="any">Any</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sort">Sort</label>
                  <select id="sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortPreference)}>
                    <option value="recommended">Recommended</option>
                    <option value="price_low">Low Price</option>
                    <option value="depart_early">Early Departure</option>
                  </select>
                </div>
                <div className="stats-card">
                  <span className="stats-card__label">Best fare</span>
                  <strong className="stats-card__value">{cheapestVisible ?? "--"}</strong>
                  <span className="stats-card__sub">{filteredResults.length} options</span>
                </div>
              </div>
              {searchError ? <div className="alert alert--error">{searchError}</div> : null}
              {searchMessage ? <div className="alert alert--info">{searchMessage}</div> : null}
            </article>

            <article className="panel">
              <h2 className="panel__title">Recommendations</h2>
              {filteredResults.length === 0 ? (
                <div className="empty">No flights yet. Try a route search.</div>
              ) : (
                <div className="cards">
                  {filteredResults.map((f) => (
                    <article key={f.flight_id} className="card">
                      <div className="card__top">
                        <span className="airline">{f.airline}</span>
                        <span className="flight-id">{f.flight_id}</span>
                      </div>
                      <div className="tag-row">
                        <span className="chip chip--accent">AI {Math.round(f.recommendationScore)}</span>
                        <span className="chip">{timeBucketFromHour(parseHour(f.depart_time))}</span>
                        <span className="chip">{travelers} pax</span>
                      </div>
                      <div className="route"><span className="route__code">{f.from}</span><span className="route__arrow">→</span><span className="route__code">{f.to}</span></div>
                      <div className="times"><span>{f.depart_time}</span><span>{f.arrive_time}</span></div>
                      <div className="price-row">
                        <div className="price">{f.price}<small>{f.currency}</small></div>
                        <button type="button" className="btn btn--primary" onClick={() => openBook(f)}>Book</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activePage === "trips" ? (
          <section className="panel">
            <h2 className="panel__title">My Trips Dashboard</h2>
            <div className="trip-summary-row">
              <div className="trip-summary-pill">Total {savedTrips.length}</div>
              <div className="trip-summary-pill">Paid {paidTrips}</div>
              <div className="trip-summary-pill">Issues {failedTrips}</div>
            </div>
            {savedTrips.length === 0 ? (
              <div className="empty">No trips yet. Book a flight to build your timeline.</div>
            ) : (
              <div className="history-list">
                {savedTrips.map((trip) => (
                  <article className="history-item" key={trip.booking_id}>
                    <div>
                      <strong>{trip.route}</strong>
                      <p className="hint">{trip.flight_id}</p>
                    </div>
                    <div>
                      <span className={`status-badge ${statusClass(trip.status)}`}>{trip.status.replace(/_/g, " ")}</span>
                      <p className="hint">{trip.amount} {trip.currency}</p>
                    </div>
                    <button type="button" className="btn btn--ghost" onClick={() => { setLookupId(trip.booking_id); setActivePage("track"); }}>
                      Track
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activePage === "track" ? (
          <section className="panel">
            <h2 className="panel__title">Track Booking Status</h2>
            <form className="lookup" onSubmit={handleLookup}>
              <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="Enter booking ID" />
              <button type="submit" className="btn btn--primary" disabled={lookupLoading}>
                {lookupLoading ? "Checking..." : "Track now"}
              </button>
            </form>
            {lookupError ? <div className="alert alert--error">{lookupError}</div> : null}
            {lookupResult ? (
              <div className="alert alert--info">
                <span className={`status-badge ${statusClass(lookupResult.status)}`}>{lookupResult.status.replace(/_/g, " ")}</span>
                <p className="mono">{lookupResult.booking_id}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {activePage === "policies" ? (
          <section className="panel">
            <h2 className="panel__title">Travel Policies & Support</h2>
            <div className="policy-grid">
              {[
                ["cancellation", "Cancellation", "Free cancellation within 24 hours, then airline fare rules apply."],
                ["reschedule", "Reschedule", "Date and time changes allowed based on fare class and availability."],
                ["baggage", "Baggage", "Cabin and check-in limits vary by airline and route."],
              ].map(([id, title, body]) => (
                <article className="policy-card" key={id}>
                  <button type="button" className="policy-toggle" onClick={() => setOpenPolicy(openPolicy === id ? null : id)}>
                    <h3>{title}</h3>
                    <span>{openPolicy === id ? "−" : "+"}</span>
                  </button>
                  {openPolicy === id ? <p>{body}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activePage === "account" ? (
          <section className="panel">
            <h2 className="panel__title">Account</h2>
            {currentUser ? (
              <div className="trip-grid">
                <div className="trip-card"><h3>Logged in</h3><p>{currentUser}</p></div>
                <div className="trip-card"><h3>Saved trips</h3><p>{savedTrips.length}</p></div>
              </div>
            ) : (
              <div className="empty">Login or sign up to personalize your booking dashboard.</div>
            )}
          </section>
        ) : null}
      </main>

      <footer className="footer">
        <div className="footer__grid">
          <div><h4>FlightAgentic</h4><p>AI assisted travel planning and booking demo platform.</p></div>
          <div><h4>Products</h4><p>Flight Search</p><p>Trip Tracking</p><p>Policy Center</p></div>
          <div><h4>Support</h4><p>Help Center</p><p>Cancellation</p><p>Contact</p></div>
          <div><h4>Legal</h4><p>Terms</p><p>Privacy</p><p>Refund Rules</p></div>
        </div>
      </footer>

      {bookingFlight ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="book-title">
          <div className="modal">
            <div className="modal__head">
              <h3 id="book-title" className="modal__title">Complete booking</h3>
              <button type="button" className="modal__close" onClick={closeModal}>×</button>
            </div>
            <p className="modal__summary">
              <strong>{bookingFlight.airline}</strong> · {bookingFlight.flight_id} · {bookingFlight.from} → {bookingFlight.to}
            </p>
            {!lastBooking ? (
              <form className="form-grid" onSubmit={handleBook} style={{ gridTemplateColumns: "1fr" }}>
                <div className="field"><label htmlFor="guest">Guest ID</label><input id="guest" value={guestId} onChange={(e) => setGuestId(e.target.value)} /></div>
                <div className="field"><label htmlFor="last4">Card last 4</label><input id="last4" inputMode="numeric" maxLength={4} value={cardLast4} onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
                {bookError ? <div className="alert alert--error">{bookError}</div> : null}
                <button type="submit" className="btn btn--primary" disabled={bookLoading}>{bookLoading ? "Processing..." : "Pay & confirm"}</button>
              </form>
            ) : (
              <div className="alert alert--success">
                <span className={`status-badge ${statusClass(lastBooking.status)}`}>{lastBooking.status.replace(/_/g, " ")}</span>
                <p className="mono">{lastBooking.booking_id}</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className="modal">
            <div className="modal__head">
              <h3 id="auth-title" className="modal__title">{authMode === "login" ? "Login" : "Create account"}</h3>
              <button type="button" className="modal__close" onClick={() => setAuthOpen(false)}>×</button>
            </div>
            <form className="form-grid" onSubmit={handleAuthSubmit} style={{ gridTemplateColumns: "1fr" }}>
              {authMode === "signup" ? (
                <div className="field"><label htmlFor="name">Full name</label><input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
              ) : null}
              <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <button type="submit" className="btn btn--primary">{authMode === "login" ? "Login" : "Sign up"}</button>
            </form>
            <button type="button" className="btn btn--ghost" style={{ marginTop: "0.75rem", width: "100%" }} onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
              {authMode === "login" ? "Need account? Sign up" : "Already have account? Login"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
