import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(UIKit)
import UIKit
#endif

final class AIClient: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate, @unchecked Sendable {
  private let lock = NSRecursiveLock()
  private var session: URLSession?, task: URLSessionDataTask?
  private var completion: ((Result<[String: Any], Error>) -> Void)?
  private var delta: (String) -> Void = { _ in }
  private var current: () throws -> Void = {}
  private var bytes = Data(), parser = AIEventStream(), streaming = false
  private var path = "", payload: [String: Any] = [:], ended = false
  func start(path: String, payload: [String: Any], config: AIConfiguration, persona: [String: Any],
             current: @escaping () throws -> Void, delta: @escaping (String) -> Void = { _ in },
             completion: @escaping (Result<[String: Any], Error>) -> Void) throws {
    lock.lock(); defer { lock.unlock() }
    guard self.session == nil, !ended else { throw AIProblem.message("请求已经开始或取消") }
    try current()
    guard let endpoint = URL(string: config.baseUrl + (path == "models" ? "/models" : "/chat/completions")) else { throw AIProblem.message("API 地址格式异常") }
    var request = URLRequest(url: endpoint)
    request.httpMethod = path == "models" ? "GET" : "POST"
    request.setValue("Bearer " + config.apiKey, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let stream = path == "chat" && config.stream
    request.setValue(stream ? "text/event-stream, application/json" : "application/json", forHTTPHeaderField: "Accept")
    request.timeoutInterval = path == "test" || path == "models" ? 20 : 75
    if path != "models" {
      let image = path == "visionTest" ? try Self.visionImage() : nil
      let messages = try AIPrompts.messages(path: path, payload: payload, persona: persona, visionImage: image)
      request.httpBody = try JSONSerialization.data(withJSONObject: ["model": config.model, "messages": messages, "stream": stream])
    }
    self.current = current; self.completion = completion; self.delta = delta; self.path = path; self.payload = payload
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false; configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
    configuration.timeoutIntervalForRequest = request.timeoutInterval; configuration.timeoutIntervalForResource = request.timeoutInterval
    let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
    self.session = session; self.task = session.dataTask(with: request); try current(); self.task?.resume()
  }
  func cancel() { finish(.failure(AIProblem.cancelled)) }
  private func finish(_ result: Result<[String: Any], Error>) {
    lock.lock(); guard !ended else { lock.unlock(); return }; ended = true
    let callback = completion, session = self.session
    completion = nil; self.session = nil; task = nil; bytes.removeAll(); delta = { _ in }; current = {}
    lock.unlock(); session?.invalidateAndCancel(); callback?(result)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
    finish(.failure(AIProblem.message("API 地址发生跳转，已停止发送密钥；请填写最终 HTTPS 地址")))
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    lock.lock(); defer { lock.unlock() }
    do {
      guard !ended else { completionHandler(.cancel); return }; try current()
      guard let response = response as? HTTPURLResponse else { throw AIProblem.message("API 响应格式异常") }
      guard (200...299).contains(response.statusCode) else { throw AIProblem.message(Self.statusMessage(response.statusCode)) }
      guard response.expectedContentLength <= 1_048_576 else { throw AIProblem.message("API 响应过大") }
      streaming = (response.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased().contains("text/event-stream")
      guard !streaming || path != "models" else { throw AIProblem.message("模型列表格式异常") }
      completionHandler(.allow)
    } catch { completionHandler(.cancel); finish(.failure(error)) }
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    lock.lock(); defer { lock.unlock() }
    do {
      guard !ended else { return }; try current()
      if streaming { try parser.feed(data) { [weak self] text in self?.delta(text) } }
      else { guard bytes.count + data.count <= 1_048_576 else { throw AIProblem.message("API 响应过大") }; bytes.append(data) }
    } catch { finish(.failure(error)) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    lock.lock(); defer { lock.unlock() }
    do {
      guard !ended else { return }; try current()
      if let error = error as NSError? { throw AIProblem.message(error.code == NSURLErrorTimedOut ? "生成超时，请稍后手动重试" : "无法连接你的 API，请检查网络、地址和证书后重试") }
      if path == "models" {
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let rows = object["data"] as? [[String: Any]], object["error"] == nil else { throw AIProblem.message("模型列表格式异常，可手动填写模型名称") }
        let models = Array(Set(rows.prefix(2000).compactMap { $0["id"] as? String }.filter { !$0.isEmpty && $0.utf16.count <= 200 && !$0.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }) })).sorted()
        guard !models.isEmpty else { throw AIProblem.message("没有可用的模型名称，请手动填写") }
        try current(); finish(.success(["models": Array(models.prefix(500))])); return
      }
      let answer: String
      if streaming { answer = try parser.complete() }
      else {
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], object["error"] == nil,
              let choice = (object["choices"] as? [[String: Any]])?.first,
              let text = (choice["message"] as? [String: Any])?["content"] as? String else { throw AIProblem.message("API 未返回文字内容，请检查模型是否支持 Chat Completions") }
        if let reason = choice["finish_reason"] as? String, reason != "stop" { throw AIProblem.message("回答未完整生成，请缩短问题或更换模型") }
        answer = text
      }
      let result = try AIPrompts.result(path: path, answer: answer, payload: payload); try current(); finish(.success(result))
    } catch { finish(.failure(error is AIProblem ? error : AIProblem.message("API 响应格式不兼容，请检查模型"))) }
  }
  private static func statusMessage(_ status: Int) -> String {
    switch status {
    case 401, 403: return "API 密钥无效或没有模型权限，请检查我的 API"
    case 402: return "供应商账户余额不足，请到供应商处处理"
    case 404: return "API 地址或模型不存在，请检查基础地址与模型名称"
    case 429: return "供应商额度不足或请求过于频繁，请稍后手动重试"
    case 300...399: return "API 地址发生跳转，已停止发送密钥；请填写最终 HTTPS 地址"
    default: return "供应商请求失败（\(status)），请检查地址、模型和附件兼容性"
    }
  }
  private static func visionImage() throws -> String {
    #if canImport(UIKit)
    // A synthetic capability test, created only after the user explicitly chooses it.
    let format = UIGraphicsImageRendererFormat(); format.scale = 1
    let image = UIGraphicsImageRenderer(size: CGSize(width: 240, height: 100), format: format).image { ctx in
      UIColor.white.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 240, height: 100))
      ("4726" as NSString).draw(at: CGPoint(x: 22, y: 18), withAttributes: [.font: UIFont.monospacedSystemFont(ofSize: 60, weight: .bold), .foregroundColor: UIColor.black])
    }
    guard let data = image.pngData() else { throw AIProblem.message("图片测试暂不可用") }
    return "data:image/png;base64," + data.base64EncodedString()
    #else
    throw AIProblem.message("图片测试需要 iOS 图形环境")
    #endif
  }
}

