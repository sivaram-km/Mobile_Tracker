/**
 * Sensor Control & System Health Manager
 * Precision Engineering Workbench Implementation
 */
class SensorControlManager {
  constructor(plotInstance, telemetryTableInstance = null) {
    this.plot = plotInstance;
    this.table = telemetryTableInstance;
    this.sensorCards = {
      1: document.getElementById('sensorCard1'),
      2: document.getElementById('sensorCard2'),
      3: document.getElementById('sensorCard3')
    };
    this.targetCounters = {
      1: document.getElementById('sensorTargets1'),
      2: document.getElementById('sensorTargets2'),
      3: document.getElementById('sensorTargets3')
    };
    this.statusIndicators = {
      1: document.getElementById('sensorBadge1'),
      2: document.getElementById('sensorBadge2'),
      3: document.getElementById('sensorBadge3')
    };
    this.summaryEl = document.getElementById('activeSensorSummary');
    this.terminalEl = document.getElementById('miniTerminalLog');

    this.initToggles();
    this.initSettingsPopover();
    this.initRangeScale();
    this.initOverlayTools();
    this.initZoneControls();
  }

  logTerminal(msg) {
    if (!this.terminalEl) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    this.terminalEl.textContent += `\n[${timeStr}] ${msg}`;
    this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
  }

  initSettingsPopover() {
    const btnSettings = document.getElementById('btnSettings');
    const popover = document.getElementById('settingsPopover');
    const btnClose = document.getElementById('btnCloseSettings');

    if (btnSettings && popover) {
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.toggle('open');
      });

