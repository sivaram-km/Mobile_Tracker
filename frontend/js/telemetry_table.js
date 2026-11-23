/**
 * Live Target Telemetry Table Renderer
 * Precision Engineering Workbench Implementation (Monospace, Tabular, High-Density)
 */
class TelemetryTable {
  constructor(tbodyId, counterId) {
    this.tbody = document.getElementById(tbodyId);
    this.counterEl = document.getElementById(counterId);
    this.selectedRadar = 'all';
    this.lastTargets = [];
    this.onRowHover = null;
    this.hoveredTargetId = null;
    this.dangerRadius = 2.0;
    this.warningRadius = 4.0;

    if (this.tbody) {
      this.tbody.addEventListener('mouseover', (e) => {
        const tr = e.target.closest('tr[data-target-id]');
        if (tr) {
          const tid = tr.getAttribute('data-target-id');
          if (tid !== this.hoveredTargetId) {
            this.hoveredTargetId = tid;
            if (this.onRowHover) this.onRowHover(tid);
          }
        }
      });

      this.tbody.addEventListener('mouseout', (e) => {
        const tr = e.target.closest('tr[data-target-id]');
        if (tr && !this.tbody.contains(e.relatedTarget)) {
          this.hoveredTargetId = null;
          if (this.onRowHover) this.onRowHover(null);
        }
      });
    }
  }

  setOnRowHover(callback) {
    this.onRowHover = callback;
  }

  setZoneThresholds(dangerMeters, warmMeters) {
    this.dangerRadius = Math.max(0.2, parseFloat(dangerMeters));
    this.warningRadius = Math.max(this.dangerRadius + 0.1, parseFloat(warmMeters));
    this.update(this.lastTargets);
  }

  classifyZone(rangeM) {
    if (rangeM <= this.dangerRadius) return 'DANGER';
    if (rangeM <= this.warningRadius) return 'WARM';
    return 'SAFE';
  }

  setHoveredRow(targetId) {
    this.hoveredTargetId = targetId;
    if (!this.tbody) return;
    const rows = this.tbody.querySelectorAll('tr[data-target-id]');
    rows.forEach(r => {
      if (targetId && r.getAttribute('data-target-id') === targetId) {
        r.classList.add('hovered-target');
      } else {
        r.classList.remove('hovered-target');
      }
    });
  }

  setSelectedRadar(radarId) {
    this.selectedRadar = radarId;
    this.update(this.lastTargets);
  }

  update(targets) {
    this.lastTargets = targets || [];
    if (!this.tbody) return;

    let displayTargets = this.lastTargets;
    if (this.selectedRadar && this.selectedRadar !== 'all') {
      displayTargets = displayTargets.filter(t => t.sensor_id == this.selectedRadar);
    }

    const count = displayTargets.length;
    if (this.counterEl) {
      const suffix = this.selectedRadar !== 'all' ? ` (RADAR ${this.selectedRadar})` : '';
      this.counterEl.textContent = `${count} ${count === 1 ? 'DETECTION' : 'DETECTIONS'}${suffix}`;
    }

    if (!displayTargets || displayTargets.length === 0) {
      const waitMsg = this.selectedRadar !== 'all'
        ? `WAITING FOR RADAR ${this.selectedRadar} DETECTIONS...`
        : `WAITING FOR RADAR TARGETS...`;

      this.tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 36px 0; color: var(--text-muted); font-size: 10px; font-family: var(--font-mono); letter-spacing: 0.05em;">
            ${waitMsg}
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    displayTargets.forEach(t => {
      const computedZone = this.classifyZone(t.range);
      const zoneTagClass = computedZone === 'DANGER' ? 'danger' :
                           computedZone === 'WARM' ? 'warm' : 'safe';
      const zoneLabel = computedZone;

      const shortId = (t.id || 'TRK-01').replace('TARGET-', 'TRK-');
      const velVal = t.velocity || 0;
      const velText = `${velVal >= 0 ? '+' : ''}${velVal.toFixed(2)} m/s`;
      const idColor = t.zone === 'DANGER' ? 'var(--accent-danger)' :
                      t.zone === 'WARNING' ? 'var(--accent-warning)' : 'var(--accent-cyan)';

      const isHovered = (this.hoveredTargetId === t.id);
      const sid = t.sensor_id || 1;
      const sensorColor = sid == 2 ? '#B56CFF' : (sid == 3 ? '#FFB52E' : '#00E5FF');
      const isDynamic = (t.state === 'ACTIVE' || (t.velocity || 0) > 0.2);
      const motionMarker = isDynamic
        ? `<span style="color:#00E5FF; font-size:8px; margin-right:3px;" title="Dynamic Object">●</span>`
        : `<span style="color:var(--text-secondary); font-size:8px; margin-right:3px;" title="Static Object">■</span>`;

      rowsHtml += `
        <tr data-target-id="${t.id}" class="${isHovered ? 'hovered-target' : ''}">
          <td style="font-weight: 700; color: ${sensorColor};">${motionMarker}${shortId}</td>
          <td><span class="zone-tag ${zoneTagClass}">${zoneLabel}</span></td>
          <td class="col-num">${t.range.toFixed(2)}m</td>
          <td class="col-num">${t.azimuth.toFixed(1)}°</td>
          <td class="col-num" style="color: ${velVal !== 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${velText}</td>
          <td style="text-align: center; font-weight: 700; color: ${sensorColor};">S${sid}</td>
        </tr>
      `;
    });

    this.tbody.innerHTML = rowsHtml;
  }
}
