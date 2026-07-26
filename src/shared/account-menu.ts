export const ACCOUNT_MENU_ITEMS = [
  {
    id: 'account',
    label: '账号信息',
    aliases: [],
    iconName: 'user',
    iconSlot: 'accountMenuAccount',
    fontSlot: 'accountMenuAccount',
    previewTarget: 'account-menu-account'
  },
  {
    id: 'team',
    label: '团队',
    aliases: [],
    iconName: 'users',
    iconSlot: 'accountMenuTeam',
    fontSlot: 'accountMenuTeam',
    previewTarget: 'account-menu-team'
  },
  {
    id: 'usage',
    label: '剩余用量',
    aliases: ['剩余用量', 'Usage left'],
    iconName: 'clock',
    iconSlot: 'accountMenuUsage',
    fontSlot: 'accountMenuUsage',
    previewTarget: 'account-menu-usage'
  },
  {
    id: 'hidePet',
    label: '隐藏宠物',
    aliases: ['隐藏宠物', 'Hide pet'],
    iconName: 'eye',
    iconSlot: 'accountMenuHidePet',
    fontSlot: 'accountMenuHidePet',
    previewTarget: 'account-menu-hide-pet'
  },
  {
    id: 'settings',
    label: '设置',
    aliases: ['设置', 'Settings'],
    iconName: 'settings',
    iconSlot: 'accountMenuSettings',
    fontSlot: 'accountMenuSettings',
    previewTarget: 'account-menu-settings'
  },
  {
    id: 'logout',
    label: '退出登录',
    aliases: ['退出登录', 'Log out'],
    iconName: 'arrow-right',
    iconSlot: 'accountMenuLogout',
    fontSlot: 'accountMenuLogout',
    previewTarget: 'account-menu-logout'
  }
] as const

export type AccountMenuItem = (typeof ACCOUNT_MENU_ITEMS)[number]
export type AccountMenuItemId = AccountMenuItem['id']
