#!/usr/bin/env python3
"""Back up and apply the local OneCall social sign-in pilot source update."""
import argparse, json, os, re, shutil, socket, subprocess, tempfile, zipfile
from pathlib import Path, PurePosixPath
ALLOWED = {'docs/SOCIAL-SIGN-IN.md', 'apps/backend/src/modules/auth/social/social.controller.ts', 'apps/backend/src/modules/auth/auth.service.ts', 'apps/mobile/assets/legal/onecall-policies.json', 'apps/backend/src/bootstrap/configure-application.ts', 'apps/backend/scripts/release-readiness.cjs', 'apps/mobile/lib/ui/auth_page.dart', 'apps/mobile/test/api_client_test.dart', 'scripts/package-source.py', 'apps/mobile/lib/ui/home_page.dart', 'apps/backend/src/modules/user/user.module.ts', 'apps/backend/src/modules/upload/upload.module.ts', 'apps/mobile/lib/ui/design_widgets.dart', '.dockerignore', 'docs/verification/release-preparation-result.json', 'apps/backend/src/modules/auth/social/social-browser.service.ts', 'apps/backend/test/admin-operations.e2e-spec.ts', 'apps/backend/src/modules/auth/social/social.dto.ts', 'apps/mobile/test/widget_test.dart', 'apps/backend/src/modules/auth/social/social-crypto.spec.ts', 'apps/backend/test/jest-social.json', 'docs/legal/ONECALL-LEGAL-DRAFT.md', 'apps/backend/src/modules/auth/auth.module.ts', 'apps/mobile/ios/Runner/Info.plist', 'apps/mobile/lib/main.dart', 'apps/backend/src/modules/upload/booking-photo.service.ts', 'apps/backend/prisma/migrations/20261013160000_social_sign_in/migration.sql', 'apps/backend/src/common/security/business-logic-security.spec.ts', 'apps/backend/src/modules/auth/social/social-verifier.spec.ts', 'scripts/prepare-render.py', 'deploy/render-paid-staging.example.yaml', 'apps/backend/src/modules/auth/social/social-crypto.ts', 'apps/backend/legal-web/account-deletion.html', 'apps/backend/src/modules/upload/storage-path.ts', 'apps/mobile/lib/ui/finance_pages.dart', 'scripts/collect-android-crash.py', 'scripts/apply-social-update.py', 'apps/mobile/lib/ui/appearance_page.dart', 'apps/backend/test/social-auth.e2e-spec.ts', 'apps/backend/test/release-readiness.test.cjs', 'apps/backend/legal-web/providers.html', 'apps/backend/legal-web/index.html', 'apps/mobile/pubspec.yaml', 'apps/backend/package.json', 'apps/mobile/lib/ui/social_sign_in.dart', 'apps/backend/src/modules/upload/storage-path.spec.ts', 'apps/backend/legal-web/privacy.html', 'docs/PENDING-UPDATE.md', 'deploy/Dockerfile', 'apps/mobile/lib/ui/input_dialogs.dart', 'apps/backend/legal-web/payments.html', 'apps/backend/src/modules/auth/social/social-verifier.ts', 'apps/backend/src/modules/auth/strategies/jwt.strategy.ts', 'apps/backend/test/jest-release.json', 'apps/mobile/android/key.properties.example', 'apps/backend/src/modules/upload/booking-photo.controller.ts', 'apps/backend/config/release.env.example', 'apps/mobile/lib/ui/order_pages.dart', 'scripts/verify-kaduna-pilot.sh', 'apps/mobile/test/crash_regression_test.dart', 'apps/backend/src/modules/upload/services/upload.service.ts', 'docs/verification/pending-update-result.json', 'apps/mobile/lib/ui/tracking_page.dart', 'docs/verification/crash-follow-up-result.json', 'apps/backend/scripts/start-cloud.cjs', 'apps/backend/prisma/migrations/20261013170000_booking_photos/migration.sql', 'docs/legal/onecall-policies.json', 'apps/mobile/lib/ui/profile_pages.dart', 'docs/verification/social-sign-in-result.json', 'apps/backend/legal-web/storage.html', 'apps/mobile/lib/ui/booking_photos.dart', 'docs/STAGING-AND-RELEASE.md', 'apps/backend/prisma/migrations/20261013180000_social_browser/migration.sql', 'render.yaml', 'apps/backend/prisma/schema.prisma', '.github/workflows/kaduna-pilot.yml', 'apps/backend/src/modules/auth/social/social.service.ts', 'apps/backend/legal-web/consumer.html', 'apps/backend/src/modules/user/controllers/privacy.controller.ts', 'apps/mobile/lib/core/api.dart', 'apps/mobile/lib/ui/legal_page.dart', 'apps/mobile/android/app/build.gradle.kts', 'apps/backend/legal-web/terms.html', 'apps/backend/src/modules/auth/social/apple-lifecycle.service.ts', 'apps/mobile/lib/ui/privacy_requests.dart', 'scripts/build-android-release.sh', 'apps/backend/prisma/migrations/20261013190000_apple_lifecycle/migration.sql', 'apps/backend/src/config/validation.ts'}
FIX_CODES = 'prefer_interpolation_to_compose_strings,use_null_aware_elements,curly_braces_in_flow_control_structures'

