<<<<<<< HEAD
# Flight_Booking_Agent
The proposed solution is an Agentic AI–powered Flight Booking System that leverages autonomous, goal-driven intelligent agents to manage the complete flight booking lifecycle. The system interprets user intent using natural language understanding, orchestrates multiple specialized agents to perform real-time flight search, price comparison, and constraint-based reasoning, and delivers personalized recommendations. A supervisory agent coordinates worker agents to handle dynamic pricing, availability validation, and booking execution while ensuring fault tolerance and consistency. Deployed using a scalable microservices architecture, the solution ensures high reliability, transparency, and an optimized booking experience with minimal human intervention.
=======
# Travel Booking Microservices Demo (DevOps Intern Interview Project)

Minimal, interview-oriented microservices demo showing **Docker**, **docker-compose**, **CI/CD (GitHub Actions)**, **Kubernetes**, and **(optional) monitoring**.

## Architecture (very simple)

- **`search-service`**: returns dummy flight search results (JSON)
- **`booking-service`**: accepts booking requests; simulates “reserve → pay” by calling `payment-service`
- **`payment-service`**: simulates payment success/failure using simple rules

Local (docker-compose) communication:

- `booking-service` calls `payment-service` via HTTP on the compose network (`http://payment-service:5000`)

## Folder structure

```
.
├── docker-compose.yml
├── k8s/
│   ├── booking-deployment.yaml
│   ├── booking-service.yaml
│   ├── payment-deployment.yaml
│   ├── payment-service.yaml
│   ├── search-deployment.yaml
│   └── search-service.yaml
├── monitoring/
│   └── prometheus.yml
├── services/
│   ├── booking-service/
│   │   ├── app.py
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── payment-service/
│   │   ├── app.py
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── search-service/
│       ├── app.py
│       ├── Dockerfile
│       └── requirements.txt
└── .github/
    └── workflows/
        └── ci.yml
```

## APIs (quick reference)

### search-service
- `GET /health`
- `GET /flights?from=DEL&to=BLR&date=2026-01-15`
- `GET /metrics` (Prometheus text format; minimal counters)

### booking-service
- `GET /health`
- `POST /bookings` (creates a booking and calls `payment-service`)
- `GET /bookings/<booking_id>` (fetch stored booking status)
- `GET /metrics`

### payment-service
- `GET /health`
- `POST /pay` (simulates payment)
- `GET /metrics`

## Run locally (docker-compose)

Prereqs: Docker Desktop

```bash
docker compose up --build
```

Then try:

```bash
curl http://localhost:5001/health
curl "http://localhost:5001/flights?from=DEL&to=BLR&date=2026-01-15"

curl http://localhost:5002/health
curl -X POST http://localhost:5002/bookings ^
  -H "Content-Type: application/json" ^
  -d "{\"user_id\":\"u1\",\"flight_id\":\"FL-1001\",\"amount\":199.99,\"payment_method\":{\"type\":\"card\",\"last4\":\"4242\"}}"

curl http://localhost:5003/health
```

Ports:
- `search-service`: `localhost:5001`
- `booking-service`: `localhost:5002`
- `payment-service`: `localhost:5003`

## CI/CD (GitHub Actions) – how it works

Workflow: `.github/workflows/ci.yml`

Steps:
- checkout repo
- build Docker images for all services
- run stack via `docker compose up -d`
- smoke test with a few `curl` requests (health endpoints)

This is intentionally **basic**: it demonstrates container build + run validation without introducing complex deployment logic.

## Kubernetes (beginner level)

Manifests in `k8s/`:
- One **Deployment** and one **ClusterIP Service** per microservice.

Apply:

```bash
kubectl apply -f k8s/
```

Notes:
- These manifests reference images like `travel-demo/search-service:latest`.
- In a real pipeline you’d push images to a registry and update tags. For an interview demo, keeping tags simple is okay.

To access locally (example using port-forward):

```bash
kubectl port-forward svc/search-service 5001:80
kubectl port-forward svc/booking-service 5002:80
kubectl port-forward svc/payment-service 5003:80
```

## Monitoring (optional, simple Prometheus)

Config: `monitoring/prometheus.yml`

- Each service exposes `GET /metrics` with a tiny Prometheus-compatible text output.
- Prometheus would scrape those endpoints.

Where monitoring fits (conceptually):
- In production, Prometheus runs as its own Deployment in the cluster and scrapes services via Service discovery.
- For this demo, we provide a minimal scrape config and a `metrics` endpoint so you can talk about the pattern in interviews.


>>>>>>> 0301455 (Initial Commit)
