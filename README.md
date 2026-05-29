# Busan Smart Navigator

> AI-powered city navigation for smarter movement through Busan.

Built for the **DIVE 2025 Global Data Hackathon** — placed **5th out of 89 international teams**.

Busan Smart Navigator combines real-time traffic, crowd density, and live weather data with AI-powered route suggestions to help users navigate Busan more efficiently. Recommendations adapt dynamically to current city conditions.

## Features

- 🚦 **Real-time traffic integration** via Kakao Mobility API
- 🌧️ **Live weather overlay** via OpenWeatherMap API
- 👥 **Crowd density estimation** from Busan public datasets
- 🤖 **AI route suggestions** powered by Gemini API
- 🗺️ **Dynamic recommendations** — routes update based on current conditions

## Tech Stack

| Layer          | Technologies           |
| -------------- | ---------------------- |
| Frontend       | React, TypeScript      |
| AI             | Google Gemini API      |
| Maps & Traffic | Kakao Mobility API     |
| Weather        | OpenWeatherMap API     |
| Data           | Busan Open Data Portal |
| Backend        | Node.js, Express.js    |

## APIs Used

- [Kakao Mobility API](https://developers.kakao.com/) — traffic and route data
- [OpenWeatherMap API](https://openweathermap.org/api) — real-time weather
- [Google Gemini API](https://ai.google.dev/) — AI-powered route reasoning
- [Busan Open Data Portal](https://data.busan.go.kr/) — city crowd and transit datasets

## Getting Started

```bash
# Clone the repository
git clone https://github.com/Aysuliu/smart-navigator.git
cd smart-navigator

# Install dependencies
npm install

# Add your API keys to .env
cp .env.example .env

# Start the app
npm run dev
```

## Hackathon

| Event  | DIVE 2025 — 2nd Global Data Hackathon   |
| ------ | --------------------------------------- |
| Date   | August 23–24, 2025                      |
| Result | 5th place out of 89 international teams |
| Theme  | Smart city data utilization             |

## Author

**Aysuliu Bakhieva** — [GitHub](https://github.com/Aysuliu) · [Portfolio](https://portfolio-aysulu.my.canva.site/)
