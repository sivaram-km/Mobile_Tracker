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
      const zoneTagClass = t.zone === 'DANGER' ? 'danger' :
                           t.zone === 'WARNING' ? 'warning' : 'safe';
      const zoneLabel = t.zone || 'SAFE';

      const shortId = (t.id || 'TRK-01').replace('TARGET-', 'TRK-');
      const velVal = t.velocity || 0;
      const velText = `${velVal >= 0 ? '+' : ''}${velVal.toFixed(2)} m/s`;
      const idColor = t.zone === 'DANGER' ? 'var(--accent-danger)' :
                      t.zone === 'WARNING' ? 'var(--accent-warning)' : 'var(--accent-cyan)';

      rowsHtml += `
        <tr>
          <td style="font-weight: 700; color: ${idColor};">${shortId}</td>
          <td><span class="zone-tag ${zoneTagClass}">${zoneLabel}</span></td>
          <td class="col-num">${t.range.toFixed(2)}m</td>
          <td class="col-num">${t.azimuth.toFixed(1)}°</td>
          <td class="col-num" style="color: ${velVal !== 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${velText}</td>
          <td style="text-align: center; font-weight: 700; color: var(--text-secondary);">S${t.sensor_id || 1}</td>
        </tr>
      `;
    });

    this.tbody.innerHTML = rowsHtml;
  }
}
