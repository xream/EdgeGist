import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, DragEvent as ReactDragEvent, FormEvent, ReactNode } from 'react'
import type { FileContents as PierreDiffFileContents } from '@pierre/diffs/react'
import { createFileTreeIconResolver, getBuiltInFileIconColor, getBuiltInSpriteSheet } from '@pierre/trees'
import {
  AlertCircle,
  ArrowLeft,
  BetweenHorizontalStart,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleSlash,
  Cloud,
  Clock3,
  Columns2,
  Copy,
  CopyPlus,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FoldVertical,
  Files,
  Gauge,
  GitCommitHorizontal,
  Globe2,
  HardDrive,
  History,
  Image as ImageIcon,
  KeyRound,
  ListOrdered,
  LogIn,
  LogOut,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorSmartphone,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Rows2,
  Save,
  Search,
  ShieldCheck,
  SquarePlus,
  Star,
  Sun,
  TextWrap,
  Trash2,
  Upload,
  WholeWord,
  X,
  type LucideIcon,
} from 'lucide-react'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { filenameHasPathSeparator } from '../filenames'
import { ApiClient, type GistListResult, type SaveGistInput } from './api'
import { isSelectedGistDetailLoading, shouldHideAdminBootShell } from './detail-loading'
import {
  activeDraftFilenames,
  duplicateFilename,
  prependUploadedTextFiles,
  readUploadedTextFiles,
  uploadedTextFilesToUpdateFiles,
  type UploadedTextFile,
} from './file-upload'
import { gistFilePathsByCreatedAt, gistFilesByCreatedAt } from './file-order'
import { FileTreePanel } from './FileTreePanel'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import type {
  AdminStatus,
  CloudflareSettings,
  CloudflareSettingsInput,
  CloudflareUsage,
  D1Plan,
  EdgeGistExportPayload,
  GistDetail,
  GistFile,
  GistHistoryFileChange,
  GistHistoryItem,
  GistSummary,
  WorkersPlan,
} from './types'
import { cn } from './lib/utils'

const bootShellSelector = '[data-edgegist-boot-shell]'
const credentialsStorageKey = 'edgegist.admin.credentials'
const legacyTokenStorageKey = 'edgegist.admin.token'
const LazyCodeMirrorEditor = lazy(() =>
  import('./CodeMirrorEditor').then((module) => ({
    default: module.CodeMirrorEditor,
  })),
)
const LazyMultiFileDiff = lazy(() =>
  import('@pierre/diffs/react').then((module) => ({
    default: module.MultiFileDiff,
  })),
)

type ViewMode = 'content' | 'diff'
type DiffLayout = 'split' | 'unified'
type DiffLayoutPreference = 'auto' | DiffLayout
type DiffIndicatorStyle = 'bars' | 'classic' | 'none'
type DiffInlineMode = 'word-alt' | 'word' | 'char' | 'none'
type DiffViewOptions = {
  indicatorStyle: DiffIndicatorStyle
  inlineMode: DiffInlineMode
  expandUnmodifiedLines: boolean
  showBackgrounds: boolean
  wrapLines: boolean
  showLineNumbers: boolean
}
type AdminSection = 'gists' | 'cloudflare' | 'data'
type GistTypeFilter = 'all' | 'public' | 'secret'
type GistStarFilter = 'all' | 'starred'
type GistSortKey = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'starred-desc' | 'starred-asc'
type ColorModePreference = 'system' | 'light' | 'dark'
type ResolvedColorMode = 'light' | 'dark'
type LocalePreference = 'system' | 'en' | 'zh-CN'
type Locale = 'en' | 'zh-CN'
type ThemePaletteId =
  | 'neutral'
  | 'zinc'
  | 'slate'
  | 'stone'
  | 'gray'
  | 'mauve'
  | 'olive'
  | 'mist'
  | 'taupe'
  | 'sage'
type AdminCredentials = {
  username: string
  password: string
}
type CloudflareSettingsDraft = CloudflareSettingsInput & {
  hasApiToken: boolean
}
type GistEditorMode = 'create' | 'edit'
type FileEditorMode = 'create' | 'edit'
type GistFileDraft = {
  id: string
  originalFilename: string | null
  originalContent: string | null
  filename: string
  language: string | null
  content: string
  deleted: boolean
}
type GistEditorDraft = {
  description: string
  secret: boolean
  visibility: GistSummary['visibility']
  starred: boolean
  files: GistFileDraft[]
}
type GistSearchIndex = {
  files: Record<string, GistSearchIndexFile>
}
type GistSearchIndexFile = {
  content: string
  language: string | null
  raw_url: string
  size: number
  truncated: boolean
  type: string
}
type GistSearchMatch = {
  direct: boolean
  filenames: string[]
  content: GistSearchContentMatch[]
}
type GistSearchContentMatch = {
  content: string
  filename: string
  language: string | null
  matchLine: number
  raw_url: string
  size: number
  startLine: number
  truncated: boolean
  type: string
}
type FileEditorDraft = {
  originalFilename: string | null
  filename: string
  language: string | null
  content: string
}
type ConfirmDialogState = {
  title: string
  description: string
  confirmLabel: string
  variant?: 'default' | 'destructive'
  onConfirm(): Promise<void> | void
}
type PublicConfig = {
  turnstileSiteKey: string | null
}
type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      theme?: 'light' | 'dark' | 'auto'
      size?: 'normal' | 'compact' | 'flexible'
      action?: string
      callback?(token: string): void
      'expired-callback'?(): void
      'error-callback'?(): void
    },
  ): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    __EDGEGIST_PUBLIC_CONFIG__?: Partial<PublicConfig>
    turnstile?: TurnstileApi
  }
}

const colorModeStorageKey = 'edgegist.admin.colorMode'
const themePaletteStorageKey = 'edgegist.admin.themePalette'
const localeStorageKey = 'edgegist.admin.locale'
const diffLayoutStorageKey = 'edgegist.admin.diffLayout'
const diffIndicatorStorageKey = 'edgegist.admin.diffIndicatorStyle'
const diffInlineModeStorageKey = 'edgegist.admin.diffInlineMode'
const diffUnmodifiedLinesStorageKey = 'edgegist.admin.diffUnmodifiedLines'
const diffBackgroundsStorageKey = 'edgegist.admin.diffBackgrounds'
const diffWrappingStorageKey = 'edgegist.admin.diffWrapping'
const diffLineNumbersStorageKey = 'edgegist.admin.diffLineNumbers'
const cloudflareAutoRefreshStorageKey = 'edgegist.admin.cloudflareAutoRefresh'
const sidebarCollapsedStorageKey = 'edgegist.admin.sidebarCollapsed'
const gistFilesPanelCollapsedStorageKey = 'edgegist.admin.gistFilesPanelCollapsed'
const gistActivityPanelCollapsedStorageKey = 'edgegist.admin.gistActivityPanelCollapsed'
const gistListPerPageStorageKey = 'edgegist.admin.gistListPerPage'
const contentModeExpandedLayoutMinimumWidth = 1500
const diffModeExpandedLayoutMinimumWidth = 1700
const autoSplitDiffMinimumWidth = 1024
const compactFileIconSpriteSheet = getBuiltInSpriteSheet('complete')
const compactFileIconResolver = createFileTreeIconResolver('complete')
const defaultGistListPerPage = 10
const gistListPerPageOptions = [1, 10, 20, 30, 50, 100] as const
const turnstileScriptId = 'edgegist-turnstile-script'
const cloudflareRouteSegment = 'cloudflare'
const dataRouteSegment = 'data'
const newGistRouteSegment = 'new'

let turnstileScriptPromise: Promise<void> | null = null

const themePalettes: { id: ThemePaletteId; name: string }[] = [
  { id: 'neutral', name: 'Neutral' },
  { id: 'zinc', name: 'Zinc' },
  { id: 'slate', name: 'Slate' },
  { id: 'stone', name: 'Stone' },
  { id: 'gray', name: 'Gray' },
  { id: 'mauve', name: 'Mauve' },
  { id: 'olive', name: 'Olive' },
  { id: 'mist', name: 'Mist' },
  { id: 'taupe', name: 'Taupe' },
  { id: 'sage', name: 'Sage' },
]

const navigationItems: { id: AdminSection; icon: LucideIcon; labelKey: TranslationKey }[] = [
  { id: 'gists', icon: Files, labelKey: 'gists' },
  { id: 'cloudflare', icon: Cloud, labelKey: 'cloudflare' },
  { id: 'data', icon: Database, labelKey: 'data' },
]

const defaultCloudflareSettings: CloudflareSettingsDraft = {
  accountId: '',
  apiToken: '',
  hasApiToken: false,
  workerScriptName: '',
  d1DatabaseId: '',
  workersPlan: 'free',
  d1Plan: 'free',
}

const englishTranslations = {
  accountId: 'Account ID',
  addFile: 'Add file',
  apiToken: 'API token',
  added: 'Added',
  ageRetention: '{count} days',
  allTypes: 'All',
  autoRefreshUsage: 'Auto refresh on entry',
  backToList: 'Back to list',
  baseUrl: 'Base URL',
  feature: 'Feature',
  limit: 'Limit',
  usage: 'Usage',
  cancel: 'Cancel',
  clearHistory: 'Clear history',
  clearHistoryConfirm: 'This deletes all retained history versions. Current gists, files, stars, and settings stay unchanged. Continue?',
  clearHistoryDescription: 'Delete retained versions while keeping current gists, files, and saved settings',
  clearHistoryNotice: 'Cleared {versions} retained history versions.',
  clearRetainedHistory: 'Clear retained history',
  cloudflare: 'Cloudflare',
  cloudflareApiToken: 'Cloudflare API token',
  cloudflareSettings: 'Cloudflare settings',
  cloudflareSettingsDescription: 'Stored in the EdgeGist D1 settings table',
  cloudflareSettingsIncomplete: 'Cloudflare settings are incomplete.',
  cloudflareSettingsSaved: 'Cloudflare settings saved.',
  collapseSidebar: 'Collapse sidebar',
  confirm: 'Confirm',
  content: 'Content',
  currentContent: 'Current content',
  createdAt: 'Created at',
  createdLabel: 'Created',
  createGist: 'Create',
  d1DatabaseId: 'D1 database ID',
  d1Plan: 'D1 plan',
  d1Usage: 'D1 database usage',
  d1UsageDescription: 'Query, row, and storage usage for the configured database',
  dashboard: 'Dashboard',
  data: 'Data',
  dataManagement: 'Data',
  database: 'Database',
  databaseSize: 'Database size',
  delete: 'Delete',
  deleteFile: 'Delete file',
  deleteFileConfirm: 'Delete file {filename}?',
  deleteLastFileBlocked: 'GitHub Gist does not allow deleting the last file. Updating a gist through the API with no remaining files also deletes the gist.',
  deleteGist: 'Delete gist',
  deleteGistConfirm: 'Delete gist {id}? This cannot be undone.',
  deleted: 'Deleted',
  duplicate: 'Duplicate',
  duplicateFile: 'Duplicate file',
  duplicateGist: 'Duplicate gist',
  fileDuplicated: 'File duplicated.',
  gistDuplicated: 'Duplicated.',
  autoDiffLayout: 'Auto',
  backgroundDiffStyle: 'Backgrounds',
  barsDiffStyle: 'Bars',
  charDiffDescription: 'Highlight individual character changes',
  charDiffStyle: 'Character',
  classicDiffStyle: 'Classic',
  collapseUnmodifiedLines: 'Collapse unmodified lines',
  diff: 'Diff',
  diffIndicators: 'Diff indicators',
  diffInlineMode: 'Inline changes',
  diffLayout: 'Diff layout',
  diffOptions: 'Diff options',
  expandUnmodifiedLines: 'Expand unmodified lines',
  hideBackgrounds: 'Hide backgrounds',
  hideLineNumbers: 'Hide line numbers',
  lineNumbers: 'Line Numbers',
  noDiffIndicators: 'None',
  noInlineDiffDescription: 'Show line-level changes only',
  noInlineDiff: 'None',
  showBackgrounds: 'Show backgrounds',
  showLineNumbers: 'Show line numbers',
  toggleDiffWrapping: 'Toggle line wrapping',
  unmodifiedLines: 'Unmodified',
  unifiedDiff: 'Unified',
  wrapping: 'Wrapping',
  wordAltDiffDescription: 'Highlight entire words with enhanced algorithm',
  wordAltDiffStyle: 'Word-Alt',
  wordDiffDescription: 'Highlight changed words within lines',
  wordDiffStyle: 'Word',
  edgeGistAdmin: 'EdgeGist',
  edit: 'Edit',
  editFile: 'Edit file',
  editGist: 'Edit gist',
  enabled: 'Enabled',
  english: 'English',
  enterFullscreen: 'Focus view',
  expandSidebar: 'Expand sidebar',
  exitFullscreen: 'Exit focus view',
  exportAllData: 'Export all data',
  exportJson: 'Export JSON',
  exportNotice: 'Exported {count} gists and {settings} settings{history}.',
  exportNoticeHistory: ' with retained history',
  exportDescription: 'Download gists and saved settings as a portable EdgeGist JSON file',
  fileCount: '{count} files',
  fileContent: 'File content',
  fileContentRequired: 'File content is required.',
  fileDeleted: 'File deleted.',
  fileNameCannotContainSlash: 'File name cannot contain /.',
  filesUploaded: 'Files uploaded.',
  fileHistory: 'File history',
  fileHistoryDescription: 'Changes for the selected file',
  fileName: 'File name',
  fileNamesMustBeUnique: 'File names must be unique.',
  fileSaved: 'File saved.',
  fileSetChanges: 'File set changes',
  files: 'Files',
  fileTreeSearchPlaceholder: 'Search',
  fileUploadFailed: 'Failed to read file.',
  followSystem: 'Follow system',
  workerErrors: 'Errors',
  workerAccountRequests: 'Workers account requests',
  workerLegacyPagesRequests: 'Pages Functions requests',
  workerRequestsThisMonth: 'Requests this month',
  workerRequestsToday: 'Requests today',
  workerScriptRequests: 'This Worker requests',
  workerScript: 'Worker name',
  gists: 'Gists',
  gistCreated: 'Created.',
  gistDetail: 'Gist detail',
  gistDirectory: 'Gist directory',
  gistDescription: 'Description',
  gistFilesRequired: 'Add at least one file with a filename.',
  gistSearchLabel: 'Search gists',
  gistSearchPlaceholder: 'Search descriptions, ids, files',
  gistSaved: 'Saved.',
  history: 'History',
  historyDescription: 'Retained snapshots for this gist',
  importAllData: 'Import all data',
  importAndExport: 'Import and export',
  importAndReplace: 'Import and replace',
  importDescription: 'Replace current gist data and saved settings from an EdgeGist export',
  importDetected: '{file}: {count} gists detected',
  importFile: 'Import file',
  importInvalid: 'Import file must be a valid EdgeGist export JSON.',
  importNotice: 'Imported {gists} gists, {settings} settings, and {versions} retained versions.',
  importReplaceConfirm: 'Importing replaces all current gist data. Continue?',
  includeRetainedHistory: 'Include retained history versions',
  invalidCredentials: 'Invalid username or password',
  verificationFailed: 'Verification failed. Please try again.',
  verificationRequired: 'Complete the verification before signing in.',
  language: 'Language',
  latestDeployment: 'Latest deployment',
  latestRetention: 'Latest {count} per file',
  leaveBlankToken: 'Leave blank to keep saved token',
  lightMode: 'Light mode',
  loading: 'Loading',
  loadingCommitDiff: 'Loading commit diff',
  loadingGist: 'Loading gist',
  loadingServiceStatus: 'Loading service status',
  nextPage: 'Next',
  noContent: 'No content',
  noFileSelected: 'No file selected',
  noFixedLimit: 'No fixed limit',
  noImportFileSelected: 'None selected',
  noFileHistory: 'No changes for this file',
  noFileSetChanges: 'No file changes',
  noGistsYet: 'No gists yet',
  noMatchingGists: 'No matching gists',
  noRetainedHistory: 'No retained history',
  noneRetention: 'None',
  newFile: 'New file',
  notDetected: 'Not detected',
  overview: 'Overview',
  workersPlan: 'Workers plan',
  workersUsage: 'Workers requests',
  workersUsageDescription: 'Account total requests and current Worker requests',
  password: 'Password',
  pageSize: 'Per page',
  pageNumber: 'Page {page}',
  paginationSummary: 'Page {page} of {totalPages}, {total} total',
  previousPage: 'Previous',
  project: 'Project',
  functions: 'Functions',
  productionBranch: 'Production branch',
  publicView: 'Public view',
  publicGist: 'Public',
  notPublicGist: 'This item is not public.',
  rawUrl: 'Raw URL',
  rawUrlCopied: 'Raw URL copied.',
  readQueries: 'Read queries',
  recentGists: 'Recent gists',
  recentGistsDescription: 'Newest updates across the service',
  refresh: 'Refresh',
  refreshing: 'Refreshing',
  refreshingUsage: 'Refreshing usage',
  refreshUsage: 'Refresh usage',
  rememberOnDevice: 'Remember on this device',
  replaceData: 'Replace data',
  retention: 'Retention',
  runtimeShortcuts: 'Runtime and shortcuts',
  save: 'Save',
  saveGist: 'Save',
  saveSettingsThenRefresh: 'Save settings, then refresh usage.',
  selectGistToInspect: 'Select a gist to inspect its files and history',
  selectFile: 'Select file',
  selectRetainedVersion: 'Select a retained version that contains this file',
  selectedFiles: 'Selected files',
  service: 'Service',
  secretGist: 'Secret',
  secretType: 'Secret',
  sortCreatedAsc: 'Created oldest first',
  sortCreatedDesc: 'Created newest first',
  sort: 'Sort',
  sortStarredAsc: 'Starred oldest first',
  sortStarredDesc: 'Starred newest first',
  sortUpdatedAsc: 'Updated oldest first',
  sortUpdatedDesc: 'Updated newest first',
  starred: 'Starred',
  starredOnly: 'Starred',
  starGist: 'Star',
  type: 'Type',
  unstarGist: 'Unstar',
  signIn: 'Sign in',
  signInDescription: 'Sign in with the owner username and password.',
  signOut: 'Sign out',
  simplifiedChinese: '简体中文',
  snapshots: 'Snapshots',
  systemLanguage: 'Follow system',
  themePalette: 'Theme palette',
  totalCount: '{count} total',
  usageAndQuota: 'Usage and quota',
  usageD1AfterRefresh: 'D1 usage will appear after a successful refresh.',
  usageLastRefreshed: 'Last refreshed',
  usageRefreshScope: 'Workers and D1 usage are refreshed together.',
  usageWindow: 'Usage window',
  updatedAt: 'Updated at',
  updatedLabel: 'Updated',
  uploadFiles: 'Upload files',
  uploadFileContent: 'Upload file content',
  uploadingFiles: 'Uploading files',
  username: 'Username',
  versionsCount: '{count} versions',
  writeQueries: 'Write queries',
  rowsRead: 'Rows read',
  rowsWritten: 'Rows written',
  updatedRelative: 'Updated {time}',
  justNow: 'just now',
  minutesAgo: '{count}m ago',
  modified: 'Modified',
  hoursAgo: '{count}h ago',
  daysAgo: '{count}d ago',
  ofCount: '{shown} of {total}',
  darkMode: 'Dark mode',
  openRawFile: 'Open raw file',
  splitDiff: 'Split',
} as const

