import uvicorn
import sys
import os
import webbrowser
from threading import Timer

# Adjust path so we can import app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app

def main():
    def open_browser():
        webbrowser.open("http://127.0.0.1:8000")
        
    Timer(1.5, open_browser).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")

if __name__ == "__main__":
    main()
