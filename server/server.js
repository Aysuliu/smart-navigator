

// server/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

app.use(cors());
app.use(express.json());
// --- Static Data Serving ---
// Serve local static data (hotspots, entrances)
app.use("/data", express.static(path.join(__dirname, "data")));
// --- Configuration ---
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""; // Add GEMINI_API_KEY to your .env
if (!KAKAO_REST_KEY) {
    console.warn("Warning: KAKAO_REST_KEY not found in .env. Kakao API calls may fail.");
}
if (!GEMINI_API_KEY) {
    console.warn("Warning: GEMINI_API_KEY not found in .env. LLM API calls may fail.");
}
// --- Helper Functions (Crowd Density Logic - Translated from Python) ---
/**
 * Calculates a safety score for a given polyline (route or point) based on nearby hotspots.
 * A lower score indicates less crowd exposure.
 * @param {number[][]} polyline - Array of [lat, lon] pairs representing the route or a single point.
 * @param {Object} hotspots - GeoJSON object containing hotspot features.
 * @param {number} radiusMeters - The radius in meters to consider a hotspot "nearby".
 * @returns {number} Cumulative crowd exposure score for the route.
 */
function safetyScore(polyline, hotspots, radiusMeters = 150) {
    if (!hotspots || !hotspots.features || polyline.length === 0) {
        return 0;
    }
    // Approximate degrees per meter for latitude (around Busan's latitude, ~35.15N)
    // 1 degree latitude = ~111.32 km. So, 1 meter = 1 / 111320 degrees.
    const R_deg_lat = radiusMeters / 111320;
    // 1 degree longitude = ~111.32 * cos(latitude) km. For 35.15 N, cos(35.15) ~= 0.817
    // Note: Math.cos expects radians
    const R_deg_lon = radiusMeters / (111320 * Math.cos(35.15 * Math.PI / 180));
    let cumulativeCrowdExposure = 0;
    // Sample points along the polyline to check for hotspots
    const sampleInterval = Math.max(1, Math.floor(polyline.length / 50)); // Sample ~50 points
    const pointsToCheck = polyline.filter((_, i) => i % sampleInterval === 0);
    for (const [lat, lon] of pointsToCheck) {
        for (const f of hotspots.features) {
            const [hlon, hlat] = f.geometry.coordinates;
            const density = f.properties.density || 0;
            const latDiff = Math.abs(lat - hlat);
            const lonDiff = Math.abs(lon - hlon);
            // Simple bounding box check for proximity.
            if (latDiff < R_deg_lat && lonDiff < R_deg_lon) {
                cumulativeCrowdExposure += density;
            }
        }
    }
    return parseFloat(cumulativeCrowdExposure.toFixed(2));
}
/**
 * Determines crowd density status (red, green, grey) based on a score and user tolerance.
 * @param {number} score - The crowd safety score.
 * @param {number} tolerance - User's crowd tolerance (0-1). Lower tolerance means less crowd is acceptable.
 * @returns {'red' | 'green' | 'grey' | 'unknown'} The crowd status.
 */
function getCrowdStatus(score, tolerance) {
    if (typeof score !== 'number' || isNaN(score)) {
        return 'unknown';
    }
    const redThreshold = 2.5 - (tolerance * 2);
    const greenThreshold = 0.5 - (tolerance * 0.4);
    if (score > redThreshold) {
        return 'red';
    }
    if (score > greenThreshold) {
        return 'green';
    }
    return 'grey';
}
// --- API Endpoints ---
// Kakao Directions proxy (keeps REST key off the client)
app.get("/route", async (req, res) => {
  const { o, d, prio = "RECOMMEND", alts = "true", avoid = "" } = req.query;
  const url =
    `https://apis-navi.kakaomobility.com/v1/directions` +
    `?origin=${o}&destination=${d}&priority=${prio}&alternatives=${alts}` +
    `&avoid=${avoid}&road_details=true`;
  try {
    console.log("[Kakao Directions Proxy Request]", url);
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
    });
    const json = await r.json();
    if (!r.ok) {
        console.error("Kakao API Error:", json);
        return res.status(r.status).json(json);
    }
    res.status(r.status).json(json);
  } catch (e) {
    console.error("Error in Kakao Directions proxy:", e);
    res.status(500).json({ error: "Failed to fetch routes from Kakao Mobility API", details: e.message });
  }
});
// Kakao Local Search proxy
app.get("/search-place", async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: "Query parameter is required." });
    }
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`;
    try {
        console.log("[Kakao Local Search Proxy Request]", url);
        const r = await fetch(url, {
            headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
        });
        const json = await r.json();
        if (!r.ok) {
            console.error("Kakao Local Search API Error:", json);
            return res.status(r.status).json(json);
        }
        res.status(r.status).json(json);
    } catch (e) {
        console.error("Error in Kakao Local Search proxy:", e);
        res.status(500).json({ error: "Failed to search place with Kakao Local API", details: e.message });
    }
});
// LLM API for recommendations
app.get("/recommend-alternatives", async (req, res) => {
    const { lat, lon, crowdScore, crowdTolerance } = req.query;
    // For a real app, you'd use the Kakao Local API here to get the place name and type from lat/lon
    // For hackathon, we'll assume a generic "Attraction" type for the LLM prompt.
    const apiKey = GEMINI_API_KEY; // Use API key from .env
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `Given a location at (lat: ${lat}, lon: ${lon}) with a crowd score of ${crowdScore} (on a scale where higher is more crowded) and a user's crowd tolerance of ${crowdTolerance} (on a scale where 0.0 means avoids all crowds and 1.0 means no preference), suggest 2-3 alternative attraction places in Busan. Focus on places that are likely less crowded, similar in general category if possible (e.g., if original is a beach, suggest another beach or park), and within a reasonable travel distance (e.g., within 5-10km). Provide the response as a JSON array of objects, each with 'name' (string) and 'type' (string, e.g., 'park', 'museum', 'cafe'). Do not include coordinates. Example: [{'name': 'Alternative Park', 'type': 'park'}, {'name': 'Quiet Cafe', 'type': 'cafe'}]`;
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = {
        contents: chatHistory,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        "name": { "type": "STRING" },
                        "type": { "type": "STRING" }
                    },
                    "propertyOrdering": ["name", "type"]
                }
            }
        }
    };
    try {
        console.log("[LLM Recommendation Request]");
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const json = result.candidates[0].content.parts[0].text;
            const parsedJson = JSON.parse(json);
            res.status(200).json({ alternatives: parsedJson });
        } else {
            console.error("LLM API did not return expected structure:", result);
            res.status(500).json({ error: "Failed to get recommendations from LLM", details: "Unexpected response structure" });
        }
    } catch (e) {
        console.error("Error calling Gemini API:", e);
        res.status(500).json({ error: "Failed to get recommendations from LLM", details: e.message });
    }
});
const PORT = 3001;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));