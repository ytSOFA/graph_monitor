/* Frontend for subgraph delay monitor.
 * Pure static assets: index.html + style.css + this file.
 * Fetches /api/delays, renders bar charts per subgraph using Chart.js.
 */

const SUBGRAPH_ORDER = [
  'vault_eth',
  'vault_arb',
  'vault_bsc',
  'vault_pol',
  'vault_sei',
  'automator_eth',
  'automator_arb',
  'automator_sei',
  'vault_sep',
  'vault_arbsep',
  'automator_arbsep',
];

const THRESHOLDS = {
  vault_eth: 11,
  vault_arb: 360,
  vault_bsc: 240,
  vault_pol: 60,
  vault_sei: 300,
  automator_eth: 6,
  automator_arb: 180,
  automator_sei: 300,
  vault_sep: 22,
  vault_arbsep: 720,
  automator_arbsep: 360,
};

const MAX_POINTS = 144; // last 48 hours at 20-min intervals
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const contentEl = document.getElementById('content');
const updatedEl = document.getElementById('updatedAt');
const refreshBtn = document.getElementById('refreshBtn');
let nextTimer = null;
let nextTargetTs = 0;

function latestTimestampForSubgraph(subgraph) {
  if (!subgraph) return null;
  let max = 0;
  const scan = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item?.timestamp === 'number') {
        max = Math.max(max, item.timestamp);
      }
    }
  };
  scan(subgraph.gateway);
  scan(subgraph.goldsky);
  return max || null;
}

let charts = [];

function resolveApiBase() {
  const urlParam = new URLSearchParams(location.search).get('api');
  if (urlParam) return urlParam.replace(/\/$/, '');
  if (location.port === '3001') return 'http://localhost:3000';
  return '';
}

const API_BASE = resolveApiBase();
const API_URL = `${API_BASE}/api/delays?count=${MAX_POINTS}`;

function formatTs(ts) {
  return ts ? new Date(ts * 1000).toLocaleString() : 'N/A';
}

function normalizeSeries(entries = []) {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const slots = Array.from({ length: MAX_POINTS }, (_, idx) => sorted[idx] || null);
  return slots.map((item) => {
    if (!item) return { value: null, ts: null, error: null };
    const isNum = typeof item.delay === 'number';
    return {
      value: isNum ? item.delay : null,
      ts: item.timestamp,
      error: isNum ? null : String(item.delay),
    };
  });
}

function buildDataset(points, threshold) {
  // Empty slots stay null; real zeros stay 0 so minBarLength can render thin bars.
  const maxVal =
    points.reduce((m, p) => (typeof p.value === 'number' ? Math.max(m, p.value) : m), 0) || 0;
  const errorHeight = Math.max(maxVal, 1); // errors render at tallest bar height
  const data = points.map((p) => {
    if (p.value === null && !p.error) return null;
    if (p.error) return errorHeight;
    return p.value ?? 0;
  });
  const solid = (rgba) => rgba.replace(/rgba\\(([^)]+),\\s*[^)]+\\)/, 'rgba($1,1)');
  const backgroundColor = points.map((p) => {
    if (p.error) return 'rgba(239, 68, 68, 0.8)'; // red for errors
    if (p.value === null) return 'rgba(148, 163, 184, 0.25)'; // muted for empty slots
    if (p.value >= threshold) return 'rgba(251, 146, 60, 0.8)'; // orange above threshold
    return 'rgba(34, 197, 94, 0.8)'; // green within threshold
  });
  const borderColor = backgroundColor.map((c) => solid(c));
  return { data, backgroundColor, borderColor };
}

function buildLabels(points) {
  return points.map((p) => (p.ts ? formatTs(p.ts) : ''));
}

function createChart(canvas, title, series, threshold) {
  const points = normalizeSeries(series);
  const dataset = buildDataset(points, threshold);
  const labels = buildLabels(points);

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: title,
          data: dataset.data,
          backgroundColor: dataset.backgroundColor,
          borderColor: dataset.borderColor,
          borderWidth: 1,
          barPercentage: 0.9,       // leave slight gap between bars
          categoryPercentage: 0.82, // spacing across categories
          minBarLength: 4,          // show thin bar even when value is 0
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false, // hover anywhere on the column to get tooltip
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (ctx) => ctx[0]?.label || '',
            label: (ctx) => {
              const p = points[ctx.dataIndex];
              if (p.error) return `Error: ${p.error}`;
              if (p.value === null) return 'Value: N/A';
              return `Delay: ${p.value} blocks`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { display: false }, // hide numeric labels
          grid: { display: false },  // hide horizontal lines to keep chart clean
        },
      },
    },
  });
}