type TranslationKey = keyof typeof englishTranslations

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: englishTranslations,
  'zh-CN': {
    accountId: 'Account ID',
    addFile: '新增文件',
    apiToken: 'API token',
    added: '新增',
    ageRetention: '最近 {count} 天',
    allTypes: '全部',
    autoRefreshUsage: '进入页面自动刷新',
    backToList: '返回列表',
    baseUrl: 'Base URL',
    feature: 'Feature',
    limit: 'Limit',
    usage: 'Usage',
    cancel: '取消',
    clearHistory: '清空历史',
    clearHistoryConfirm: '这会删除所有保留的历史版本。当前 gists、文件、星标和设置不会改变。继续吗？',
    clearHistoryDescription: '删除保留历史版本，保留当前 gists、文件和已保存设置',
    clearHistoryNotice: '已清空 {versions} 个保留历史版本。',
    clearRetainedHistory: '清空保留历史',
    cloudflare: 'Cloudflare',
    cloudflareApiToken: 'Cloudflare API token',
    cloudflareSettings: 'Cloudflare 配置',
    cloudflareSettingsDescription: '保存在 EdgeGist D1 settings 表中',
    cloudflareSettingsIncomplete: 'Cloudflare 配置不完整。',
    cloudflareSettingsSaved: 'Cloudflare 配置已保存。',
    collapseSidebar: '收起侧栏',
    confirm: '确认',
    content: '内容',
    currentContent: '当前内容',
    createdAt: '创建日期时间',
    createdLabel: '创建于',
    createGist: '新增',
    d1DatabaseId: 'D1 database ID',
    d1Plan: 'D1 套餐',
    d1Usage: 'D1 数据库用量',
    d1UsageDescription: '当前配置数据库的 query、rows 和 storage 用量',
    dashboard: 'Dashboard',
    data: '数据',
    dataManagement: '数据',
    database: '数据库',
    databaseSize: '数据库大小',
    delete: '删除',
    deleteFile: '删除文件',
    deleteFileConfirm: '删除文件 {filename}？',
    deleteLastFileBlocked: 'Gist 官方也不允许删除最后一个文件；使用 API 更新时如果文件全为空，也会删除 gist。',
    deleteGist: '删除 gist',
    deleteGistConfirm: '删除 gist {id}？此操作无法撤销。',
    deleted: '删除',
    duplicate: '复制',
    duplicateFile: '复制文件',
    duplicateGist: '复制 gist',
    fileDuplicated: '文件已复制。',
    gistDuplicated: '已复制。',
    autoDiffLayout: '自动',
    backgroundDiffStyle: '背景',
    barsDiffStyle: 'Bars',
    charDiffDescription: '高亮单个字符的变化',
    charDiffStyle: '字符',
    classicDiffStyle: 'Classic',
    collapseUnmodifiedLines: '收起未修改行',
    diff: 'Diff',
    diffIndicators: 'Diff 标记',
    diffInlineMode: '行内变更',
    diffLayout: 'Diff 布局',
    diffOptions: 'Diff 选项',
    expandUnmodifiedLines: '展开未修改行',
    hideBackgrounds: '隐藏背景',
    hideLineNumbers: '隐藏行号',
    lineNumbers: '行号',
    noDiffIndicators: '无',
    noInlineDiffDescription: '只显示行级变化',
    noInlineDiff: '无',
    showBackgrounds: '显示背景',
    showLineNumbers: '显示行号',
    toggleDiffWrapping: '切换换行',
    unmodifiedLines: '未修改行',
    unifiedDiff: 'Unified',
    wrapping: '换行',
    wordAltDiffDescription: '使用增强算法高亮完整单词',
    wordAltDiffStyle: 'Word-Alt',
    wordDiffDescription: '高亮行内变化的单词',
    wordDiffStyle: '单词',
    edgeGistAdmin: 'EdgeGist',
    edit: '编辑',
    editFile: '编辑文件',
    editGist: '编辑 gist',
    enabled: '已启用',
    english: 'English',
    enterFullscreen: '全屏查看',
    expandSidebar: '展开侧栏',
    exitFullscreen: '退出全屏',
    exportAllData: '导出全部数据',
    exportJson: '导出 JSON',
    exportNotice: '已导出 {count} 个 gists 和 {settings} 条设置{history}。',
    exportNoticeHistory: '，包含保留的历史版本',
    exportDescription: '下载包含所有 gist 和已保存设置的 EdgeGist JSON 文件',
    fileCount: '{count} 个文件',
    fileContent: '文件内容',
    fileContentRequired: '文件内容不能为空。',
    fileDeleted: '文件已删除。',
    fileNameCannotContainSlash: '文件名不能包含 /。',
    filesUploaded: '文件已上传。',
    fileHistory: '文件历史',
    fileHistoryDescription: '当前选中文件的历史变更',
    fileName: '文件名',
    fileNamesMustBeUnique: '文件名不能重复。',
    fileSaved: '文件已保存。',
    fileSetChanges: '文件集合变更',
    files: '文件',
    fileTreeSearchPlaceholder: '搜索',
    fileUploadFailed: '读取文件失败。',
    followSystem: '跟随系统',
    workerErrors: '错误',
    workerAccountRequests: 'Workers 账号请求',
    workerLegacyPagesRequests: 'Pages Functions 请求',
    workerRequestsThisMonth: '本月请求',
    workerRequestsToday: '今天的请求',
    workerScriptRequests: '本 Worker 请求',
    workerScript: 'Worker 名称',
    gists: 'Gists',
    gistCreated: '已创建。',
    gistDetail: 'Gist 详情',
    gistDirectory: 'Gist 列表',
    gistDescription: '描述',
    gistFilesRequired: '至少需要一个有文件名的文件。',
    gistSearchLabel: '搜索 gists',
    gistSearchPlaceholder: '搜索 description、id、文件',
    gistSaved: '已保存。',
    history: 'History',
    historyDescription: '这个 gist 保留下来的历史快照',
    importAllData: '导入全部数据',
    importAndExport: '导入和导出',
    importAndReplace: '导入并替换',
    importDescription: '用 EdgeGist export 替换当前 gist 数据和已保存设置',
    importDetected: '{file}: 检测到 {count} 个 gists',
    importFile: '导入文件',
    importInvalid: '导入文件必须是有效的 EdgeGist export JSON。',
    importNotice: '已导入 {gists} 个 gists、{settings} 条设置和 {versions} 个保留历史版本。',
    importReplaceConfirm: '导入会替换当前所有 gist 数据，继续吗？',
    includeRetainedHistory: '包含保留的历史版本',
    invalidCredentials: '用户名或密码错误',
    verificationFailed: '验证失败，请重试。',
    verificationRequired: '登录前请先完成验证。',
    language: '语言',
    latestDeployment: '最新 deployment',
    latestRetention: '每个文件最新 {count} 份',
    leaveBlankToken: '留空则保留已保存 token',
    lightMode: '浅色模式',
    loading: '加载中',
    loadingCommitDiff: '正在加载 commit diff',
    loadingGist: '正在加载 gist',
    loadingServiceStatus: '正在加载服务状态',
    nextPage: '下一页',
    noContent: '没有内容',
    noFileSelected: '未选择文件',
    noFixedLimit: '无固定上限',
    noImportFileSelected: '未选择',
    noFileHistory: '这个文件没有历史变更',
    noFileSetChanges: '没有文件变更',
    noGistsYet: '还没有 gist',
    noMatchingGists: '没有匹配的 gist',
    noRetainedHistory: '没有保留的历史版本',
    noneRetention: '不保留',
    newFile: '新文件',
    notDetected: '未检测到',
    overview: '概览',
    workersPlan: 'Workers 套餐',
    workersUsage: 'Workers 请求用量',
    workersUsageDescription: '账号总请求和当前 Worker 请求',
    password: '密码',
    pageSize: '每页',
    pageNumber: '第 {page} 页',
    paginationSummary: '第 {page} / {totalPages} 页，共 {total} 个',
    previousPage: '上一页',
    project: 'Project',
    functions: 'Functions',
    productionBranch: '生产分支',
    publicView: '公开浏览',
    publicGist: '公开',
    notPublicGist: '这个内容不是公开的。',
    rawUrl: 'Raw URL',
    rawUrlCopied: 'Raw URL 已复制。',
    readQueries: '读取查询',
    recentGists: '最近的 gists',
    recentGistsDescription: '服务中的最新更新',
    refresh: '刷新',
    refreshing: '刷新中',
    refreshingUsage: '正在刷新用量',
    refreshUsage: '刷新用量',
    rememberOnDevice: '在此设备记住登录信息',
    replaceData: '替换数据',
    retention: '历史保留',
    runtimeShortcuts: '运行状态和入口',
    save: '保存',
    saveGist: '保存',
    saveSettingsThenRefresh: '先保存配置，然后刷新用量。',
    selectGistToInspect: '选择一个 gist 查看文件和历史版本',
    selectFile: '选择文件',
    selectRetainedVersion: '选择一个包含此文件的历史版本',
    selectedFiles: '选中文件',
    service: '服务',
    secretGist: '私密',
    secretType: '私密',
    sortCreatedAsc: '创建时间正序',
    sortCreatedDesc: '创建时间倒序',
    sort: '排序',
    sortStarredAsc: '星标时间正序',
    sortStarredDesc: '星标时间倒序',
    sortUpdatedAsc: '更新时间正序',
    sortUpdatedDesc: '更新时间倒序',
    starred: '星标',
    starredOnly: '星标',
    starGist: '星标',
    type: '类型',
    unstarGist: '取消星标',
    signIn: '登录',
    signInDescription: '使用 owner 用户名和密码登录。',
    signOut: '退出登录',
    simplifiedChinese: '简体中文',
    snapshots: '快照',
    systemLanguage: '跟随系统',
    themePalette: '主题色',
    totalCount: '共 {count} 个',
    usageAndQuota: '用量和额度',
    usageD1AfterRefresh: '成功刷新后会显示 D1 用量。',
    usageLastRefreshed: '上次刷新',
    usageRefreshScope: 'Workers 和 D1 用量会一起刷新。',
    usageWindow: '用量窗口',
    updatedAt: '更新日期时间',
    updatedLabel: '更新于',
    uploadFiles: '上传文件',
    uploadFileContent: '上传文件内容',
    uploadingFiles: '正在上传文件',
    username: '用户名',
    versionsCount: '{count} 个版本',
    writeQueries: '写入查询',
    rowsRead: '读取行数',
    rowsWritten: '写入行数',
    updatedRelative: '更新于 {time}',
    justNow: '刚刚',
    minutesAgo: '{count} 分钟前',
    modified: '修改',
    hoursAgo: '{count} 小时前',
    daysAgo: '{count} 天前',
    ofCount: '{shown} / {total}',
    darkMode: '深色模式',
    openRawFile: '打开 raw 文件',
    splitDiff: 'Split',
  },
}

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string

const I18nContext = createContext<Translator>((key, params) =>
  formatTemplate(englishTranslations[key], params),
)

function useT() {
  return useContext(I18nContext)
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const updateMatches = () => setMatches(media.matches)

    updateMatches()
    media.addEventListener('change', updateMatches)
    return () => media.removeEventListener('change', updateMatches)
  }, [query])

  return matches
}

function useElementWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      setWidth(null)
      return
    }

    const updateWidth = (nextWidth: number) => {
      setWidth((previousWidth) => (previousWidth === nextWidth ? previousWidth : nextWidth))
    }
    const measure = () => updateWidth(Math.round(element.getBoundingClientRect().width))

    measure()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? element.getBoundingClientRect().width
      updateWidth(Math.round(nextWidth))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return width
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs, value])

  return debouncedValue
}

type AdminRoute = {
  section: AdminSection
  gistId: string | null
  versionSha: string | null
  creatingGist: boolean
  ownerLogin: string | null
}

const defaultAdminRoute: AdminRoute = {
  section: 'gists',
  gistId: null,
  versionSha: null,
  creatingGist: false,
  ownerLogin: null,
}

function readInitialAdminRoute(): AdminRoute {
  if (typeof window === 'undefined') return defaultAdminRoute
  return parseAdminRoute(window.location.pathname, window.location.search)
}

function parseAdminRoute(pathname: string, search = ''): AdminRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const [ownerSegment, routeSegment, versionSegment] = normalized.replace(/^\/+/, '').split('/')
  if (!ownerSegment) return defaultAdminRoute

  const ownerLogin = decodeURIComponent(ownerSegment)
  if (!routeSegment) return { section: 'gists', gistId: null, versionSha: null, creatingGist: false, ownerLogin }
  if (routeSegment === newGistRouteSegment) return { section: 'gists', gistId: null, versionSha: null, creatingGist: true, ownerLogin }
  if (routeSegment === cloudflareRouteSegment) return { section: 'cloudflare', gistId: null, versionSha: null, creatingGist: false, ownerLogin }
  if (routeSegment === dataRouteSegment) return { section: 'data', gistId: null, versionSha: null, creatingGist: false, ownerLogin }
  if (routeSegment.startsWith('_')) return { section: 'gists', gistId: null, versionSha: null, creatingGist: false, ownerLogin }
  return {
    section: 'gists',
    gistId: decodeURIComponent(routeSegment),
    versionSha: versionSegment ? decodeURIComponent(versionSegment) : null,
    creatingGist: false,
    ownerLogin,
  }
}

function adminRoutePath(
  ownerLogin: string,
  section: AdminSection,
  gistId: string | null = null,
  options: { creatingGist?: boolean; versionSha?: string | null } = {},
) {
  const ownerPath = `/${encodeURIComponent(ownerLogin)}`
  if (section === 'cloudflare') return `${ownerPath}/${cloudflareRouteSegment}`
  if (section === 'data') return `${ownerPath}/${dataRouteSegment}`
  if (options.creatingGist) return `${ownerPath}/${newGistRouteSegment}`
  if (gistId) {
    const gistPath = `${ownerPath}/${encodeURIComponent(gistId)}`
    return options.versionSha ? `${gistPath}/${encodeURIComponent(options.versionSha)}` : gistPath
  }
  return ownerPath
}

function resolveBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const language = navigator.language || navigator.languages?.[0] || 'en'
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function readStoredLocale(): LocalePreference {
  const value = localStorage.getItem(localeStorageKey)
  return value === 'system' || value === 'en' || value === 'zh-CN' ? value : 'system'
}

function formatTemplate(template: string, params: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  )
}

function localizeApiErrorMessage(message: string, t: Translator) {
  if (message === 'Cloudflare settings are incomplete') return t('cloudflareSettingsIncomplete')
  return message
}

function hideBootShell() {
  const shell = document.querySelector<HTMLElement>(bootShellSelector)
  if (!shell) return

  shell.hidden = true
  shell.setAttribute('aria-hidden', 'true')
  shell.removeAttribute('aria-busy')
}

function showBootShell() {
  const shell = document.querySelector<HTMLElement>(bootShellSelector)
  if (!shell) return

  shell.hidden = false
  shell.removeAttribute('aria-hidden')
  shell.setAttribute('aria-busy', 'true')
}

