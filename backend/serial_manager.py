import os
import json
import serial
import serial.tools.list_ports
import threading
import time
from typing import Dict, List, Any, Optional, Tuple
from frame_parser import parse_serial_buffer

MAGIC_WORD = bytes([0x02, 0x01, 0x04, 0x03, 0x06, 0x05, 0x08, 0x07])
HEADER_SIZE = 40
CONFIGS_DIR = os.path.join(os.path.dirname(__file__), "configs")
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "sensor_config.json")


class SerialSensorInterface:
    """Handles communication with one mmWave spatial radar (CLI config + high-speed Data port)."""
    def __init__(self, sensor_id: int, orientation_deg: float):
        self.sensor_id = sensor_id
        self.orientation_deg = orientation_deg
        self.cli_port: Optional[str] = None
        self.data_port: Optional[str] = None
        self.config_name: Optional[str] = "AOP_6m_default.cfg"
        self.baud_cli = 115200
        self.baud_data = 921600

        self.ser_data: Optional[serial.Serial] = None
        self.is_running = False
        self.thread: Optional[threading.Thread] = None

        self.status = "DISCONNECTED"  # DISCONNECTED, CONNECTING, CONNECTED, ERROR
        self.error_message: Optional[str] = None

        self.targets: List[Dict[str, Any]] = []
        self.points: List[Dict[str, Any]] = []
        self.lock = threading.Lock()

        # Live Data Flow Telemetry Metrics
        self.bytes_total: int = 0
        self.bytes_window: int = 0
        self.bytes_window_time: float = time.time()
        self.bytes_per_sec: float = 0.0
        self.frames_total: int = 0
        self.frames_window: int = 0
        self.fps: float = 0.0
        self.last_data_time: float = 0.0
        self.live_points_count: int = 0
        self.live_targets_count: int = 0

    def send_config(self, config_lines: List[str]) -> bool:
        """Sends CLI configuration commands to the sensor at 115200 baud."""
        if not self.cli_port:
            return True  # If no CLI port specified, assume sensor is already configured/running

        print(f"[Radar {self.sensor_id}] Sending configuration to {self.cli_port} @ {self.baud_cli}...")
        try:
            ser_cli = serial.Serial(self.cli_port, self.baud_cli, timeout=1.5)
            ser_cli.write(b"\n")
            time.sleep(0.1)
            ser_cli.read_all()

            for line in config_lines:
                cmd = line.strip()
                if not cmd or cmd.startswith("%"):
                    continue
                ser_cli.write((cmd + "\n").encode())
                time.sleep(0.04)
                resp = ser_cli.read_all().decode("utf-8", errors="ignore")
                # Optional debug log
                # print(f"  CMD: {cmd} -> {resp.strip()}")

            ser_cli.close()
            print(f"[Radar {self.sensor_id}] Configuration sent successfully via {self.cli_port}.")
            return True
        except Exception as e:
            err = f"CLI Config Error on {self.cli_port}: {e}"
            print(f"[Radar {self.sensor_id}] {err}")
            self.error_message = err
            return False

    def start(self, cli_port: Optional[str], data_port: str, config_lines: Optional[List[str]] = None, config_name: Optional[str] = None):
        """Starts connection to radar hardware."""
        self.stop()
        self.cli_port = cli_port if cli_port else None
        self.data_port = data_port
        if config_name:
            self.config_name = config_name
        self.is_running = True
        self.status = "CONNECTING"
        self.error_message = None

        # Send configuration commands first if CLI port and commands provided
        if config_lines and self.cli_port:
            ok = self.send_config(config_lines)
            if not ok:
                self.status = "ERROR"
                self.is_running = False
                return

        # Start data reading thread
        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()
        print(f"[Radar {self.sensor_id}] Data reading thread started on {data_port} @ {self.baud_data}.")

    def stop(self):
        """Stops the data reading thread and closes serial connection."""
        self.is_running = False
        self.status = "DISCONNECTED"

        # Try to send sensorStop to CLI port if available
        if self.cli_port:
            try:
                ser_cli = serial.Serial(self.cli_port, self.baud_cli, timeout=0.5)
                ser_cli.write(b"sensorStop\n")
                time.sleep(0.05)
                ser_cli.close()
            except Exception:
                pass

        if self.ser_data and self.ser_data.is_open:
            try:
                self.ser_data.close()
            except Exception:
                pass
        self.ser_data = None

        with self.lock:
            self.targets.clear()
            self.points.clear()

    def _read_loop(self):
        buffer = bytearray()

        while self.is_running:
            # Connect if not connected
            if not self.ser_data or not self.ser_data.is_open:
                available = [p.device for p in serial.tools.list_ports.comports()]
                if self.data_port not in available:
                    self.status = "ERROR"
                    self.error_message = f"Data port {self.data_port} not found on system."
                    time.sleep(2.0)
                    continue

                try:
                    self.ser_data = serial.Serial(self.data_port, self.baud_data, timeout=1)
                    self.ser_data.read_all()
                    self.status = "CONNECTED"
                    self.error_message = None
                    print(f"[Radar {self.sensor_id}] Data port {self.data_port} connected.")
                except Exception as e:
                    self.status = "ERROR"
                    self.error_message = f"Failed to open {self.data_port}: {e}"
                    time.sleep(2.0)
                    continue

            # Read incoming data
            try:
                if self.ser_data.in_waiting > 0:
                    chunk = self.ser_data.read(self.ser_data.in_waiting)
                    buffer.extend(chunk)

                    # Update throughput stats
                    self.bytes_total += len(chunk)
                    self.bytes_window += len(chunk)
                    now_t = time.time()
                    if now_t - self.bytes_window_time >= 0.8:
                        dt = now_t - self.bytes_window_time
                        self.bytes_per_sec = self.bytes_window / dt
                        self.fps = self.frames_window / dt
                        self.bytes_window = 0
                        self.frames_window = 0
                        self.bytes_window_time = now_t
                else:
                    time.sleep(0.01)
                    continue

                buffer, new_targets, new_points = parse_serial_buffer(buffer, self.sensor_id)
                if new_targets or new_points:
                    self.last_data_time = time.time()
                    self.frames_total += 1
                    self.frames_window += 1
                    with self.lock:
                        self.targets = new_targets
                        self.points = new_points
                        self.live_targets_count = len(new_targets)
                        self.live_points_count = len(new_points)

            except (serial.SerialException, OSError) as se:
                print(f"[Radar {self.sensor_id}] Connection lost: {se}. Retrying...")
                self.status = "ERROR"
                self.error_message = f"Serial lost: {se}"
                if self.ser_data:
                    try:
                        self.ser_data.close()
                    except Exception:
                        pass
                self.ser_data = None
                buffer = bytearray()
                time.sleep(2.0)
            except Exception as e:
                buffer = bytearray()
                time.sleep(0.05)

    def get_latest_data(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        with self.lock:
            return list(self.targets), list(self.points)


class MultiSensorManager:
    """Coordinates the 3 spatial radars (Radar 1 @ 0°, Radar 2 @ 120°, Radar 3 @ 240°)."""
    def __init__(self):
        self.sensors = {
            1: SerialSensorInterface(sensor_id=1, orientation_deg=0.0),
            2: SerialSensorInterface(sensor_id=2, orientation_deg=120.0),
            3: SerialSensorInterface(sensor_id=3, orientation_deg=240.0)
        }
        self.enabled_sensors = {1: True, 2: True, 3: True}
        self.load_saved_settings()

    def list_ports(self) -> List[Dict[str, str]]:
        """Lists available serial COM / ttyUSB ports on the host."""
        ports = []
        try:
            for p in serial.tools.list_ports.comports():
                ports.append({
                    "device": p.device,
                    "description": p.description or p.device,
                    "hwid": p.hwid or ""
                })
        except Exception as e:
            print(f"Error scanning ports: {e}")
        return ports

    def list_configs(self) -> List[str]:
        """Lists available .cfg files in configs directory."""
        if not os.path.exists(CONFIGS_DIR):
            return []
        return sorted([f for f in os.listdir(CONFIGS_DIR) if f.endswith(".cfg")])

    def load_config_commands(self, config_name: str) -> List[str]:
        """Loads and cleans radar chirp configuration commands from file."""
        if not config_name:
            config_name = "AOP_6m_default.cfg"
        path = os.path.join(CONFIGS_DIR, config_name)
        if not os.path.exists(path):
            path = config_name  # try direct path
        if not os.path.exists(path):
            return []

        commands = []
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith("%"):
                    commands.append(stripped)
        return commands

    def start_radar(self, sensor_id: int, cli_port: Optional[str], data_port: str, config_name: Optional[str] = None):
        """Starts an individual radar sensor."""
        if sensor_id not in self.sensors:
            return
        if not data_port:
            self.sensors[sensor_id].stop()
            return

        cmds = self.load_config_commands(config_name or "AOP_6m_default.cfg")
        self.sensors[sensor_id].start(cli_port, data_port, cmds, config_name)
        self.save_settings()

    def stop_sensor(self, sensor_id: int):
        if sensor_id in self.sensors:
            self.sensors[sensor_id].stop()
            self.save_settings()

    def stop_all(self):
        for s in self.sensors.values():
            s.stop()

    def set_sensor_enabled(self, sensor_id: int, enabled: bool):
        self.enabled_sensors[sensor_id] = enabled

    def get_sensor_statuses(self) -> Dict[str, Any]:
        result = {}
        now = time.time()
        for sid, s in self.sensors.items():
            last_ms = round((now - s.last_data_time) * 1000) if s.last_data_time > 0 else None
            flow_active = (s.status == "CONNECTED") and (last_ms is not None) and (last_ms < 3000)

            result[f"sensor{sid}"] = {
                "id": sid,
                "status": s.status,
                "orientation": s.orientation_deg,
                "enabled": self.enabled_sensors.get(sid, True),
                "cli_port": s.cli_port,
                "data_port": s.data_port,
                "config": s.config_name,
                "active_targets": len(s.targets),
                "error": s.error_message,
                # Live Data Flow Diagnostics
                "bytes_total": s.bytes_total,
                "bytes_per_sec": round(s.bytes_per_sec, 1),
                "kbps": round((s.bytes_per_sec * 8) / 1000.0, 1),
                "frames_total": s.frames_total,
                "fps": round(s.fps, 1),
                "last_packet_ms": last_ms,
                "flow_active": flow_active,
                "live_points": s.live_points_count,
                "live_targets": s.live_targets_count
            }
        return result

    def get_sensor_detections(self) -> Dict[int, Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]]:
        """Returns latest detections partitioned by sensor ID."""
        data_by_sensor = {}
        for sid, s in self.sensors.items():
            if not self.enabled_sensors.get(sid, True) or s.status != "CONNECTED":
                data_by_sensor[sid] = ([], [])
            else:
                data_by_sensor[sid] = s.get_latest_data()
        return data_by_sensor

    def get_all_detections(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        all_targets = []
        all_points = []
        for sid, s in self.sensors.items():
            if not self.enabled_sensors.get(sid, True) or s.status != "CONNECTED":
                continue
            targets, points = s.get_latest_data()
            all_targets.extend(targets)
            all_points.extend(points)
        return all_targets, all_points

    def save_settings(self):
        """Saves current configured ports and configs to disk."""
        data = {}
        for sid, s in self.sensors.items():
            data[f"sensor{sid}"] = {
                "cli_port": s.cli_port,
                "data_port": s.data_port,
                "config": s.config_name
            }
        try:
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    def load_saved_settings(self):
        """Loads saved port and config preferences."""
        if not os.path.exists(SETTINGS_FILE):
            return
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for sid, s in self.sensors.items():
                s_data = data.get(f"sensor{sid}")
                if s_data:
                    s.cli_port = s_data.get("cli_port")
                    s.data_port = s_data.get("data_port")
                    s.config_name = s_data.get("config", "AOP_6m_default.cfg")
        except Exception:
            pass
