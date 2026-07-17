import {
  FolderCode, Heart, Image, Music, Pin, Send, Sparkles, WandSparkles,
  type LucideIcon
} from 'lucide-react'

export const builtinIcons: Record<string, LucideIcon> = {
  music: Music,
  sparkles: Sparkles,
  'wand-sparkles': WandSparkles,
  image: Image,
  send: Send,
  'folder-code': FolderCode,
  heart: Heart,
  pin: Pin
}

export const builtinIconOptions = Object.keys(builtinIcons)
