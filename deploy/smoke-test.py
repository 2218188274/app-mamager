#!/usr/bin/env python3
"""Check the deployed admin authentication and core APIs without printing secrets."""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

base = os.environ.get('CHATQ_BASE_URL', 'http://127.0.0.1:13000').rstrip('/')
credentials = json.loads(Path('/opt/chatq/admin-credentials.json').read_text())

def request(path, payload=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, data=None if payload is None else json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

status, _ = request('/health')
assert status == 200, ('health', status)
status, login = request('/trpc/admin.login', {'username': credentials['username'], 'password': credentials['password']})
assert status == 200, ('login', status)
data = login['result']['data']
token = data['token']
admin_id = data['admin']['id']
assert request('/trpc/admin.me', token=token)[0] == 200
assert request('/trpc/admin.me')[0] == 401
assert request('/trpc/admin.me', token='admin:' + admin_id)[0] == 401
assert request('/trpc/admin.me', token=token[:-5] + 'xxxxx')[0] == 401
assert request('/trpc/admin.login', {'username': credentials['username'], 'password': 'not-the-password'})[0] == 401
assert request('/trpc/admin.init', {'username': 'unwanted-admin', 'email': 'test@example.invalid', 'password': 'not-the-password'})[0] == 403
status, apps = request('/trpc/app.list', token=token)
assert status == 200, ('apps', status)
print('PASS: health, administrator login, signed JWT, unsigned/tampered token rejection, bad-password rejection, initialization lock, application list')
print('Application count:', len(apps['result']['data']))
for procedure in ('chatqManage.listDimensions', 'chatqManage.listScenes', 'chatqManage.listRelations', 'chatqManage.listPersonaPackages'):
    status, body = request('/trpc/' + procedure, token=token)
    assert status == 200 and len(body['result']['data']) > 0, (procedure, status)
    print('PASS:', procedure, 'rows:', len(body['result']['data']))
app = next(item for item in apps['result']['data'] if item['id'] == credentials['appId'])
req = urllib.request.Request(base + '/trpc/chatq.configData.listScenes', headers={'x-api-key': app['apiKey']})
with urllib.request.urlopen(req, timeout=15) as response:
    body = json.load(response)
    assert response.status == 200 and len(body['result']['data']) > 0
print('PASS: dynamically registered ChatQ client route')
