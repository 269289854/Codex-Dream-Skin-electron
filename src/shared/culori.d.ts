declare module 'culori' {
  export interface ParsedColor {
    mode: string
    alpha?: number
    [channel: string]: string | number | undefined
  }

  export function parse(color: string): ParsedColor | undefined
  export function formatHex(color: ParsedColor | string): string | undefined
  export function formatHex8(color: ParsedColor | string): string | undefined
  export function formatRgb(color: ParsedColor | string): string | undefined
  export function converter(mode: 'rgb'): (color: ParsedColor | string) => ParsedColor | undefined
}
