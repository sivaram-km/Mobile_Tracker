import time
import numpy as np
from typing import Dict, List, Any
from coordinate_fusion import process_target_detection, classify_zone, compute_polar_coordinates

TRACK_TIMEOUT_SEC = 1.2  # Time before target is dropped if not refreshed


class TrackedObject:
    def __init__(self, target_id: str, sensor_id: int, x: float, y: float, z: float, vx: float, vy: float, vz: float):
        self.id = target_id
        self.sensor_id = sensor_id
        self.x = x
        self.y = y
        self.z = z
        self.vx = vx
        self.vy = vy
        self.vz = vz
        self.last_seen = time.time()
        self.confidence = 0.5
        self.history: List[tuple] = [(x, y)]

    def update(self, x: float, y: float, z: float, vx: float, vy: float, vz: float, sensor_id: int):
        self.x = x
        self.y = y
        self.z = z
        self.vx = vx
        self.vy = vy
        self.vz = vz
        self.sensor_id = sensor_id
        self.last_seen = time.time()
        self.confidence = min(1.0, self.confidence + 0.15)
        self.history.append((x, y))
        if len(self.history) > 20:
            self.history.pop(0)

    def decay(self):
        self.confidence = max(0.0, self.confidence - 0.1)

    def is_alive(self, current_time: float) -> bool:
        return (current_time - self.last_seen) <= TRACK_TIMEOUT_SEC and self.confidence > 0.05

    def to_dict(self) -> Dict[str, Any]:
        range_m, azimuth_deg = compute_polar_coordinates(self.x, self.y)
        speed = float(np.sqrt(self.vx**2 + self.vy**2 + self.vz**2))
        zone = classify_zone(range_m)

        # Motion state
        if speed > 0.2:
            state = "ACTIVE"
        else:
            state = "STATIONARY"

        return {
            "id": self.id,
            "sensor_id": self.sensor_id,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "z": round(self.z, 2),
            "vx": round(self.vx, 2),
            "vy": round(self.vy, 2),
            "vz": round(self.vz, 2),
            "range": range_m,
            "azimuth": azimuth_deg,
            "velocity": round(speed, 2),
            "zone": zone,
            "state": state
        }


class ObjectTracker:
    def __init__(self):
        self.tracks: Dict[str, TrackedObject] = {}

    def update_with_detections(self, raw_targets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Receives fused raw targets, matches them to existing tracks or creates new ones,
        prunes stale tracks, and returns active targets.
        """
        now = time.time()
        updated_ids = set()

        for t in raw_targets:
            fused = process_target_detection(t, sensor_id=t.get("sensor_id", 1))
            tid = fused["id"]

            if tid in self.tracks:
                self.tracks[tid].update(
                    fused["x"], fused["y"], fused["z"],
                    fused["vx"], fused["vy"], fused["vz"],
                    sensor_id=fused["sensor_id"]
                )
            else:
                self.tracks[tid] = TrackedObject(
                    tid, fused["sensor_id"],
                    fused["x"], fused["y"], fused["z"],
                    fused["vx"], fused["vy"], fused["vz"]
                )
            updated_ids.add(tid)

        # Decay tracks not seen in this frame
        for tid, track in list(self.tracks.items()):
            if tid not in updated_ids:
                track.decay()

        # Clean up stale tracks
        self.tracks = {tid: t for tid, t in self.tracks.items() if t.is_alive(now)}

        # Return list of active target dicts
        return [t.to_dict() for t in self.tracks.values()]

    def clear(self):
        self.tracks.clear()
