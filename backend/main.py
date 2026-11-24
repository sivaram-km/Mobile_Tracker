import os
import sys
import json
import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

logger = logging.getLogger("radar_backend")

# Ensure backend directory is in path for module resolution
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from serial_manager import MultiSensorManager
from object_tracker import ObjectTracker
from coordinate_fusion import process_point_cloud

# Global instances
sensor_manager = MultiSensorManager()
object_tracker = ObjectTracker()

active_websockets: List[WebSocket] = []
broadcast_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global broadcast_task
    broadcast_task = asyncio.create_task(telemetry_broadcast_loop())
    yield
    if broadcast_task:
        broadcast_task.cancel()
    sensor_manager.stop_all()


app = FastAPI(title="360° Real-Time Mobile Tracker Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


async def telemetry_broadcast_loop():
    """High-frequency (~25 FPS) real-time radar telemetry broadcast loop over WebSockets."""
    while True:
        try:
            await asyncio.sleep(0.04)  # ~25 FPS

            if not active_websockets:
                continue

            now_iso = datetime.utcnow().isoformat() + "Z"
            sensor_statuses = sensor_manager.get_sensor_statuses()

            # Acquire detections per sensor interface
            by_sensor_data = sensor_manager.get_sensor_detections()

            all_raw_targets = []
            fused_points_by_sensor = {1: [], 2: [], 3: []}

            for sid in [1, 2, 3]:
                s_targets, s_points = by_sensor_data.get(sid, ([], []))
                all_raw_targets.extend(s_targets)
                # Cap points at 250 PER SENSOR so no single radar starves the others
                t_pts = process_point_cloud(s_points[:250], sensor_id=sid)
                fused_points_by_sensor[sid] = t_pts

            # Process all raw targets through tracker
            tracked_targets = object_tracker.update_with_detections(all_raw_targets)

            # Partition tracked targets by sensor
            targets_by_sensor = {1: [], 2: [], 3: []}
            sensor_counts = {1: 0, 2: 0, 3: 0}
            for t in tracked_targets:
                sid = t.get("sensor_id", 1)
                if sid in targets_by_sensor:
                    targets_by_sensor[sid].append(t)
                    sensor_counts[sid] += 1

            for sid in [1, 2, 3]:
                s_key = f"sensor{sid}"
                if s_key in sensor_statuses:
                    sensor_statuses[s_key]["active_targets"] = sensor_counts[sid]

            # Combined point cloud for 360° fused view
            all_transformed_points = []
            for sid in [1, 2, 3]:
                all_transformed_points.extend(fused_points_by_sensor[sid])

            payload = {
                "timestamp": now_iso,
                "sensors": sensor_statuses,
                "targets": tracked_targets,
                "points": all_transformed_points,
                "by_sensor": {
                    1: {"targets": targets_by_sensor[1], "points": fused_points_by_sensor[1]},
                    2: {"targets": targets_by_sensor[2], "points": fused_points_by_sensor[2]},
                    3: {"targets": targets_by_sensor[3], "points": fused_points_by_sensor[3]}
                }
            }

            msg_text = json.dumps(payload)
            for ws in list(active_websockets):
                try:
                    await ws.send_text(msg_text)
                except Exception:
                    if ws in active_websockets:
                        active_websockets.remove(ws)

        except asyncio.CancelledError:
            break
        except Exception as e:
            await asyncio.sleep(0.05)


# WebSocket Route
@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
    except Exception:
        if websocket in active_websockets:
            active_websockets.remove(websocket)


# REST API Routes
@app.get("/api/ports")
async def get_available_ports():
    """Returns detected system COM / ttyUSB ports."""
    return {"ports": sensor_manager.list_ports()}


@app.get("/api/configs")
async def get_available_configs():
    """Returns list of radar configuration .cfg files."""
    return {"configs": sensor_manager.list_configs()}


@app.get("/api/radar/status")
async def get_radar_status():
    """Returns real-time connection status of all 3 radars."""
    return {
        "sensors": sensor_manager.get_sensor_statuses(),
        "active_clients": len(active_websockets)
    }


class RadarStartItem(BaseModel):
    sensor_id: int
    cli_port: Optional[str] = None
    data_port: Optional[str] = None
    config: Optional[str] = None


class RadarBatchStartRequest(BaseModel):
    radars: List[RadarStartItem]


@app.post("/api/radar/start")
async def start_radars(req: RadarBatchStartRequest):
    """Starts/connects specified radar sensors with CLI & Data ports."""
    results = {}
    for r in req.radars:
        if r.data_port:
            sensor_manager.start_radar(
                sensor_id=r.sensor_id,
                cli_port=r.cli_port,
                data_port=r.data_port,
                config_name=r.config
            )
            results[f"sensor{r.sensor_id}"] = "CONNECTING"
        else:
            sensor_manager.stop_sensor(r.sensor_id)
            results[f"sensor{r.sensor_id}"] = "DISCONNECTED"

    return {"status": "success", "results": results}


@app.post("/api/radar/stop")
async def stop_all_radars():
    """Stops and disconnects all 3 radar sensors."""
    sensor_manager.stop_all()
    object_tracker.clear()
    return {"status": "success", "message": "All radar connections stopped."}


class SensorToggleRequest(BaseModel):
    sensor_id: int
    enabled: bool


@app.post("/api/sensor/toggle")
async def toggle_sensor_stream(req: SensorToggleRequest):
    """Enables or disables data from a specific radar without stopping hardware."""
    sensor_manager.set_sensor_enabled(req.sensor_id, req.enabled)
    return {"status": "success", "sensor_id": req.sensor_id, "enabled": req.enabled}


class ZoneThresholdsRequest(BaseModel):
    danger_radius: float
    warning_radius: float


@app.get("/api/zone/thresholds")
async def get_thresholds():
    """Returns real-time spatial zone distance thresholds in meters."""
    from coordinate_fusion import get_zone_thresholds
    return get_zone_thresholds()


@app.post("/api/zone/thresholds")
async def update_thresholds(req: ZoneThresholdsRequest):
    """Updates spatial danger and warning thresholds dynamically across all 3 radars."""
    from coordinate_fusion import set_zone_thresholds
    set_zone_thresholds(req.danger_radius, req.warning_radius)
    return {
        "status": "success",
        "danger_radius": req.danger_radius,
        "warning_radius": req.warning_radius
    }


class BroadcastConfigRequest(BaseModel):
    config_name: str


@app.post("/api/radar/broadcast_config")
async def broadcast_config_to_all_radars(req: BroadcastConfigRequest):
    """
    Broadcasts a single chirp configuration (.cfg) profile across all 3 physical radar sensors simultaneously.
    """
    # Read configured ports from sensor_config.json
    config_path = os.path.join(os.path.dirname(__file__), "sensor_config.json")
    sensor_map = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                sensor_map = json.load(f)
        except Exception as e:
            logger.warning(f"Failed reading sensor_config.json: {e}")

    results = {}
    for sid in (1, 2, 3):
        s_data = sensor_map.get(f"sensor{sid}", {})
        cli_p = s_data.get("cli_port", f"/dev/ttyUSB{(sid-1)*2}")
        data_p = s_data.get("data_port", f"/dev/ttyUSB{(sid-1)*2+1}")

        sensor_manager.start_radar(
            sensor_id=sid,
            cli_port=cli_p,
            data_port=data_p,
            config_name=req.config_name
        )
        results[f"sensor{sid}"] = {
            "status": "CONFIGURED",
            "cli_port": cli_p,
            "data_port": data_p,
            "config": req.config_name
        }

    return {
        "status": "success",
        "message": f"Configuration {req.config_name} broadcasted to all 3 radars.",
        "results": results
    }


class SensorMountItem(BaseModel):
    sensor_id: int
    x: float
    y: float
    z: float
    yaw: float


class SensorMountMatrixRequest(BaseModel):
    sensors: List[SensorMountItem]


@app.get("/api/sensor/mounting")
async def get_mounting_matrix():
    """Returns spatial mounting positions (X, Y, Z) and Yaw orientations for the 3 sensors."""
    return {
        "sensors": [
            {"sensor_id": 1, "x": 0.00, "y": 0.20, "z": 0.80, "yaw": 0.0, "sector": "0°–120°"},
            {"sensor_id": 2, "x": 0.17, "y": -0.10, "z": 0.80, "yaw": 120.0, "sector": "120°–240°"},
            {"sensor_id": 3, "x": -0.17, "y": -0.10, "z": 0.80, "yaw": 240.0, "sector": "240°–360°"}
        ],
        "max_range": 15.0,
        "blind_zone": 0.30
    }


@app.post("/api/sensor/mounting")
async def update_mounting_matrix(req: SensorMountMatrixRequest):
    """Updates spatial mounting matrix offsets and yaw orientation angles."""
    from coordinate_fusion import SENSOR_ORIENTATIONS
    for s in req.sensors:
        if s.sensor_id in SENSOR_ORIENTATIONS:
            SENSOR_ORIENTATIONS[s.sensor_id] = s.yaw
    return {"status": "success", "updated_sensors": len(req.sensors)}


@app.get("/api/config/content")
async def get_config_content(name: str):
    """Returns the text contents of a radar .cfg file."""
    safe_name = os.path.basename(name)
    cfg_path = os.path.join(os.path.dirname(__file__), "configs", safe_name)
    if not os.path.exists(cfg_path):
        raise HTTPException(status_code=404, detail="Configuration file not found")
    try:
        with open(cfg_path, "r") as f:
            content = f.read()
        return {"filename": safe_name, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaveConfigRequest(BaseModel):
    filename: str
    content: str


@app.post("/api/config/save")
async def save_config_file(req: SaveConfigRequest):
    """Saves or updates a radar .cfg configuration file."""
    safe_name = os.path.basename(req.filename)
    if not safe_name.endswith(".cfg"):
        safe_name += ".cfg"
    cfg_path = os.path.join(os.path.dirname(__file__), "configs", safe_name)
    try:
        with open(cfg_path, "w") as f:
            f.write(req.content)
        return {"status": "success", "filename": safe_name, "message": f"Saved {safe_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SendConfigLinesRequest(BaseModel):
    sensor_id: int  # 0 for all, or 1, 2, 3
    lines: List[str]


@app.post("/api/radar/send_config_lines")
async def send_config_lines(req: SendConfigLinesRequest):
    """Sends raw configuration command lines to a specific sensor or all sensors."""
    lines = [l.strip() for l in req.lines if l.strip() and not l.strip().startswith("%")]
    if req.sensor_id == 0:
        for sid, radar in sensor_manager.radars.items():
            radar.send_config(lines)
        return {"status": "success", "message": f"Sent {len(lines)} commands to all radars."}
    elif req.sensor_id in sensor_manager.radars:
        radar = sensor_manager.radars[req.sensor_id]
        success = radar.send_config(lines)
        return {"status": "success" if success else "failed", "sensor_id": req.sensor_id, "message": f"Sent {len(lines)} commands to Radar {req.sensor_id}."}
    else:
        raise HTTPException(status_code=404, detail=f"Sensor {req.sensor_id} not found")


class StopSensorRequest(BaseModel):
    sensor_id: int


@app.post("/api/radar/stop_sensor")
async def stop_single_sensor(req: StopSensorRequest):
    """Stops acquisition on a single radar sensor."""
    sensor_manager.stop_sensor(req.sensor_id)
    return {"status": "success", "sensor_id": req.sensor_id}


# Mount Frontend Static Directory
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
