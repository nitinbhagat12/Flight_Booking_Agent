# FlightAgentic

FlightAgentic pairs a **React web UI** with a small **travel-booking microservices** demo. The backend services return dummy flights, create bookings, and simulate payments—useful for learning **Docker**, **docker-compose**, **CI/CD**, and **Kubernetes**.

## Architecture

- **`web`**: static UI (nginx) with reverse proxy to the APIs—open **http://localhost:8081** after `docker compose up`
- **`search-service`**: dummy flight search (JSON)
- **`booking-service`**: accepts bookings; calls `payment-service` for “pay”
- **`payment-service`**: simulated success/failure (simple rules)

Compose networking: `booking-service` → `http://payment-service:5000`. The browser talks only to **`web`**; nginx forwards `/api/search/*` and `/api/booking/*` so you avoid CORS issues.

## Folder structure

```
.
├── docker-compose.yml
├── frontend/                 # Vite + React + TypeScript UI
├── k8s/
├── monitoring/
│   └── prometheus.yml
├── services/
│   ├── booking-service/
│   ├── payment-service/
│   └── search-service/
└── .github/workflows/ci.yml
```

## APIs (quick reference)

### search-service

- `GET /health`
- `GET /flights?from=DEL&to=BLR&date=2026-01-15`
- `GET /metrics`

### booking-service

- `GET /health`
- `POST /bookings`
- `GET /bookings/<booking_id>`
- `GET /metrics`

### payment-service

- `GET /health`
- `POST /pay`
- `GET /metrics`

## Run locally (docker-compose)

Prerequisites: Docker Desktop

```bash
docker compose up --build
```

- **UI**: http://localhost:8081  
- **APIs** (direct): search `5001`, booking `5002`, payment `5003`

### Frontend only (local dev)

With the three API containers running (`docker compose up`), from `frontend/`:

```bash
npm install
npm run dev
```

Vite serves the app at http://localhost:5173 and proxies `/api/search` → `localhost:5001`, `/api/booking` → `localhost:5002`.

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/ci.yml` — builds images, runs `docker compose up -d`, smoke-tests health endpoints and the web root.

## Kubernetes (beginner level)

Manifests in `k8s/` define a Deployment + ClusterIP Service per backend service. The UI is not included there yet; you would add a similar Deployment/Service for `frontend` or host static assets behind an Ingress.

## Monitoring (optional)

See `monitoring/prometheus.yml` and each service’s `GET /metrics`.
