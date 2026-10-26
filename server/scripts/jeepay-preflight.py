"""Read-only Jeepay candidate inspection. Never starts containers or reads orders."""
from pathlib import Path
import argparse,json,os,re,shutil,subprocess

def inspect_candidate(root):
    root=Path(root);checks=[]
    def add(name,ok,message):checks.append({'check':name,'ok':bool(ok),'message':message})
    def read(name):
        p=root/name
        try:
            if not p.is_file() or p.stat().st_size>65536:return None
            return json.loads(p.read_text(encoding='utf-8-sig'))
        except (OSError,ValueError):return None
    compose=read('compose.json');add('compose_json',isinstance(compose,dict),'部署清单应为有效 JSON，检查不会回显内容')
    manifest=read('SOURCE_MANIFEST.json');add('source_manifest',isinstance(manifest,dict),'保留来源与构建清单，隔离候选环境不能视作生产验收')
    services=compose.get('services',{}) if isinstance(compose,dict) else {}
    if not isinstance(services,dict):services={}
    required=['payment','mysql','redis','mq','namesrv']
    add('required_services',all(isinstance(services.get(n),dict) for n in required),'需包含支付、数据库、缓存及消息队列依赖')
    images=[s.get('image','') for s in services.values() if isinstance(s,dict)]
    add('pinned_images',bool(images) and all(isinstance(n,str) and re.search(r'@sha256:[a-f0-9]{64}$',n) for n in images),'镜像应固定摘要，避免重建时无意升级')
    exposed=[]
    for name,s in services.items():
        if not isinstance(s,dict):continue
        for port in s.get('ports',[]):
            host=port.get('host_ip') if isinstance(port,dict) else str(port).split(':')[0] if str(port).count(':')>=2 else ''
            if host not in ['127.0.0.1','::1']:exposed.append(name)
    add('private_ports',not exposed,'管理、数据库和消息队列端口不能直接暴露公网')
    ready=True
    for name in ['payment','mysql','redis','mq','namesrv']:
        s=services.get(name,{})
        if not isinstance(s,dict):ready=False;continue
        if not s.get('healthcheck') or s.get('healthcheck',{}).get('disable'):ready=False
    add('dependency_health',ready,'候选清单缺少完整健康检查，service_started 不能证明依赖已经就绪')
    for role in ['payment','merchant','manager']:
        name='private/'+role+'.yml';value=read(name);p=root/name
        add(role+'_configuration',isinstance(value,dict),'检查私有配置是否存在且可解析，不输出账号、密码、密钥或原始错误')
        try:private=os.name=='nt' or p.exists() and p.stat().st_mode&0o077==0
        except OSError:private=False
        add(role+'_private_permissions',private,'私有配置应仅允许属主读写，运行用户需具备读取权限')
    return {'readOnly':True,'externalCalls':0,'productionReady':False,'livePaymentsVerified':False,'activationChanged':False,'checks':checks,'blockingReasons':['formal_merchant_and_channel_not_accepted','candidate_not_approved_for_production']+[c['check'] for c in checks if not c['ok']]}

def runtime(report):
    report['disk']={'rootFreeBytes':shutil.disk_usage('/').free}
    if report['disk']['rootFreeBytes']<1024**3:report['blockingReasons'].append('root_disk_below_1gb')
    try:
        ids=subprocess.check_output(['docker','ps','-aq','--filter','name=youling-jeepay-lab-'],text=True,timeout=10).split()
        rows=json.loads(subprocess.check_output(['docker','inspect']+ids,text=True,timeout=10)) if ids else []
        report['gatewayContainers']=[{'name':r['Name'].lstrip('/'),'state':r['State']['Status']} for r in rows]
        if not rows or any(r['State']['Status']!='running' for r in rows if not any(x in r['Name'] for x in ['init','bootstrap'])):report['blockingReasons'].append('gateway_not_running')
        p=subprocess.run(['docker','exec','chatq-api-1','node','scripts/payment-readiness.mjs'],capture_output=True,text=True,timeout=25)
        data=json.loads(p.stdout)
        report['chatq']={'configurationStatus':data['configuration']['status'],'salesEnabled':any(a['salesEnabled'] for a in data.get('apps',[])),'activePlans':sum(a['activePlans'] for a in data.get('apps',[]))}
    except (OSError,ValueError,KeyError,subprocess.SubprocessError):report['blockingReasons'].append('runtime_check_unavailable')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',required=True,type=Path);parser.add_argument('--runtime',action='store_true');args=parser.parse_args()
    report=inspect_candidate(args.root)
    if args.runtime:runtime(report)
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(2 if report['blockingReasons'] else 0)
