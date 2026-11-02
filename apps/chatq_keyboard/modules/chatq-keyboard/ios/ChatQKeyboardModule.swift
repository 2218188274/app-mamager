import ExpoModulesCore
import UIKit

public class ChatQKeyboardModule: Module {
  private let files = ChatQFiles()
  private let aiVault = AIVault(store: AIKeychainStore())
  private lazy var aiJobs = AIJobs(vault: aiVault) { [weak self] in
    guard let prefs = try? self?.preferences(), let raw = prefs.string(forKey: "personalization") else { return [:] }
    return (try? AIJSON.object(raw, limit: 100000)) ?? [:]
  }
  private func preferences() throws -> UserDefaults {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ChatQAppGroup") as? String,
          let defaults = UserDefaults(suiteName: group) else {
      throw NSError(domain: "ChatQ", code: 1, userInfo: [NSLocalizedDescriptionKey: "请配置键盘 App Group"])
    }
    return defaults
  }
  public func definition() -> ModuleDefinition {
    Name("ChatQKeyboard")
    AsyncFunction("pickChatAttachment") { (kind: String, promise: Promise) in self.files.pick(kind, promise: promise) }
    AsyncFunction("exportChat") { (text: String, format: String, promise: Promise) in self.files.export(text, format: format, promise: promise) }
    OnDestroy { self.files.cancel(); self.aiJobs.destroy() }
    AsyncFunction("getPersonalAiConfig") { () -> String in try self.aiVault.metadata() }
    AsyncFunction("savePersonalAiConfig") { (raw: String) -> String in let result = try self.aiVault.save(raw); self.aiJobs.destroy(); return result }
    AsyncFunction("clearPersonalAiConfig") { () in try self.aiVault.clear(); self.aiJobs.destroy() }
    AsyncFunction("selectPersonalAiProfile") { (id: String) -> String in let result = try self.aiVault.select(id); self.aiJobs.destroy(); return result }
    AsyncFunction("removePersonalAiProfile") { (id: String) -> String in let result = try self.aiVault.remove(id); self.aiJobs.destroy(); return result }
    AsyncFunction("startPersonalAiRequest") { (id: String, path: String, raw: String) in try self.aiJobs.start(id, path: path, raw: raw) }
    AsyncFunction("readPersonalAiRequest") { (id: String) -> String in try self.aiJobs.read(id) }
    AsyncFunction("cancelPersonalAiRequest") { (id: String) in self.aiJobs.cancel(id) }
    AsyncFunction("releasePersonalAiRequest") { (id: String) in self.aiJobs.release(id) }
    AsyncFunction("getReplyCount") { () -> Int in let n = try self.preferences().integer(forKey: "reply_count"); return (1...10).contains(n) ? n : 1 }
    AsyncFunction("setReplyCount") { (n: Int) in guard (1...10).contains(n) else { throw AIProblem.message("回复条数需为1–10") }; try self.preferences().set(n, forKey: "reply_count") }
    AsyncFunction("loadReplyDraft") { () -> String in
      let prefs = UserDefaults.standard, enabled = prefs.object(forKey: "replyDraftEnabled") as? Bool ?? true
      let raw = prefs.string(forKey: "replyDraft"), saved = prefs.double(forKey: "replyDraftAt")
      let expired = raw != nil && (saved <= 0 || Date().timeIntervalSince1970 - saved > 7 * 86400)
      if expired || !enabled { prefs.removeObject(forKey: "replyDraft"); prefs.removeObject(forKey: "replyDraftAt") }
      var value: Any = NSNull()
      if enabled && !expired, let raw = raw { value = try AIJSON.object(raw, limit: 12000) }
      return try AIJSON.string(["enabled": enabled, "expired": expired, "value": value])
    }
    AsyncFunction("saveReplyDraft") { (raw: String) in
      let value = try AIJSON.object(raw, limit: 12000)
      guard value["schema"] as? Int == 1, ["reply", "polish"].contains(value["mode"] as? String ?? ""), value["hadScreenshot"] is Bool,
            ["friendly", "professional", "funny", "emoji"].contains(value["style"] as? String ?? "") else { throw AIProblem.message("草稿格式异常") }
      for (key, limit) in [("reply",1000),("polish",1000),("context",200),("goal",100)] {
        guard let text = value[key] as? String, text.utf16.count <= limit else { throw AIProblem.message("草稿内容超出限制") }
      }
      let prefs = UserDefaults.standard
      guard prefs.object(forKey: "replyDraftEnabled") as? Bool != false else { return }
      prefs.set(try AIJSON.string(value), forKey: "replyDraft"); prefs.set(Date().timeIntervalSince1970, forKey: "replyDraftAt")
    }
    AsyncFunction("clearReplyDraft") { () in UserDefaults.standard.removeObject(forKey: "replyDraft"); UserDefaults.standard.removeObject(forKey: "replyDraftAt") }
    AsyncFunction("setReplyDraftEnabled") { (value: Bool) in
      UserDefaults.standard.set(value, forKey: "replyDraftEnabled")
      if !value { UserDefaults.standard.removeObject(forKey: "replyDraft"); UserDefaults.standard.removeObject(forKey: "replyDraftAt") }
    }
    AsyncFunction("getInstalledVersion") { () -> [String: Any] in
      ["version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "", "versionCode": Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0") ?? 0]
    }
    AsyncFunction("createSyncCode") { () -> String in try ChatQSyncVault.create() }
    AsyncFunction("syncCredentials") { (code: String) -> String in try ChatQSyncVault.credentials(code) }
    AsyncFunction("saveSyncCode") { (code: String, scope: String) in try ChatQSyncVault.save(code, scope: scope) }
    AsyncFunction("loadSyncCode") { (scope: String) -> String? in try ChatQSyncVault.load(scope) }
    AsyncFunction("forgetSyncCode") { () in try ChatQSyncVault.forget() }
    AsyncFunction("encryptSync") { (text: String, code: String) -> String in try ChatQSyncVault.encrypt(text, code: code) }
    AsyncFunction("decryptSync") { (text: String, code: String) -> String in try ChatQSyncVault.decrypt(text, code: code) }
    AsyncFunction("syncFingerprint") { (text: String) -> String in ChatQSyncVault.digest(text) }
    AsyncFunction("getConfig") { () -> [String: String] in
      let defaults = try self.preferences()
      let id = defaults.string(forKey: "deviceId") ?? UUID().uuidString
      defaults.set(id, forKey: "deviceId")
      return ["baseUrl": defaults.string(forKey: "baseUrl") ?? "", "apiKey": defaults.string(forKey: "apiKey") ?? "", "deviceId": id]
    }
    AsyncFunction("saveConfig") { (config: [String: String]) in
      let defaults = try self.preferences()
      for key in ["baseUrl", "apiKey", "deviceId"] { defaults.set(config[key] ?? "", forKey: key) }
    }
    AsyncFunction("openKeyboardSettings") { () in
      DispatchQueue.main.async {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
      }
    }
    AsyncFunction("getPersonalization") { () -> String? in try self.preferences().string(forKey: "personalization") }
    AsyncFunction("savePersonalization") { (value: String) in
      guard value.utf16.count <= 100000 else { throw NSError(domain: "ChatQ", code: 2) }
      try self.preferences().set(value, forKey: "personalization")
    }
    AsyncFunction("getPersonaSelection") { () -> String? in try self.preferences().string(forKey: "personaSelection") }
    AsyncFunction("savePersonaSelection") { (value: String) in
      guard value.utf16.count <= 1000 else { throw NSError(domain: "ChatQ", code: 2) }
      try self.preferences().set(value, forKey: "personaSelection")
    }
    AsyncFunction("patchPersonaSelection") { (raw: String) in
      let prefs = try self.preferences(), patch = try AIJSON.object(raw, limit: 1000)
      var selection = (try? AIJSON.object(prefs.string(forKey: "personaSelection") ?? "{}", limit: 1000)) ?? [:]
      for (key, value) in patch {
        if key == "recentIds", let ids = value as? [String], ids.count <= 6, ids.allSatisfy({ $0.utf16.count <= 80 }) { selection[key] = ids; continue }
        guard ["cardId", "relationId", "sceneId", "warmth", "goalId"].contains(key), let text = value as? String, text.utf16.count <= 80 else { throw AIProblem.message("人设选择格式异常") }
        selection[key] = text
      }
      if let id = patch["cardId"] as? String, !id.isEmpty {
        selection["recentIds"] = Array(([id] + ((selection["recentIds"] as? [String]) ?? []).filter { $0 != id }).prefix(6))
      }
      prefs.set(try AIJSON.string(selection), forKey: "personaSelection")
    }
    AsyncFunction("showKeyboardPicker") { () in }
  }
}
