let points = [], processedLines = [], port = null, reader = null, liveStarted = false;
const telemetry = { fix: false, satellitesUsed: 0, satellitesInView: 0, latitude: null, longitude: null, altitude: null, speed: null, heading: null, hdop: null, timestamp: "--:--:--" };
const $ = id => document.getElementById(id);
const map = L.map("map", { zoomControl: false, minZoom: 2, maxZoom: 19 }).setView([20, 0], 2);
L.control.zoom({ position: "bottomright" }).addTo(map);
const trackZoom = 17;
function updateMapView() {
  if (!points.length) return;
  const latest = points[points.length - 1];
  const latlng = L.latLng(latest.latitude, latest.longitude);
  if (points.length === 1) {
    map.setView(latlng, trackZoom);
    return;
  }
  if (!map.getBounds().pad(-0.25).contains(latlng)) map.panTo(latlng);
}
const latinLabel = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name:ja-Latn"], ""];
const glLayer = L.maplibreGL({
  style: "https://tiles.openfreemap.org/styles/liberty",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://openfreemap.org/">OpenFreeMap</a>'
}).addTo(map);
const glMap = glLayer.getMaplibreMap();
let labelsApplied = false;
function hideJapaneseLabels() {
  if (labelsApplied) return;
  const style = glMap.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach(layer => {
    if (!layer.layout || layer.layout["text-field"] === undefined) return;
    if (/shield/i.test(layer.id)) return;
    glMap.setLayoutProperty(layer.id, "text-field", latinLabel);
  });
  labelsApplied = true;
}
glMap.on("idle", hideJapaneseLabels);
const layer = L.layerGroup().addTo(map);
function coordinate(value, direction) { if (!value || !direction) return null; const size = direction === "N" || direction === "S" ? 2 : 3; const degrees = Number(value.slice(0, size)); const minutes = Number(value.slice(size)); if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null; const result = degrees + minutes / 60; return direction === "S" || direction === "W" ? -result : result; }
function numberAfter(line, key) { const match = line.match(new RegExp(`\\b${key}=([-+]?\\d*\\.?\\d+)`)); return match ? Number(match[1]) : null; }
function valueAfter(line, key) { const match = line.match(new RegExp(`\\b${key}=([^\\s]+)`)); return match ? match[1] : ""; }
function extractNmea(line) { return [...line.matchAll(/\$(?:GP|GN|GL|GA)[A-Z]{3},[^$\r\n]*(?:\*[0-9A-Fa-f]{2})?/g)].map(match => match[0].trim()); }
function cleanNmea(line) { return extractNmea(line)[0] || ""; }
function addChecksum(line) { if (!line || line.includes("*")) return line; let checksum = 0; for (let i = 1; i < line.length; i++) checksum ^= line.charCodeAt(i); return `${line}*${checksum.toString(16).padStart(2, "0").toUpperCase()}`; }
function validChecksum(line) { const star = line.lastIndexOf("*"); if (star < 0) return true; const expected = Number.parseInt(line.slice(star + 1, star + 3), 16); if (!Number.isInteger(expected)) return false; let actual = 0; for (let i = 1; i < star; i++) actual ^= line.charCodeAt(i); return actual === expected; }
function updateTelemetry(line) {
  const fields = line.split(",");
  const type = (fields[0] || "").replace(/^\$/, "").split("*")[0];
  const suffix = type.slice(-3);
  if (suffix === "GGA") {
    telemetry.timestamp = fields[1] || telemetry.timestamp;
    telemetry.latitude = coordinate(fields[2], fields[3]) ?? telemetry.latitude;
    telemetry.longitude = coordinate(fields[4], fields[5]) ?? telemetry.longitude;
    telemetry.fix = Number(fields[6]) > 0;
    telemetry.satellitesUsed = Number(fields[7]) || 0;
    telemetry.hdop = Number.isFinite(Number(fields[8])) ? Number(fields[8]) : telemetry.hdop;
    telemetry.altitude = Number.isFinite(Number(fields[9])) ? Number(fields[9]) : telemetry.altitude;
  } else if (suffix === "RMC") {
    telemetry.timestamp = fields[1] || telemetry.timestamp;
    telemetry.fix = fields[2] === "A";
    telemetry.latitude = coordinate(fields[3], fields[4]) ?? telemetry.latitude;
    telemetry.longitude = coordinate(fields[5], fields[6]) ?? telemetry.longitude;
    telemetry.speed = Number.isFinite(Number(fields[7])) ? Number(fields[7]) * 1.852 : telemetry.speed;
  } else if (suffix === "GSA") {
    const used = fields.slice(3, 15).filter(value => value && value !== "0").length;
    if (used) telemetry.satellitesUsed = used;
    telemetry.fix = fields[2] === "3" || (fields[2] === "2" && telemetry.fix);
  } else if (suffix === "GSV") {
    telemetry.satellitesInView = Number(fields[3]) || telemetry.satellitesInView;
  }
}
function formatValue(value, digits = 2, suffix = "") { return value === null || value === undefined || !Number.isFinite(Number(value)) ? "--" : `${Number(value).toFixed(digits)}${suffix}`; }
function renderTelemetry() {
  const values = { fix: telemetry.fix ? "Fix" : "No Fix", satellitesUsed: telemetry.satellitesUsed || "--", satellitesInView: telemetry.satellitesInView || "--", latitude: formatValue(telemetry.latitude, 6), longitude: formatValue(telemetry.longitude, 6), altitude: formatValue(telemetry.altitude, 1, " m"), speed: formatValue(telemetry.speed, 2, " m/s"), heading: formatValue(telemetry.heading, 2, "°"), hdop: formatValue(telemetry.hdop, 2), timestamp: telemetry.timestamp || "--:--:--" };
  Object.entries(values).forEach(([key, value]) => { const cell = $(`telemetry-${key}`); if (cell) cell.textContent = value; });
  const fixCell = $("telemetry-fix"); if (fixCell) fixCell.className = `telemetry-value ${telemetry.fix ? "is-fixed" : "is-waiting"}`;
}
function parseNmea(line) { line = addChecksum(cleanNmea(line)); if (!line || !validChecksum(line)) return null; updateTelemetry(line); const fields = line.split(","); const type = (fields[0] || "").replace(/^\$/, "").split("*")[0]; if (type.endsWith("GGA")) { const latitude = coordinate(fields[2], fields[3]); const longitude = coordinate(fields[4], fields[5]); if (latitude === null || longitude === null || Number(fields[6]) === 0) return null; return { timestamp: fields[1] || "--:--:--", latitude, longitude, altitude_m: Number(fields[9]) || 0, satellites: Number(fields[7]) || 0, fix: 1, raw: line }; } if (type.endsWith("RMC") && fields[2] === "A") { const latitude = coordinate(fields[3], fields[4]); const longitude = coordinate(fields[5], fields[6]); if (latitude === null || longitude === null) return null; return { timestamp: fields[1] || "--:--:--", latitude, longitude, altitude_m: 0, satellites: telemetry.satellitesUsed, fix: 1, raw: line }; } return null; }
function render() { layer.clearLayers(); const locations = points.map(point => [point.latitude, point.longitude]); if (locations.length > 1) L.polyline(locations, { color: "#0b6e69", weight: 4, opacity: .9 }).addTo(layer); points.forEach((point, index) => { const latest = index === points.length - 1; const marker = L.circleMarker([point.latitude, point.longitude], { radius: latest ? 8 : 5, color: latest ? "#f26b38" : "#0b6e69", fillColor: latest ? "#f26b38" : "#8bd4c7", fillOpacity: 1, weight: 2 }).addTo(layer); marker.bindPopup(`<strong>${latest ? "Latest point" : `GPS point ${index + 1}`}</strong><br>${point.timestamp}<br>Altitude ${point.altitude_m.toFixed(1)} m<br>Satellites ${point.satellites}`); }); updateMapView(); const processedLog = $("processedLog"); processedLog.textContent = processedLines.slice(-200).join("\n") || "Waiting for processed GPS data..."; if ($("autoScroll").checked) processedLog.scrollTop = processedLog.scrollHeight; renderTelemetry(); }
function parseProcessedLine(line) {
  if (line.startsWith("GPGGA")) {
    const latitude = numberAfter(line, "lat"), longitude = numberAfter(line, "lon");
    telemetry.timestamp = valueAfter(line, "utc") || telemetry.timestamp;
    telemetry.latitude = Number.isFinite(latitude) ? latitude : telemetry.latitude;
    telemetry.longitude = Number.isFinite(longitude) ? longitude : telemetry.longitude;
    telemetry.altitude = numberAfter(line, "alt") ?? telemetry.altitude;
    telemetry.hdop = numberAfter(line, "hdop") ?? telemetry.hdop;
    telemetry.satellitesUsed = numberAfter(line, "sat") ?? telemetry.satellitesUsed;
    telemetry.fix = (numberAfter(line, "fix") || 0) > 0;
    if (telemetry.fix && Number.isFinite(latitude) && Number.isFinite(longitude)) return { timestamp: telemetry.timestamp, latitude, longitude, altitude_m: telemetry.altitude || 0, satellites: telemetry.satellitesUsed || 0, fix: 1 };
  } else if (line.startsWith("GPRMC")) {
    telemetry.timestamp = valueAfter(line, "utc") || telemetry.timestamp;
    telemetry.speed = numberAfter(line, "vel") ?? telemetry.speed;
    telemetry.heading = numberAfter(line, "heading") ?? telemetry.heading;
  }
  return null;
}
function addLine(line) {
  if (!liveStarted) {
    liveStarted = true;
    points = [];
    processedLines = [];
  }
  const cleanLine = line.trim();
  if (!cleanLine) return;
  processedLines = [...processedLines, cleanLine].slice(-200);
  $("status").className = "status live";
  $("status").innerHTML = "<i></i>Connected";
  const point = parseProcessedLine(cleanLine);
  if (point) addPoint(point);
  render();
}
function addPoint(point) {
  points = [...points.slice(-199), point];
  render();
}
async function connect() { if (!("serial" in navigator)) { $("status").textContent = "Web Serial unavailable"; return; } try { port = await navigator.serial.requestPort(); await port.open({ baudRate: 38400 }); reader = port.readable.getReader(); $("connect").textContent = "Disconnect"; let buffer = ""; const decoder = new TextDecoder(); while (true) { const result = await reader.read(); if (result.done) break; buffer += decoder.decode(result.value, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ""; lines.forEach(addLine); } } catch (error) { if (error?.name !== "AbortError") console.warn(error); } finally { if (port) { await port.close().catch(() => {}); port = null; reader = null; $("connect").textContent = "Select USB / XBee Port"; } } }
async function saveBlobWithPicker(blob, suggestedName) { if (typeof window.showSaveFilePicker === "function") { try { const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description: "Text file", accept: { "text/plain": [".txt"] } }] }); const writable = await handle.createWritable(); await writable.write(blob); await writable.close(); return handle.name; } catch (error) { if (error?.name === "AbortError") throw error; } } const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = suggestedName; anchor.click(); URL.revokeObjectURL(url); return suggestedName; }
async function saveLog() { const text = processedLines.join("\n").trimEnd(); if (!text) return; const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); try { await saveBlobWithPicker(new Blob([text + "\n"], { type: "text/plain;charset=utf-8" }), `hepta_gps_processed_${timestamp}.txt`); } catch (error) { if (error?.name !== "AbortError") console.warn(error); } }
$("connect").onclick = async () => { if (port) { await reader?.cancel(); return; } await connect(); }; $("saveLog").onclick = saveLog; $("clearRaw").onclick = () => { points = []; processedLines = []; liveStarted = false; map.setView([20, 0], 2); render(); }; $("autoScroll").onchange = () => { if ($("autoScroll").checked) { const processedLog = $("processedLog"); processedLog.scrollTop = processedLog.scrollHeight; } }; render();
