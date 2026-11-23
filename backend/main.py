import os
import sys
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

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


# Mount Frontend Static Directory
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
