export interface Flight {
  flight_id: string;
  from: string;
  to: string;
  date: string;
  airline: string;
  depart_time: string;
  arrive_time: string;
  price: number;
  currency: string;
}

export interface SearchResponse {
  query: { from: string; to: string; date: string };
  results: Flight[];
  message?: string;
}

export interface BookingPayload {
  user_id: string;
  flight_id: string;
  amount: number;
  currency?: string;
  payment_method: { type: string; last4: string };
}

export interface BookingRecord {
  booking_id: string;
  user_id: string;
  flight_id: string;
  amount: unknown;
  currency: string;
  status: string;
  payment?: unknown;
  error?: string;
}
