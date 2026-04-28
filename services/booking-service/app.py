from __future__ import annotations

import os
import uuid
import time
from typing import Any

import requests
from flask import Flask, jsonify, request, Response

# Prometheus
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)

# In-memory DB (demo purpose)
BOOKINGS: dict[str, dict[str, Any]] = {}

# -------------------- METRICS --------------------

# Total HTTP requests
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"]
)

# Booking operations
BOOKING_COUNTER = Counter(
    "booking_status_total",
    "Booking status count",
    ["status"]  # success, failed
)

# Request latency
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "Request latency",
    ["endpoint"]
)

# -------------------- HELPERS --------------------

def payment_base_url() -> str:
    return os.environ.get("PAYMENT_URL", "http://localhost:5003").rstrip("/")

@app.before_request
def before_request():
    request.start_time = time.time()

@app.after_request
def after_request(response):
    latency = time.time() - request.start_time

    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.path,
        status=response.status_code
    ).inc()

    REQUEST_LATENCY.labels(endpoint=request.path).observe(latency)

    return response

# -------------------- ROUTES --------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "booking-service"}, 200


@app.post("/bookings")
def create_booking():
    body = request.get_json(silent=True) or {}

    user_id = str(body.get("user_id") or "").strip()
    flight_id = str(body.get("flight_id") or "").strip()
    amount = body.get("amount")
    payment_method = body.get("payment_method") or {}

    if not user_id or not flight_id:
        BOOKING_COUNTER.labels(status="failed").inc()
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

    # Call payment service
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

        BOOKING_COUNTER.labels(status="failed").inc()
        return jsonify(booking), 502

    if resp.status_code == 200:
        booking["status"] = "PAID"
        booking["payment"] = resp.json()
        BOOKINGS[booking_id] = booking

        BOOKING_COUNTER.labels(status="success").inc()
        return jsonify(booking), 201

    # Payment failed
    booking["status"] = "PAYMENT_FAILED"
    try:
        booking["payment"] = resp.json()
    except ValueError:
        booking["payment"] = {"raw": resp.text}

    BOOKINGS[booking_id] = booking
    BOOKING_COUNTER.labels(status="failed").inc()

    return jsonify(booking), 402


@app.get("/bookings/<booking_id>")
def get_booking(booking_id: str):
    booking = BOOKINGS.get(booking_id)
    if not booking:
        return jsonify({"error": "not_found"}), 404
    return jsonify(booking), 200


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)


# -------------------- MAIN --------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)