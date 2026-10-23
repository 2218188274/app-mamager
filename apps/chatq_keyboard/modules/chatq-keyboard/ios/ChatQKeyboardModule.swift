import ExpoModulesCore
import UIKit

public class ChatQKeyboardModule: Module {
  private func preferences() throws -> UserDefaults {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ChatQAppGroup") as? String,
          let defaults = UserDefaults(suiteName: group) else {
      throw NSError(domain: "ChatQ", code: 1, userInfo: [NSLocalizedDescriptionKey: "请配置键盘 App Group"])
    }
    return defaults
  }
  public func definition() -> ModuleDefinition {
    Name("ChatQKeyboard")
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
    AsyncFunction("showKeyboardPicker") { () in }
  }
}
