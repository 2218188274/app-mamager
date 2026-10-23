import UIKit

final class KeyboardViewController: UIInputViewController {
  private let source = UILabel()
  private let status = UILabel()
  private let candidates = UIStackView()
  private let tone = UISegmentedControl(items: ["自然", "得体", "幽默", "轻松"])
  private let quantity = UISegmentedControl(items: ["1 条", "2 条", "3 条"])
  private let mode = UISegmentedControl(items: ["写回复", "找话题"])
  private let topicControls = UIStackView()
  private var replyControls: UIStackView!
  private var topicCategory = "daily"
  private var topicPage = 0
  private var topicAI: [String] = []
  private struct Topic: Decodable { let id: String; let title: String; let opener: String; let followUp: String }
  private struct Category: Decodable { let id: String; let name: String; let topics: [Topic] }
  private struct Library: Decodable { let categories: [Category] }
  private lazy var topics: [Category] = {
    guard let url = Bundle.main.url(forResource: "topics", withExtension: "json"), let data = try? Data(contentsOf: url) else { return [] }
    return (try? JSONDecoder().decode(Library.self, from: data).categories) ?? []
  }()
  private var topicMode: Bool { mode.selectedSegmentIndex == 1 }
  private var prompt = ""
  private var revision = 0
  private var task: URLSessionDataTask?
  private var generateButton: UIButton!
  private let pad = UIStackView()
  private var numbers = false
  private var caps = false
  private var chinese = true
  private var spelling = ""
  private var words: [CQPinyinCandidate] = []
  private var decoder: CQPinyinDecoder?
  private let spellingLabel = UILabel()
  private let wordBar = UIStackView()
  private let wordScroll = UIScrollView()
  private let aiPanel = UIStackView()
  private let personaRow = UIStackView()
  private let aiContainer = UIView()
  private var previousKeyboardType: UIKeyboardType?
  private var directOnly = false
  private var keyboardHeight: NSLayoutConstraint!
  private let purple = UIColor(red: 0.40, green: 0.34, blue: 0.83, alpha: 1)
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(white: 0.96, alpha: 1)
    let root = UIStackView(); root.axis = .vertical; root.spacing = 5
    root.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(root)
    keyboardHeight = view.heightAnchor.constraint(equalToConstant: 320); keyboardHeight.priority = .defaultHigh
    NSLayoutConstraint.activate([root.topAnchor.constraint(equalTo: view.topAnchor, constant: 6), root.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 6), root.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -6), root.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -6), keyboardHeight])
    if let dictionary = Bundle.main.path(forResource: "dict_pinyin", ofType: "dat") {
      let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      decoder = CQPinyinDecoder(dictionary: dictionary, userDictionary: directory.appendingPathComponent("chatq-pinyin-user.dat").path)
    }
    let title = UILabel(); title.text = "聊商 · 拼音"; title.font = .boldSystemFont(ofSize: 14)
    let globe = button("🌐 切换键盘") {}
    globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
    root.addArrangedSubview(row([button("AI / 话题 ▾") { [weak self] in
      guard let self = self else { return }; self.commitPending(); self.aiContainer.isHidden.toggle(); self.keyboardHeight.constant = self.aiContainer.isHidden ? 320 : 590
      if self.aiContainer.isHidden { self.revision += 1; self.task?.cancel(); self.task = nil }
      if !self.aiContainer.isHidden && self.topicMode { self.renderTopics() }
      self.renderPrompt()
    }, title, globe]))
    aiPanel.axis = .vertical; aiPanel.spacing = 5; aiPanel.translatesAutoresizingMaskIntoConstraints = false
    aiContainer.clipsToBounds = true; aiContainer.isHidden = true; aiContainer.addSubview(aiPanel); root.addArrangedSubview(aiContainer)
    let panelBottom = aiPanel.bottomAnchor.constraint(equalTo: aiContainer.bottomAnchor); panelBottom.priority = .defaultHigh
    NSLayoutConstraint.activate([aiPanel.topAnchor.constraint(equalTo: aiContainer.topAnchor), aiPanel.leadingAnchor.constraint(equalTo: aiContainer.leadingAnchor), aiPanel.trailingAnchor.constraint(equalTo: aiContainer.trailingAnchor), panelBottom])
    personaRow.axis = .horizontal; personaRow.spacing = 4; personaRow.distribution = .fillEqually
    mode.selectedSegmentIndex = 0
    mode.addAction(UIAction { [weak self] _ in
      guard let self = self else { return }; self.revision += 1; self.task?.cancel(); self.task = nil
      self.prompt = ""; self.topicAI = []; self.clear(self.candidates); self.renderPrompt()
      if self.topicMode { self.renderTopics() }
    }, for: .valueChanged)
    aiPanel.addArrangedSubview(mode)
    aiPanel.addArrangedSubview(personaRow); reloadPersona()
    source.numberOfLines = 2; source.font = .systemFont(ofSize: 13); source.heightAnchor.constraint(equalToConstant: 38).isActive = true
    aiPanel.addArrangedSubview(source)
    aiPanel.addArrangedSubview(row([
      button("粘贴消息") { [weak self] in
        guard let self = self, self.hasFullAccess, self.task == nil else { return }
        self.setPrompt(UIPasteboard.general.string ?? "")
      },
      button("读取选中") { [weak self] in
        guard let self = self, self.task == nil else { return }
        self.setPrompt(self.textDocumentProxy.selectedText ?? "")
      },
      button("清空") { [weak self] in if self?.task == nil { self?.setPrompt("") } }
    ]))
    tone.selectedSegmentIndex = 0; quantity.selectedSegmentIndex = 0
    for control in [tone, quantity] { control.addAction(UIAction { [weak self] _ in
      guard let self = self else { return }; self.revision += 1; self.task?.cancel(); self.task = nil
      self.clear(self.candidates); self.renderPrompt(); self.status.text = "设置已更新，请重新生成"
    }, for: .valueChanged) }
    replyControls = row([tone, quantity]); aiPanel.addArrangedSubview(replyControls)
    topicControls.axis = .horizontal; topicControls.spacing = 4; topicControls.distribution = .fillEqually
    let categoryButton = button("日常破冰") {}; categoryButton.showsMenuAsPrimaryAction = true
    categoryButton.menu = UIMenu(title: "话题分类", children: topics.map { category in
      UIAction(title: category.name) { [weak self, weak categoryButton] _ in
        guard let self = self else { return }; self.revision += 1; self.task?.cancel(); self.task = nil
        self.topicCategory = category.id; self.topicPage = 0; self.topicAI = []
        categoryButton?.setTitle(category.name, for: .normal); self.renderPrompt(); self.renderTopics()
      }
    })
    topicControls.addArrangedSubview(categoryButton)
    topicControls.addArrangedSubview(button("换一批") { [weak self] in
      guard let self = self, self.task == nil else { return }; self.topicAI = []; self.topicPage += 1; self.renderTopics()
    }); aiPanel.addArrangedSubview(topicControls)
    generateButton = button("生成回复") { [weak self] in self?.generateReply() }
    aiPanel.addArrangedSubview(generateButton)
    status.font = .systemFont(ofSize: 11); status.numberOfLines = 2; status.textColor = .secondaryLabel
    aiPanel.addArrangedSubview(status)
    let scroll = UIScrollView(); candidates.axis = .vertical; candidates.spacing = 4
    candidates.translatesAutoresizingMaskIntoConstraints = false; scroll.addSubview(candidates)
    NSLayoutConstraint.activate([candidates.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor), candidates.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor), candidates.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor), candidates.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor), candidates.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor), scroll.heightAnchor.constraint(equalToConstant: 80)])
    aiPanel.addArrangedSubview(scroll)
    spellingLabel.font = .systemFont(ofSize: 13); spellingLabel.textColor = .darkGray; spellingLabel.heightAnchor.constraint(equalToConstant: 22).isActive = true
    root.addArrangedSubview(spellingLabel)
    wordBar.axis = .horizontal; wordBar.spacing = 8; wordBar.translatesAutoresizingMaskIntoConstraints = false; wordScroll.addSubview(wordBar)
    NSLayoutConstraint.activate([wordBar.topAnchor.constraint(equalTo: wordScroll.contentLayoutGuide.topAnchor), wordBar.bottomAnchor.constraint(equalTo: wordScroll.contentLayoutGuide.bottomAnchor), wordBar.leadingAnchor.constraint(equalTo: wordScroll.contentLayoutGuide.leadingAnchor), wordBar.trailingAnchor.constraint(equalTo: wordScroll.contentLayoutGuide.trailingAnchor), wordBar.heightAnchor.constraint(equalTo: wordScroll.frameLayoutGuide.heightAnchor), wordScroll.heightAnchor.constraint(equalToConstant: 42)])
    root.addArrangedSubview(wordScroll); pad.axis = .vertical; pad.spacing = 3; root.addArrangedSubview(pad); drawPad(); renderPrompt(); renderSpelling()
  }
  private func row(_ items: [UIView]) -> UIStackView { let stack = UIStackView(arrangedSubviews: items); stack.axis = .horizontal; stack.spacing = 4; stack.distribution = .fillEqually; return stack }
  private func reloadPersona() {
    clear(personaRow); let preferences = PersonaPreferences()
    for (key, listKey, label) in [("cardId", "cards", "人设"), ("relationId", "relations", "关系"), ("sceneId", "scenes", "场景")] {
      let available = preferences.choices(listKey)
      let options = key == "cardId" && !available.isEmpty ? available : [(id: "", name: "不指定")] + available
      let selected = preferences.selected(key, choices: available)
      let control = UIButton(type: .system); control.backgroundColor = .white; control.tintColor = purple
      control.titleLabel?.font = .systemFont(ofSize: 12); control.titleLabel?.adjustsFontSizeToFitWidth = true
      control.setTitle(options.first(where: { $0.id == selected })?.name ?? label, for: .normal)
      control.accessibilityLabel = "选择\(label)"; control.showsMenuAsPrimaryAction = true
      control.heightAnchor.constraint(equalToConstant: 30).isActive = true
      control.menu = UIMenu(title: label, children: options.map { option in
        UIAction(title: option.name, state: option.id == selected ? .on : .off) { [weak self] _ in
          guard let self = self else { return }
          guard self.hasFullAccess else { self.status.text = "请开启允许完全访问，以同步人设设置"; return }
          guard preferences.select(key, id: option.id) else { self.status.text = "保存失败，请重新选择"; return }
          self.revision += 1; self.task?.cancel(); self.task = nil; self.topicAI = []; self.clear(self.candidates)
          if self.topicMode { self.renderTopics() }
          self.reloadPersona(); self.renderPrompt(); self.status.text = "已切换\(label)：\(option.name)"
        }
      })
      personaRow.addArrangedSubview(control)
    }
  }
  private func button(_ title: String, _ action: @escaping () -> Void) -> UIButton {
    let button = UIButton(type: .system); button.setTitle(title, for: .normal); button.tintColor = purple
    button.backgroundColor = .white; button.layer.cornerRadius = 6
    button.titleLabel?.font = .systemFont(ofSize: 13); button.titleLabel?.numberOfLines = 0
    button.addAction(UIAction { _ in action() }, for: .touchUpInside)
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 30).isActive = true
    return button
  }
  private func clear(_ stack: UIStackView) { stack.arrangedSubviews.forEach { stack.removeArrangedSubview($0); $0.removeFromSuperview() } }
  private func drawPad() {
    clear(pad)
    let lines = numbers ? ["1234567890", "@#%&*()-", ".,?!:;/+_"] : ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
    for line in lines {
      pad.addArrangedSubview(row(line.map { char in
        let value = caps && !chinese ? String(char).uppercased() : String(char)
        return button(value) { [weak self] in self?.type(value) }
      }))
    }
    pad.addArrangedSubview(row([
      button(numbers ? "返回" : "123") { [weak self] in self?.commitPending(); self?.numbers.toggle(); self?.drawPad() },
      button(chinese ? "中/英" : "英/中") { [weak self] in guard let self = self else { return }; self.commitPending(); if !self.directOnly { self.chinese.toggle() }; self.drawPad(); self.renderSpelling() },
      button(chinese ? "分词" : "⇧") { [weak self] in guard let self = self else { return }; if self.chinese { self.type("'") } else { self.caps.toggle(); self.drawPad() } },
      button(chinese ? "，" : ",") { [weak self] in guard let self = self else { return }; self.type(self.chinese ? "，" : ",") },
      button("空格") { [weak self] in guard let self = self else { return }; if self.spelling.isEmpty { self.textDocumentProxy.insertText(" ") } else { self.choose(0) } },
      button(chinese ? "。" : ".") { [weak self] in guard let self = self else { return }; self.type(self.chinese ? "。" : ".") },
      button("⌫") { [weak self] in guard let self = self else { return }; if self.spelling.isEmpty { self.textDocumentProxy.deleteBackward() } else { self.spelling.removeLast(); self.updateSpelling() } },
      button("换行") { [weak self] in guard let self = self else { return }; if self.spelling.isEmpty { self.textDocumentProxy.insertText("\n") } else { self.commitPending() } }
    ]))
  }
  private func type(_ value: String) {
    if chinese && !numbers && (value.range(of: "^[a-z]$", options: .regularExpression) != nil || value == "'") {
      if value == "'" && (spelling.isEmpty || spelling.hasSuffix("'")) { return }
      if spelling.count >= 39 { commitPending() }
      spelling += value; updateSpelling()
    } else { commitPending(); textDocumentProxy.insertText(value) }
  }
  private func updateSpelling() {
    words = decoder?.decode(spelling) ?? []
    textDocumentProxy.setMarkedText(spelling, selectedRange: NSRange(location: spelling.utf16.count, length: 0))
    if spelling.isEmpty { textDocumentProxy.unmarkText() }
    renderSpelling()
  }
  private func renderSpelling() {
    spellingLabel.text = spelling.isEmpty ? (chinese ? "全拼 / 简拼 · v 输入 ü · 左右滑动选词" : "英文输入") : spelling
    clear(wordBar); wordScroll.setContentOffset(.zero, animated: false)
    for (index, word) in words.enumerated() {
      let candidate = button(word.text) { [weak self] in self?.choose(index) }
      candidate.titleLabel?.font = .systemFont(ofSize: 20); candidate.contentEdgeInsets = UIEdgeInsets(top: 0, left: 14, bottom: 0, right: 14)
      wordBar.addArrangedSubview(candidate)
    }
    if !spelling.isEmpty { wordBar.addArrangedSubview(button("原文 \(spelling)") { [weak self] in self?.commitPending(convert: false) }) }
    else { let hint = UILabel(); hint.font = .systemFont(ofSize: 13); hint.textColor = .secondaryLabel; hint.text = decoder == nil ? "拼音词库加载失败，请重新打开键盘" : "离线拼音已就绪"; wordBar.addArrangedSubview(hint) }
  }
  private func choose(_ index: Int) {
    guard words.indices.contains(index) else { commitPending(convert: false); return }
    let item = words[index]; spelling = String(spelling.dropFirst(item.consumed))
    textDocumentProxy.insertText(item.text); textDocumentProxy.unmarkText()
    if !spelling.isEmpty { updateSpelling() } else { words = []; renderSpelling() }
  }
  private func commitPending(convert: Bool = true) {
    guard !spelling.isEmpty else { return }
    var rest = spelling; var result = ""
    while !rest.isEmpty {
      guard convert, let item = decoder?.decode(rest).first else { result += rest; break }
      result += item.text; rest = String(rest.dropFirst(item.consumed))
    }
    spelling = ""; words = []; textDocumentProxy.insertText(result); textDocumentProxy.unmarkText(); renderSpelling()
  }
  private func setPrompt(_ text: String) { prompt = String(text.prefix(topicMode ? 200 : 1000)).trimmingCharacters(in: .whitespacesAndNewlines); topicAI = []; clear(candidates); renderPrompt(); if topicMode { renderTopics() } }
  private func addTopic(_ text: String) {
    let current = revision
    candidates.addArrangedSubview(button(text) { [weak self] in
      guard let self = self, self.revision == current, !self.directOnly else { return }
      self.commitPending(); self.textDocumentProxy.insertText(text); self.status.text = "已填入，请确认后发送"
    })
  }
  private func renderTopics() {
    clear(candidates)
    guard !directOnly else { status.text = "此输入框不启用话题库"; return }
    if !topicAI.isEmpty { topicAI.forEach { addTopic($0) }; return }
    guard let category = topics.first(where: { $0.id == topicCategory }), !category.topics.isEmpty else { status.text = "话题库暂不可用"; return }
    status.text = "离线话题 · 点击填入，不会自动发送"
    for i in 0..<min(3, category.topics.count) {
      let item = category.topics[(topicPage * 3 + i) % category.topics.count]; addTopic(item.opener)
      candidates.addArrangedSubview(button("怎么接着聊 · \(item.title)") { [weak self] in
        guard let self = self else { return }; self.clear(self.candidates); self.addTopic(item.followUp)
        self.status.text = "等对方回答后，按实际情况选用"
        self.candidates.addArrangedSubview(self.button("返回话题库") { [weak self] in self?.renderTopics() })
      })
    }
  }
  private func renderPrompt() {
    source.text = prompt.isEmpty ? (topicMode ? "背景可留空；也可主动粘贴最多 200 字背景" : "复制对方消息，再点击粘贴；也可读取主动选中的文字") : prompt
    replyControls?.isHidden = topicMode; topicControls.isHidden = !topicMode
    generateButton?.setTitle(topicMode ? "AI 找话题" : "生成回复", for: .normal)
    generateButton?.isEnabled = hasFullAccess && !directOnly && (topicMode || !prompt.isEmpty) && task == nil
    if !hasFullAccess { status.text = "请在设置中为聊商键盘开启“允许完全访问”，以连接 AI" }
    else if task == nil { status.text = "点击生成才发送消息，点击候选才填入聊天框" }
  }
  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    reloadPersona(); configureInputType(); renderPrompt(); renderSpelling(); if topicMode { renderTopics() }
  }
  private func configureInputType() {
    let type = textDocumentProxy.keyboardType ?? .default
    guard previousKeyboardType != type else { return }; previousKeyboardType = type
    directOnly = [.emailAddress, .URL, .asciiCapable, .numberPad, .phonePad, .decimalPad, .asciiCapableNumberPad].contains(type)
    chinese = !directOnly; numbers = [.numberPad, .phonePad, .decimalPad, .asciiCapableNumberPad].contains(type)
    drawPad(); renderSpelling()
  }
  override func textDidChange(_ textInput: UITextInput?) { super.textDidChange(textInput); configureInputType() }
  override func viewWillDisappear(_ animated: Bool) { spelling = ""; words = []; textDocumentProxy.unmarkText(); revision += 1; task?.cancel(); task = nil; prompt = ""; topicAI = []; clear(candidates); renderPrompt(); super.viewWillDisappear(animated) }
  override func textWillChange(_ textInput: UITextInput?) {
    super.textWillChange(textInput)
    spelling = ""; words = []; textDocumentProxy.unmarkText(); renderSpelling()
    revision += 1; task?.cancel(); task = nil; clear(candidates); renderPrompt()
  }
  private func generateReply() {
    let isTopic = topicMode
    guard hasFullAccess, !directOnly, task == nil, (isTopic || !prompt.isEmpty),
      let group = Bundle.main.object(forInfoDictionaryKey: "ChatQAppGroup") as? String,
      let prefs = UserDefaults(suiteName: group), let base = prefs.string(forKey: "baseUrl"),
      let key = prefs.string(forKey: "apiKey"), !key.isEmpty, let device = prefs.string(forKey: "deviceId"),
      let url = URL(string: base + "/api/aikeyboard/" + (isTopic ? "topics" : "reply")) else { status.text = "请先打开聊商 App 完成服务器连接"; return }
    commitPending(); revision += 1; let requestRevision = revision
    var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 75
    request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.setValue(key, forHTTPHeaderField: "x-api-key"); request.setValue(device, forHTTPHeaderField: "x-device-id")
    var body = PersonaPreferences().requestFields()
    body["prompt"] = prompt; body["style"] = isTopic ? "friendly" : ["friendly", "professional", "funny", "emoji"][tone.selectedSegmentIndex]; body["candidateCount"] = isTopic ? 3 : quantity.selectedSegmentIndex + 1
    if isTopic { body["category"] = topicCategory; body["avoid"] = topicAI.prefix(6).map { String($0.prefix(300)) } }
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    clear(candidates); status.text = "AI 正在思考…"
    task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      var replies: [String] = []; var failure = "连接失败或超时，请检查网络后手动重试"
      if error == nil, let data = data, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
        if (response as? HTTPURLResponse)?.statusCode == 200, json["success"] as? Bool == true, let result = json["data"] as? [String: Any] {
          replies = result["candidates"] as? [String] ?? [result["result"] as? String ?? ""]
          replies = replies.filter { !$0.isEmpty }
        } else {
          let detail = json["error"] as? [String: Any]
          failure = (json["error"] as? String) ?? (detail?["message"] as? String) ?? "服务器请求失败"
        }
      }
      let finishedReplies = replies; let finishedFailure = failure
      DispatchQueue.main.async {
        guard let self = self, self.revision == requestRevision else { return }
        self.task = nil; self.renderPrompt()
        if isTopic { self.topicAI = finishedReplies }
        self.status.text = finishedReplies.isEmpty ? finishedFailure : "点击候选填入聊天框 · \(finishedReplies.count) 条回复"
        for reply in finishedReplies {
          self.candidates.addArrangedSubview(self.button(reply) { [weak self] in
            guard let self = self, self.revision == requestRevision else { return }
            self.commitPending(); self.textDocumentProxy.insertText(reply)
            self.status.text = "已填入，请确认后发送"
          })
        }
      }
    }
    generateButton.isEnabled = false; task?.resume()
  }
}
