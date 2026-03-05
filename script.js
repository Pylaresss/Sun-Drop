if(localStorage.getItem("logged") !== "true"){
  window.location.href = "login.html";
}

// ===================== MENU / PAGES (Hamburger sidebar) =====================
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const menuBtn = document.getElementById("menuBtn");
  const closeBtn = document.getElementById("closeBtn");

  const pages = {
    live: document.getElementById("page-live"),
    history: document.getElementById("page-history"),
    weather: document.getElementById("page-weather"),
    about: document.getElementById("page-about"),
  };

  function openMenu() {
    sidebar?.classList.add("open");
    overlay?.classList.add("show");
  }

  function closeMenu() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("show");
  }

  // Boutons (protégés si jamais un id manque)
  menuBtn?.addEventListener("click", openMenu);
  closeBtn?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", closeMenu);

  // ✅ Délégation : 1 seul listener pour tous les liens du menu
  sidebar?.addEventListener("click", (e) => {
    const link = e.target.closest(".navlink");
    if (!link) return;

    e.preventDefault();
    const pageKey = link.dataset.page;

    // Active link
    document.querySelectorAll(".navlink").forEach((x) => x.classList.remove("active"));
    link.classList.add("active");

    // Active page
    Object.values(pages).forEach((sec) => sec?.classList.remove("active"));
    pages[pageKey]?.classList.add("active");

    // Triggers spécifiques
    if (pageKey === "history") setTimeout(() => renderHistory?.(), 150);
    if (pageKey === "weather") setTimeout(() => updateWeatherAlakamisy?.(), 150);

    closeMenu();
  });
});



// ===================== THINGSPEAK FETCH (Live data) =====================
const channelID = "3278360";
const readAPIKey = "ES3N0P9JR628IAKY"; // leave "" if channel is public

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.innerText = txt;
}

async function updateData() {
  try {
    const url = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=20`;
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();

    const feeds = data.feeds || [];
    if (feeds.length === 0) return;

    function lastValid(field) {
      for (let i = feeds.length - 1; i >= 0; i--) {
        const v = feeds[i][field];
        if (v !== null && v !== "" && v !== undefined) return parseFloat(v);
      }
      return NaN;
    }

    // Mapping:
    // field1 Temp, field2 Air hum, field3 Soil moisture, field4 Water cm, field5 Water %
    const temperature = lastValid("field1");
    const soilMoisture = lastValid("field3");
    const tankDistance = lastValid("field4");
    const tankPercent = lastValid("field5");

    setText("temp", isNaN(temperature) ? "--" : `${temperature.toFixed(1)} °C`);
    // Update thermometer
    const thermo = document.getElementById("thermoFill");

    if (!isNaN(temperature) && thermo) {

      // max temperature scale (0-50°C)
      const maxTemp = 50;

      const percent = Math.min(temperature / maxTemp * 100, 100);

      thermo.style.height = percent + "%";
    }

    setText("moist", isNaN(soilMoisture) ? "--" : `${soilMoisture.toFixed(1)} %`);
    // ===== Soil moisture progress bar (color) =====
    const fill = document.getElementById("moistFill");

    if (!isNaN(soilMoisture) && fill) {
      const p = Math.max(0, Math.min(soilMoisture, 100));

      // largeur
      fill.style.width = p + "%";

      // couleur (rouge -> orange -> vert)
      let color = "#22c55e";        // vert
      if (p < 35) color = "#ef4444"; // rouge
      else if (p < 65) color = "#f59e0b"; // orange

      fill.style.background = color;
    } else if (fill) {
      fill.style.width = "0%";
      fill.style.background = "#9ca3af"; // gris si pas de donnée
    }

    setText("tankPercent", isNaN(tankPercent) ? "--" : `${tankPercent.toFixed(0)} %`);

    let tankStatus = "--";
    if (!isNaN(tankDistance)) {
      if (tankDistance <= 15) tankStatus = "FULL";
      else if (tankDistance <= 21) tankStatus = "MEDIUM";
      else tankStatus = "LOW";
    }
    setText("tankStatus", tankStatus);

    // Simple irrigation logic (can be adjusted)
    // Example: irrigate only if soil dry, tank has water, and not too hot
    let irrigation = "--";
    if (!isNaN(soilMoisture) && !isNaN(tankDistance) && !isNaN(temperature)) {
      const soilDry = soilMoisture < 35;
      const tankOk = tankDistance <= 15;
      const tempOk = temperature < 27;
      irrigation = (soilDry && tankOk && tempOk) ? "ON" : "OFF";
    }
    setText("irrigation", irrigation);

  } catch (err) {
    console.error("updateData error:", err);
  }
}

// Initial fetch + auto refresh
updateData();
setInterval(updateData, 10000);

// ===================== HISTORY CHARTS (Chart.js) =====================
let charts = {}; // MUST exist before makeChart()

function parseNumber(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : null;
}

async function fetchHistory(results = 120) {
  const url = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=${results}`;
  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json();
  return data.feeds || [];
}

function buildSeries(feeds, fieldName) {
  const labels = [];
  const values = [];

  for (const f of feeds) {
    labels.push(f.created_at ? f.created_at.slice(11, 16) : ""); // HH:MM
    values.push(parseNumber(f[fieldName]));
  }
  return { labels, values };
}

function makeChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (charts[canvasId]) charts[canvasId].destroy();

  charts[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        spanGaps: true,
        pointRadius: 2,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: false }
      }
    }
  });
}

