const glyphs: Record<string, string> = {
  music: '♫',
  sparkles: '✦',
  'wand-sparkles': '✧',
  image: '▣',
  send: '➤',
  'folder-code': '⌘',
  heart: '♥',
  pin: '●'
}

export const BUILTIN_ICON_GLYPHS: Readonly<Record<string, string>> = Object.freeze(glyphs)

export function resolveBuiltinIconGlyph(name: string, fallback = BUILTIN_ICON_GLYPHS.sparkles ?? '✦'): string {
  return BUILTIN_ICON_GLYPHS[name] ?? fallback
}