def run(args, root, env=None):
    task_env=dict(os.environ,CI='true',BOT='true',FLUTTER_SUPPRESS_ANALYTICS='true')
    if env: task_env.update(env)
    subprocess.run(args, cwd=root, env=task_env, check=True)

def normalise(root, records, unknown):
    mobile=root/'apps/mobile'
    if not (mobile/'.dart_tool/package_config.json').is_file():
        raise SystemExit('Run flutter pub get in apps/mobile before this update.')
    with tempfile.TemporaryDirectory(prefix='onecall-social-compare-') as temp:
        copies=[]
        count=max(len(record['before']) for record in records.values())
        for index in range(-1, count):
            target=Path(temp)/str(index); target.mkdir()
            for folder in ('lib','test'):
                shutil.copytree(mobile/folder,target/folder)
            shutil.copyfile(mobile/'pubspec.yaml',target/'pubspec.yaml')
            shutil.copyfile(mobile/'analysis_options.yaml',target/'analysis_options.yaml')
            (target/'.dart_tool').mkdir()
            config=json.loads((mobile/'.dart_tool/package_config.json').read_text())
            for package in config['packages']:
                if package['name']=='onecall': package['rootUri']='../'; package['packageUri']='lib/'
            (target/'.dart_tool/package_config.json').write_text(json.dumps(config))
            if index>=0:
                for name, record in records.items():
                    if not name.endswith('.dart'): continue
                    path=target/Path(name).relative_to('apps/mobile')
                    value=record['before'][index]
                    if value is None: path.unlink(missing_ok=True)
                    else: path.parent.mkdir(parents=True,exist_ok=True); path.write_text(value)
            run(['dart','fix','--apply','--code='+FIX_CODES],target)
            paths=[str(Path(name).relative_to('apps/mobile')) for name in unknown if (target/Path(name).relative_to('apps/mobile')).is_file()]
            if paths: run(['dart','format',*paths],target)
            copies.append(target)
        for name in unknown:
            relative=Path(name).relative_to('apps/mobile')
            actual=(copies[0]/relative).read_text()
            if not any((copy/relative).is_file() and (copy/relative).read_text()==actual for copy in copies[1:]):
                raise SystemExit('No source applied. Preserve and merge custom edits: '+name)

