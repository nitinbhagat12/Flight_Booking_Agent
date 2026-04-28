from __future__ import annotations

import time
from typing import Any

from flask import Flask, jsonify, request, Response

# Prometheus
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)

# -------------------- METRICS --------------------

# Total HTTP requests
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"]
)

# Payment metrics
PAYMENT_COUNTER = Counter(
    "payment_status_total",
    "Payment status count",
    ["status"]  # success, failed
)

# Payment attempts
PAYMENT_ATTEMPTS = Counter(
    "payment_attempts_total",
    "Total payment attempts"
)

# Request latency
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "Request latency",
    ["endpoint"]
)

# -------------------- MIDDLEWARE --------------------

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
    return {"status": "ok", "service": "payment-service"}, 200


@app.post("/pay")
def pay():
    """
    Simulated payment:
    - amount <= 0 -> fail
    - odd last digit -> fail
    """

    PAYMENT_ATTEMPTS.inc()

    body = request.get_json(silent=True) or {}

    amount = body.get("amount", 0)
    currency = body.get("currency", "USD")
    booking_id = body.get("booking_id", "")
    payment_method = body.get("payment_method") or {}

    # Validate amount
    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        amount_value = -1

    last4 = str(payment_method.get("last4") or "").strip()
    last_digit = last4[-1] if last4 else ""

    # Rule 1: invalid amount
    if amount_value <= 0:
        PAYMENT_COUNTER.labels(status="failed").inc()

        return jsonify(
            {
                "status": "failed",
                "reason": "invalid_amount",
                "booking_id": booking_id,
                "amount": amount,
                "currency": currency,
            }
        ), 400

    # Rule 2: odd digit fails
    if last_digit.isdigit() and (int(last_digit) % 2 == 1):
        PAYMENT_COUNTER.labels(status="failed").inc()

        return jsonify(
            {
                "status": "failed",
                "reason": "card_declined_demo_rule",
                "booking_id": booking_id,
                "amount": amount_value,
                "currency": currency,
            }
        ), 402

    # Success
    PAYMENT_COUNTER.labels(status="success").inc()

    return jsonify(
        {
            "status": "success",
            "booking_id": booking_id,
            "amount": amount_value,
            "currency": currency,
            "transaction_id": f"TXN-{booking_id or 'NA'}-001",
        }
    ), 200


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)


# -------------------- MAIN --------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)