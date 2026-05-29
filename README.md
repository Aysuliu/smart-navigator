# Busan Smart Navigator

AI-assisted navigation and trip planning for Busan, combining route data, local crowd signals, and weather-aware attraction advice.

Built for the **DIVE 2025 Global Data Hackathon** — placed **5th out of 89 international teams**.

## What It Does

Busan Smart Navigator helps users choose places to visit and routes through Busan with current context in mind. The app shows Busan attractions on an interactive map, estimates crowd levels from local data, displays current weather, and can request route alternatives from Kakao Mobility.

Users can:

- Search or click Busan attractions on the map
- See crowd levels for selected points of interest
- View quieter nearby alternatives from local crowd curves
- Get routes from their current GPS location to a selected destination
- Compare fastest and crowd-aware route labels
- Check current Busan weather and weather-based attraction advice
- Request AI-generated alternative attraction suggestions through Gemini

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, JavaScript, Vite |
| Map UI | Leaflet with OpenStreetMap tiles |
| Backend | Node.js, Express.js |
| Routing & Place Search | Kakao Mobility / Kakao Local APIs |
| Weather | OpenWeatherMap API |
| AI Recommendations | Google Gemini API |
| Local Data | GeoJSON and JSON datasets in `server/data` |

## Project Structure

```text
.
├── client/              # Vite + React frontend
│   └── src/App.jsx      # Main map and navigation UI
├── server/              # Express API server
│   ├── server.js        # API routes and Kakao/Gemini proxies
│   ├── weather_integration.js
│   └── data/            # Local POI, hotspot, entrance, and crowd data
└── README.md
```

## APIs Used

- [Kakao Mobility API](https://developers.kakao.com/) — route planning
- [Kakao Local API](https://developers.kakao.com/) — place search proxy
- [OpenWeatherMap API](https://openweathermap.org/api) — current weather and forecast
- [Google Gemini API](https://ai.google.dev/) — AI-generated alternative attraction suggestions
- Local Busan-oriented datasets in `server/data` — POIs, hotspots, entrances, and hourly crowd curves

## Getting Started

### 1. Install Dependencies

Install frontend and backend dependencies separately:

```bash
cd server
npm install

cd ../client
npm install
```

### 2. Configure API Keys

Create a `.env` file inside the `server` directory:

```bash
cd server
touch .env
```

Add your API keys:

```env
KAKAO_REST_KEY=your_kakao_rest_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
OPENWEATHER_API_KEY=your_openweathermap_api_key_here
```

### 3. Start the Backend

From the `server` directory:

```bash
npm start
```

The API server runs on:

```text
http://localhost:3001
```

### 4. Start the Frontend

In a second terminal, from the `client` directory:

```bash
npm run dev
```

The Vite dev server will print the local frontend URL, usually:

```text
http://localhost:5173
```

The client proxies `/route`, `/data`, `/api`, `/search-place`, and `/recommend-alternatives` requests to the backend server.

## Backend Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /route` | Proxies Kakao Mobility directions |
| `GET /search-place` | Proxies Kakao keyword place search |
| `GET /recommend-alternatives` | Requests Gemini-powered Busan attraction alternatives |
| `GET /api/weather/current` | Returns current Busan weather |
| `GET /api/weather/forecast` | Returns weather forecast data |
| `POST /api/weather/recommendation` | Returns weather-based attraction advice |
| `GET /data/*` | Serves local static datasets |

## Notes

- The displayed map uses Leaflet and OpenStreetMap tiles.
- Kakao API keys stay on the backend; the frontend calls Express proxy endpoints.
- Crowd levels are estimated from local JSON/GeoJSON data rather than a live crowd API.
- Weather data falls back to demo values if OpenWeatherMap is unavailable.
- GPS permission is required for routes starting from the user's current location.

## Hackathon

| Event | DIVE 2025 — 2nd Global Data Hackathon |
| --- | --- |
| Date | August 23–24, 2025 |
| Result | 5th place out of 89 international teams |
| Theme | Smart city data utilization |

## Author

**Aysuliu Bakhieva** — [GitHub](https://github.com/Aysuliu) · [Portfolio](https://portfolio-aysulu.my.canva.site/)
