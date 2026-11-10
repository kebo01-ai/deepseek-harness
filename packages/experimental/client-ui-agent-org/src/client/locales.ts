/** Agent-organization Web dictionaries. */

/** Locale namespace owned by the agent-organization Web UI. */
export const NS = 'agent-org'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  trigger: '组织',
  refresh: '刷新组织',
  close: '关闭',
  loading: '正在加载组织…',
  empty: '这个会话还不属于任何组织',
  roster: '成员',
  open: '打开成员会话',
  manager: 'manager',
  worker: 'worker',
  self: '当前会话',
  joined: '加入于',
  'status.running': '运行中',
  'status.inactive': '未运行',
  'status.unobserved': '未观测',
  'status.unobserved.hint': '组织只记成员资格，不与活会话对账；这个会话这会儿没有可读的活动观测。',
} satisfies Record<string, string>

/** Agent-organization locale key union. */
export type OrgKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  trigger: 'Organizations',
  refresh: 'Refresh organizations',
  close: 'Close',
  loading: 'Loading organizations…',
  empty: 'This session belongs to no organization yet',
  roster: 'Members',
  open: 'Open member conversation',
  manager: 'manager',
  worker: 'worker',
  self: 'Current session',
  joined: 'Joined',
  'status.running': 'Running',
  'status.inactive': 'Inactive',
  'status.unobserved': 'Unobserved',
  'status.unobserved.hint': 'An organization stores membership and never reconciles it against live Sessions; no activity observation is readable for this session right now.',
} satisfies Record<OrgKey, string>