function renderSubgraph(name, data) {
  const threshold = THRESHOLDS[name] ?? 0;
  const card = document.createElement('section');
  card.className = 'card';
  card.dataset.subgraph = name;

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-line">
        <h2 class="card-title">${name}</h2>
        <span class="threshold">Threshold: ${threshold} blocks</span>
      </div>
    </div>
    <div class="chart-row" data-kind="gateway">
      <div class="chart-label">
        <span>Gateway</span>
      </div>
      <div class="chart-wrap"><canvas></canvas></div>
    </div>
  `;

  const gatewayRow = card.querySelector('[data-kind="gateway"]');

  // Gateway chart
  if (data && Array.isArray(data.gateway) && data.gateway.length > 0) {
    const canvas = gatewayRow.querySelector('canvas');
    charts.push(createChart(canvas, `${name} gateway`, data.gateway, threshold));
  } else {
    gatewayRow.remove();
  }

  // Indexers panel
  const indexers = data?.indexers || {};
  const indexerKeys = Object.keys(indexers);
  if (indexerKeys.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `Indexers (${indexerKeys.length})`;
    details.appendChild(summary);

    indexerKeys.sort().forEach((idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'chart-row';
      wrap.innerHTML = `
        <div class="chart-label">
          <span class="indexer-name">${idx}</span>
        </div>
        <div class="chart-wrap"><canvas></canvas></div>
      `;
      details.appendChild(wrap);
      const canvas = wrap.querySelector('canvas');
      charts.push(createChart(canvas, `${name} ${idx}`, indexers[idx], threshold));
    });

    card.appendChild(details);
  }

  // Goldsky chart (renders last)
  if (data && data.goldsky) {
    const goldskyRow = document.createElement('div');
    goldskyRow.className = 'chart-row';
    goldskyRow.dataset.kind = 'goldsky';
    goldskyRow.innerHTML = `
      <div class="chart-label">
        <span>Goldsky</span>
      </div>
      <div class="chart-wrap"><canvas></canvas></div>
    `;
    card.appendChild(goldskyRow);
    const canvas = goldskyRow.querySelector('canvas');
    charts.push(createChart(canvas, `${name} goldsky`, data.goldsky, threshold));
  }

  contentEl.appendChild(card);
}

function renderAll(data) {
  // Preserve UI state before rerender
  const scrollY = window.scrollY;
  const openDetails = new Set(
    Array.from(document.querySelectorAll('section.card details[open]')).map((d) => {
      const card = d.closest('section.card');
      return card?.dataset?.subgraph;
    }).filter(Boolean),
  );

  contentEl.innerHTML = '';
  charts.forEach((c) => c.destroy());
  charts = [];

  SUBGRAPH_ORDER.forEach((name) => {
    renderSubgraph(name, data[name]);
  });

  // Restore expanded panels
  document.querySelectorAll('section.card details').forEach((d) => {
    const card = d.closest('section.card');
    const subgraph = card?.dataset?.subgraph;
    if (subgraph && openDetails.has(subgraph)) {
      d.open = true;
    }
  });

  // Restore scroll position after layout
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

async function loadData() {
  updatedEl.textContent = 'Loading...';
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    renderAll(json);
    const firstKey = SUBGRAPH_ORDER.find((name) => json[name]);
    const latestTs = latestTimestampForSubgraph(json[firstKey]);
    updatedEl.textContent = latestTs
      ? `Last update: ${new Date(latestTs * 1000).toLocaleString()}`
      : 'Last update: N/A';
  } catch (error) {
    updatedEl.textContent = `Failed to load data (${error.message})`;
    console.error('Fetch error:', error);
  }
}

function scheduleNextRun() {
  if (nextTimer) clearTimeout(nextTimer);
  const now = Date.now();
  const next = now + REFRESH_INTERVAL_MS;
  nextTargetTs = next;
  const delayMs = Math.max(nextTargetTs - now, 1000);
  nextTimer = setTimeout(async () => {
    await loadData();
    scheduleNextRun(); // schedule following interval
  }, delayMs);
}

refreshBtn.addEventListener('click', () => {
  loadData();
});

// initial load and schedule
loadData().finally(() => {
  scheduleNextRun();
});

// If returning to foreground after missing the target HH:05, refresh immediately
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now >= nextTargetTs) {
    if (nextTimer) {
      clearTimeout(nextTimer);
      nextTimer = null;
    }
    loadData().finally(() => scheduleNextRun());
  } else if (!nextTimer) {
    // safety: if timer was cleared for any reason, reschedule
    scheduleNextRun();
  }
});