export function App() {
  const [initialRoute] = useState(readInitialAdminRoute)
  const [initialLoginDraft] = useState<AdminCredentials>(() => {
    clearStoredCredentials()
    return { username: initialRoute.ownerLogin ?? '', password: '' }
  })
  const [publicConfig] = useState(readPublicConfig)
  const [systemColorMode, setSystemColorMode] = useState<ResolvedColorMode>(getSystemColorMode)
  const [systemLocale, setSystemLocale] = useState<Locale>(resolveBrowserLocale)
  const [colorModePreference, setColorModePreference] = useState<ColorModePreference>(readStoredColorMode)
  const [themePalette, setThemePalette] = useState<ThemePaletteId>(readStoredThemePalette)
  const [localePreference, setLocalePreference] = useState<LocalePreference>(readStoredLocale)
  const [diffLayoutPreference, setDiffLayoutPreference] =
    useState<DiffLayoutPreference>(readStoredDiffLayoutPreference)
  const [diffIndicatorStyle, setDiffIndicatorStyle] = useState<DiffIndicatorStyle>(readStoredDiffIndicatorStyle)
  const [diffInlineMode, setDiffInlineMode] = useState<DiffInlineMode>(readStoredDiffInlineMode)
  const [diffExpandUnmodifiedLines, setDiffExpandUnmodifiedLines] = useState(readStoredDiffExpandUnmodifiedLines)
  const [diffShowBackgrounds, setDiffShowBackgrounds] = useState(readStoredDiffShowBackgrounds)
  const [diffWrapLines, setDiffWrapLines] = useState(readStoredDiffWrapLines)
  const [diffShowLineNumbers, setDiffShowLineNumbers] = useState(readStoredDiffShowLineNumbers)
  const [cloudflareAutoRefresh, setCloudflareAutoRefresh] = useState(readStoredCloudflareAutoRefresh)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed)
  const [draftCredentials, setDraftCredentials] = useState<AdminCredentials>(initialLoginDraft)
  const [rememberCredentials, setRememberCredentials] = useState(false)
  const [activeSection, setActiveSection] = useState<AdminSection>(initialRoute.section)
  const [routeOwnerLogin, setRouteOwnerLogin] = useState<string | null>(initialRoute.ownerLogin)
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [gists, setGists] = useState<GistSummary[]>([])
  const [selectedGistId, setSelectedGistId] = useState<string | null>(initialRoute.gistId)
  const [detail, setDetail] = useState<GistDetail | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedVersionSha, setSelectedVersionSha] = useState<string | null>(initialRoute.versionSha)
  const [selectedVersion, setSelectedVersion] = useState<GistDetail | null>(null)
  const [baseVersion, setBaseVersion] = useState<GistDetail | null>(null)
  const [versionLoading, setVersionLoading] = useState(false)
  const [gistSearch, setGistSearch] = useState('')
  const [gistSearchIndexById, setGistSearchIndexById] = useState<Record<string, GistSearchIndex>>({})
  const [gistTypeFilter, setGistTypeFilter] = useState<GistTypeFilter>('all')
  const [gistStarFilter, setGistStarFilter] = useState<GistStarFilter>('all')
  const [gistSortKey, setGistSortKey] = useState<GistSortKey>('updated-desc')
  const [gistPage, setGistPage] = useState(1)
  const [gistListMeta, setGistListMeta] = useState(() => ({
    page: 1,
    perPage: readStoredGistListPerPage(),
    total: 0,
    totalPages: 1,
  }))
  const [gistEditorMode, setGistEditorMode] = useState<GistEditorMode | null>(
    initialRoute.creatingGist ? 'create' : null,
  )
  const [gistEditorDraft, setGistEditorDraft] = useState<GistEditorDraft>(() => emptyGistDraft())
  const [gistSaving, setGistSaving] = useState(false)
  const [fileEditorMode, setFileEditorMode] = useState<FileEditorMode | null>(null)
  const [fileEditorDraft, setFileEditorDraft] = useState<FileEditorDraft>(() => emptySingleFileDraft())
  const [fileSaving, setFileSaving] = useState(false)
  const [mode, setMode] = useState<ViewMode>(initialRoute.versionSha ? 'diff' : 'content')
  const [authenticating, setAuthenticating] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cloudflareSettings, setCloudflareSettings] = useState<CloudflareSettingsDraft>(defaultCloudflareSettings)
  const [cloudflareUsage, setCloudflareUsage] = useState<CloudflareUsage | null>(null)
  const [cloudflareSettingsLoading, setCloudflareSettingsLoading] = useState(false)
  const [cloudflareUsageLoading, setCloudflareUsageLoading] = useState(false)
  const [cloudflareSaving, setCloudflareSaving] = useState(false)
  const [cloudflareNotice, setCloudflareNotice] = useState<string | null>(null)
  const [exportIncludeHistory, setExportIncludeHistory] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [importIncludeHistory, setImportIncludeHistory] = useState(true)
  const [importPayload, setImportPayload] = useState<EdgeGistExportPayload | null>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [dataNotice, setDataNotice] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [loginRequested, setLoginRequested] = useState(false)
  const [bootContentReadyKey, setBootContentReadyKey] = useState('')
  const cloudflareAutoRefreshDone = useRef(false)
  const detailRequestRef = useRef<{ id: string; promise: Promise<GistDetail> } | null>(null)
  const gistListRequestIdRef = useRef(0)
  const activeSectionRef = useRef(activeSection)
  const authCheckedRef = useRef(false)
  const authenticatedRef = useRef(false)
  const bootHideFrameRef = useRef(0)
  const resolvedColorMode = colorModePreference === 'system' ? systemColorMode : colorModePreference
  const resolvedLocale = localePreference === 'system' ? systemLocale : localePreference
  const t = useMemo<Translator>(
    () => (key, params) => formatTemplate(translations[resolvedLocale][key] ?? englishTranslations[key], params),
    [resolvedLocale],
  )

  const isAuthenticated = Boolean(status)
  const currentOwnerLogin = routeOwnerLogin ?? status?.ownerUsername ?? draftCredentials.username
  const client = useMemo(() => new ApiClient('', currentOwnerLogin), [currentOwnerLogin])
  const gistListControls = useMemo(
    () => ({
      query: gistSearch,
      sortKey: gistSortKey,
      starFilter: gistStarFilter,
      typeFilter: gistTypeFilter,
    }),
    [gistSearch, gistSortKey, gistStarFilter, gistTypeFilter],
  )
  const debouncedGistListControls = useDebouncedValue(gistListControls, 300)
  const selectedHistoryIndex = useMemo(
    () => detail?.history.findIndex((item) => item.version === selectedVersionSha) ?? -1,
    [detail, selectedVersionSha],
  )
  const baseVersionSha =
    detail && selectedHistoryIndex >= 0 ? detail.history[selectedHistoryIndex + 1]?.version ?? null : null
  const gistSearchMatchesById = useMemo(() => {
    const query = debouncedGistListControls.query.trim()
    const matchesById: Record<string, GistSearchMatch> = {}
    if (!query) return matchesById

    for (const gist of gists) {
      const match = findGistSearchMatch(gist, gistSearchIndexById[gist.id], query)
      if (hasGistSearchMatch(match)) matchesById[gist.id] = match
    }

    return matchesById
  }, [debouncedGistListControls.query, gistSearchIndexById, gists])
  const isCurrentDetailLoading = isSelectedGistDetailLoading({
    detail,
    detailLoading,
    hasClient: Boolean(client),
    selectedGistId,
  })
  const bootContentFile =
    activeSection === 'gists' && selectedGistId && detail?.id === selectedGistId && selectedFile
      ? detail.files[selectedFile] ?? null
      : null
  const bootDetailFileCount =
    activeSection === 'gists' && selectedGistId && detail?.id === selectedGistId
      ? Object.keys(detail.files).length
      : 0
  const bootContentCacheKey = bootContentFile ? codeCacheKey(bootContentFile, resolvedColorMode) : ''
  const isCurrentContentSelectionLoading = Boolean(
    client &&
      activeSection === 'gists' &&
      selectedGistId &&
      !isCurrentDetailLoading &&
      bootDetailFileCount > 0 &&
      !bootContentFile,
  )
  const isCurrentContentHighlightLoading = Boolean(
    client &&
      activeSection === 'gists' &&
      selectedGistId &&
      !isCurrentDetailLoading &&
      bootContentFile &&
      shouldHighlightCode(bootContentFile) &&
      bootContentReadyKey !== bootContentCacheKey,
  )
  const shouldRemoveBootShell = shouldHideAdminBootShell({
    contentHighlightLoading: isCurrentContentHighlightLoading,
    contentSelectionLoading: isCurrentContentSelectionLoading,
    detailLoading: isCurrentDetailLoading,
    hasClient: Boolean(client),
    hasError: Boolean(error),
    isGistsSection: activeSection === 'gists',
    selectedGistId,
  })

  useEffect(() => {
    if (!shouldRemoveBootShell) return

    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        hideBootShell()
        bootHideFrameRef.current = 0
      })
      bootHideFrameRef.current = secondFrame
    })
    bootHideFrameRef.current = firstFrame

    return () => {
      if (bootHideFrameRef.current) {
        window.cancelAnimationFrame(bootHideFrameRef.current)
        bootHideFrameRef.current = 0
      }
    }
  }, [shouldRemoveBootShell])

  useEffect(() => {
    if (!bootContentFile || !shouldHighlightCode(bootContentFile)) {
      setBootContentReadyKey(bootContentCacheKey)
      return
    }

    if (codeHighlightResultCache.has(bootContentCacheKey)) {
      setBootContentReadyKey(bootContentCacheKey)
      return
    }

    let cancelled = false
    setBootContentReadyKey('')
    void highlightCodeLines(bootContentFile, resolvedColorMode).then(() => {
      if (!cancelled) setBootContentReadyKey(bootContentCacheKey)
    })

    return () => {
      cancelled = true
    }
  }, [bootContentCacheKey, bootContentFile, resolvedColorMode])

  useEffect(() => {
    const showShell = () => {
      if (bootHideFrameRef.current) {
        window.cancelAnimationFrame(bootHideFrameRef.current)
        bootHideFrameRef.current = 0
      }
      showBootShell()
    }
    const showShellForRefreshShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') showShell()
    }

    window.addEventListener('keydown', showShellForRefreshShortcut, { capture: true })
    window.addEventListener('beforeunload', showShell)
    window.addEventListener('pagehide', showShell)
    return () => {
      window.removeEventListener('keydown', showShellForRefreshShortcut, { capture: true })
      window.removeEventListener('beforeunload', showShell)
      window.removeEventListener('pagehide', showShell)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemColorMode = () => setSystemColorMode(media.matches ? 'dark' : 'light')

    updateSystemColorMode()
    media.addEventListener('change', updateSystemColorMode)
    return () => media.removeEventListener('change', updateSystemColorMode)
  }, [])

  useEffect(() => {
    const updateSystemLocale = () => setSystemLocale(resolveBrowserLocale())

    updateSystemLocale()
    window.addEventListener('languagechange', updateSystemLocale)
    return () => window.removeEventListener('languagechange', updateSystemLocale)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const route = parseAdminRoute(window.location.pathname, window.location.search)
      activeSectionRef.current = route.section
      setError(null)
      setCloudflareNotice(null)
      setActiveSection(route.section)
      setSelectedGistId(route.gistId)
      setSelectedVersionSha(route.versionSha)
      setRouteOwnerLogin(route.ownerLogin)
      setMode(route.versionSha ? 'diff' : 'content')
      setFileEditorMode(null)
      setGistEditorMode(route.creatingGist ? 'create' : null)
      if (route.creatingGist) setGistEditorDraft(emptyGistDraft())
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!currentOwnerLogin || activeSection !== 'gists') return

    const nextPath = adminRoutePath(currentOwnerLogin, 'gists', selectedGistId, {
      creatingGist: gistEditorMode === 'create' && !selectedGistId,
      versionSha: selectedVersionSha,
    })
    if (`${window.location.pathname}${window.location.search}` === nextPath) return
    window.history.replaceState({}, '', nextPath)
  }, [activeSection, currentOwnerLogin, gistEditorMode, selectedGistId, selectedVersionSha])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.adminMode = resolvedColorMode
    root.dataset.adminTheme = themePalette
    root.style.colorScheme = resolvedColorMode
    document.documentElement.lang = resolvedLocale
  }, [resolvedColorMode, resolvedLocale, themePalette])

  useEffect(() => {
    localStorage.setItem(colorModeStorageKey, colorModePreference)
  }, [colorModePreference])

  useEffect(() => {
    localStorage.setItem(themePaletteStorageKey, themePalette)
  }, [themePalette])

  useEffect(() => {
    localStorage.setItem(localeStorageKey, localePreference)
  }, [localePreference])

  useEffect(() => {
    localStorage.setItem(diffLayoutStorageKey, diffLayoutPreference)
  }, [diffLayoutPreference])

  useEffect(() => {
    localStorage.setItem(diffIndicatorStorageKey, diffIndicatorStyle)
  }, [diffIndicatorStyle])

  useEffect(() => {
    localStorage.setItem(diffInlineModeStorageKey, diffInlineMode)
  }, [diffInlineMode])

  useEffect(() => {
    localStorage.setItem(diffUnmodifiedLinesStorageKey, diffExpandUnmodifiedLines ? 'true' : 'false')
  }, [diffExpandUnmodifiedLines])

  useEffect(() => {
    localStorage.setItem(diffBackgroundsStorageKey, diffShowBackgrounds ? 'true' : 'false')
  }, [diffShowBackgrounds])

  useEffect(() => {
    localStorage.setItem(diffWrappingStorageKey, diffWrapLines ? 'true' : 'false')
  }, [diffWrapLines])

  useEffect(() => {
    localStorage.setItem(diffLineNumbersStorageKey, diffShowLineNumbers ? 'true' : 'false')
  }, [diffShowLineNumbers])

  useEffect(() => {
    localStorage.setItem(cloudflareAutoRefreshStorageKey, cloudflareAutoRefresh ? 'true' : 'false')
  }, [cloudflareAutoRefresh])

  useEffect(() => {
    localStorage.setItem(sidebarCollapsedStorageKey, sidebarCollapsed ? 'true' : 'false')
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem(gistListPerPageStorageKey, String(gistListMeta.perPage))
  }, [gistListMeta.perPage])

  useEffect(() => {
    activeSectionRef.current = activeSection
  }, [activeSection])

  useEffect(() => {
    if (!toastMessage) return
    const timeout = window.setTimeout(() => setToastMessage(null), 2400)
    return () => window.clearTimeout(timeout)
  }, [toastMessage])

  const cacheGistSearchDetail = useCallback((nextDetail: GistDetail) => {
    setGistSearchIndexById((current) => ({
      ...current,
      [nextDetail.id]: gistSearchIndexFromDetail(nextDetail),
    }))
  }, [])

  const applyInitialGistDetail = useCallback(
    (nextDetail: GistDetail, options: { versionSha?: string | null } = {}) => {
      const filenames = gistFilePathsByCreatedAt(nextDetail.files)
      const versionSha = options.versionSha ?? null
      cacheGistSearchDetail(nextDetail)
      setDetail(nextDetail)
      setSelectedFile((current) => (versionSha ? null : current && nextDetail.files[current] ? current : filenames[0] ?? null))
      setSelectedVersionSha(versionSha)
      setSelectedVersion(null)
      setBaseVersion(null)
      setMode(versionSha ? 'diff' : 'content')
    },
    [cacheGistSearchDetail],
  )

  const applyGistListResult = useCallback((result: GistListResult) => {
    setGists(result.items)
    setGistListMeta({
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: result.totalPages,
    })
    if (result.page > result.totalPages) setGistPage(result.totalPages)
    setGistSearchIndexById((current) => pruneGistSearchIndex(current, result.items))
  }, [])

  useEffect(() => {
    authenticatedRef.current = Boolean(status)
  }, [status])

  function applySessionStatus(nextStatus: AdminStatus | null) {
    authCheckedRef.current = true
    authenticatedRef.current = Boolean(nextStatus)
    setAuthChecked(true)
    setStatus(nextStatus)
  }

  async function readSessionStatus(): Promise<AdminStatus | null> {
    try {
      return await client.status()
    } catch {
      return null
    }
  }

  const listGistsForCurrentControls = useCallback(
    (targetClient: ApiClient = client) =>
      targetClient.listGists({
        page: gistPage,
        perPage: gistListMeta.perPage,
        query: debouncedGistListControls.query,
        sortKey: debouncedGistListControls.sortKey,
        starFilter: debouncedGistListControls.starFilter,
        typeFilter: debouncedGistListControls.typeFilter,
      }),
    [client, debouncedGistListControls, gistListMeta.perPage, gistPage],
  )

  const loadDashboard = useCallback(async (showLoading = false) => {
    if (!currentOwnerLogin) return
    const requestId = ++gistListRequestIdRef.current
    if (showLoading) setLoading(true)
    setError(null)
    const shouldCheckStatus = !authCheckedRef.current || authenticatedRef.current
    try {
      const [nextStatus, nextGists] = await Promise.all([
        shouldCheckStatus ? readSessionStatus() : Promise.resolve(null),
        listGistsForCurrentControls(),
      ])
      if (requestId !== gistListRequestIdRef.current) return
      if (shouldCheckStatus) applySessionStatus(nextStatus)
      applyGistListResult(nextGists)
    } catch (err) {
      if (requestId !== gistListRequestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      if (showLoading && requestId === gistListRequestIdRef.current) setLoading(false)
    }
  }, [applyGistListResult, currentOwnerLogin, listGistsForCurrentControls])

  const refreshCurrentView = useCallback(async () => {
    if (!currentOwnerLogin) return
    const requestId = ++gistListRequestIdRef.current
    setLoading(true)
    setError(null)
    const shouldCheckStatus = !authCheckedRef.current || authenticatedRef.current
    try {
      const [nextStatus, nextGists, nextDetail] = await Promise.all([
        shouldCheckStatus ? readSessionStatus() : Promise.resolve(null),
        listGistsForCurrentControls(),
        selectedGistId ? client.getGist(selectedGistId) : Promise.resolve(null),
      ])
      if (requestId !== gistListRequestIdRef.current) return
      if (shouldCheckStatus) applySessionStatus(nextStatus)
      applyGistListResult(nextGists)

      if (nextDetail) {
        const filenames = gistFilePathsByCreatedAt(nextDetail.files)
        cacheGistSearchDetail(nextDetail)
        setDetail(nextDetail)
        setSelectedFile((current) => (current && nextDetail.files[current] ? current : filenames[0] ?? null))

        if (selectedVersionSha && !nextDetail.history.some((item) => item.version === selectedVersionSha)) {
          setSelectedVersionSha(null)
          setSelectedVersion(null)
          setBaseVersion(null)
          setMode('content')
        }
      }
    } catch (err) {
      if (requestId !== gistListRequestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to refresh dashboard')
    } finally {
      if (requestId === gistListRequestIdRef.current) setLoading(false)
    }
  }, [
    applyGistListResult,
    cacheGistSearchDetail,
    client,
    currentOwnerLogin,
    listGistsForCurrentControls,
    selectedGistId,
    selectedVersionSha,
  ])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const query = debouncedGistListControls.query.trim()
    if (!query || !currentOwnerLogin) return

    const missingGists = gists.filter((gist) => !gistSearchIndexById[gist.id])
    if (missingGists.length === 0) return

    let cancelled = false
    Promise.all(
      missingGists.map(async (gist) => {
        try {
          return await client.getGist(gist.id)
        } catch {
          return null
        }
      }),
    ).then((details) => {
      if (cancelled) return
      setGistSearchIndexById((current) => {
        const next = { ...current }
        for (const nextDetail of details) {
          if (nextDetail) next[nextDetail.id] = gistSearchIndexFromDetail(nextDetail)
        }
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [client, currentOwnerLogin, debouncedGistListControls.query, gistSearchIndexById, gists])

  useEffect(() => {
    if (!currentOwnerLogin || !selectedGistId) {
      setDetail(null)
      return
    }

    let cancelled = false
    setDetailLoading(true)
    setError(null)
    const request =
      detailRequestRef.current?.id === selectedGistId
        ? detailRequestRef.current.promise
        : client.getGist(selectedGistId)
    detailRequestRef.current = { id: selectedGistId, promise: request }

    request
      .then((nextDetail) => {
        if (cancelled) return
        applyInitialGistDetail(nextDetail, { versionSha: selectedVersionSha })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load gist')
      })
      .finally(() => {
        if (detailRequestRef.current?.promise === request) detailRequestRef.current = null
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applyInitialGistDetail, client, currentOwnerLogin, selectedGistId, t])

  useEffect(() => {
    if (!detail || !selectedVersionSha) {
      setSelectedVersion(null)
      setBaseVersion(null)
      setVersionLoading(false)
      return
    }

    let cancelled = false
    setVersionLoading(true)
    Promise.all([
      client.getVersion(detail.id, selectedVersionSha),
      baseVersionSha ? client.getVersion(detail.id, baseVersionSha) : Promise.resolve(null),
    ])
      .then(([version, parentVersion]) => {
        if (cancelled) return
        setSelectedVersion(version)
        setBaseVersion(parentVersion)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load version')
      })
      .finally(() => {
        if (!cancelled) setVersionLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [baseVersionSha, client, detail, selectedVersionSha])

  useEffect(() => {
    if (mode !== 'diff' || selectedFile || !selectedVersion) return
    const changedPath = firstChangedPath(selectedVersion, baseVersion)
    const availablePaths = versionPathUnion(selectedVersion, baseVersion)
    setSelectedFile(changedPath ?? availablePaths[0] ?? null)
  }, [baseVersion, mode, selectedFile, selectedVersion])

  const loadCloudflareSettings = useCallback(async () => {
    if (!isAuthenticated) return
    setCloudflareSettingsLoading(true)
    setError(null)
    try {
      const settings = await client.cloudflareSettings()
      setCloudflareSettings(toCloudflareDraft(settings))
    } catch (err) {
      if (activeSectionRef.current === 'cloudflare') {
        setError(err instanceof Error ? localizeApiErrorMessage(err.message, t) : 'Failed to load Cloudflare settings')
      }
    } finally {
      setCloudflareSettingsLoading(false)
    }
  }, [client, isAuthenticated, t])

  const loadCloudflareUsage = useCallback(async (refresh = false) => {
    if (!isAuthenticated) return
    setCloudflareUsageLoading(true)
    setError(null)
    try {
      setCloudflareUsage(await client.cloudflareUsage(refresh))
    } catch (err) {
      if (activeSectionRef.current === 'cloudflare') {
        setError(err instanceof Error ? localizeApiErrorMessage(err.message, t) : 'Failed to load Cloudflare usage')
      }
    } finally {
      setCloudflareUsageLoading(false)
    }
  }, [client, isAuthenticated, t])

  useEffect(() => {
    if (activeSection !== 'cloudflare' || !isAuthenticated) {
      cloudflareAutoRefreshDone.current = false
      return
    }

    void loadCloudflareSettings()
    if (cloudflareAutoRefresh) {
      if (!cloudflareAutoRefreshDone.current) {
        cloudflareAutoRefreshDone.current = true
        void loadCloudflareUsage(true)
      }
    } else {
      void loadCloudflareUsage(false)
    }
  }, [activeSection, isAuthenticated, cloudflareAutoRefresh, loadCloudflareSettings, loadCloudflareUsage])

  function navigateAdmin(
    section: AdminSection,
    gistId: string | null = null,
    action: 'push' | 'replace' = 'push',
    options: { creatingGist?: boolean; versionSha?: string | null } = {},
  ) {
    if (!currentOwnerLogin) return
    const creatingGist = section === 'gists' && options.creatingGist === true
    const normalizedGistId = section === 'gists' && !creatingGist ? gistId : null
    const normalizedVersionSha = normalizedGistId ? options.versionSha ?? null : null
    const nextPath = adminRoutePath(currentOwnerLogin, section, normalizedGistId, {
      creatingGist,
      versionSha: normalizedVersionSha,
    })
    const routeChanged = `${window.location.pathname}${window.location.search}` !== nextPath
    if (routeChanged) {
      const method = action === 'replace' ? 'replaceState' : 'pushState'
      window.history[method]({}, '', nextPath)
      setError(null)
      setCloudflareNotice(null)
    }
    activeSectionRef.current = section
    setActiveSection(section)
    setSelectedGistId(normalizedGistId)
    setSelectedVersionSha(normalizedVersionSha)
    if (section === 'gists') setMode(normalizedVersionSha ? 'diff' : 'content')
    setRouteOwnerLogin(currentOwnerLogin)
  }

  function selectGistFile(path: string) {
    setFileEditorMode(null)
    setSelectedFile(path)
    setSelectedVersionSha(null)
    setSelectedVersion(null)
    setBaseVersion(null)
    setMode('content')
  }

  async function saveCloudflare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isAuthenticated) return

    setCloudflareSaving(true)
    setCloudflareNotice(null)
    setError(null)
    try {
      const saved = await client.saveCloudflareSettings(cloudflareSettings)
      setCloudflareSettings(toCloudflareDraft(saved))
      setCloudflareNotice(t('cloudflareSettingsSaved'))
      if (saved.hasApiToken) await loadCloudflareUsage(true)
    } catch (err) {
      setError(err instanceof Error ? localizeApiErrorMessage(err.message, t) : 'Failed to save Cloudflare settings')
    } finally {
      setCloudflareSaving(false)
    }
  }

  async function exportData() {
    if (!isAuthenticated) return

    setExporting(true)
    setDataNotice(null)
    setError(null)
    try {
      const payload = await client.exportData(exportIncludeHistory)
      downloadJson(payload, `edgegist-export-${new Date().toISOString().slice(0, 10)}.json`)
      setDataNotice(
        t('exportNotice', {
          count: payload.gists.length,
          settings: payload.settings?.length ?? 0,
          history: exportIncludeHistory ? t('exportNoticeHistory') : '',
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  function requestImportData() {
    if (!importPayload) return
    setConfirmDialog({
      title: t('replaceData'),
      description: t('importReplaceConfirm'),
      confirmLabel: t('importAndReplace'),
      variant: 'destructive',
      onConfirm: performImportData,
    })
  }

  async function performImportData() {
    if (!isAuthenticated || !importPayload) return

    setImporting(true)
    setDataNotice(null)
    setError(null)
    try {
      const result = await client.importData(importPayload, importIncludeHistory)
      setDataNotice(t('importNotice', {
        gists: result.gistCount,
        settings: result.settingCount,
        versions: result.versionCount,
      }))
      setImportPayload(null)
      setImportFileName('')
      navigateAdmin('gists', null, 'replace')
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import data')
    } finally {
      setImporting(false)
    }
  }

  function requestClearHistory() {
    setConfirmDialog({
      title: t('clearRetainedHistory'),
      description: t('clearHistoryConfirm'),
      confirmLabel: t('clearHistory'),
      variant: 'destructive',
      onConfirm: performClearHistory,
    })
  }

  async function performClearHistory() {
    if (!isAuthenticated) return

    setClearingHistory(true)
    setDataNotice(null)
    setError(null)
    try {
      const result = await client.clearHistory()
      setDataNotice(t('clearHistoryNotice', { versions: result.versionCount }))
      setSelectedVersionSha(null)
      setSelectedVersion(null)
      setBaseVersion(null)
      setMode('content')
      setDetail((current) => current ? { ...current, history: [] } : current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history')
    } finally {
      setClearingHistory(false)
    }
  }

  async function readImportFile(file: File | null) {
    setDataNotice(null)
    setError(null)
    setImportPayload(null)
    setImportFileName('')
    if (!file) return

    try {
      const parsed = JSON.parse(await file.text()) as EdgeGistExportPayload
      if (!isEdgeGistExportPayload(parsed)) throw new Error('Invalid EdgeGist export')
      setImportPayload(parsed)
      setImportFileName(file.name)
    } catch {
      setError(t('importInvalid'))
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextCredentials = {
      username: draftCredentials.username.trim(),
      password: draftCredentials.password,
    }
    if (!nextCredentials.username || !nextCredentials.password) return
    if (publicConfig.turnstileSiteKey && !turnstileToken) {
      setError(t('verificationRequired'))
      return
    }

    setAuthenticating(true)
    setError(null)
    try {
      const nextAuthorization = createBasicAuthorization(nextCredentials.username, nextCredentials.password)
      const nextStatus = await new ApiClient(nextAuthorization, currentOwnerLogin ?? '').signIn(
        turnstileToken || undefined,
        rememberCredentials,
      )
      clearStoredCredentials()
      applySessionStatus(nextStatus)
      setDraftCredentials({ username: nextStatus.ownerUsername, password: '' })
      setRouteOwnerLogin(nextStatus.ownerUsername)
      setLoginRequested(false)

      const requestId = ++gistListRequestIdRef.current
      setLoading(true)
      try {
        const signedInClient = new ApiClient('', nextStatus.ownerUsername)
        const nextGists = await listGistsForCurrentControls(signedInClient)
        if (requestId === gistListRequestIdRef.current) applyGistListResult(nextGists)
      } catch (err) {
        if (requestId === gistListRequestIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard')
        }
      } finally {
        if (requestId === gistListRequestIdRef.current) setLoading(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(message.toLowerCase().includes('verification') ? t('verificationFailed') : t('invalidCredentials'))
      setTurnstileToken('')
      setTurnstileResetKey((current) => current + 1)
    } finally {
      setAuthenticating(false)
    }
  }

  async function signOut() {
    await client.signOut().catch(() => undefined)
    clearStoredCredentials()
    authCheckedRef.current = true
    authenticatedRef.current = false
    gistListRequestIdRef.current += 1
    setDraftCredentials({ username: currentOwnerLogin ?? '', password: '' })
    setRememberCredentials(false)
    navigateAdmin('gists', null, 'replace')
    setStatus(null)
    setGists([])
    setSelectedGistId(null)
    setDetail(null)
    setCloudflareSettings(defaultCloudflareSettings)
    setCloudflareUsage(null)
    setCloudflareNotice(null)
    setImportPayload(null)
    setImportFileName('')
    setDataNotice(null)
    setGistEditorMode(null)
    setFileEditorMode(null)
    setLoginRequested(false)
    setToastMessage(null)
    setConfirmDialog(null)
  }

  async function saveGist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isAuthenticated || !gistEditorMode) return

    const validationError = validateGistDraft(gistEditorDraft)
    if (validationError) {
      setError(t(validationError))
      return
    }

    setGistSaving(true)
    setError(null)
    try {
      const input = gistDraftToSaveInput(gistEditorDraft, gistEditorMode)

      if (gistEditorMode === 'create') {
        let created = await client.createGist(input)
        if (gistEditorDraft.starred) {
          const starredAt = new Date().toISOString()
          await client.setGistStarred(created.id, true)
          created = { ...created, starred: true, starred_at: starredAt }
        }
        applyInitialGistDetail(created)
        setGistEditorMode(null)
        setFileEditorMode(null)
        navigateAdmin('gists', created.id)
        await loadDashboard()
        setToastMessage(t('gistCreated'))
      } else if (detail) {
        let updated = await client.updateGist(detail.id, input)
        setGistEditorMode(null)
        setFileEditorMode(null)

        if (!updated) {
          setDetail(null)
          navigateAdmin('gists', null, 'replace')
          await loadDashboard()
          setToastMessage(t('gistSaved'))
          return
        }

        if (gistEditorDraft.starred !== updated.starred) {
          const starredAt = gistEditorDraft.starred ? new Date().toISOString() : null
          await client.setGistStarred(updated.id, gistEditorDraft.starred)
          updated = { ...updated, starred: gistEditorDraft.starred, starred_at: starredAt }
        }

        cacheGistSearchDetail(updated)
        setDetail(updated)
        const filenames = gistFilePathsByCreatedAt(updated.files)
        setSelectedFile((current) => (current && updated.files[current] ? current : filenames[0] ?? null))
        await loadDashboard()
        setToastMessage(t('gistSaved'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save gist')
    } finally {
      setGistSaving(false)
    }
  }

  async function copyRawUrl(rawUrl: string) {
    try {
      await copyText(rawUrl)
      setToastMessage(t('rawUrlCopied'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy raw URL')
    }
  }

  async function toggleGistStar(gist: GistSummary | GistDetail) {
    if (!isAuthenticated) return
    const nextStarred = !gist.starred
    setError(null)
    try {
      await client.setGistStarred(gist.id, nextStarred)
      const starredAt = nextStarred ? new Date().toISOString() : null
      setGists((current) =>
        current.map((item) =>
          item.id === gist.id ? { ...item, starred: nextStarred, starred_at: starredAt } : item,
        ),
      )
      setDetail((current) =>
        current?.id === gist.id ? { ...current, starred: nextStarred, starred_at: starredAt } : current,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update star')
    }
  }

  async function duplicateSelectedGist() {
    if (!isAuthenticated || !detail) return

    setGistSaving(true)
    setError(null)
    try {
      let created = await client.createGist(gistDetailToCreateInput(detail))
      if (detail.starred) {
        const starredAt = new Date().toISOString()
        await client.setGistStarred(created.id, true)
        created = { ...created, starred: true, starred_at: starredAt }
      }

      applyInitialGistDetail(created)
      setGistEditorMode(null)
      setFileEditorMode(null)
      navigateAdmin('gists', created.id)
      await loadDashboard()
      setToastMessage(t('gistDuplicated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate gist')
    } finally {
      setGistSaving(false)
    }
  }

  async function duplicateSelectedFile() {
    if (!isAuthenticated || !detail || !latestFile) return

    const filename = duplicateFilename(latestFile.filename, Object.keys(detail.files))
    setFileSaving(true)
    setError(null)
    try {
      const updated = await client.updateGist(detail.id, {
        description: detail.description,
        visibility: detail.visibility,
        public: detail.visibility === 'public',
        files: {
          [filename]: {
            content: latestFile.content,
          },
        },
      })

      setFileEditorMode(null)
      if (!updated) {
        setDetail(null)
        navigateAdmin('gists', null, 'replace')
        await loadDashboard()
        setToastMessage(t('fileDuplicated'))
        return
      }

      cacheGistSearchDetail(updated)
      setDetail(updated)
      setSelectedFile(filename)
      setSelectedVersionSha(null)
      setSelectedVersion(null)
      setBaseVersion(null)
      setMode('content')
      await loadDashboard()
      setToastMessage(t('fileDuplicated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate file')
    } finally {
      setFileSaving(false)
    }
  }

  async function saveFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isAuthenticated || !detail || !fileEditorMode) return

    const filename = fileEditorDraft.filename
    if (!filename) {
      setError(t('gistFilesRequired'))
      return
    }
    if (filenameHasPathSeparator(filename)) {
      setError(t('fileNameCannotContainSlash'))
      return
    }
    if (fileEditorDraft.content.length === 0) {
      setError(t('fileContentRequired'))
      return
    }

    const existingNames = Object.keys(detail.files)
    const duplicate = existingNames.some(
      (name) => name === filename && name !== fileEditorDraft.originalFilename,
    )
    if (duplicate) {
      setError(t('fileNamesMustBeUnique'))
      return
    }

    setFileSaving(true)
    setError(null)
    try {
      const fileKey = fileEditorDraft.originalFilename ?? filename
      const updated = await client.updateGist(detail.id, {
        description: detail.description,
        visibility: detail.visibility,
        public: detail.visibility === 'public',
        files: {
          [fileKey]: {
            filename,
            content: fileEditorDraft.content,
          },
        },
      })

      setFileEditorMode(null)
      if (!updated) {
        setDetail(null)
        navigateAdmin('gists', null, 'replace')
        await loadDashboard()
        setToastMessage(t('fileSaved'))
        return
      }

      cacheGistSearchDetail(updated)
      setDetail(updated)
      setSelectedFile(filename)
      setSelectedVersionSha(null)
      setSelectedVersion(null)
      setBaseVersion(null)
      setMode('content')
      await loadDashboard()
      setToastMessage(t('fileSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file')
    } finally {
      setFileSaving(false)
    }
  }

  async function saveUploadedFiles(uploadedFiles: UploadedTextFile[]) {
    if (!isAuthenticated || !detail || uploadedFiles.length === 0 || fileSaving) return

    setFileSaving(true)
    setError(null)
    try {
      const updated = await client.updateGist(detail.id, {
        description: detail.description,
        visibility: detail.visibility,
        public: detail.visibility === 'public',
        files: uploadedTextFilesToUpdateFiles(uploadedFiles),
      })

      setFileEditorMode(null)
      if (!updated) {
        setDetail(null)
        navigateAdmin('gists', null, 'replace')
        await loadDashboard()
        setToastMessage(t('filesUploaded'))
        return
      }

      const firstUploadedFilename = uploadedFiles.at(-1)?.filename ?? uploadedFiles[0]?.filename
      cacheGistSearchDetail(updated)
      setDetail(updated)
      setSelectedFile((current) =>
        firstUploadedFilename && updated.files[firstUploadedFilename]
          ? firstUploadedFilename
          : current && updated.files[current]
            ? current
            : gistFilePathsByCreatedAt(updated.files)[0] ?? null,
      )
      setSelectedVersionSha(null)
      setSelectedVersion(null)
      setBaseVersion(null)
      setMode('content')
      await loadDashboard()
      setToastMessage(t('filesUploaded'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload files')
    } finally {
      setFileSaving(false)
    }
  }

  function requestDeleteSelectedFile() {
    if (!isAuthenticated || !detail || !latestFile) return
    setConfirmDialog({
      title: t('deleteFile'),
      description: t('deleteFileConfirm', { filename: latestFile.filename }),
      confirmLabel: t('delete'),
      variant: 'destructive',
      onConfirm: deleteSelectedFile,
    })
  }

  async function deleteSelectedFile() {
    if (!isAuthenticated || !detail || !latestFile) return
    if (isLastRemainingGistFile(detail)) {
      setError(t('deleteLastFileBlocked'))
      return
    }

    setFileSaving(true)
    setError(null)
    try {
      const updated = await client.updateGist(detail.id, {
        description: detail.description,
        visibility: detail.visibility,
        public: detail.visibility === 'public',
        files: {
          [latestFile.filename]: null,
        },
      })

      setFileEditorMode(null)
      if (!updated) {
        setDetail(null)
        navigateAdmin('gists', null, 'replace')
        await loadDashboard()
        setToastMessage(t('fileDeleted'))
        return
      }

      cacheGistSearchDetail(updated)
      setDetail(updated)
      const filenames = gistFilePathsByCreatedAt(updated.files)
      setSelectedFile(filenames[0] ?? null)
      setSelectedVersionSha(null)
      setSelectedVersion(null)
      setBaseVersion(null)
      setMode('content')
      await loadDashboard()
      setToastMessage(t('fileDeleted'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file')
    } finally {
      setFileSaving(false)
    }
  }

  function requestDeleteSelectedGist() {
    if (!isAuthenticated || !detail) return
    setConfirmDialog({
      title: t('deleteGist'),
      description: t('deleteGistConfirm', { id: detail.id }),
      confirmLabel: t('delete'),
      variant: 'destructive',
      onConfirm: deleteSelectedGist,
    })
  }

  async function deleteSelectedGist() {
    if (!isAuthenticated || !detail) return
    setLoading(true)
    setError(null)
    try {
      await client.deleteGist(detail.id)
      setDetail(null)
      setFileEditorMode(null)
      setGistEditorMode(null)
      navigateAdmin('gists', null, 'replace')
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete gist')
    } finally {
      setLoading(false)
    }
  }

  function changeSection(section: AdminSection) {
    setGistEditorMode(null)
    setFileEditorMode(null)
    navigateAdmin(section, null)
  }

  function openGist(id: string) {
    setGistEditorMode(null)
    setFileEditorMode(null)
    navigateAdmin('gists', id)
  }

  function openCreateGistEditor() {
    if (!isAuthenticated) return
    setError(null)
    setFileEditorMode(null)
    setGistEditorMode('create')
    setGistEditorDraft(emptyGistDraft())
    navigateAdmin('gists', null, 'push', { creatingGist: true })
  }

  function openEditGistEditor() {
    if (!isAuthenticated || !detail) return
    setError(null)
    setFileEditorMode(null)
    setGistEditorMode('edit')
    setGistEditorDraft(gistDraftFromDetail(detail))
  }

  function openAddFileEditor() {
    if (!isAuthenticated || !detail) return
    setError(null)
    setGistEditorMode(null)
    setSelectedVersionSha(null)
    setSelectedVersion(null)
    setBaseVersion(null)
    setMode('content')
    setFileEditorMode('create')
    setFileEditorDraft(emptySingleFileDraft())
  }

  function openEditFileEditor() {
    if (!isAuthenticated || !latestFile) return
    setError(null)
    setGistEditorMode(null)
    setSelectedVersionSha(null)
    setSelectedVersion(null)
    setBaseVersion(null)
    setMode('content')
    setFileEditorMode('edit')
    setFileEditorDraft({
      originalFilename: latestFile.filename,
      filename: latestFile.filename,
      language: latestFile.language,
      content: latestFile.content,
    })
  }

  const currentViewRequiresAuth = activeSection !== 'gists' || gistEditorMode === 'create'
  if (!authChecked && currentViewRequiresAuth && !loginRequested) {
    return (
      <I18nContext.Provider value={t}>
        <AuthCheckingScreen />
      </I18nContext.Provider>
    )
  }

  if (!isAuthenticated && (currentViewRequiresAuth || loginRequested)) {
    return (
      <I18nContext.Provider value={t}>
        <LoginScreen
          colorModePreference={colorModePreference}
          localePreference={localePreference}
          themePalette={themePalette}
          authenticating={authenticating}
          colorMode={resolvedColorMode}
          draftCredentials={draftCredentials}
          error={error}
          onColorModePreference={setColorModePreference}
          onLocalePreference={setLocalePreference}
          rememberCredentials={rememberCredentials}
          onDraftCredentials={setDraftCredentials}
          onRememberCredentials={setRememberCredentials}
          onThemePalette={setThemePalette}
          onSubmit={signIn}
          onTurnstileToken={setTurnstileToken}
          turnstileResetKey={turnstileResetKey}
          turnstileSiteKey={publicConfig.turnstileSiteKey}
          turnstileToken={turnstileToken}
        />
      </I18nContext.Provider>
    )
  }

  const selectedHistoryFilePaths =
    detail && selectedFile && selectedVersionSha
      ? historyFilePathsForVersion(detail.history, selectedFile, selectedVersionSha)
      : null
  const diffFilePath = selectedHistoryFilePaths?.newFilename ?? selectedFile
  const latestFile = detail && selectedFile ? detail.files[selectedFile] : null
  const diffNewFile =
    selectedVersion && selectedHistoryFilePaths
      ? selectedVersion.files[selectedHistoryFilePaths.newFilename] ?? null
      : selectedVersion && selectedFile
        ? selectedVersion.files[selectedFile] ?? null
        : null
  const diffOldFile =
    baseVersion && selectedHistoryFilePaths
      ? baseVersion.files[selectedHistoryFilePaths.oldFilename] ?? null
      : baseVersion && selectedFile
        ? baseVersion.files[selectedFile] ?? null
        : null
  const activeFile = mode === 'diff' ? diffNewFile ?? diffOldFile ?? latestFile : latestFile
  const fileTreePaths = detail ? gistFilePathsByCreatedAt(detail.files) : []
  const retentionLimit = status?.retention.count ?? 100
  const selectedFileHistory = detail && selectedFile ? historyForFile(detail.history, selectedFile, retentionLimit) : []
  const fileSetChanges = detail ? fileSetHistory(detail.history, retentionLimit) : []
  const pageMeta = sectionMeta(activeSection, Boolean(selectedGistId), gistEditorMode === 'create', detail, t)
  const PageIcon = pageMeta.icon

  return (
    <I18nContext.Provider value={t}>
    <div className="min-h-screen bg-background text-foreground">
      <AppNavigation
        activeSection={activeSection}
        authenticated={isAuthenticated}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onSectionChange={changeSection}
        onSignIn={() => setLoginRequested(true)}
        onSignOut={signOut}
        username={isAuthenticated ? status?.ownerUsername ?? currentOwnerLogin ?? '' : t('publicView')}
      />

      <div className={cn('pb-20 md:pb-0 md:pl-16', !sidebarCollapsed && 'xl:pl-64')}>
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="flex min-h-16 min-w-0 flex-col justify-center gap-2 px-3 py-2 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-0 md:px-6">
            <div className="min-w-0 w-full sm:flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                <PageIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{pageMeta.eyebrow}</span>
              </div>
              <h1 className="mt-1 truncate text-base font-semibold tracking-normal sm:text-lg">{pageMeta.title}</h1>
            </div>
            <div className="topbar-actions flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto sm:gap-2">
              <AppearanceControls
                colorModePreference={colorModePreference}
                localePreference={localePreference}
                themePalette={themePalette}
                onColorModePreference={setColorModePreference}
                onLocalePreference={setLocalePreference}
                onThemePalette={setThemePalette}
              />
              <Button
                className="h-9 w-9 shrink-0 px-0 lg:h-8 lg:w-auto lg:px-2.5"
                variant="outline"
                size="icon"
                onClick={() => void refreshCurrentView()}
                disabled={loading}
                title={t('refresh')}
                aria-label={t('refresh')}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span className="hidden lg:inline">{t('refresh')}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 md:hidden"
                onClick={isAuthenticated ? signOut : () => setLoginRequested(true)}
                title={isAuthenticated ? t('signOut') : t('signIn')}
                aria-label={isAuthenticated ? t('signOut') : t('signIn')}
              >
                {isAuthenticated ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1760px] space-y-4 px-4 py-4 md:px-6 md:py-6">
          {toastMessage ? <ToastMessage message={toastMessage} /> : null}

          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : null}

          {activeSection === 'gists' && !selectedGistId ? (
            gistEditorMode === 'create' ? (
              <section className="space-y-4">
                <GistEditor
                  colorMode={resolvedColorMode}
                  draft={gistEditorDraft}
                  mode="create"
                  saving={gistSaving}
                  onUploadError={setError}
                  onCancel={() => {
                    setGistEditorMode(null)
                    navigateAdmin('gists', null)
                  }}
                  onChange={setGistEditorDraft}
                  onSubmit={saveGist}
                />
              </section>
            ) : (
              <section className="space-y-4">
                <GistDirectory
                  canManage={isAuthenticated}
                  colorMode={resolvedColorMode}
                  gists={gists}
                  loading={loading}
                  matchesById={gistSearchMatchesById}
                  page={gistListMeta.page}
                  perPage={gistListMeta.perPage}
                  query={gistSearch}
                  selectedGistId={selectedGistId}
                  sortKey={gistSortKey}
                  starFilter={gistStarFilter}
                  total={gistListMeta.total}
                  totalPages={gistListMeta.totalPages}
                  typeFilter={gistTypeFilter}
                  onCreate={openCreateGistEditor}
                  onPageChange={setGistPage}
                  onPerPageChange={(value) => {
                    setGistPage(1)
                    setGistListMeta((current) => ({
                      ...current,
                      page: 1,
                      perPage: value,
                    }))
                  }}
                  onQueryChange={(value) => {
                    setGistSearch(value)
                    setGistPage(1)
                  }}
                  onSelect={openGist}
                  onSortKeyChange={(value) => {
                    setGistSortKey(value)
                    setGistPage(1)
                  }}
                  onStarFilterChange={(value) => {
                    setGistStarFilter(value)
                    setGistPage(1)
                  }}
                  onToggleStar={(gist) => void toggleGistStar(gist)}
                  onTypeFilterChange={(value) => {
                    setGistTypeFilter(value)
                    setGistPage(1)
                  }}
                />
              </section>
            )
          ) : null}

          {activeSection === 'gists' && selectedGistId ? (
            <GistDetailPage
              activeFile={activeFile}
              baseVersion={baseVersionSha}
              colorMode={resolvedColorMode}
              detail={detail}
              detailLoading={isCurrentDetailLoading}
              diffFilePath={diffFilePath}
              diffNewFile={diffNewFile}
              diffOldFile={diffOldFile}
              diffLayoutPreference={diffLayoutPreference}
              diffOptions={{
                expandUnmodifiedLines: diffExpandUnmodifiedLines,
                indicatorStyle: diffIndicatorStyle,
                inlineMode: diffInlineMode,
                showBackgrounds: diffShowBackgrounds,
                showLineNumbers: diffShowLineNumbers,
                wrapLines: diffWrapLines,
              }}
              fileTreeKey={`${detail?.id ?? selectedGistId}:${themePalette}:${resolvedColorMode}:${fileTreePaths.join('\n')}`}
              fileTreePaths={fileTreePaths}
              fileSetChanges={fileSetChanges}
              gistDraft={gistEditorDraft}
              gistEditing={gistEditorMode === 'edit'}
              gistSaving={gistSaving}
              fileEditor={
                fileEditorMode ? (
                  <FileEditor
                    colorMode={resolvedColorMode}
                    draft={fileEditorDraft}
                    mode={fileEditorMode}
                    saving={fileSaving}
                    onUploadError={setError}
                    onCancel={() => setFileEditorMode(null)}
                    onChange={setFileEditorDraft}
                    onSubmit={saveFile}
                  />
                ) : null
              }
              fileEditorTitle={fileEditorMode === 'create' ? t('newFile') : fileEditorMode === 'edit' ? t('editFile') : null}
              fileSaving={fileSaving}
              latestFile={latestFile}
              mode={mode}
              selectedFile={selectedFile}
              selectedFileHistory={selectedFileHistory}
              selectedVersionSha={selectedVersionSha}
              versionLoading={versionLoading}
              onBack={() => {
                setGistEditorMode(null)
                navigateAdmin('gists')
              }}
              canManage={isAuthenticated}
              onCopyRaw={(rawUrl) => void copyRawUrl(rawUrl)}
              onDelete={requestDeleteSelectedGist}
              onDuplicate={() => void duplicateSelectedGist()}
              onToggleStar={() => detail ? void toggleGistStar(detail) : undefined}
              onAddFile={openAddFileEditor}
              onDeleteFile={requestDeleteSelectedFile}
              onDuplicateFile={() => void duplicateSelectedFile()}
              onCancelGistEdit={() => setGistEditorMode(null)}
              onGistDraftChange={setGistEditorDraft}
              onGistSubmit={saveGist}
              onEdit={openEditGistEditor}
              onEditFile={openEditFileEditor}
              onUploadError={setError}
              onUploadFiles={saveUploadedFiles}
              onDiffLayoutPreference={setDiffLayoutPreference}
              onDiffIndicatorStyle={setDiffIndicatorStyle}
              onDiffInlineMode={setDiffInlineMode}
              onDiffExpandUnmodifiedLines={setDiffExpandUnmodifiedLines}
              onDiffShowBackgrounds={setDiffShowBackgrounds}
              onDiffShowLineNumbers={setDiffShowLineNumbers}
              onDiffWrapLines={setDiffWrapLines}
              onSelectFile={selectGistFile}
              onSelectVersion={(sha) => {
                setMode('diff')
                navigateAdmin('gists', selectedGistId, 'push', { versionSha: sha })
              }}
              onShowContent={() => {
                setSelectedVersion(null)
                setBaseVersion(null)
                setMode('content')
                navigateAdmin('gists', selectedGistId)
              }}
            />
          ) : null}

          {activeSection === 'cloudflare' ? (
            <CloudflarePage
              autoRefresh={cloudflareAutoRefresh}
              settingsLoading={cloudflareSettingsLoading}
              usageLoading={cloudflareUsageLoading}
              notice={cloudflareNotice}
              saving={cloudflareSaving}
              settings={cloudflareSettings}
              usage={cloudflareUsage}
              onAutoRefreshChange={setCloudflareAutoRefresh}
              onLoadUsage={() => void loadCloudflareUsage(true)}
              onSave={saveCloudflare}
              onSettingsChange={setCloudflareSettings}
            />
          ) : null}

          {activeSection === 'data' ? (
            <DataManagementPage
              clearingHistory={clearingHistory}
              dataNotice={dataNotice}
              exportIncludeHistory={exportIncludeHistory}
              exporting={exporting}
              importFileName={importFileName}
              importIncludeHistory={importIncludeHistory}
              importPayload={importPayload}
              importing={importing}
              onClearHistory={requestClearHistory}
              onExport={() => void exportData()}
              onExportIncludeHistoryChange={setExportIncludeHistory}
              onImport={requestImportData}
              onImportFile={(file) => void readImportFile(file)}
              onImportIncludeHistoryChange={setImportIncludeHistory}
            />
          ) : null}
        </main>
      </div>
      {confirmDialog ? (
        <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      ) : null}
    </div>
    </I18nContext.Provider>
  )
}

function LoginScreen({
  colorModePreference,
  colorMode,
  localePreference,
  themePalette,
  authenticating,
  draftCredentials,
  error,
  rememberCredentials,
  onColorModePreference,
  onLocalePreference,
  onDraftCredentials,
  onRememberCredentials,
  onThemePalette,
  onSubmit,
  onTurnstileToken,
  turnstileResetKey,
  turnstileSiteKey,
  turnstileToken,
}: {
  colorModePreference: ColorModePreference
  colorMode: ResolvedColorMode
  localePreference: LocalePreference
  themePalette: ThemePaletteId
  authenticating: boolean
  draftCredentials: AdminCredentials
  error: string | null
  rememberCredentials: boolean
  turnstileResetKey: number
  turnstileSiteKey: string | null
  turnstileToken: string
  onColorModePreference(value: ColorModePreference): void
  onLocalePreference(value: LocalePreference): void
  onDraftCredentials(value: AdminCredentials): void
  onRememberCredentials(value: boolean): void
  onThemePalette(value: ThemePaletteId): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
  onTurnstileToken(value: string): void
}) {
  const t = useT()

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-16">
      <div className="absolute right-4 top-4">
        <AppearanceControls
          colorModePreference={colorModePreference}
          localePreference={localePreference}
          themePalette={themePalette}
          onColorModePreference={onColorModePreference}
          onLocalePreference={onLocalePreference}
          onThemePalette={onThemePalette}
        />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="h-5 w-5" />
          </div>
          <CardTitle>{t('edgeGistAdmin')}</CardTitle>
          <CardDescription>{t('signInDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input
              autoFocus
              id="owner-username"
              type="text"
              autoComplete="username"
              disabled={authenticating}
              value={draftCredentials.username}
              onChange={(event) =>
                onDraftCredentials({ ...draftCredentials, username: event.target.value })
              }
              placeholder={t('username')}
            />
            <label className="sr-only" htmlFor="owner-username">
              {t('username')}
            </label>
            <Input
              id="owner-password"
              type="password"
              autoComplete={rememberCredentials ? 'current-password' : 'off'}
              disabled={authenticating}
              value={draftCredentials.password}
              onChange={(event) =>
                onDraftCredentials({ ...draftCredentials, password: event.target.value })
              }
              placeholder={t('password')}
            />
            <label className="sr-only" htmlFor="owner-password">
              {t('password')}
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor="remember-credentials">
              <input
                id="remember-credentials"
                type="checkbox"
                checked={rememberCredentials}
                disabled={authenticating}
                onChange={(event) => onRememberCredentials(event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {t('rememberOnDevice')}
            </label>
            {turnstileSiteKey ? (
              <TurnstileWidget
                colorMode={colorMode}
                resetKey={turnstileResetKey}
                siteKey={turnstileSiteKey}
                onToken={onTurnstileToken}
              />
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              className="w-full"
              type="submit"
              disabled={
                authenticating ||
                !draftCredentials.username.trim() ||
                !draftCredentials.password ||
                Boolean(turnstileSiteKey && !turnstileToken)
              }
            >
              {authenticating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function AuthCheckingScreen() {
  const t = useT()
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('loadingServiceStatus')}
      </div>
    </div>
  )
}

function TurnstileWidget({
  colorMode,
  resetKey,
  siteKey,
  onToken,
}: {
  colorMode: ResolvedColorMode
  resetKey: number
  siteKey: string
  onToken(value: string): void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let disposed = false
    let widgetId: string | null = null
    onToken('')

    void loadTurnstileScript().then(() => {
      if (disposed || !containerRef.current || !window.turnstile) return
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: colorMode,
        size: 'flexible',
        action: 'edgegist-login',
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }).catch(() => {
      if (!disposed) onToken('')
    })

    return () => {
      disposed = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [colorMode, onToken, resetKey, siteKey])

  return <div ref={containerRef} className="min-h-16" />
}

function AppearanceControls({
  colorModePreference,
  localePreference,
  themePalette,
  onColorModePreference,
  onLocalePreference,
  onThemePalette,
}: {
  colorModePreference: ColorModePreference
  localePreference: LocalePreference
  themePalette: ThemePaletteId
  onColorModePreference(value: ColorModePreference): void
  onLocalePreference(value: LocalePreference): void
  onThemePalette(value: ThemePaletteId): void
}) {
  const t = useT()
  const selectedThemeName = themePalettes.find((palette) => palette.id === themePalette)?.name ?? themePalette
  const ColorModeIcon =
    colorModePreference === 'dark' ? Moon : colorModePreference === 'light' ? Sun : Monitor

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-2">
      <div
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-card shadow-sm transition-colors hover:bg-accent lg:hidden"
        title={t('followSystem')}
      >
        <ColorModeIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <select
          aria-label={t('followSystem')}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={colorModePreference}
          onChange={(event) => onColorModePreference(event.target.value as ColorModePreference)}
        >
          <option value="system">{t('followSystem')}</option>
          <option value="light">{t('lightMode')}</option>
          <option value="dark">{t('darkMode')}</option>
        </select>
      </div>
      <div className="hidden h-9 shrink-0 rounded-md border bg-card p-0.5 lg:flex">
        <IconToggle
          active={colorModePreference === 'system'}
          label={t('followSystem')}
          onClick={() => onColorModePreference('system')}
        >
          <Monitor className="h-4 w-4" />
        </IconToggle>
        <IconToggle
          active={colorModePreference === 'light'}
          label={t('lightMode')}
          onClick={() => onColorModePreference('light')}
        >
          <Sun className="h-4 w-4" />
        </IconToggle>
        <IconToggle
          active={colorModePreference === 'dark'}
          label={t('darkMode')}
          onClick={() => onColorModePreference('dark')}
        >
          <Moon className="h-4 w-4" />
        </IconToggle>
      </div>
      <label className="sr-only" htmlFor="theme-palette">
        {t('themePalette')}
      </label>
      <div
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-card shadow-sm transition-colors hover:bg-accent lg:w-40 lg:justify-start"
        title={`${t('themePalette')}: ${selectedThemeName}`}
      >
        <span className="h-4 w-4 rounded-full border border-border bg-primary lg:ml-2" aria-hidden="true" />
        <select
          id="theme-palette"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 lg:static lg:min-w-0 lg:flex-1 lg:appearance-none lg:bg-transparent lg:py-1 lg:pl-2 lg:pr-8 lg:text-sm lg:text-foreground lg:opacity-100 lg:outline-none"
          value={themePalette}
          onChange={(event) => onThemePalette(event.target.value as ThemePaletteId)}
        >
          {themePalettes.map((palette) => (
            <option key={palette.id} value={palette.id}>
              {palette.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground lg:block" />
      </div>
      <label className="sr-only" htmlFor="locale-preference">
        {t('language')}
      </label>
      <div
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-card shadow-sm transition-colors hover:bg-accent lg:w-44 lg:justify-start"
        title={t('language')}
      >
        <Globe2 className="h-4 w-4 text-muted-foreground lg:ml-2" aria-hidden="true" />
        <select
          id="locale-preference"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 lg:static lg:min-w-0 lg:flex-1 lg:appearance-none lg:bg-transparent lg:py-1 lg:pl-2 lg:pr-8 lg:text-sm lg:text-foreground lg:opacity-100 lg:outline-none"
          value={localePreference}
          onChange={(event) => onLocalePreference(event.target.value as LocalePreference)}
        >
          <option value="system">{t('systemLanguage')}</option>
          <option value="zh-CN">{t('simplifiedChinese')}</option>
          <option value="en">{t('english')}</option>
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground lg:block" />
      </div>
    </div>
  )
}

function IconToggle({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  label: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none',
        active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function AppNavigation({
  activeSection,
  authenticated,
  collapsed,
  onCollapsedChange,
  onSectionChange,
  onSignIn,
  onSignOut,
  username,
}: {
  activeSection: AdminSection
  authenticated: boolean
  collapsed: boolean
  onCollapsedChange(value: boolean): void
  onSectionChange(section: AdminSection): void
  onSignIn(): void
  onSignOut(): void
  username: string
}) {
  const t = useT()
  const visibleNavigationItems = authenticated
    ? navigationItems
    : navigationItems.filter((item) => item.id === 'gists')
  const AuthIcon = authenticated ? LogOut : LogIn
  const authLabel = authenticated ? t('signOut') : t('signIn')
  const onAuthClick = authenticated ? onSignOut : onSignIn

  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-20 hidden border-r bg-sidebar text-sidebar-foreground md:flex md:w-16 md:flex-col',
          !collapsed && 'xl:w-64',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center border-b px-3',
            collapsed ? 'justify-center' : 'justify-center xl:justify-between xl:px-5',
          )}
        >
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-3">
              <AppLogo className="h-9 w-9" />
              <div className="hidden min-w-0 xl:block">
                <div className="truncate text-sm font-semibold">{t('edgeGistAdmin')}</div>
                <div className="truncate text-xs text-muted-foreground">{username}</div>
              </div>
            </div>
          ) : (
            <AppLogo className="h-9 w-9 xl:hidden" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden xl:inline-flex"
            onClick={() => onCollapsedChange(!collapsed)}
            title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
            aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="space-y-1 px-2 py-4">
          {visibleNavigationItems.map((item) => (
            <NavigationItem
              key={item.id}
              active={activeSection === item.id}
              collapsed={collapsed}
              icon={item.icon}
              label={t(item.labelKey)}
              onClick={() => onSectionChange(item.id)}
            />
          ))}
        </nav>

        <div className={cn('mt-auto border-t p-2', !collapsed && 'xl:p-4')}>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-10 w-full justify-center px-0', !collapsed && 'xl:justify-start xl:px-3')}
            onClick={onAuthClick}
            title={authLabel}
          >
            <AuthIcon className="h-4 w-4" />
            <span className={cn('hidden', !collapsed && 'xl:inline')}>{authLabel}</span>
          </Button>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid h-16 border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${visibleNavigationItems.length}, minmax(0, 1fr))` }}
      >
        {visibleNavigationItems.map((item) => {
          const Icon = item.icon
          const label = t(item.labelKey)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeSection === item.id
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

function AppLogo({ className }: { className?: string }) {
  return (
    <span className={cn('app-logo block shrink-0 overflow-hidden rounded-md', className)} aria-hidden="true">
      <img className="app-logo-light h-full w-full" src="/icons/edgegist.svg" alt="" />
      <img className="app-logo-dark h-full w-full" src="/icons/edgegist-dark.svg" alt="" />
    </span>
  )
}

function NavigationItem({
  active = false,
  collapsed,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean
  collapsed: boolean
  icon: LucideIcon
  label: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-10 w-full items-center justify-center gap-2 rounded-md px-0 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !collapsed && 'xl:justify-start xl:px-3',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={cn('hidden truncate', !collapsed && 'xl:inline')}>{label}</span>
    </button>
  )
}

function OverviewPage({
  gists,
  onOpenGist,
}: {
  gists: GistSummary[]
  onOpenGist(id: string): void
}) {
  const t = useT()
  const latestGists = gists.slice(0, 5)

  return (
    <section className="space-y-4">
      <div className="grid items-start gap-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t('recentGists')}</CardTitle>
            <CardDescription>{t('recentGistsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {latestGists.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">{t('noGistsYet')}</p>
            ) : (
              <div className="divide-y">
                {latestGists.map((gist) => (
                  <div
                    key={gist.id}
                    role="button"
                    tabIndex={0}
                    className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/70 md:grid-cols-[minmax(0,1fr)_96px_120px]"
                    onClick={() => onOpenGist(gist.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onOpenGist(gist.id)
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{gistDisplayTitle(gist)}</div>
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{gist.id}</div>
                    </div>
                    <div className="flex items-center md:justify-end">
                      <Badge variant="secondary">{gistVisibilityLabel(gist.visibility, t)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground md:text-right">
                      <div>
                        <RelativeTime value={gist.updated_at} />
                      </div>
                      <div>{t('fileCount', { count: Object.keys(gist.files).length })}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function GistDetailPage({
  activeFile,
  baseVersion,
  canManage,
  colorMode,
  detail,
  detailLoading,
  diffFilePath,
  diffNewFile,
  diffOldFile,
  diffLayoutPreference,
  diffOptions,
  fileTreeKey,
  fileTreePaths,
  fileSetChanges,
  gistDraft,
  gistEditing,
  gistSaving,
  fileEditor,
  fileEditorTitle,
  fileSaving,
  latestFile,
  mode,
  selectedFile,
  selectedFileHistory,
  selectedVersionSha,
  versionLoading,
  onBack,
  onCopyRaw,
  onDelete,
  onDuplicate,
  onToggleStar,
  onAddFile,
  onDeleteFile,
  onDuplicateFile,
  onCancelGistEdit,
  onGistDraftChange,
  onGistSubmit,
  onEdit,
  onEditFile,
  onUploadError,
  onUploadFiles,
  onDiffLayoutPreference,
  onDiffIndicatorStyle,
  onDiffInlineMode,
  onDiffExpandUnmodifiedLines,
  onDiffShowBackgrounds,
  onDiffShowLineNumbers,
  onDiffWrapLines,
  onSelectFile,
  onSelectVersion,
  onShowContent,
}: {
  activeFile: (GistFile & { content: string }) | null
  baseVersion: string | null
  canManage: boolean
  colorMode: ResolvedColorMode
  detail: GistDetail | null
  detailLoading: boolean
  diffFilePath: string | null
  diffNewFile: (GistFile & { content: string }) | null
  diffOldFile: (GistFile & { content: string }) | null
  diffLayoutPreference: DiffLayoutPreference
  diffOptions: DiffViewOptions
  fileTreeKey: string
  fileTreePaths: string[]
  fileSetChanges: GistHistoryItem[]
  gistDraft: GistEditorDraft
  gistEditing: boolean
  gistSaving: boolean
  fileEditor: ReactNode
  fileEditorTitle: string | null
  fileSaving: boolean
  latestFile: (GistFile & { content: string }) | null
  mode: ViewMode
  selectedFile: string | null
  selectedFileHistory: GistHistoryItem[]
  selectedVersionSha: string | null
  versionLoading: boolean
  onBack(): void
  onCopyRaw(rawUrl: string): void
  onDelete(): void
  onDuplicate(): void
  onToggleStar(): void
  onAddFile(): void
  onDeleteFile(): void
  onDuplicateFile(): void
  onCancelGistEdit(): void
  onGistDraftChange(value: GistEditorDraft): void
  onGistSubmit(event: FormEvent<HTMLFormElement>): void
  onEdit(): void
  onEditFile(): void
  onUploadError(message: string): void
  onUploadFiles(files: UploadedTextFile[]): void | Promise<void>
  onDiffLayoutPreference(value: DiffLayoutPreference): void
  onDiffIndicatorStyle(value: DiffIndicatorStyle): void
  onDiffInlineMode(value: DiffInlineMode): void
  onDiffExpandUnmodifiedLines(value: boolean): void
  onDiffShowBackgrounds(value: boolean): void
  onDiffShowLineNumbers(value: boolean): void
  onDiffWrapLines(value: boolean): void
  onSelectFile(path: string): void
  onSelectVersion(sha: string): void
  onShowContent(): void
}) {
  const t = useT()
  const [contentFullscreen, setContentFullscreen] = useState(false)
  const [detailLayoutElement, setDetailLayoutElement] = useState<HTMLDivElement | null>(null)
  const [fileCardElement, setFileCardElement] = useState<HTMLDivElement | null>(null)
  const setDetailLayoutRef = useCallback((element: HTMLDivElement | null) => {
    setDetailLayoutElement(element)
  }, [])
  const setFileCardRef = useCallback((element: HTMLDivElement | null) => {
    setFileCardElement(element)
  }, [])
  const canCollapseSidePanels = useMediaQuery('(min-width: 768px)')
  const isCompactDiffViewport = useMediaQuery('(max-width: 767px)')
  const shouldForceCollapseSidePanels = useMediaQuery('(min-width: 768px) and (max-width: 1279px)')
  const detailLayoutWidth = useElementWidth(detailLayoutElement)
  const fileCardWidth = useElementWidth(fileCardElement)
  const [filesPanelCollapsedPreference, setFilesPanelCollapsedPreference] = useState<boolean | null>(() =>
    readStoredPanelCollapsed(gistFilesPanelCollapsedStorageKey),
  )
  const [activityPanelCollapsedPreference, setActivityPanelCollapsedPreference] = useState<boolean | null>(() =>
    readStoredPanelCollapsed(gistActivityPanelCollapsedStorageKey),
  )
  const rawFile = fileEditor ? null : activeFile
  const expandedLayoutMinimumWidth =
    mode === 'diff' ? diffModeExpandedLayoutMinimumWidth : contentModeExpandedLayoutMinimumWidth
  const shouldProtectContentPanelWidth =
    (mode === 'content' || mode === 'diff') &&
    !fileEditor &&
    detailLayoutWidth !== null &&
    detailLayoutWidth < expandedLayoutMinimumWidth
  const shouldAutoCollapseSidePanels = shouldForceCollapseSidePanels || shouldProtectContentPanelWidth
  const filesPanelCollapsed =
    canCollapseSidePanels && (filesPanelCollapsedPreference ?? shouldAutoCollapseSidePanels)
  const activityPanelCollapsed =
    canCollapseSidePanels && (activityPanelCollapsedPreference ?? shouldAutoCollapseSidePanels)
  const deletingLastFile = fileTreePaths.length <= 1
  const deleteFileButton = (
    <Button
      variant="destructive"
      size="icon"
      onClick={onDeleteFile}
      title={deletingLastFile ? undefined : t('delete')}
      aria-label={t('delete')}
      disabled={deletingLastFile}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )
  const autoDiffShouldUseUnified =
    diffLayoutPreference === 'auto' &&
    mode === 'diff' &&
    (
      isCompactDiffViewport ||
      (fileCardWidth !== null && fileCardWidth < autoSplitDiffMinimumWidth)
    )
  const resolvedDiffLayout: DiffLayout =
    diffLayoutPreference === 'auto'
      ? (autoDiffShouldUseUnified ? 'unified' : 'split')
      : diffLayoutPreference

  function setFilesPanelCollapsed(value: boolean) {
    setFilesPanelCollapsedPreference(value)
    localStorage.setItem(gistFilesPanelCollapsedStorageKey, value ? 'true' : 'false')
  }

  function setActivityPanelCollapsed(value: boolean) {
    setActivityPanelCollapsedPreference(value)
    localStorage.setItem(gistActivityPanelCollapsedStorageKey, value ? 'true' : 'false')
  }

  useEffect(() => {
    if (!contentFullscreen) return

    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContentFullscreen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [contentFullscreen])

  if (detailLoading) {
    return <GistDetailSkeleton />
  }

  if (!detail) return <EmptyState />

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('backToList')}
        </Button>
      </div>
      <GistHeader
        canManage={canManage}
        draft={gistDraft}
        editing={gistEditing}
        gist={detail}
        saving={gistSaving}
        onCancelEdit={onCancelGistEdit}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onDraftChange={onGistDraftChange}
        onEdit={onEdit}
        onToggleStar={onToggleStar}
        onSubmit={onGistSubmit}
      />
      <div
        ref={setDetailLayoutRef}
        className={cn(
          'gist-detail-layout',
          filesPanelCollapsed && 'gist-detail-layout-files-collapsed',
          activityPanelCollapsed && 'gist-detail-layout-activity-collapsed',
        )}
      >
        <div className="gist-detail-files-panel">
          {filesPanelCollapsed ? (
            <CompactFilePanel
              addLabel={t('addFile')}
              paths={fileTreePaths}
              selectedPath={selectedFile}
              title={t('files')}
              onAdd={canManage ? onAddFile : undefined}
              onExpand={() => setFilesPanelCollapsed(false)}
              onSelect={onSelectFile}
              uploadControl={
                canManage ? (
                  <TextFileUploadIconButton
                    disabled={fileSaving}
                    existingFilenames={fileTreePaths}
                    label={t('uploadFiles')}
                    onError={onUploadError}
                    onUploaded={onUploadFiles}
                  />
                ) : null
              }
            />
          ) : (
            <div className="grid gap-3">
              {canManage ? (
                <TextFileUploadDropzone
                  disabled={fileSaving}
                  existingFilenames={fileTreePaths}
                  label={t('uploadFiles')}
                  onError={onUploadError}
                  onUploaded={onUploadFiles}
                />
              ) : null}
              <FileTreePanel
                key={fileTreeKey}
                addLabel={t('addFile')}
                headerAction={
                  canCollapseSidePanels ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFilesPanelCollapsed(true)}
                      title={t('collapseSidebar')}
                      aria-label={t('collapseSidebar')}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  ) : null
                }
                paths={fileTreePaths}
                searchPlaceholder={t('fileTreeSearchPlaceholder')}
                selectedPath={selectedFile}
                title={t('files')}
                onAdd={canManage ? onAddFile : undefined}
                onSelect={onSelectFile}
              />
            </div>
          )}
        </div>
        {contentFullscreen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-background/80 backdrop-blur-sm"
            aria-label={t('exitFullscreen')}
            onClick={() => setContentFullscreen(false)}
          />
        ) : null}
        <Card
          ref={setFileCardRef}
          className={cn(
            'gist-file-card min-w-0 overflow-hidden',
            contentFullscreen && 'fixed inset-3 z-50 flex flex-col shadow-2xl md:inset-6',
          )}
        >
          <CardHeader className={cn('gist-file-card-header border-b', contentFullscreen && 'shrink-0')}>
            <div className="gist-file-header-top">
              <div className="min-w-0">
                <CardTitle className="truncate">{fileEditor ? fileEditorTitle : selectedFile ?? t('noFileSelected')}</CardTitle>
                <CardDescription>{fileEditor ? t('fileContent') : activeFile ? formatBytes(activeFile.size) : t('noContent')}</CardDescription>
              </div>
              <div className="diff-toolbar flex flex-wrap items-center gap-2">
                {mode === 'diff' ? (
                  <Button
                    className="diff-current-content-button"
                    variant="outline"
                    size="sm"
                    onClick={onShowContent}
                    title={t('currentContent')}
                    aria-label={t('currentContent')}
                  >
                    <FileCode2 className="h-3.5 w-3.5" />
                    <span className="diff-action-label">{t('currentContent')}</span>
                  </Button>
                ) : null}
                {canManage && latestFile && !fileEditor ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={onDuplicateFile}
                      title={t('duplicateFile')}
                      aria-label={t('duplicateFile')}
                    >
                      <CopyPlus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={onEditFile}
                      title={t('editFile')}
                      aria-label={t('editFile')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {deletingLastFile ? (
                      <ActionTooltip label={t('deleteLastFileBlocked')}>
                        {deleteFileButton}
                      </ActionTooltip>
                    ) : deleteFileButton}
                  </>
                ) : null}
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={contentFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
                  title={contentFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
                  onClick={() => setContentFullscreen((value) => !value)}
                >
                  {contentFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                {rawFile ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onCopyRaw(rawFile.raw_url)}
                      title={t('rawUrl')}
                      aria-label={t('rawUrl')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <a
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      href={rawFile.raw_url}
                      target="_blank"
                      rel="noreferrer"
                      title={t('openRawFile')}
                      aria-label={t('openRawFile')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </>
                ) : null}
              </div>
            </div>
            {mode === 'diff' ? (
              <div className="diff-options-row" aria-label={t('diffOptions')}>
                <div className="diff-control-group" aria-label={t('diffLayout')}>
                  <SegmentedButton
                    active={diffLayoutPreference === 'auto'}
                    ariaLabel={t('autoDiffLayout')}
                    onClick={() => onDiffLayoutPreference('auto')}
                  >
                    <MonitorSmartphone className="diff-control-icon h-3.5 w-3.5" />
                  </SegmentedButton>
                  <SegmentedButton
                    active={diffLayoutPreference === 'split'}
                    ariaLabel={t('splitDiff')}
                    onClick={() => onDiffLayoutPreference('split')}
                  >
                    <Columns2 className="diff-control-icon h-3.5 w-3.5" />
                  </SegmentedButton>
                  <SegmentedButton
                    active={diffLayoutPreference === 'unified'}
                    ariaLabel={t('unifiedDiff')}
                    onClick={() => onDiffLayoutPreference('unified')}
                  >
                    <Rows2 className="diff-control-icon h-3.5 w-3.5" />
                  </SegmentedButton>
                </div>
                <div className="diff-control-group" aria-label={t('diffIndicators')}>
                  <SegmentedButton
                    active={diffOptions.indicatorStyle === 'bars'}
                    ariaLabel={t('barsDiffStyle')}
                    onClick={() => onDiffIndicatorStyle('bars')}
                  >
                    <BetweenHorizontalStart className="diff-control-icon h-3.5 w-3.5" />
                  </SegmentedButton>
                  <SegmentedButton
                    active={diffOptions.indicatorStyle === 'classic'}
                    ariaLabel={t('classicDiffStyle')}
                    onClick={() => onDiffIndicatorStyle('classic')}
                  >
                    <SquarePlus className="diff-control-icon h-3.5 w-3.5" />
                  </SegmentedButton>
                  <SegmentedButton
                    active={diffOptions.indicatorStyle === 'none'}
                    ariaLabel={t('noDiffIndicators')}
                    onClick={() => onDiffIndicatorStyle('none')}
                  >
                    <CircleSlash className="diff-control-icon h-3.5 w-3.5" />
                  </SegmentedButton>
                </div>
                <DiffSelectControl
                  icon={WholeWord}
                  label={t('diffInlineMode')}
                  value={diffOptions.inlineMode}
                  options={[
                    {
                      description: t('wordAltDiffDescription'),
                      label: t('wordAltDiffStyle'),
                      value: 'word-alt',
                    },
                    {
                      description: t('wordDiffDescription'),
                      label: t('wordDiffStyle'),
                      value: 'word',
                    },
                    {
                      description: t('charDiffDescription'),
                      label: t('charDiffStyle'),
                      value: 'char',
                    },
                    {
                      description: t('noInlineDiffDescription'),
                      label: t('noInlineDiff'),
                      value: 'none',
                    },
                  ]}
                  onChange={(value) => onDiffInlineMode(value as DiffInlineMode)}
                />
                <DiffToggleButton
                  active={!diffOptions.expandUnmodifiedLines}
                  icon={FoldVertical}
                  title={
                    diffOptions.expandUnmodifiedLines
                      ? t('expandUnmodifiedLines')
                      : t('collapseUnmodifiedLines')
                  }
                  onClick={() => onDiffExpandUnmodifiedLines(!diffOptions.expandUnmodifiedLines)}
                />
                <DiffToggleButton
                  active={diffOptions.showBackgrounds}
                  icon={ImageIcon}
                  title={diffOptions.showBackgrounds ? t('hideBackgrounds') : t('showBackgrounds')}
                  onClick={() => onDiffShowBackgrounds(!diffOptions.showBackgrounds)}
                />
                <DiffToggleButton
                  active={diffOptions.wrapLines}
                  icon={TextWrap}
                  title={t('toggleDiffWrapping')}
                  onClick={() => onDiffWrapLines(!diffOptions.wrapLines)}
                />
                <DiffToggleButton
                  active={diffOptions.showLineNumbers}
                  icon={ListOrdered}
                  title={diffOptions.showLineNumbers ? t('hideLineNumbers') : t('showLineNumbers')}
                  onClick={() => onDiffShowLineNumbers(!diffOptions.showLineNumbers)}
                />
              </div>
            ) : null}
          </CardHeader>
          <CardContent className={cn('p-0', contentFullscreen && 'min-h-0 flex-1')}>
            {fileEditor ? (
              fileEditor
            ) : mode === 'content' ? (
              <CodeViewer colorMode={colorMode} file={latestFile} fullscreen={contentFullscreen} />
            ) : (
              <DiffViewer
                baseVersion={baseVersion}
                colorMode={colorMode}
                diffOptions={diffOptions}
                filePath={diffFilePath}
                fullscreen={contentFullscreen}
                loading={versionLoading}
                newFile={diffNewFile}
                oldFile={diffOldFile}
                selectedVersion={selectedVersionSha}
                layout={resolvedDiffLayout}
                onExpandUnmodifiedLinesChange={onDiffExpandUnmodifiedLines}
              />
            )}
          </CardContent>
        </Card>
        <div className="gist-detail-side-panels">
          {activityPanelCollapsed ? (
            <CompactHistoryPanel
              history={selectedFileHistory}
              selectedVersionSha={selectedVersionSha}
              title={t('fileHistory')}
              onExpand={() => setActivityPanelCollapsed(false)}
              onSelect={onSelectVersion}
            />
          ) : (
            <>
              <HistoryPanel
                history={selectedFileHistory}
                selectedFile={selectedFile}
                selectedVersionSha={selectedVersionSha}
                onCollapse={canCollapseSidePanels ? () => setActivityPanelCollapsed(true) : undefined}
                onSelect={onSelectVersion}
              />
              <FileSetChangesPanel history={fileSetChanges} />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function CloudflarePage({
  autoRefresh,
  notice,
  saving,
  settingsLoading,
  settings,
  usageLoading,
  usage,
  onAutoRefreshChange,
  onLoadUsage,
  onSave,
  onSettingsChange,
}: {
  autoRefresh: boolean
  notice: string | null
  saving: boolean
  settingsLoading: boolean
  settings: CloudflareSettingsDraft
  usageLoading: boolean
  usage: CloudflareUsage | null
  onAutoRefreshChange(value: boolean): void
  onLoadUsage(): void
  onSave(event: FormEvent<HTMLFormElement>): void
  onSettingsChange(settings: CloudflareSettingsDraft): void
}) {
  const t = useT()

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(380px,520px)_minmax(0,1fr)]">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('cloudflareSettings')}</CardTitle>
          <CardDescription>{t('cloudflareSettingsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <form className="grid gap-4" autoComplete="off" onSubmit={onSave}>
            <Field label={t('accountId')} htmlFor="cf-account-id">
              <Input
                id="cf-account-id"
                name="edgegist-cf-acct-ref"
                autoComplete="off"
                data-1p-ignore="true"
                data-bwignore="true"
                data-lpignore="true"
                spellCheck={false}
                value={settings.accountId}
                onChange={(event) => onSettingsChange({ ...settings, accountId: event.target.value })}
                placeholder="Cloudflare account ID"
              />
            </Field>
            <Field label={t('apiToken')} htmlFor="cf-api-token">
              <Input
                className="token-secret-input"
                id="cf-api-token"
                name="edgegist-cf-access-ref"
                type="text"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                data-lpignore="true"
                spellCheck={false}
                value={settings.apiToken ?? ''}
                onChange={(event) => onSettingsChange({ ...settings, apiToken: event.target.value })}
                placeholder={settings.hasApiToken ? t('leaveBlankToken') : t('cloudflareApiToken')}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('workerScript')} htmlFor="cf-worker-script">
                <Input
                  id="cf-worker-script"
                  value={settings.workerScriptName}
                  onChange={(event) => onSettingsChange({ ...settings, workerScriptName: event.target.value })}
                  placeholder="edge-gist"
                />
              </Field>
              <Field label={t('d1DatabaseId')} htmlFor="cf-d1-database">
                <Input
                  id="cf-d1-database"
                  value={settings.d1DatabaseId}
                  onChange={(event) => onSettingsChange({ ...settings, d1DatabaseId: event.target.value })}
                  placeholder="UUID"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('workersPlan')} htmlFor="cf-workers-plan">
                <SelectBox
                  id="cf-workers-plan"
                  value={settings.workersPlan}
                  onChange={(value) => onSettingsChange({ ...settings, workersPlan: value as WorkersPlan })}
                  options={[
                    ['free', 'Free'],
                    ['paid', 'Paid'],
                  ]}
                />
              </Field>
              <Field label={t('d1Plan')} htmlFor="cf-d1-plan">
                <SelectBox
                  id="cf-d1-plan"
                  value={settings.d1Plan}
                  onChange={(value) => onSettingsChange({ ...settings, d1Plan: value as D1Plan })}
                  options={[
                    ['free', 'Free'],
                    ['paid', 'Paid'],
                  ]}
                />
              </Field>
            </div>
            {notice ? <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">{notice}</p> : null}
            <CheckboxRow
              checked={autoRefresh}
              label={t('autoRefreshUsage')}
              onChange={onAutoRefreshChange}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || settingsLoading}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {t('save')}
              </Button>
              <Button type="button" variant="outline" disabled={usageLoading || saving} onClick={onLoadUsage}>
                {usageLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
                {usageLoading ? t('refreshing') : t('refreshUsage')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {usage ? (
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm',
              usageLoading && 'border-primary/30 bg-accent/40',
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              {usageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="font-medium">
                {usageLoading ? t('refreshingUsage') : `${t('usageLastRefreshed')}: ${formatDateTime(usage.fetchedAt)}`}
              </div>
              <div className="text-muted-foreground">{t('usageRefreshScope')}</div>
            </div>
          </div>
        ) : null}
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{t('workersUsage')}</CardTitle>
                <CardDescription>{t('workersUsageDescription')}</CardDescription>
              </div>
              {usage ? (
                <div className="text-sm text-muted-foreground">
                  {formatDateRange(usage.workers.windowStart, usage.workers.windowEnd)}
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-4">
            {usage ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={Gauge} label={t('workerScriptRequests')} value={formatNumber(usage.workers.scriptRequests)} />
                  <InfoRow icon={Gauge} label={t('workerAccountRequests')} value={formatNumber(usage.workers.workerRequests)} />
                  {usage.workers.pagesFunctionsRequests > 0 ? (
                    <InfoRow icon={Gauge} label={t('workerLegacyPagesRequests')} value={formatNumber(usage.workers.pagesFunctionsRequests)} />
                  ) : null}
                  <InfoRow icon={Gauge} label={t('workerErrors')} value={formatNumber(usage.workers.errors)} />
                </div>
                <UsageBar
                  label={usage.settings.workersPlan === 'paid' ? t('workerRequestsThisMonth') : t('workerRequestsToday')}
                  limit={usage.workers.requestLimit}
                  percent={usage.workers.requestPercent}
                  value={usage.workers.requests}
                />
              </>
            ) : usageLoading ? (
              <LoadingPanel icon={Cloud} text={t('refreshingUsage')} />
            ) : (
              <EmptyPanel icon={Cloud} text={t('saveSettingsThenRefresh')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{t('d1Usage')}</CardTitle>
                <CardDescription>{t('d1UsageDescription')}</CardDescription>
              </div>
              {usage ? (
                <div className="text-sm text-muted-foreground">
                  {formatDateRange(usage.d1.windowStart, usage.d1.windowEnd)}
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-4">
            {usage ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={Gauge} label={t('readQueries')} value={formatNumber(usage.d1.readQueries)} />
                  <InfoRow icon={Gauge} label={t('writeQueries')} value={formatNumber(usage.d1.writeQueries)} />
                </div>
                <UsageBar
                  label={t('rowsRead')}
                  limit={usage.d1.rowsReadLimit}
                  percent={usage.d1.rowsReadPercent}
                  value={usage.d1.rowsRead}
                />
                <UsageBar
                  label={t('rowsWritten')}
                  limit={usage.d1.rowsWrittenLimit}
                  percent={usage.d1.rowsWrittenPercent}
                  value={usage.d1.rowsWritten}
                />
                <UsageBar
                  label={t('databaseSize')}
                  limit={usage.d1.storageLimitBytes}
                  percent={usage.d1.storagePercent}
                  value={usage.d1.storageBytes}
                  formatter={formatBytesNullable}
                />
              </>
            ) : usageLoading ? (
              <LoadingPanel icon={HardDrive} text={t('refreshingUsage')} />
            ) : (
              <EmptyPanel icon={HardDrive} text={t('usageD1AfterRefresh')} />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function DataManagementPage({
  clearingHistory,
  dataNotice,
  exportIncludeHistory,
  exporting,
  importFileName,
  importIncludeHistory,
  importPayload,
  importing,
  onClearHistory,
  onExport,
  onExportIncludeHistoryChange,
  onImport,
  onImportFile,
  onImportIncludeHistoryChange,
}: {
  clearingHistory: boolean
  dataNotice: string | null
  exportIncludeHistory: boolean
  exporting: boolean
  importFileName: string
  importIncludeHistory: boolean
  importPayload: EdgeGistExportPayload | null
  importing: boolean
  onClearHistory(): void
  onExport(): void
  onExportIncludeHistoryChange(value: boolean): void
  onImport(): void
  onImportFile(file: File | null): void
  onImportIncludeHistoryChange(value: boolean): void
}) {
  const t = useT()

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('exportAllData')}</CardTitle>
          <CardDescription>{t('exportDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-4">
          <CheckboxRow
            checked={exportIncludeHistory}
            label={t('includeRetainedHistory')}
            onChange={onExportIncludeHistoryChange}
          />
          <Button onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {t('exportJson')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t('importAllData')}</CardTitle>
          <CardDescription>{t('importDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-4">
          <CheckboxRow
            checked={importIncludeHistory}
            label={t('includeRetainedHistory')}
            onChange={onImportIncludeHistoryChange}
          />
          <div className="grid gap-2 text-sm font-medium">
            <span>{t('importFile')}</span>
            <div className="flex min-h-10 items-center gap-3 rounded-md border bg-background px-3 py-2">
              <label
                className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground"
                htmlFor="edgegist-import"
              >
                <Upload className="h-3.5 w-3.5" />
                {t('selectFile')}
              </label>
              <Input
                id="edgegist-import"
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => onImportFile(event.target.files?.[0] ?? null)}
              />
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {importFileName || t('noImportFileSelected')}
              </span>
            </div>
          </div>
          {importFileName ? (
            <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t('importDetected', { file: importFileName, count: importPayload?.gists.length ?? 0 })}
            </div>
          ) : null}
          <Button variant="destructive" onClick={onImport} disabled={importing || !importPayload}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {t('importAndReplace')}
          </Button>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader className="border-b">
          <CardTitle>{t('clearRetainedHistory')}</CardTitle>
          <CardDescription>{t('clearHistoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {t('clearHistoryConfirm')}
          </div>
          <Button
            className="sm:w-auto"
            variant="destructive"
            onClick={onClearHistory}
            disabled={clearingHistory}
          >
            {clearingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {t('clearHistory')}
          </Button>
        </CardContent>
      </Card>

      {dataNotice ? (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground xl:col-span-2">
          {dataNotice}
        </div>
      ) : null}
    </section>
  )
}

function GistDetailSkeleton() {
  return (
    <section className="space-y-4" aria-busy="true">
      <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="grid min-w-0 flex-1 gap-3">
            <div className="h-5 w-72 max-w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-96 max-w-full animate-pulse rounded bg-muted/70" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
      <div className="gist-detail-layout">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent className="grid gap-3 p-4">
            <div className="h-9 animate-pulse rounded-md bg-muted/70" />
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <div className="h-9 w-4/5 animate-pulse rounded-md bg-muted/70" />
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="border-b">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted/70" />
          </CardHeader>
          <CardContent className="grid h-[360px] gap-3 bg-code p-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="h-3 animate-pulse rounded bg-muted"
                style={{ width: `${Math.max(34, 88 - index * 7)}%` }}
              />
            ))}
          </CardContent>
        </Card>
        <div className="gist-detail-side-panels">
          <Card>
            <CardHeader className="border-b">
              <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="grid gap-3 p-4">
              <div className="h-14 animate-pulse rounded-md bg-muted/70" />
              <div className="h-14 animate-pulse rounded-md bg-muted/70" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b">
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-14 animate-pulse rounded-md bg-muted/70" />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

function GistEditor({
  colorMode,
  draft,
  mode,
  saving,
  onUploadError,
  onCancel,
  onChange,
  onSubmit,
}: {
  colorMode: ResolvedColorMode
  draft: GistEditorDraft
  mode: GistEditorMode
  saving: boolean
  onUploadError(message: string): void
  onCancel(): void
  onChange(value: GistEditorDraft): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
}) {
  const t = useT()
  const [fullscreenFileId, setFullscreenFileId] = useState<string | null>(null)
  const visibleFiles = draft.files.filter((file) => !file.deleted)

  function updateFile(id: string, patch: Partial<GistFileDraft>) {
    onChange({
      ...draft,
      files: draft.files.map((file) => (file.id === id ? { ...file, ...patch } : file)),
    })
  }

  function removeFile(id: string) {
    if (fullscreenFileId === id) setFullscreenFileId(null)
    onChange({
      ...draft,
      files: draft.files.flatMap((file) => {
        if (file.id !== id) return [file]
        return file.originalFilename ? [{ ...file, deleted: true }] : []
      }),
    })
  }

  useEffect(() => {
    if (!fullscreenFileId) return

    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreenFileId(null)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [fullscreenFileId])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{mode === 'create' ? t('createGist') : t('editGist')}</CardTitle>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label={t('cancel')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field htmlFor="gist-editor-description" label={t('gistDescription')}>
            <Input
              id="gist-editor-description"
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="gist-editor-secret">
              <input
                id="gist-editor-secret"
                type="checkbox"
                checked={draft.secret}
                onChange={(event) => onChange({
                  ...draft,
                  secret: event.target.checked,
                  visibility: event.target.checked ? 'secret' : 'public',
                })}
                className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {t('secretGist')}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="gist-editor-starred">
              <input
                id="gist-editor-starred"
                type="checkbox"
                checked={draft.starred}
                onChange={(event) => onChange({ ...draft, starred: event.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {t('starred')}
            </label>
          </div>

          {mode === 'create' ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{t('files')}</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChange({ ...draft, files: [emptyFileDraft(), ...draft.files] })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('addFile')}
                </Button>
              </div>

              <TextFileUploadDropzone
                existingFilenames={activeDraftFilenames(draft.files)}
                label={t('uploadFiles')}
                onError={onUploadError}
                onUploaded={(uploadedFiles) =>
                  onChange({
                    ...draft,
                    files: prependUploadedTextFiles(draft.files, uploadedFiles, fileDraftFromUpload),
                  })
                }
              />

              {fullscreenFileId ? (
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default bg-background/80 backdrop-blur-sm"
                  aria-label={t('exitFullscreen')}
                  onClick={() => setFullscreenFileId(null)}
                />
              ) : null}

              {visibleFiles.map((file) => {
                const fullscreen = fullscreenFileId === file.id
                return (
                  <div
                    key={file.id}
                    className={cn(
                      'grid gap-2 rounded-md border bg-background p-3',
                      fullscreen && 'fixed inset-3 z-50 flex flex-col shadow-2xl md:inset-6',
                    )}
                  >
                    <div className="flex gap-2">
                      <Input
                        aria-label={t('fileName')}
                        required
                        value={file.filename}
                        onChange={(event) => updateFile(file.id, { filename: event.target.value })}
                      />
                      <TextFileUploadButton
                        label={t('uploadFileContent')}
                        onError={() => onUploadError(t('fileUploadFailed'))}
                        onText={(content) => updateFile(file.id, { content })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setFullscreenFileId(fullscreen ? null : file.id)}
                        aria-label={fullscreen ? t('exitFullscreen') : t('enterFullscreen')}
                        title={fullscreen ? t('exitFullscreen') : t('enterFullscreen')}
                      >
                        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeFile(file.id)}
                        aria-label={t('delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <label className="sr-only" id={`gist-editor-file-label-${file.id}`}>
                      {t('fileContent')}
                    </label>
                    <div
                      aria-labelledby={`gist-editor-file-label-${file.id}`}
                      id={`gist-editor-file-${file.id}`}
                      className={cn(
                        'editor-shell overflow-hidden rounded-md border border-input shadow-sm',
                        fullscreen && 'editor-shell-fullscreen flex-1',
                      )}
                    >
                      <Suspense
                        fallback={(
                          <EditorLoadingPlaceholder
                            maxHeight={fullscreen ? 'none' : 420}
                            minHeight={fullscreen ? 480 : 180}
                          />
                        )}
                      >
                        <LazyCodeMirrorEditor
                          colorMode={colorMode}
                          language={codeLanguageForFile({ filename: file.filename, language: file.language, content: file.content })}
                          maxHeight={fullscreen ? 'none' : 420}
                          minHeight={fullscreen ? 480 : 180}
                          onChange={(content) => updateFile(file.id, { content })}
                          value={file.content}
                        />
                      </Suspense>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t('saveGist')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FileEditor({
  colorMode,
  draft,
  mode,
  saving,
  onUploadError,
  onCancel,
  onChange,
  onSubmit,
}: {
  colorMode: ResolvedColorMode
  draft: FileEditorDraft
  mode: FileEditorMode
  saving: boolean
  onUploadError(message: string): void
  onCancel(): void
  onChange(value: FileEditorDraft): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
}) {
  const t = useT()

  return (
    <form className="grid gap-3 p-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Field htmlFor="file-editor-name" label={t('fileName')}>
          <div className="flex gap-2">
            <Input
              id="file-editor-name"
              required
              value={draft.filename}
              onChange={(event) => onChange({ ...draft, filename: event.target.value })}
            />
            <TextFileUploadButton
              label={t('uploadFileContent')}
              onError={() => onUploadError(t('fileUploadFailed'))}
              onText={(content) => onChange({ ...draft, content })}
            />
          </div>
        </Field>
      </div>
      <label className="sr-only" id="file-editor-content-label">
        {t('fileContent')}
      </label>
      <div
        aria-labelledby="file-editor-content-label"
        id="file-editor-content"
        className="editor-shell overflow-hidden rounded-md border border-input shadow-sm"
      >
        <Suspense fallback={<EditorLoadingPlaceholder maxHeight={520} minHeight={360} />}>
          <LazyCodeMirrorEditor
            colorMode={colorMode}
            language={codeLanguageForFile({ filename: draft.filename, language: draft.language, content: draft.content })}
            maxHeight={520}
            minHeight={360}
            onChange={(content) => onChange({ ...draft, content })}
            value={draft.content}
          />
        </Suspense>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t('save')}
        </Button>
      </div>
    </form>
  )
}

function TextFileUploadDropzone({
  disabled = false,
  existingFilenames,
  label,
  onError,
  onUploaded,
}: {
  disabled?: boolean
  existingFilenames: string[]
  label: string
  onError(message: string): void
  onUploaded(files: UploadedTextFile[]): void | Promise<void>
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function uploadFiles(files: FileList | File[] | null) {
    if (disabled || uploading) return
    const selectedFiles = Array.from(files ?? [])
    if (selectedFiles.length === 0) return

    setUploading(true)
    try {
      const uploadedFiles = await readUploadedTextFiles(selectedFiles, existingFilenames)
      if (uploadedFiles.length > 0) await onUploaded(uploadedFiles)
    } catch {
      onError(t('fileUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (disabled) return
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setDragActive(true)
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (disabled) return
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (disabled) return
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (disabled) return
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setDragActive(false)
    void uploadFiles(event.dataTransfer.files)
  }

  return (
    <div
      className={cn(
        'file-upload-dropzone',
        dragActive && 'file-upload-dropzone-active',
        uploading && 'file-upload-dropzone-busy',
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        disabled={disabled || uploading}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          void uploadFiles(files)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {label}
      </Button>
      {uploading ? (
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {t('uploadingFiles')}
        </span>
      ) : null}
    </div>
  )
}

function TextFileUploadIconButton({
  disabled = false,
  existingFilenames,
  label,
  onError,
  onUploaded,
}: {
  disabled?: boolean
  existingFilenames: string[]
  label: string
  onError(message: string): void
  onUploaded(files: UploadedTextFile[]): void | Promise<void>
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  async function uploadFiles(files: FileList | File[] | null) {
    if (disabled || uploading) return
    const selectedFiles = Array.from(files ?? [])
    if (selectedFiles.length === 0) return

    setUploading(true)
    try {
      const uploadedFiles = await readUploadedTextFiles(selectedFiles, existingFilenames)
      if (uploadedFiles.length > 0) await onUploaded(uploadedFiles)
    } catch {
      onError(t('fileUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        disabled={disabled || uploading}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          void uploadFiles(files)
        }}
      />
      <button
        type="button"
        className="compact-detail-panel-item"
        onClick={() => inputRef.current?.click()}
        title={label}
        aria-label={label}
        disabled={disabled || uploading}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </button>
    </>
  )
}

function TextFileUploadButton({
  label,
  onError,
  onText,
}: {
  label: string
  onError(): void
  onText(content: string): void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          void file.text().then(onText).catch(onError)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => inputRef.current?.click()}
        title={label}
        aria-label={label}
      >
        <Upload className="h-4 w-4" />
      </Button>
    </>
  )
}

function isFileDrag(event: ReactDragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function EditorLoadingPlaceholder({
  maxHeight,
  minHeight,
}: {
  maxHeight?: number | string
  minHeight: number
}) {
  const t = useT()
  const maxHeightValue = formatEditorSize(maxHeight ?? 'min(60vh, 640px)')

  return (
    <div
      className="flex items-center justify-center bg-code px-3 text-sm text-muted-foreground"
      style={{ maxHeight: maxHeightValue, minHeight }}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="ml-2">{t('loading')}</span>
    </div>
  )
}

function formatEditorSize(value: number | string) {
  return typeof value === 'number' ? `${value}px` : value
}

function ToastMessage({ message }: { message: string }) {
  return (
    <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow-lg">
      {message}
    </div>
  )
}

function ActionTooltip({ children, label }: { children: ReactNode; label: string }) {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const trigger = triggerRef.current
      const tooltip = tooltipRef.current
      if (!trigger || !tooltip) return

      const padding = 8
      const triggerRect = trigger.getBoundingClientRect()
      const tooltipWidth = tooltip.offsetWidth
      const tooltipHeight = tooltip.offsetHeight
      const maxLeft = Math.max(padding, window.innerWidth - tooltipWidth - padding)
      const idealLeft = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2)
      const left = Math.min(Math.max(padding, idealLeft), maxLeft)
      const belowTop = triggerRect.bottom + padding
      const aboveTop = triggerRect.top - tooltipHeight - padding
      const top = belowTop + tooltipHeight <= window.innerHeight - padding
        ? belowTop
        : Math.max(padding, aboveTop)

      setTooltipStyle({ left, top })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, label])

  return (
    <span
      ref={triggerRef}
      className="action-tooltip-trigger"
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="action-tooltip-floating"
          style={tooltipStyle ?? { left: 0, top: 0, visibility: 'hidden' }}
        >
          {label}
        </span>
      ) : null}
    </span>
  )
}

function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog: ConfirmDialogState
  onClose(): void
}) {
  const t = useT()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  async function confirm() {
    setSubmitting(true)
    await dialog.onConfirm()
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-lg border bg-card p-4 text-card-foreground shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-normal">{dialog.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{dialog.description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('cancel')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant={dialog.variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => void confirm()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {dialog.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function GistDirectory({
  canManage,
  colorMode,
  gists,
  loading,
  matchesById,
  onCreate,
  page,
  perPage,
  query,
  selectedGistId,
  sortKey,
  starFilter,
  total,
  totalPages,
  typeFilter,
  onPageChange,
  onPerPageChange,
  onQueryChange,
  onSelect,
  onSortKeyChange,
  onStarFilterChange,
  onToggleStar,
  onTypeFilterChange,
}: {
  canManage: boolean
  colorMode: ResolvedColorMode
  gists: GistSummary[]
  loading: boolean
  matchesById: Record<string, GistSearchMatch>
  onCreate(): void
  page: number
  perPage: number
  query: string
  selectedGistId: string | null
  sortKey: GistSortKey
  starFilter: GistStarFilter
  total: number
  totalPages: number
  typeFilter: GistTypeFilter
  onPageChange(value: number): void
  onPerPageChange(value: number): void
  onQueryChange(value: string): void
  onSelect(id: string): void
  onSortKeyChange(value: GistSortKey): void
  onStarFilterChange(value: GistStarFilter): void
  onToggleStar(gist: GistSummary): void
  onTypeFilterChange(value: GistTypeFilter): void
}) {
  const t = useT()
  const pageItems = paginationItems(page, totalPages)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4">
        <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
          <div className="flex min-w-0 gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t('gistSearchLabel')}
                className="pl-9"
                placeholder={t('gistSearchPlaceholder')}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </div>
            {canManage ? (
              <Button
                className="h-10 w-10 shrink-0 px-0 lg:w-auto lg:px-3"
                type="button"
                onClick={onCreate}
                title={t('createGist')}
                aria-label={t('createGist')}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{t('createGist')}</span>
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 xl:justify-end">
            <div className="flex min-w-0 flex-1 flex-wrap gap-2 xl:flex-none xl:flex-nowrap">
              <FilterSelect
                label={t('type')}
                value={typeFilter}
                onChange={(value) => onTypeFilterChange(value as GistTypeFilter)}
              >
                <option value="all">{t('allTypes')}</option>
                <option value="public">{t('publicGist')}</option>
                <option value="secret">{t('secretType')}</option>
              </FilterSelect>
              <FilterSelect
                label={t('starred')}
                value={starFilter}
                onChange={(value) => onStarFilterChange(value as GistStarFilter)}
              >
                <option value="all">{t('allTypes')}</option>
                <option value="starred">{t('starredOnly')}</option>
              </FilterSelect>
              <FilterSelect
                label={t('sort')}
                value={sortKey}
                onChange={(value) => onSortKeyChange(value as GistSortKey)}
              >
                <option value="updated-desc">{t('sortUpdatedDesc')}</option>
                <option value="updated-asc">{t('sortUpdatedAsc')}</option>
                <option value="created-desc">{t('sortCreatedDesc')}</option>
                <option value="created-asc">{t('sortCreatedAsc')}</option>
                <option value="starred-desc">{t('sortStarredDesc')}</option>
                <option value="starred-asc">{t('sortStarredAsc')}</option>
              </FilterSelect>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading && gists.length === 0 ? (
          <div className="space-y-0 divide-y">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="px-4 py-3" key={index}>
                <div className="h-4 w-36 rounded bg-muted" />
                <div className="mt-2 h-3 w-48 rounded bg-muted/70" />
              </div>
            ))}
          </div>
        ) : gists.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('noMatchingGists')}</p>
        ) : (
          <div className="divide-y">
            {gists.map((gist) => {
              const match = matchesById[gist.id]
              const hasContentMatch = (match?.content.length ?? 0) > 0
              return (
                <div
                  key={gist.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedGistId === gist.id}
                  className={cn(
                    'grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    !hasContentMatch && '2xl:grid-cols-[minmax(0,1fr)_40px_80px_120px_120px]',
                    selectedGistId === gist.id && 'bg-accent text-accent-foreground',
                  )}
                  onClick={() => onSelect(gist.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    onSelect(gist.id)
                  }}
                >
                  <div className="min-w-0">
                    <div className={cn('flex min-w-0 items-start gap-2', !hasContentMatch && '2xl:hidden')}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          <HighlightedText query={query} text={gistDisplayTitle(gist)} />
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          <HighlightedText query={query} text={gist.id} />
                        </div>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          className={cn(
                            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                            !hasContentMatch && '2xl:hidden',
                          )}
                          title={gist.starred ? t('unstarGist') : t('starGist')}
                          aria-label={gist.starred ? t('unstarGist') : t('starGist')}
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleStar(gist)
                          }}
                        >
                          <Star className={cn('h-4 w-4', gist.starred && 'fill-current text-primary')} />
                        </button>
                      ) : gist.starred ? (
                        <Star className={cn('h-4 w-4 shrink-0 fill-current text-primary', !hasContentMatch && '2xl:hidden')} />
                      ) : null}
                    </div>
                    <div className={cn('hidden truncate text-sm font-medium', !hasContentMatch && '2xl:block')}>
                      <HighlightedText query={query} text={gistDisplayTitle(gist)} />
                    </div>
                    <div className={cn('mt-1 hidden truncate font-mono text-xs text-muted-foreground', !hasContentMatch && '2xl:block')}>
                      <HighlightedText query={query} text={gist.id} />
                    </div>
                    <GistSearchMatchPreview colorMode={colorMode} match={match} query={query} />
                    <div className={cn('mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground', !hasContentMatch && '2xl:hidden')}>
                      <Badge variant="secondary">{gistVisibilityLabel(gist.visibility, t)}</Badge>
                      <LabeledRelativeTime label={t('updatedLabel')} value={gist.updated_at} />
                      <LabeledRelativeTime label={t('createdLabel')} value={gist.created_at} />
                    </div>
                  </div>
                  <div className={cn('hidden items-center', !hasContentMatch && '2xl:flex 2xl:justify-end')}>
                    {canManage ? (
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={gist.starred ? t('unstarGist') : t('starGist')}
                        aria-label={gist.starred ? t('unstarGist') : t('starGist')}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleStar(gist)
                        }}
                      >
                        <Star className={cn('h-4 w-4', gist.starred && 'fill-current text-primary')} />
                      </button>
                    ) : gist.starred ? (
                      <Star className="h-4 w-4 fill-current text-primary" />
                    ) : null}
                  </div>
                  <div className={cn('hidden items-center', !hasContentMatch && '2xl:flex 2xl:justify-end')}>
                    <Badge variant="secondary">{gistVisibilityLabel(gist.visibility, t)}</Badge>
                  </div>
                  <div className={cn('hidden text-xs text-muted-foreground', !hasContentMatch && '2xl:block 2xl:text-right')}>
                    <div>{t('updatedLabel')}</div>
                    <div className="font-medium text-current">
                      <RelativeTime value={gist.updated_at} />
                    </div>
                  </div>
                  <div className={cn('hidden text-xs text-muted-foreground', !hasContentMatch && '2xl:block 2xl:text-right')}>
                    <div>{t('createdLabel')}</div>
                    <div className="font-medium text-current">
                      <RelativeTime value={gist.created_at} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {t('paginationSummary', {
              count: gists.length,
              page,
              perPage,
              total,
              totalPages,
            })}
          </span>
          <PageSizeSelect
            disabled={loading}
            label={t('pageSize')}
            value={perPage}
            onChange={(value) => onPerPageChange(value)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {pageItems.map((item, index) =>
            item === 'ellipsis' ? (
              <span
                className="flex h-9 w-9 items-center justify-center text-muted-foreground"
                key={`ellipsis-${index}`}
              >
                ...
              </span>
            ) : (
              <Button
                aria-current={item === page ? 'page' : undefined}
                aria-label={t('pageNumber', { page: item })}
                className="h-9 w-9 px-0"
                disabled={loading}
                key={item}
                size="icon"
                type="button"
                variant={item === page ? 'default' : 'outline'}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            ),
          )}
        </div>
      </div>
    </Card>
  )
}

function PageSizeSelect({
  disabled,
  label,
  value,
  onChange,
}: {
  disabled: boolean
  label: string
  value: number
  onChange(value: number): void
}) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="relative">
        <select
          className="h-7 appearance-none bg-transparent py-1 pl-0 pr-6 text-sm font-medium text-foreground outline-none disabled:opacity-60"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {gistListPerPageOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  )
}

function GistSearchMatchPreview({
  colorMode,
  match,
  query,
}: {
  colorMode: ResolvedColorMode
  match?: GistSearchMatch
  query: string
}) {
  if (!query.trim() || !match) return null

  const filenames = match.filenames.slice(0, 2)
  const contentMatches = match.content.slice(0, 1)
  if (filenames.length === 0 && contentMatches.length === 0) return null

  return (
    <div className="mt-2 grid gap-2 text-xs text-muted-foreground">
      {filenames.map((filename) => (
        <div key={filename} className="truncate">
          <HighlightedText query={query} text={filename} />
        </div>
      ))}
      {contentMatches.map((item) => (
        <SearchContentMatchPreview colorMode={colorMode} item={item} key={`${item.filename}:${item.startLine}`} query={query} />
      ))}
    </div>
  )
}

function SearchContentMatchPreview({
  colorMode,
  item,
  query,
}: {
  colorMode: ResolvedColorMode
  item: GistSearchContentMatch
  query: string
}) {
  const highlightedCode = useHighlightedCode(
    {
      content: item.content,
      filename: item.filename,
      language: item.language,
      raw_url: item.raw_url,
      size: item.size,
      truncated: item.truncated,
      type: item.type,
    },
    colorMode,
  )
  const fallbackLines = useMemo(() => splitCodeLines(item.content), [item.content])
  const lines = highlightedCode.ready ? highlightedCode.lines : fallbackLines.map(escapeHtml)

  return (
    <div className="overflow-hidden rounded-md border bg-code text-code-foreground">
      <div className="border-b bg-muted/30 px-2 py-1 font-sans text-[0.7rem] text-muted-foreground">
        <span className="font-medium text-foreground">{item.filename}</span>
        <span className="ml-1">:{item.matchLine}</span>
      </div>
      <pre className="max-h-40 overflow-auto py-1 font-mono text-[0.72rem] leading-5">
        {lines.map((line, index) => {
          const lineNumber = item.startLine + index
          const isMatchLine = lineNumber === item.matchLine
          return (
            <div
              className={cn(
                'grid grid-cols-[2.75rem_minmax(0,1fr)]',
                isMatchLine && 'bg-primary/10 text-foreground',
              )}
              key={`${item.filename}:${lineNumber}`}
            >
              <span className="select-none border-r border-border/70 px-2 text-right text-muted-foreground">
                {lineNumber}
              </span>
              <code
                className="min-w-0 px-2 whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: highlightHtmlText(line || '&nbsp;', query) }}
              />
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function HighlightedText({ query, text }: { query: string; text: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>

  const lowerText = text.toLocaleLowerCase()
  const lowerNeedle = needle.toLocaleLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let index = lowerText.indexOf(lowerNeedle)

  while (index >= 0) {
    if (index > cursor) parts.push(text.slice(cursor, index))
    parts.push(
      <mark
        key={`${index}:${text.slice(index, index + needle.length)}`}
        className="rounded-sm bg-primary/25 px-0.5 text-foreground"
      >
        {text.slice(index, index + needle.length)}
      </mark>,
    )
    cursor = index + needle.length
    index = lowerText.indexOf(lowerNeedle, cursor)
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

function highlightHtmlText(html: string, query: string) {
  const needle = query.trim()
  if (!needle) return html

  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') {
    const regex = new RegExp(escapeRegExp(escapeHtml(needle)), 'gi')
    return html
      .split(/(<[^>]+>)/g)
      .map((part) => (part.startsWith('<') ? part : part.replace(regex, '<mark class="search-code-mark">$&</mark>')))
      .join('')
  }

  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = parsed.body.firstElementChild
  if (!root) return html

  const walker = parsed.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let text = ''
  let current = walker.nextNode()
  while (current) {
    const node = current as Text
    const value = node.nodeValue ?? ''
    const start = text.length
    text += value
    nodes.push({ node, start, end: text.length })
    current = walker.nextNode()
  }

  const lowerText = text.toLocaleLowerCase()
  const lowerNeedle = needle.toLocaleLowerCase()
  const rangesByNode = new Map<Text, Array<[number, number]>>()
  let matchIndex = lowerText.indexOf(lowerNeedle)

  while (matchIndex >= 0) {
    const matchEnd = matchIndex + lowerNeedle.length
    for (const item of nodes) {
      if (item.end <= matchIndex || item.start >= matchEnd) continue
      const from = Math.max(0, matchIndex - item.start)
      const to = Math.min(item.end - item.start, matchEnd - item.start)
      if (to > from) {
        const ranges = rangesByNode.get(item.node) ?? []
        ranges.push([from, to])
        rangesByNode.set(item.node, ranges)
      }
    }
    matchIndex = lowerText.indexOf(lowerNeedle, matchEnd)
  }

  for (const [node, ranges] of rangesByNode) {
    ranges
      .sort((left, right) => right[0] - left[0])
      .forEach(([from, to]) => wrapTextNodeRange(parsed, node, from, to))
  }

  return root.innerHTML
}

function wrapTextNodeRange(ownerDocument: Document, node: Text, from: number, to: number) {
  if (!node.parentNode || to <= from) return

  const after = node.splitText(to)
  const match = node.splitText(from)
  const mark = ownerDocument.createElement('mark')
  mark.className = 'search-code-mark'
  match.parentNode?.insertBefore(mark, after)
  mark.appendChild(match)
}

function GistHeader({
  canManage,
  draft,
  editing,
  gist,
  saving,
  onCancelEdit,
  onDelete,
  onDuplicate,
  onDraftChange,
  onEdit,
  onToggleStar,
  onSubmit,
}: {
  canManage: boolean
  draft: GistEditorDraft
  editing: boolean
  gist: GistDetail
  saving: boolean
  onCancelEdit(): void
  onDelete(): void
  onDuplicate(): void
  onDraftChange(value: GistEditorDraft): void
  onEdit(): void
  onToggleStar(): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
}) {
  const t = useT()

  if (canManage && editing) {
    return (
      <Card>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="grid min-w-0 gap-3">
              <Field htmlFor="gist-header-description" label={t('gistDescription')}>
                <Input
                  id="gist-header-description"
                  value={draft.description}
                  onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                <span>{gist.id}</span>
                <span>{t('fileCount', { count: Object.keys(gist.files).length })}</span>
                <LabeledRelativeTime label={t('updatedLabel')} value={gist.updated_at} />
                <LabeledRelativeTime label={t('createdLabel')} value={gist.created_at} />
                <label className="flex items-center gap-2 font-medium text-foreground" htmlFor="gist-header-secret">
                  <input
                    id="gist-header-secret"
                    type="checkbox"
                    checked={draft.secret}
                    onChange={(event) => onDraftChange({
                      ...draft,
                      secret: event.target.checked,
                      visibility: event.target.checked ? 'secret' : 'public',
                    })}
                    className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {t('secretGist')}
                </label>
                <label className="flex items-center gap-2 font-medium text-foreground" htmlFor="gist-header-starred">
                  <input
                    id="gist-header-starred"
                    type="checkbox"
                    checked={draft.starred}
                    onChange={(event) => onDraftChange({ ...draft, starred: event.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {t('starred')}
                </label>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onCancelEdit} disabled={saving}>
                {t('cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {t('saveGist')}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-normal">{gistDisplayTitle(gist)}</h2>
            <Badge variant="secondary">{gistVisibilityLabel(gist.visibility, t)}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{gist.id}</span>
            <span>{t('fileCount', { count: Object.keys(gist.files).length })}</span>
            <LabeledRelativeTime label={t('updatedLabel')} value={gist.updated_at} />
            <LabeledRelativeTime label={t('createdLabel')} value={gist.created_at} />
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={onToggleStar}
              title={gist.starred ? t('unstarGist') : t('starGist')}
              aria-label={gist.starred ? t('unstarGist') : t('starGist')}
            >
              <Star className={cn('h-3.5 w-3.5', gist.starred && 'fill-current')} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onDuplicate}
              disabled={saving}
              title={t('duplicateGist')}
              aria-label={t('duplicateGist')}
            >
              <CopyPlus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" onClick={onEdit} title={t('edit')} aria-label={t('edit')}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="destructive" size="icon" onClick={onDelete} title={t('delete')} aria-label={t('delete')}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LabeledRelativeTime({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label} <RelativeTime value={value} />
    </span>
  )
}

function RelativeTime({ value }: { value: string }) {
  const t = useT()
  const absolute = formatDateTime(value)
  const relative = relativeTime(value, t)

  return (
    <span
      className="time-tooltip"
      data-tooltip={absolute}
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation()
        event.currentTarget.focus()
      }}
    >
      <time dateTime={value} title={absolute}>
        {relative}
      </time>
    </span>
  )
}

function FilterSelect({
  children,
  label,
  value,
  onChange,
}: {
  children: ReactNode
  label: string
  value: string
  onChange(value: string): void
}) {
  return (
    <label className="inline-flex h-10 min-w-[150px] flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-accent sm:flex-none xl:min-w-[138px]">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="relative min-w-0 flex-1">
        <select
          className="h-8 w-full appearance-none bg-transparent py-1.5 pl-0 pr-6 text-sm font-medium text-foreground outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  )
}

function CodeViewer({
  colorMode,
  file,
  fullscreen = false,
}: {
  colorMode: ResolvedColorMode
  file: CodeFile | null
  fullscreen?: boolean
}) {
  const t = useT()
  const highlightedCode = useHighlightedCode(file, colorMode)

  if (!file) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          fullscreen ? 'h-full min-h-[520px]' : 'h-[520px]',
        )}
      >
        {t('noFileSelected')}
      </div>
    )
  }

  if (!highlightedCode.ready) {
    return <CodeViewportSkeleton fullscreen={fullscreen} />
  }

  return (
    <div className={cn('code-viewport', fullscreen && 'code-viewport-fullscreen')}>
      <pre className="code-block" data-language={codeLanguageForFile(file)}>
        {highlightedCode.lines.map((line, index) => (
          <div className="code-line-row" key={`${file.filename}:${index}`}>
            <span className="code-line-number">{index + 1}</span>
            <code className="code-line-content" dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
          </div>
        ))}
      </pre>
    </div>
  )
}

function DiffViewer({
  baseVersion,
  colorMode,
  diffOptions,
  filePath,
  fullscreen = false,
  loading,
  newFile,
  oldFile,
  onExpandUnmodifiedLinesChange,
  selectedVersion,
  layout,
}: {
  baseVersion: string | null
  colorMode: ResolvedColorMode
  diffOptions: DiffViewOptions
  filePath: string | null
  fullscreen?: boolean
  loading: boolean
  newFile: CodeFile | null
  oldFile: CodeFile | null
  onExpandUnmodifiedLinesChange(value: boolean): void
  selectedVersion: string | null
  layout: DiffLayout
}) {
  const t = useT()
  const oldContent = oldFile?.content ?? ''
  const newContent = newFile?.content ?? ''
  const fallbackName = filePath ?? ''
  const oldName = oldFile?.filename ?? fallbackName
  const newName = newFile?.filename ?? fallbackName
  const oldDiffFile = useMemo(
    () => createPierreDiffFile(oldFile, oldName, oldContent, colorMode),
    [colorMode, oldContent, oldFile, oldName],
  )
  const newDiffFile = useMemo(
    () => createPierreDiffFile(newFile, newName, newContent, colorMode),
    [colorMode, newContent, newFile, newName],
  )
  const pierreDiffOptions = useMemo(
    () =>
      ({
        collapsedContextThreshold: 6,
        diffIndicators: diffOptions.indicatorStyle,
        diffStyle: layout === 'split' ? 'split' : 'unified',
        disableBackground: !diffOptions.showBackgrounds,
        disableLineNumbers: !diffOptions.showLineNumbers,
        expandUnchanged: diffOptions.expandUnmodifiedLines,
        expansionLineCount: 200,
        hunkSeparators: 'line-info',
        lineDiffType: diffOptions.inlineMode,
        onPostRender: (_node: HTMLElement, instance: unknown) => {
          if (diffOptions.expandUnmodifiedLines) return

          const expandedHunks = (
            instance as unknown as {
              hunksRenderer?: { getExpandedHunksMap?: () => Map<number, unknown> }
            }
          ).hunksRenderer?.getExpandedHunksMap?.()

          if (expandedHunks && expandedHunks.size > 0) {
            onExpandUnmodifiedLinesChange(true)
          }
        },
        overflow: diffOptions.wrapLines ? 'wrap' : 'scroll',
        theme: codeTheme(colorMode),
        themeType: colorMode,
        tokenizeMaxLineLength: 40000,
      }) as const,
    [colorMode, diffOptions, layout, onExpandUnmodifiedLinesChange],
  )

  if (!filePath) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          fullscreen ? 'h-full min-h-[520px]' : 'h-[520px]',
        )}
      >
        {t('noFileSelected')}
      </div>
    )
  }

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          fullscreen ? 'h-full min-h-[520px]' : 'h-[520px]',
        )}
      >
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('loadingCommitDiff')}
      </div>
    )
  }

  if (!selectedVersion || (!oldFile && !newFile)) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          fullscreen ? 'h-full min-h-[520px]' : 'h-[520px]',
        )}
      >
        {t('selectRetainedVersion')}
      </div>
    )
  }

  return (
    <div className={cn('diff-viewport pierre-diff-viewport', fullscreen && 'diff-viewport-fullscreen')}>
      <Suspense fallback={<CodeViewportSkeleton fullscreen={fullscreen} />}>
        <LazyMultiFileDiff
          key={[
            filePath,
            baseVersion ?? 'empty',
            selectedVersion,
            layout,
            diffOptions.expandUnmodifiedLines ? 'expanded' : 'collapsed',
          ].join(':')}
          className="edgegist-pierre-diff"
          disableWorkerPool
          newFile={newDiffFile}
          oldFile={oldDiffFile}
          options={pierreDiffOptions}
          renderHeaderMetadata={() => (
            <span>
              {baseVersion ? baseVersion.slice(0, 7) : 'empty'}
              {' -> '}
              {selectedVersion.slice(0, 7)}
            </span>
          )}
        />
      </Suspense>
    </div>
  )
}

function CodeViewportSkeleton({ fullscreen = false }: { fullscreen?: boolean }) {
  const t = useT()

  return (
    <div
      aria-label={t('loading')}
      className={cn('code-viewport', fullscreen && 'code-viewport-fullscreen')}
      role="status"
    >
      <div className="grid gap-3 p-4">
        {Array.from({ length: 14 }, (_, index) => (
          <div className="flex items-center gap-4" key={index}>
            <span className="h-4 w-8 shrink-0 rounded bg-muted animate-pulse" />
            <span
              className="h-4 rounded bg-muted animate-pulse"
              style={{ width: `${Math.max(22, 86 - index * 4)}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function codeTheme(colorMode: ResolvedColorMode) {
  return colorMode === 'dark' ? 'github-dark-default' : 'github-light-default'
}

type CodeFile = Pick<GistFile, 'filename' | 'language' | 'raw_url' | 'size' | 'truncated' | 'type'> & {
  content: string
}

const codeHighlightCache = new Map<string, Promise<string[]>>()
const codeHighlightResultCache = new Map<string, string[]>()
const highlighterLanguageLoaders = {
  bash: () => import('@shikijs/langs/bash'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  go: () => import('@shikijs/langs/go'),
  html: () => import('@shikijs/langs/html'),
  ini: () => import('@shikijs/langs/ini'),
  java: () => import('@shikijs/langs/java'),
  js: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  php: () => import('@shikijs/langs/php'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  scss: () => import('@shikijs/langs/scss'),
  sql: () => import('@shikijs/langs/sql'),
  toml: () => import('@shikijs/langs/toml'),
  ts: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml'),
} as const
let codeHighlighterPromise: ReturnType<typeof createHighlighterCore> | null = null

const languageAliases: Record<string, string> = {
  'c#': 'csharp',
  'c++': 'cpp',
  javascript: 'js',
  typescript: 'ts',
  shell: 'bash',
  sh: 'bash',
  yml: 'yaml',
  zsh: 'bash',
  plain: 'text',
  plaintext: 'text',
}

function normalizeCodeLanguage(language: string | null | undefined) {
  if (!language) return undefined
  const normalized = language.trim().toLowerCase().replace(/\s+/g, '-')
  const mapped = languageAliases[normalized] ?? normalized
  return mapped === 'text' ? undefined : mapped
}

const extensionLanguages: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  conf: 'ini',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  env: 'bash',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  html: 'html',
  ini: 'ini',
  java: 'java',
  js: 'js',
  json: 'json',
  jsonc: 'jsonc',
  jsx: 'jsx',
  md: 'markdown',
  mjs: 'js',
  php: 'php',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  toml: 'toml',
  ts: 'ts',
  tsx: 'tsx',
  txt: 'text',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
}

function codeLanguageForFile(file: Pick<CodeFile, 'filename' | 'language' | 'content'>) {
  const language =
    normalizeCodeLanguage(file.language) ??
    inferLanguageFromFilename(file.filename) ??
    inferLanguageFromContent(file.content) ??
    'text'
  return isHighlighterLanguage(language) ? language : 'text'
}

function createPierreDiffFile(
  file: CodeFile | null,
  fallbackName: string,
  fallbackContent: string,
  colorMode: ResolvedColorMode,
): PierreDiffFileContents {
  const name = file?.filename ?? fallbackName
  const contents = file?.content ?? fallbackContent
  const language =
    file ? codeLanguageForFile(file) : inferLanguageFromFilename(name) ?? inferLanguageFromContent(contents) ?? 'text'

  return {
    cacheKey: `${codeTheme(colorMode)}:${language}:${name}:${contents.length}:${hashString(contents)}`,
    contents,
    lang: language as PierreDiffFileContents['lang'],
    name,
  }
}

function isHighlighterLanguage(language: string) {
  return language === 'text' || Object.prototype.hasOwnProperty.call(highlighterLanguageLoaders, language)
}

function inferLanguageFromFilename(filename: string) {
  const baseName = filename.toLowerCase().split('/').pop() ?? filename.toLowerCase()
  if (baseName === '.env' || baseName.startsWith('.env.')) return 'bash'
  const extension = baseName.includes('.') ? baseName.split('.').pop() : undefined
  return extension ? extensionLanguages[extension] : undefined
}

function inferLanguageFromContent(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return undefined
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      return undefined
    }
  }
  if (looksLikeYaml(trimmed)) return 'yaml'
  return undefined
}

function looksLikeYaml(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'))

  if (lines.length === 0) return false
  if (lines[0] === '---' || lines[0].startsWith('%YAML ')) return true

  let keyLines = 0
  let listLines = 0
  let nestedLines = 0

  for (const line of lines) {
    if (/^\s*[A-Za-z0-9_.-]+:\s*(?:$|[|>-]$|['"[{]|\S.*$)/.test(line)) {
      keyLines += 1
      continue
    }
    if (/^\s*-\s+(?:[A-Za-z0-9_.-]+:\s*)?\S+/.test(line)) {
      listLines += 1
      continue
    }
    if (/^\s{2,}\S/.test(line)) nestedLines += 1
  }

  return keyLines >= 2 || (keyLines >= 1 && (listLines >= 1 || nestedLines >= 1))
}

function useHighlightedCode(file: CodeFile | null, colorMode: ResolvedColorMode) {
  const fallbackLines = useMemo(() => (file ? plainHtmlLines(file.content) : []), [file])
  const [state, setState] = useState<{ cacheKey: string; lines: string[]; ready: boolean }>({
    cacheKey: '',
    lines: fallbackLines,
    ready: !file || !shouldHighlightCode(file),
  })
  const cacheKey = file ? codeCacheKey(file, colorMode) : ''

  useEffect(() => {
    if (!file) {
      setState({ cacheKey: '', lines: [], ready: true })
      return
    }

    const cachedLines = codeHighlightResultCache.get(cacheKey)
    if (cachedLines) {
      setState({ cacheKey, lines: cachedLines, ready: true })
      return
    }

    if (!shouldHighlightCode(file)) {
      setState({ cacheKey, lines: fallbackLines, ready: true })
      return
    }

    let cancelled = false
    setState({ cacheKey, lines: fallbackLines, ready: false })
    void highlightCodeLines(file, colorMode).then((lines) => {
      if (!cancelled) setState({ cacheKey, lines, ready: true })
    })

    return () => {
      cancelled = true
    }
  }, [cacheKey, colorMode, fallbackLines, file])

  if (state.cacheKey === cacheKey) {
    return { lines: state.lines, ready: state.ready }
  }

  if (!file || !shouldHighlightCode(file)) {
    return { lines: fallbackLines, ready: true }
  }

  const cachedLines = codeHighlightResultCache.get(cacheKey)
  if (cachedLines) return { lines: cachedLines, ready: true }

  return { lines: fallbackLines, ready: false }
}

function shouldHighlightCode(file: CodeFile) {
  return codeLanguageForFile(file) !== 'text'
}

function highlightCodeLines(file: CodeFile, colorMode: ResolvedColorMode) {
  const cacheKey = codeCacheKey(file, colorMode)
  const existingResult = codeHighlightResultCache.get(cacheKey)
  if (existingResult) return Promise.resolve(existingResult)

  const existing = codeHighlightCache.get(cacheKey)
  if (existing) return existing

  const promise = (async () => {
    const language = codeLanguageForFile(file)
    try {
      const highlighter = await getCodeHighlighter()
      const html = highlighter.codeToHtml(file.content || '\n', {
        lang: language,
        theme: codeTheme(colorMode),
      })
      return extractHighlightedLines(html, file.content)
    } catch {
      if (language !== 'text') {
        try {
          const highlighter = await getCodeHighlighter()
          const html = highlighter.codeToHtml(file.content || '\n', {
            lang: 'text',
            theme: codeTheme(colorMode),
          })
          return extractHighlightedLines(html, file.content)
        } catch {
          return plainHtmlLines(file.content)
        }
      }
      return plainHtmlLines(file.content)
    }
  })().then((lines) => {
    codeHighlightResultCache.set(cacheKey, lines)
    trimCodeHighlightCaches()
    return lines
  })

  codeHighlightCache.set(cacheKey, promise)
  trimCodeHighlightCaches()

  return promise
}

function trimCodeHighlightCaches() {
  while (codeHighlightCache.size > 100) {
    const firstKey = codeHighlightCache.keys().next().value
    if (!firstKey) break
    codeHighlightCache.delete(firstKey)
    codeHighlightResultCache.delete(firstKey)
  }
}

function getCodeHighlighter() {
  if (!codeHighlighterPromise) {
    codeHighlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: Object.values(highlighterLanguageLoaders),
      themes: [
        () => import('@shikijs/themes/github-dark-default'),
        () => import('@shikijs/themes/github-light-default'),
      ],
      warnings: false,
    })
  }

  return codeHighlighterPromise
}

function codeCacheKey(file: CodeFile, colorMode: ResolvedColorMode) {
  return `${codeTheme(colorMode)}:${codeLanguageForFile(file)}:${file.filename}:${file.content.length}:${hashString(file.content)}`
}

function extractHighlightedLines(html: string, fallbackContent: string) {
  if (typeof DOMParser === 'undefined') return plainHtmlLines(fallbackContent)

  const document = new DOMParser().parseFromString(html, 'text/html')
  const highlightedLines = Array.from(document.querySelectorAll('span.line')).map((line) => line.innerHTML)
  const fallbackLines = splitCodeLines(fallbackContent)

  if (highlightedLines.length === 0) return fallbackLines.map(escapeHtml)
  return fallbackLines.map((_, index) => highlightedLines[index] ?? '')
}

function plainHtmlLines(content: string) {
  return splitCodeLines(content).map(escapeHtml)
}

function splitCodeLines(content: string) {
  const lines = content.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines.length > 0 ? lines : ['']
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return hash.toString(36)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function HistoryPanel({
  history,
  onCollapse,
  selectedFile,
  selectedVersionSha,
  onSelect,
}: {
  history: GistDetail['history']
  onCollapse?: () => void
  selectedFile: string | null
  selectedVersionSha: string | null
  onSelect(sha: string): void
}) {
  const t = useT()

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{t('fileHistory')}</CardTitle>
            <CardDescription className="mt-1 truncate">{selectedFile ?? t('fileHistoryDescription')}</CardDescription>
          </div>
          {onCollapse ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              title={t('collapseSidebar')}
              aria-label={t('collapseSidebar')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 p-3">
        {!selectedFile ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noFileSelected')}</p>
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noFileHistory')}</p>
        ) : (
          history.map((item) => {
            const fileChange = selectedFile ? fileChangeForPath(item, selectedFile) : null
            return (
              <button
                key={item.version}
                type="button"
                className={cn(
                  'grid w-full gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedVersionSha === item.version && 'border-primary bg-accent',
                )}
                onClick={() => onSelect(item.version)}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <GitCommitHorizontal className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate font-mono">{item.version.slice(0, 12)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-success">+{fileChange?.additions ?? 0}</span>
                    <span className="text-destructive">-{fileChange?.deletions ?? 0}</span>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{new Date(item.committed_at).toLocaleString()}</span>
                </div>
              </button>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function CompactFilePanel({
  addLabel,
  paths,
  selectedPath,
  title,
  onAdd,
  onExpand,
  onSelect,
  uploadControl,
}: {
  addLabel: string
  paths: string[]
  selectedPath: string | null
  title: string
  onAdd?: () => void
  onExpand(): void
  onSelect(path: string): void
  uploadControl?: ReactNode
}) {
  return (
    <div className="compact-detail-panel" aria-label={title}>
      <span
        className="compact-file-tree-sprite"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: compactFileIconSpriteSheet }}
      />
      <button
        type="button"
        className="compact-detail-panel-header"
        onClick={onExpand}
        title={title}
        aria-label={title}
        aria-expanded={false}
      >
        <Files className="h-4 w-4" />
      </button>
      <div className="compact-detail-panel-list">
        {paths.map((path) => (
          <button
            key={path}
            type="button"
            className={cn(
              'compact-detail-panel-item',
              selectedPath === path && 'compact-detail-panel-item-active',
            )}
            onClick={() => onSelect(path)}
            title={path}
            aria-label={path}
            aria-pressed={selectedPath === path}
          >
            <CompactFileTreeIcon path={path} />
          </button>
        ))}
        {onAdd ? (
          <button
            type="button"
            className="compact-detail-panel-item"
            onClick={onAdd}
            title={addLabel}
            aria-label={addLabel}
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
        {uploadControl}
      </div>
    </div>
  )
}

function CompactFileTreeIcon({ path }: { path: string }) {
  const icon = compactFileIconResolver.resolveIcon('file-tree-icon-file', path)
  const width = icon.width ?? 16
  const height = icon.height ?? 16
  const color = icon.token ? getBuiltInFileIconColor(icon.token) : undefined
  const style = color ? ({ color } satisfies CSSProperties) : undefined

  return (
    <svg
      className="compact-file-tree-icon"
      data-icon-name={icon.remappedFrom ?? icon.name}
      data-icon-token={icon.token}
      aria-hidden="true"
      viewBox={icon.viewBox ?? `0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={style}
    >
      <use href={`#${icon.name.replace(/^#/, '')}`} />
    </svg>
  )
}

function CompactHistoryPanel({
  history,
  selectedVersionSha,
  title,
  onExpand,
  onSelect,
}: {
  history: GistHistoryItem[]
  selectedVersionSha: string | null
  title: string
  onExpand(): void
  onSelect(sha: string): void
}) {
  return (
    <div className="compact-detail-panel" aria-label={title}>
      <button
        type="button"
        className="compact-detail-panel-header"
        onClick={onExpand}
        title={title}
        aria-label={title}
        aria-expanded={false}
      >
        <History className="h-4 w-4" />
      </button>
      <div className="compact-detail-panel-list">
        {history.map((item) => (
          <button
            key={item.version}
            type="button"
            className={cn(
              'compact-detail-panel-item',
              selectedVersionSha === item.version && 'compact-detail-panel-item-active',
            )}
            onClick={() => onSelect(item.version)}
            title={`${item.version.slice(0, 12)} ${new Date(item.committed_at).toLocaleString()}`}
            aria-label={`${title} ${item.version.slice(0, 12)}`}
            aria-pressed={selectedVersionSha === item.version}
          >
            <GitCommitHorizontal className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  )
}

function FileSetChangesPanel({ history }: { history: GistDetail['history'] }) {
  const t = useT()
  const changeCount = history.reduce((total, item) => total + item.files.length, 0)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4">
        <CardTitle>{t('fileSetChanges')}</CardTitle>
        <CardDescription>{changeCount}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 p-3">
        {history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noFileSetChanges')}</p>
        ) : (
          history.map((item) => (
            <div key={item.version} className="rounded-md border px-3 py-2">
              <div className="grid gap-1 text-xs text-muted-foreground">
                <span className="font-mono">{item.version.slice(0, 12)}</span>
                <span>{new Date(item.committed_at).toLocaleString()}</span>
              </div>
              <div className="mt-2 grid gap-1">
                {item.files.map((file) => (
                  <div key={`${item.version}:${file.status}:${file.filename}`} className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'shrink-0 font-mono',
                        file.status === 'deleted'
                          ? 'text-destructive'
                          : file.status === 'added'
                            ? 'text-success'
                            : 'text-muted-foreground',
                      )}
                    >
                      {changeStatusGlyph(file.status)}
                    </span>
                    <span className="min-w-0 truncate font-mono" title={file.filename}>
                      {file.filename}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function emptyGistDraft(): GistEditorDraft {
  return {
    description: '',
    secret: true,
    visibility: 'secret',
    starred: false,
    files: [],
  }
}

function emptyFileDraft(filename = ''): GistFileDraft {
  return {
    id: createDraftId(),
    originalFilename: null,
    originalContent: null,
    filename,
    language: null,
    content: '',
    deleted: false,
  }
}

function fileDraftFromUpload(file: UploadedTextFile): GistFileDraft {
  return {
    id: createDraftId(),
    originalFilename: null,
    originalContent: null,
    filename: file.filename,
    language: null,
    content: file.content,
    deleted: false,
  }
}

function emptySingleFileDraft(filename = ''): FileEditorDraft {
  return {
    originalFilename: null,
    filename,
    language: null,
    content: '',
  }
}

function gistDraftFromDetail(gist: GistDetail): GistEditorDraft {
  return {
    description: gist.description,
    secret: gist.visibility !== 'public',
    visibility: gist.visibility,
    starred: gist.starred,
    files: gistFilesByCreatedAt(gist.files).map((file) => ({
      id: createDraftId(),
      originalFilename: file.filename,
      originalContent: file.content,
      filename: file.filename,
      language: file.language,
      content: file.content,
      deleted: false,
    })),
  }
}

function createDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random()}`
}

function validateGistDraft(draft: GistEditorDraft): TranslationKey | null {
  const activeFiles = draft.files.filter((file) => !file.deleted)
  if (activeFiles.length === 0) return 'gistFilesRequired'
  if (activeFiles.some((file) => file.filename.length === 0)) return 'gistFilesRequired'
  if (activeFiles.some((file) => filenameHasPathSeparator(file.filename))) return 'fileNameCannotContainSlash'
  if (activeFiles.some((file) => file.content.length === 0)) return 'fileContentRequired'

  const names = activeFiles.map((file) => file.filename)
  if (new Set(names).size !== names.length) return 'fileNamesMustBeUnique'

  return null
}

function isLastRemainingGistFile(gist: GistDetail) {
  return Object.keys(gist.files).length <= 1
}

function gistDraftToSaveInput(draft: GistEditorDraft, mode: GistEditorMode): SaveGistInput {
  const files: SaveGistInput['files'] = {}

  for (const file of draft.files) {
    if (file.originalFilename) {
      if (file.deleted) {
        files[file.originalFilename] = null
        continue
      }

      const filename = file.filename
      if (filename !== file.originalFilename || file.content !== file.originalContent) {
        files[file.originalFilename] = {
          filename,
          content: file.content,
        }
      }
      continue
    }

    if (!file.deleted) {
      files[file.filename] = { content: file.content }
    }
  }

  return {
    description: draft.description,
    visibility: draft.visibility,
    public: draft.visibility === 'public',
    files: mode === 'create' ? Object.fromEntries(
      Object.entries(files).filter(([, value]) => value !== null),
    ) : files,
  }
}

function gistDetailToCreateInput(gist: GistDetail): SaveGistInput {
  return {
    description: gist.description,
    visibility: gist.visibility,
    public: gist.visibility === 'public',
    files: Object.fromEntries(
      gistFilesByCreatedAt(gist.files).map((file) => [
        file.filename,
        {
          content: file.content,
        },
      ]),
    ),
  }
}

function EmptyState() {
  const t = useT()

  return (
    <Card>
      <CardContent className="flex h-[560px] items-center justify-center text-sm text-muted-foreground">
        {t('selectGistToInspect')}
      </CardContent>
    </Card>
  )
}

function SegmentedButton({
  active,
  ariaLabel,
  children,
  onClick,
}: {
  active: boolean
  ariaLabel: string
  children: ReactNode
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={cn(
        'diff-layout-button inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      )}
      onClick={onClick}
      title={ariaLabel}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}

function DiffSelectControl({
  icon: Icon,
  label,
  onChange,
  options,
  value,
}: {
  icon: LucideIcon
  label: string
  onChange(value: string): void
  options: Array<{ description: string; label: string; value: string }>
  value: string
}) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0]
  const title = selectedOption ? `${label}: ${selectedOption.label}` : label

  return (
    <details className="diff-inline-menu">
      <summary className="diff-select-control" title={title} aria-label={title}>
        <Icon className="diff-control-icon h-3.5 w-3.5" />
        <ChevronsUpDown className="diff-select-chevron h-3.5 w-3.5 text-muted-foreground" />
      </summary>
      <div className="diff-inline-menu-content">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn('diff-inline-menu-item', option.value === value && 'diff-inline-menu-item-active')}
            onClick={(event) => {
              onChange(option.value)
              event.currentTarget.closest('details')?.removeAttribute('open')
            }}
          >
            <Check className={cn('diff-inline-menu-check h-4 w-4', option.value !== value && 'opacity-0')} />
            <span className="diff-inline-menu-copy">
              <span className="diff-inline-menu-title">{option.label}</span>
              <span className="diff-inline-menu-description">{option.description}</span>
            </span>
          </button>
        ))}
      </div>
    </details>
  )
}

function DiffToggleButton({
  active,
  icon: Icon,
  onClick,
  title,
}: {
  active: boolean
  icon: LucideIcon
  onClick(): void
  title: string
}) {
  return (
    <button
      type="button"
      className={cn('diff-toggle-button', active && 'diff-toggle-button-active')}
      aria-pressed={active}
      aria-label={title}
      onClick={onClick}
      title={title}
    >
      <Icon className="diff-control-icon h-3.5 w-3.5" />
    </button>
  )
}

function Field({ children, htmlFor, label }: { children: ReactNode; htmlFor: string; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  )
}

function SelectBox({
  id,
  onChange,
  options,
  value,
}: {
  id: string
  onChange(value: string): void
  options: Array<[string, string]>
  value: string
}) {
  return (
    <div className="relative inline-flex h-10 w-full items-center rounded-md border border-input bg-background shadow-sm transition-colors hover:bg-accent">
      <select
        id={id}
        className="h-full w-full appearance-none bg-transparent px-3 pr-9 text-sm text-foreground outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

function CheckboxRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange(value: boolean): void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {label}
    </label>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border bg-card px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}

function EmptyPanel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
      <Icon className="mb-2 h-5 w-5" />
      {text}
    </div>
  )
}

function LoadingPanel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed bg-accent/30 text-center text-sm text-muted-foreground">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-background text-foreground shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {text}
      </div>
    </div>
  )
}

function UsageBar({
  formatter = formatNumberNullable,
  label,
  limit,
  percent,
  value,
}: {
  formatter?: (value: number | null) => string
  label: string
  limit: number | null
  percent: number | null
  value: number | null
}) {
  const t = useT()
  const clampedPercent = Math.max(0, Math.min(100, percent ?? 0))

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatter(value)} / {limit === null ? t('noFixedLimit') : formatter(limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clampedPercent}%` }} />
      </div>
      {percent === null ? null : <div className="text-xs text-muted-foreground">{percent.toFixed(1)}%</div>}
    </div>
  )
}

function sectionMeta(
  section: AdminSection,
  hasSelectedGist: boolean,
  creatingGist: boolean,
  detail: GistDetail | null,
  t: Translator,
): { eyebrow: string; icon: LucideIcon; title: string } {
  if (section === 'gists' && creatingGist) {
    return {
      eyebrow: t('gists'),
      icon: Plus,
      title: t('createGist'),
    }
  }
  if (section === 'gists' && hasSelectedGist) {
    return {
      eyebrow: t('gists'),
      icon: FileCode2,
      title: t('gistDetail'),
    }
  }
  if (section === 'gists') return { eyebrow: t('gists'), icon: Files, title: t('gistDirectory') }
  if (section === 'cloudflare') return { eyebrow: t('cloudflare'), icon: Cloud, title: t('usageAndQuota') }
  if (section === 'data') return { eyebrow: t('data'), icon: Database, title: t('importAndExport') }
  return { eyebrow: t('gists'), icon: Files, title: t('gistDirectory') }
}

function toCloudflareDraft(settings: CloudflareSettings): CloudflareSettingsDraft {
  return {
    accountId: settings.accountId,
    apiToken: '',
    d1DatabaseId: settings.d1DatabaseId,
    d1Plan: settings.d1Plan,
    hasApiToken: settings.hasApiToken,
    workersPlan: settings.workersPlan,
    workerScriptName: settings.workerScriptName,
  }
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function gistDisplayTitle(gist: GistSummary) {
  return gist.description || gistFilePathsByCreatedAt(gist.files)[0] || gist.id
}

function gistVisibilityLabel(visibility: GistSummary['visibility'], t: Translator) {
  if (visibility === 'public') return t('publicGist')
  return t('secretType')
}

function gistSearchIndexFromDetail(gist: GistDetail): GistSearchIndex {
  return {
    files: Object.fromEntries(
      Object.values(gist.files).map((file) => [
        file.filename,
        {
          content: file.content,
          language: file.language,
          raw_url: file.raw_url,
          size: file.size,
          truncated: file.truncated,
          type: file.type,
        },
      ]),
    ),
  }
}

function pruneGistSearchIndex(
  current: Record<string, GistSearchIndex>,
  gists: GistSummary[],
): Record<string, GistSearchIndex> {
  const allowedIds = new Set(gists.map((gist) => gist.id))
  return Object.fromEntries(Object.entries(current).filter(([gistId]) => allowedIds.has(gistId)))
}

function findGistSearchMatch(
  gist: GistSummary,
  searchIndex: GistSearchIndex | undefined,
  query: string,
): GistSearchMatch {
  const filenames = gistFilePathsByCreatedAt(gist.files).filter((filename) => textIncludesSearch(filename, query))
  const content = Object.entries(searchIndex?.files ?? {})
    .flatMap(([filename, file]) => {
      const match = searchContentMatch(filename, file, query)
      return match ? [match] : []
    })
    .slice(0, 3)

  const directMatch = [gist.description, gist.id, gistDisplayTitle(gist)].some((value) => textIncludesSearch(value, query))
  return {
    direct: directMatch,
    filenames,
    content,
  }
}

function hasGistSearchMatch(match: GistSearchMatch) {
  return match.direct || match.filenames.length > 0 || match.content.length > 0
}

function textIncludesSearch(value: string, query: string) {
  const needle = query.trim()
  return needle.length > 0 && value.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function searchContentMatch(
  filename: string,
  file: GistSearchIndexFile,
  query: string,
): GistSearchContentMatch | null {
  const needle = query.trim()
  if (!needle) return null

  const lowerNeedle = needle.toLocaleLowerCase()
  const lines = splitCodeLines(file.content)
  const matchIndex = lines.findIndex((line) => line.toLocaleLowerCase().includes(lowerNeedle))
  if (matchIndex < 0) return null

  const contextRadius = 2
  const startIndex = Math.max(0, matchIndex - contextRadius)
  const endIndex = Math.min(lines.length, matchIndex + contextRadius + 1)

  return {
    content: lines.slice(startIndex, endIndex).join('\n'),
    filename,
    language: codeLanguageForFile({ filename, language: file.language, content: file.content }),
    matchLine: matchIndex + 1,
    raw_url: file.raw_url,
    size: file.size,
    startLine: startIndex + 1,
    truncated: file.truncated,
    type: file.type,
  }
}

function paginationItems(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1])
  if (page <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }
  if (page >= totalPages - 2) {
    pages.add(totalPages - 3)
    pages.add(totalPages - 2)
    pages.add(totalPages - 1)
  }

  const sortedPages = Array.from(pages)
    .filter((item) => item >= 1 && item <= totalPages)
    .sort((left, right) => left - right)

  const items: Array<number | 'ellipsis'> = []
  for (const item of sortedPages) {
    const previous = items[items.length - 1]
    if (typeof previous === 'number' && item - previous > 1) items.push('ellipsis')
    items.push(item)
  }
  return items
}

function formatBytesNullable(size: number | null) {
  if (size === null) return '-'
  if (size < 1024 * 1024 * 1024) return formatBytes(size)
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}

function formatNumberNullable(value: number | null) {
  return value === null ? '-' : formatNumber(value)
}

function formatDateRange(start: string, end: string) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startLabel = Number.isNaN(startDate.getTime()) ? start : startDate.toLocaleString()
  const endLabel = Number.isNaN(endDate.getTime()) ? end : endDate.toLocaleString()
  return `${startLabel} - ${endLabel}`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function ratioPercent(value: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((value / limit) * 1000) / 10)
}

function downloadJson(payload: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function isEdgeGistExportPayload(value: unknown): value is EdgeGistExportPayload {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as EdgeGistExportPayload).format === 'edgegist.export.v1' &&
      Array.isArray((value as EdgeGistExportPayload).gists),
  )
}

function relativeTime(value: string, t: Translator) {
  const timestamp = new Date(value).getTime()
  const diff = Date.now() - timestamp
  if (!Number.isFinite(diff)) return value
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('daysAgo', { count: days })
  return new Date(value).toLocaleDateString()
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

function versionPathUnion(
  version: GistDetail | null,
  parentVersion: GistDetail | null,
): string[] {
  return Array.from(
    new Set([
      ...Object.keys(parentVersion?.files ?? {}),
      ...Object.keys(version?.files ?? {}),
    ]),
  ).sort((left, right) => left.localeCompare(right))
}

function firstChangedPath(version: GistDetail, parentVersion: GistDetail | null): string | null {
  const changedFile = version.history[0]?.files.find((file) => file.status !== 'deleted')
  if (changedFile) return changedFile.filename

  return (
    versionPathUnion(version, parentVersion).find((path) => {
      const previous = parentVersion?.files[path]?.content ?? null
      const next = version.files[path]?.content ?? null
      return previous !== next
    }) ?? null
  )
}

function historyForFile(
  history: GistHistoryItem[],
  filename: string,
  limit: number,
): GistHistoryItem[] {
  const items: GistHistoryItem[] = []
  let activeFilename = filename

  for (const item of history) {
    const change = fileChangeForPath(item, activeFilename)
    if (!change) continue
    if (change.status === 'deleted') break

    items.push(normalizeHistoryItemForSelectedFile(item, change, filename))
    if (items.length >= limit) break
    if (change.previous_filename) activeFilename = change.previous_filename
  }

  return items
}

function normalizeHistoryItemForSelectedFile(
  item: GistHistoryItem,
  change: GistHistoryFileChange,
  selectedFilename: string,
): GistHistoryItem {
  if (change.filename === selectedFilename) return item

  return {
    ...item,
    files: [
      ...item.files.filter((file) => file.filename !== selectedFilename),
      {
        ...change,
        filename: selectedFilename,
      },
    ],
  }
}

function historyFilePathsForVersion(
  history: GistHistoryItem[],
  filename: string,
  versionSha: string,
): { newFilename: string; oldFilename: string } {
  let activeFilename = filename

  for (const item of history) {
    const change = fileChangeForPath(item, activeFilename)
    if (!change) continue

    if (item.version === versionSha) {
      return {
        newFilename: change.filename,
        oldFilename: change.previous_filename ?? change.filename,
      }
    }

    if (change.previous_filename) activeFilename = change.previous_filename
    if (change.status === 'deleted') break
  }

  return { newFilename: filename, oldFilename: filename }
}

function fileSetHistory(history: GistHistoryItem[], limit: number): GistHistoryItem[] {
  const items: GistHistoryItem[] = []
  let remaining = limit

  for (const item of history) {
    if (remaining <= 0) break
    const files = item.files.slice(0, remaining)
    if (files.length === 0) continue
    items.push({ ...item, files })
    remaining -= files.length
  }

  return items
}

function fileChangeForPath(item: GistHistoryItem, filename: string): GistHistoryFileChange | null {
  return item.files.find((file) => file.filename === filename) ?? null
}

function changeStatusLabel(status: GistHistoryFileChange['status'], t: Translator) {
  if (status === 'added') return t('added')
  if (status === 'deleted') return t('deleted')
  return t('modified')
}

function changeStatusGlyph(status: GistHistoryFileChange['status']) {
  if (status === 'added') return '+'
  if (status === 'deleted') return '-'
  return '~'
}

function clearStoredCredentials() {
  localStorage.removeItem(credentialsStorageKey)
  sessionStorage.removeItem(credentialsStorageKey)
  clearLegacyStoredToken()
}

function clearLegacyStoredToken() {
  localStorage.removeItem(legacyTokenStorageKey)
  sessionStorage.removeItem(legacyTokenStorageKey)
}

function getSystemColorMode(): ResolvedColorMode {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredColorMode(): ColorModePreference {
  const value = localStorage.getItem(colorModeStorageKey)
  return value === 'system' || value === 'light' || value === 'dark' ? value : 'system'
}

function readStoredThemePalette(): ThemePaletteId {
  const value = localStorage.getItem(themePaletteStorageKey)
  return themePalettes.some((palette) => palette.id === value) ? (value as ThemePaletteId) : 'slate'
}

function readStoredDiffLayoutPreference(): DiffLayoutPreference {
  const value = localStorage.getItem(diffLayoutStorageKey)
  return value === 'auto' || value === 'split' || value === 'unified' ? value : 'auto'
}

function readStoredDiffIndicatorStyle(): DiffIndicatorStyle {
  const value = localStorage.getItem(diffIndicatorStorageKey)
  return value === 'bars' || value === 'classic' || value === 'none' ? value : 'bars'
}

function readStoredDiffInlineMode(): DiffInlineMode {
  const value = localStorage.getItem(diffInlineModeStorageKey)
  return value === 'word-alt' || value === 'word' || value === 'char' || value === 'none' ? value : 'word-alt'
}

function readStoredDiffExpandUnmodifiedLines() {
  return localStorage.getItem(diffUnmodifiedLinesStorageKey) === 'true'
}

function readStoredDiffShowBackgrounds() {
  return localStorage.getItem(diffBackgroundsStorageKey) !== 'false'
}

function readStoredDiffWrapLines() {
  return localStorage.getItem(diffWrappingStorageKey) !== 'false'
}

function readStoredDiffShowLineNumbers() {
  return localStorage.getItem(diffLineNumbersStorageKey) !== 'false'
}

function readStoredCloudflareAutoRefresh() {
  return localStorage.getItem(cloudflareAutoRefreshStorageKey) !== 'false'
}

function readStoredSidebarCollapsed() {
  return localStorage.getItem(sidebarCollapsedStorageKey) === 'true'
}

function readStoredPanelCollapsed(storageKey: string): boolean | null {
  const value = localStorage.getItem(storageKey)
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function readStoredGistListPerPage() {
  const parsed = Number(localStorage.getItem(gistListPerPageStorageKey))
  return gistListPerPageOptions.some((option) => option === parsed) ? parsed : defaultGistListPerPage
}

function readPublicConfig(): PublicConfig {
  const siteKey = window.__EDGEGIST_PUBLIC_CONFIG__?.turnstileSiteKey
  return {
    turnstileSiteKey: typeof siteKey === 'string' && siteKey.trim() ? siteKey : null,
  }
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (turnstileScriptPromise) return turnstileScriptPromise

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(turnstileScriptId) as HTMLScriptElement | null
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Turnstile')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = turnstileScriptId
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Failed to load Turnstile')), { once: true })
    document.head.appendChild(script)
  })

  return turnstileScriptPromise
}

function createBasicAuthorization(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`
}
