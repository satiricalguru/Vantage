import { BrowserWindow, shell } from 'electron'

/**
 * Navigation hardening applied to every renderer window.
 *
 * - Blocks main-frame navigation / redirects away from the exact page the
 *   window was created with (plus the electron-vite dev-server origin in dev).
 * - Denies `window.open()` entirely; https: / mailto: URLs are routed to the
 *   system browser instead.
 *
 * Without this, a renderer tricked into navigating to an attacker page would
 * inherit the full main-process IPC surface, because the IPC trust check
 * accepts any `file://` URL (see isTrustedIpcSender in index.ts).
 */
export function hardenWindowNavigation(win: BrowserWindow, pageUrl: string): void {
  const page = pageUrl.split('?')[0].split('#')[0]

  let devOrigin: string | null = null
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    try {
      devOrigin = new URL(rendererUrl).origin
    } catch {
      devOrigin = null
    }
  }

  const isSettledPageUrl = (url: string): boolean => {
    try {
      return new URL(url.split('?')[0].split('#')[0]).href === page
    } catch {
      return false
    }
  }

  const isAllowedUrl = (url: string): boolean => {
    if (isSettledPageUrl(url)) return true
    if (devOrigin) {
      try {
        if (new URL(url).origin === devOrigin) return true
      } catch {
        /* fall through */
      }
    }
    return false
  }

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      console.warn('[NavigationGuard] Blocked navigation to:', url)
      event.preventDefault()
    }
  })

  win.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedUrl(url)) {
      console.warn('[NavigationGuard] Blocked redirect to:', url)
      event.preventDefault()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    let parsed: URL | null = null
    try {
      parsed = new URL(url)
    } catch {
      parsed = null
    }
    if (parsed && (parsed.protocol === 'https:' || parsed.protocol === 'mailto:')) {
      void shell.openExternal(parsed.href).catch((err) => {
        console.warn('[NavigationGuard] openExternal failed:', url, err)
      })
    } else if (parsed) {
      console.warn('[NavigationGuard] Denied window.open for:', url)
    }
    return { action: 'deny' }
  })
}