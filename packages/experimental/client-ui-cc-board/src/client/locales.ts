/** Localized copy for the cc-session board page. `zh` is the key-set source of truth. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'cc-board'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  'panel': '会话看板',
  'refresh': '刷新',
  'pause': '暂停轮询',
  'resume': '继续轮询',
  'paused': '已暂停',
  'loading': '正在读取看板…',
  'empty': '看板上没有会话',
  'sessions': '会话',
  'nodes': '节点',
  'unreachable': '未连通',
  'stale': '看板给的是旧答案',
  'staleAge': '旧了 {age} 秒',
  'freshness': '{age} 秒前读到',
  'scan': '扫法',
  'cwd': '工作目录',
  'role': '角色',
  'self': '当前看板进程',
  'readonly': '不可写',
  'screenEmpty': '这一屏是空的',
  'screenWaiting': '还没读到这一屏',
  'paneFailed': '这一屏读不到：{reason}',
  'composer': '输入要发给这个会话的内容',
  'composerFor': '输入要发给 {name} 的内容',
  'send': '发送',
  'sending': '发送中…',
  'sendHint': 'Enter 发送，Shift+Enter 换行',
  'sent': '已送达',
  'refused': '看板拒绝了这次写入：{reason}',
  'failed': '失败：{reason}',
} satisfies Record<string, string>

/** Key set of this plugin's dictionaries. */
export type CcBoardKey = keyof typeof zh

/** English dictionary. */
export const en = {
  'panel': 'Session board',
  'refresh': 'Refresh',
  'pause': 'Pause polling',
  'resume': 'Resume polling',
  'paused': 'Paused',
  'loading': 'Reading the board…',
  'empty': 'The board reports no sessions',
  'sessions': 'sessions',
  'nodes': 'nodes',
  'unreachable': 'unreachable',
  'stale': 'The board served a remembered answer',
  'staleAge': '{age}s old',
  'freshness': 'read {age}s ago',
  'scan': 'sweep',
  'cwd': 'Directory',
  'role': 'Role',
  'self': 'this board process',
  'readonly': 'read-only',
  'screenEmpty': 'This screen is empty',
  'screenWaiting': 'No screen read yet',
  'paneFailed': 'This screen could not be read: {reason}',
  'composer': 'Type into this session',
  'composerFor': 'Type into {name}',
  'send': 'Send',
  'sending': 'Sending…',
  'sendHint': 'Enter sends, Shift+Enter adds a line',
  'sent': 'Delivered',
  'refused': 'The board refused this write: {reason}',
  'failed': 'Failed: {reason}',
} satisfies Record<CcBoardKey, string>
