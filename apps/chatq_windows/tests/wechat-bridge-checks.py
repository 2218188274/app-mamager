"""Only synthetic Python objects. Never imports wxautox4 or creates a process/window."""
from pathlib import Path
import importlib.util
import json
from types import SimpleNamespace

source = Path(__file__).resolve().parents[1] / 'Core/WechatBridge.py'
spec = importlib.util.spec_from_file_location('chatq_synthetic_wechat_bridge', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = 0


def check(value):
    global checks
    assert value
    checks += 1


class Chat:
    def __init__(self):
        self.name, self.kind, self.calls, self.draft = '合成好友', 'friend', [], ''
        self.editbox = SimpleNamespace(ControlTypeName='EditControl', IsPassword=False, IsOffscreen=False, IsEnabled=True, GetValuePattern=lambda: SimpleNamespace(Value=self.draft))

    def ChatInfo(self):
        return {'chat_name': self.name, 'chat_type': self.kind}

    def SendMsg(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(success=True)


frames = []
chat = Chat()
bridge = module.Bridge('合成账号', ['合成好友'], frames.append)
message = SimpleNamespace(id='synthetic-ui-id', type='text', attr='friend', content='合成新消息')
bridge.receive('合成好友', message, chat)
check(not frames)  # setup/baseline discarded
bridge.accepting = True
bridge.receive('不允许的好友', message, chat)
check(not frames)
chat.kind = 'group'
bridge.receive('合成好友', message, chat)
check(frames[-1]['code'] == 'CHAT_BINDING_CHANGED' and not bridge.accepting)
bridge.accepting = True
frames.clear()
chat.kind = 'friend'
bridge.receive('合成好友', message, chat)
check(frames[-1]['kind'] == 'message' and not frames[-1]['self'])
identity = frames[-1]['id']
command = {'echo': 'synthetic-echo', 'peer': '合成好友', 'messageId': identity, 'text': '合成回复'}
bridge.send(command | {'messageId': 'stale'})
check(not chat.calls and frames[-1]['code'] == 'STALE_TARGET')
chat.draft = '本人还没发出的草稿'
bridge.send(command)
check(not chat.calls and frames[-1]['code'] == 'DRAFT_OR_UNSUPPORTED_CLIENT')
chat.draft = ''
chat.name = '另一会话'
bridge.send(command)
check(not chat.calls)
chat.name = '合成好友'
old_edit = chat.editbox
chat.editbox = None
bridge.send(command)
check(not chat.calls)
chat.editbox = old_edit
chat.editbox.IsPassword = True
bridge.send(command)
check(not chat.calls)
chat.editbox.IsPassword = False
bridge.send(command)
check(chat.calls == [{'msg': '合成回复', 'clear': False}] and frames[-1]['ok'])
bridge.send(command)
check(len(chat.calls) == 1 and frames[-1]['code'] == 'STALE_TARGET')
message.id = 'synthetic-ui-2'
message.attr = 'self'
bridge.receive('合成好友', message, chat)
check(frames[-1]['self'])
message.attr = 'friend'
message.type = 'image'
count = len(frames)
bridge.receive('合成好友', message, chat)
check(len(frames) == count)
message.type = 'text'
message.id = 'synthetic-ui-3'
bridge.receive('合成好友', message, chat)
chat.SendMsg = lambda **kwargs: SimpleNamespace()  # truthy object is not an acknowledgement
bridge.send(command | {'messageId': frames[-1]['id']})
check(not frames[-1]['ok'] and frames[-1]['code'] == 'UNCONFIRMED')

# Documented response boolean semantics, without importing the real dependency.
class Response:
    def __init__(self, success): self.value = success
    def __bool__(self): return self.value

for result, expected in [(Response(True), True), (Response(False), False), ({'success': True}, False), (SimpleNamespace(), False)]:
    test_frames = []
    test_chat = Chat()
    test_chat.SendMsg = lambda result=result, **kw: result
    test_bridge = module.Bridge('合成账号', ['合成好友'], test_frames.append, Response)
    test_bridge.accepting = True
    test_bridge.receive('合成好友', message, test_chat)
    test_bridge.send(command | {'messageId': test_frames[-1]['id']})
    check(test_frames[-1]['ok'] is expected)

parameters = SimpleNamespace(ENABLE_FILE_LOGGER=True)
created = []
def factory(**kwargs):
    created.append((parameters.ENABLE_FILE_LOGGER, kwargs))
    return SimpleNamespace(nickname='合成账号')
check(module.initialize_client(factory, parameters).nickname == '合成账号' and created == [(False, {'resize': False, 'debug': False})])
for parameters in (SimpleNamespace(),):
    try:
        module.initialize_client(factory, parameters)
        check(False)
    except module.SetupFailure as error:
        check(error.code == 'LOGGING_CONTROL_UNAVAILABLE' and len(created) == 1)
def broken_factory(**kwargs): raise RuntimeError('synthetic-private-license-error-not-exported')
try:
    module.initialize_client(broken_factory, SimpleNamespace(ENABLE_FILE_LOGGER=True))
    check(False)
except module.SetupFailure as error:
    check(error.code == 'INITIALIZATION_FAILED' and 'private' not in str(error))

test_bridge = module.Bridge('合成账号', ['合成好友'], lambda event: None)
test_bridge.accepting = True
test_bridge.receive('合成好友', message, Chat())
changed = Chat(); changed.name = '另一会话'
test_bridge.receive('合成好友', message, changed)
check(not test_bridge.accepting and not test_bridge.latest)
print(json.dumps({'wechatAdapterSyntheticChecks': checks, 'wxautoImported': False, 'realAppsOpened': False, 'realMessagesSent': 0}))
