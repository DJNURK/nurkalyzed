#!/usr/bin/env python3
"""Tiny static server for NURKALYZED.

Identical to `python3 -m http.server` but sends no-cache headers so edits are
always picked up on reload during development. Usage: python3 devserver.py [port]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"NURKALYZED dev server → http://localhost:{port}")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
