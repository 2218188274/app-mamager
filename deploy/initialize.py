#!/usr/bin/env python3
"""Initialize this deployment locally before adding its public Caddy route."""
import json
import secrets
import urllib.request
from pathlib import Path

base = 'http://127.0.0.1:13000'
credentials_path = Path('/opt/chatq/admin-credentials.json')
if credentials_path.exists():
    raise SystemExit('Administrator credential file already exists; refusing to overwrite it.')
credentials = {'username': 'admin', 'password': 'ChatQ-' + secrets.token_urlsafe(18)}
credentials_path.write_text(json.dumps(credentials, indent=2) + '\n')
credentials_path.chmod(0o600)

def post(procedure, payload, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + '/trpc/' + procedure, data=json.dumps(payload).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)['result']['data']

admin = post('admin.init', {**credentials, 'email': 'admin@chatq.local'})
app = post('app.create', {
    'name': '聊商 ChatQ',
    'bundleId': 'com.jaxon.app.chatq',
    'configName': 'chatq',
    'configTemplate': 'chatq',
    'slug': 'chatq',
    'description': '二次开发环境；真实 AI、支付与手机键盘尚待接入。',
    'settings': {
        'enableAI': False,
        'enableSubscription': False,
        'freeReplyLimitPerDay': 10,
        'freeCandidateCount': 1,
        'proCandidateCount': 3,
        'defaultAIProvider': 'mock',
        'aiProviders': [{'type': 'mock', 'enabled': True, 'priority': 100}],
    },
}, admin['token'])
credentials['appId'] = app['app']['id']
credentials_path.write_text(json.dumps(credentials, indent=2) + '\n')
print('Administrator initialized and ChatQ development app created. Credentials saved privately.')
