from pathlib import Path
import json
Path('worker/index.js').write_text('const HTML = '+json.dumps(Path('worker/page.html').read_text())+';\n'+Path('worker/api.js').read_text())
