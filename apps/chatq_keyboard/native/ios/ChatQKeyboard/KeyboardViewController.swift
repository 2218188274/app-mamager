import UIKit

final class KeyboardViewController: UIInputViewController {
  private let source = UILabel()
  private let status = UILabel()
  private let candidates = UIStackView()
  private let tone = UIButton(type: .system)
  private var replyTone = 0
  private let quantity = UIButton(type: .system)
  private var replyCount = 1
  private let mode = UISegmentedControl(items: ["帮回复", "润色", "找话题"])
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
  private var topicMode: Bool { mode.selectedSegmentIndex == 2 }
  private var polishMode: Bool { mode.selectedSegmentIndex == 1 }
  private var prompt = ""
  private var revision = 0
  private var task: AIClient?
  private let vault = AIVault(store: AIKeychainStore())
  private var settingsSignature: String?
  private var panelToggle: UIButton!
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
  private let aiContainer = UIScrollView()
  private var previousKeyboardType: UIKeyboardType?
  private var directOnly = false
  private var keyboardHeight: NSLayoutConstraint!
  private let purple = UIColor(red: 0.40, green: 0.34, blue: 0.83, alpha: 1)
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(white: 0.96, alpha: 1)
    let root = UIStackView(); root.axis = .vertical; root.spacing = 5
    root.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(root)
    keyboardHeight = view.heightAnchor.constraint(equalToConstant: 360); keyboardHeight.priority = .defaultHigh
    NSLayoutConstraint.activate([root.topAnchor.constraint(equalTo: view.topAnchor, constant: 6), root.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 6), root.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -6), root.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8), keyboardHeight])
    if let dictionary = Bundle.main.path(forResource: "dict_pinyin", ofType: "dat") {
      let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      decoder = CQPinyinDecoder(dictionary: dictionary, userDictionary: directory.appendingPathComponent("chatq-pinyin-user.dat").path)
    }
    let title = UILabel(); title.text = "聊商 · 拼音"; title.font = .boldSystemFont(ofSize: 14)
    let globe = button("🌐 切换键盘") {}
    globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
    panelToggle = button("AI 回复") { [weak self] in
      guard let self = self else { return }; self.commitPending(); self.aiContainer.isHidden.toggle(); self.updatePanelLayout()
      if self.aiContainer.isHidden { self.revision += 1; self.task?.cancel(); self.task = nil; self.clear(self.candidates); self.topicAI = [] }
      if !self.aiContainer.isHidden && self.topicMode { self.renderTopics() }
      self.renderPrompt()
    }
    root.addArrangedSubview(row([panelToggle, title, globe]))
    aiPanel.axis = .vertical; aiPanel.spacing = 5; aiPanel.translatesAutoresizingMaskIntoConstraints = false
    aiContainer.clipsToBounds = true; aiContainer.isHidden = true; aiContainer.addSubview(aiPanel); root.addArrangedSubview(aiContainer)
    NSLayoutConstraint.activate([aiPanel.topAnchor.constraint(equalTo: aiContainer.contentLayoutGuide.topAnchor), aiPanel.leadingAnchor.constraint(equalTo: aiContainer.contentLayoutGuide.leadingAnchor), aiPanel.trailingAnchor.constraint(equalTo: aiContainer.contentLayoutGuide.trailingAnchor), aiPanel.bottomAnchor.constraint(equalTo: aiContainer.contentLayoutGuide.bottomAnchor), aiPanel.widthAnchor.constraint(equalTo: aiContainer.frameLayoutGuide.widthAnchor)])
    personaRow.axis = .horizontal; personaRow.spacing = 4; personaRow.distribution = .fillEqually
    mode.selectedSegmentIndex = 0
    mode.addAction(UIAction { [weak self] _ in
      guard let self = self else { return }; self.revision += 1; self.task?.cancel(); self.task = nil
      self.prompt = ""; self.topicAI = []; self.clear(self.candidates); self.renderPrompt()
      if self.topicMode { self.renderTopics() }
    }, for: .valueChanged)
    aiPanel.addArrangedSubview(mode)
    aiPanel.addArrangedSubview(personaRow); reloadPersona()
    source.numberOfLines = 2; source.font = .preferredFont(forTextStyle: .subheadline); source.adjustsFontForContentSizeCategory = true; source.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    aiPanel.addArrangedSubview(source)
    aiPanel.addArrangedSubview(row([
      button("粘贴并生成") { [weak self] in
        guard let self = self, self.hasFullAccess, self.task == nil else { return }
        if self.setPrompt(UIPasteboard.general.string ?? "") { self.generateReply() }
      },
      button("读取选中") { [weak self] in
        guard let self = self, self.task == nil else { return }
        self.setPrompt(self.textDocumentProxy.selectedText ?? "")
      },
      button("清空") { [weak self] in guard let self = self else { return }; self.revision += 1; self.task?.cancel(); self.task = nil; self.prompt = ""; self.topicAI = []; self.clear(self.candidates); self.renderPrompt() }
    ]))
    quantity.showsMenuAsPrimaryAction = true; quantity.tintColor = purple; quantity.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    tone.showsMenuAsPrimaryAction = true; tone.tintColor = purple; tone.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    for control in [tone, quantity] { control.titleLabel?.font = .preferredFont(forTextStyle: .body); control.titleLabel?.adjustsFontForContentSizeCategory = true }
    reloadTone()
    reloadQuantity()
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
    generateButton.backgroundColor = purple; generateButton.tintColor = .white; generateButton.layer.cornerRadius = 12
    aiPanel.addArrangedSubview(generateButton)
    status.font = .preferredFont(forTextStyle: .footnote); status.adjustsFontForContentSizeCategory = true; status.numberOfLines = 0; status.textColor = .secondaryLabel
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
  private var sharedPreferences: UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ChatQAppGroup") as? String else { return nil }; return UserDefaults(suiteName: group)
  }
  private func signature() throws -> String {
    let prefs = sharedPreferences
    return try AIJSON.string([prefs?.string(forKey: "personalization") ?? "", prefs?.string(forKey: "personaSelection") ?? "", String(prefs?.integer(forKey: "reply_count") ?? 1), String(prefs?.integer(forKey: "reply_tone") ?? 0), vault.revision()])
  }
  @discardableResult private func refreshSettings() -> Bool {
    guard hasFullAccess else { if task != nil { revision += 1; task?.cancel(); task = nil }; return false }
    do {
      let next = try signature(), changed = settingsSignature != nil && next != settingsSignature
      settingsSignature = next; reloadTone(); reloadQuantity()
      if changed { revision += 1; task?.cancel(); task = nil; topicAI = []; clear(candidates); status.text = "设置已更新，请重新生成" }
      return changed
    } catch {
      revision += 1; task?.cancel(); task = nil; topicAI = []; clear(candidates); status.text = error.localizedDescription; return true
    }
  }
  private func reloadQuantity() {
    let n = sharedPreferences?.integer(forKey: "reply_count") ?? 1; replyCount = (1...10).contains(n) ? n : 1
    quantity.setTitle("\(replyCount) 条 ▾", for: .normal); quantity.accessibilityLabel = "回复条数，当前\(replyCount)条"
    quantity.menu = UIMenu(title: "回复条数", children: (1...10).map { n in
      UIAction(title: "\(n) 条", state: n == replyCount ? .on : .off) { [weak self] _ in
        guard let self = self, self.hasFullAccess else { return }; self.sharedPreferences?.set(n, forKey: "reply_count")
        _ = self.refreshSettings(); self.renderPrompt(); self.status.text = "回复条数已更新，请重新生成"
      }
    })
  }
  private func reloadTone() {
    let saved = sharedPreferences?.integer(forKey: "reply_tone") ?? 0; replyTone = (0...3).contains(saved) ? saved : 0
    let names = ["自然", "得体", "幽默", "轻松"]; tone.setTitle("\(names[replyTone]) ▾", for: .normal); tone.accessibilityLabel = "语气，当前\(names[replyTone])"
    tone.menu = UIMenu(title: "回复语气", children: names.enumerated().map { index, name in
      UIAction(title: name, state: index == replyTone ? .on : .off) { [weak self] _ in
        guard let self = self, self.hasFullAccess else { return }; self.sharedPreferences?.set(index, forKey: "reply_tone")
        _ = self.refreshSettings(); self.renderPrompt(); self.status.text = "语气已更新，请重新生成"
      }
    })
  }
  private func updatePanelLayout() {
    let ai = !aiContainer.isHidden
    pad.isHidden = ai; spellingLabel.isHidden = ai; wordScroll.isHidden = ai
    keyboardHeight.constant = ai ? 420 : 360; panelToggle?.setTitle(ai ? "‹ 返回打字" : "AI 回复", for: .normal)
  }
  private func reloadPersona() {
    clear(personaRow); let preferences = PersonaPreferences()
    for (key, listKey, label) in [("cardId", "cards", "人设"), ("relationId", "relations", "关系"), ("sceneId", "scenes", "场景")] {
      let available = preferences.choices(listKey)
      let options = key == "cardId" && !available.isEmpty ? available : [(id: "", name: "不指定")] + available
      let selected = preferences.selected(key, choices: available)
      let control = UIButton(type: .system); control.backgroundColor = .white; control.tintColor = purple
      control.titleLabel?.font = .preferredFont(forTextStyle: .subheadline); control.titleLabel?.adjustsFontForContentSizeCategory = true; control.titleLabel?.lineBreakMode = .byTruncatingTail
      control.setTitle(options.first(where: { $0.id == selected })?.name ?? label, for: .normal)
      control.accessibilityLabel = "选择\(label)"; control.showsMenuAsPrimaryAction = true
      control.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
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
    button.titleLabel?.font = .preferredFont(forTextStyle: .body); button.titleLabel?.adjustsFontForContentSizeCategory = true; button.titleLabel?.numberOfLines = 0
    button.addAction(UIAction { _ in action() }, for: .touchUpInside)
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    return button
  }
  private func clear(_ stack: UIStackView) { stack.arrangedSubviews.forEach { stack.removeArrangedSubview($0); $0.removeFromSuperview() } }
  private func drawPad() {
    clear(pad)
    let lines = numbers ? ["1234567890", "@#%&*()-", ".,?!:;/+_"] : ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
    for line in lines {
      pad.addArrangedSubview(row(line.map { char in
        let value = caps && !chinese ? String(char).uppercased() : String(char)
        let key = button(value) { [weak self] in self?.type(value) }
        key.titleLabel?.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: .systemFont(ofSize: 22), maximumPointSize: 28)
        key.titleLabel?.numberOfLines = 1; key.titleLabel?.adjustsFontSizeToFitWidth = true; key.titleLabel?.minimumScaleFactor = 0.7
        return key
      }))
    }
    let bottom = row([
      button(numbers ? "返回" : "123") { [weak self] in self?.commitPending(); self?.numbers.toggle(); self?.drawPad() },
      button(chinese ? "中/英" : "英/中") { [weak self] in guard let self = self else { return }; self.commitPending(); if !self.directOnly { self.chinese.toggle() }; self.drawPad(); self.renderSpelling() },
      button(chinese ? "分词" : "⇧") { [weak self] in guard let self = self else { return }; if self.chinese { self.type("'") } else { self.caps.toggle(); self.drawPad() } },
      button(chinese ? "，" : ",") { [weak self] in guard let self = self else { return }; self.type(self.chinese ? "，" : ",") },
      button("空格") { [weak self] in guard let self = self else { return }; if self.spelling.isEmpty { self.textDocumentProxy.insertText(" ") } else { self.choose(0) } },
      button(chinese ? "。" : ".") { [weak self] in guard let self = self else { return }; self.type(self.chinese ? "。" : ".") },
      button("⌫") { [weak self] in guard let self = self else { return }; if self.spelling.isEmpty { self.textDocumentProxy.deleteBackward() } else { self.spelling.removeLast(); self.updateSpelling() } },
      button("换行") { [weak self] in guard let self = self else { return }; if self.spelling.isEmpty { self.textDocumentProxy.insertText("\n") } else { self.commitPending() } }
    ])
    for control in bottom.arrangedSubviews.compactMap({ $0 as? UIButton }) {
      control.titleLabel?.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: .systemFont(ofSize: 15), maximumPointSize: 18)
      control.titleLabel?.numberOfLines = 1; control.titleLabel?.adjustsFontSizeToFitWidth = true; control.titleLabel?.minimumScaleFactor = 0.7
    }
    pad.addArrangedSubview(bottom)
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
  @discardableResult private func setPrompt(_ text: String) -> Bool {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines), max = topicMode ? 200 : 1000
    guard !value.isEmpty, value.utf16.count <= max else { status.text = value.isEmpty ? "没有可用文字，原内容仍保留" : "内容超过\(max)字，请缩短后重试；原内容仍保留"; return false }
    revision += 1; task?.cancel(); task = nil; prompt = value; topicAI = []; clear(candidates); renderPrompt(); if topicMode { renderTopics() }; return true
  }
  private func addTopic(_ text: String) {
    let current = revision
    candidates.addArrangedSubview(button(text) { [weak self] in
      guard let self = self, self.revision == current, !self.directOnly, !self.refreshSettings(), self.revision == current else { return }
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
    generateButton?.setTitle(task != nil ? "停止生成" : topicMode ? "AI 找话题" : polishMode ? "润色我的话" : "生成回复", for: .normal)
    generateButton?.isEnabled = hasFullAccess && !directOnly && (topicMode || !prompt.isEmpty)
    if !hasFullAccess { status.text = "请在设置中为聊商键盘开启“允许完全访问”，以连接 AI" }
    else if task == nil { status.text = "点击生成才发送消息，点击候选才填入聊天框" }
  }
  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    _ = refreshSettings(); reloadPersona(); configureInputType(); updatePanelLayout(); renderPrompt(); renderSpelling(); if topicMode { renderTopics() }
  }
  private func configureInputType() {
    let type = textDocumentProxy.keyboardType ?? .default
    guard previousKeyboardType != type else { return }; previousKeyboardType = type
    directOnly = [.emailAddress, .URL, .asciiCapable, .numberPad, .phonePad, .decimalPad, .asciiCapableNumberPad].contains(type)
    if directOnly { aiContainer.isHidden = true; updatePanelLayout() }
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
    if task != nil { revision += 1; task?.cancel(); task = nil; renderPrompt(); status.text = "已停止生成，可以修改内容后重试"; return }
    let isTopic = topicMode
    guard hasFullAccess, !directOnly, (isTopic || !prompt.isEmpty) else { renderPrompt(); return }
    _ = refreshSettings()
    do {
      let snapshot = try vault.snapshot()
      guard let config = snapshot.0 else { throw AIProblem.message("请打开聊商 → 我的 → 我的 API，保存自己的地址、密钥和模型") }
      commitPending(); revision += 1; let requestRevision = revision, document = textDocumentProxy.documentIdentifier
      let settings = try signature()
      var body = PersonaPreferences().requestFields()
      body["prompt"] = prompt; body["style"] = isTopic ? "friendly" : ["friendly", "professional", "funny", "emoji"][replyTone]; body["candidateCount"] = isTopic ? 3 : replyCount
      body["purpose"] = polishMode ? "polish" : "reply"
      if isTopic { body["category"] = topicCategory; body["avoid"] = topicAI.prefix(6).map { String($0.prefix(300)) } }
      let personal = (try? AIJSON.object(sharedPreferences?.string(forKey: "personalization") ?? "{}", limit: 100000)) ?? [:]
      clear(candidates); let client = AIClient(); task = client; renderPrompt(); status.text = "正在请求你的 API…"
      try client.start(path: isTopic ? "topics" : "reply", payload: body, config: config, persona: personal, current: { [vault] in
        guard try vault.revision() == snapshot.1 else { throw AIProblem.cancelled }
      }, completion: { [weak self] result in
        DispatchQueue.main.async {
          guard let self = self, self.revision == requestRevision, self.textDocumentProxy.documentIdentifier == document else { return }
          self.task = nil; self.renderPrompt()
          guard self.hasFullAccess, !self.directOnly, (try? self.signature()) == settings else { _ = self.refreshSettings(); self.status.text = "设置或输入框已变化，请重新生成"; return }
          switch result {
          case .failure(let error): self.status.text = error.localizedDescription
          case .success(let response):
            let replies = response["candidates"] as? [String] ?? []
            if isTopic { self.topicAI = replies }
            self.status.text = "\(replies.count) 条候选 · 点选填入后可继续编辑"
            for reply in replies {
              let control = self.button(reply) { [weak self] in
                guard let self = self, self.revision == requestRevision, self.hasFullAccess, !self.directOnly,
                      self.textDocumentProxy.documentIdentifier == document, (try? self.signature()) == settings else { _ = self?.refreshSettings(); return }
                self.commitPending(); self.textDocumentProxy.insertText(reply)
                self.revision += 1; self.clear(self.candidates); self.topicAI = []; self.status.text = "已填入，请确认后发送"
              }
              control.contentHorizontalAlignment = .leading; control.contentEdgeInsets = UIEdgeInsets(top: 10, left: 12, bottom: 10, right: 12)
              self.candidates.addArrangedSubview(control)
            }
          }
        }
      })
    } catch { task?.cancel(); task = nil; renderPrompt(); status.text = error.localizedDescription }
  }
}
