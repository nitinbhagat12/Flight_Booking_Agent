import type { BookingPayload, BookingRecord, SearchResponse } from "./types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || res.statusText || "Invalid response");
  }
}

export async function searchFlights(
  from: string,
  to: string,
  date: string,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ from, to, date });
  const res = await fetch(`/api/search/flights?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  return readJson<SearchResponse>(res);
}

export async function createBooking(
  body: BookingPayload,
): Promise<{ data: BookingRecord; httpStatus: number }> {
  const res = await fetch("/api/booking/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson<BookingRecord>(res);
  return { data, httpStatus: res.status };
}

export async function getBooking(bookingId: string): Promise<BookingRecord> {
  const res = await fetch(`/api/booking/bookings/${encodeURIComponent(bookingId)}`);
  if (!res.ok) {
    const err = await readJson<{ error?: string }>(res).catch(() => ({} as { error?: string }));
    throw new Error(err.error ?? `Not found (${res.status})`);
  }
  return readJson<BookingRecord>(res);
}
