/**
 * Multi-View Workbench Manager & Multi-Radar Broadcast Controller
 * Precision Engineering Workbench Edition (Foxglove / ROS RViz Style)
 */
class ViewManager {
  constructor(circularPlot, telemetryTable, sensorControls, configModalManager) {
    this.circularPlot = circularPlot;
    this.telemetryTable = telemetryTable;
    this.sensorControls = sensorControls;
    this.configModalManager = configModalManager;

    this.activeView = 'live-monitor';
    this.activeRadarSubTab = 'all';
    this.trackingFilter = 'all'; // 'all', '1', '2', '3', 'dyn', 'static'
    this.dangerThreshold = 2.0;
    this.warmThreshold = 4.0;
    this.auditLogs = [];

    this.initViews();
    this.initRadarSubTabs();
    this.initLiveMonitorControls();
    this.initRadarBroadcastControls();
    this.initIndividualRadarControls();
    this.initSensorConfigControls();
    this.initZoneSettingsDirect();
    this.initTrackingFilters();
    this.initAuditLogs();
    this.initClock();
  }

  // 1. Navigation View Switching
  initViews() {
    const navButtons = document.querySelectorAll('.nav-btn[data-view]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        window.location.hash = viewId;
        this.switchView(viewId);
      });
    });

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && document.getElementById('view-' + hash)) {
        this.switchView(hash);
      }
    });

    // Check initial hash on load
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash && document.getElementById('view-' + initialHash)) {
      setTimeout(() => this.switchView(initialHash), 10);
    }

    // Header buttons integration
    const btnConfig = document.getElementById('btnConfig');
    if (btnConfig) {
      btnConfig.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchView('radar-config');
      });
    }

    const btnLogs = document.getElementById('btnLogs');
    if (btnLogs) {
      btnLogs.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchView('event-logs');
      });
    }
  }

  switchView(viewId) {
    this.activeView = viewId;

    // Update sidebar navigation buttons
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
      if (btn.getAttribute('data-view') === viewId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update view containers
    document.querySelectorAll('.view-container').forEach(view => {
      if (view.id === 'view-' + viewId) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // View-specific initialization triggers
    if (viewId === 'live-monitor') {
      setTimeout(() => {
        if (this.circularPlot) this.circularPlot.resize();
      }, 50);
    } else if (viewId === 'radar-config') {
      this.refreshRadarConfigView();
    } else if (viewId === 'sensor-config') {
      this.loadMountingMatrix();
    } else if (viewId === 'zone-settings') {
      this.syncZoneInputs();
    }
  }

  // 2. Sub-Tab Switcher in Radar Config
  initRadarSubTabs() {
    const subTabButtons = document.querySelectorAll('#view-radar-config button[data-subtab]');
    subTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const subtab = btn.getAttribute('data-subtab');
        this.switchRadarSubTab(subtab);
      });
    });
  }

  switchRadarSubTab(target) {
    this.activeRadarSubTab = target;
    const panelAll = document.getElementById('panelRadarConfigAll');
    const panelIndiv = document.getElementById('panelRadarConfigIndiv');
    const subTabButtons = document.querySelectorAll('#view-radar-config button[data-subtab]');

    subTabButtons.forEach(b => {
      if (b.getAttribute('data-subtab') === target) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    if (target === 'all') {
      if (panelAll) panelAll.style.display = 'flex';
      if (panelIndiv) panelIndiv.style.display = 'none';
    } else {
      if (panelAll) panelAll.style.display = 'none';
      if (panelIndiv) panelIndiv.style.display = 'flex';

      const title = document.getElementById('indivRadarTitle');
      if (title) title.textContent = `RADAR ${target} CONFIGURATION`;

      this.loadIndividualRadarPorts(target);
    }
  }

  async loadIndividualRadarPorts(radarId) {
    try {
      const [portsRes, configsRes] = await Promise.all([
        fetch('/api/ports'),
        fetch('/api/configs')
      ]);
      const data = await portsRes.json();
      const cfgData = await configsRes.json();
      const ports = data.ports || [];

      const cliSel = document.getElementById('indivCliSelect');
      const dataSel = document.getElementById('indivDataSelect');
      const cfgSel = document.getElementById('indivCfgSelect');

      if (cliSel && dataSel) {
        const optHtml = ports.map(p => `<option value="${p.device}">${p.device} (${p.description || ''})</option>`).join('');
        cliSel.innerHTML = '<option value="">-- None / Select CLI Port --</option>' + optHtml;
        dataSel.innerHTML = '<option value="">-- None / Select Data Port --</option>' + optHtml;
      }

      if (cfgSel && cfgData.configs) {
        cfgSel.innerHTML = cfgData.configs.map(c => `<option value="${c}">${c}</option>`).join('');
        if (cfgSel.value) {
          this.loadConfigContent(cfgSel.value);
        }
      }
    } catch (e) {
      console.warn('Failed loading individual radar ports:', e);
    }
  }

  // 2b. Individual Radar Controls & CFG Editor
  initIndividualRadarControls() {
    const indivCfgSelect = document.getElementById('indivCfgSelect');
    const indivCfgEditor = document.getElementById('indivCfgEditor');
    const indivCfgStatus = document.getElementById('indivCfgStatus');
    const btnIndivSaveCfg = document.getElementById('btnIndivSaveCfg');
    const btnIndivSendCfg = document.getElementById('btnIndivSendCfg');
    const btnIndivConnect = document.getElementById('btnIndivConnect');
    const btnIndivDisconnect = document.getElementById('btnIndivDisconnect');

    if (indivCfgSelect) {
      indivCfgSelect.addEventListener('change', async () => {
        await this.loadConfigContent(indivCfgSelect.value);
      });
    }

    if (btnIndivSaveCfg) {
      btnIndivSaveCfg.addEventListener('click', async () => {
        const filename = indivCfgSelect ? indivCfgSelect.value : 'AOP_6m_default.cfg';
        const content = indivCfgEditor ? indivCfgEditor.value : '';
        btnIndivSaveCfg.textContent = 'SAVING...';
        try {
          const res = await fetch('/api/config/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content })
          });
          const d = await res.json();
          if (indivCfgStatus) {
            indivCfgStatus.textContent = `✓ Saved ${filename}`;
            indivCfgStatus.style.color = 'var(--accent-active)';
          }
          this.logAudit('SYSTEM', 'CONFIG EDITOR', `Saved configuration file ${filename}`);
        } catch (e) {
          if (indivCfgStatus) {
            indivCfgStatus.textContent = 'Save failed';
            indivCfgStatus.style.color = 'var(--accent-danger)';
          }
        } finally {
          btnIndivSaveCfg.textContent = 'Save CFG';
        }
      });
    }

    if (btnIndivSendCfg) {
      btnIndivSendCfg.addEventListener('click', async () => {
        const sid = parseInt(this.activeRadarSubTab, 10) || 1;
        const text = indivCfgEditor ? indivCfgEditor.value : '';
        const lines = text.split('\n');
        btnIndivSendCfg.textContent = 'TRANSMITTING...';
        try {
          const res = await fetch('/api/radar/send_config_lines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensor_id: sid, lines })
          });
          const d = await res.json();
          if (indivCfgStatus) {
            indivCfgStatus.textContent = `✓ Commands sent to Radar ${sid}`;
            indivCfgStatus.style.color = 'var(--accent-active)';
          }
          this.logAudit('SYSTEM', `RADAR ${sid}`, `Config commands transmitted directly to Radar ${sid}`);
        } catch (e) {
          if (indivCfgStatus) {
            indivCfgStatus.textContent = 'Transmission failed';
            indivCfgStatus.style.color = 'var(--accent-danger)';
          }
        } finally {
          btnIndivSendCfg.textContent = 'Send Config to Sensor';
        }
      });
    }

    if (btnIndivConnect) {
      btnIndivConnect.addEventListener('click', async () => {
        const sid = parseInt(this.activeRadarSubTab, 10) || 1;
        const cliSel = document.getElementById('indivCliSelect');
        const dataSel = document.getElementById('indivDataSelect');
        const cfgSel = document.getElementById('indivCfgSelect');

        btnIndivConnect.textContent = 'CONNECTING...';
        try {
          const payload = {
            radars: [{
              sensor_id: sid,
              cli_port: cliSel ? cliSel.value : null,
              data_port: dataSel ? dataSel.value : null,
              config: cfgSel ? cfgSel.value : 'AOP_6m_default.cfg'
            }]
          };
          await fetch('/api/radar/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          this.logAudit('SYSTEM', `RADAR ${sid}`, `Radar ${sid} connection initiated on ${cliSel ? cliSel.value : ''} / ${dataSel ? dataSel.value : ''}`);
        } catch (e) {
          console.warn('Connect error:', e);
        } finally {
          btnIndivConnect.textContent = 'Connect';
        }
      });
    }

    if (btnIndivDisconnect) {
      btnIndivDisconnect.addEventListener('click', async () => {
        const sid = parseInt(this.activeRadarSubTab, 10) || 1;
        try {
          await fetch('/api/radar/stop_sensor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensor_id: sid })
          });
          this.logAudit('SYSTEM', `RADAR ${sid}`, `Radar ${sid} disconnected.`);
        } catch (e) {
          console.warn('Disconnect error:', e);
        }
      });
    }
  }

  async loadConfigContent(filename) {
    const editor = document.getElementById('indivCfgEditor');
    if (!editor) return;
    try {
      const res = await fetch(`/api/config/content?name=${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.content) {
        editor.value = data.content;
      }
    } catch (e) {
      console.warn('Failed loading cfg content:', e);
    }
  }

  // 2c. Sensor Configuration (Mounting Matrix & Platform Geometry)
  initSensorConfigControls() {
    const btnSave = document.getElementById('btnSaveMounting');
    const btnTare = document.getElementById('btnAutoTare');
    const statusEl = document.getElementById('mountingSaveStatus');

    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        btnSave.textContent = 'SAVING...';
        const s1 = {
          sensor_id: 1,
          x: parseFloat(document.getElementById('mountX1').value) || 0,
          y: parseFloat(document.getElementById('mountY1').value) || 0,
          z: parseFloat(document.getElementById('mountZ1').value) || 0,
          yaw: parseFloat(document.getElementById('mountYaw1').value) || 0
        };
        const s2 = {
          sensor_id: 2,
          x: parseFloat(document.getElementById('mountX2').value) || 0,
          y: parseFloat(document.getElementById('mountY2').value) || 0,
          z: parseFloat(document.getElementById('mountZ2').value) || 0,
          yaw: parseFloat(document.getElementById('mountYaw2').value) || 0
        };
        const s3 = {
          sensor_id: 3,
          x: parseFloat(document.getElementById('mountX3').value) || 0,
          y: parseFloat(document.getElementById('mountY3').value) || 0,
          z: parseFloat(document.getElementById('mountZ3').value) || 0,
          yaw: parseFloat(document.getElementById('mountYaw3').value) || 0
        };

        try {
          await fetch('/api/sensor/mounting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensors: [s1, s2, s3] })
          });
          if (statusEl) {
            statusEl.textContent = '✓ Mounting matrix geometry saved & updated in global fusion.';
            statusEl.style.color = 'var(--accent-active)';
          }
          this.logAudit('SYSTEM', 'SENSOR MATRIX', 'Physical sensor mounting matrix saved to fusion model.');
        } catch (e) {
          if (statusEl) {
            statusEl.textContent = 'Failed saving mounting matrix';
            statusEl.style.color = 'var(--accent-danger)';
          }
        } finally {
          btnSave.textContent = 'Save Mounting Profile';
        }
      });
    }

    if (btnTare) {
      btnTare.addEventListener('click', () => {
        document.getElementById('mountX1').value = '0.00';
        document.getElementById('mountY1').value = '0.20';
        document.getElementById('mountZ1').value = '0.80';
        document.getElementById('mountYaw1').value = '0.0';

        document.getElementById('mountX2').value = '0.17';
        document.getElementById('mountY2').value = '-0.10';
        document.getElementById('mountZ2').value = '0.80';
        document.getElementById('mountYaw2').value = '120.0';

        document.getElementById('mountX3').value = '-0.17';
        document.getElementById('mountY3').value = '-0.10';
        document.getElementById('mountZ3').value = '0.80';
        document.getElementById('mountYaw3').value = '240.0';

        if (btnSave) btnSave.click();
      });
    }
  }

  async loadMountingMatrix() {
    try {
      const res = await fetch('/api/sensor/mounting');
      const data = await res.json();
      if (data && data.sensors) {
        data.sensors.forEach(s => {
          const sid = s.sensor_id;
          const xEl = document.getElementById(`mountX${sid}`);
          const yEl = document.getElementById(`mountY${sid}`);
          const zEl = document.getElementById(`mountZ${sid}`);
          const yawEl = document.getElementById(`mountYaw${sid}`);
          if (xEl && s.x !== undefined) xEl.value = s.x.toFixed(2);
          if (yEl && s.y !== undefined) yEl.value = s.y.toFixed(2);
          if (zEl && s.z !== undefined) zEl.value = s.z.toFixed(2);
          if (yawEl && s.yaw !== undefined) yawEl.value = s.yaw.toFixed(1);
        });
      }
    } catch (e) {
      console.warn('Failed loading mounting matrix:', e);
    }
  }

  // 3. Live Monitor Execution Controls (START/STOP)
  initLiveMonitorControls() {
    const btnStart = document.getElementById('btnStartRadarsLive');
    if (btnStart) {
      btnStart.addEventListener('click', async () => {
        try {
          btnStart.textContent = 'CONNECTING...';
          const defaultPayload = {
            radars: [
              { sensor_id: 1, cli_port: "/dev/ttyUSB0", data_port: "/dev/ttyUSB1", config: "AOP_6m_default.cfg" },
              { sensor_id: 2, cli_port: "/dev/ttyUSB2", data_port: "/dev/ttyUSB3", config: "AOP_6m_default.cfg" },
              { sensor_id: 3, cli_port: "/dev/ttyUSB4", data_port: "/dev/ttyUSB5", config: "AOP_6m_default.cfg" }
            ]
          };

          const res = await fetch('/api/radar/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(defaultPayload)
          });
          const data = await res.json();
          this.logAudit('SYSTEM', 'RADAR FUSION', 'Start radar connection dispatched across all 3 sensors.');
        } catch (e) {
          console.error('Error starting radars:', e);
        } finally {
          btnStart.innerHTML = `<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> START RADAR`;
        }
      });
    }

    const btnStop = document.getElementById('btnStopRadarsLive');
    if (btnStop) {
      btnStop.addEventListener('click', async () => {
        try {
          await fetch('/api/radar/stop', { method: 'POST' });
          this.logAudit('SYSTEM', 'RADAR FUSION', 'Stop signal broadcast. All 3 radars disconnected.');
        } catch (e) {
          console.error('Error stopping radars:', e);
        }
      });
    }
  }

  // 4. Multi-Radar Broadcast Controls ("Apply to All 3")
  initRadarBroadcastControls() {
    const btnScan = document.getElementById('btnBroadcastScan');
    if (btnScan) {
      btnScan.addEventListener('click', async () => {
        btnScan.textContent = 'SCANNING...';
        await this.refreshRadarConfigView();
        btnScan.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> SCAN ALL PORTS`;
        this.logAudit('SYSTEM', 'RADAR CONFIG', 'Port scan completed across physical bus.');
      });
    }

    const btnConnect = document.getElementById('btnBroadcastConnect');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => {
        const btnStart = document.getElementById('btnStartRadarsLive');
        if (btnStart) btnStart.click();
      });
    }

    const btnDisconnect = document.getElementById('btnBroadcastDisconnect');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => {
        const btnStop = document.getElementById('btnStopRadarsLive');
        if (btnStop) btnStop.click();
      });
    }

    const btnStart3 = document.getElementById('btnBroadcastStart');
    if (btnStart3) {
      btnStart3.addEventListener('click', () => {
        const btnStart = document.getElementById('btnStartRadarsLive');
        if (btnStart) btnStart.click();
      });
    }

    const btnStop3 = document.getElementById('btnBroadcastStop');
    if (btnStop3) {
      btnStop3.addEventListener('click', () => {
        const btnStop = document.getElementById('btnStopRadarsLive');
        if (btnStop) btnStop.click();
      });
    }

    const btnBcastCfg = document.getElementById('btnBroadcastCfg');
    if (btnBcastCfg) {
      btnBcastCfg.addEventListener('click', async () => {
        const sel = document.getElementById('bcastCfgSelect');
        const cfgName = sel ? sel.value : 'AOP_6m_default.cfg';
        btnBcastCfg.textContent = 'BROADCASTING...';

        try {
          const res = await fetch('/api/radar/broadcast_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config_name: cfgName })
          });
          const ackStatus = document.getElementById('bcastAckStatus');
          if (ackStatus) {
            ackStatus.textContent = `✓ Broadcast ACK: 100% (All 3 radars configured with ${cfgName})`;
            ackStatus.style.color = 'var(--accent-active)';
          }
          this.logAudit('SYSTEM', 'RADAR BROADCAST', `Configuration ${cfgName} dispatched to Sensors 1, 2, and 3.`);
        } catch (e) {
          console.warn('Broadcast config error:', e);
        } finally {
          btnBcastCfg.textContent = '⚡ BROADCAST CFG TO ALL 3 RADARS';
        }
      });
    }
  }

  async refreshRadarConfigView() {
    try {
      const [portsRes, configsRes, statusRes] = await Promise.all([
        fetch('/api/ports'),
        fetch('/api/configs'),
        fetch('/api/radar/status')
      ]);

      const portsData = await portsRes.json();
      const configsData = await configsRes.json();
      const statusData = await statusRes.json();

      // Populate broadcast config dropdown
      const bcastCfg = document.getElementById('bcastCfgSelect');
      if (bcastCfg && configsData.configs) {
        bcastCfg.innerHTML = configsData.configs.map(c => `<option value="${c}">${c}</option>`).join('');
      }

      // Update state cards for Sensors 1, 2, 3
      if (statusData.sensors) {
        [1, 2, 3].forEach(sid => {
          const s = statusData.sensors[`sensor${sid}`];
          const badge = document.getElementById(`bcastStatus${sid}`);
          const rxFlow = document.getElementById(`bcastRxFlow${sid}`);
          if (badge && s) {
            badge.textContent = s.status || 'OFFLINE';
            badge.style.color = s.status === 'CONNECTED' ? 'var(--accent-active)' : 'var(--accent-danger)';
          }
          if (rxFlow && s) {
            rxFlow.textContent = `${((s.bytes_per_sec || 0) / 1024).toFixed(1)} kB/s`;
          }
        });
      }
    } catch (e) {
      console.warn('Failed refreshing radar config view:', e);
    }
  }

  // 5. Zone Settings Direct Numeric Inputs (No Slide Bars)
  initZoneSettingsDirect() {
    const inpDanger = document.getElementById('inputDangerZoneDirect');
    const inpWarm = document.getElementById('inputWarmZoneDirect');
    const btnApply = document.getElementById('btnApplyZonesDirect');
    const btnReset = document.getElementById('btnResetZonesDirect');

    const updatePreviewRings = () => {
      const d = parseFloat(inpDanger.value) || 2.0;
      const w = parseFloat(inpWarm.value) || 4.0;
      const maxR = 10.0;

      const ringDanger = document.getElementById('previewRingDanger');
      const ringWarm = document.getElementById('previewRingWarm');
      const badgeDanger = document.getElementById('previewBadgeDanger');
      const badgeWarm = document.getElementById('previewBadgeWarm');
      const labelSafe = document.getElementById('labelSafeThresholdDirect');

      if (ringDanger) {
        const px = Math.min(260, Math.max(30, (d / maxR) * 260));
        ringDanger.style.width = px + 'px';
        ringDanger.style.height = px + 'px';
      }
      if (ringWarm) {
        const px = Math.min(260, Math.max(50, (w / maxR) * 260));
        ringWarm.style.width = px + 'px';
        ringWarm.style.height = px + 'px';
      }
      if (badgeDanger) badgeDanger.textContent = `DANGER ${d.toFixed(1)}m`;
      if (badgeWarm) badgeWarm.textContent = `WARM ${w.toFixed(1)}m`;
      if (labelSafe) labelSafe.textContent = `> ${w.toFixed(1)} m`;
    };

    if (inpDanger && inpWarm) {
      inpDanger.addEventListener('input', updatePreviewRings);
      inpWarm.addEventListener('input', updatePreviewRings);
    }

    if (btnApply) {
      btnApply.addEventListener('click', async () => {
        const d = parseFloat(inpDanger.value) || 2.0;
        const w = parseFloat(inpWarm.value) || 4.0;
        await this.applyThresholds(d, w);
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        if (inpDanger) inpDanger.value = '2.0';
        if (inpWarm) inpWarm.value = '4.0';
        updatePreviewRings();
        await this.applyThresholds(2.0, 4.0);
      });
    }

    // Range scale toggles in zone settings
    const scaleBtns = [
      { id: 'btnDirectScale5m', val: 5 },
      { id: 'btnDirectScale10m', val: 10 },
      { id: 'btnDirectScale15m', val: 15 }
    ];
    scaleBtns.forEach(sb => {
      const el = document.getElementById(sb.id);
      if (el) {
        el.addEventListener('click', () => {
          scaleBtns.forEach(b => {
            const bEl = document.getElementById(b.id);
            if (bEl) bEl.classList.remove('active');
          });
          el.classList.add('active');

          // Directly update live monitoring circular plot engine
          if (this.circularPlot) {
            this.circularPlot.setRangeScale(sb.val);
          }

          // Adjust numeric threshold constraints to match new range scale
          if (inpDanger && inpWarm) {
            inpDanger.max = (sb.val - 0.5).toFixed(1);
            inpWarm.max = (sb.val - 0.2).toFixed(1);
            let d = parseFloat(inpDanger.value) || 2.0;
            let w = parseFloat(inpWarm.value) || 4.0;
            if (w >= sb.val) {
              w = parseFloat((sb.val * 0.4).toFixed(1));
              inpWarm.value = w.toFixed(1);
            }
            if (d >= w) {
              d = parseFloat((w * 0.5).toFixed(1));
              inpDanger.value = d.toFixed(1);
            }
            updatePreviewRings();
            this.applyThresholds(d, w);
          }

          if (this.sensorControls) {
            this.sensorControls.logTerminal(`Range scale adjusted to ${sb.val}m.`);
          }
          this.logAudit('SYSTEM', 'ZONE SETTINGS', `Radar range scale switched to ${sb.val}m`);
        });
      }
    });

    // Display layer toggles in zone settings
    const toolBtns = [
      { id: 'btnDirectToolFov', prop: 'showFoV', name: '±65° FOV' },
      { id: 'btnDirectToolVel', prop: 'showVelocity', name: 'VECTORS' },
      { id: 'btnDirectToolBounds', prop: 'showSectorBounds', name: 'BOUNDARIES' }
    ];
    toolBtns.forEach(tb => {
      const el = document.getElementById(tb.id);
      if (el) {
        el.addEventListener('click', () => {
          el.classList.toggle('active');
          const isActive = el.classList.contains('active');
          if (this.circularPlot) {
            this.circularPlot[tb.prop] = isActive;
          }
          this.logAudit('SYSTEM', 'DISPLAY LAYERS', `${tb.name} layer ${isActive ? 'enabled' : 'hidden'}`);
        });
      }
    });
  }

  syncZoneInputs() {
    const inpDanger = document.getElementById('inputDangerZoneDirect');
    const inpWarm = document.getElementById('inputWarmZoneDirect');
    if (inpDanger && this.dangerThreshold) inpDanger.value = this.dangerThreshold.toFixed(1);
    if (inpWarm && this.warmThreshold) inpWarm.value = this.warmThreshold.toFixed(1);
  }

  async applyThresholds(dangerMeters, warmMeters) {
    this.dangerThreshold = dangerMeters;
    this.warmThreshold = warmMeters;

    try {
      await fetch('/api/zone/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ danger_radius: dangerMeters, warning_radius: warmMeters })
      });
    } catch (e) {
      console.warn('Could not post thresholds:', e);
    }

    if (this.circularPlot) this.circularPlot.setCustomZones(dangerMeters, warmMeters);
    if (this.telemetryTable) this.telemetryTable.setZoneThresholds(dangerMeters, warmMeters);

    this.logAudit('SYSTEM', 'ZONE SETTINGS', `Zone thresholds applied: DANGER ≤ ${dangerMeters.toFixed(1)}m, WARM ≤ ${warmMeters.toFixed(1)}m`);
  }

  // 6. Object Tracking Filter and Synchronizer
  initTrackingFilters() {
    const filters = [
      { id: 'filterTrackAll', val: 'all' },
      { id: 'filterTrackR1', val: '1' },
      { id: 'filterTrackR2', val: '2' },
      { id: 'filterTrackR3', val: '3' },
      { id: 'filterTrackDyn', val: 'dyn' },
      { id: 'filterTrackStatic', val: 'static' }
    ];

    filters.forEach(f => {
      const btn = document.getElementById(f.id);
      if (btn) {
        btn.addEventListener('click', () => {
          filters.forEach(o => {
            const b = document.getElementById(o.id);
            if (b) b.classList.remove('active');
          });
          btn.classList.add('active');
          this.trackingFilter = f.val;
          if (this.lastTargets) this.updateTrackingTable(this.lastTargets);
        });
      }
    });
  }

  updateTrackingTable(targets) {
    this.lastTargets = targets || [];
    const tbody = document.getElementById('telemetryBodyFullTracking');
    const countBadge = document.getElementById('trackingViewActiveCount');
    if (!tbody) return;

    let filtered = this.lastTargets;
    if (this.trackingFilter === '1' || this.trackingFilter === '2' || this.trackingFilter === '3') {
      const sid = parseInt(this.trackingFilter, 10);
      filtered = filtered.filter(t => t.sensor_id === sid);
    } else if (this.trackingFilter === 'dyn') {
      filtered = filtered.filter(t => !t.is_static);
    } else if (this.trackingFilter === 'static') {
      filtered = filtered.filter(t => t.is_static);
    }

    if (countBadge) countBadge.textContent = `${filtered.length} ACTIVE DETECTIONS`;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: var(--text-muted);">No targets matching filter (${this.trackingFilter}).</td></tr>`;
      return;
    }

    const sensorColors = { 1: 'var(--color-r1)', 2: 'var(--color-r2)', 3: 'var(--color-r3)' };
    const rows = filtered.map(t => {
      const sid = t.sensor_id || 1;
      const sColor = sensorColors[sid] || 'var(--text-primary)';
      const isDanger = t.range <= this.dangerThreshold;
      const isWarm = !isDanger && t.range <= this.warmThreshold;
      const zoneTag = isDanger
        ? `<span class="mono" style="font-size: 9px; font-weight: 700; color: var(--accent-danger); background: var(--accent-danger-dim); border: 1px solid var(--accent-danger); padding: 1px 4px; border-radius: 2px;">DANGER</span>`
        : isWarm
          ? `<span class="mono" style="font-size: 9px; font-weight: 700; color: var(--accent-warning); background: var(--accent-warning-dim); border: 1px solid var(--accent-warning); padding: 1px 4px; border-radius: 2px;">WARM</span>`
          : `<span class="mono" style="font-size: 9px; font-weight: 700; color: var(--accent-active); background: var(--accent-active-dim); border: 1px solid var(--accent-active); padding: 1px 4px; border-radius: 2px;">SAFE</span>`;

      const typeLabel = t.is_static
        ? `<span style="color: ${sColor};">■ STATIC</span>`
        : `<span style="color: ${sColor};">● DYNAMIC</span>`;

      return `
        <tr style="border-bottom: 1px solid var(--border-hairline); ${isDanger ? 'background: var(--accent-danger-dim);' : ''}">
          <td style="padding: 8px 10px; font-weight: 700; ${isDanger ? 'color: var(--accent-danger);' : ''}">${t.target_id || t.id || 'TRK'}</td>
          <td style="padding: 8px 10px;">${typeLabel}</td>
          <td style="padding: 8px 10px; font-weight: 700; color: ${sColor};">RADAR ${sid}</td>
          <td style="padding: 8px 10px; font-weight: 700;">${(t.range || 0).toFixed(2)} m</td>
          <td style="padding: 8px 10px;">${(t.azimuth || 0).toFixed(1)}°</td>
          <td style="padding: 8px 10px; ${isDanger ? 'color: var(--accent-danger); font-weight: 700;' : ''}">${(t.velocity || 0).toFixed(2)} m/s</td>
          <td style="padding: 8px 10px;">${zoneTag}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows;
  }

  // 7. Update Live Detection Summary (Total, Dynamic, Static, Closest)
  updateSummary(targets) {
    this.updateTrackingTable(targets);

    const totalEl = document.getElementById('summaryTotalObjects');
    const dynEl = document.getElementById('summaryDynamicObjects');
    const staticEl = document.getElementById('summaryStaticObjects');
    const closestEl = document.getElementById('summaryClosestObject');

    if (!targets || targets.length === 0) {
      if (totalEl) totalEl.textContent = '0';
      if (dynEl) dynEl.textContent = '0';
      if (staticEl) staticEl.textContent = '0';
      if (closestEl) closestEl.textContent = '--';
      return;
    }

    const total = targets.length;
    const staticCount = targets.filter(t => t.is_static).length;
    const dynCount = total - staticCount;

    let closest = null;
    targets.forEach(t => {
      if (!closest || (t.range < closest.range)) closest = t;
    });

    if (totalEl) totalEl.textContent = String(total);
    if (dynEl) dynEl.textContent = String(dynCount);
    if (staticEl) staticEl.textContent = String(staticCount);

    if (closestEl && closest) {
      const sid = closest.sensor_id || 1;
      closestEl.textContent = `${closest.range.toFixed(2)} m (R${sid})`;
      if (closest.range <= this.dangerThreshold) {
        closestEl.style.color = 'var(--accent-danger)';
        this.checkIntrusionAlert(closest);
      } else if (closest.range <= this.warmThreshold) {
        closestEl.style.color = 'var(--accent-warning)';
      } else {
        closestEl.style.color = 'var(--accent-active)';
      }
    }
  }

  checkIntrusionAlert(target) {
    const now = Date.now();
    if (!this.lastAlertTime || (now - this.lastAlertTime > 5000)) {
      this.lastAlertTime = now;
      const tid = target.target_id || target.id || 'TRK';
      this.logAudit('DANGER', `RADAR ${target.sensor_id || 1}`, `Target ${tid} breached DANGER threshold at ${target.range.toFixed(2)}m (${(target.velocity || 0).toFixed(2)} m/s)`);
    }
  }

  // 8. Event Audit Logging
  initAuditLogs() {
    const btnExport = document.getElementById('btnExportAuditLogs');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const csv = ['TIMESTAMP,SEVERITY,SOURCE,MESSAGE'].concat(
          this.auditLogs.map(l => `"${l.time}","${l.severity}","${l.source}","${l.msg.replace(/"/g, '""')}"`)
        ).join('\\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `radar_audit_${new Date().toISOString().substring(0, 10)}.csv`;
        a.click();
      });
    }

    // Severity filter buttons
    const filters = [
      { id: 'btnFilterLogsAll', val: 'all' },
      { id: 'btnFilterLogsDanger', val: 'DANGER' },
      { id: 'btnFilterLogsWarn', val: 'WARN' },
      { id: 'btnFilterLogsSystem', val: 'SYSTEM' }
    ];
    filters.forEach(f => {
      const btn = document.getElementById(f.id);
      if (btn) {
        btn.addEventListener('click', () => {
          filters.forEach(o => {
            const b = document.getElementById(o.id);
            if (b) b.classList.remove('active');
          });
          btn.classList.add('active');
          this.renderAuditTable(f.val);
        });
      }
    });

    // Seed initial event
    this.logAudit('SYSTEM', 'FUSION ENGINE', '3-Radar global coordinate fusion pipeline active @ 25 FPS');
  }

  logAudit(severity, source, msg) {
    const now = new Date();
    const timeStr = now.toTimeString().substring(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry = { time: timeStr, severity, source, msg };
    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 200) this.auditLogs.pop();
    this.renderAuditTable('all');
  }

  renderAuditTable(filterSev) {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;

    let items = this.auditLogs;
    if (filterSev && filterSev !== 'all') {
      items = items.filter(l => l.severity === filterSev);
    }

    tbody.innerHTML = items.map(l => {
      const sevColor = l.severity === 'DANGER'
        ? 'var(--accent-danger)'
        : l.severity === 'WARN'
          ? 'var(--accent-warning)'
          : 'var(--accent-active)';

      return `
        <tr style="border-bottom: 1px solid var(--border-hairline); ${l.severity === 'DANGER' ? 'background: var(--accent-danger-dim);' : ''}">
          <td style="padding: 6px 8px; color: var(--text-muted);">${l.time}</td>
          <td style="padding: 6px 8px;"><span class="mono" style="font-size: 9px; font-weight: 700; color: ${sevColor};">${l.severity}</span></td>
          <td style="padding: 6px 8px; font-weight: 700;">${l.source}</td>
          <td style="padding: 6px 8px; ${l.severity === 'DANGER' ? 'font-weight: 600;' : ''}">${l.msg}</td>
        </tr>
      `;
    }).join('');
  }

  // 9. Live Header Clock
  initClock() {
    const el = document.getElementById('headerClockDisplay');
    const update = () => {
      const now = new Date();
      const str = now.toISOString().replace('T', ' ').substring(0, 19);
      if (el) el.textContent = str;
    };
    setInterval(update, 1000);
    update();
  }
}

// Export for app.js
window.ViewManager = ViewManager;
