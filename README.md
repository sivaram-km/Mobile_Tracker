# 360° Mobile Tracker — Circular Plot System

A clean, modern, light-mode 360° spatial object visualizer for tracking mobile targets across 3 sensors mounted at 0°, 120°, and 240° intervals.

Built entirely with **Python (FastAPI + PySerial + NumPy)** and **pure HTML5 / Canvas / CSS3** with **zero Node.js, zero React, and zero npm build steps**.

---

## 🚀 Quickstart

### 1. Install Python Dependencies
```bash
cd /home/sivarama/Mobile_Tracker_3_Radar/GUI
pip install -r backend/requirements.txt
```

### 2. Start the Application
```bash
./run.py
# or: python3 run.py
```

### 3. Open the Dashboard
Open your browser to:
```
http://localhost:8000
```

---

## 🎨 Layout Overview

- **Top Navigation**: "360° MOBILE TRACKER" with status pill badges (`ACTIVE`, `3-SENSOR FUSION`) and quick actions (`Sensor Config`, `JSON / WS Feed`, `Alert Logs`).
- **Left Sidebar (20%) — System Health**:
  - Individual status cards for Sensor 1 (0°), Sensor 2 (120°), and Sensor 3 (240°).
  - Target counters and blind-spot simulation ON/OFF toggles.
  - Display preferences (Show ±65° FoV Sectors, Velocity Vectors, Sector Boundaries).
- **Center Main Panel (55%) — 360° Polar Canvas Plot**:
  - Full 360° circular polar plot with 2m Danger Zone (red ring & tint), 4m Warning Zone (amber ring & tint), and 6m, 8m, 10m range rings.
  - Angular gridlines every 30° around perimeter with North boresight arrow at 0°.
  - 3-Sensor central hub badge.
  - Three translucent teal ±65° FoV sectors showing 5° overlap zones.
  - Mobile targets with walking-person markers, color-coded by zone, directional velocity arrows, and floating callout tags (`ID`, `Range`, `Azimuth`, `Velocity`, `Sensor`).
- **Right Sidebar (25%) — Telemetry & Feed**:
  - **Live Target Telemetry**: Real-time table showing ID, Zone, Range (m), Azimuth (°), Velocity (m/s), and Detecting Sensor.
  - **Raw Fusion Feed (JSON)**: Monospace live JSON inspector showing fused WebSocket telemetry packets with an interactive URL connection bar.

---

## 🔌 Real-Time Radar Hardware Setup

Connect your 3 IWR6843AOP radar boards via USB to the host computer. Each radar provides two serial ports via the onboard XDS110 debug interface:
1. **User/Application CLI Port** (@ 115200 baud): Used to send chirp configuration commands (`.cfg` files).
2. **Auxiliary Data Port** (@ 921600 baud): High-speed UART streaming TLV point cloud and detected targets.

### Typical Linux Port Mapping
| Radar | Orientation | CLI Port (115200) | Data Port (921600) | Default Config |
|---|---|---|---|---|
| **Radar 1** | 0° (North) | `/dev/ttyUSB0` | `/dev/ttyUSB1` | `AOP_6m_default.cfg` |
| **Radar 2** | 120° (South-East) | `/dev/ttyUSB2` | `/dev/ttyUSB3` | `AOP_6m_default.cfg` |
| **Radar 3** | 240° (South-West) | `/dev/ttyUSB4` | `/dev/ttyUSB5` | `AOP_6m_default.cfg` |

### Typical Windows Port Mapping
| Radar | Orientation | CLI Port (115200) | Data Port (921600) | Default Config |
|---|---|---|---|---|
| **Radar 1** | 0° (North) | `COM3` | `COM4` | `AOP_6m_default.cfg` |
| **Radar 2** | 120° (South-East) | `COM5` | `COM6` | `AOP_6m_default.cfg` |
| **Radar 3** | 240° (South-West) | `COM7` | `COM8` | `AOP_6m_default.cfg` |

### How to Connect:
1. Open the dashboard at `http://localhost:8000`.
2. Click **Sensor Config** in the top navigation bar.
3. Click **Scan Ports** to list all attached serial ports.
4. Select the corresponding CLI port, Data port, and Chirp Config for each radar.
5. Click **Connect Radars**. The backend will send the configuration to the CLI ports and start streaming real targets and point clouds in real time.

