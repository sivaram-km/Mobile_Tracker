import numpy as np
from typing import Dict, Any, Tuple

# Pre-defined orientations for the 3 spatial sensors
SENSOR_ORIENTATIONS = {
    1: 0.0,    # Sensor 1: 0.0° (Facing North / 0°)
    2: 120.0,  # Sensor 2: 120.0° (Facing South-East / 120°)
    3: 240.0   # Sensor 3: 240.0° (Facing South-West / 240°)
}

DANGER_RADIUS = 2.0    # meters
WARNING_RADIUS = 4.0   # meters
MAX_RANGE = 10.0       # meters


def transform_sensor_to_global(
    x: float,
    y: float,
    vx: float = 0.0,
    vy: float = 0.0,
    rotation_deg: float = 0.0,
    offset_x: float = 0.0,
    offset_y: float = 0.0
) -> Tuple[float, float, float, float]:
    """
    Transforms local sensor coordinates and velocities into unified global coordinates.
    Local sensor frame: +y is sensor forward (boresight), +x is sensor right.
    """
    theta = np.radians(rotation_deg)
    cos_t = np.cos(theta)
    sin_t = np.sin(theta)

    # Local frame: +y is sensor forward (boresight), +x is sensor right
    # Global frame: +y is North (0°), +x is East (90°)
    # Clockwise rotation by rotation_deg from North:
    gx = x * cos_t + y * sin_t + offset_x
    gy = -x * sin_t + y * cos_t + offset_y

    # Velocity rotation
    gvx = vx * cos_t + vy * sin_t
    gvy = -vx * sin_t + vy * cos_t

    return float(gx), float(gy), float(gvx), float(gvy)


def compute_polar_coordinates(x: float, y: float) -> Tuple[float, float]:
    """
    Converts global Cartesian coordinates (X, Y) to Polar coordinates (Range, Azimuth).
    Azimuth is defined as:
    0° = North (+Y)
    90° = East (+X)
    180° = South (-Y)
    270° = West (-X)
    """
    range_m = float(np.sqrt(x**2 + y**2))
    
    # atan2(x, y) gives angle from +Y axis in radians, clockwise towards +X
    angle_rad = np.arctan2(x, y)
    azimuth_deg = float(np.degrees(angle_rad))
    if azimuth_deg < 0:
        azimuth_deg += 360.0

    return round(range_m, 2), round(azimuth_deg, 1)


def classify_zone(range_m: float) -> str:
    """Classifies target into Danger, Warning, or Safe zone."""
    if range_m <= DANGER_RADIUS:
        return "DANGER"
    elif range_m <= WARNING_RADIUS:
        return "WARNING"
    else:
        return "SAFE"


def set_zone_thresholds(danger_r: float, warning_r: float):
    """Dynamically updates the spatial danger and warning thresholds across all radars."""
    global DANGER_RADIUS, WARNING_RADIUS
    DANGER_RADIUS = round(max(0.1, float(danger_r)), 2)
    WARNING_RADIUS = round(max(DANGER_RADIUS, float(warning_r)), 2)


def get_zone_thresholds() -> Dict[str, float]:
    """Returns current active zone boundaries."""
    return {
        "danger_radius": DANGER_RADIUS,
        "warning_radius": WARNING_RADIUS
    }


def determine_sector(azimuth_deg: float) -> str:
    """Returns the sector label based on azimuth."""
    if 300.0 <= azimuth_deg or azimuth_deg < 60.0:
        return "FORW (0°)"
    elif 60.0 <= azimuth_deg < 180.0:
        return "SE (120°)"
    else:
        return "SW (240°)"


def process_target_detection(
    raw_target: Dict[str, Any],
    sensor_id: int,
    rotation_deg: float = None,
    offset_x: float = 0.0,
    offset_y: float = 0.0
) -> Dict[str, Any]:
    """
    Takes a raw target dictionary from a sensor, transforms it into global space,
    and returns a fully enriched target dictionary with range, azimuth, velocity, and zone.
    """
    if rotation_deg is None:
        rotation_deg = SENSOR_ORIENTATIONS.get(sensor_id, 0.0)

    lx = float(raw_target.get("x", 0.0))
    ly = float(raw_target.get("y", 0.0))
    lz = float(raw_target.get("z", 1.0))
    lvx = float(raw_target.get("vx", 0.0))
    lvy = float(raw_target.get("vy", 0.0))
    lvz = float(raw_target.get("vz", 0.0))

    gx, gy, gvx, gvy = transform_sensor_to_global(
        lx, ly, lvx, lvy, rotation_deg, offset_x, offset_y
    )

    range_m, azimuth_deg = compute_polar_coordinates(gx, gy)
    velocity_mps = float(np.sqrt(gvx**2 + gvy**2 + lvz**2))
    zone = classify_zone(range_m)
    sector = determine_sector(azimuth_deg)

    return {
        "id": str(raw_target.get("id", f"S{sensor_id}-T1")),
        "sensor_id": int(sensor_id),
        "x": round(gx, 2),
        "y": round(gy, 2),
        "z": round(lz, 2),
        "vx": round(gvx, 2),
        "vy": round(gvy, 2),
        "vz": round(lvz, 2),
        "range": range_m,
        "azimuth": azimuth_deg,
        "velocity": round(velocity_mps, 2),
        "zone": zone,
        "sector": sector,
        "state": raw_target.get("state", "ACTIVE")
    }


def process_point_cloud(
    raw_points: list,
    sensor_id: int,
    rotation_deg: float = None,
    offset_x: float = 0.0,
    offset_y: float = 0.0
) -> list:
    """Transforms point cloud points into unified global space."""
    if rotation_deg is None:
        rotation_deg = SENSOR_ORIENTATIONS.get(sensor_id, 0.0)

    fused_points = []
    for p in raw_points:
        lx = float(p.get("x", 0.0))
        ly = float(p.get("y", 0.0))
        lz = float(p.get("z", 0.0))
        lv = float(p.get("v", 0.0))

        gx, gy, _, _ = transform_sensor_to_global(lx, ly, 0.0, 0.0, rotation_deg, offset_x, offset_y)
        range_m, azimuth_deg = compute_polar_coordinates(gx, gy)

        fused_points.append({
            "x": round(gx, 2),
            "y": round(gy, 2),
            "z": round(lz, 2),
            "v": round(lv, 2),
            "range": range_m,
            "azimuth": azimuth_deg,
            "sensor_id": int(sensor_id)
        })

    return fused_points
