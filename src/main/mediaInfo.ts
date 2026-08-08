import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

interface Dimensions {
  width: number
  height: number
}

const DEFAULT_DIMENSIONS: Dimensions = { width: 1920, height: 1080 }

/**
 * Async dimension extractor for images and videos on macOS.
 * Uses lightweight binary header parsing for common image formats (PNG, JPEG)
 * and falls back to macOS `sips` / `mdls` CLI tools.
 */
export async function getMediaDimensions(filePath: string): Promise<Dimensions> {
  try {
    const ext = path.extname(filePath).toLowerCase()

    // 1. Fast binary header parsing for PNG/JPEG
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const fd = await fs.promises.open(filePath, 'r')
      try {
        const buffer = Buffer.alloc(128)
        await fd.read(buffer, 0, 128, 0)

        // PNG: 8-byte signature, IHDR chunk width at offset 16, height at offset 20
        if (buffer.length >= 24 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
          const width = buffer.readUInt32BE(16)
          const height = buffer.readUInt32BE(20)
          if (width > 0 && height > 0) return { width, height }
        }

        // JPEG: Find SOF marker (scan a bounded prefix instead of reading the whole file)
        if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
          const scanLimit = 4 * 1024 * 1024
          const chunks: Buffer[] = [buffer]
          let scanned = buffer.length
          const fd2 = await fs.promises.open(filePath, 'r')
          try {
            let seek = buffer.length
            while (seek < scanLimit) {
              const next = Buffer.alloc(256 * 1024)
              const { bytesRead } = await fd2.read(next, 0, next.length, seek)
              if (bytesRead === 0) break
              chunks.push(next.subarray(0, bytesRead))
              scanned += bytesRead
              seek += bytesRead
              if (scanned >= scanLimit) break
            }
          } finally {
            await fd2.close()
          }
          const fullBuf = Buffer.concat(chunks)
          let offset = 2
          while (offset < fullBuf.length - 8) {
            if (fullBuf[offset] !== 0xff) { offset++; continue }
            const marker = fullBuf[offset + 1]
            if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
                (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
              const height = fullBuf.readUInt16BE(offset + 5)
              const width = fullBuf.readUInt16BE(offset + 7)
              if (width > 0 && height > 0) return { width, height }
            }
            const blockLength = fullBuf.readUInt16BE(offset + 2)
            offset += 2 + blockLength
          }
        }
      } finally {
        await fd.close()
      }

      // macOS sips fallback for WEBP, HEIC, TIFF, etc.
      if (process.platform === 'darwin') {
        try {
          const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath])
          const wMatch = stdout.match(/pixelWidth:\s*(\d+)/)
          const hMatch = stdout.match(/pixelHeight:\s*(\d+)/)
          if (wMatch && hMatch) {
            return { width: parseInt(wMatch[1], 10), height: parseInt(hMatch[1], 10) }
          }
        } catch { /* ignore CLI failure */ }
      }
    }

    // 2. Video dimensions via macOS mdls
    if (process.platform === 'darwin' && ['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) {
      try {
        const { stdout } = await execFileAsync('mdls', ['-name', 'kMDItemPixelWidth', '-name', 'kMDItemPixelHeight', filePath])
        const wMatch = stdout.match(/kMDItemPixelWidth\s*=\s*(\d+)/)
        const hMatch = stdout.match(/kMDItemPixelHeight\s*=\s*(\d+)/)
        if (wMatch && hMatch) {
          return { width: parseInt(wMatch[1], 10), height: parseInt(hMatch[1], 10) }
        }
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.warn('[MediaInfo] Could not read dimensions for:', filePath, err)
  }

  return DEFAULT_DIMENSIONS
}
