#!/usr/bin/env python3
"""Read OneCall device diagnostics into a private, excluded local folder."""
import argparse,json,os,re,subprocess
from datetime import datetime,timezone
from pathlib import Path

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--device',default='emulator-5554');p.add_argument('--application-id',default='com.example.onecall');args=p.parse_args()
 if not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+',args.application_id):raise SystemExit('Use the installed Android application ID.')
 adb=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'Android/Sdk')))/'platform-tools/adb'
 if not adb.is_file():raise SystemExit('Android adb was not found. Set ANDROID_HOME.')
 root=Path(__file__).resolve().parent.parent;out=root/'.pilot-verification'/('android-crash-'+datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S'));out.mkdir(parents=True,mode=0o700)
 def read(*parts):
  try:r=subprocess.run([str(adb),'-s',args.device,*parts],capture_output=True,text=True,timeout=20);return {'exit':r.returncode,'output':r.stdout}
  except (OSError,subprocess.TimeoutExpired):return {'exit':None,'output':''}
 results={'device':args.device,'applicationId':args.application_id,'state':read('get-state'),'boot':read('shell','-n','getprop','sys.boot_completed'),'packageManager':read('shell','-n','service','check','package'),'installed':read('shell','-n','pm','path',args.application_id)}
 pid=read('shell','-n','pidof',args.application_id)['output'].strip()
 if re.fullmatch(r'\d+(?: \d+)*',pid):
  log=read('logcat','-d','--pid='+pid.split()[0],'-t','200')
  (out/'onecall-running.log').write_text(log['output']);(out/'onecall-running.log').chmod(0o600)
 raw=read('logcat','-b','crash','-d','-t','300')['output'];pids=set()
 for line in raw.splitlines():
  if re.search(r'Process: '+re.escape(args.application_id)+r',',line):
   m=re.search(r'PID: (\d+)',line)
   if m:pids.add(m[1])
 matching=[]
 for line in raw.splitlines():
  fields=line.split()
  if len(fields)>3 and fields[2] in pids:matching.append(line)
 (out/'onecall-crash.log').write_text('\n'.join(matching)+'\n');(out/'onecall-crash.log').chmod(0o600)
 results['matchingCrashFound']=bool(matching);(out/'status.json').write_text(json.dumps(results,indent=2));(out/'status.json').chmod(0o600)
 print('Private diagnostic folder:',out);print('OneCall crash found:',bool(matching));print('These logs can contain personal details; review locally before sharing.')
if __name__=='__main__':main()
