import { builtinIcons } from '../../shared/builtin-icons'
import { SYSTEM_ICON_NAMES } from '../../shared/project-icons'

export { builtinIcons }

export const builtinIconLabels: Readonly<Record<string, string>> = Object.freeze({
  music: '音乐', sparkles: '闪烁', 'wand-sparkles': '魔法闪烁', image: '图片', send: '发送', 'folder-code': '代码文件夹',
  'square-pen': '新建任务', 'git-pull-request': '拉取请求', 'grid-2x2': '站点', 'clock-3': '已安排', 'at-sign': '插件',
  heart: '爱心', droplet: '水滴', star: '星星', snowflake: '雪花', pin: '图钉', home: '首页', search: '搜索', settings: '设置',
  menu: '菜单', plus: '加号', minus: '减号', check: '勾选', 'check-circle': '完成', close: '关闭', 'arrow-up': '向上箭头',
  'arrow-down': '向下箭头', 'arrow-left': '向左箭头', 'arrow-right': '向右箭头', 'chevron-up': '向上折叠', 'chevron-down': '向下展开',
  'chevron-left': '向左切换', 'chevron-right': '向右切换', circle: '圆形', square: '方形', sun: '太阳', moon: '月亮', cloud: '云朵',
  zap: '闪电', 'book-open': '打开的书', bookmark: '书签', bell: '铃铛', calendar: '日历', clock: '时钟', user: '用户', users: '用户组',
  'message-circle': '对话', mail: '邮件', globe: '地球', laptop: '电脑', folder: '文件夹', 'folder-open': '打开的文件夹', file: '文件',
  'file-code': '代码文件', code: '代码', terminal: '终端', copy: '复制', download: '下载', external: '外链', link: '链接', paperclip: '附件',
  pencil: '铅笔', brush: '画笔', palette: '调色板', camera: '相机', video: '视频', mic: '麦克风', play: '播放', rocket: '火箭',
  lightbulb: '灵感', shield: '盾牌', lock: '锁定', key: '钥匙', eye: '查看', info: '信息', list: '列表', 'more-horizontal': '更多',
  'map-pin': '地图定位', smile: '笑脸', 'thumbs-up': '点赞', trash: '删除',
  cube: '立方体', grid: '网格', nodes: '节点', chat: '聊天', planet: '行星', shirt: '衣服',
  'git-branch': '分支', 'pull-request': '拉取请求', bug: '故障', database: '数据库', server: '服务器',
  api: 'API', brackets: '括号', function: '函数', package: '软件包', wrench: '工具', paintbrush: '画笔',
  layout: '布局', component: '组件', checklist: '清单', 'calendar-check': '日历完成', target: '目标',
  flag: '旗帜', book: '书本', message: '消息', at: '艾特', upload: '上传', film: '胶片', wand: '魔法棒',
  rainbow: '彩虹', flower: '花朵', leaf: '叶子', gem: '宝石', crown: '皇冠', help: '帮助'
})

export const builtinIconOptions = [...SYSTEM_ICON_NAMES]
