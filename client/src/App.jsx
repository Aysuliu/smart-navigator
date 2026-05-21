import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ---------- helpers ---------- */
function toPairs(vertexes) {
  const out = [];
  for (let i = 0; i < vertexes.length; i += 2) {
    const lon = vertexes[i], lat = vertexes[i + 1];
    out.push([lat, lon]);
  }
  return out;
}
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function crowdScoreFor(poiId, curves, date = new Date()) {
  const row = curves.find(x => x.id === poiId);
  if (!row || !row.hourly || row.hourly.length < 24) return 0.5;
  const hour = date.getHours();
  const v = row.hourly[hour];
  return typeof v === "number" ? Math.min(Math.max(v, 0), 1) : 0.5;
}
function crowdLevel(score) {
  if (score < 0.33) return {level: "not crowded", color: "#2e7d32"};     // green
  if (score < 0.66) return {level: "medium",      color: "#fbc02d"};     // yellow
  return {level: "crowded",     color: "#d32f2f"};                        // red
}
function safetyScore(polyline, hotspots, radiusMeters = 120) {
  const R = radiusMeters / 111320;
  let count = 0;
  for (const [lat, lon] of polyline) {
    for (const f of hotspots.features || []) {
      const [hlon, hlat] = f.geometry.coordinates;
      if (Math.abs(lat - hlat) < R && Math.abs(lon - hlon) < R) count++;
    }
  }
  return count;
}
function recommend(selected, pois, curves, n = 3) {
  if (!selected) return [];
  const nowScore = crowdScoreFor(selected.id, curves);
  return pois
    .filter(p => p.id !== selected.id)
    .map(p => {
      const s = crowdScoreFor(p.id, curves);
      const dkm = haversineKm(
        { lat: selected.lat, lon: selected.lon },
        { lat: p.lat, lon: p.lon }
      );
      return { poi: p, score: s, dkm };
    })
    .filter(x => x.score <= 0.33 || x.score <= nowScore - 0.15)
    .sort((a, b) => a.dkm - b.dkm || a.score - b.score)
    .slice(0, n);
}

// Weather helper functions
function getWeatherIcon(condition) {
  const icons = {
    'clear': '☀️',
    'clouds': '☁️',
    'rain': '🌧️',
    'snow': '❄️',
    'thunderstorm': '⛈️',
    'drizzle': '🌦️',
    'mist': '🌫️',
    'fog': '🌫️',
    'haze': '🌫️',
    'smoke': '🌫️',
    'dust': '🌫️',
    'sand': '🌫️',
    'ash': '🌫️',
    'squall': '💨',
    'tornado': '🌪️'
  };
  return icons[condition] || '🌤️';
}

function getWeatherRecommendation(attraction, weather) {
  if (!weather || !attraction) return null;
  
  const { condition, temperature } = weather;
  const { type } = attraction;
  
  if (type === 'beach') {
    if (condition === 'clear' && temperature >= 20) {
      return { message: 'Perfect beach weather!', color: '#2e7d32' };
    } else if (condition === 'rain' || condition === 'thunderstorm') {
      return { message: 'Avoid beach - bad weather', color: '#d32f2f' };
    } else {
      return { message: 'Moderate beach conditions', color: '#fbc02d' };
    }
  } else if (type === 'temple' || type === 'cultural') {
    if (condition === 'rain' || condition === 'snow') {
      return { message: 'Indoor cultural activities recommended', color: '#1976d2' };
    } else {
      return { message: 'Good weather for cultural visits', color: '#2e7d32' };
    }
  } else if (type === 'nature' || type === 'park') {
    if (condition === 'clear' && temperature >= 15) {
      return { message: 'Excellent for outdoor activities', color: '#2e7d32' };
    } else if (condition === 'rain' || condition === 'thunderstorm') {
      return { message: 'Consider indoor alternatives', color: '#d32f2f' };
    } else {
      return { message: 'Moderate outdoor conditions', color: '#fbc02d' };
    }
  }
  
  return { message: 'Standard weather conditions', color: '#666' };
}

