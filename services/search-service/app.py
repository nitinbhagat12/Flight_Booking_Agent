from __future__ import annotations

from datetime import datetime
from typing import Any

from flask import Flask, jsonify, request, Response

app = Flask(__name__)

# Minimal in-memory counters (enough for a demo).
METRICS = {
    "http_requests_total": 0,
    "flight_search_requests_total": 0,
}


def inc(metric_name: str) -> None:
    METRICS[metric_name] = METRICS.get(metric_name, 0) + 1


@app.before_request
def _count_requests() -> None:
    inc("http_requests_total")


@app.get("/health")
def health() -> tuple[dict[str, Any], int]:
    # Health endpoint used by docker-compose / K8s / CI smoke tests.
    return {"status": "ok", "service": "search-service"}, 200


@app.get("/flights")
def search_flights() -> tuple[Response, int]:
    """
    Dummy flight search.
    Simulates "intelligence" with simple deterministic rules:
    - If from/to missing -> return empty results with a helpful message.
    - Otherwise return a small hard-coded list, with a stable "price" rule.
    """
    inc("flight_search_requests_total")

    src = (request.args.get("from") or "").strip().upper()
    dst = (request.args.get("to") or "").strip().upper()
    date = (request.args.get("date") or "").strip()

    if not src or not dst:
        return jsonify(
            {
                "query": {"from": src, "to": dst, "date": date},
                "results": [],
                "message": "Provide both 'from' and 'to' query params (e.g. ?from=DEL&to=BLR).",
            }
        ), 200

    # Simple "rule-based" pricing: base + distance-ish multiplier using string lengths.
    base_price = 120
    price = base_price + (len(src) + len(dst)) * 15

    # Very small, readable dataset: enough for demos/tests.
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

    return jsonify({"query": {"from": src, "to": dst, "date": date}, "results": results}), 200


@app.get("/metrics")
def metrics() -> Response:
    """
    Minimal Prometheus text-format metrics.
    Real systems use libraries (prometheus_client), but we keep this dependency-free.
    """
    lines = [
        "# HELP http_requests_total Total HTTP requests received",
        "# TYPE http_requests_total counter",
        f"http_requests_total {METRICS.get('http_requests_total', 0)}",
        "# HELP flight_search_requests_total Total flight search requests",
        "# TYPE flight_search_requests_total counter",
        f"flight_search_requests_total {METRICS.get('flight_search_requests_total', 0)}",
    ]
    return Response("\n".join(lines) + "\n", mimetype="text/plain; version=0.0.4")


if __name__ == "__main__":
    # Local dev convenience (Docker runs via `flask run`).
    app.run(host="0.0.0.0", port=5000)


