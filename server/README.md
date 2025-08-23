# Busan Smart Navigation Server

## Setup Instructions

### 1. Environment Variables
Create a `.env` file in the server directory with the following variables:

```bash
# API Keys
KAKAO_REST_KEY=your_kakao_rest_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
OPENWEATHER_API_KEY=your_openweathermap_api_key_here

# Server Configuration
PORT=3001
NODE_ENV=development
```

### 2. API Keys Required

#### Kakao REST API Key
- Get from: [Kakao Developers Console](https://developers.kakao.com/)
- Used for: Route planning and place search

#### Gemini API Key
- Get from: [Google AI Studio](https://makersuite.google.com/app/apikey)
- Used for: Smart recommendations and alternatives

#### OpenWeatherMap API Key
- Get from: [OpenWeatherMap](https://openweathermap.org/api)
- Used for: Weather data and weather-based recommendations

### 3. Install Dependencies
```bash
npm install
```

### 4. Start Server
```bash
npm start
# or
node server.js
```

## Features

- **Route Planning**: Kakao Mobility API integration
- **Crowd Management**: Real-time crowd data from Busan
- **Weather Integration**: OpenWeatherMap API for weather-aware recommendations
- **Smart Recommendations**: AI-powered alternatives using Gemini
- **Safety Scoring**: Crowd density analysis for route safety

## Weather Integration

The server now includes comprehensive weather integration:

- **Current Weather**: Real-time weather data for Busan
- **Weather Forecast**: 5-day weather predictions
- **Smart Recommendations**: Weather-based attraction suggestions
- **Crowd Prediction**: Weather affects crowd behavior analysis

## API Endpoints

- `GET /route` - Route planning
- `GET /search-place` - Place search
- `GET /recommend-alternatives` - AI recommendations
- `GET /api/weather/current` - Current weather
- `GET /api/weather/forecast` - Weather forecast
- `POST /api/weather/recommendation` - Weather-based recommendations 