/* ---------- component ---------- */
export default function App() {
  // map & overlays
  const [map, setMap] = useState(null);

  // routing
  const [o, setO] = useState(""); // origin is set from geolocation; no hardcoded default
  const [d, setD] = useState("129.0403,35.1151"); // default: Busan Station
  const [locError, setLocError] = useState(null);
  const [priority, setPriority] = useState("RECOMMEND");
  const [avoid, setAvoid] = useState(""); // "", "toll|motorway", etc.
  const [routes, setRoutes] = useState([]);
  const [hotspots, setHotspots] = useState(null);

  // POIs + crowd
  const [pois, setPois] = useState([]);
  const [curves, setCurves] = useState([]);
  const [selectedPoi, setSelectedPoi] = useState(null);
  const [recs, setRecs] = useState([]);
  const [search, setSearch] = useState("");

  // user location
  const [myLoc, setMyLoc] = useState(null);

  // weather
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  /* init map + load data + geolocation */
  useEffect(() => {
    const m = L.map("map").setView([35.155, 129.12], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(m);
    setMap(m);

    (async () => {
      setHotspots(await fetchJSON("/data/hotspots.geojson"));
      setPois(await fetchJSON("/data/pois.json"));
      setCurves(await fetchJSON("/data/crowd_curves.json"));
    })();

    // Fetch weather data
    const fetchWeather = async () => {
      try {
        setWeatherLoading(true);
        const weatherData = await fetchJSON("/api/weather/current");
        setWeather(weatherData.data);
      } catch (error) {
        console.error("Failed to fetch weather:", error);
        // Use fallback weather data
        setWeather({
          temperature: 22,
          condition: 'clear',
          description: 'clear sky',
          humidity: 65,
          windSpeed: 3.2,
          visibility: 10,
          timestamp: Date.now()
        });
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchWeather();
    // Refresh weather every 10 minutes
    const weatherInterval = setInterval(fetchWeather, 10 * 60 * 1000);

    // choose nearest POI on map click
    m.on("click", (e) => {
      if (!pois.length) return;
      const lon = e.latlng.lng, lat = e.latlng.lat;
      let best = null, bestD = Infinity;
      for (const p of pois) {
        const dkm = haversineKm({lat,lon},{lat:p.lat,lon:p.lon});
        if (dkm < bestD) { best = p; bestD = dkm; }
      }
      if (best) {
        setSelectedPoi(best);
        setD(`${best.lon},${best.lat}`);
        setRecs(recommend(best, pois, curves));
      }
    });

    // continuously track the user's position so the origin is always current
    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setMyLoc({ lat, lon });
          setO(`${lon},${lat}`);
          setLocError(null);
        },
        err => {
          const msg =
            err.code === err.PERMISSION_DENIED ? "Location permission denied" :
            err.code === err.POSITION_UNAVAILABLE ? "Location unavailable" :
            err.code === err.TIMEOUT ? "Location request timed out" :
            "Could not get location";
          console.warn("Geolocation error:", err);
          setLocError(msg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocError("Geolocation not supported by this browser");
    }
    return () => {
      m.remove();
      clearInterval(weatherInterval);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* draw hotspots + POI markers */
  useEffect(() => {
    if (!map || !hotspots || !pois.length || !curves.length) return;

    const hotspotLayer = L.geoJSON(hotspots, {
      pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: 4 }),
    }).addTo(map);

    const poiMarkers = L.layerGroup().addTo(map);
    pois.forEach(p => {
      const score = crowdScoreFor(p.id, curves);
      const { color, level } = crowdLevel(score);
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 7, color, weight: 2, fillOpacity: 0.6
      }).addTo(poiMarkers);
      marker.bindPopup(`${p.name} — <b>${level}</b>`);
      marker.on("click", () => {
        setSelectedPoi(p);
        setD(`${p.lon},${p.lat}`);
        setRecs(recommend(p, pois, curves));
      });
    });

    return () => { hotspotLayer.remove(); poiMarkers.remove(); };
  }, [map, hotspots, pois, curves]);

  /* draw routes */
  useEffect(() => {
    if (!map || routes.length === 0) return;
    const layers = [];
    routes.forEach(r => {
      const color =
        r.label.startsWith("FASTEST") ? "#2979ff" :
        r.label.startsWith("SAFER")   ? "#2e7d32" : "#777";
      const poly = L.polyline(r.poly, { weight: 5, opacity: 0.9, color }).addTo(map);
      poly.bindPopup(
        `${r.label} • ${Math.round(r.summary.distance / 100) / 10}km • ${Math.round(r.summary.duration / 60)}min`
      );
      layers.push(poly);
    });
    map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [20, 20] });
    return () => layers.forEach(l => l.remove());
  }, [map, routes]);

  function requestCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  async function getRoutes() {
    // always build origin from the latest known GPS location
    let origin = myLoc ? `${myLoc.lon},${myLoc.lat}` : "";
    if (!origin) {
      try {
        const loc = await requestCurrentPosition();
        setMyLoc(loc);
        setO(`${loc.lon},${loc.lat}`);
        setLocError(null);
        origin = `${loc.lon},${loc.lat}`;
      } catch (err) {
        setLocError("Could not get your current location. Please enable location access.");
        console.error("Geolocation failed:", err);
        return;
      }
    }

    const res = await fetchJSON(
      `/route?o=${encodeURIComponent(origin)}&d=${encodeURIComponent(d)}` +
      `&alts=true&prio=${encodeURIComponent(priority)}&avoid=${encodeURIComponent(avoid)}`
    );
    const parsed = (res.routes || []).map(rt => {
      const segs = rt.sections || [];
      const poly = [];
      segs.forEach(s => (s.roads || []).forEach(r => {
        poly.push(...toPairs(r.vertexes || []));
      }));
      const summary = rt.summary || {
        distance: segs.reduce((a,s)=>a+(s.distance||0),0),
        duration: segs.reduce((a,s)=>a+(s.duration||0),0)
      };
      return { poly, summary };
    });

    // safety label using hotspots (optional)
    const withScores = parsed.map((p, i) => ({
      ...p,
      score: hotspots ? safetyScore(p.poly, hotspots) : 0,
      idx: i,
    }));
    const fastestIdx = withScores.slice()
      .sort((a,b)=>a.summary.duration-b.summary.duration)[0]?.idx;
    const saferIdx = withScores.slice()
      .sort((a,b)=>a.score-b.score || a.summary.duration-b.summary.duration)[0]?.idx;

    setRoutes(withScores.map((r,i)=>({
      ...r,
      label: i===saferIdx ? `SAFER (score ${r.score})`
           : i===fastestIdx ? "FASTEST"
           : `ALT ${i+1} (score ${r.score})`
    })));
  }

  /* search helpers */
  const filtered = search.trim().length === 0 ? [] :
    pois.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0,6);

  function selectPoi(p) {
    setSelectedPoi(p);
    setD(`${p.lon},${p.lat}`);
    setRecs(recommend(p, pois, curves));
    setSearch("");
  }

  /* UI */
  const selectedScore = selectedPoi ? crowdScoreFor(selectedPoi.id, curves) : null;
  const selectedMeta = selectedScore!=null ? crowdLevel(selectedScore) : null;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"400px 1fr", height:"100vh" }}>
      <div style={{ padding: 12, borderRight: "1px solid #ddd", overflowY: "auto", background: "#fafbfc" }}>
        <div style={{ 
          textAlign: "center", 
          marginBottom: 20,
          padding: "20px 0",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: "0 0 16px 16px",
          margin: "-12px -12px 20px -12px",
          color: "white"
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: 24, 
            fontWeight: 700,
            textShadow: "0 2px 4px rgba(0,0,0,0.3)"
          }}>
            🚢 Busan Smart Navigator
          </h1>
          <div style={{ 
            fontSize: 14, 
            opacity: 0.9, 
            marginTop: 4,
            fontWeight: 400
          }}>
            Discover Busan with Crowd Intelligence & Weather
          </div>
        </div>

        {/* Weather Display */}
        {weather && (
          <div style={{ 
            marginBottom: 16, 
            padding: 12, 
            border: "1px solid #e0e0e0", 
            borderRadius: 8,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white"
          }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 24, marginRight: 8 }}>
                {getWeatherIcon(weather.condition)}
              </span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {weather.temperature}°C
                </div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  {weather.description}
                </div>
              </div>
            </div>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr", 
              gap: 8, 
              fontSize: 12,
              opacity: 0.9
            }}>
              <div>💨 Wind: {weather.windSpeed} m/s</div>
              <div>👁️ Visibility: {weather.visibility} km</div>
              <div>💧 Humidity: {weather.humidity}%</div>
              <div>🕐 Updated: {new Date(weather.timestamp).toLocaleTimeString()}</div>
            </div>

            {/* Weather-based recommendation for selected POI */}
            {selectedPoi && (
              <div style={{ 
                marginTop: 12, 
                padding: 8, 
                background: "rgba(255,255,255,0.2)", 
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.3)"
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Weather Advice for {selectedPoi.name}:
                </div>
                {(() => {
                  const recommendation = getWeatherRecommendation(selectedPoi, weather);
                  return recommendation ? (
                    <div style={{ 
                      color: recommendation.color, 
                      fontSize: 11,
                      fontWeight: 500
                    }}>
                      {recommendation.message}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, opacity: 0.8 }}>
                      Check weather conditions before visiting
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Location Indicator */}
        <div style={{ 
          marginBottom: 16,
          padding: 12,
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          background: "#e8f5e8",
          borderColor: "#4caf50"
        }}>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            marginBottom: 8 
          }}>
            <span style={{ fontSize: 16, marginRight: 8 }}>📍</span>
            <span style={{ 
              fontSize: 14, 
              fontWeight: 600, 
              color: "#2e7d32" 
            }}>
              Your Location
            </span>
          </div>
          {myLoc ? (
            <div style={{ fontSize: 12, color: "#388e3c" }}>
              ✅ GPS Location Active
              <div style={{ marginTop: 4, opacity: 0.8 }}>
                {myLoc.lat.toFixed(4)}, {myLoc.lon.toFixed(4)}
              </div>
            </div>
          ) : locError ? (
            <div style={{ fontSize: 12, color: "#c62828" }}>
              ⚠️ {locError}
              <div style={{ marginTop: 4, opacity: 0.8 }}>
                Click "Get Routes" to retry, or enable location in your browser.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#f57c00" }}>
              🔍 Requesting location...
              <div style={{ marginTop: 4, opacity: 0.8 }}>
                Routes will use your current location
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ 
          marginBottom: 16,
          padding: "12px",
          border: "1px solid #e0e0e0",
          borderRadius: 12,
          background: "#f8f9fa"
        }}>
          <label style={{ 
            display: "block", 
            marginBottom: 8,
            fontSize: 16,
            fontWeight: 600,
            color: "#2c3e50"
          }}>
            🔍 Search Attractions
          </label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type attraction name (e.g., Haeundae, BEXCO, Gamcheon)..."
            style={{ 
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 14,
              background: "white",
              boxSizing: "border-box",
              margin: 0
            }}
          />
          {filtered.length > 0 && (
            <div style={{ 
              border: "1px solid #e0e0e0", 
              borderRadius: 8,
              marginTop: 8,
              background: "white",
              maxHeight: "200px",
              overflowY: "auto",
              width: "100%",
              boxSizing: "border-box",
              position: "relative",
              zIndex: 1000
            }}>
              {filtered.map(p => (
                <div 
                  key={p.id} 
                  style={{ 
                    padding: "10px 12px", 
                    cursor: "pointer",
                    borderBottom: "1px solid #f0f0f0",
                    transition: "background-color 0.2s"
                  }}
                  onMouseOver={(e) => e.target.style.background = "#f8f9fa"}
                  onMouseOut={(e) => e.target.style.background = "white"}
                  onClick={() => selectPoi(p)}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#7f8c8d" }}>
                    {p.type} • {p.distance ? `${p.distance.toFixed(1)} km away` : 'Click to select'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected place */}
        {selectedPoi && selectedMeta && (
          <div style={{ 
            marginTop: 16, 
            padding: 12, 
            border: "1px solid #e0e0e0", 
            borderRadius: 12,
            background: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}>
            <div style={{ 
              fontSize: 18, 
              fontWeight: 600, 
              marginBottom: 12,
              color: "#2c3e50"
            }}>
              {selectedPoi.name}
            </div>
            
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              marginBottom: 12 
            }}>
              <span style={{ marginRight: 8 }}>👥</span>
              <span style={{ marginRight: 8 }}>Crowd Level:</span>
              <span style={{
                background: selectedMeta.color, 
                color: "#fff",
                padding: "4px 12px", 
                borderRadius: 20, 
                fontSize: 12,
                fontWeight: 600
              }}>
                {selectedMeta.level}
              </span>
            </div>

            {/* Estimated Travel Time */}
            {routes.length > 0 && (
              <div style={{ 
                marginBottom: 16,
                padding: 12,
                background: "rgba(52, 152, 219, 0.1)",
                border: "1px solid rgba(52, 152, 219, 0.3)",
                borderRadius: 8
              }}>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: 600, 
                  color: "#2980b9",
                  marginBottom: 8
                }}>
                  🚗 Estimated Travel Time
                </div>
                {routes.map((route, index) => (
                  <div key={index} style={{ 
                    display: "flex", 
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 0",
                    borderBottom: index < routes.length - 1 ? "1px solid rgba(52, 152, 219, 0.2)" : "none"
                  }}>
                    <span style={{ fontSize: 13 }}>
                      {route.label}
                    </span>
                    <span style={{ 
                      fontSize: 14, 
                      fontWeight: 600,
                      color: "#2c3e50"
                    }}>
                      {route.summary?.duration ? 
                        `${Math.round(route.summary.duration / 60)} min` : 
                        'Calculating...'
                      }
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ 
              display: "flex", 
              gap: 8,
              marginTop: 16
            }}>
              <button 
                onClick={getRoutes}
                style={{
                  padding: "10px 20px",
                  background: "#3498db",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  flex: 1
                }}
                onMouseOver={(e) => e.target.style.background = "#2980b9"}
                onMouseOut={(e) => e.target.style.background = "#3498db"}
              >
                🚗 Get Route
              </button>
              <button 
                onClick={() => setSelectedPoi(null)}
                style={{
                  padding: "10px 16px",
                  background: "#95a5a6",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600
                }}
                onMouseOver={(e) => e.target.style.background = "#7f8c8d"}
                onMouseOut={(e) => e.target.style.background = "#95a5a6"}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recs.length > 0 && (
          <div style={{ 
            marginTop: 16,
            padding: 12,
            border: "1px solid #e0e0e0",
            borderRadius: 12,
            background: "#f8f9fa"
          }}>
            <div style={{ 
              fontWeight: 600, 
              fontSize: 16,
              marginBottom: 12,
              color: "#2c3e50"
            }}>
              🎯 Quieter Nearby Spots
            </div>
            {recs.map(x => (
              <div key={x.poi.id} style={{ 
                display: "flex", 
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0", 
                cursor: "pointer",
                borderBottom: "1px solid #e9ecef",
                transition: "background-color 0.2s"
              }}
              onMouseOver={(e) => e.target.parentElement.style.background = "#e9ecef"}
              onMouseOut={(e) => e.target.parentElement.style.background = "transparent"}
              onClick={() => selectPoi(x.poi)}>
                <span style={{ fontSize: 14 }}>{x.poi.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    background: crowdLevel(x.score).color, 
                    color: "#fff",
                    padding: "3px 10px", 
                    borderRadius: 16, 
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    {crowdLevel(x.score).level}
                  </span>
                  <span style={{ 
                    fontSize: 12, 
                    color: "#7f8c8d",
                    fontWeight: 500
                  }}>
                    {x.dkm.toFixed(1)} km
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Route Options */}
        <div style={{ 
          marginTop: 16,
          padding: 12,
          border: "1px solid #e0e0e0",
          borderRadius: 12,
          background: "#f8f9fa"
        }}>
          <div style={{ 
            fontWeight: 600, 
            fontSize: 16,
            marginBottom: 12,
            color: "#2c3e50"
          }}>
            🛣️ Route Options
          </div>
          
          <div style={{ 
            marginBottom: 16,
            padding: 12,
            background: "rgba(52, 152, 219, 0.1)",
            border: "1px solid rgba(52, 152, 219, 0.3)",
            borderRadius: 8,
            fontSize: 12,
            color: "#2980b9"
          }}>
            <strong>📍 Auto-routing:</strong> Routes will automatically start from your current GPS location to the selected destination.
          </div>
          
          <div style={{ marginBottom: 12 }}>
            <label style={{ 
              display: "block", 
              marginBottom: 6,
              fontSize: 14,
              fontWeight: 500,
              color: "#34495e"
            }}>
              Priority:
            </label>
            <select 
              value={priority} 
              onChange={e => setPriority(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                background: "white"
              }}
            >
              <option value="RECOMMEND">🎯 Smart Recommendation</option>
              <option value="TIME">⚡ Fastest Route</option>
              <option value="DISTANCE">📏 Shortest Distance</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ 
              display: "block", 
              marginBottom: 6,
              fontSize: 14,
              fontWeight: 500,
              color: "#34495e"
            }}>
              Avoid:
            </label>
            <select 
              value={avoid} 
              onChange={e => setAvoid(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                background: "white"
              }}
            >
              <option value="">🚫 Nothing (prefer fastest)</option>
              <option value="toll">💰 Tolls</option>
              <option value="motorway">🛣️ Highways</option>
              <option value="ferries">⛴️ Ferries</option>
              <option value="schoolzone">🏫 School Zones</option>
              <option value="uturn">🔄 U-turns</option>
              <option value="toll|motorway">💰🛣️ Tolls + Highways</option>
            </select>
          </div>

          <button 
            onClick={getRoutes}
            disabled={!selectedPoi}
            style={{
              width: "100%",
              padding: "12px 20px",
              background: selectedPoi ? "#27ae60" : "#bdc3c7",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: selectedPoi ? "pointer" : "not-allowed",
              fontWeight: 600,
              fontSize: 16,
              transition: "background-color 0.2s"
            }}
            onMouseOver={(e) => {
              if (selectedPoi) e.target.style.background = "#229954";
            }}
            onMouseOut={(e) => {
              if (selectedPoi) e.target.style.background = "#27ae60";
            }}
          >
            🚗 Get Routes
          </button>
        </div>

        <div style={{
          fontSize: 12,
          opacity: 0.7,
          marginTop: 16,
          padding: 12,
          background: "#ecf0f1",
          borderRadius: 8,
          lineHeight: 1.5
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "#2c3e50" }}>
            💡 How to use:
          </div>
          <div>• 🔍 Search for attractions or click on the map markers</div>
          <div>• 🎯 Select your destination to see crowd levels and details</div>
          <div>• 🚗 Get smart routes with estimated travel times</div>
          <div>• 🌤️ Check weather conditions for better planning</div>
          <div>• 🟢 Green = not crowded, 🟡 Yellow = medium, 🔴 Red = crowded</div>
          <div>• 📍 Routes automatically start from your current GPS location</div>
        </div>
      </div>

      <div id="map"></div>
    </div>
  );
}
