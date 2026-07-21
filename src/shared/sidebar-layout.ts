export const DEFAULT_SIDEBAR_COPY = {
  sidebarModeTitle: 'Codex',
  sidebarProjectsTitle: '项目',
  sidebarTasksTitle: '任务'
} as const

export const DEFAULT_SIDEBAR_NAV_COPY = {
  sidebarNavNewTask: '新建任务',
  sidebarNavPullRequests: '拉取请求',
  sidebarNavSites: '站点',
  sidebarNavScheduled: '已安排',
  sidebarNavPlugins: '插件'
} as const

export const SIDEBAR_NAV_ITEMS = [
  {
    id: 'newTask',
    label: '新建任务',
    aliases: ['新建任务', 'New task'],
    iconName: 'square-pen',
    iconSlot: 'sidebarNavNewTask',
    copyField: 'sidebarNavNewTask',
    fontSlot: 'sidebarNavNewTask',
    previewTarget: 'sidebar-nav-new-task'
  },
  {
    id: 'pullRequests',
    label: '拉取请求',
    aliases: ['拉取请求', 'Pull requests'],
    iconName: 'git-pull-request',
    iconSlot: 'sidebarNavPullRequests',
    copyField: 'sidebarNavPullRequests',
    fontSlot: 'sidebarNavPullRequests',
    previewTarget: 'sidebar-nav-pull-requests'
  },
  {
    id: 'sites',
    label: '站点',
    aliases: ['站点', 'Sites'],
    iconName: 'grid-2x2',
    iconSlot: 'sidebarNavSites',
    copyField: 'sidebarNavSites',
    fontSlot: 'sidebarNavSites',
    previewTarget: 'sidebar-nav-sites'
  },
  {
    id: 'scheduled',
    label: '已安排',
    aliases: ['已安排', 'Scheduled'],
    iconName: 'clock-3',
    iconSlot: 'sidebarNavScheduled',
    copyField: 'sidebarNavScheduled',
    fontSlot: 'sidebarNavScheduled',
    previewTarget: 'sidebar-nav-scheduled'
  },
  {
    id: 'plugins',
    label: '插件',
    aliases: ['插件', 'Plugins'],
    iconName: 'at-sign',
    iconSlot: 'sidebarNavPlugins',
    copyField: 'sidebarNavPlugins',
    fontSlot: 'sidebarNavPlugins',
    previewTarget: 'sidebar-nav-plugins'
  }
] as const

export type SidebarNavItem = (typeof SIDEBAR_NAV_ITEMS)[number]
export type SidebarNavId = SidebarNavItem['id']
