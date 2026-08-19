let points = [], rawLines = [], port = null, reader = null, jsonTimer = null, liveStarted = false;
const $ = id => document.getElementById(id);
const map = L.map("map", { zoomControl: false, minZoom: 16, maxZoom: 19 }).setView([35.7227, 140.0593], 17);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
const layer = L.layerGroup().addTo(map);
function coordinate(value, direction) { if (!value || !direction) return null; const size = direction === "N" || direction === "S" ? 2 : 3; const degrees = Number(value.slice(0, size)); const minutes = Number(value.slice(size)); if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null; const result = degrees + minutes / 60; return direction === "S" || direction === "W" ? -result : result; }
function cleanNmea(line) { const match = line.match(/\$(?:GP|GN|GL|GA)[A-Z]{3},[^\r\n]*/); return match ? match[0].trim() : ""; }
function parseNmea(line) { line = cleanNmea(line); if (!line) return null; const fields = line.split(","); const type = (fields[0] || "").replace(/^\$/, "").split("*")[0]; if (type.endsWith("GGA")) { const latitude = coordinate(fields[2], fields[3]); const longitude = coordinate(fields[4], fields[5]); if (latitude === null || longitude === null || Number(fields[6]) === 0) return null; return { timestamp: fields[1] || "--:--:--", latitude, longitude, altitude_m: Number(fields[9]) || 0, satellites: Number(fields[7]) || 0, fix: 1, raw: line }; } if (type.endsWith("RMC") && fields[2] === "A") { const latitude = coordinate(fields[3], fields[4]); const longitude = coordinate(fields[5], fields[6]); if (latitude === null || longitude === null) return null; return { timestamp: fields[1] || "--:--:--", latitude, longitude, altitude_m: 0, satellites: 0, fix: 1, raw: line }; } return null; }
function render() { layer.clearLayers(); const locations = points.map(point => [point.latitude, point.longitude]); if (locations.length > 1) L.polyline(locations, { color: "#0b6e69", weight: 4, opacity: .9 }).addTo(layer); points.forEach((point, index) => { const latest = index === points.length - 1; const marker = L.circleMarker([point.latitude, point.longitude], { radius: latest ? 8 : 5, color: latest ? "#f26b38" : "#0b6e69", fillColor: latest ? "#f26b38" : "#8bd4c7", fillOpacity: 1, weight: 2 }).addTo(layer); marker.bindPopup(`<strong>${latest ? "Latest point" : `GPS point ${index + 1}`}</strong><br>${point.timestamp}<br>Altitude ${point.altitude_m.toFixed(1)} m<br>Satellites ${point.satellites}`); }); $("pointCount").textContent = `${points.length} points`; $("latest").textContent = points.at(-1)?.timestamp || "--:--:--"; const rawLog = $("rawLog"); rawLog.textContent = rawLines.slice(-200).join("\n") || "Waiting for NMEA data..."; if ($("autoScroll").checked) rawLog.scrollTop = rawLog.scrollHeight; $("rawCount").textContent = `${rawLines.length} lines`; }
function addRawLine(line) {
  if (!liveStarted) {
    liveStarted = true;
    points = [];
    rawLines = [];
  }
  const clean = cleanNmea(line);
  if (clean) rawLines = [...rawLines.slice(-199), clean];
  $("status").className = "status live";
  $("status").innerHTML = "<i></i>Connected";
  render();
}
function addPoint(point) {
  points = [...points.slice(-199), point];
  render();
}
async function connect() { if (!("serial" in navigator)) return; try { port = await navigator.serial.requestPort(); await port.open({ baudRate: 38400 }); reader = port.readable.getReader(); $("connect").textContent = "Disconnect"; let buffer = ""; const decoder = new TextDecoder(); while (true) { const result = await reader.read(); if (result.done) break; buffer += decoder.decode(result.value, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ""; lines.forEach(line => { addRawLine(line); const point = parseNmea(line); if (point) addPoint(point); }); } } catch (error) { console.warn(error); } finally { if (port) { await port.close().catch(() => {}); port = null; reader = null; $("connect").textContent = "Connect XBee"; } } }
$("connect").onclick = async () => { if (port) { await reader?.cancel(); return; } await connect(); }; $("clearRaw").onclick = () => { points = []; rawLines = []; liveStarted = false; render(); }; $("autoScroll").onchange = () => { if ($("autoScroll").checked) { const rawLog = $("rawLog"); rawLog.scrollTop = rawLog.scrollHeight; } }; render();
