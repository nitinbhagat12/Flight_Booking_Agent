from __future__ import annotations

from typing import Any

from flask import Flask, jsonify, request, Response

app = Flask(__name__)

METRICS = {
    "http_requests_total": 0,
    "payment_attempts_total": 0,
    "payment_success_total": 0,
    "payment_failure_total": 0,
}


def inc(metric_name: str) -> None:
    METRICS[metric_name] = METRICS.get(metric_name, 0) + 1


@app.before_request
def _count_requests() -> None:
    inc("http_requests_total")


@app.get("/health")
def health() -> tuple[dict[str, Any], int]:
    return {"status": "ok", "service": "payment-service"}, 200


@app.post("/pay")
def pay() -> tuple[Response, int]:
    """
    Simulated payment:
    - amount <= 0 -> fail
    - if payment_method.last4 ends with an odd digit -> fail (simple rule)
    - otherwise success

    This is intentionally deterministic and explainable (interview-friendly).
    """
    inc("payment_attempts_total")
    body = request.get_json(silent=True) or {}

    amount = body.get("amount", 0)
    currency = body.get("currency", "USD")
    booking_id = body.get("booking_id", "")
    payment_method = body.get("payment_method") or {}

    # Basic validation (keep readable).
    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        amount_value = -1

    last4 = str(payment_method.get("last4") or "").strip()
    last_digit = last4[-1] if last4 else ""

    if amount_value <= 0:
        inc("payment_failure_total")
        return jsonify(
            {
                "status": "failed",
                "reason": "invalid_amount",
                "booking_id": booking_id,
                "amount": amount,
                "currency": currency,
            }
        ), 400

    if last_digit.isdigit() and (int(last_digit) % 2 == 1):
        inc("payment_failure_total")
        return jsonify(
            {
                "status": "failed",
                "reason": "card_declined_demo_rule",
                "booking_id": booking_id,
                "amount": amount_value,
                "currency": currency,
            }
        ), 402

    inc("payment_success_total")
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
def metrics() -> Response:
    lines = [
        "# HELP http_requests_total Total HTTP requests received",
        "# TYPE http_requests_total counter",
        f"http_requests_total {METRICS.get('http_requests_total', 0)}",
        "# HELP payment_attempts_total Total payment attempts",
        "# TYPE payment_attempts_total counter",
        f"payment_attempts_total {METRICS.get('payment_attempts_total', 0)}",
        "# HELP payment_success_total Total successful payments",
        "# TYPE payment_success_total counter",
        f"payment_success_total {METRICS.get('payment_success_total', 0)}",
        "# HELP payment_failure_total Total failed payments",
        "# TYPE payment_failure_total counter",
        f"payment_failure_total {METRICS.get('payment_failure_total', 0)}",
    ]
    return Response("\n".join(lines) + "\n", mimetype="text/plain; version=0.0.4")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)


