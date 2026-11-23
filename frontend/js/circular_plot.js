/**
 * 360° Circular Polar Plot Canvas Engine
 * Precision Engineering Workbench Implementation (Zero SaaS fluff, zero drop-shadows)
 * Supports: Dark Workbench & White Mode Themes
 */
class CircularPlot {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Scale & Range settings
    this.maxRange = 10.0;     // Default 10 meters
    this.dangerRadius = 2.0;  // 2 meters
    this.warningRadius = 4.0; // 4 meters
    this.rings = [2.0, 4.0, 6.0, 8.0, 10.0];

    // Plot Display Toggles
    this.showFoV = true;
    this.showVelocity = true;
    this.showSectorBounds = true;

    // Theme state
    this.theme = 'dark';
    this.colors = {};
    this.setTheme('dark');

    // Radar Isolation / Tab Filter ('all', 1, 2, or 3)
    this.selectedRadar = 'all';

    // Data buffers
    this.targets = [];
    this.points = [];
    this.sensors = {
      1: { enabled: true, orientation: 0.0, status: 'DISCONNECTED' },
      2: { enabled: true, orientation: 120.0, status: 'DISCONNECTED' },
      3: { enabled: true, orientation: 240.0, status: 'DISCONNECTED' }
    };

    this.init();
  }

  setSelectedRadar(radarId) {
    this.selectedRadar = radarId;
  }

  setTheme(themeName) {
    this.theme = themeName || 'dark';

    if (this.theme === 'light') {
      // Crisp Engineering White Mode
      this.colors = {
        bg: '#FFFFFF',
        panel: '#F8FAFC',
        surface: '#F1F5F9',
        spoke: '#E2E8F0',
        spokeMajor: '#CBD5E1',
        ring: '#E2E8F0',
        ringMajor: '#94A3B8',
        tickMajor: '#475569',
        tickMinor: '#CBD5E1',
        textPrimary: '#0F172A',
        textSecondary: '#475569',
        textMuted: '#94A3B8',
        cyan: '#0284C7',
        // Distinct, high-visibility FoV in White Mode
        fovActive: 'rgba(2, 132, 199, 0.18)',
        fovStandby: 'rgba(2, 132, 199, 0.10)',
        fovStroke: 'rgba(2, 132, 199, 0.70)',
        fovArc: 'rgba(2, 132, 199, 0.45)',
        fovLabel: '#0369A1',
        danger: '#DC2626',
        dangerFill: 'rgba(220, 38, 38, 0.08)',
        dangerBorder: 'rgba(220, 38, 38, 0.65)',
        warning: '#D97706',
        warningFill: 'rgba(217, 119, 6, 0.08)',
        warningBorder: 'rgba(217, 119, 6, 0.60)',
        active: '#16A34A',
        calloutBg: 'rgba(255, 255, 255, 0.96)',
        calloutBorder: '#CBD5E1',
        hubChassis: '#FFFFFF',
        hubBorder: '#94A3B8'
      };
    } else {
      // Dark Precision Workbench Mode
      this.colors = {
        bg: '#0B0E14',
        panel: '#11151E',
        surface: '#141A25',
        spoke: '#1A2230',
        spokeMajor: '#263143',
        ring: '#222936',
        ringMajor: '#333D4F',
        tickMajor: '#64748B',
        tickMinor: '#222936',
        textPrimary: '#E6EDF3',
        textSecondary: '#7D8590',
        textMuted: '#484F58',
        cyan: '#38BDF8',
        // Distinct, high-visibility FoV in Dark Mode
        fovActive: 'rgba(56, 189, 248, 0.20)',
        fovStandby: 'rgba(56, 189, 248, 0.12)',
        fovStroke: 'rgba(56, 189, 248, 0.75)',
        fovArc: 'rgba(56, 189, 248, 0.50)',
        fovLabel: '#38BDF8',
        danger: '#EF4444',
        dangerFill: 'rgba(239, 68, 68, 0.08)',
        dangerBorder: 'rgba(239, 68, 68, 0.65)',
        warning: '#F59E0B',
        warningFill: 'rgba(245, 158, 11, 0.08)',
        warningBorder: 'rgba(245, 158, 11, 0.55)',
        active: '#22C55E',
        calloutBg: 'rgba(17, 21, 30, 0.94)',
        calloutBorder: '#222936',
        hubChassis: '#11151E',
        hubBorder: '#2D3748'
      };
    }
  }

  init() {
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderLoop();
  }

  setRangeScale(maxMeters) {
    this.maxRange = maxMeters;
    if (maxMeters === 5.0) {
      this.dangerRadius = 1.0;
      this.warningRadius = 2.5;
      this.rings = [1.0, 2.0, 3.0, 4.0, 5.0];
    } else if (maxMeters === 15.0) {
      this.dangerRadius = 3.0;
      this.warningRadius = 6.0;
      this.rings = [3.0, 6.0, 9.0, 12.0, 15.0];
    } else {
      // Default 10.0m
      this.dangerRadius = 2.0;
      this.warningRadius = 4.0;
      this.rings = [2.0, 4.0, 6.0, 8.0, 10.0];
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const size = Math.min(parent.clientWidth, parent.clientHeight) - 16;
    const dpr = window.devicePixelRatio || 1;

    this.width = Math.max(size, 380);
    this.height = Math.max(size, 380);

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    // Leave 38px margin for circumference degree readouts
    this.plotRadius = (this.width / 2) - 38;
  }

  metersToPixels(meters) {
    return (meters / this.maxRange) * this.plotRadius;
  }

  polarToCanvas(rangeM, azimuthDeg) {
    // 0° is North (+Y in real space, -Y in canvas space), rotating clockwise
    const r = this.metersToPixels(rangeM);
    const theta = (azimuthDeg - 90) * (Math.PI / 180);
    return {
      x: this.cx + r * Math.cos(theta),
      y: this.cy + r * Math.sin(theta)
    };
  }

  updateData(targets, points, sensors) {
    if (targets !== undefined) this.targets = targets;
    if (points !== undefined) this.points = points;
    if (sensors !== undefined) this.sensors = sensors;
  }

  renderLoop() {
    this.draw();
    requestAnimationFrame(() => this.renderLoop());
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw FoV sectors (Distinctly visible in both dark and light modes)
    if (this.showFoV) {
      this.drawSensorFoVs();
    }

    // 2. Draw Zone fills with subtle engineering tint
    this.drawZoneFills();

    // 3. Draw Concentric Range Rings & Hairline Spoke Grid
    this.drawPolarGrid();

    // 4. Circumference Drafting Ticks & Degree Readouts
    this.drawCircumferenceTicks();

    // 5. Draw Range Labels along the 45° (North-East) radial axis (zero North collision)
    this.drawRadialRangeLabels();

    // 6. Draw Boresight Arrow (North / 0°)
    this.drawBoresight();

    // 7. Draw Precision 3-Sensor Center Hub
    this.drawCenterHub();

    // 8. Draw Raw Radar Reflections (Point Cloud)
    this.drawPointCloud();

    // 9. Draw Tracked Mobile Targets with Vectors & Monospace Callouts
    this.drawTargets();
  }

  drawSensorFoVs() {
    const ctx = this.ctx;
    const configs = [
      { id: 1, angle: 0.0, label: 'FOV 1 (0°)' },
      { id: 2, angle: 120.0, label: 'FOV 2 (120°)' },
      { id: 3, angle: 240.0, label: 'FOV 3 (240°)' }
    ];

    const fovHalf = 65.0; // ±65° FoV = 130° total beam per sensor (5° overlap)
    const r = this.plotRadius;

    configs.forEach(cfg => {
      const s = this.sensors[cfg.id] || this.sensors[`sensor${cfg.id}`];
      const isEnabled = s ? s.enabled : true;
      const isConnected = s ? (s.status === 'CONNECTED' || s.status === 'ACTIVE') : false;
      if (!isEnabled) return;

      const isSelected = (this.selectedRadar === 'all' || this.selectedRadar == cfg.id);
      const isDimmed = (!isSelected && this.selectedRadar !== 'all');

      const startAngle = (cfg.angle - fovHalf - 90) * (Math.PI / 180);
      const endAngle = (cfg.angle + fovHalf - 90) * (Math.PI / 180);

      // Wedge Fill
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.arc(this.cx, this.cy, r, startAngle, endAngle);
      ctx.closePath();
      if (isDimmed) {
        ctx.fillStyle = 'rgba(125, 133, 144, 0.03)';
      } else {
        ctx.fillStyle = isConnected ? this.colors.fovActive : this.colors.fovStandby;
      }
      ctx.fill();

      // Sector Boundaries (Sharp lines)
      if (this.showSectorBounds) {
        ctx.beginPath();
        // Left radial edge
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(this.cx + r * Math.cos(startAngle), this.cy + r * Math.sin(startAngle));
        // Right radial edge
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(this.cx + r * Math.cos(endAngle), this.cy + r * Math.sin(endAngle));
        ctx.strokeStyle = isDimmed ? 'rgba(125, 133, 144, 0.15)' : this.colors.fovStroke;
        ctx.lineWidth = (isSelected && this.selectedRadar !== 'all') ? 2.2 : 1.4;
        ctx.setLineDash((isSelected && this.selectedRadar !== 'all') ? [] : [6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Outer arc outline
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, startAngle, endAngle);
        ctx.strokeStyle = isDimmed ? 'rgba(125, 133, 144, 0.15)' : this.colors.fovArc;
        ctx.lineWidth = (isSelected && this.selectedRadar !== 'all') ? 2.0 : 1.2;
        ctx.stroke();

        // Sector Orientation Label near outer boundary
        const midRad = (cfg.angle - 90) * (Math.PI / 180);
        const labelR = r * 0.88;
        const lx = this.cx + labelR * Math.cos(midRad);
        const ly = this.cy + labelR * Math.sin(midRad);

        ctx.font = (isSelected && this.selectedRadar !== 'all') ? '800 11px var(--font-mono)' : '700 9px var(--font-mono)';
        ctx.fillStyle = isDimmed ? 'rgba(125, 133, 144, 0.3)' : this.colors.fovLabel;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cfg.label, lx, ly);
      }
    });
  }

  drawZoneFills() {
    const ctx = this.ctx;
    const rDanger = this.metersToPixels(this.dangerRadius);
    const rWarning = this.metersToPixels(this.warningRadius);

    // Warning Zone Annulus (dangerRadius to warningRadius)
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, rWarning, 0, Math.PI * 2, false);
    ctx.arc(this.cx, this.cy, rDanger, 0, Math.PI * 2, true);
    ctx.fillStyle = this.colors.warningFill;
    ctx.fill();

    // Warning Ring Boundary
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, rWarning, 0, Math.PI * 2);
    ctx.strokeStyle = this.colors.warningBorder;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Danger Zone Circle (0 to dangerRadius)
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, rDanger, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.dangerFill;
    ctx.fill();

    // Danger Ring Boundary
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, rDanger, 0, Math.PI * 2);
    ctx.strokeStyle = this.colors.dangerBorder;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  drawPolarGrid() {
    const ctx = this.ctx;

    // 1. Concentric Range Rings
    this.rings.forEach(m => {
      const r = this.metersToPixels(m);
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = (m === this.maxRange) ? this.colors.ringMajor : this.colors.ring;
      ctx.lineWidth = (m === this.maxRange) ? 1.2 : 0.8;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 2. Radial Spokes (every 30°)
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg - 90) * (Math.PI / 180);
      const x = this.cx + this.plotRadius * Math.cos(rad);
      const y = this.cy + this.plotRadius * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = (deg % 90 === 0) ? this.colors.spokeMajor : this.colors.spoke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  drawCircumferenceTicks() {
    const ctx = this.ctx;
    const R = this.plotRadius;

    // Outer boundary circle
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = this.colors.ringMajor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Drafting Ticks every 5°
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg - 90) * (Math.PI / 180);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      let tickLen = 3.5;
      let stroke = this.colors.tickMinor;
      let width = 0.8;

      if (deg % 30 === 0) {
        tickLen = 9.0;
        stroke = this.colors.tickMajor;
        width = 1.2;
      } else if (deg % 10 === 0) {
        tickLen = 6.0;
        stroke = this.colors.tickMajor;
        width = 1.0;
      }

      ctx.beginPath();
      ctx.moveTo(this.cx + R * cos, this.cy + R * sin);
      ctx.lineTo(this.cx + (R - tickLen) * cos, this.cy + (R - tickLen) * sin);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();

      // Degree numeric readouts outside outer ring (every 30°)
      if (deg % 30 === 0) {
        const textR = R + 15;
        const lx = this.cx + textR * cos;
        const ly = this.cy + textR * sin;

        ctx.font = '600 10px var(--font-mono)';
        ctx.fillStyle = deg === 0 ? this.colors.cyan : this.colors.textSecondary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${deg}°`, lx, ly);
      }
    }
  }

  drawRadialRangeLabels() {
    const ctx = this.ctx;

    // Position range labels along the 45° (North-East) radial axis
    // This strictly prevents ANY overlap with the 0° North arrow or North label
    this.rings.forEach(m => {
      const pos = this.polarToCanvas(m, 45);

      ctx.font = '600 10px var(--font-mono)';
      ctx.fillStyle = this.colors.textSecondary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${m.toFixed(0)}m`, pos.x + 3, pos.y - 2);
    });

    // Subtle Zone indicators along 45° spoke
    const dangerPos = this.polarToCanvas(this.dangerRadius, 45);
    ctx.font = '700 9px var(--font-mono)';
    ctx.fillStyle = this.colors.danger;
    ctx.textAlign = 'right';
    ctx.fillText('DANGER', dangerPos.x - 4, dangerPos.y + 11);

    const warnPos = this.polarToCanvas(this.warningRadius, 45);
    ctx.font = '700 9px var(--font-mono)';
    ctx.fillStyle = this.colors.warning;
    ctx.textAlign = 'right';
    ctx.fillText('WARN', warnPos.x - 4, warnPos.y + 11);
  }

  drawBoresight() {
    const ctx = this.ctx;
    const r = this.plotRadius;

    // Hairline boresight line pointing North (0°)
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(this.cx, this.cy - r);
    ctx.strokeStyle = this.colors.cyan;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Sharp Geometric Arrowhead
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy - r - 2);
    ctx.lineTo(this.cx - 4, this.cy - r + 8);
    ctx.lineTo(this.cx + 4, this.cy - r + 8);
    ctx.closePath();
    ctx.fillStyle = this.colors.cyan;
    ctx.fill();

    // Monospace NORTH Readout
    ctx.font = '700 10px var(--font-mono)';
    ctx.fillStyle = this.colors.cyan;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('0° NORTH', this.cx, this.cy - r - 12);
  }

  drawCenterHub() {
    const ctx = this.ctx;

    // Geometric 3-sensor hub chassis
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.hubChassis;
    ctx.fill();
    ctx.strokeStyle = this.colors.hubBorder;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 3 Directional Sensor Indices (0°, 120°, 240°)
    const orientations = [
      { id: 1, angle: 0.0, label: 'S1' },
      { id: 2, angle: 120.0, label: 'S2' },
      { id: 3, angle: 240.0, label: 'S3' }
    ];

    orientations.forEach(item => {
      const rad = (item.angle - 90) * (Math.PI / 180);
      const innerX = this.cx + 12 * Math.cos(rad);
      const innerY = this.cy + 12 * Math.sin(rad);
      const outerX = this.cx + 22 * Math.cos(rad);
      const outerY = this.cy + 22 * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.strokeStyle = this.colors.cyan;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Micro Sensor Label
      const lx = this.cx + 28 * Math.cos(rad);
      const ly = this.cy + 28 * Math.sin(rad);
      ctx.font = '700 8px var(--font-mono)';
      ctx.fillStyle = this.colors.cyan;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, lx, ly);
    });

    // Central core origin dot
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.cyan;
    ctx.fill();
  }

  drawPointCloud() {
    if (!this.points || !this.points.length) return;
    const ctx = this.ctx;
    ctx.fillStyle = this.colors.cyan;

    this.points.forEach(p => {
      // Filter by selected radar tab if not 'all'
      if (this.selectedRadar !== 'all' && p.sensor_id != this.selectedRadar) {
        return;
      }

      const range = p.range !== undefined ? p.range : Math.sqrt((p.x || 0) ** 2 + (p.y || 0) ** 2);
      const azimuth = p.azimuth !== undefined ? p.azimuth : 0;
      if (range > this.maxRange) return;

      const pos = this.polarToCanvas(range, azimuth);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawTargets() {
    if (!this.targets || !this.targets.length) return;

    this.targets.forEach(t => {
      // Filter by selected radar tab if not 'all'
      if (this.selectedRadar !== 'all' && t.sensor_id != this.selectedRadar) {
        return;
      }

      if (t.range > this.maxRange) return;
      const pos = this.polarToCanvas(t.range, t.azimuth);
      const zoneColor = t.zone === 'DANGER' ? this.colors.danger :
                        t.zone === 'WARNING' ? this.colors.warning : this.colors.cyan;

      // 1. Draw Velocity Vector
      if (this.showVelocity && (t.vx !== undefined || t.vy !== undefined || t.velocity !== undefined)) {
        this.drawVelocityVector(pos.x, pos.y, t.vx || 0, t.vy || 0, t.velocity || 0, t.azimuth, zoneColor);
      }

      // 2. Draw Target Marker (Precision Diamond / Crosshair)
      this.drawTargetMarker(pos.x, pos.y, zoneColor, t.id);

      // 3. Draw Floating Monospace Workbench Callout
      this.drawCalloutTag(pos.x, pos.y, t, zoneColor);
    });
  }

  drawVelocityVector(x, y, vx, vy, velocity, azimuthDeg, color) {
    const ctx = this.ctx;
    const arrowScale = 20.0;
    let destX = x;
    let destY = y;

    if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
      destX = x + vx * arrowScale;
      destY = y - vy * arrowScale;
    } else if (Math.abs(velocity) > 0.05) {
      const rad = (azimuthDeg - 90) * (Math.PI / 180);
      destX = x + Math.cos(rad) * velocity * arrowScale;
      destY = y + Math.sin(rad) * velocity * arrowScale;
    } else {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(destX, destY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(destY - y, destX - x);
    const headLen = 6;
    ctx.beginPath();
    ctx.moveTo(destX, destY);
    ctx.lineTo(destX - headLen * Math.cos(angle - Math.PI / 6), destY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(destX - headLen * Math.cos(angle + Math.PI / 6), destY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawTargetMarker(x, y, color, id) {
    const ctx = this.ctx;

    // Subdued aura ring (zero blur)
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Solid Target Core
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = this.colors.bg;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawCalloutTag(x, y, target, color) {
    const ctx = this.ctx;
    const tagX = x + 14;
    const tagY = y - 16;

    const shortId = (target.id || 'TRK-01').replace('TARGET-', 'TRK-');
    const titleText = `${shortId} [${target.zone || 'SAFE'}]`;
    const line1 = `R:${target.range.toFixed(2)}m AZ:${target.azimuth.toFixed(0)}°`;
    const velNum = target.velocity || 0;
    const line2 = `V:${velNum >= 0 ? '+' : ''}${velNum.toFixed(2)}m/s S${target.sensor_id || 1}`;

    ctx.font = '700 9px var(--font-mono)';
    const titleWidth = ctx.measureText(titleText).width;
    ctx.font = '500 9px var(--font-mono)';
    const line1Width = ctx.measureText(line1).width;
    const line2Width = ctx.measureText(line2).width;

    const boxWidth = Math.max(titleWidth, line1Width, line2Width) + 14;
    const boxHeight = 40;

    // Leader line
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tagX, tagY + 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // High-density flat card (Strict Anti-SaaS: box-shadow 0, radius 2px)
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.colors.calloutBg;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, boxWidth, boxHeight, 2);
    ctx.fill();
    ctx.strokeStyle = this.colors.calloutBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Callout text lines
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = '700 9px var(--font-mono)';
    ctx.fillStyle = color;
    ctx.fillText(titleText, tagX + 6, tagY + 4);

    ctx.font = '500 9px var(--font-mono)';
    ctx.fillStyle = this.colors.textPrimary;
    ctx.fillText(line1, tagX + 6, tagY + 16);

    ctx.font = '500 8px var(--font-mono)';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText(line2, tagX + 6, tagY + 27);
  }
}
