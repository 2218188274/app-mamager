import Foundation
#if canImport(Security)
import Security
#endif

enum AIProblem: LocalizedError, Equatable {
  case message(String), cancelled
  var errorDescription: String? {
    switch self { case .message(let text): return text; case .cancelled: return "配置或输入已变化，请重新生成" }
  }
}
enum AIJSON {
  static func object(_ text: String, limit: Int = 1_600_000) throws -> [String: Any] {
    guard text.utf16.count <= limit, let data = text.data(using: .utf8),
          let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AIProblem.message("数据格式异常") }
    return value
  }
  static func string(_ value: Any) throws -> String {
    guard let text = String(data: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), encoding: .utf8) else { throw AIProblem.message("数据格式异常") }
    return text
  }
  static func count(_ value: Any?) throws -> Int {
    guard let number = value as? NSNumber, String(cString: number.objCType) != "c",
          number.doubleValue.rounded() == number.doubleValue, (1...10).contains(number.intValue) else { throw AIProblem.message("回复条数需为 1–10") }
    return number.intValue
  }
}
struct AIConfiguration: Codable, Equatable {
  let baseUrl: String, model: String, apiKey: String
  let stream: Bool
  init(_ input: [String: Any]) throws {
    let trim: (String) -> String = { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    var base = trim(input["baseUrl"] as? String ?? "")
    while base.hasSuffix("/") { base.removeLast() }
    guard (8...2048).contains(base.utf16.count), let url = URLComponents(string: base),
          let host = url.host, !host.isEmpty, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
          url.port == nil || (1...65535).contains(url.port!),
          url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(host)),
          !base.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }) else {
      throw AIProblem.message("API 地址需使用 HTTPS，不能包含账号、查询参数或片段")
    }
    guard !base.hasSuffix("/chat/completions") else { throw AIProblem.message("请填写基础地址，例如 https://供应商域名/v1，不含 /chat/completions") }
    let key = trim(input["apiKey"] as? String ?? ""), name = trim(input["model"] as? String ?? "")
    guard (1...8192).contains(key.utf16.count), key.unicodeScalars.allSatisfy({ (33...126).contains($0.value) }) else { throw AIProblem.message("请填写有效 API 密钥，不要包含空格或换行") }
    guard (1...200).contains(name.utf16.count), !name.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }) else { throw AIProblem.message("请填写供应商提供的模型名称") }
    baseUrl = base; model = name; apiKey = key; stream = input["stream"] as? Bool ?? true
  }
  var publicFields: [String: Any] { ["baseUrl": baseUrl, "model": model, "stream": stream] }
}
struct AIProfile: Codable { let id: String; var name: String; var config: AIConfiguration }
struct AIState: Codable {
  var revision = UUID().uuidString
  var activeId = ""
  var profiles: [AIProfile] = []
  var active: AIProfile? { profiles.first { $0.id == activeId } }
}
protocol AICredentialStore { func read() throws -> Data?; func write(_ value: Data) throws }

