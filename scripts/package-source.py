#!/usr/bin/env python3
"""Package canonical OneCall source; exclude legacy/editor/runtime leftovers."""
import argparse
import hashlib
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = {
    '.gitignore', '.dockerignore', 'render.yaml', 'LICENSE', 'README.md', 'package.json', 'pnpm-lock.yaml',
    'pnpm-workspace.yaml', 'compose.pilot.yml', 'compose.test.yml', 'CHANGELOG-PILOT.md',
}
BACKEND_FILES = {
    '.env.example', '.gitignore', '.prettierrc', 'README.md', 'package.json',
    'nest-cli.json', 'prisma.config.ts', 'eslint.config.mjs', 'tsconfig.json',
    'tsconfig.build.json',
}


def include(name):
    p = Path(name)
    if ('\\' in name or '..' in p.parts or
            any(part in ('.git', 'node_modules', 'dist', 'build', 'uploads',
                         '.dart_tool', '.gradle', '__pycache__', '.pilot-verification') for part in p.parts)):
        return False
    if ('.backup.' in name or '.bak.' in name or '.save' in p.name or '.before-' in p.name
            or p.name.endswith(('.bak', '.apk', '.aab', '.log', '.dump', '.jks', '.keystore', '.pem', '.key', '.pyc'))
            or (p.name.startswith('.env') and not p.name.endswith('.example'))
            or p.name in ('local.properties', 'key.properties')):
        return False
    if name in ROOT_FILES:
        return True
    if p.parts[0] in ('.github', 'docs', 'scripts', 'deploy'):
        return True
    if name.startswith('apps/mobile/'):
        return True
    if name.startswith('apps/backend/'):
        relative = Path(*p.parts[2:])
        return (str(relative) in BACKEND_FILES or relative.parts[0] in ('src', 'scripts', 'test', 'admin-web', 'legal-web')
                or str(relative) == 'prisma/schema.prisma'
                or str(relative).startswith('prisma/migrations/')
                or (relative.parts[0] == 'config' and relative.name.endswith('.example')))
    return False


def package(output):
    names = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT,
    ).decode().split('\0')
    selected = sorted({name for name in names if name and include(name)})
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in selected:
            source = ROOT / name
            if source.is_file() and not source.is_symlink():
                z.write(source, 'onecall/' + name)
    with zipfile.ZipFile(output) as z:
        if z.testzip() is not None:
            raise RuntimeError('The packaged ZIP is corrupt.')
        required = ('package.json', 'pnpm-lock.yaml', 'apps/mobile/pubspec.yaml',
                    'apps/mobile/lib/main.dart', 'apps/mobile/lib/ui/app_theme.dart',
                    'apps/backend/prisma/schema.prisma', 'scripts/apply-update.sh')
        for name in required:
            if 'onecall/' + name not in z.namelist():
                raise RuntimeError('Missing required source: ' + name)
        count = len(z.namelist())
    print(f'Packaged {count} canonical source files ({output.stat().st_size} bytes).')
    print('SHA256 ' + hashlib.sha256(output.read_bytes()).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    package(parser.parse_args().output.resolve())
