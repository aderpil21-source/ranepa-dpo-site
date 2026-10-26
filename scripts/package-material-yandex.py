"""Build the dependency-free Yandex Cloud Functions archive."""
from pathlib import Path
import json
import sys
import zipfile
root = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1])
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(root / 'public-api-proxy/material-server.mjs', 'material-server.mjs')
    # Yandex resolves the handler as .js, with ESM enabled by package.json.
    archive.write(root / 'public-api-proxy/yandex-material.mjs', 'yandex-material.js')
    archive.writestr('package.json', json.dumps({'type': 'module'}))
