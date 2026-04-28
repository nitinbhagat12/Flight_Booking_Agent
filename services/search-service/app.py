from __future__ import annotations

import time
from datetime import datetime
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

# Flight search requests
SEARCH_REQUESTS = Counter(
    "flight_search_requests_total",
    "Total flight search requests"
)

# Latency
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
    return {"status": "ok", "service": "search-service"}, 200


@app.get("/flights")
def search_flights():
    """
    Dummy flight search.
    """
    SEARCH_REQUESTS.inc()

    src = (request.args.get("from") or "").strip().upper()
    dst = (request.args.get("to") or "").strip().upper()
    date = (request.args.get("date") or "").strip()

    if not src or not dst:
        return jsonify(
            {
                "query": {"from": src, "to": dst, "date": date},
                "results": [],
                "message": "Provide both 'from' and 'to' query params.",
            }
        ), 200

    base_price = 120
    price = base_price + (len(src) + len(dst)) * 15

    results = [
        {
            "flight_id": "FL-1001",
            "from": src,
            "to": dst,
            "date": date or datetime.utcnow().date().isoformat(),
            "airline": "DemoAir",
            "depart_time": "09:00",
            "arrive_time": "11:05",
            "price": price,
            "currency": "USD",
        },
        {
            "flight_id": "FL-1002",
            "from": src,
            "to": dst,
            "date": date or datetime.utcnow().date().isoformat(),
            "airline": "MockJet",
            "depart_time": "16:30",
            "arrive_time": "18:50",
            "price": price + 25,
            "currency": "USD",
        },
    ]

    return jsonify(
        {
            "query": {"from": src, "to": dst, "date": date},
            "results": results
        }
    ), 200


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)


# -------------------- MAIN --------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)