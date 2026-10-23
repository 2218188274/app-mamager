"""End-to-end checks against a disposable app and the private ai-fixture service."""
import concurrent.futures, json, os, urllib.request, urllib.error, urllib.parse, uuid
base = os.environ.get('CHATQ_BASE_URL', 'http://127.0.0.1:13001')
credentials = json.load(open('/opt/chatq/admin-credentials.json'))
secret = 'fixture-secret-never-return'

def call(path, data=None, headers=None, query=False, expected=200):
    url = base + path
    if query and data is not None: url += '?input=' + urllib.parse.quote(json.dumps(data))
    raw = None if query or data is None else json.dumps(data).encode()
    req = urllib.request.Request(url, data=raw, headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=130) as response: status, content = response.status, response.read()
    except urllib.error.HTTPError as error: status, content = error.code, error.read()
    body = json.loads(content)
    assert status == expected, (path, status, str(body)[:500])
    return body.get('result', {}).get('data', body)

token = call('/trpc/admin.login', {k: credentials[k] for k in ['username', 'password']})['token']
admin = {'Authorization': 'Bearer ' + token}
app = call('/trpc/app.create', {'name': 'AI integration fixture', 'bundleId': 'test.ai.' + uuid.uuid4().hex, 'configName': 'chatq', 'settings': {'enableAI': False, 'enableSubscription': False, 'freeReplyLimitPerDay': 5, 'freeCandidateCount': 3}}, admin)['app']
app_id = app['id']
settings = {'appId': app_id, 'enabled': True, 'apiKey': secret, 'baseUrl': 'http://chatq-ai-fixture:9100/v1', 'model': 'fixture-v1', 'timeout': 5000, 'tokenParameter': 'max_tokens', 'sendTemperature': True}
client = {'x-api-key': app['apiKey'], 'x-device-id': 'ai-test-device'}
try:
    for path, data, query in [('config', {'appId': app_id}, True), ('save', settings, False), ('test', settings, False), ('reply', {'appId': app_id, 'text': '你好'}, False)]:
        call('/trpc/aiAdmin.' + path, data, query=query, expected=401)
    print('PASS admin authentication on all AI config/test/reply endpoints')
    call('/trpc/aiAdmin.save', {**settings, 'apiKey': ''}, admin, expected=400)
    result = call('/trpc/aiAdmin.test', settings, admin)
    assert result['reply'].startswith('协议测试回复')
    assert not call('/trpc/aiAdmin.config', {'appId': app_id}, admin, query=True)['hasApiKey']
    print('PASS draft connection test sends a completion without persisting credentials')
    result = call('/trpc/aiAdmin.save', settings, admin)
    assert result['hasApiKey'] and secret not in json.dumps(result)
    for path, data in [('/trpc/aiAdmin.config', {'appId': app_id}), ('/trpc/settings.app', {'appId': app_id}), ('/trpc/app.detail', {'id': app_id}), ('/trpc/app.list', None)]:
        assert secret not in json.dumps(call(path, data, admin, query=True))
    print('PASS keys omitted from all config/application read responses')
    call('/trpc/aiAdmin.save', {**settings, 'apiKey': '', 'model': 'fixture-v2'}, admin)
    result = call('/trpc/aiAdmin.reply', {'appId': app_id, 'text': '今天工作好累', 'context': '朋友', 'style': 'friendly', 'candidateCount': 3}, admin)
    assert len(result['replies']) == 3 and 'fixture-v2' in result['replies'][0]['content']
    print('PASS blank key preservation, saved model refresh, and three real protocol candidates')
    call('/api/user/register', {'deviceId': client['x-device-id']}, client)
    result = call('/api/aikeyboard/reply', {'prompt': '今天工作好累', 'candidateCount': 3}, client)
    assert result['success'] and len(result['data']['candidates']) == 3
    call('/api/aikeyboard/reply', {'prompt': 'test'}, expected=401)
    print('PASS authenticated mobile REST reply through actual provider HTTP')
    for model in ['error401', 'error429', 'invalid']:
        call('/trpc/aiAdmin.save', {**settings, 'apiKey': '', 'model': model}, admin)
        result = call('/trpc/aiAdmin.reply', {'appId': app_id, 'text': 'test'}, admin, expected=502)
        assert secret not in json.dumps(result)
        result = call('/api/aikeyboard/reply', {'prompt': '失败不计次'}, client, expected=502)
        assert not result['success'] and secret not in json.dumps(result)
    print('PASS upstream auth, rate limit, malformed response errors; no mock fallback or key exposure')
    call('/trpc/aiAdmin.save', {**settings, 'apiKey': '', 'model': 'fixture-v3'}, admin)
    # Existing generic settings edits must preserve the redacted provider's key.
    safe = call('/trpc/settings.app', {'appId': app_id}, admin, query=True)['settings']
    call('/trpc/settings.updateApp', {'appId': app_id, 'aiProviders': safe['aiProviders'], 'freeReplyLimitPerDay': 3}, admin)
    result = call('/api/ai/generate', {'text': '普通回复', 'candidateCount': 1}, client)
    assert result['data']['usage']['today'] == 2
    def concurrent_reply(i):
        req = urllib.request.Request(base + '/api/aikeyboard/reply', data=json.dumps({'prompt': f'并发 {i}', 'candidateCount': 1}).encode(), headers={'Content-Type': 'application/json', **client})
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return r.status
        except urllib.error.HTTPError as e: return e.code
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: results = list(pool.map(concurrent_reply, range(3)))
    assert sorted(results) == [200, 403, 403], results
    print('PASS quota shared by both routes, failed calls not counted, concurrent limit enforced')
    call('/trpc/aiAdmin.save', {**settings, 'apiKey': '', 'enabled': False}, admin)
    call('/trpc/aiAdmin.reply', {'appId': app_id, 'text': '今天工作好累'}, admin, expected=403)
    call('/api/aikeyboard/reply', {'prompt': '今天工作好累'}, client, expected=403)
    print('PASS disabling AI takes effect immediately, including previously cached prompts')
    call('/trpc/aiAdmin.save', {**settings, 'apiKey': '', 'baseUrl': 'https://another-vendor.example/v1'}, admin, expected=400)
    print('PASS changed endpoint requires matching credential re-entry')
finally:
    call('/trpc/app.delete', {'id': app_id}, admin)
    print('Cleaned up disposable app and user')
