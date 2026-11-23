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

    // Hover state for interactive bidirectional highlighting
    this.hoveredTargetId = null;
    this.onTargetHoverCallback = null;

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

  getSensorColor(sid) {
    if (sid == 1) return this.colors.radar1;
    if (sid == 2) return this.colors.radar2;
    if (sid == 3) return this.colors.radar3;
    return this.colors.cyan;
  }

  getSensorGlowColor(sid) {
    if (sid == 1) return 'rgba(0, 229, 255, 0.40)';
    if (sid == 2) return 'rgba(181, 108, 255, 0.40)';
    if (sid == 3) return 'rgba(255, 181, 46, 0.40)';
    return 'rgba(56, 189, 248, 0.35)';
  }

  setTheme(themeName) {
    this.theme = themeName || 'dark';

    if (this.theme === 'light') {
      // Crisp Engineering White Mode with High Contrast
      this.colors = {
        bg: '#F8FAFC',
        bgOuter: '#EDF2F7',
        panel: '#FFFFFF',
        surface: '#F1F5F9',
        surfaceActive: '#E2E8F0',

        // Automotive 3-Radar Colors (Light Mode)
        radar1: '#00A3C4',
        radar1Grad: '#004A7C',
        radar1Glow: 'rgba(0, 163, 196, 0.85)',
        radar1Fill: 'rgba(0, 163, 196, 0.08)',

        radar2: '#8B3DFF',
        radar2Grad: '#4C1D95',
        radar2Glow: 'rgba(139, 61, 255, 0.85)',
        radar2Fill: 'rgba(139, 61, 255, 0.08)',

        radar3: '#D97706',
        radar3Grad: '#92400E',
        radar3Glow: 'rgba(217, 119, 6, 0.85)',
        radar3Fill: 'rgba(217, 119, 6, 0.08)',

        spoke: '#E2E8F0',
        spokeMajor: '#CBD5E1',
        ring: 'rgba(148, 163, 184, 0.40)',
        ringMajor: '#64748B',
        tickMajor: '#334155',
        tickMinor: '#CBD5E1',
        textPrimary: '#0F172A',
        textSecondary: '#475569',
        textMuted: '#64748B',
        cyan: '#00A3C4',

        danger: '#DC2626',
        dangerFill: 'rgba(220, 38, 38, 0.08)',
        dangerBorder: 'rgba(220, 38, 38, 0.70)',
        warning: '#D97706',
        warningFill: 'rgba(217, 119, 6, 0.08)',
        warningBorder: 'rgba(217, 119, 6, 0.65)',
        active: '#16A34A',
        calloutBg: 'rgba(255, 255, 255, 0.96)',
        calloutBorder: '#CBD5E1',
        hubChassis: '#F8FAFC',
        hubBorder: '#94A3B8'
      };
    } else {
      // Premium Automotive Dark Cockpit Mode (Deep Navy / Almost-Black)
      this.colors = {
        bg: '#050811',
        bgOuter: '#03050A',
        panel: '#090E1A',
        surface: '#0F1726',
        surfaceActive: '#1A2538',

        // Automotive 3-Radar Colors
        radar1: '#00E5FF',       // Bright Electric Cyan
        radar1Grad: '#003366',   // Deep Blue
        radar1Glow: 'rgba(0, 229, 255, 0.85)',
        radar1Fill: 'rgba(0, 229, 255, 0.08)',

        radar2: '#B56CFF',       // Bright Violet
        radar2Grad: '#3B0764',   // Deep Purple
        radar2Glow: 'rgba(181, 108, 255, 0.85)',
        radar2Fill: 'rgba(181, 108, 255, 0.08)',

        radar3: '#FFB52E',       // Bright Amber
        radar3Grad: '#7C2D12',   // Deep Orange
        radar3Glow: 'rgba(255, 181, 46, 0.85)',
        radar3Fill: 'rgba(255, 181, 46, 0.08)',

        spoke: '#131B2A',
        spokeMajor: '#1D2A40',
        ring: 'rgba(75, 95, 130, 0.28)',
        ringMajor: '#3E506B',
        tickMajor: '#7A8C9E',
        tickMinor: '#1E293B',
        textPrimary: '#FFFFFF',
        textSecondary: '#94A3B8',
        textMuted: '#64748B',
        cyan: '#00E5FF',

        danger: '#EF4444',
        dangerFill: 'rgba(239, 68, 68, 0.08)',
        dangerBorder: 'rgba(239, 68, 68, 0.65)',
        warning: '#F59E0B',
        warningFill: 'rgba(245, 158, 11, 0.08)',
        warningBorder: 'rgba(245, 158, 11, 0.55)',
        active: '#22C55E',
        calloutBg: 'rgba(7, 11, 20, 0.94)',
        calloutBorder: '#223048',
        hubChassis: '#090E1A',
        hubBorder: '#2A3B54'
      };
    }
  }

  init() {
    window.addEventListener('resize', () => this.resize());

    // Interactive mouse hover detection for targets
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.handleMouseMove(mouseX, mouseY);
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoveredTargetId !== null) {
        this.hoveredTargetId = null;
        if (this.onTargetHoverCallback) this.onTargetHoverCallback(null);
      }
    });

    this.resize();
    this.renderLoop();
  }

  handleMouseMove(mouseX, mouseY) {
    if (!this.targets || !this.targets.length) {
      if (this.hoveredTargetId !== null) {
        this.hoveredTargetId = null;
        if (this.onTargetHoverCallback) this.onTargetHoverCallback(null);
      }
      return;
    }

    let closestId = null;
    let minDist = 18; // 18px radius hit threshold

    this.targets.forEach(t => {
      if (this.selectedRadar !== 'all' && t.sensor_id != this.selectedRadar) return;
      if (t.range > this.maxRange) return;
      const pos = this.polarToCanvas(t.range, t.azimuth);
      const d = Math.hypot(pos.x - mouseX, pos.y - mouseY);
      if (d < minDist) {
        minDist = d;
        closestId = t.id;
      }
    });

    if (this.hoveredTargetId !== closestId) {
      this.hoveredTargetId = closestId;
      if (this.onTargetHoverCallback) {
        this.onTargetHoverCallback(closestId);
      }
    }
  }

  setHoveredTarget(targetId) {
    this.hoveredTargetId = targetId;
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
    // Clear canvas completely to maintain full transparency
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw 3 Equal 120° Automotive Sectors (Transparent with Glowing Boundaries)
    if (this.showFoV) {
      this.drawSensorFoVs();
    }

    // 2. Draw Concentric Zone Boundaries (Transparent Fills with Glowing Rings)
    this.drawZoneFills();

    // 3. Draw Concentric Range Rings & Hairline Spoke Grid
    this.drawPolarGrid();

    // 4. Circumference Drafting Ticks & Degree Readouts
    this.drawCircumferenceTicks();

    // 5. Draw Range Labels along the 30° radial axis and Zone badges along 60°
    this.drawRadialRangeLabels();

    // 6. Draw Boresight Arrow (North / 0°)
    this.drawBoresight();

    // 7. Draw Precision 3-Sensor Center Hub
    this.drawCenterHub();

    // 8. Draw Raw Radar Reflections (Point Cloud with Sensor Colors & Static/Dynamic Markers)
    this.drawPointCloud();

    // 9. Draw Tracked Mobile Targets with Vectors & Monospace Callouts
    this.drawTargets();
  }

  drawSensorFoVs() {
    const ctx = this.ctx;
    const r = this.plotRadius;

    // Three equal 120° contiguous sectors dividing the 360° circle:
    // Sector 1: Radar 1 (0°–120°)   -> Electric Cyan / Deep Blue gradient
    // Sector 2: Radar 2 (120°–240°) -> Bright Violet / Deep Purple gradient
    // Sector 3: Radar 3 (240°–360°) -> Bright Amber / Deep Orange gradient
    const sectors = [
      {
        id: 1,
        startDeg: 0.0,
        endDeg: 120.0,
        midDeg: 60.0,
        label: 'RADAR 1 (0°–120°)',
        color: this.colors.radar1,
        glowColor: this.colors.radar1Glow,
        colorGrad: this.colors.radar1Grad
      },
      {
        id: 2,
        startDeg: 120.0,
        endDeg: 240.0,
        midDeg: 180.0,
        label: 'RADAR 2 (120°–240°)',
        color: this.colors.radar2,
        glowColor: this.colors.radar2Glow,
        colorGrad: this.colors.radar2Grad
      },
      {
        id: 3,
        startDeg: 240.0,
        endDeg: 360.0,
        midDeg: 300.0,
        label: 'RADAR 3 (240°–360°)',
        color: this.colors.radar3,
        glowColor: this.colors.radar3Glow,
        colorGrad: this.colors.radar3Grad
      }
    ];

    sectors.forEach(s => {
      const sens = this.sensors[s.id] || this.sensors[`sensor${s.id}`];
      const isEnabled = sens ? sens.enabled : true;
      if (!isEnabled) return; // Hide sector when radar is switched OFF

      const isSelected = (this.selectedRadar === 'all' || this.selectedRadar == s.id);
      const isDimmed = (!isSelected && this.selectedRadar !== 'all');

      // Convert polar azimuth to canvas angle: 0° North is -90° in canvas coordinate system
      const startAngle = (s.startDeg - 90) * (Math.PI / 180);
      const endAngle = (s.endDeg - 90) * (Math.PI / 180);

      // Glowing outer boundary arc & dividing radial boundary lines (transparent sector interior)
      if (this.showSectorBounds) {
        // Glowing Outer Sector Arc
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, startAngle, endAngle);
        ctx.strokeStyle = isDimmed ? 'rgba(125, 133, 144, 0.15)' : s.glowColor;
        ctx.lineWidth = (isSelected && this.selectedRadar !== 'all') ? 2.6 : 1.8;
        ctx.stroke();

        // Dividing Spoke Ray at start boundary
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(this.cx + r * Math.cos(startAngle), this.cy + r * Math.sin(startAngle));
        ctx.strokeStyle = isDimmed ? 'rgba(125, 133, 144, 0.15)' : s.glowColor;
        ctx.lineWidth = (isSelected && this.selectedRadar !== 'all') ? 2.0 : 1.4;
        ctx.stroke();

        // Sector Orientation Label with protective pill knockout
        const midRad = (s.midDeg - 90) * (Math.PI / 180);
        const labelR = r * 0.86;
        const lx = this.cx + labelR * Math.cos(midRad);
        const ly = this.cy + labelR * Math.sin(midRad);

        ctx.font = (isSelected && this.selectedRadar !== 'all') ? '800 10px var(--font-mono)' : '700 9px var(--font-mono)';
        const textWidth = ctx.measureText(s.label).width;
        const pillW = textWidth + 12;
        const pillH = 17;

        // Draw subtle pill background so concentric rings never cut through
        ctx.fillStyle = this.theme === 'light' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(7, 11, 20, 0.92)';
        ctx.beginPath();
        ctx.roundRect(lx - pillW / 2, ly - pillH / 2, pillW, pillH, 3);
        ctx.fill();
        ctx.strokeStyle = isDimmed ? 'rgba(125, 133, 144, 0.2)' : s.color;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isDimmed ? 'rgba(125, 133, 144, 0.4)' : s.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, lx, ly + 0.5);
      }
    });
  }

  setCustomZones(dangerMeters, warmMeters) {
    this.dangerRadius = Math.max(0.2, parseFloat(dangerMeters));
    this.warningRadius = Math.max(this.dangerRadius + 0.1, parseFloat(warmMeters));
  }

  classifyZone(rangeM) {
    if (rangeM <= this.dangerRadius) return 'DANGER';
    if (rangeM <= this.warningRadius) return 'WARM';
    return 'SAFE';
  }

  drawZoneFills() {
    const ctx = this.ctx;
    const rDanger = this.metersToPixels(this.dangerRadius);
    const rWarning = this.metersToPixels(this.warningRadius);

    // Completely transparent zone interiors with crisp, glowing boundary rings
    // 1. Concentric WARM Ring Boundary (#FFB52E)
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, rWarning, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFB52E';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 2. Concentric DANGER Ring Boundary (#FF4545)
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, rDanger, 0, Math.PI * 2);
    ctx.strokeStyle = '#FF4545';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  drawPolarGrid() {
    const ctx = this.ctx;

    // 1. Concentric Range Rings (skip if coinciding directly with Danger or Warm boundary ring)
    this.rings.forEach(m => {
      if (Math.abs(m - this.dangerRadius) < 0.15 || Math.abs(m - this.warningRadius) < 0.15) {
        return; // Let the colored glowing solid zone boundary take visual precedence
      }
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
        // Skip 0° because drawBoresight() renders the dedicated, prominent '0° NORTH' badge
        if (deg === 0) continue;

        const textR = R + 15;
        const lx = this.cx + textR * cos;
        const ly = this.cy + textR * sin;

        ctx.font = '600 10px var(--font-mono)';
        ctx.fillStyle = this.colors.textSecondary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${deg}°`, lx, ly);
      }
    }
  }

  drawRadialRangeLabels() {
    const ctx = this.ctx;

    // 1. Position range scale labels along the 30° radial axis with background knockout
    this.rings.forEach(m => {
      const pos = this.polarToCanvas(m, 30);
      const text = `${m.toFixed(0)}m`;

      ctx.font = '600 9px var(--font-mono)';
      const tw = ctx.measureText(text).width;
      const pw = tw + 6;
      const ph = 13;

      // Subtle background knockout pill so dashed ring doesn't cut through the number
      ctx.fillStyle = this.colors.bg;
      ctx.beginPath();
      ctx.roundRect(pos.x - pw / 2, pos.y - ph / 2, pw, ph, 2);
      ctx.fill();
      ctx.strokeStyle = this.colors.spoke;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.fillStyle = this.colors.textSecondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, pos.x, pos.y + 0.5);
    });

    // 2. Position Zone indicator badges along the 60° radial axis (completely decoupled from Range labels!)
    const pillBg = this.theme === 'light' ? 'rgba(255, 255, 255, 0.94)' : 'rgba(7, 11, 20, 0.94)';

    // DANGER Zone Badge (#FF4545)
    const dangerPos = this.polarToCanvas(this.dangerRadius, 60);
    const dangerText = `DANGER ${this.dangerRadius.toFixed(1)}m`;
    ctx.font = '700 8px var(--font-mono)';
    const dtw = ctx.measureText(dangerText).width;
    const dpw = dtw + 8;
    const dph = 14;

    ctx.fillStyle = pillBg;
    ctx.beginPath();
    ctx.roundRect(dangerPos.x - dpw / 2, dangerPos.y - dph / 2, dpw, dph, 2);
    ctx.fill();
    ctx.strokeStyle = '#FF4545';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#FF4545';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dangerText, dangerPos.x, dangerPos.y + 0.5);

    // WARM Zone Badge (#FFB52E)
    const warnPos = this.polarToCanvas(this.warningRadius, 60);
    const warnText = `WARM ${this.warningRadius.toFixed(1)}m`;
    ctx.font = '700 8px var(--font-mono)';
    const wtw = ctx.measureText(warnText).width;
    const wpw = wtw + 8;
    const wph = 14;

    ctx.fillStyle = pillBg;
    ctx.beginPath();
    ctx.roundRect(warnPos.x - wpw / 2, warnPos.y - wph / 2, wpw, wph, 2);
    ctx.fill();
    ctx.strokeStyle = '#FFB52E';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#FFB52E';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(warnText, warnPos.x, warnPos.y + 0.5);

    // SAFE Zone Badge (#22C55E)
    const safeRadius = (this.warningRadius + this.maxRange) / 2;
    if (this.maxRange - this.warningRadius >= 1.0) {
      const safePos = this.polarToCanvas(safeRadius, 60);
      const safeText = 'SAFE';
      ctx.font = '700 8px var(--font-mono)';
      const stw = ctx.measureText(safeText).width;
      const spw = stw + 8;
      const sph = 14;

      ctx.fillStyle = pillBg;
      ctx.beginPath();
      ctx.roundRect(safePos.x - spw / 2, safePos.y - sph / 2, spw, sph, 2);
      ctx.fill();
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#22C55E';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(safeText, safePos.x, safePos.y + 0.5);
    }
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

    // Monospace NORTH Readout with protective pill
    const northText = '0° NORTH';
    ctx.font = '700 10px var(--font-mono)';
    const ntw = ctx.measureText(northText).width;
    const npw = ntw + 10;
    const nph = 16;
    const nY = this.cy - r - 12;

    ctx.fillStyle = this.colors.bg;
    ctx.beginPath();
    ctx.roundRect(this.cx - npw / 2, nY - nph + 2, npw, nph, 2);
    ctx.fill();
    ctx.strokeStyle = this.colors.cyan;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = this.colors.cyan;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(northText, this.cx, nY);
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

      // Micro Sensor Label with protective knockout circle
      const lx = this.cx + 28 * Math.cos(rad);
      const ly = this.cy + 28 * Math.sin(rad);

      ctx.fillStyle = this.colors.bg;
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.colors.spokeMajor;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.font = '700 8px var(--font-mono)';
      ctx.fillStyle = this.colors.cyan;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, lx, ly + 0.5);
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

    this.points.forEach(p => {
      const sid = p.sensor_id || 1;

      // When a radar is switched OFF, remove or hide only its corresponding detection points
      const sens = this.sensors[sid] || this.sensors[`sensor${sid}`];
      if (sens && sens.enabled === false) return;

      // Filter by selected radar tab if not 'all'
      if (this.selectedRadar !== 'all' && sid != this.selectedRadar) {
        return;
      }

      const range = p.range !== undefined ? p.range : Math.sqrt((p.x || 0) ** 2 + (p.y || 0) ** 2);
      const azimuth = p.azimuth !== undefined ? p.azimuth : 0;
      if (range > this.maxRange) return;

      const pos = this.polarToCanvas(range, azimuth);

      // Sensor-wise detection point colours strictly by originating sensor ID:
      // Radar 1: Bright Electric Cyan (#00E5FF)
      // Radar 2: Bright Violet (#B56CFF)
      // Radar 3: Bright Amber (#FFB52E)
      const color = this.getSensorColor(sid);
      const glowColor = this.getSensorGlowColor(sid);

      // Motion classification (static vs dynamic threshold: 0.15 m/s)
      const vel = Math.abs(p.v || 0);
      const isDynamic = vel > 0.15;

      ctx.save();
      if (isDynamic) {
        // Dynamic object point: filled circular marker with subtle glow and movement trail
        if (vel > 0.2) {
          const rad = (azimuth - 90) * (Math.PI / 180);
          const trailLen = Math.min(14, vel * 8);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(pos.x - Math.cos(rad) * trailLen, pos.y - Math.sin(rad) * trailLen);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.6;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }

        // Outer glow halo
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Inner solid circular core
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
        ctx.fill();

      } else {
        // Static object point: small filled square marker with bright, consistent sensor color
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 3;
        ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
      }
      ctx.restore();
    });
  }

  drawTargets() {
    if (!this.targets || !this.targets.length) return;

    // Filter by selected radar tab and sensor enabled status
    const visibleTargets = this.targets.filter(t => {
      const sid = t.sensor_id || 1;
      const sens = this.sensors[sid] || this.sensors[`sensor${sid}`];
      if (sens && sens.enabled === false) return false;
      if (this.selectedRadar !== 'all' && sid != this.selectedRadar) return false;
      return t.range <= this.maxRange;
    });

    if (!visibleTargets.length) return;

    // Placed bounding boxes list for anti-collision repulsion
    const placedBoxes = [];

    visibleTargets.forEach(t => {
      const sid = t.sensor_id || 1;
      const pos = this.polarToCanvas(t.range, t.azimuth);
      const sensorColor = this.getSensorColor(sid);
      const isHovered = (this.hoveredTargetId === t.id);
      const isDynamic = (t.state === 'ACTIVE' || (t.velocity || 0) > 0.2);

      // 1. Draw Velocity Vector for dynamic targets
      if (this.showVelocity && (t.vx !== undefined || t.vy !== undefined || t.velocity !== undefined)) {
        this.drawVelocityVector(pos.x, pos.y, t.vx || 0, t.vy || 0, t.velocity || 0, t.azimuth, sensorColor);
      }

      // 2. Draw Target Marker (Circular with glow for dynamic, Square for static)
      this.drawTargetMarker(pos.x, pos.y, sensorColor, t.id, isDynamic, isHovered);

      // 3. Draw Floating Monospace Workbench Callout with Anti-Collision Engine
      this.drawCalloutTag(pos.x, pos.y, t, sensorColor, placedBoxes, isHovered);
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

  drawTargetMarker(x, y, color, id, isDynamic = true, isHovered = false) {
    const ctx = this.ctx;
    ctx.save();

    if (isDynamic) {
      // Dynamic: Filled circular marker with subtle outer glow aura and solid core
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? 13 : 9, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = isHovered ? 1.6 : 0.9;
      ctx.stroke();

      // Outer phosphor glow
      ctx.fillStyle = color + '40'; // ~25% alpha
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();

      // Solid Target Core
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = this.colors.bg;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      // Static: Small precision square marker with crisp edges and subtle glow
      ctx.shadowColor = color;
      ctx.shadowBlur = isHovered ? 6 : 3;

      const size = isHovered ? 10 : 7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);

      ctx.fillStyle = color;
      const innerSize = isHovered ? 6 : 4;
      ctx.fillRect(x - innerSize / 2, y - innerSize / 2, innerSize, innerSize);
    }

    ctx.restore();
  }

  drawCalloutTag(x, y, target, color, placedBoxes, isHovered = false) {
    const ctx = this.ctx;

    const shortId = (target.id || 'TRK-01').replace('TARGET-', 'TRK-');
    const currentZone = this.classifyZone(target.range);
    const titleText = `${shortId} [${currentZone}]`;
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

    // Determine initial quadrant offset based on azimuth to angle outward from dial center
    let offsetX = 16;
    let offsetY = -24;

    const az = ((target.azimuth % 360) + 360) % 360;
    if (az >= 0 && az < 90) {
      // Quadrant 1 (North-East): point right & up
      offsetX = 16;
      offsetY = -28;
    } else if (az >= 90 && az < 180) {
      // Quadrant 4 (South-East): point right & down
      offsetX = 16;
      offsetY = 12;
    } else if (az >= 180 && az < 270) {
      // Quadrant 3 (South-West): point left & down
      offsetX = -boxWidth - 16;
      offsetY = 12;
    } else {
      // Quadrant 2 (North-West): point left & up
      offsetX = -boxWidth - 16;
      offsetY = -28;
    }

    let tagX = x + offsetX;
    let tagY = y + offsetY;

    // Clamp to canvas viewport margins (minimum 8px margin from borders)
    const margin = 8;
    tagX = Math.max(margin, Math.min(this.width - boxWidth - margin, tagX));
    tagY = Math.max(margin, Math.min(this.height - boxHeight - margin, tagY));

    // Overlap collision resolution with already placed boxes
    if (placedBoxes && placedBoxes.length > 0) {
      let attempts = 0;
      let collides = true;
      while (collides && attempts < 6) {
        collides = placedBoxes.some(b => {
          return !(tagX + boxWidth < b.x - 4 ||
                   tagX > b.x + b.w + 4 ||
                   tagY + boxHeight < b.y - 4 ||
                   tagY > b.y + b.h + 4);
        });

        if (collides) {
          attempts++;
          // Stagger vertically by boxHeight + 4
          tagY += (boxHeight + 4);
          // If exceeding bottom, wrap towards top of target
          if (tagY + boxHeight > this.height - margin) {
            tagY = Math.max(margin, y - (boxHeight + 6) * attempts);
          }
        }
      }
    }

    // Record placed box
    if (placedBoxes) {
      placedBoxes.push({ x: tagX, y: tagY, w: boxWidth, h: boxHeight });
    }

    // Dynamic Leader Line to closest box edge
    const anchorX = (x < tagX) ? tagX : (x > tagX + boxWidth ? tagX + boxWidth : tagX + boxWidth / 2);
    const anchorY = (y < tagY) ? tagY : (y > tagY + boxHeight ? tagY + boxHeight : tagY + boxHeight / 2);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(anchorX, anchorY);
    ctx.strokeStyle = isHovered ? color : (this.theme === 'light' ? 'rgba(71, 85, 105, 0.4)' : 'rgba(125, 133, 144, 0.4)');
    ctx.lineWidth = isHovered ? 1.4 : 0.8;
    ctx.stroke();

    // High-density flat card (box-shadow 0, radius 2px)
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.colors.calloutBg;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, boxWidth, boxHeight, 2);
    ctx.fill();
    ctx.strokeStyle = isHovered ? color : this.colors.calloutBorder;
    ctx.lineWidth = isHovered ? 1.6 : 1.0;
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
