/**
 * 360° Real-Time Radar Mobile Tracker Orchestrator
 * Precision Engineering Workbench Edition
 * Multi-Radar Data Flow Inspector & Tab Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Workbench] Initializing 360° Mobile Tracker Interface...');

  // 1. Initialize Circular Plot Engine
  const circularPlot = new CircularPlot('radarCanvas');

  // 2. Initialize Live Target Telemetry Table
  const telemetryTable = new TelemetryTable('telemetryTableBody', 'targetCountBadge');

  // Connect bidirectional target cross-highlighting
  circularPlot.onTargetHoverCallback = (targetId) => {
    telemetryTable.setHoveredRow(targetId);
  };

  telemetryTable.setOnRowHover((targetId) => {
    circularPlot.setHoveredTarget(targetId);
  });

  // 3. Initialize Sensor Controls & Diagnostics (with circularPlot & telemetryTable)
  const sensorControls = new SensorControlManager(circularPlot, telemetryTable);

  // 4. Initialize Hardware Modals
  const modals = new ConfigModalManager();

  // Diagnostics elements
  const diagFps = document.getElementById('diagFrameRate');
  const diagLatency = document.getElementById('diagLatency');
  const diagPts = document.getElementById('diagPointCount');
  const diagTrks = document.getElementById('diagTrackCount');
  const navDot = document.getElementById('navStatusDot');
  const navText = document.getElementById('navStatusText');

  // Live Data Flow Confirmation Inspector Elements
  const flowRadarName = document.getElementById('flowRadarName');
  const flowStatusBadge = document.getElementById('flowStatusBadge');
  const flowRxRate = document.getElementById('flowRxRate');
  const flowFps = document.getElementById('flowFps');
  const flowFrames = document.getElementById('flowFrames');
  const flowBytes = document.getElementById('flowBytes');
  const flowCounts = document.getElementById('flowCounts');

  const tabDots = {
    1: document.getElementById('tabDot1'),
    2: document.getElementById('tabDot2'),
    3: document.getElementById('tabDot3')
  };

  let activeTab = 'all'; // 'all', '1', '2', '3'
  let lastPayload = null;
  let frameCount = 0;
  let fpsTimer = performance.now();

  // Helper: Format bytes
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    if (bytes > 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  // 5. Radar Tab Bar Switching
  const tabButtons = document.querySelectorAll('.btn-radar-tab');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      activeTab = btn.getAttribute('data-tab');
      const tabNum = activeTab === 'all' ? 'all' : parseInt(activeTab, 10);

      circularPlot.setSelectedRadar(tabNum);
      telemetryTable.setSelectedRadar(tabNum);

      if (flowRadarName) {
        if (activeTab === 'all') flowRadarName.textContent = 'ALL 3 RADARS FUSED';
        else if (activeTab === '1') flowRadarName.textContent = 'RADAR 1 (0°–120°)';
        else if (activeTab === '2') flowRadarName.textContent = 'RADAR 2 (120°–240°)';
        else if (activeTab === '3') flowRadarName.textContent = 'RADAR 3 (240°–360°)';
      }

      const label = activeTab === 'all' ? 'ALL RADARS' : `RADAR ${activeTab}`;
      sensorControls.logTerminal(`Inspector focused on ${label} stream.`);

      if (lastPayload) {
        updateDataFlowBar(lastPayload);
      }
    });
  });

  // Helper: Update Data Flow Bar
  function updateDataFlowBar(payload) {
    if (!payload || !payload.sensors) return;
    const sensors = payload.sensors;

    // Update tab status dots for radars 1, 2, 3 with automotive sensor colors
    const sensorColors = { 1: '#00E5FF', 2: '#B56CFF', 3: '#FFB52E' };
    [1, 2, 3].forEach(sid => {
      const s = sensors[`sensor${sid}`];
      const dot = tabDots[sid];
      if (dot && s) {
        if (s.flow_active) {
          dot.className = 'tab-indicator-dot online';
          dot.style.backgroundColor = sensorColors[sid];
          dot.style.boxShadow = `0 0 6px ${sensorColors[sid]}`;
        } else if (s.status === 'CONNECTED') {
          dot.className = 'tab-indicator-dot';
          dot.style.backgroundColor = 'var(--accent-warning)';
          dot.style.boxShadow = 'none';
        } else {
          dot.className = 'tab-indicator-dot';
          dot.style.backgroundColor = 'var(--accent-danger)';
          dot.style.boxShadow = 'none';
        }
      }
    });

    if (activeTab === 'all') {
      // Aggregate 3-radar metrics
      let totalBytes = 0;
      let totalBps = 0;
      let totalFrames = 0;
      let activeCount = 0;
      let totalPts = payload.points ? payload.points.length : 0;
      let totalTrks = payload.targets ? payload.targets.length : 0;

      [1, 2, 3].forEach(sid => {
        const s = sensors[`sensor${sid}`];
        if (s) {
          totalBytes += (s.bytes_total || 0);
          totalBps += (s.bytes_per_sec || 0);
          totalFrames += (s.frames_total || 0);
          if (s.flow_active) activeCount++;
        }
      });

      if (flowStatusBadge) {
        if (activeCount > 0) {
          flowStatusBadge.className = 'flow-badge status-active';
          flowStatusBadge.textContent = `STREAMING (${activeCount}/3)`;
        } else {
          flowStatusBadge.className = 'flow-badge status-offline';
          flowStatusBadge.textContent = 'STANDBY / NO FLOW';
        }
      }

      if (flowRxRate) flowRxRate.textContent = `${(totalBps / 1024).toFixed(1)} kB/s`;
      if (flowFps) flowFps.textContent = `${(diagFps ? diagFps.textContent : '25 FPS')}`;
      if (flowFrames) flowFrames.textContent = `#${totalFrames}`;
      if (flowBytes) flowBytes.textContent = formatBytes(totalBytes);
      if (flowCounts) flowCounts.textContent = `${totalPts} pts / ${totalTrks} trks`;

    } else {
      // Individual Radar Metrics
      const sid = parseInt(activeTab, 10);
      const s = sensors[`sensor${sid}`];
      const bySens = payload.by_sensor ? payload.by_sensor[sid] : null;
      const ptsCount = bySens && bySens.points ? bySens.points.length : (s ? s.live_points || 0 : 0);
      const trksCount = bySens && bySens.targets ? bySens.targets.length : (s ? s.live_targets || 0 : 0);

      if (s) {
        if (flowStatusBadge) {
          if (s.flow_active) {
            flowStatusBadge.className = 'flow-badge status-active';
            flowStatusBadge.textContent = 'FLOW ACTIVE';
          } else if (s.status === 'CONNECTED') {
            flowStatusBadge.className = 'flow-badge status-idle';
            flowStatusBadge.textContent = 'PORT OPEN (IDLE)';
          } else {
            flowStatusBadge.className = 'flow-badge status-offline';
            flowStatusBadge.textContent = 'DISCONNECTED';
          }
        }

        if (flowRxRate) flowRxRate.textContent = `${((s.bytes_per_sec || 0) / 1024).toFixed(1)} kB/s`;
        if (flowFps) flowFps.textContent = `${(s.fps || 0).toFixed(1)} FPS`;
        if (flowFrames) flowFrames.textContent = `#${s.frames_total || 0}`;
        if (flowBytes) flowBytes.textContent = formatBytes(s.bytes_total || 0);
        if (flowCounts) flowCounts.textContent = `${ptsCount} pts / ${trksCount} trks`;
      }
    }
  }

  // 6. Initialize WebSocket Streaming Client
  const defaultWsUrl = `ws://${window.location.host}/ws/telemetry`;
  const wsClient = new TelemetryClient(
    defaultWsUrl,
    // onMessage handler
    (payload) => {
      lastPayload = payload;
      const now = performance.now();
      frameCount++;
      if (now - fpsTimer >= 1000) {
        const currentFps = Math.round((frameCount * 1000) / (now - fpsTimer));
        if (diagFps) diagFps.textContent = `${currentFps} FPS`;
        frameCount = 0;
        fpsTimer = now;
      }

      // Calculate latency if timestamp is present
      if (payload.timestamp && diagLatency) {
        const msgTime = new Date(payload.timestamp).getTime();
        const diff = Math.max(0, Math.round(Date.now() - msgTime));
        diagLatency.textContent = `${diff} ms`;
      }

      // Diagnostics readouts
      const ptCount = payload.points ? payload.points.length : 0;
      const trkCount = payload.targets ? payload.targets.length : 0;
      if (diagPts) diagPts.textContent = `${ptCount}`;
      if (diagTrks) diagTrks.textContent = `${trkCount}`;

      // Update Live Data Flow Inspector Bar
      updateDataFlowBar(payload);

      // Update Circular Plot
      circularPlot.updateData(payload.targets, payload.points, payload.sensors);

      // Update Live Telemetry Table
      telemetryTable.update(payload.targets);

      // Update Left Sensor Panel
      sensorControls.update(payload.sensors);
    },
    // onStatusChange handler
    (status) => {
      if (navDot && navText) {
        if (status === 'CONNECTED') {
          navDot.classList.add('online');
          navText.textContent = 'ONLINE';
          sensorControls.logTerminal('WebSocket telemetry stream connected.');
        } else if (status === 'CONNECTING') {
          navDot.classList.remove('online');
          navText.textContent = 'CONNECTING';
        } else {
          navDot.classList.remove('online');
          navText.textContent = 'OFFLINE';
          sensorControls.logTerminal('WebSocket telemetry disconnected.');
        }
      }
    }
  );

  // 7. Theme Switching (Dark Workbench / White Mode)
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const iconSun = document.getElementById('themeIconSun');
  const iconMoon = document.getElementById('themeIconMoon');
  const themeText = document.getElementById('themeToggleText');

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      circularPlot.setTheme('light');
      if (iconSun) iconSun.style.display = 'none';
      if (iconMoon) iconMoon.style.display = 'inline-block';
      if (themeText) themeText.textContent = 'DARK MODE';
    } else {
      document.documentElement.removeAttribute('data-theme');
      circularPlot.setTheme('dark');
      if (iconSun) iconSun.style.display = 'inline-block';
      if (iconMoon) iconMoon.style.display = 'none';
      if (themeText) themeText.textContent = 'WHITE MODE';
    }
    localStorage.setItem('workbench_theme', theme);
  }

  const initialTheme = localStorage.getItem('workbench_theme') || 'dark';
  applyTheme(initialTheme);

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const target = current === 'light' ? 'dark' : 'light';
      applyTheme(target);
      sensorControls.logTerminal(`Theme changed to ${target.toUpperCase()} MODE.`);
    });
  }

  // Start connection
  wsClient.connect();
});