/// Only metadata crosses the JS bridge. Credentials never enter shared defaults, backups or logs.
final class AIVault {
  private static let lock = NSRecursiveLock()
  private let store: AICredentialStore
  init(store: AICredentialStore) { self.store = store }
  private func locked<T>(_ work: () throws -> T) rethrows -> T { Self.lock.lock(); defer { Self.lock.unlock() }; return try work() }
  private func state() throws -> AIState {
    guard let bytes = try store.read() else { return AIState(revision: "") }
    do {
      let s = try JSONDecoder().decode(AIState.self, from: bytes)
      guard bytes.count <= 150_000, s.profiles.count <= 8, Set(s.profiles.map { $0.id }).count == s.profiles.count,
            s.profiles.isEmpty ? s.activeId.isEmpty : s.active != nil else { throw AIProblem.message("invalid") }
      for p in s.profiles {
        guard !p.id.isEmpty, p.id.utf16.count <= 80 else { throw AIProblem.message("invalid") }
        try validateName(p.name)
        _ = try AIConfiguration(p.config.publicFields.merging(["apiKey": p.config.apiKey]) { _, new in new })
      }
      return s
    } catch { throw AIProblem.message("API 配置无法读取，请清除后重新配置") }
  }
  private func validateName(_ name: String) throws {
    guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.utf16.count <= 30,
          !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { throw AIProblem.message("配置名称需为1–30字") }
  }
  private func persist(_ value: AIState) throws {
    var next = value; next.revision = UUID().uuidString
    try store.write(JSONEncoder().encode(next))
  }
  func snapshot() throws -> (AIConfiguration?, String) { try locked { let s = try state(); return (s.active?.config, s.revision) } }
  func revision() throws -> String { try snapshot().1 }
  func metadata() throws -> String { try locked {
    let s = try state(), a = s.active
    return try AIJSON.string(["baseUrl": a?.config.baseUrl ?? "", "model": a?.config.model ?? "", "stream": a?.config.stream ?? true,
      "hasKey": a != nil, "profileId": s.activeId, "profileName": a?.name ?? "",
      "profiles": s.profiles.map { ["id": $0.id, "name": $0.name, "baseUrl": $0.config.baseUrl, "model": $0.config.model] }])
  } }
  private func resolve(_ input: [String: Any], state: AIState) throws -> AIConfiguration {
    var input = input
    let id = input["profileId"] as? String ?? state.activeId
    if (input["apiKey"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      guard let previous = state.profiles.first(where: { $0.id == id }) else { throw AIProblem.message("请填写此配置的 API 密钥") }
      var base = (input["baseUrl"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      while base.hasSuffix("/") { base.removeLast() }
      guard base == previous.config.baseUrl else { throw AIProblem.message("更换 API 地址时请重新输入密钥") }
      input["apiKey"] = previous.config.apiKey
    }
    return try AIConfiguration(input)
  }
  func resolveForModels(_ input: [String: Any]) throws -> AIConfiguration { try locked {
    var input = input; input["model"] = "model-list-only"
    return try resolve(input, state: state())
  } }
  func save(_ raw: String) throws -> String { try locked {
    let input = try AIJSON.object(raw, limit: 12000); var s = try state()
    let id = input["profileId"] as? String ?? s.activeId, previous = s.profiles.first { $0.id == id }
    guard id.isEmpty || previous != nil else { throw AIProblem.message("配置已变化，请重新打开") }
    let config = try resolve(input, state: s)
    let name = (input["profileName"] as? String ?? previous?.name ?? "默认配置").trimmingCharacters(in: .whitespacesAndNewlines)
    try validateName(name)
    if let i = s.profiles.firstIndex(where: { $0.id == id }) { s.profiles[i].config = config; s.profiles[i].name = name; s.activeId = id }
    else {
      guard s.profiles.count < 8 else { throw AIProblem.message("最多保存8套配置，请先删除不再使用的配置") }
      let profile = AIProfile(id: UUID().uuidString, name: name, config: config); s.profiles.append(profile); s.activeId = profile.id
    }
    try persist(s); return try metadata()
  } }
  func select(_ id: String) throws -> String { try locked {
    var s = try state(); guard s.profiles.contains(where: { $0.id == id }) else { throw AIProblem.message("配置不存在，请重新读取") }
    s.activeId = id; try persist(s); return try metadata()
  } }
  func remove(_ id: String) throws -> String { try locked {
    var s = try state(); guard s.profiles.contains(where: { $0.id == id }) else { throw AIProblem.message("配置不存在，请重新读取") }
    s.profiles.removeAll { $0.id == id }; if s.activeId == id { s.activeId = s.profiles.first?.id ?? "" }
    try persist(s); return try metadata()
  } }
  func clear() throws { try locked { try persist(AIState()) } }
}
#if canImport(Security)
final class AIKeychainStore: AICredentialStore {
  private func query() throws -> [String: Any] {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ChatQKeychainGroup") as? String,
          !group.isEmpty, !group.contains("$(") else { throw AIProblem.message("请为主应用和键盘配置相同的 Keychain 共享组") }
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "chatq.personal-ai.v1",
      kSecAttrAccount as String: "profiles", kSecAttrAccessGroup as String: group, kSecAttrSynchronizable as String: false]
  }
  func read() throws -> Data? {
    var q = try query(); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?; let code = SecItemCopyMatching(q as CFDictionary, &result)
    if code == errSecItemNotFound { return nil }
    guard code == errSecSuccess, let data = result as? Data else { throw AIProblem.message("无法读取本机 API 密钥，请解锁设备并检查签名配置") }
    return data
  }
  func write(_ value: Data) throws {
    let q = try query()
    let attributes: [String: Any] = [kSecValueData as String: value, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    var code = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
    if code == errSecItemNotFound { code = SecItemAdd(q.merging(attributes) { _, new in new } as CFDictionary, nil) }
    guard code == errSecSuccess else { throw AIProblem.message("API 配置未保存，请检查设备解锁状态和 Keychain 共享签名") }
  }
}
#endif
