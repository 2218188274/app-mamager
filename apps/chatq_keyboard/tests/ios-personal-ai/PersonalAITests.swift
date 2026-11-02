import XCTest
@testable import ChatQPersonalAI
@testable import ChatQPersona
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class MemoryCredentials: AICredentialStore {
  var data: Data?, reject = false
  func read() throws -> Data? { data }
  func write(_ value: Data) throws { if reject { throw AIProblem.message("fixture write failure") }; data = value }
}
final class PersonalAITests: XCTestCase {
  let input: [String: Any] = ["baseUrl": "https://fixture.invalid/v1/", "model": "fixture-model", "apiKey": "synthetic-key-only", "stream": true]
  func testValidationRejectsUnsafeEndpointsAndHeaders() throws {
    let good = try AIConfiguration(input); XCTAssertEqual(good.baseUrl, "https://fixture.invalid/v1")
    for url in ["http://fixture.invalid/v1", "https://u:p@fixture.invalid/v1", "https://fixture.invalid/v1?a=1", "https://fixture.invalid/v1#x", "https://fixture.invalid/v1/chat/completions", "https://fixture.invalid:99999/v1"] {
      var value = input; value["baseUrl"] = url; XCTAssertThrowsError(try AIConfiguration(value), url)
    }
    for key in ["", "a\rb", "a b", "密钥"] { var value = input; value["apiKey"] = key; XCTAssertThrowsError(try AIConfiguration(value)) }
    for count: Any in [true, 0, 11, 1.5, "3"] { XCTAssertThrowsError(try AIJSON.count(count)) }
    XCTAssertEqual(try AIJSON.count(10), 10)
  }
  func testVaultNeverExportsKeysAndRequiresReentryForNewEndpoint() throws {
    let store = MemoryCredentials(), vault = AIVault(store: MemoryCredentials())
    XCTAssertEqual(try AIJSON.object(vault.metadata())["hasKey"] as? Bool, false)
    let v = AIVault(store: store), metadata = try v.save(AIJSON.string(input))
    XCTAssertFalse(metadata.contains("synthetic-key")); XCTAssertFalse(metadata.contains("apiKey"))
    let id = try XCTUnwrap(AIJSON.object(metadata)["profileId"] as? String)
    let before = try v.revision()
    var edit = input; edit["profileId"] = id; edit["apiKey"] = ""; edit["model"] = "second-model"
    _ = try v.save(AIJSON.string(edit)); XCTAssertNotEqual(try v.revision(), before)
    XCTAssertEqual(try v.snapshot().0?.apiKey, "synthetic-key-only")
    let saved = store.data; edit["baseUrl"] = "https://other.invalid/v1"
    XCTAssertThrowsError(try v.save(AIJSON.string(edit))); XCTAssertEqual(store.data, saved)
    edit["baseUrl"] = input["baseUrl"]; edit["profileId"] = ""; XCTAssertThrowsError(try v.save(AIJSON.string(edit)))
    store.reject = true; XCTAssertThrowsError(try v.clear()); XCTAssertEqual(store.data, saved)
  }
  func testProfilesCapacitySelectionRemovalAndCorruption() throws {
    let store = MemoryCredentials(), v = AIVault(store: store); var ids: [String] = []
    for i in 0..<8 { var p = input; p["profileId"] = ""; p["profileName"] = "配置\(i)"; ids.append(try XCTUnwrap(AIJSON.object(v.save(AIJSON.string(p)))["profileId"] as? String)) }
    var extra = input; extra["profileId"] = ""; XCTAssertThrowsError(try v.save(AIJSON.string(extra)))
    _ = try v.select(ids[2]); XCTAssertEqual(try AIJSON.object(v.metadata())["profileName"] as? String, "配置2")
    _ = try v.remove(ids[5]); XCTAssertEqual(try AIJSON.object(v.metadata())["profileId"] as? String, ids[2])
    _ = try v.remove(ids[2]); XCTAssertEqual(try AIJSON.object(v.metadata())["profileId"] as? String, ids[0])
    let before = try v.revision(); try v.clear(); XCTAssertNotEqual(try v.revision(), before); XCTAssertNil(try v.snapshot().0)
    store.data = Data("damaged".utf8); XCTAssertThrowsError(try v.metadata()); try v.clear(); XCTAssertNil(try v.snapshot().0)
  }
  func testReplyPolishPersonaAndConversationContext() throws {
    let persona: [String: Any] = ["relations": [["id": "r1", "name": "同事"]], "tagNames": ["t1": "直率"]]
    let messages = try AIPrompts.messages(path: "reply", payload: ["prompt": "会议改到明天", "purpose": "polish", "candidateCount": 10, "relationId": "r1", "customPrompt": "请礼貌表达", "personaTagWeights": ["t1": 0.7]], persona: persona)
    let system = try XCTUnwrap(messages[0]["content"] as? String)
    for text in ["只改写用户原文", "10 条", "同事", "直率", "请礼貌表达"] { XCTAssertTrue(system.contains(text)) }
    XCTAssertFalse(try AIJSON.string(messages).contains("synthetic-key"))
    let chat = try AIPrompts.messages(path: "chat", payload: ["prompt": "继续", "history": [["role": "user", "content": "第一个问题"], ["role": "assistant", "content": "第一个回答"]]], persona: [:])
    XCTAssertEqual(chat.count, 4); XCTAssertEqual(chat[1]["content"] as? String, "第一个问题")
    XCTAssertThrowsError(try AIPrompts.messages(path: "chat", payload: ["prompt": "x", "history": [["role": "system", "content": "bad"]]], persona: [:]))
    XCTAssertThrowsError(try AIPrompts.messages(path: "reply", payload: ["prompt": "x", "candidateCount": 11], persona: [:]))
  }
  func testResultValidationAndCandidateDeduplication() throws {
    let r = try AIPrompts.result(path: "reply", answer: "```json\n{\"candidates\":[\" 好的 \",\"好的\",\"明白\"]}\n```", payload: ["candidateCount": 2])
    XCTAssertEqual(r["candidates"] as? [String], ["好的", "明白"])
    XCTAssertThrowsError(try AIPrompts.result(path: "reply", answer: "not json", payload: ["candidateCount": 2]))
    XCTAssertThrowsError(try AIPrompts.result(path: "reply", answer: "{\"candidates\":[\"\(String(repeating: "字", count: 1001))\"]}", payload: [:]))
    XCTAssertThrowsError(try AIPrompts.result(path: "visionTest", answer: "4720", payload: [:]))
  }
  func testSSEEveryByteBoundaryUnicodeAndStrictCompletion() throws {
    let events = "data: {\"choices\":[{\"delta\":{\"content\":\"你好👋\"},\"finish_reason\":null}]}\r\n\r\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n"
    let data = Data(events.utf8)
    for index in 0...data.count {
      let parser = AIEventStream(); var partial = ""
      try parser.feed(data.prefix(index)) { partial = $0 }; try parser.feed(data.suffix(data.count-index)) { partial = $0 }
      XCTAssertEqual(try parser.complete(), "你好👋"); XCTAssertEqual(partial, "你好👋")
    }
    let truncated = AIEventStream(); try truncated.feed(Data("data: {\"choices\":[{\"delta\":{\"content\":\"未完成\"}}]}\n\n".utf8)) { _ in }; XCTAssertThrowsError(try truncated.complete())
    let noFinish = AIEventStream(); XCTAssertThrowsError(try noFinish.feed(Data("data: [DONE]\n\n".utf8)) { _ in })
    let limited = AIEventStream(); XCTAssertThrowsError(try limited.feed(Data("data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\n".utf8)) { _ in })
  }
  func testAttachmentAndScreenshotSides() throws {
    let data = Data([137,80,78,71,13,10,26,10]).base64EncodedString()
    let image: [String: Any] = ["mime":"image/png", "content":"data:image/png;base64,"+data]
    let messages = try AIPrompts.messages(path: "extract", payload: ["image": image, "side": "right"], persona: [:])
    XCTAssertTrue((messages[0]["content"] as? String ?? "").contains("右侧"))
    XCTAssertThrowsError(try AIPrompts.messages(path: "extract", payload: ["image":image,"side":"unknown"], persona: [:]))
    XCTAssertThrowsError(try AIPrompts.messages(path: "reply", payload: ["prompt":"x","attachments":[["mime":"image/png","content":"https://fixture.invalid/private"]]], persona: [:]))
  }
  func testNativePersonaKeepsRelationshipGoalAndFallback() throws {
    let name = "chatq-synthetic-test-"+UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName:name)); defer { defaults.removePersistentDomain(forName:name) }
    defaults.set(try AIJSON.string(["version":1,"cards":[["id":"card-a","name":"温柔","instructions":"认真倾听","length":"short","tagWeights":["gentle":0.7]]],"relations":[["id":"friend","name":"朋友"]],"scenes":[]]),forKey:"personalization")
    defaults.set(try AIJSON.string(["cardId":"removed-card","relationId":"friend","warmth":"reserved","goalId":"decline"]),forKey:"personaSelection")
    let prefs = PersonaPreferences(defaults:defaults), fields = prefs.requestFields()
    XCTAssertEqual(prefs.selected("cardId",choices:prefs.choices("cards")),"card-a")
    let prompt = try XCTUnwrap(fields["customPrompt"] as? String)
    XCTAssertTrue(prompt.contains("认真倾听")); XCTAssertTrue(prompt.contains("表达克制")); XCTAssertTrue(prompt.contains("明确地拒绝"))
    XCTAssertEqual(fields["relationId"] as? String,"friend")
    XCTAssertTrue(prefs.select("sceneId",id:""))
    let selection = try AIJSON.object(defaults.string(forKey:"personaSelection") ?? "{}")
    XCTAssertEqual(selection["goalId"] as? String,"decline"); XCTAssertEqual(selection["relationId"] as? String,"friend")
    defaults.set(try AIJSON.string(["version":1,"cards":[],"relations":[],"scenes":[]]),forKey:"personalization")
    XCTAssertTrue((prefs.requestFields()["customPrompt"] as? String ?? "").contains("明确地拒绝"))
  }
  func testHTTPAndCancellationWithLocalFixtureOnly() throws {
    guard let base = ProcessInfo.processInfo.environment["CHATQ_TEST_API"] else { throw XCTSkip("Set CHATQ_TEST_API to the local synthetic fixture") }
    let store = MemoryCredentials(), v = AIVault(store: store)
    var p = input; p["baseUrl"] = base; _ = try v.save(AIJSON.string(p))
    let jobs = AIJobs(vault: v, persona: { [:] }), id = "fixture-request-0001"
    try jobs.start(id, path: "chat", raw: "{\"prompt\":\"你好\",\"history\":[]}")
    var status: [String: Any] = [:]
    for _ in 0..<400 { status = try AIJSON.object(jobs.read(id)); if status["status"] as? String != "running" { break }; Thread.sleep(forTimeInterval: 0.01) }
    XCTAssertEqual(status["status"] as? String, "done", status["error"] as? String ?? "")
    XCTAssertEqual(try AIJSON.object(status["result"] as? String ?? "{}")["reply"] as? String, "你好👋")
    jobs.release(id)
    try jobs.start("fixture-request-0002", path: "chat", raw: "{\"prompt\":\"slow\"}")
    jobs.cancel("fixture-request-0002"); XCTAssertEqual(try AIJSON.object(jobs.read("fixture-request-0002"))["status"] as? String, "cancelled")
    jobs.release("fixture-request-0002")
    jobs.cancel("fixture-request-0003"); XCTAssertThrowsError(try jobs.start("fixture-request-0003", path: "test", raw: "{}"))
    p["baseUrl"] = base.replacingOccurrences(of: "/v1", with: "/redirect"); _ = try v.save(AIJSON.string(p))
    try jobs.start("fixture-request-0004", path: "test", raw: "{}")
    for _ in 0..<400 { status = try AIJSON.object(jobs.read("fixture-request-0004")); if status["status"] as? String != "running" { break }; Thread.sleep(forTimeInterval: 0.01) }
    XCTAssertEqual(status["status"] as? String, "error"); XCTAssertTrue((status["error"] as? String ?? "").contains("跳转"))
    jobs.destroy()
    func run(_ path: String, prefix: String = "/v1", raw: String, expected: String) throws -> [String: Any] {
      p["baseUrl"] = base.replacingOccurrences(of: "/v1", with: prefix); _ = try v.save(AIJSON.string(p))
      let id = "fixture-" + UUID().uuidString
      try jobs.start(id, path: path, raw: raw)
      var value: [String: Any] = [:]
      for _ in 0..<400 { value = try AIJSON.object(jobs.read(id)); if value["status"] as? String != "running" { break }; Thread.sleep(forTimeInterval: 0.01) }
      XCTAssertEqual(value["status"] as? String, expected, value["error"] as? String ?? ""); jobs.release(id); return value
    }
    let reply = try run("reply", raw: "{\"prompt\":\"你好\",\"candidateCount\":2}", expected: "done")
    XCTAssertEqual(try AIJSON.object(reply["result"] as? String ?? "{}")["candidates"] as? [String], ["好的","收到"])
    let models = try run("models", raw: AIJSON.string(["config":p]), expected: "done")
    XCTAssertEqual(try AIJSON.object(models["result"] as? String ?? "{}")["models"] as? [String], ["fixture-a","fixture-b"])
    let denied = try run("test", prefix: "/error", raw: "{}", expected: "error")
    XCTAssertFalse((denied["error"] as? String ?? "").contains("private provider"))
    _ = try run("chat", prefix: "/truncated", raw: "{\"prompt\":\"fixture\"}", expected: "error")
    p["baseUrl"] = base; _ = try v.save(AIJSON.string(p))
    try jobs.start("fixture-request-0005", path: "chat", raw: "{\"prompt\":\"stale\"}")
    XCTAssertThrowsError(try jobs.start("fixture-request-0006", path: "test", raw: "{}"))
    _ = try v.save(AIJSON.string(p))
    for _ in 0..<400 { status = try AIJSON.object(jobs.read("fixture-request-0005")); if status["status"] as? String != "running" { break }; Thread.sleep(forTimeInterval: 0.01) }
    XCTAssertEqual(status["status"] as? String, "cancelled"); XCTAssertEqual(status["result"] as? String, "")
    jobs.destroy()
  }
}
