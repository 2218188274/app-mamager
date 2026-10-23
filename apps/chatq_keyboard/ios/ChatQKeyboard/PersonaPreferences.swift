import Foundation

struct PersonaPreferences {
  private var preferences: UserDefaults? {
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
    guard let card = (data["cards"] as? [[String: Any]])?.first(where: { $0["id"] as? String == id }) else { return fields }
    let length: String
    switch card["length"] as? String { case "normal": length = "回复长短适中。"; case "detailed": length = "根据消息适当展开，避免重复。"; default: length = "回复简短，通常一到两句话。" }
    let instructions = String(((card["instructions"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
    fields["customPrompt"] = [instructions, length].filter { !$0.isEmpty }.joined(separator: "\n")
    let weights = ((card["tagWeights"] as? [String: Double]) ?? [:]).filter { $0.key.range(of: "^[\\w-]{1,50}$", options: .regularExpression) != nil && $0.value.isFinite && (0.1...0.9).contains($0.value) }
    if !weights.isEmpty { fields["personaTagWeights"] = Dictionary(uniqueKeysWithValues: weights.prefix(20).map { ($0.key, $0.value) }) }
    return fields
  }
}
