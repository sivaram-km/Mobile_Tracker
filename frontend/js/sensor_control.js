/**
 * Sensor Control & System Health Manager
 * Precision Engineering Workbench Implementation
 */
class SensorControlManager {
  constructor(plotInstance) {
    this.plot = plotInstance;
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
    this.initRangeScale();
    this.initOverlayTools();
  }

  logTerminal(msg) {
    if (!this.terminalEl) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    this.terminalEl.textContent += `\n[${timeStr}] ${msg}`;
    this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
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
          this.logTerminal(`Range scale adjusted to ${s.range}m.`);
        });
      }
    });
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
