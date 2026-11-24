#!/usr/bin/env python3
import sys
import os
import uvicorn

# Ensure the GUI directory is in Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(current_dir, "backend"))

if __name__ == "__main__":
    print("\n=======================================================")
    print("  360° MOBILE TRACKER — CIRCULAR PLOT SYSTEM")
    print("=======================================================")
    print("  Local Server:    http://localhost:8000")
    print("  WebSocket Feed:  ws://localhost:8000/ws/telemetry")
    print("  Architecture:    Python Backend + Pure HTML/Canvas Frontend")
    print("=======================================================\n")
    
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, app_dir=os.path.join(current_dir, "backend"))
