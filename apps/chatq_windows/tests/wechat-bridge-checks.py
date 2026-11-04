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
check(not frames)
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
print(json.dumps({'wechatAdapterSyntheticChecks': checks, 'wxautoImported': False, 'realAppsOpened': False, 'realMessagesSent': 0}))
