/* global L */

const map = L.map("map", { preferCanvas: true });

// UI: pesquisa por Zona e Município
const zonaForm = document.getElementById("zonaForm");
const zonaInput = document.getElementById("zonaInput");
const zonaList = document.getElementById("zonaList");
const zonaClearBtn = document.getElementById("zonaClear");
const municipioForm = document.getElementById("municipioForm");
const municipioInput = document.getElementById("municipioInput");
const municipioList = document.getElementById("municipioList");
const municipioClearBtn = document.getElementById("municipioClear");
const zonaStatus = document.getElementById("zonaStatus");

const SUM_FIELDS = ["1998", "2002", "2006", "2010"];
const numberFmt = new Intl.NumberFormat("pt-BR");

const zonaSumBox = {
  els: Object.fromEntries(SUM_FIELDS.map((f) => [f, document.getElementById(`sumZona${f}`)])),
  metaEl: document.getElementById("sumBoxZonaMeta"),
  emptyMsg: "Filtre por Zona para calcular.",
};

const municipioSumBox = {
  els: Object.fromEntries(SUM_FIELDS.map((f) => [f, document.getElementById(`sumMun${f}`)])),
  metaEl: document.getElementById("sumBoxMunMeta"),
  emptyMsg: "Filtre por Município para calcular.",
};

let activeZona = "";
let activeMunicipio = "";

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

map.setView([-22.95, -43.20], 12);

const DEFAULT_MARKER = { radius: 6, color: "#22c55e", weight: 2, opacity: 1, fillColor: "#22c55e", fillOpacity: 0.28 };
const HOVER_MARKER = { radius: 8, weight: 3, fillOpacity: 0.40 };
const DIM_MARKER = { radius: 4, color: "#94a3b8", weight: 1, opacity: 0.10, fillColor: "#94a3b8", fillOpacity: 0.03 };
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

function getMunicipio(feature) {
  const v = feature?.properties?.Municipio;
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function fillDatalist(listEl, values) {
  if (!listEl) return;
  const sorted = Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  listEl.innerHTML = sorted.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
}

function fillZonaDatalist(features) {
  const values = new Set();
  for (const f of features || []) {
    const z = getZona(f);
    if (z) values.add(z);
  }
  fillDatalist(zonaList, values);
}

function fillMunicipioDatalist(features) {
  const values = new Set();
  for (const f of features || []) {
    const m = getMunicipio(f);
    if (m) values.add(m);
  }
  fillDatalist(municipioList, values);
}

function getNumericProp(feature, key) {
  const v = feature?.properties?.[key];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sumFieldFromLayers(layers, key) {
  let total = 0;
  let missing = 0;
  for (const l of layers) {
    const n = getNumericProp(l.feature, key);
    if (n === null) {
      missing += 1;
      continue;
    }
    total += n;
  }
  return { total, missing };
}

function updateSumBoxConfig(config, layers, label) {
  if (!layers?.length) {
    for (const field of SUM_FIELDS) {
      if (config.els[field]) config.els[field].textContent = "—";
    }
    if (config.metaEl) config.metaEl.textContent = config.emptyMsg;
    return;
  }

  let maxMissing = 0;
  for (const field of SUM_FIELDS) {
    const { total, missing } = sumFieldFromLayers(layers, field);
    if (config.els[field]) config.els[field].textContent = numberFmt.format(total);
    maxMissing = Math.max(maxMissing, missing);
  }

  const parts = [`${layers.length} registro(s)`];
  if (label) parts.unshift(label);
  if (maxMissing > 0) parts.push(`até ${maxMissing} sem valor por campo`);
  if (config.metaEl) config.metaEl.textContent = parts.join(" · ");
}

function formatSumStatus(layers) {
  return SUM_FIELDS.map((f) => `Σ ${f} = ${numberFmt.format(sumFieldFromLayers(layers, f).total)}`).join(" · ");
}

function matchesZona(feature, zona) {
  return getZona(feature).toLowerCase() === zona.toLowerCase();
}

function matchesMunicipio(feature, municipio) {
  return getMunicipio(feature).toLowerCase() === municipio.toLowerCase();
}

function applyFilters() {
  if (!geoLayer) return;

  const z = activeZona;
  const m = activeMunicipio;
  const hasFilter = !!(z || m);
  const zonaMatches = [];
  const munMatches = [];
  const mapMatches = [];

  geoLayer.eachLayer((l) => {
    const f = l.feature;
    const zMatch = z && matchesZona(f, z);
    const mMatch = m && matchesMunicipio(f, m);
    const onMap = (!z || zMatch) && (!m || mMatch);

    if (zMatch) zonaMatches.push(l);
    if (mMatch) munMatches.push(l);

    if (hasFilter && onMap) {
      l.setStyle?.(MATCH_MARKER);
      l.bringToFront?.();
      mapMatches.push(l);
    } else if (hasFilter) {
      l.setStyle?.(DIM_MARKER);
    } else {
      l.setStyle?.(DEFAULT_MARKER);
    }
  });

  updateSumBoxConfig(zonaSumBox, z ? zonaMatches : null, z ? `Zona ${z}` : null);
  updateSumBoxConfig(municipioSumBox, m ? munMatches : null, m);

  if (!hasFilter) {
    setStatus("Clique em um ponto para ver os atributos.");
    return;
  }

  if (mapMatches.length === 0) {
    const parts = [];
    if (z) parts.push(`Zona = ${z}`);
    if (m) parts.push(`Município = ${m}`);
    setStatus(`Nenhum resultado para ${parts.join(" e ")}.`);
    return;
  }

  const group = L.featureGroup(mapMatches);
  const bounds = group.getBounds();
  if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.2));

  const parts = [`${mapMatches.length} no mapa`];
  if (z) parts.push(`Zona: ${formatSumStatus(zonaMatches)}`);
  if (m) parts.push(`Município: ${formatSumStatus(munMatches)}`);
  setStatus(parts.join(" · "));
}

