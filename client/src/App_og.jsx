import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function safetyScore(polyline, hotspots, radiusMeters = 120) {
  const R = radiusMeters / 111320; // ~deg/m
  let count = 0;
  for (const [lat, lon] of polyline) {
    for (const f of hotspots.features) {
      const [hlon, hlat] = f.geometry.coordinates;
      if (Math.abs(lat - hlat) < R && Math.abs(lon - hlon) < R) count++;
    }
  }
  return count;
}

export default function App() {
  const [map, setMap] = useState(null);
  const [o, setO] = useState("129.1580,35.1595"); // Haeundae
  const [d, setD] = useState("129.0403,35.1151"); // Busan Station
  const [routes, setRoutes] = useState([]);
  const [hotspots, setHotspots] = useState(null);
  const [entrances, setEntrances] = useState([]);
  const [choice, setChoice] = useState("SAFER"); // SAFER or FASTEST
  const [priority, setPriority] = useState("RECOMMEND"); // TIME or DISTANCE
  const [avoid, setAvoid] = useState(""); // e.g., "toll|motorway|schoolzone"

  useEffect(() => {
    const m = L.map("map").setView([35.155, 129.12], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(m);
    setMap(m);
    (async () => {
      setHotspots(await fetchJSON("/data/hotspots.geojson"));
      setEntrances(await fetchJSON("/data/entrances.json"));
    })();
    return () => m.remove();
  }, []);

  // draw hotspots + entrances
  useEffect(() => {
    if (!map || !hotspots) return;
    const layer = L.geoJSON(hotspots, {
      pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: 5 }),
    }).addTo(map);
    const ents = entrances.map(e =>
      L.marker([e.lat, e.lon]).bindPopup(e.name).addTo(map)
    );
    return () => {
      layer.remove();
      ents.forEach(m => m.remove());
    };
  }, [map, hotspots, entrances]);

  // draw routes
  useEffect(() => {
    if (!map || routes.length === 0) return;
    const layers = [];
    routes.forEach(r => {
      const color =
        r.label.startsWith("FASTEST") ? "#2979ff" :
        r.label.startsWith("SAFER")   ? "#2e7d32" :
                                        "#777";
      const poly = L.polyline(r.poly, { weight: 5, opacity: 0.9, color }).addTo(map);
      poly.bindPopup(
        `${r.label} • ${Math.round(r.summary.distance / 100) / 10}km • ${Math.round(r.summary.duration / 60)}min`
      );
      layers.push(poly);
    });
    map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [20, 20] });
    return () => layers.forEach(l => l.remove());
  }, [map, routes]);

  async function getRoutes() {
    const res = await fetchJSON(
      `/route?o=${encodeURIComponent(o)}&d=${encodeURIComponent(d)}` +
      `&alts=true&prio=${encodeURIComponent(priority)}&avoid=${encodeURIComponent(avoid)}`
    );
    const parsed = (res.routes || []).map(rt => {
      const segs = rt.sections || [];
      const poly = [];
      segs.forEach(s => {
        (s.roads || []).forEach(r => {
          poly.push(...toPairs(r.vertexes || []));
        });
      });
      const summary = rt.summary || {
        distance: segs.reduce((a, s) => a + (s.distance || 0), 0),
        duration: segs.reduce((a, s) => a + (s.duration || 0), 0)
      };
      return { poly, summary };
    });

    const withScores = parsed.map((p, i) => ({
      ...p,
      score: hotspots ? safetyScore(p.poly, hotspots) : 0,
      idx: i,
    }));

    const fastestIdx = withScores
      .slice()
      .sort((a, b) => a.summary.duration - b.summary.duration)[0]?.idx;

    const saferIdx = withScores
      .slice()
      .sort((a, b) => a.score - b.score || a.summary.duration - b.summary.duration)[0]?.idx;

    setRoutes(
      withScores.map((r, i) => ({
        ...r,
        label:
          i === saferIdx && choice === "SAFER"
            ? `SAFER (score ${r.score})`
            : i === fastestIdx
            ? "FASTEST"
            : `ALT ${i + 1} (score ${r.score})`,
      }))
    );
  }

  function useEntrance(name) {
    const e = entrances.find(x => x.name === name);
    if (!e) return;
    setD(`${e.lon},${e.lat}`);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", height: "100vh" }}>
      <div style={{ padding: 12, borderRight: "1px solid #ddd" }}>
        <h2>Busan Safer Route + Entrance</h2>

        <label>Origin (lon,lat)</label>
        <input value={o} onChange={e => setO(e.target.value)} style={{ width: "100%" }} />

        <label>Destination (lon,lat)</label>
        <input value={d} onChange={e => setD(e.target.value)} style={{ width: "100%" }} />

        <div style={{ marginTop: 8 }}>
          <button onClick={() => setChoice("SAFER")}>Prefer SAFER</button>
          <button onClick={() => setChoice("FASTEST")} style={{ marginLeft: 8 }}>
            Prefer FASTEST
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={() => {
            setO("129.1366,35.1699");  // BEXCO
            setD("129.1604,35.1586");  // Haeundae
          }}>
            Demo: BEXCO → Haeundae
          </button>
        </div>

        <div style={{ marginTop: 8 }}>
          <label>Priority: </label>
          <select value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="RECOMMEND">RECOMMEND</option>
            <option value="TIME">TIME (fastest)</option>
            <option value="DISTANCE">DISTANCE (shortest)</option>
          </select>
        </div>

        <div style={{ marginTop: 8 }}>
          <label>Avoid: </label>
          <select value={avoid} onChange={e => setAvoid(e.target.value)}>
            <option value="">(none)</option>
            <option value="toll">toll</option>
            <option value="motorway">motorway</option>
            <option value="ferries">ferries</option>
            <option value="schoolzone">schoolzone</option>
            <option value="uturn">uturn</option>
            <option value="toll|motorway">toll + motorway</option>
          </select>
        </div>

        <div style={{ marginTop: 8 }}>
          <label>Quick set destination to an entrance:</label>
          <select onChange={e => useEntrance(e.target.value)} defaultValue="">
            <option value="" disabled>Choose entrance…</option>
            {entrances.map(e => (
              <option key={e.name} value={e.name}>{e.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 8 }}>
          <button onClick={() => {
            setO("129.1580,35.1595");     // Haeundae
            setD("129.0403,35.1151");     // Busan Station
            setPriority("TIME");
            setAvoid("toll|motorway");
          }}>
            Demo: Haeundae → BusanSt (TIME, avoid toll+motorway)
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={getRoutes}>Get Routes</button>
        </div>

        <p style={{fontSize:12,opacity:.7,marginTop:12}}>
          Try a demo or pick an entrance. Adjust Priority/Avoid, then click “Get Routes”.
        </p>
      </div>
      <div id="map"></div>
    </div>
  );
}
