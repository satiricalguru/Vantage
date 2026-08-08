import AppKit
import AVFoundation
import ScreenSaver

@objc(VantageScreenSaverView)
final class VantageScreenSaverView: ScreenSaverView {
    private var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var playerLayer: AVPlayerLayer?
    private var imageLayer: CALayer?

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        configureView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configureView()
    }

    private func configureView() {
        animationTimeInterval = 1.0 / 30.0
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        configureContent()
    }

    override var hasConfigureSheet: Bool { false }

    override var configureSheet: NSWindow? { nil }

    override func startAnimation() {
        super.startAnimation()
        player?.play()
    }

    override func stopAnimation() {
        player?.pause()
        super.stopAnimation()
    }

    override func animateOneFrame() {
        // AVPlayer or CALayer drives rendering.
    }

    override func draw(_ rect: NSRect) {
        NSColor.black.setFill()
        rect.fill()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        updateLayout()
    }

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        updateLayout()
    }

    private func updateLayout() {
        playerLayer?.frame = bounds
        imageLayer?.frame = bounds
    }

    private func configureContent() {
        guard let mediaURL = selectedMediaURL() else { return }

        let ext = mediaURL.pathExtension.lowercased()
        let imageExtensions = ["jpg", "jpeg", "png", "webp", "heic", "tiff"]

        if imageExtensions.contains(ext), let image = NSImage(contentsOf: mediaURL) {
            let imgLayer = CALayer()
            imgLayer.frame = bounds
            imgLayer.contentsGravity = .resizeAspectFill
            imgLayer.contents = image.layerContents(forContentsScale: window?.backingScaleFactor ?? 2.0)
            layer?.addSublayer(imgLayer)
            imageLayer = imgLayer
        } else {
            let item = AVPlayerItem(url: mediaURL)
            let queue = AVQueuePlayer(playerItem: item)
            player = queue
            looper = AVPlayerLooper(player: queue, templateItem: item)

            let videoLayer = AVPlayerLayer(player: queue)
            videoLayer.videoGravity = .resizeAspectFill
            videoLayer.frame = bounds
            layer?.addSublayer(videoLayer)
            playerLayer = videoLayer
        }
    }

    private func selectedMediaURL() -> URL? {
        let fileManager = FileManager.default
        let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let selectionFile = applicationSupport
            .appendingPathComponent("Vantage", isDirectory: true)
            .appendingPathComponent("screen-saver-video.txt")

        if let selectedPath = try? String(contentsOf: selectionFile, encoding: .utf8) {
            let trimmedPath = selectedPath.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedPath.isEmpty {
                let selectedURL = URL(fileURLWithPath: trimmedPath)
                let ext = selectedURL.pathExtension.lowercased()
                let validExtensions = ["mp4", "mov", "webm", "jpg", "jpeg", "png", "webp", "heic", "tiff"]
                if validExtensions.contains(ext) && fileManager.isReadableFile(atPath: selectedURL.path) {
                    return selectedURL
                }
            }
        }

        return Bundle(for: VantageScreenSaverView.self)
            .url(forResource: "VantageDefault", withExtension: "mp4")
    }
}

