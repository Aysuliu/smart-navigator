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

/* ---------- component ---------- */
export default function App() {
  // map & overlays
  const [map, setMap] = useState(null);

  // routing
  const [o, setO] = useState("129.1580,35.1595"); // default: Haeundae
  const [d, setD] = useState("129.0403,35.1151"); // default: Busan Station
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

    // geolocate once
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setMyLoc({ lat, lon });
          setO(`${lon},${lat}`);
        },
        () => {/* ignore denial */},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
    return () => m.remove();
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

  async function getRoutes() {
    const res = await fetchJSON(
      `/route?o=${encodeURIComponent(o)}&d=${encodeURIComponent(d)}` +
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
    <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", height:"100vh" }}>
      <div style={{ padding:12, borderRight:"1px solid #ddd", overflowY:"auto" }}>
        <h2>Busan Crowd + Ways to Get There</h2>

        {/* Search */}
        <label>Search place</label>
        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Type e.g. Haeundae, BEXCO…"
          style={{ width:"100%" }}
        />
        {filtered.length>0 && (
          <div style={{ border:"1px solid #eee", padding:6, marginTop:4 }}>
            {filtered.map(p=>(
              <div key={p.id} style={{ padding:"4px 0", cursor:"pointer" }}
                   onClick={()=>selectPoi(p)}>
                {p.name}
              </div>
            ))}
          </div>
        )}

        {/* Selected place */}
        {selectedPoi && selectedMeta && (
          <div style={{ marginTop:12, padding:8, border:"1px solid #eee", borderRadius:8 }}>
            <div style={{ fontWeight:600 }}>{selectedPoi.name}</div>
            <div style={{ marginTop:6 }}>
              Crowd: <span style={{
                background:selectedMeta.color, color:"#fff",
                padding:"2px 8px", borderRadius:12, fontSize:12
              }}>{selectedMeta.level}</span>
            </div>
            <div style={{ marginTop:8 }}>
              <button onClick={getRoutes}>Route to here</button>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recs.length>0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontWeight:600 }}>Quieter nearby</div>
            {recs.map(x=>(
              <div key={x.poi.id} style={{ display:"flex", justifyContent:"space-between",
                    padding:"6px 0", cursor:"pointer" }}
                   onClick={()=>selectPoi(x.poi)}>
                <span>{x.poi.name}</span>
                <span style={{
                  background: crowdLevel(x.score).color, color:"#fff",
                  padding:"2px 8px", borderRadius:12, fontSize:12
                }}>
                  {x.dkm.toFixed(1)} km
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Origin / Destination */}
        <div style={{ marginTop:12 }}>
          <label>Origin (lon,lat)</label>
          <input value={o} onChange={e=>setO(e.target.value)} style={{ width:"100%" }} />
          <div style={{ marginTop:6 }}>
            <button onClick={()=>{ if(myLoc) setO(`${myLoc.lon},${myLoc.lat}`); }}>
              Use my location {myLoc ? `(${myLoc.lon.toFixed(4)},${myLoc.lat.toFixed(4)})` : ""}
            </button>
          </div>

          <label style={{ marginTop:8, display:"block" }}>Destination (lon,lat)</label>
          <input value={d} onChange={e=>setD(e.target.value)} style={{ width:"100%" }} />
        </div>

        {/* Options */}
        <div style={{ marginTop:8 }}>
          <label>Priority: </label>
          <select value={priority} onChange={e=>setPriority(e.target.value)}>
            <option value="RECOMMEND">RECOMMEND</option>
            <option value="TIME">TIME (fastest)</option>
            <option value="DISTANCE">DISTANCE (shortest)</option>
          </select>
        </div>
        <div style={{ marginTop:8 }}>
          <label>Avoid: </label>
          <select value={avoid} onChange={e=>setAvoid(e.target.value)}>
            <option value="">(none)</option>
            <option value="toll">toll</option>
            <option value="motorway">motorway</option>
            <option value="ferries">ferries</option>
            <option value="schoolzone">schoolzone</option>
            <option value="uturn">uturn</option>
            <option value="toll|motorway">toll + motorway</option>
          </select>
        </div>

        <div style={{ marginTop:12 }}>
          <button onClick={getRoutes}>Get Routes</button>
        </div>

        <p style={{fontSize:12,opacity:.7,marginTop:12}}>
          Click the map or search to pick a place. We color crowd: green (not crowded), yellow (medium), red (crowded).
          Recommendations show quieter nearby spots. Routing uses your location if available.
        </p>
      </div>

      <div id="map"></div>
    </div>
  );
}
