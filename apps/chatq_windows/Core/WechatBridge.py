"""Independent stdio adapter. wxautox4 is user-supplied, never bundled.
Tests import helpers with fakes; they never connect to WeChat or use clipboard.
"""
import hashlib
import json
import sys
import threading
import time


def chat_matches(chat, peer):
    info = chat.ChatInfo()
    return isinstance(info, dict) and info.get('chat_type') == 'friend' and info.get('chat_name') == peer


def empty_draft(chat):
    edit = getattr(chat, 'editbox', None)
    if edit is None or getattr(edit, 'ControlTypeName', '') not in ('EditControl', 'DocumentControl'):
        return False
    if getattr(edit, 'IsPassword', True) or getattr(edit, 'IsOffscreen', True) or not getattr(edit, 'IsEnabled', False):
        return False
    try:
        value = edit.GetValuePattern().Value
    except Exception:
        try:
            value = edit.GetTextPattern().DocumentRange.GetText(2048)
        except Exception:
            return False
    return isinstance(value, str) and value == ''


class Bridge:
    def __init__(self, account, peers, emit):
        self.account, self.peers, self.emit = account, set(peers), emit
        self.latest, self.chats = {}, {}
        self.lock = threading.RLock()
        self.accepting = False

    def receive(self, peer, msg, chat):
        try:
            with self.lock:
                if not self.accepting or peer not in self.peers or not chat_matches(chat, peer):
                    return
                if msg.type != 'text' or msg.attr not in ('friend', 'self'):
                    return
                text, ui_id = msg.content, str(msg.id)
                if not isinstance(text, str) or not 1 <= len(text) <= 2000 or not 1 <= len(ui_id) <= 1000:
                    return
                identity = hashlib.sha256(json.dumps([peer, ui_id, text], ensure_ascii=False).encode()).hexdigest()
                self.latest[peer], self.chats[peer] = identity, chat
                self.emit({'kind': 'message', 'peer': peer, 'id': identity, 'text': text, 'self': msg.attr == 'self', 'time': int(time.time())})
        except Exception:
            self.emit({'kind': 'fatal', 'code': 'CHAT_BINDING_CHANGED'})

    def send(self, command):
        echo = command.get('echo', '')
        with self.lock:
            peer, text = command.get('peer'), command.get('text')
            chat = self.chats.get(peer)
            if not self.accepting or peer not in self.peers or chat is None or self.latest.get(peer) != command.get('messageId'):
                self.emit({'kind': 'reply', 'echo': echo, 'ok': False, 'code': 'STALE_TARGET'})
                return
            if not isinstance(text, str) or not 1 <= len(text.strip()) <= 1000 or not chat_matches(chat, peer) or not empty_draft(chat):
                self.emit({'kind': 'reply', 'echo': echo, 'ok': False, 'code': 'DRAFT_OR_UNSUPPORTED_CLIENT'})
                return
            del self.latest[peer]  # Reserve before side effect; never retry.
        # Do not hold our callback lock while invoking the library's UI lock.
        try:
            result = chat.SendMsg(msg=text, clear=False)
            confirmed = result is True or getattr(result, 'success', None) is True
            self.emit({'kind': 'reply', 'echo': echo, 'ok': confirmed, 'receipt': echo if confirmed else '', 'code': 'SUBMITTED' if confirmed else 'UNCONFIRMED'})
        except Exception:
            self.emit({'kind': 'reply', 'echo': echo, 'ok': False, 'code': 'UNCONFIRMED'})


def main():
    wire = sys.stdout
    sys.stdout = sys.stderr
    lock = threading.Lock()

    def emit(record):
        with lock:
            wire.write('CQH:' + json.dumps(record, ensure_ascii=True, separators=(',', ':')) + '\n')
            wire.flush()

    wx = None
    try:
        config = json.loads(sys.stdin.readline(16385))
        account, peers = config['account'], config['peers']
        if not isinstance(account, str) or not 1 <= len(account) <= 100 or not isinstance(peers, list) or not 1 <= len(peers) <= 20 or len(set(peers)) != len(peers) or any(not isinstance(p, str) or not 1 <= len(p) <= 100 for p in peers):
            raise ValueError('invalid configuration')
        from wxautox4 import WeChat
        wx = WeChat(resize=False, debug=False)
        if getattr(wx, 'nickname', None) != account:
            emit({'kind': 'fatal', 'code': 'ACCOUNT_MISMATCH_OR_UNSUPPORTED'})
            return
        bridge = Bridge(account, peers, emit)
        for peer in peers:
            chat = wx.AddListenChat(nickname=peer, callback=lambda msg, chat, peer=peer: bridge.receive(peer, msg, chat))
            if not chat_matches(chat, peer):
                emit({'kind': 'fatal', 'code': 'CHAT_BINDING_CHANGED'})
                return
        time.sleep(2)  # Discard listener setup/baseline callbacks; no history API.
        bridge.accepting = True
        emit({'kind': 'ready', 'account': account})
        while True:
            line = sys.stdin.readline(16385)
            if not line:
                break
            if len(line) > 16384 or not line.endswith('\n'):
                raise ValueError('oversized command')
            command = json.loads(line)
            if command.get('kind') == 'stop':
                break
            if command.get('kind') != 'send':
                raise ValueError('unsupported command')
            bridge.send(command)
    except Exception:
        emit({'kind': 'fatal', 'code': 'DEPENDENCY_OR_COMPATIBILITY'})
    finally:
        if wx is not None:
            try:
                wx.StopListening(remove=False)
            except Exception:
                pass


if __name__ == '__main__':
    main()
