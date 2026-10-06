import importlib, sys, os, glob
sys.path.insert(0, os.path.dirname(__file__))
import dsl
ORDER = ['legal', 'fighter', 'business', 'president', 'media', 'presser', 'fightnight', 'weird', 'world', 'venture', 'legend', 'acts']
here = os.path.dirname(__file__)
extra = sorted(os.path.basename(p)[:-3] for p in glob.glob(os.path.join(here, '*.py')))
for m in ORDER + [x for x in extra if x not in ORDER and x not in ('dsl', 'build')]:
    if os.path.exists(os.path.join(here, m + '.py')):
        importlib.import_module(m)
dsl.write()
