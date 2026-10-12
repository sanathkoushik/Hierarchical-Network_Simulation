"""Start the simulator and open the dashboard: python run.py"""
import threading
import webbrowser

import uvicorn

HOST, PORT = "127.0.0.1", 8000

if __name__ == "__main__":
    threading.Timer(1.2, lambda: webbrowser.open(f"http://{HOST}:{PORT}/")).start()
    uvicorn.run("hnsim.api:app", host=HOST, port=PORT, log_level="warning")