final class AIJobs {
  private final class Job {
    let id: String, client = AIClient()
    var status = "running", text = "", result = "", error = ""
    init(_ id: String) { self.id = id }
  }
  private let lock = NSRecursiveLock(), vault: AIVault
  private let persona: () -> [String: Any]
  private var job: Job?, cancelled: [String] = []
  init(vault: AIVault, persona: @escaping () -> [String: Any]) { self.vault = vault; self.persona = persona }
  func start(_ id: String, path: String, raw: String) throws {
    guard id.range(of: "^[a-zA-Z0-9_-]{16,80}$", options: .regularExpression) != nil else { throw AIProblem.message("请求编号异常") }
    let payload = try AIJSON.object(raw)
    let snapshot = try vault.snapshot()
    let config: AIConfiguration
    if path == "models", let input = payload["config"] as? [String: Any] { config = try vault.resolveForModels(input) }
    else { guard let saved = snapshot.0 else { throw AIProblem.message("请打开聊商 → 我的 → 我的 API，配置后即可免费使用") }; config = saved }
    lock.lock()
    if cancelled.contains(id) { lock.unlock(); throw AIProblem.cancelled }
    guard job?.status != "running" else { lock.unlock(); throw AIProblem.message("已有 AI 请求正在生成") }
    let next = Job(id); job = next; lock.unlock()
    let personal = persona()
    do {
      try next.client.start(path: path, payload: payload, config: config, persona: personal, current: { [weak self, weak next] in
        guard let self = self, let next = next else { throw AIProblem.cancelled }
        self.lock.lock(); let active = self.job === next && next.status == "running"; self.lock.unlock()
        guard active, try self.vault.revision() == snapshot.1 else { throw AIProblem.cancelled }
      }, delta: { [weak self, weak next] text in
        guard let self = self, let next = next else { return }; self.lock.lock(); defer { self.lock.unlock() }
        if self.job === next && next.status == "running" { next.text = text }
      }, completion: { [weak self, weak next] result in
        guard let self = self, let next = next else { return }; self.lock.lock(); defer { self.lock.unlock() }
        guard self.job === next, next.status == "running" else { return }
        do { next.result = try AIJSON.string(result.get()); next.status = "done" }
        catch { next.status = (error as? AIProblem) == .cancelled ? "cancelled" : "error"; next.error = (error as? AIProblem)?.localizedDescription ?? "AI 请求失败，请检查配置后重试" }
      })
    } catch { lock.lock(); if job === next { job = nil }; lock.unlock(); next.client.cancel(); throw error }
  }
  func read(_ id: String) throws -> String {
    lock.lock(); defer { lock.unlock() }
    guard let j = job, j.id == id else { throw AIProblem.message("本次 AI 请求已结束") }
    return try AIJSON.string(["status": j.status, "text": j.text, "result": j.result, "error": j.error])
  }
  func cancel(_ id: String) {
    lock.lock(); cancelled.removeAll { $0 == id }; cancelled.append(id); if cancelled.count > 32 { cancelled.removeFirst() }
    let client = job?.id == id ? job?.client : nil; if job?.id == id { job?.status = "cancelled" }; lock.unlock()
    client?.cancel()
  }
  func release(_ id: String) { cancel(id); lock.lock(); if job?.id == id { job = nil }; lock.unlock() }
  func destroy() { lock.lock(); let id = job?.id; lock.unlock(); if let id = id { release(id) } }
}
