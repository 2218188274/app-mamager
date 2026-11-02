"""Compile and test shared Swift logic against a local synthetic provider; no external AI calls."""
import http.server, json, os, pathlib, subprocess, sys, threading, time
seen = []
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        seen.append(self.path)
        if self.path == '/v1/models':
            data = json.dumps({'data':[{'id':'fixture-b'},{'id':'fixture-a'},{'id':'fixture-a'}]}).encode()
            self.send_response(200); self.end_headers(); self.wfile.write(data)
        else:
            self.send_response(400); self.end_headers()
    def do_POST(self):
        seen.append(self.path)
        assert self.headers.get('Authorization') == 'Bearer synthetic-key-only'
        assert self.headers.get('x-api-key') is None and self.headers.get('x-device-id') is None
        n = int(self.headers['Content-Length']); assert n <= 1_600_000
        body = json.loads(self.rfile.read(n)); assert body['model'] == 'fixture-model'
        if self.path.startswith('/redirect/'):
            self.send_response(307); self.send_header('Location','/sink'); self.end_headers(); return
        if self.path.startswith('/error/'):
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"error":"private provider detail"}'); return
        if body['messages'][-1]['content'] in ['slow','stale']: time.sleep(0.3)
        try:
            if body['stream']:
                self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.end_headers()
                frames = 'data: '+json.dumps({'choices':[{'delta':{'content':'你好👋'},'finish_reason':None}]},ensure_ascii=False)+'\n\n'
                if not self.path.startswith('/truncated/'):
                    frames += 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
                raw = frames.encode()
                for i in range(0,len(raw),3): self.wfile.write(raw[i:i+3]); self.wfile.flush()
            else:
                content = 'OK' if body['messages'][-1]['content'] == '只回复 OK' else '{"candidates":["好的","收到"]}'
                self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
                self.wfile.write(json.dumps({'choices':[{'message':{'content':content},'finish_reason':'stop'}]}).encode())
        except (BrokenPipeError,ConnectionResetError): pass

server = http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
root = pathlib.Path(__file__).resolve().parents[2]
env = dict(os.environ,CHATQ_TEST_API='http://127.0.0.1:'+str(server.server_port)+'/v1')
try:
    result = subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'swift','test','--package-path',str(root),
        '--scratch-path',os.environ.get('CHATQ_SWIFT_SCRATCH','/var/tmp/chatq-ios-ai-tests'),'--jobs','2'],env=env)
    assert '/sink' not in seen, 'redirect must not transmit credentials'
    assert '/v1/models' in seen and '/redirect/chat/completions' in seen and '/truncated/chat/completions' in seen
    print(json.dumps({'externalAiCalls':0,'localHttpRequests':len(seen),'redirectSinkRequests':seen.count('/sink')}),flush=True)
    sys.exit(result.returncode)
finally: server.shutdown(); server.server_close()
