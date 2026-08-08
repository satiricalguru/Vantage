import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const svgIcon = path.join(root, 'assets', 'icon.svg')
const buildDir = path.join(root, 'build')
const resourcesIconsDir = path.join(root, 'resources', 'icons')
const pngTarget = path.join(buildDir, 'icon.png')
const resourcesPngTarget = path.join(resourcesIconsDir, 'icon.png')
const icnsTarget = path.join(buildDir, 'icon.icns')
const iconsetDir = path.join(buildDir, 'icon.iconset')

if (!fs.existsSync(svgIcon)) {
  console.error(`[BuildIcon] Source SVG not found: ${svgIcon}`)
  process.exit(1)
}

if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true })
if (!fs.existsSync(resourcesIconsDir)) fs.mkdirSync(resourcesIconsDir, { recursive: true })

const tmpPng = path.join(buildDir, 'tmp_transparent_icon.png')

const swiftScript = `
import AppKit
import WebKit

let app = NSApplication.shared
class Delegate: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.takeSnapshot(with: nil) { img, err in
            if let img = img, let rep = NSBitmapImageRep(data: img.tiffRepresentation!), let png = rep.representation(using: .png, properties: [:]) {
                try? png.write(to: URL(fileURLWithPath: "${tmpPng}"))
            }
            exit(0)
        }
    }
}
let del = Delegate()
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1024, height: 1024))
web.setValue(false, forKey: "drawsBackground")
web.navigationDelegate = del
let html = "<!DOCTYPE html><html><body style=\\"margin:0;padding:0;background:transparent;overflow:hidden;\\"><img src=\\"file://${svgIcon}\\" style=\\"width:1024px;height:1024px;\\" /></body></html>"
web.loadHTMLString(html, baseURL: URL(fileURLWithPath: "${root}"))
app.run()
`

const tempSwiftFile = path.join(buildDir, 'render_icon.swift')
fs.writeFileSync(tempSwiftFile, swiftScript, 'utf8')

try {
  execFileSync('swift', [tempSwiftFile], { stdio: 'ignore' })
} catch (err) {
  console.warn('[BuildIcon] Swift WebKit rendering failed:', err)
} finally {
  if (fs.existsSync(tempSwiftFile)) fs.rmSync(tempSwiftFile, { force: true })
}

if (fs.existsSync(tmpPng) && fs.statSync(tmpPng).size > 0) {
  fs.copyFileSync(tmpPng, pngTarget)
  fs.copyFileSync(tmpPng, resourcesPngTarget)

  if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true })
  const sizes = [16, 32, 64, 128, 256, 512, 1024]
  for (const size of sizes) {
    if (size === 1024) {
      execFileSync('sips', ['-z', String(size), String(size), tmpPng, '--out', path.join(iconsetDir, 'icon_512x512@2x.png')], { stdio: 'ignore' })
    } else if (size === 16) {
      execFileSync('sips', ['-z', String(size), String(size), tmpPng, '--out', path.join(iconsetDir, 'icon_16x16.png')], { stdio: 'ignore' })
      execFileSync('sips', ['-z', '32', '32', tmpPng, '--out', path.join(iconsetDir, 'icon_16x16@2x.png')], { stdio: 'ignore' })
    } else if (size === 32) {
      execFileSync('sips', ['-z', '32', '32', tmpPng, '--out', path.join(iconsetDir, 'icon_32x32.png')], { stdio: 'ignore' })
      execFileSync('sips', ['-z', '64', '64', tmpPng, '--out', path.join(iconsetDir, 'icon_32x32@2x.png')], { stdio: 'ignore' })
    } else if (size === 128) {
      execFileSync('sips', ['-z', '128', '128', tmpPng, '--out', path.join(iconsetDir, 'icon_128x128.png')], { stdio: 'ignore' })
      execFileSync('sips', ['-z', '256', '256', tmpPng, '--out', path.join(iconsetDir, 'icon_128x128@2x.png')], { stdio: 'ignore' })
    } else if (size === 256) {
      execFileSync('sips', ['-z', '256', '256', tmpPng, '--out', path.join(iconsetDir, 'icon_256x256.png')], { stdio: 'ignore' })
      execFileSync('sips', ['-z', '512', '512', tmpPng, '--out', path.join(iconsetDir, 'icon_256x256@2x.png')], { stdio: 'ignore' })
    } else if (size === 512) {
      execFileSync('sips', ['-z', '512', '512', tmpPng, '--out', path.join(iconsetDir, 'icon_512x512.png')], { stdio: 'ignore' })
    }
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsTarget], { stdio: 'ignore' })
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  fs.rmSync(tmpPng, { force: true })
  console.log('[BuildIcon] Successfully generated transparent PNG & ICNS app icons!')
}
