import Foundation
import Security
import CryptoKit
import CommonCrypto

enum ChatQSyncVault {
  private static let service = "com.jaxon.app.chatq.sync.v1"
  private static func failure(_ text: String) -> NSError { NSError(domain: "ChatQSync", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
  private static func parts(_ code: String) throws -> [String] {
    let p = code.components(separatedBy: ".")
    guard p.count == 3, p[0] == "CQ1", p[1].range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil, p[2].range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw failure("同步码格式不正确") }; return p
  }
  private static func random(_ count: Int) throws -> Data { var bytes = [UInt8](repeating: 0, count: count); guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw failure("安全随机数不可用") }; return Data(bytes) }
  static func digest(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }
  static func create() throws -> String { "CQ1." + (try random(16)).map { String(format: "%02x", $0) }.joined() + "." + (try random(32)).map { String(format: "%02x", $0) }.joined() }
  static func credentials(_ code: String) throws -> String { let p = try parts(code); return String(data: try JSONSerialization.data(withJSONObject: ["spaceId": p[1], "auth": digest("chatq-sync-auth-v1:" + p[2])], options: [.sortedKeys]), encoding: .utf8)! }
  private static func query(_ scope: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: digest(scope)] }
  static func save(_ code: String, scope: String) throws {
    _ = try parts(code); let q = query(scope), data = Data(code.utf8)
    let update = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if update == errSecItemNotFound { var item = q; item[kSecValueData as String] = data; item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly; guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw failure("同步码保存失败") } }
    else if update != errSecSuccess { throw failure("同步码保存失败") }
  }
  static func load(_ scope: String) throws -> String? { var q = query(scope); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne; var value: CFTypeRef?; let status = SecItemCopyMatching(q as CFDictionary, &value); if status == errSecItemNotFound { return nil }; guard status == errSecSuccess, let data = value as? Data, let code = String(data: data, encoding: .utf8) else { throw failure("本机同步密钥无法读取，请重新连接同步空间") }; _ = try parts(code); return code }
  static func forget() throws { let status = SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary); guard status == errSecSuccess || status == errSecItemNotFound else { throw failure("同步码移除失败") } }
  private static func derive(_ secret: String, salt: Data) throws -> SymmetricKey {
    let password = Array(secret.utf8); var output = [UInt8](repeating: 0, count: 32)
    let status = password.withUnsafeBytes { p in salt.withUnsafeBytes { s in CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), p.baseAddress!.assumingMemoryBound(to: Int8.self), password.count, s.baseAddress!.assumingMemoryBound(to: UInt8.self), salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 120000, &output, 32) } }
    guard status == kCCSuccess else { throw failure("同步密钥派生失败") }; return SymmetricKey(data: Data(output))
  }
  static func encrypt(_ text: String, code: String) throws -> String {
    let secret = try parts(code)[2], data = Data(text.utf8); guard data.count <= 8 * 1024 * 1024 else { throw failure("同步数据超过 8MB，请整理会话") }
    let salt = try random(16), nonce = try AES.GCM.Nonce(data: random(12)), box = try AES.GCM.seal(data, using: derive(secret, salt: salt), nonce: nonce, authenticating: Data("chatq-backup-v1".utf8))
    let envelope: [String: Any] = ["format": "chatq-encrypted-backup", "version": 1, "salt": salt.base64EncodedString(), "iv": Data(nonce).base64EncodedString(), "data": (box.ciphertext + box.tag).base64EncodedString()]
    return String(data: try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys]), encoding: .utf8)!
  }
  static func decrypt(_ text: String, code: String) throws -> String {
    let secret = try parts(code)[2]; guard text.utf8.count <= 12 * 1024 * 1024, let bytes = text.data(using: .utf8), let e = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], e["format"] as? String == "chatq-encrypted-backup", e["version"] as? Int == 1, let s = e["salt"] as? String, let salt = Data(base64Encoded: s), salt.count == 16, let n = e["iv"] as? String, let nonce = Data(base64Encoded: n), nonce.count == 12, let b = e["data"] as? String, let combined = Data(base64Encoded: b), combined.count >= 16 else { throw failure("同步数据格式异常") }
    do { let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: combined.dropLast(16), tag: combined.suffix(16)); let data = try AES.GCM.open(box, using: derive(secret, salt: salt), authenticating: Data("chatq-backup-v1".utf8)); guard data.count <= 8 * 1024 * 1024, let value = String(data: data, encoding: .utf8) else { throw failure("同步数据过大") }; return value }
    catch { throw failure("同步数据无法解密，请核对同步码；本机记录未修改") }
  }
}
