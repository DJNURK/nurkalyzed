#!/bin/bash
# Double-click to launch NURKALYZED on macOS.
cd "$(dirname "$0")" || exit 1
PORT=8000
echo "NURKALYZED → http://localhost:$PORT"
# open the browser shortly after the server starts
( sleep 1; open "http://localhost:$PORT" ) &
exec python3 -m http.server "$PORT"
