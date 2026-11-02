import Foundation

struct PersonaPreferences {
  private let injected: UserDefaults?
  init(defaults: UserDefaults? = nil) { injected = defaults }
  private var preferences: UserDefaults? {
    if let injected = injected { return injected }
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ChatQAppGroup") as? String else { return nil }
    return UserDefaults(suiteName: group)
  }
  private func object(_ key: String) -> [String: Any] {
    guard let raw = preferences?.string(forKey: key), let data = raw.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return value
  }
  private var data: [String: Any] { let value = object("personalization"); return value["version"] as? Int == 1 ? value : [:] }
  func choices(_ key: String) -> [(id: String, name: String)] {
    return ((data[key] as? [[String: Any]]) ?? []).prefix(100).compactMap { value in
      guard let id = value["id"] as? String, let name = value["name"] as? String, !id.isEmpty, !name.isEmpty else { return nil }
      return (String(id.prefix(80)), String(name.prefix(30)))
    }
  }
  func selected(_ key: String, choices: [(id: String, name: String)]) -> String {
    let id = object("personaSelection")[key] as? String ?? ""
    return choices.contains { $0.id == id } ? id : (key == "cardId" ? choices.first?.id ?? "" : "")
  }
  func select(_ key: String, id: String) -> Bool {
    guard let preferences = preferences else { return false }
    var selected = object("personaSelection"); selected[key] = id
    guard let data = try? JSONSerialization.data(withJSONObject: selected), let raw = String(data: data, encoding: .utf8) else { return false }
    preferences.set(raw, forKey: "personaSelection"); return true
  }
  func requestFields() -> [String: Any] {
    var fields: [String: Any] = [:]; let selection = object("personaSelection")
    for (key, listKey) in [("sceneId", "scenes"), ("relationId", "relations")] {
      if let id = selection[key] as? String, id.count <= 50, choices(listKey).contains(where: { $0.id == id }) { fields[key] = id }
    }
    let id = selected("cardId", choices: choices("cards"))
    let card = (data["cards"] as? [[String: Any]])?.first(where: { $0["id"] as? String == id })
    let length: String
    switch card?["length"] as? String { case "normal": length = "回复长短适中。"; case "detailed": length = "根据消息适当展开，避免重复。"; default: length = card == nil ? "" : "回复简短，通常一到两句话。" }
    let instructions = String(((card?["instructions"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
    let warmths = ["reserved": "表达克制，保持礼貌边界，避免过度亲昵。", "warm": "表达热情有温度，但尊重边界，不预设亲密关系。"]
    let goals = ["comfort": "先理解感受，再温柔回应，避免说教。", "decline": "礼貌明确地拒绝，保持边界，不编造理由。", "invite": "自然提出邀请，给对方选择余地，不施加压力。", "continue": "接住当前话题，用一个容易回答的问题延续聊天。", "thanks": "具体真诚地表达感谢，不夸张奉承。", "apology": "真诚说明歉意，承担已有事实中的责任，不凭空承诺。"]
    fields["customPrompt"] = [instructions, length, warmths[selection["warmth"] as? String ?? ""] ?? "", goals[selection["goalId"] as? String ?? ""] ?? ""].filter { !$0.isEmpty }.joined(separator: "\n")
    let weights = ((card?["tagWeights"] as? [String: Double]) ?? [:]).filter { $0.key.range(of: "^[\\w-]{1,50}$", options: .regularExpression) != nil && $0.value.isFinite && (0.1...0.9).contains($0.value) }
    if !weights.isEmpty { fields["personaTagWeights"] = Dictionary(uniqueKeysWithValues: weights.prefix(20).map { ($0.key, $0.value) }) }
    return fields
  }
}
