"""Small loopback-only WebSocket fixture; no QQ component/account involved."""
import base64
import hashlib
import http.server
import json
import struct
import threading
import time


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def frame(self, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        header = bytes([0x81, len(data)]) if len(data) < 126 else bytes([0x81, 126]) + struct.pack('!H', len(data))
        self.wfile.write(header + data)
        self.wfile.flush()

    def receive(self):
        header = self.rfile.read(2)
        if len(header) != 2 or header[0] & 15 == 8:
            return None
        assert header[0] & 15 == 1 and header[1] & 128
        length = header[1] & 127
        if length == 126:
            length = struct.unpack('!H', self.rfile.read(2))[0]
        assert length <= 8192
        mask = self.rfile.read(4)
        data = self.rfile.read(length)
        return json.loads(bytes(x ^ mask[i % 4] for i, x in enumerate(data)))

    def do_GET(self):
        try:
            assert self.path == '/' and self.headers['Upgrade'].lower() == 'websocket'
            mode = self.headers['Authorization']
            assert mode in ('Bearer synthetic-bridge-token', 'Bearer synthetic-wrong-account')
            key = base64.b64encode(hashlib.sha1((self.headers['Sec-WebSocket-Key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            self.send_response(101)
            self.send_header('Upgrade', 'websocket')
            self.send_header('Connection', 'Upgrade')
            self.send_header('Sec-WebSocket-Accept', key)
            self.end_headers()
            self.connection.settimeout(10)
            while True:
                request = self.receive()
                if request is None:
                    break
                if request['action'] == 'get_login_info':
                    # An unrelated echo must not satisfy the pending login request.
                    self.frame({'status': 'ok', 'retcode': 0, 'data': {'user_id': 99999}, 'echo': 'unrelated'})
                    self.frame({'status': 'ok', 'retcode': 0, 'data': {'user_id': 99999 if 'wrong-account' in mode else 10001}, 'echo': request['echo']})
                else:
                    assert request['action'] == 'send_private_msg'
                    assert request['params']['user_id'] == 20001
                    assert request['params']['message'] == [{'type': 'text', 'data': {'text': '合成本机发送'}}]
                    assert request['params']['auto_escape'] is True
                    for peer in [99999, 20001]:
                        self.frame({'time': int(time.time()), 'self_id': 10001, 'post_type': 'message', 'message_type': 'private', 'sub_type': 'friend', 'message_id': peer, 'user_id': peer, 'message': [{'type': 'text', 'data': {'text': '合成本机接收'}}]})
                    self.frame({'status': 'ok', 'retcode': 0, 'data': {'message_id': 123456}, 'echo': request['echo']})
        except (ConnectionError, OSError):
            pass
        finally:
            self.close_connection = True

    def log_message(self, *_):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
