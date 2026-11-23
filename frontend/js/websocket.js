/**
 * Real-time WebSocket Client with Auto-Reconnection
 */
class TelemetryClient {
  constructor(defaultUrl, onMessage, onStatusChange) {
    this.url = defaultUrl || `ws://${window.location.host}/ws/telemetry`;
    this.onMessage = onMessage || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.reconnectDelay = 2500;
  }

  connect(customUrl) {
    if (customUrl) {
      this.url = customUrl;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.onStatusChange('CONNECTING');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.onStatusChange('CONNECTED');
        console.log(`[WS] Connected to telemetry feed at ${this.url}`);
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.onMessage(payload);
        } catch (err) {
          console.error('[WS] Failed to parse payload:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WS] Telemetry stream error:', err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onStatusChange('DISCONNECTED');
        this.ws = null;
        this.scheduleReconnect();
      };

    } catch (err) {
      this.onStatusChange('ERROR');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.onStatusChange('DISCONNECTED');
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[WS] Attempting reconnection...');
      this.connect();
    }, this.reconnectDelay);
  }
}
