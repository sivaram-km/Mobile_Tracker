import struct
from typing import List, Dict, Any, Tuple

MAGIC_WORD = bytes([0x02, 0x01, 0x04, 0x03, 0x06, 0x05, 0x08, 0x07])
HEADER_SIZE = 40


def parse_serial_buffer(buffer: bytearray, sensor_id: int = 1) -> Tuple[bytearray, List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parses incoming serial bytes, synchronizes to MAGIC_WORD, unpacks TLVs,
    and returns (remaining_buffer, detected_targets, detected_points).
    """
    targets: List[Dict[str, Any]] = []
    points: List[Dict[str, Any]] = []

    while True:
        idx = buffer.find(MAGIC_WORD)
        if idx < 0:
            # Keep only the last 7 bytes in case magic word was cut in half
            buffer = buffer[-7:] if len(buffer) >= 7 else buffer
            break

        if idx > 0:
            buffer = buffer[idx:]

        if len(buffer) < HEADER_SIZE:
            break

        # Unpack total packet length from header (offset 12, uint32 little-endian)
        total_len = struct.unpack_from("<I", buffer, 12)[0]
        if total_len < HEADER_SIZE or total_len > 65536:
            # Corrupted header, skip one byte and re-sync
            buffer = buffer[1:]
            continue

        if len(buffer) < total_len:
            # Need more bytes for the complete frame
            break

        frame_data = bytes(buffer[:total_len])
        buffer = buffer[total_len:]

        try:
            num_det = struct.unpack_from("<I", frame_data, 28)[0]
            num_tlvs = struct.unpack_from("<I", frame_data, 32)[0]

            frame_targets, frame_points = unpack_tlvs(frame_data[HEADER_SIZE:], num_tlvs, sensor_id)
            targets.extend(frame_targets)
            points.extend(frame_points)
        except Exception:
            pass

    return buffer, targets, points


def unpack_tlvs(payload: bytes, num_tlvs: int, sensor_id: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Unpacks TLV blocks from payload bytes."""
    offset = 0
    targets = []
    points = []

    for _ in range(num_tlvs):
        if offset + 8 > len(payload):
            break

        t_type, t_len = struct.unpack_from("<II", payload, offset)
        offset += 8
        tlv_data = payload[offset : offset + t_len]
        offset += t_len

        # Type 1020 or 1: Point Cloud (16 bytes per point: x, y, z, v)
        if t_type == 1020 or t_type == 1:
            num_points = t_len // 16
            for i in range(num_points):
                p_off = i * 16
                if p_off + 16 > len(tlv_data):
                    break
                px, py, pz, pv = struct.unpack_from("<ffff", tlv_data, p_off)
                points.append({
                    "x": float(px),
                    "y": float(py),
                    "z": float(pz),
                    "v": float(pv),
                    "sensor_id": sensor_id
                })

        # Type 1010: Target List
        elif t_type == 1010:
            stride = 112 if (t_len % 112 == 0 and t_len // 112 >= 1) else 40
            num_targets = t_len // stride

            for i in range(num_targets):
                t_off = i * stride
                if t_off + 28 > len(tlv_data):
                    break
                tid = struct.unpack_from("<I", tlv_data, t_off)[0]
                tx, ty, tz, tvx, tvy, tvz = struct.unpack_from("<ffffff", tlv_data, t_off + 4)

                # Filter out obvious corrupt/out-of-bounds spikes
                if -25.0 < tx < 25.0 and 0.0 < ty < 25.0 and -2.0 < tz < 5.0:
                    targets.append({
                        "id": f"S{sensor_id}-T{tid}",
                        "x": float(tx),
                        "y": float(ty),
                        "z": float(tz),
                        "vx": float(tvx),
                        "vy": float(tvy),
                        "vz": float(tvz),
                        "sensor_id": sensor_id,
                        "state": "ACTIVE"
                    })

    return targets, points