def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('archive',type=Path)
    parser.add_argument('root',type=Path,nargs='?',default=Path.home()/'onecall/apps/backend/onecall')
    args=parser.parse_args(); root=args.root.resolve(); os.umask(0o077)
    for name in ('docker','pnpm','dart','flutter'):
        if not shutil.which(name): raise SystemExit('Required tool unavailable: '+name)
    if json.loads((root/'package.json').read_text()).get('name')!='onecall': raise SystemExit('Select the existing OneCall workspace.')
    if not (root/'apps/mobile/lib/ui/legal_page.dart').is_file(): raise SystemExit('Install the working design/legal update first.')
    try:
        with socket.create_connection(('127.0.0.1',3000),timeout=1): pass
    except OSError: pass
    else: raise SystemExit('Stop the backend on port 3000 and close the emulator before updating.')
    config={}
    for path in (root/'apps/backend/.env',root/'apps/backend/.env.development'):
        if not path.exists(): continue
        for line in path.read_text().splitlines():
            match=re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$',line)
            if match:
                value=match[2]; config[match[1]]=value[1:-1] if value.startswith(('"',"'")) and value.endswith(value[0]) else value.split(' #',1)[0].rstrip()
    database='postgresql://onecall_local:onecall_local_only@127.0.0.1:54329/onecall_pilot'
    redis='redis://127.0.0.1:63799/0'
    if config.get('DATABASE_URL')!=database or config.get('REDIS_URL')!=redis or config.get('NODE_ENV')!='development':
        raise SystemExit('Requires the established local development pilot configuration; private settings were not changed.')
    with zipfile.ZipFile(args.archive) as archive:
        infos=archive.infolist()
        if len(infos)!=3 or {i.filename for i in infos}!={'payload.json','README.md','scripts/apply-social-update.py'} or sum(i.file_size for i in infos)>8*1024*1024:
            raise SystemExit('Unexpected update archive.')
        payload=json.loads(archive.read('payload.json'))
    if payload.get('schema')!=1 or set(payload.get('files',{}))!=ALLOWED: raise SystemExit('Unexpected source payload.')
    records=payload['files']; writes={}; unknown=[]
    for name,record in records.items():
        path=PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name or not isinstance(record.get('after'),str) or len(record.get('before',[]))!=9: raise SystemExit('Invalid source target.')
        target=root/name
        for part in (target,*target.parents):
            if part==root: break
            if part.is_symlink(): raise SystemExit('Refusing symbolic link: '+name)
        if target.exists() and not target.is_file(): raise SystemExit('Expected regular file: '+name)
        actual=target.read_text() if target.is_file() else None
        if actual==record['after']: continue
        if name=='apps/backend/package.json':
            package=json.loads(actual); script=json.loads(record['after'])['scripts']['test:social']
            existing=package.setdefault('scripts',{}).get('test:social')
            if existing not in (None,script): raise SystemExit('Preserve custom test:social script.')
            package['scripts']['test:social']=script; writes[name]=json.dumps(package,indent=2)+'\n'; continue
        if actual not in record['before']:
            if name.endswith('.dart') and actual is not None: unknown.append(name)
            else: raise SystemExit('No source applied. Preserve and merge custom edits: '+name)
        writes[name]=record['after']
    if unknown: normalise(root,records,unknown)
    if not writes: print('Social sign-in source already installed.'); return
    compose=['docker','compose','-p','onecall-kaduna-local','-f',str(root/'compose.pilot.yml'),'exec','-T','postgres']
    backup=Path(tempfile.mkdtemp(prefix='onecall-before-social-',dir=Path.home()))
    print('Source and database backup: '+str(backup),flush=True)
    with zipfile.ZipFile(backup/'source-before.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for name in writes:
            if (root/name).is_file(): archive.write(root/name,name)
    (backup/'new-files.json').write_text(json.dumps([name for name in writes if not (root/name).exists()],indent=2))
    with (backup/'database.dump.partial').open('wb') as output:
        subprocess.run(compose+['pg_dump','-U','onecall_local','-d','onecall_pilot','-Fc'],cwd=root,stdout=output,check=True)
    if (backup/'database.dump.partial').stat().st_size==0: raise SystemExit('Empty database backup; no source applied.')
    with (backup/'database.dump.partial').open('rb') as source:
        subprocess.run(compose+['pg_restore','--list'],cwd=root,stdin=source,stdout=subprocess.DEVNULL,check=True)
    (backup/'database.dump.partial').rename(backup/'database.dump')
    for name,value in writes.items():
        target=root/name; target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w',dir=target.parent,delete=False) as output: output.write(value); temp=Path(output.name)
        temp.chmod(0o644); temp.replace(target)
    env=dict(os.environ,DATABASE_URL=database,REDIS_URL=redis,NODE_ENV='development')
    try:
        run(['pnpm','--filter','backend','prisma:validate'],root,env)
        run(['pnpm','--filter','backend','prisma:deploy'],root,env)
        run(['pnpm','--filter','backend','prisma:generate'],root,env)
        run(['pnpm','--filter','backend','build'],root,env)
        run(['pnpm','--filter','backend','exec','jest','--config','test/jest-social.json','--runInBand','--runTestsByPath','src/modules/auth/social/social-verifier.spec.ts'],root,env)
        run(['node','--test','test/release-readiness.test.cjs'],root/'apps/backend',env)
        run(['pnpm','--filter','backend','exec','jest','--config','test/jest-release.json','--runInBand'],root,env)
        run(['python3','scripts/generate-legal-pages.py','--check'],root)
        run(['pnpm','--filter','backend','test:legal'],root,env)
        mobile=root/'apps/mobile'
        run(['flutter','pub','get'],mobile)
        run(['dart','fix','--apply','--code='+FIX_CODES],mobile)
        paths=[str(Path(name).relative_to('apps/mobile')) for name in writes if name.endswith('.dart')]
        if paths: run(['dart','format',*paths],mobile)
        run(['flutter','analyze'],mobile); run(['flutter','test'],mobile)
    except subprocess.CalledProcessError:
        raise SystemExit('Verification stopped. Backup: '+str(backup)+'. Source and additive migration may already be applied; review before retrying.')
    print('Pilot source and native checks passed. Provider credentials remain unchanged; social sign-in is disabled until configured. Build APK next with emulator closed.')

if __name__=='__main__': main()
