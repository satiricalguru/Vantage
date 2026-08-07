import path from 'node:path'

/**
 * Build a media:// URL without allowing filename characters such as #, ?, or %
 * to be interpreted as URL syntax.
 */
export function toMediaUrl(filePath: string): string {
  const encodedPath = filePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join(path.sep)

  return `media://${encodedPath}`
}
