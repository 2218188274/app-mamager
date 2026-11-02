"""Launch ONLY the freshly built ChatQ app in a new disposable Apple simulator."""
import json,pathlib,subprocess,sys,time,platform,uuid
assert platform.system()=='Darwin'
folder=pathlib.Path(sys.argv[1]).resolve();app=folder/'Build/Products/Release-iphonesimulator/app.app'
assert app.is_dir()
def run(*args,timeout=90):return subprocess.check_output(['xcrun','simctl',*args],text=True,timeout=timeout).strip()
types=json.loads(run('list','devicetypes','--json'))['devicetypes']
device=next(t for t in types if t['name'].startswith('iPhone 16'))
runtimes=json.loads(run('list','runtimes','--json'))['runtimes']
runtime=next(r for r in runtimes if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS'))
identifier=run('create','ChatQ Synthetic Smoke',device['identifier'],runtime['identifier'])
uuid.UUID(identifier)
try:
    run('boot',identifier);run('bootstatus',identifier,'-b',timeout=180)
    run('install',identifier,str(app));launched=run('launch',identifier,'com.jaxon.app.chatq')
    time.sleep(12)
    processes=run('spawn',identifier,'launchctl','list')
    assert any('com.jaxon.app.chatq' in line and line.split()[0].isdigit() for line in processes.splitlines()),'ChatQ did not remain running'
    run('io',identifier,'screenshot',str(folder/'ChatQ-ios-home.png'))
    report={'status':'passed','runtime':runtime['name'],'device':device['name'],'launch':launched,'freshSyntheticSimulator':True,'userChatRead':False,'realAiCalls':0,'signedKeychainValidated':False,'wechatQqValidated':False}
    (folder/'smoke.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
finally:
    subprocess.run(['xcrun','simctl','shutdown',identifier],capture_output=True,timeout=30)
    subprocess.run(['xcrun','simctl','delete',identifier],capture_output=True,timeout=30)