      if (btnClose) {
        btnClose.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.remove('open');
        });
      }

      // Close when clicking outside the popover
      document.addEventListener('click', (e) => {
        if (!popover.contains(e.target) && e.target !== btnSettings && !btnSettings.contains(e.target)) {
          popover.classList.remove('open');
        }
      });

      // Prevent clicks inside popover from propagating to document
      popover.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  initToggles() {
    // Sensor ON/OFF blind-spot toggles
    [1, 2, 3].forEach(sid => {
      const toggle = document.getElementById(`sensorToggle${sid}`);
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          this.toggleSensor(sid, e.target.checked);
        });
      }
    });
  }

  initRangeScale() {
    const scales = [
      { id: 'btnRange5m', range: 5.0 },
      { id: 'btnRange10m', range: 10.0 },
      { id: 'btnRange15m', range: 15.0 }
    ];

    scales.forEach(s => {
      const btn = document.getElementById(s.id);
      if (btn) {
        btn.addEventListener('click', () => {
          scales.forEach(other => {
            const b = document.getElementById(other.id);
            if (b) b.classList.remove('active');
          });
          btn.classList.add('active');
          this.plot.setRangeScale(s.range);

          // Update numeric input max bounds to match active range scale
          const inputDanger = document.getElementById('inputDangerZone');
          const inputWarm = document.getElementById('inputWarmZone');
          if (inputDanger && inputWarm) {
            inputDanger.max = (s.range - 0.5).toFixed(1);
            inputWarm.max = (s.range - 0.2).toFixed(1);

            let d = parseFloat(inputDanger.value);
            let w = parseFloat(inputWarm.value);
            if (w > s.range) {
              w = s.range * 0.4;
              inputWarm.value = w.toFixed(1);
            }
            if (d >= w) {
              d = w * 0.5;
              inputDanger.value = d.toFixed(1);
            }
            this.plot.setCustomZones(d, w);
            if (this.table) this.table.setZoneThresholds(d, w);
          }

          this.logTerminal(`Range scale adjusted to ${s.range}m.`);
        });
      }
    });
  }

  initZoneControls() {
    const inputDanger = document.getElementById('inputDangerZone');
    const inputWarm = document.getElementById('inputWarmZone');
    const btnReset = document.getElementById('btnResetZones');
    const btnApply = document.getElementById('btnApplyZones');

    const onDangerChange = () => {
      if (!inputDanger || !inputWarm) return;
      let d = parseFloat(inputDanger.value);
      let w = parseFloat(inputWarm.value);
      if (isNaN(d) || d <= 0) d = 0.5;
      if (isNaN(w) || w <= 0) w = 1.0;
      if (d >= w) {
        w = d + 0.2;
        inputWarm.value = w.toFixed(1);
      }
      this.plot.setCustomZones(d, w);
      if (this.table) this.table.setZoneThresholds(d, w);
    };

    const onWarmChange = () => {
      if (!inputDanger || !inputWarm) return;
      let d = parseFloat(inputDanger.value);
      let w = parseFloat(inputWarm.value);
      if (isNaN(w) || w <= 0) w = 1.0;
      if (isNaN(d) || d <= 0) d = 0.5;
      if (w <= d) {
        d = Math.max(0.1, w - 0.2);
        inputDanger.value = d.toFixed(1);
      }
      this.plot.setCustomZones(d, w);
      if (this.table) this.table.setZoneThresholds(d, w);
    };

    if (inputDanger) {
      inputDanger.addEventListener('input', onDangerChange);
      inputDanger.addEventListener('change', onDangerChange);
    }

    if (inputWarm) {
      inputWarm.addEventListener('input', onWarmChange);
      inputWarm.addEventListener('change', onWarmChange);
    }

    // Apply button: Commits entered threshold numbers to backend API
    if (btnApply) {
      btnApply.addEventListener('click', async () => {
        let d = parseFloat(inputDanger ? inputDanger.value : 2.0);
        let w = parseFloat(inputWarm ? inputWarm.value : 4.0);
        if (isNaN(d) || d <= 0) d = 2.0;
        if (isNaN(w) || w <= 0) w = 4.0;
        if (d >= w) {
          w = d + 0.2;
          if (inputWarm) inputWarm.value = w.toFixed(1);
        }

        try {
          const resp = await fetch('/api/zone/thresholds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ danger_radius: d, warning_radius: w })
          });
          const data = await resp.json();
          const origText = btnApply.textContent;
          btnApply.textContent = 'APPLIED!';
          btnApply.style.borderColor = 'var(--accent-active)';
          btnApply.style.color = 'var(--accent-active)';
          setTimeout(() => {
            btnApply.textContent = origText;
            btnApply.style.borderColor = '';
            btnApply.style.color = '';
          }, 1200);
          this.logTerminal(`Zone thresholds applied: Danger <= ${d.toFixed(1)}m, Warm <= ${w.toFixed(1)}m.`);
        } catch (err) {
          console.error('Failed to update zone thresholds:', err);
          this.logTerminal(`Error saving zone thresholds: ${err.message}`);
        }
      });
    }

    // Reset button: Restores defaults (Danger: 2.0m, Warm: 4.0m)
    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        const defDanger = 2.0;
        const defWarm = 4.0;
        if (inputDanger) inputDanger.value = defDanger.toFixed(1);
        if (inputWarm) inputWarm.value = defWarm.toFixed(1);

        this.plot.setCustomZones(defDanger, defWarm);
        if (this.table) this.table.setZoneThresholds(defDanger, defWarm);

        try {
          await fetch('/api/zone/thresholds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ danger_radius: defDanger, warning_radius: defWarm })
          });
          const origText = btnReset.textContent;
          btnReset.textContent = 'RESET!';
          setTimeout(() => { btnReset.textContent = origText; }, 1000);
          this.logTerminal(`Zone thresholds reset to default: Danger <= ${defDanger.toFixed(1)}m, Warm <= ${defWarm.toFixed(1)}m.`);
        } catch (err) {
          console.error('Failed to reset zone thresholds:', err);
        }
      });
    }

    // Synchronize initial values from backend on page load
    fetch('/api/zone/thresholds')
      .then(res => res.json())
      .then(data => {
        if (data && data.danger_radius !== undefined && data.warning_radius !== undefined) {
          const d = parseFloat(data.danger_radius);
          const w = parseFloat(data.warning_radius);
          if (inputDanger) inputDanger.value = d.toFixed(1);
          if (inputWarm) inputWarm.value = w.toFixed(1);
          this.plot.setCustomZones(d, w);
          if (this.table) this.table.setZoneThresholds(d, w);
        }
      })
      .catch(() => { });
  }

  initOverlayTools() {
    // ±65° FoV Sector toggle
    const btnFov = document.getElementById('btnToolFov');
    if (btnFov) {
      btnFov.addEventListener('click', () => {
        this.plot.showFoV = !this.plot.showFoV;
        btnFov.classList.toggle('active', this.plot.showFoV);
        this.logTerminal(`FoV sectors ${this.plot.showFoV ? 'enabled' : 'hidden'}.`);
      });
    }

    // Velocity vectors toggle
    const btnVel = document.getElementById('btnToolVel');
    if (btnVel) {
      btnVel.addEventListener('click', () => {
        this.plot.showVelocity = !this.plot.showVelocity;
        btnVel.classList.toggle('active', this.plot.showVelocity);
        this.logTerminal(`Velocity vectors ${this.plot.showVelocity ? 'enabled' : 'hidden'}.`);
      });
    }

    // Sector boundaries toggle
    const btnBounds = document.getElementById('btnToolBounds');
    if (btnBounds) {
      btnBounds.addEventListener('click', () => {
        this.plot.showSectorBounds = !this.plot.showSectorBounds;
        btnBounds.classList.toggle('active', this.plot.showSectorBounds);
        this.logTerminal(`Sector boundaries ${this.plot.showSectorBounds ? 'enabled' : 'hidden'}.`);
      });
    }
  }

  async toggleSensor(sensorId, isEnabled) {
    try {
      await fetch('/api/sensor/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: sensorId, enabled: isEnabled })
      });

      const card = this.sensorCards[sensorId];
      if (card) {
        if (isEnabled) card.classList.remove('disabled');
        else card.classList.add('disabled');
      }

      if (this.plot.sensors[sensorId]) {
        this.plot.sensors[sensorId].enabled = isEnabled;
      }
      this.logTerminal(`Radar ${sensorId} ${isEnabled ? 'activated' : 'blind-spotted'}.`);
    } catch (err) {
      console.error(`Failed to toggle sensor ${sensorId}:`, err);
    }
  }

  update(sensorsData) {
    if (!sensorsData) return;

    let activeCount = 0;

    [1, 2, 3].forEach(sid => {
      const s = sensorsData[`sensor${sid}`];
      if (!s) return;

      const card = this.sensorCards[sid];
      const counter = this.targetCounters[sid];
      const indicator = this.statusIndicators[sid];
      const toggle = document.getElementById(`sensorToggle${sid}`);

      if (counter && s.active_targets !== undefined) {
        counter.textContent = s.active_targets;
      }

      if (indicator) {
        const dot = indicator.querySelector('.status-dot-6px');
        const text = indicator.querySelector('.status-text') || indicator;
        const st = (s.status || 'DISCONNECTED').toUpperCase();

        if (st === 'CONNECTED' || st === 'ACTIVE') {
          activeCount++;
          indicator.classList.add('active');
          if (dot) dot.classList.add('online');
          if (text) text.textContent = 'ACTIVE';
          if (card) card.classList.remove('disabled');
        } else if (st === 'CONNECTING') {
          indicator.classList.remove('active');
          if (dot) dot.classList.remove('online');
          if (text) text.textContent = 'CONNECTING';
        } else {
          indicator.classList.remove('active');
          if (dot) dot.classList.remove('online');
          if (text) text.textContent = 'OFFLINE';
        }
      }

      if (toggle && s.enabled !== undefined && toggle.checked !== s.enabled) {
        toggle.checked = s.enabled;
        if (card) {
          if (s.enabled) card.classList.remove('disabled');
          else card.classList.add('disabled');
        }
      }
    });

    if (this.summaryEl) {
      this.summaryEl.textContent = `${activeCount}/3 ACTIVE`;
    }
  }
}
