import {
  ArrowUp, Droplet, FolderCode, Heart, Image, Music, Pin, Snowflake, Sparkles, Star, WandSparkles,
  type LucideIcon
} from 'lucide-react'

export const builtinIcons: Record<string, LucideIcon> = {
  music: Music,
  sparkles: Sparkles,
  'wand-sparkles': WandSparkles,
  image: Image,
  send: ArrowUp,
  'folder-code': FolderCode,
  heart: Heart,
  droplet: Droplet,
  star: Star,
  snowflake: Snowflake,
  pin: Pin
}

export const builtinIconOptions = Object.keys(builtinIcons)
