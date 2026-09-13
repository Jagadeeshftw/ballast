#!/usr/bin/env python3
"""Check tracked files and every historical blob without printing secret values."""
import pathlib, re, subprocess, sys
root=pathlib.Path(__file__).resolve().parent.parent
secrets=[]
for filename in ['.env','web/.env.local']:
 p=root/filename
 if p.exists():
  for line in p.read_text().splitlines():
   match=re.match(r'\s*(DATABASE_URL|PRIVATE_KEY|ACETERNITY_UI_API_KEY)\s*=\s*(.+)',line)
   if match:
    value=match[2].strip().strip('\"\'')
    if len(value)>=16:secrets.append(value.encode())
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
def contains(data):
 return any(value in data for value in secrets) or bool(re.search(rb'postgres(?:ql)?://[^\s\'\"]+:[^\s\'\"]+@',data))
failed=False
for name in git('ls-files','-z').split(b'\0'):
 if not name:continue
 p=root/name.decode()
 if p.is_file() and contains(p.read_bytes()):
  print('FAIL: credential in tracked file',name.decode());failed=True
for name in ['.env','web/.env.local']:
 if git('ls-files',name).strip():print('FAIL: environment file tracked',name);failed=True
objects=[line.split(b' ',1)[0] for line in git('rev-list','--objects','--all').splitlines()]
# Stream blobs through cat-file rather than spawning a process for every revision.
proc=subprocess.Popen(['git','cat-file','--batch'],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for oid in objects:
 proc.stdin.write(oid+b'\n');proc.stdin.flush()
 header=proc.stdout.readline().split();size=int(header[2]);data=proc.stdout.read(size);proc.stdout.read(1)
 if header[1]==b'blob' and contains(data):
  print('FAIL: credential in historical blob',oid.decode());failed=True
proc.stdin.close();proc.wait()
print('PASS: credentials absent from tracked files and all reachable history.' if not failed else 'Secret audit failed. Do not push.')
sys.exit(1 if failed else 0)
