import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers
import ImageIO

// Explicit document selection/export. No Photos permission, broad storage access or retained URI grants.
final class ChatQFiles: NSObject, UIDocumentPickerDelegate {
  private var pending: Promise?
  private var exporting = false
  private var temporary: URL?
  private var sequence = 0
  private var activePicker: UIDocumentPickerViewController?
  private func present(_ picker: UIDocumentPickerViewController, promise: Promise) {
    guard pending == nil else { promise.reject("FILE_BUSY", "已有文件操作正在进行"); return }; sequence += 1; pending = promise; picker.delegate = self; activePicker = picker
    guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow }), var host = window.rootViewController else { finish(error: "无法打开文件选择器"); return }
    while let next = host.presentedViewController { host = next }; host.present(picker, animated: true)
  }
  func pick(_ kind: String, promise: Promise) { DispatchQueue.main.async {
    guard self.pending == nil else { promise.reject("FILE_BUSY", "已有文件操作正在进行"); return }
    guard ["image", "file"].contains(kind) else { promise.reject("FILE_TYPE", "附件类型不支持"); return }; self.exporting = false
    self.present(UIDocumentPickerViewController(forOpeningContentTypes: kind == "image" ? [.image] : [.plainText, .pdf, .commaSeparatedText, .json, .data], asCopy: true), promise: promise)
  } }
  func export(_ text: String, format: String, promise: Promise) { DispatchQueue.main.async {
    guard self.pending == nil, ["txt", "md"].contains(format), !text.isEmpty, text.utf16.count <= 4000000 else { promise.reject("FILE_EXPORT", "导出内容或状态异常"); return }
    do { let url = FileManager.default.temporaryDirectory.appendingPathComponent("ChatQ-chat-\(UUID().uuidString).\(format)"); try Data(text.utf8).write(to: url, options: [.atomic, .completeFileProtection]); self.temporary = url; self.exporting = true; self.present(UIDocumentPickerViewController(forExporting: [url], asCopy: true), promise: promise) }
    catch { promise.reject("FILE_EXPORT", "文件导出失败") }
  } }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { guard controller === activePicker else { return }; finish(value: exporting ? "cancelled" : nil) }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard controller === activePicker else { return }; let ticket = sequence
    if exporting { finish(value: "saved"); return }; guard let url = urls.first else { finish(); return }
    DispatchQueue.global(qos: .userInitiated).async {
      let granted = url.startAccessingSecurityScopedResource(); defer { if granted { url.stopAccessingSecurityScopedResource() } }
      do {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }; let bytes = try handle.read(upToCount: 4 * 1024 * 1024 + 1) ?? Data()
        guard bytes.count <= 4 * 1024 * 1024 else { throw NSError(domain: "File", code: 1) }
        let name = String(url.lastPathComponent.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.map(String.init).joined().prefix(100))
        let mime: String, content: String
        if let source = CGImageSourceCreateWithData(bytes as CFData, nil), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int, width <= 30000, height <= 30000, let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 1280] as CFDictionary), let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.75), jpeg.count <= 512000 { mime = "image/jpeg"; content = "data:image/jpeg;base64," + jpeg.base64EncodedString() }
        else if bytes.prefix(5) == Data("%PDF-".utf8), bytes.count <= 512000 { mime = "application/pdf"; content = "data:application/pdf;base64," + bytes.base64EncodedString() }
        else if ["txt", "md", "csv", "json", "log"].contains(url.pathExtension.lowercased()), bytes.count <= 48000, let text = String(data: bytes, encoding: .utf8), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 12000, !text.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) && ![9, 10, 13].contains(Int($0.value)) }) { mime = "text/plain"; content = text }
        else { throw NSError(domain: "File", code: 2) }
        let value: [String: Any] = ["id": UUID().uuidString, "name": name.isEmpty ? "附件" : name, "mime": mime, "content": content]
        let result = String(data: try JSONSerialization.data(withJSONObject: value), encoding: .utf8)!; DispatchQueue.main.async { self.finish(value: result, sequence: ticket) }
      } catch { DispatchQueue.main.async { self.finish(error: "附件读取失败，支持图片、500KB 内 PDF 和12000字内 UTF-8 文本，原文件最多4MB", sequence: ticket) } }
    }
  }
  private func finish(value: String? = nil, error: String? = nil, sequence expected: Int? = nil) { if let expected = expected, expected != sequence { return }; let promise = pending; pending = nil; activePicker = nil; if let file = temporary { try? FileManager.default.removeItem(at: file) }; temporary = nil; if let error = error { promise?.reject("CHATQ_FILE", error) } else { promise?.resolve(value) } }
  func cancel() { DispatchQueue.main.async { self.finish(value: self.exporting ? "cancelled" : nil) } }
}
