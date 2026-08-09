import AppKit
import AVFoundation
import ScreenSaver

@objc(VantageScreenSaverView)
final class VantageScreenSaverView: ScreenSaverView {
    private var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var playerLayer: AVPlayerLayer?
    private var imageLayer: CALayer?
    private var statusObservation: NSKeyValueObservation?
    private var didFallbackToDefault = false

    private static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "webp", "heic", "tiff"]

    deinit {
        teardownMedia()
    }

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
        if player == nil && imageLayer == nil {
            configureContent()
        }
        player?.play()
    }

    override func stopAnimation() {
        // Pause only here — the view instance stays alive (e.g. in System
        // Settings' preview) and is reused across startAnimation calls.
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
        if window == nil {
            // View left its window (preview panel torn down); release media
            // resources instead of leaving the looper/player machinery running.
            teardownMedia()
        } else {
            updateLayout()
        }
    }

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        updateLayout()
    }

    private func updateLayout() {
        playerLayer?.frame = bounds
        imageLayer?.frame = bounds
    }

    private func teardownMedia() {
        statusObservation?.invalidate()
        statusObservation = nil
        player?.pause()
        player = nil
        looper = nil
        playerLayer?.removeFromSuperlayer()
        playerLayer = nil
        imageLayer?.removeFromSuperlayer()
        imageLayer = nil
    }

    private func configureContent() {
        // Guard against double configuration (init variants are both invoked
        // in some System Settings flows; reconfiguration after teardown is fine).
        guard player == nil && imageLayer == nil else { return }
        guard let mediaURL = selectedMediaURL() else { return }

        let ext = mediaURL.pathExtension.lowercased()
        if VantageScreenSaverView.imageExtensions.contains(ext), let image = NSImage(contentsOf: mediaURL) {
            let imgLayer = CALayer()
            imgLayer.frame = bounds
            imgLayer.contentsGravity = .resizeAspectFill
            imgLayer.contents = image.layerContents(forContentsScale: window?.backingScaleFactor ?? 2.0)
            layer?.addSublayer(imgLayer)
            imageLayer = imgLayer
        } else {
            setupVideo(url: mediaURL)
        }
    }

    private func setupVideo(url: URL) {
        let item = AVPlayerItem(url: url)
        let queue = AVQueuePlayer(playerItem: item)
        player = queue
        looper = AVPlayerLooper(player: queue, templateItem: item)

        let videoLayer = AVPlayerLayer(player: queue)
        videoLayer.videoGravity = .resizeAspectFill
        videoLayer.frame = bounds
        layer?.addSublayer(videoLayer)
        playerLayer = videoLayer

        // A corrupt / unplayable file (or an un-requested codec) would
        // otherwise silently black-screen; observe status and fall back.
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            guard let self else { return }
            DispatchQueue.main.async {
                if item.status == .failed {
                    self.handlePlaybackFailure()
                }
            }
        }
    }

    private func handlePlaybackFailure() {
        guard !didFallbackToDefault else {
            NSLog("[VantageScreenSaver] Default video also failed; showing black.")
            teardownMedia()
            return
        }
        didFallbackToDefault = true
        NSLog("[VantageScreenSaver] Selected media failed to load; falling back to bundled default.")
        teardownMedia()
        guard let fallback = Bundle(for: VantageScreenSaverView.self)
            .url(forResource: "VantageDefault", withExtension: "mp4") else { return }
        setupVideo(url: fallback)
        player?.play()
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
                // Note: webm is deliberately excluded — AVFoundation cannot
                // decode it and would render a silent black screen.
                let validVideoExtensions = ["mp4", "mov", "m4v"]
                if (validVideoExtensions.contains(ext) || VantageScreenSaverView.imageExtensions.contains(ext))
                    && fileManager.isReadableFile(atPath: selectedURL.path) {
                    return selectedURL
                }
            }
        }

        return Bundle(for: VantageScreenSaverView.self)
            .url(forResource: "VantageDefault", withExtension: "mp4")
    }
}