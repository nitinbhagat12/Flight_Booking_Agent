from __future__ import annotations

import os
import uuid
from typing import Any

import requests
from flask import Flask, jsonify, request, Response

app = Flask(__name__)

# In a real system, you'd use a DB (Postgres, Redis, etc.).
# For an interview demo, in-memory storage keeps things simple and readable.
BOOKINGS: dict[str, dict[str, Any]] = {}

METRICS = {
    "http_requests_total": 0,
    "booking_create_total": 0,
    "booking_paid_total": 0,
    "booking_failed_total": 0,
}


def inc(metric_name: str) -> None:
    METRICS[metric_name] = METRICS.get(metric_name, 0) + 1


@app.before_request
def _count_requests() -> None:
    inc("http_requests_total")


def payment_base_url() -> str:
    # docker-compose sets PAYMENT_URL to http://payment-service:5000
    # K8s can set it to http://payment-service (service DNS) because we expose port 80.
    return os.environ.get("PAYMENT_URL", "http://localhost:5003").rstrip("/")


@app.get("/health")
def health() -> tuple[dict[str, Any], int]:
    return {"status": "ok", "service": "booking-service"}, 200


@app.post("/bookings")
def create_booking() -> tuple[Response, int]:
    """
    Create a booking and attempt payment.

    Flow (intentionally simple):
    - validate request
    - create booking_id
    - call payment-service /pay
    - store status (PAID or PAYMENT_FAILED)
    """
    inc("booking_create_total")

    body = request.get_json(silent=True) or {}
    user_id = str(body.get("user_id") or "").strip()
    flight_id = str(body.get("flight_id") or "").strip()
    amount = body.get("amount")
    payment_method = body.get("payment_method") or {}

    if not user_id or not flight_id:
        inc("booking_failed_total")
        return jsonify({"error": "user_id and flight_id are required"}), 400

    booking_id = str(uuid.uuid4())
    booking = {
        "booking_id": booking_id,
        "user_id": user_id,
        "flight_id": flight_id,
        "amount": amount,
        "currency": body.get("currency", "USD"),
        "status": "PENDING_PAYMENT",
    }

    # Call payment-service (service-to-service communication).
    try:
        resp = requests.post(
            f"{payment_base_url()}/pay",
            json={
                "booking_id": booking_id,
                "amount": amount,
                "currency": booking["currency"],
                "payment_method": payment_method,
            },
            timeout=2.5,
        )
    except requests.RequestException as exc:
        booking["status"] = "PAYMENT_UNREACHABLE"
        booking["error"] = str(exc)
        BOOKINGS[booking_id] = booking
        inc("booking_failed_total")
        return jsonify(booking), 502

    if resp.status_code == 200:
        booking["status"] = "PAID"
        booking["payment"] = resp.json()
        BOOKINGS[booking_id] = booking
        inc("booking_paid_total")
        return jsonify(booking), 201

    # Payment failed (demo).
    booking["status"] = "PAYMENT_FAILED"
    try:
        booking["payment"] = resp.json()
    except ValueError:
        booking["payment"] = {"raw": resp.text}
    BOOKINGS[booking_id] = booking
    inc("booking_failed_total")
    return jsonify(booking), 402


@app.get("/bookings/<booking_id>")
def get_booking(booking_id: str) -> tuple[Response, int]:
    booking = BOOKINGS.get(booking_id)
    if not booking:
        return jsonify({"error": "not_found"}), 404
    return jsonify(booking), 200


@app.get("/metrics")
def metrics() -> Response:
    lines = [
        "# HELP http_requests_total Total HTTP requests received",
        "# TYPE http_requests_total counter",
        f"http_requests_total {METRICS.get('http_requests_total', 0)}",
        "# HELP booking_create_total Total booking create attempts",
        "# TYPE booking_create_total counter",
        f"booking_create_total {METRICS.get('booking_create_total', 0)}",
        "# HELP booking_paid_total Total paid bookings",
        "# TYPE booking_paid_total counter",
        f"booking_paid_total {METRICS.get('booking_paid_total', 0)}",
        "# HELP booking_failed_total Total failed bookings",
        "# TYPE booking_failed_total counter",
        f"booking_failed_total {METRICS.get('booking_failed_total', 0)}",
    ]
    return Response("\n".join(lines) + "\n", mimetype="text/plain; version=0.0.4")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)


