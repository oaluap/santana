/* global L */

const map = L.map("map", { preferCanvas: true });

// UI: pesquisa por Zona
const zonaForm = document.getElementById("zonaForm");
const zonaInput = document.getElementById("zonaInput");
const zonaList = document.getElementById("zonaList");
const zonaClearBtn = document.getElementById("zonaClear");
const zonaStatus = document.getElementById("zonaStatus");

// 3 planos de fundo (basemaps)
const baseOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

const baseCartoPositron = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  subdomains: "abcd",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
});

const baseEsriImagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 20,
    attribution:
      "Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  },
);

baseOSM.addTo(map);

L.control.scale({ imperial: false }).addTo(map);
L.control.layers(
  {
    OpenStreetMap: baseOSM,
    "Carto (claro)": baseCartoPositron,
    "Satélite (Esri)": baseEsriImagery,
  },
  {},
  { collapsed: false },
).addTo(map);

// fallback
map.setView([-22.95, -43.20], 12);

const DEFAULT_MARKER = { radius: 6, color: "#22c55e", weight: 2, opacity: 1, fillColor: "#22c55e", fillOpacity: 0.28 };
const HOVER_MARKER = { radius: 8, weight: 3, fillOpacity: 0.40 };
// bem apagado para aumentar contraste
const DIM_MARKER = { radius: 4, color: "#94a3b8", weight: 1, opacity: 0.10, fillColor: "#94a3b8", fillOpacity: 0.03 };
// bem destacado (cor chamativa + contorno forte)
const MATCH_MARKER = {
  radius: 10,
  color: "#ffffff",
  weight: 4,
  opacity: 1,
  fillColor: "#f59e0b",
  fillOpacity: 0.65,
};

let geoLayer = null;

function setStatus(text) {
  if (zonaStatus) zonaStatus.textContent = text;
}

function getZona(feature) {
  const v = feature?.properties?.Zona;
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function fillZonaDatalist(features) {
  if (!zonaList) return;
  const values = new Set();
  for (const f of features || []) {
    const z = getZona(f);
    if (z) values.add(z);
  }
  const sorted = Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  zonaList.innerHTML = sorted.map((z) => `<option value="${escapeHtml(z)}"></option>`).join("");
}

function clearHighlights() {
  if (!geoLayer) return;
  geoLayer.eachLayer((l) => {
    l.setStyle?.(DEFAULT_MARKER);
  });
  setStatus("Passe o mouse para ver os atributos.");
}

function highlightByZona(zonaValue) {
  if (!geoLayer) return;
  const z = String(zonaValue || "").trim();
  if (!z) {
    clearHighlights();
    return;
  }

  const matches = [];
  geoLayer.eachLayer((l) => {
    const f = l.feature;
    const zf = getZona(f);
    if (zf.toLowerCase() === z.toLowerCase()) {
      l.setStyle?.(MATCH_MARKER);
      l.bringToFront?.();
      matches.push(l);
    } else l.setStyle?.(DIM_MARKER);
  });

  if (matches.length === 0) {
    setStatus(`Nenhum resultado para Zona = ${z}.`);
    return;
  }

  const group = L.featureGroup(matches);
  const bounds = group.getBounds();
  if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.2));
  setStatus(`Resultados: ${matches.length} (Zona = ${z}).`);
}

async function loadGeoJSON() {
  const url = "./Santana.geojson";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${resp.status}`);
  const geojson = await resp.json();

  fillZonaDatalist(geojson?.features || []);

  geoLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, DEFAULT_MARKER),
    onEachFeature: (feature, l) => {
      const props = feature?.properties || {};
      const keys = Object.keys(props);
      if (keys.length === 0) return;

      const html = buildAttrTableHtml(props);
      l.bindTooltip(html, {
        sticky: true,
        direction: "auto",
        opacity: 0.98,
        className: "attr-tooltip",
      });

      l.on("mouseover", () => {
        // Se estiver apagado, não “vira” destaque — só melhora um pouco a visibilidade
        const isDim = !!(l.options && l.options.opacity <= 0.11);
        l.setStyle?.(isDim ? { ...DIM_MARKER, radius: 6, opacity: 0.35, fillOpacity: 0.10 } : HOVER_MARKER);
        l.openTooltip();
      });
      l.on("mouseout", () => {
        // volta para o estilo atual: se estiver filtrado por Zona, o próximo "Buscar" re-aplica
        // (mantemos simples: volta para default)
        l.setStyle?.(DEFAULT_MARKER);
        l.closeTooltip();
      });
    },
  }).addTo(map);

  const bounds = geoLayer.getBounds();
  if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
  setStatus("Passe o mouse para ver os atributos.");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildAttrTableHtml(props) {
  const entries = Object.entries(props || {});
  entries.sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const rows = entries.map(([k, v]) => {
    const vv = v === null || v === undefined ? "" : String(v);
    return `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(vv)}</td></tr>`;
  });
  return `
    <div class="attr-tooltip__wrap">
      <div class="attr-tooltip__title">Atributos</div>
      <table class="attr-tooltip__table">
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    </div>
  `;
}

zonaForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  highlightByZona(zonaInput?.value || "");
});

zonaClearBtn?.addEventListener("click", () => {
  if (zonaInput) zonaInput.value = "";
  clearHighlights();
});

loadGeoJSON().catch((e) => console.warn(e));

