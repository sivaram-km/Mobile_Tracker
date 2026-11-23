/**
 * Configuration and Hardware Radar Modal Manager
 * Precision Engineering Workbench Implementation
 */
class ConfigModalManager {
  constructor() {
    this.configModal = document.getElementById('configModal');
    this.logsModal = document.getElementById('logsModal');

    this.initTriggers();
    this.initActions();
  }

  initTriggers() {
    const btnConfig = document.getElementById('btnConfig');
    if (btnConfig) {
      btnConfig.addEventListener('click', () => {
        this.openConfigModal();
      });
    }

    const btnLogs = document.getElementById('btnLogs');
    if (btnLogs) {
      btnLogs.addEventListener('click', () => {
        this.openLogsModal();
      });
    }

    // Close buttons
    document.querySelectorAll('.modal-close-btn, .btn-modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.configModal) this.configModal.classList.remove('open');
        if (this.logsModal) this.logsModal.classList.remove('open');
      });
    });

    // Close on overlay click
    [this.configModal, this.logsModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.remove('open');
        });
      }
    });
  }

  initActions() {
    const btnScan = document.getElementById('btnScanPorts');
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        this.scanPorts();
      });
    }

    const btnConnect = document.getElementById('btnConnectRadars');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => {
        this.connectRadars();
      });
    }

    const btnDisconnect = document.getElementById('btnDisconnectAll');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => {
        this.disconnectAll();
      });
    }
  }

  async openConfigModal() {
    if (!this.configModal) return;
    this.configModal.classList.add('open');

    await this.loadConfigs();
    await this.scanPorts();
    await this.loadRadarStatus();
  }

  async loadConfigs() {
    try {
      const res = await fetch('/api/configs');
      const data = await res.json();
      const configs = data.configs || ['AOP_6m_default.cfg', 'AOP_9m_default.cfg'];

      [1, 2, 3].forEach(sid => {
        const select = document.getElementById(`cfgFileSelect${sid}`);
        if (select) {
          const currentVal = select.value;
          select.innerHTML = configs.map(c => `<option value="${c}">${c}</option>`).join('');
          if (currentVal && configs.includes(currentVal)) {
            select.value = currentVal;
          }
        }
      });
    } catch (err) {
      console.warn('Could not load radar configs:', err);
    }
  }

  async scanPorts() {
    try {
      const res = await fetch('/api/ports');
      const data = await res.json();
      const ports = data.ports || [];

      const formatPortOption = (p) => {
        let label = p.device;
        const desc = p.description || '';
        if (desc && desc !== 'n/a' && desc !== 'Serial') {
          let shortDesc = desc
            .replace('CP2105 Dual USB to UART Bridge Controller - Enhanced Com Port', 'CP2105 Enhanced [CLI]')
            .replace('CP2105 Dual USB to UART Bridge Controller - Standard Com Port', 'CP2105 Standard [Data]')
            .replace('Dual USB to UART Bridge Controller - ', '')
            .replace('USB to UART Bridge Controller', 'Bridge');
          label = `${p.device} (${shortDesc})`;
        }
        return `<option value="${p.device}" title="${p.device}: ${desc}">${label}</option>`;
      };

      [1, 2, 3].forEach(sid => {
        const cliSelect = document.getElementById(`cfgCliSelect${sid}`);
        const dataSelect = document.getElementById(`cfgDataSelect${sid}`);

        if (cliSelect) {
          const prevCli = cliSelect.value;
          cliSelect.innerHTML = '<option value="">-- None / Configured --</option>' +
            ports.map(formatPortOption).join('');
          if (prevCli) cliSelect.value = prevCli;
        }

        if (dataSelect) {
          const prevData = dataSelect.value;
          dataSelect.innerHTML = '<option value="">-- Disconnected --</option>' +
            ports.map(formatPortOption).join('');
          if (prevData) dataSelect.value = prevData;
        }
      });
    } catch (err) {
      console.warn('Could not scan COM/USB ports:', err);
    }
  }

  async loadRadarStatus() {
    try {
      const res = await fetch('/api/radar/status');
      const data = await res.json();
      const sensors = data.sensors || {};

      [1, 2, 3].forEach(sid => {
        const s = sensors[`sensor${sid}`];
        if (!s) return;

        const cliSelect = document.getElementById(`cfgCliSelect${sid}`);
        const dataSelect = document.getElementById(`cfgDataSelect${sid}`);
        const cfgSelect = document.getElementById(`cfgFileSelect${sid}`);
        const badge = document.getElementById(`cfgStatusBadge${sid}`);

        if (s.cli_port && cliSelect) cliSelect.value = s.cli_port;
        if (s.data_port && dataSelect) dataSelect.value = s.data_port;
        if (s.config && cfgSelect) cfgSelect.value = s.config;

        if (badge) {
          const dot = badge.querySelector('.status-dot-6px');
          const text = badge.querySelector('.status-text') || badge;
          const st = (s.status || 'DISCONNECTED').toUpperCase();

          if (st === 'CONNECTED' || st === 'ACTIVE') {
            badge.classList.add('active');
            if (dot) dot.classList.add('online');
            if (text) text.textContent = 'ACTIVE';
          } else if (st === 'CONNECTING') {
            badge.classList.remove('active');
            if (dot) dot.classList.remove('online');
            if (text) text.textContent = 'CONNECTING';
          } else {
            badge.classList.remove('active');
            if (dot) dot.classList.remove('online');
            if (text) text.textContent = 'OFFLINE';
          }
        }
      });
    } catch (err) {
      console.warn('Could not fetch radar statuses:', err);
    }
  }

  async connectRadars() {
    const btn = document.getElementById('btnConnectRadars');
    if (btn) btn.textContent = 'CONNECTING...';

    const radars = [1, 2, 3].map(sid => {
      const cliSelect = document.getElementById(`cfgCliSelect${sid}`);
      const dataSelect = document.getElementById(`cfgDataSelect${sid}`);
      const cfgSelect = document.getElementById(`cfgFileSelect${sid}`);

      return {
        sensor_id: sid,
        cli_port: cliSelect ? cliSelect.value : null,
        data_port: dataSelect ? dataSelect.value : null,
        config: cfgSelect ? cfgSelect.value : 'AOP_6m_default.cfg'
      };
    });

    try {
      const res = await fetch('/api/radar/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radars })
      });
      const data = await res.json();
      console.log('[Radar Config] Connection response:', data);
      await this.loadRadarStatus();
    } catch (err) {
      console.error('Failed to start radars:', err);
    } finally {
      if (btn) btn.textContent = 'CONNECT RADARS';
    }
  }

  async disconnectAll() {
    try {
      await fetch('/api/radar/stop', { method: 'POST' });
      await this.loadRadarStatus();
    } catch (err) {
      console.error('Failed to disconnect radars:', err);
    }
  }

  openLogsModal() {
    if (!this.logsModal) return;
    this.logsModal.classList.add('open');
  }
}