function getAppBase() {
  if (typeof window.__APP_BASE__ === "string") return window.__APP_BASE__;
  const path = location.pathname;
  const m = path.match(/^(.*\/santana)\/?/);
  if (m) return `${m[1]}/`;
  return path.endsWith("/") ? path : path.replace(/\/[^/]*$/, "/") || "/";
}

async function loadGeoJSON() {
  const url = `${getAppBase()}Santana.geojson`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${resp.status}`);
  const geojson = await resp.json();
  const features = geojson?.features || [];

  fillZonaDatalist(features);
  fillMunicipioDatalist(features);

  geoLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, DEFAULT_MARKER),
    onEachFeature: (feature, l) => {
      const props = feature?.properties || {};
      if (Object.keys(props).length === 0) return;

      l.bindPopup(buildAttrTableHtml(props), {
        maxWidth: 760,
        className: "attr-popup",
        autoPan: true,
        closeButton: true,
      });

      l.on("click", () => {
        l.setStyle?.({ ...MATCH_MARKER, radius: Math.max(MATCH_MARKER.radius || 10, 11) });
        l.openPopup();
      });
      l.on("popupclose", () => {
        if (activeZona || activeMunicipio) applyFilters();
        else l.setStyle?.(DEFAULT_MARKER);
      });

      l.on("mouseover", () => {
        const isDim = !!(l.options && l.options.opacity <= 0.11);
        l.setStyle?.(isDim ? { ...DIM_MARKER, radius: 6, opacity: 0.35, fillOpacity: 0.10 } : HOVER_MARKER);
      });
      l.on("mouseout", () => {
        if (activeZona || activeMunicipio) applyFilters();
        else l.setStyle?.(DEFAULT_MARKER);
      });
    },
  }).addTo(map);

  const bounds = geoLayer.getBounds();
  if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
  setStatus("Clique em um ponto para ver os atributos.");
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
  activeZona = String(zonaInput?.value || "").trim();
  applyFilters();
});

zonaClearBtn?.addEventListener("click", () => {
  activeZona = "";
  if (zonaInput) zonaInput.value = "";
  applyFilters();
});

municipioForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  activeMunicipio = String(municipioInput?.value || "").trim();
  applyFilters();
});

municipioClearBtn?.addEventListener("click", () => {
  activeMunicipio = "";
  if (municipioInput) municipioInput.value = "";
  applyFilters();
});

// Posição dos painéis (arrastar + presets)
const PANEL_STORAGE_KEY = "santana-panel-layout";
const mainEl = document.querySelector(".main");
const panelEls = {
  zona: document.getElementById("sumBoxZona"),
  municipio: document.getElementById("sumBoxMunicipio"),
};
const posSelects = {
  zona: document.getElementById("posZona"),
  municipio: document.getElementById("posMunicipio"),
};
const PANEL_PAD = 12;
const PANEL_GAP = 10;

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function setPanelPx(panelId, left, top) {
  const el = panelEls[panelId];
  if (!el || !mainEl) return;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function readPanelPos(panelId) {
  const el = panelEls[panelId];
  if (!el) return { left: PANEL_PAD, top: PANEL_PAD };
  return {
    left: parseFloat(el.style.left) || PANEL_PAD,
    top: parseFloat(el.style.top) || PANEL_PAD,
  };
}

function getSavedLayout() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePanelLayout() {
  const data = {};
  for (const id of ["zona", "municipio"]) {
    const pos = readPanelPos(id);
    data[id] = {
      preset: posSelects[id]?.value || "default",
      x: Math.round(pos.left),
      y: Math.round(pos.top),
    };
  }
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(data));
}

function applyDefaultLayout() {
  const mun = panelEls.municipio;
  const zona = panelEls.zona;
  if (!mun || !zona || !mainEl) return;
  const mh = mainEl.clientHeight;
  const munTop = mh - mun.offsetHeight - PANEL_PAD;
  const zonaTop = munTop - zona.offsetHeight - PANEL_GAP;
  setPanelPx("municipio", PANEL_PAD, munTop);
  setPanelPx("zona", PANEL_PAD, zonaTop);
}

function applyZonaAboveMunicipio() {
  const zona = panelEls.zona;
  const mun = panelEls.municipio;
  if (!zona || !mun) return;
  const { left, top } = readPanelPos("municipio");
  setPanelPx("zona", left, top - zona.offsetHeight - PANEL_GAP);
}

function applyCorner(panelId, corner) {
  const el = panelEls[panelId];
  if (!el || !mainEl) return;
  const w = mainEl.clientWidth;
  const h = mainEl.clientHeight;
  const ew = el.offsetWidth;
  const eh = el.offsetHeight;
  let left = PANEL_PAD;
  let top = PANEL_PAD;
  if (corner.includes("r")) left = w - ew - PANEL_PAD;
  if (corner.includes("b")) top = h - eh - PANEL_PAD;
  setPanelPx(panelId, left, top);
}

function bothDefault() {
  return posSelects.zona?.value === "default" && posSelects.municipio?.value === "default";
}

function applyPreset(panelId) {
  const preset = posSelects[panelId]?.value;
  if (!preset || preset === "custom") return;

  if (preset === "default") {
    if (bothDefault()) applyDefaultLayout();
    else if (panelId === "zona") applyZonaAboveMunicipio();
    else applyCorner("municipio", "bl");
    return;
  }

  applyCorner(panelId, preset);
}

function setCustomPreset(panelId) {
  const sel = posSelects[panelId];
  if (!sel) return;
  const custom = sel.querySelector('option[value="custom"]');
  if (custom) custom.hidden = false;
  sel.value = "custom";
}

function onPresetChange(panelId) {
  applyPreset(panelId);
  if (panelId === "municipio" && posSelects.zona?.value === "default" && posSelects.municipio?.value !== "default") {
    applyZonaAboveMunicipio();
  }
  savePanelLayout();
}

function enablePanelDrag(panelId) {
  const el = panelEls[panelId];
  const head = el?.querySelector(".sum-box__head");
  if (!el || !head || !mainEl) return;

  head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const mainRect = mainEl.getBoundingClientRect();
    const start = readPanelPos(panelId);
    const offsetX = e.clientX - mainRect.left - start.left;
    const offsetY = e.clientY - mainRect.top - start.top;

    el.classList.add("sum-box--dragging");
    head.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const left = clamp(ev.clientX - mainRect.left - offsetX, 0, mainEl.clientWidth - el.offsetWidth);
      const top = clamp(ev.clientY - mainRect.top - offsetY, 0, mainEl.clientHeight - el.offsetHeight);
      setPanelPx(panelId, left, top);
    };

    const onUp = () => {
      el.classList.remove("sum-box--dragging");
      head.removeEventListener("pointermove", onMove);
      head.removeEventListener("pointerup", onUp);
      head.removeEventListener("pointercancel", onUp);
      setCustomPreset(panelId);
      savePanelLayout();
    };

    head.addEventListener("pointermove", onMove);
    head.addEventListener("pointerup", onUp);
    head.addEventListener("pointercancel", onUp);
  });
}

function initPanelLayout() {
  if (!mainEl || !panelEls.zona || !panelEls.municipio) return;

  const saved = getSavedLayout();
  applyDefaultLayout();

  for (const id of ["zona", "municipio"]) {
    const cfg = saved[id];
    if (cfg?.preset && posSelects[id]) posSelects[id].value = cfg.preset;
    if (cfg?.x != null && cfg?.y != null && cfg.preset === "custom") {
      setPanelPx(id, cfg.x, cfg.y);
    }
  }

  if (bothDefault()) {
    applyDefaultLayout();
  } else {
    for (const id of ["municipio", "zona"]) {
      const preset = posSelects[id]?.value;
      if (preset === "custom" && saved[id]?.x != null) setPanelPx(id, saved[id].x, saved[id].y);
      else if (preset && preset !== "default") applyCorner(id, preset);
    }
    if (posSelects.zona?.value === "default") applyZonaAboveMunicipio();
  }

  posSelects.zona?.addEventListener("change", () => onPresetChange("zona"));
  posSelects.municipio?.addEventListener("change", () => onPresetChange("municipio"));
  enablePanelDrag("zona");
  enablePanelDrag("municipio");

  window.addEventListener("resize", () => {
    if (bothDefault()) applyDefaultLayout();
    else {
      for (const id of ["zona", "municipio"]) {
        const preset = posSelects[id]?.value;
        if (preset && preset !== "default" && preset !== "custom") applyCorner(id, preset);
        else if (preset === "custom") {
          const pos = readPanelPos(id);
          setPanelPx(
            id,
            clamp(pos.left, 0, mainEl.clientWidth - panelEls[id].offsetWidth),
            clamp(pos.top, 0, mainEl.clientHeight - panelEls[id].offsetHeight),
          );
        }
      }
      if (posSelects.zona?.value === "default" && posSelects.municipio?.value !== "default") {
        applyZonaAboveMunicipio();
      }
    }
  });
}

initPanelLayout();
loadGeoJSON().catch((e) => console.warn(e));
