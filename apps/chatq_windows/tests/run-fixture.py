"""Synthetic localhost provider only; never uses user API configuration."""
import http.server, json, os, pathlib, subprocess, sys, threading, time
requests = []; redirects = []
class Sink(http.server.BaseHTTPRequestHandler):
    def do_GET(self): redirects.append(True); self.send_response(200); self.end_headers()
    do_POST = do_GET
    def log_message(self, *_): pass
class Provider(http.server.BaseHTTPRequestHandler):
    def send(self, data, status=200, kind='application/json'):
        raw = data.encode() if isinstance(data, str) else json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(raw))); self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
    def do_GET(self):
        assert self.headers.get('Authorization')=='Bearer synthetic-test-key'
        requests.append('models');self.send({'data':[{'id':'fixture-model'},{'id':'fixture-model-2'}]})
    def do_POST(self):
        assert self.headers.get('Authorization')=='Bearer synthetic-test-key'
        assert not any(self.headers.get(k) for k in ['x-app-id','x-api-key','x-device-id'])
        data=json.loads(self.rfile.read(int(self.headers['Content-Length'])));prompt=data['messages'][-1]['content'];requests.append(prompt)
        if prompt=='fixture-redirect':
            self.send_response(307);self.send_header('Location',f'http://127.0.0.1:{sink.server_port}/sink');self.end_headers();return
        if prompt=='fixture-auth-error':self.send({'error':{'message':'synthetic-test-key must not escape'}},401);return
        if prompt=='fixture-slow':time.sleep(1);self.send({'choices':[]});return
        if prompt=='fixture-stream':
            raw='data: '+json.dumps({'choices':[{'delta':{'content':'你好👋'},'finish_reason':None}]},ensure_ascii=False)+'\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
            self.send(raw,kind='text/event-stream');return
        system=data['messages'][0]['content']
        if '生成人设卡' in system:answer=json.dumps({'name':'合成测试人设','instructions':'表达清楚、简短真诚，保持边界。','example':'收到，我们一起确认一下。'},ensure_ascii=False)
        elif prompt=='fixture-reply' or '只返回JSON对象' in system:answer=json.dumps({'replies':['合成回复一','合成回复二','合成回复三']},ensure_ascii=False)
        else:answer='合成回答'
        self.send({'choices':[{'message':{'content':answer},'finish_reason':'stop'}]})
    def log_message(self,*_):pass
sink=http.server.ThreadingHTTPServer(('127.0.0.1',0),Sink);provider=http.server.ThreadingHTTPServer(('127.0.0.1',0),Provider)
for server in [sink,provider]:threading.Thread(target=server.serve_forever,daemon=True).start()
root=pathlib.Path(__file__).resolve().parents[1]
try:
    if len(sys.argv)>1 and sys.argv[1]=='--serve':
        print(json.dumps({'fixtureUrl':f'http://127.0.0.1:{provider.server_port}/v1','realAiCalls':0}),flush=True)
        while True:time.sleep(1)
    env=dict(os.environ,CHATQ_TEST_URL=f'http://127.0.0.1:{provider.server_port}/v1',DOTNET_CLI_TELEMETRY_OPTOUT='1',DOTNET_GENERATE_ASPNET_CERTIFICATE='false')
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'dotnet','run','--project',str(root/'Checks/ChatQ.Checks.csproj'),'-c','Release'],env=env,check=True,timeout=120)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'dotnet','run','--project',str(root/'LayoutChecks/ChatQ.LayoutChecks.csproj'),'-c','Release'],env=env,check=True,timeout=120)
    # Immediate UI cancellation may stop a request before it reaches the loopback server.
    assert len(requests) in [13,14] and requests.count('fixture-slow') in [1,2] and not redirects, (len(requests), requests.count('fixture-slow'))
    print(json.dumps({'providerRequests':len(requests),'redirectSinkRequests':len(redirects),'paidAiCalls':0}))
finally:
    provider.shutdown();sink.shutdown()
