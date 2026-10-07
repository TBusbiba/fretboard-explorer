#!/usr/bin/env python3
"""Dev server for this repo: like `python3 -m http.server` but tells the
browser never to cache, so edits show up on a plain reload.

    python3 serve.py            # http://127.0.0.1:8000
    python3 serve.py 8080
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter log: only non-200s
        if len(args) >= 2 and str(args[1]).startswith(("2", "3")):
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving on http://127.0.0.1:{port}  (no-cache)")
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
