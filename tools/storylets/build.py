import importlib, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import dsl
for m in ['legal', 'fighter', 'business', 'president', 'media', 'presser', 'fightnight', 'weird', 'world', 'venture', 'legend', 'acts']:
    if os.path.exists(os.path.join(os.path.dirname(__file__), m + '.py')):
        importlib.import_module(m)
dsl.write()