async function renderHistory() {
  const sel = document.getElementById("historyPoints");
  const results = sel ? Number(sel.value) : 120;

  const feeds = await fetchHistory(results);

  const s1 = buildSeries(feeds, "field1");
  const s2 = buildSeries(feeds, "field2");
  const s3 = buildSeries(feeds, "field3");
  const s4 = buildSeries(feeds, "field4");
  const s5 = buildSeries(feeds, "field5");

  makeChart("c1", s1.labels, s1.values);
  makeChart("c2", s2.labels, s2.values);
  makeChart("c3", s3.labels, s3.values);
  makeChart("c4", s4.labels, s4.values);
  makeChart("c5", s5.labels, s5.values);
}

// History controls
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("refreshHistory");
  if (btn) btn.addEventListener("click", renderHistory);

  const sel = document.getElementById("historyPoints");
  if (sel) sel.addEventListener("change", renderHistory);

  // Auto-refresh when history page is visible
  setInterval(() => {
    const histPage = document.getElementById("page-history");
    if (histPage && histPage.classList.contains("active")) {
      renderHistory();
    }
  }, 30000);
});

// ===================== WEATHER (Open-Meteo) =====================
async function updateWeatherAlakamisy() {
  try {
    // Alakamisy-Ambohimaha (Fianarantsoa / Hautes Terres)
    const lat = -21.3216;
    const lon = 47.2247;

    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${lat}&longitude=${lon}` +
      "&timezone=auto" +
      "&forecast_days=7" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max" +
      "&hourly=precipitation";

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Weather HTTP ${r.status}`);
    const w = await r.json();

    // ----- Today summary -----
    const tmin0 = w.daily.temperature_2m_min[0];
    const tmax0 = w.daily.temperature_2m_max[0];
    const wind0 = w.daily.wind_speed_10m_max[0];

    // Rain next 24h = sum of first 24 hourly precipitation values
    const rain24 = (w.hourly.precipitation || [])
      .slice(0, 24)
      .reduce((a, b) => a + (b || 0), 0);

    const elToday = document.getElementById("w_today");
    const elRain24 = document.getElementById("w_rain24");
    const elWind = document.getElementById("w_wind");

    if (elToday) elToday.innerText = `${tmin0.toFixed(0)}°C → ${tmax0.toFixed(0)}°C`;
    if (elRain24) elRain24.innerText = `${rain24.toFixed(1)} mm`;
    if (elWind) elWind.innerText = `${wind0.toFixed(0)} km/h`;

    // ----- 7 days table -----
    const tbody = document.querySelector("#w_table tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    for (let i = 0; i < w.daily.time.length; i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${w.daily.time[i]}</td>
        <td>${w.daily.temperature_2m_min[i].toFixed(0)}°C</td>
        <td>${w.daily.temperature_2m_max[i].toFixed(0)}°C</td>
        <td>${w.daily.precipitation_sum[i].toFixed(1)} mm</td>
        <td>${w.daily.wind_speed_10m_max[i].toFixed(0)} km/h</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    console.error("Weather error:", e);
  }
}


function logout(){

  // supprimer la session
  localStorage.removeItem("logged");

  // redirection vers la page de connexion
  window.location.href = "login.html";

}