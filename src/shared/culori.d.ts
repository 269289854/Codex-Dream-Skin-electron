declare module 'culori' {
  export interface ParsedColor {
    mode: string
    alpha?: number
    [channel: string]: string | number | undefined
  }

  export function parse(color: string): ParsedColor | undefined
}
