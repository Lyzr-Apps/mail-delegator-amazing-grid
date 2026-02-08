'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Mail, Send, Check, AlertCircle, ChevronDown, ChevronUp, ChevronRight, RefreshCw, Settings, Search, Menu, X, Play, Activity, Info, Inbox, Users, Zap, ExternalLink } from 'lucide-react'

// ---------------------------------------------------------------------------
// TypeScript Interfaces (from real test data)
// ---------------------------------------------------------------------------
interface DelegationStats {
  total_emails_scanned: number
  matching_emails_found: number
  tasks_extracted: number
  notifications_sent: number
  notifications_failed: number
}

interface DelegationItem {
  task_title: string
  assignee: string
  priority: string
  notification_status: string
  channel: string
  timestamp: string
}

interface DelegationResult {
  summary?: string
  data?: DelegationStats
  items?: DelegationItem[]
  text?: string
}

interface HistoryEntry {
  timestamp: string
  summary: string
  stats: DelegationStats | null
  items: DelegationItem[]
}

type ProcessingStep = 'idle' | 'scanning' | 'extracting' | 'notifying' | 'complete'

// ---------------------------------------------------------------------------
// Agent metadata
// ---------------------------------------------------------------------------
const AGENTS = [
  { id: '69884944b662c978044a15b5', name: 'Task Delegation Manager', role: 'Orchestrator', provider: 'OpenAI / gpt-4.1' },
  { id: '698849080410624ae2d63834', name: 'Email Scanner Agent', role: 'Sub-agent', provider: 'OpenAI / gpt-4.1' },
  { id: '6988491f4468b1346d15907c', name: 'Slack Notifier Agent', role: 'Sub-agent', provider: 'Anthropic / claude-sonnet-4-5' },
]

const MANAGER_AGENT_ID = '69884944b662c978044a15b5'

// ---------------------------------------------------------------------------
// Sample data for the toggle
// ---------------------------------------------------------------------------
const SAMPLE_STATS: DelegationStats = {
  total_emails_scanned: 50,
  matching_emails_found: 7,
  tasks_extracted: 9,
  notifications_sent: 8,
  notifications_failed: 1,
}

const SAMPLE_ITEMS: DelegationItem[] = [
  { task_title: 'Prepare Q2 Financial Summary', assignee: 'jane.smith', priority: 'High', notification_status: 'sent', channel: '#finance-team', timestamp: '2024-06-13T09:22:10Z' },
  { task_title: 'Update Product Roadmap', assignee: 'tom.lee', priority: 'Medium', notification_status: 'sent', channel: '#product', timestamp: '2024-06-13T09:23:05Z' },
  { task_title: 'Organize Marketing Meeting', assignee: 'emma.thompson', priority: 'High', notification_status: 'sent', channel: '#marketing', timestamp: '2024-06-13T09:24:18Z' },
  { task_title: 'Refresh Website Banner', assignee: 'sara.kim', priority: 'Low', notification_status: 'sent', channel: '#web-team', timestamp: '2024-06-13T09:25:02Z' },
  { task_title: 'Review Partner Contracts', assignee: 'linda.zhao', priority: 'Medium', notification_status: 'failed', channel: '#legal', timestamp: '2024-06-13T09:28:35Z' },
]

const SAMPLE_SUMMARY = 'Delegation workflow completed. 50 emails were scanned. 7 matching delegation emails found. A total of 9 tasks were extracted and processed. 8 notifications were successfully sent via Slack, and 1 notification failed to send.'

// ---------------------------------------------------------------------------
// Helper: priority badge styling
// ---------------------------------------------------------------------------
function priorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'high':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'medium':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'low':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function statusColor(status: string): string {
  return status === 'sent'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-red-100 text-red-700 border-red-200'
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts ?? ''
  }
}

function formatDateTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts ?? ''
  }
}

// ---------------------------------------------------------------------------
// Processing step metadata
// ---------------------------------------------------------------------------
const STEP_LABELS: Record<ProcessingStep, string> = {
  idle: '',
  scanning: 'Scanning Gmail inbox...',
  extracting: 'Extracting task details...',
  notifying: 'Sending Slack notifications...',
  complete: 'Complete!',
}

const STEP_ORDER: ProcessingStep[] = ['scanning', 'extracting', 'notifying', 'complete']

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function Home() {
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showSample, setShowSample] = useState(false)

  // Processing state
  const [processing, setProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('idle')
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Data state
  const [stats, setStats] = useState<DelegationStats | null>(null)
  const [delegations, setDelegations] = useState<DelegationItem[]>([])
  const [summary, setSummary] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [keywords] = useState<string[]>(['urgent', 'team', 'delegate'])

  // Refs for step progression
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      stepTimers.current.forEach(clearTimeout)
    }
  }, [])

  // Derive display data based on sample toggle
  const displayStats = showSample && !stats ? SAMPLE_STATS : stats
  const displayDelegations = showSample && delegations.length === 0 ? SAMPLE_ITEMS : delegations
  const displaySummary = showSample && !summary ? SAMPLE_SUMMARY : summary

  // Computed stats
  const successRate = displayStats && displayStats.tasks_extracted > 0
    ? Math.round((displayStats.notifications_sent / displayStats.tasks_extracted) * 100)
    : 0

  // ---------------------------------------------------------------------------
  // Process emails handler
  // ---------------------------------------------------------------------------
  const handleProcessEmails = useCallback(async () => {
    setProcessing(true)
    setErrorMsg('')
    setProcessingStep('scanning')
    setActiveAgentId(MANAGER_AGENT_ID)
    setExpandedRow(null)

    // Simulated step progression while waiting for API
    const t1 = setTimeout(() => setProcessingStep('extracting'), 2000)
    const t2 = setTimeout(() => setProcessingStep('notifying'), 4000)
    stepTimers.current = [t1, t2]

    try {
      // Add timeout to prevent indefinite hanging (90 second limit)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 90000)

      const resultPromise = callAIAgent(
        'Process my emails and delegate tasks to my teammates. Look for emails with urgent, team, or delegate keywords and notify the assigned teammates on Slack.',
        MANAGER_AGENT_ID
      )

      const result = await resultPromise
      clearTimeout(timeoutId)

      // Clear step timers
      stepTimers.current.forEach(clearTimeout)
      stepTimers.current = []

      // Check for recursion errors from the Lyzr platform
      const rawResponse = result?.raw_response ?? ''
      const responseMessage = result?.response?.message ?? ''
      const isRecursionError =
        rawResponse.toLowerCase().includes('recursion') ||
        rawResponse.toLowerCase().includes('aborting') ||
        responseMessage.toLowerCase().includes('recursion') ||
        responseMessage.toLowerCase().includes('aborting')

      if (isRecursionError) {
        setErrorMsg(
          'The manager agent encountered a recursion loop on the server. This typically happens when the Gmail or Slack integrations are not yet authorized via Composio OAuth. Please ensure both Gmail and Slack connections are configured, then try again.'
        )
      } else if (result?.success && result?.response?.status === 'success') {
        const agentResult = result?.response?.result as DelegationResult | string | undefined

        if (typeof agentResult === 'object' && agentResult !== null) {
          if (agentResult?.data) {
            setStats(agentResult.data)
          }
          const items = Array.isArray(agentResult?.items) ? agentResult.items : []
          setDelegations(items)
          const summaryText = agentResult?.summary ?? agentResult?.text ?? result?.response?.message ?? ''
          setSummary(summaryText)

          // Add to history
          setHistory(prev => [
            {
              timestamp: new Date().toISOString(),
              summary: summaryText,
              stats: agentResult?.data ?? null,
              items,
            },
            ...prev,
          ])
        } else if (typeof agentResult === 'string') {
          // Check if the string response itself mentions recursion
          if (agentResult.toLowerCase().includes('recursion') || agentResult.toLowerCase().includes('aborting')) {
            setErrorMsg(
              'The manager agent encountered a recursion loop. This usually means the Gmail/Slack integrations need OAuth authorization via Composio. Please configure the connections and try again.'
            )
          } else {
            setSummary(agentResult)
            setHistory(prev => [
              { timestamp: new Date().toISOString(), summary: agentResult, stats: null, items: [] },
              ...prev,
            ])
          }
        } else {
          const msg = result?.response?.message ?? 'Processing complete.'
          setSummary(msg)
        }
      } else {
        const errText = result?.response?.message ?? result?.error ?? 'An error occurred while processing emails.'
        // Provide a better message if it's a recursion issue
        if (errText.toLowerCase().includes('recursion') || errText.toLowerCase().includes('aborting')) {
          setErrorMsg(
            'The manager agent encountered a recursion loop on the server. This typically happens when the Gmail or Slack integrations are not yet authorized via Composio OAuth. Please ensure both Gmail and Slack connections are configured, then try again.'
          )
        } else {
          setErrorMsg(errText)
        }
      }
    } catch (err) {
      stepTimers.current.forEach(clearTimeout)
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('Request timed out after 90 seconds. The agent may be stuck. Please try again.')
      } else {
        setErrorMsg('Network error. Please try again.')
      }
    }

    setProcessingStep('complete')
    setActiveAgentId(null)
    setProcessing(false)

    // Reset step after showing "Complete" for a moment
    const t3 = setTimeout(() => setProcessingStep('idle'), 3000)
    stepTimers.current = [t3]
  }, [])

  // ---------------------------------------------------------------------------
  // Retry failed notification
  // ---------------------------------------------------------------------------
  const handleRetry = useCallback(async (item: DelegationItem, idx: number) => {
    setActiveAgentId(MANAGER_AGENT_ID)
    try {
      const result = await callAIAgent(
        `Retry sending Slack notification for the task "${item.task_title}" assigned to ${item.assignee} in channel ${item.channel}.`,
        MANAGER_AGENT_ID
      )
      if (result?.success) {
        setDelegations(prev => {
          const updated = [...prev]
          if (updated[idx]) {
            updated[idx] = { ...updated[idx], notification_status: 'sent' }
          }
          return updated
        })
      }
    } catch {
      // silently fail
    }
    setActiveAgentId(null)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen">
      {/* ============ SIDEBAR ============ */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} transition-all duration-300 flex-shrink-0 border-r border-sidebar-border bg-[hsl(var(--sidebar-background))]`}>
        <div className="flex flex-col h-full w-64">
          {/* Logo / title */}
          <div className="p-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Task Delegation</h1>
              <p className="text-xs text-muted-foreground">Hub</p>
            </div>
          </div>

          <Separator />

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary font-medium text-sm">
              <Activity className="w-4 h-4" />
              Dashboard
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted/60 text-sm transition-colors">
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </nav>

          <Separator />

          {/* Active keywords */}
          <div className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Active Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {keywords.map(kw => (
                <Badge key={kw} variant="secondary" className="text-xs font-normal">
                  {kw}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ============ MAIN AREA ============ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* -------- HEADER -------- */}
        <header className="h-16 border-b border-border bg-white/60 backdrop-blur-md flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(prev => !prev)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              {sidebarOpen ? <X className="w-5 h-5 text-muted-foreground" /> : <Menu className="w-5 h-5 text-muted-foreground" />}
            </button>
            <h2 className="text-lg font-semibold">Dashboard</h2>
          </div>

          <div className="flex items-center gap-5">
            {/* Sample Data toggle */}
            <div className="flex items-center gap-2">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
              <Switch id="sample-toggle" checked={showSample} onCheckedChange={setShowSample} />
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Connection indicators */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Gmail</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Slack</span>
            </div>
          </div>
        </header>

        {/* -------- CONTENT -------- */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ======== STATS CARDS ======== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Emails Scanned */}
              <Card className="glass-card shadow-md">
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emails Scanned</p>
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{displayStats?.total_emails_scanned ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">{displayStats?.matching_emails_found ?? 0} matching found</p>
                </CardContent>
              </Card>

              {/* Delegations */}
              <Card className="glass-card shadow-md">
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delegations</p>
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                      <Users className="w-4 h-4 text-violet-600" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{displayStats?.tasks_extracted ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Tasks extracted today</p>
                </CardContent>
              </Card>

              {/* Success Rate */}
              <Card className="glass-card shadow-md">
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Success Rate</p>
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Check className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{displayStats ? `${successRate}%` : '0%'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{displayStats?.notifications_sent ?? 0} sent successfully</p>
                </CardContent>
              </Card>

              {/* Failed */}
              <Card className="glass-card shadow-md">
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Failed</p>
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold">{displayStats?.notifications_failed ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Notifications failed</p>
                </CardContent>
              </Card>
            </div>

            {/* ======== ACTION SECTION ======== */}
            <Card className="glass-card shadow-md">
              <CardContent className="py-6 px-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold">Process Emails</h3>
                    <p className="text-sm text-muted-foreground">Scan your Gmail inbox for delegation-relevant emails, extract tasks, and notify teammates via Slack.</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {keywords.map(kw => (
                        <Badge key={kw} variant="outline" className="text-xs font-normal">
                          <Search className="w-3 h-3 mr-1" />
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="min-w-[180px] gap-2 text-sm font-medium shadow-sm"
                    onClick={handleProcessEmails}
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Process Emails
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ======== PROCESSING PROGRESS ======== */}
            {(processingStep !== 'idle' || processing) && (
              <Card className="glass-card shadow-md overflow-hidden">
                <CardContent className="py-5 px-6">
                  <div className="flex items-center gap-3 mb-4">
                    {processingStep === 'complete' ? (
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-600" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      </div>
                    )}
                    <p className="text-sm font-medium">{STEP_LABELS[processingStep] || 'Processing...'}</p>
                  </div>

                  {/* Step indicators */}
                  <div className="flex items-center gap-2">
                    {STEP_ORDER.map((step, i) => {
                      const currentIdx = STEP_ORDER.indexOf(processingStep)
                      const isDone = currentIdx >= i
                      const isCurrent = processingStep === step
                      return (
                        <div key={step} className="flex items-center gap-2 flex-1">
                          <div className={`flex items-center gap-2 flex-1 ${i < STEP_ORDER.length - 1 ? '' : ''}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 transition-colors ${isDone ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                              {isDone && !isCurrent ? <Check className="w-3 h-3" /> : i + 1}
                            </div>
                            <span className={`text-xs hidden sm:block whitespace-nowrap ${isDone ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                              {step === 'scanning' && 'Scanning Gmail'}
                              {step === 'extracting' && 'Extracting Tasks'}
                              {step === 'notifying' && 'Notifying Team'}
                              {step === 'complete' && 'Complete'}
                            </span>
                          </div>
                          {i < STEP_ORDER.length - 1 && (
                            <div className={`h-0.5 flex-1 rounded-full transition-colors ${currentIdx > i ? 'bg-primary' : 'bg-muted'}`} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: processingStep === 'scanning' ? '25%' : processingStep === 'extracting' ? '50%' : processingStep === 'notifying' ? '75%' : processingStep === 'complete' ? '100%' : '0%',
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ======== ERROR MESSAGE ======== */}
            {errorMsg && (
              <Card className="glass-card shadow-md border-red-200">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Processing Error</p>
                      <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ======== SUMMARY ======== */}
            {displaySummary && (
              <Card className="glass-card shadow-md">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium mb-1">Workflow Summary</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{displaySummary}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ======== RECENT DELEGATIONS ======== */}
            <Card className="glass-card shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Recent Delegations</CardTitle>
                    <CardDescription className="text-xs mt-1">Tasks extracted from your emails and delegated to teammates</CardDescription>
                  </div>
                  {Array.isArray(displayDelegations) && displayDelegations.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {displayDelegations.length} tasks
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {!Array.isArray(displayDelegations) || displayDelegations.length === 0 ? (
                  <div className="text-center py-12">
                    <Inbox className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No delegations yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Click Process Emails to scan your inbox and delegate tasks.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Header row */}
                    <div className="hidden sm:grid grid-cols-12 gap-3 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <div className="col-span-4">Task</div>
                      <div className="col-span-2">Assignee</div>
                      <div className="col-span-1">Priority</div>
                      <div className="col-span-2">Channel</div>
                      <div className="col-span-1">Status</div>
                      <div className="col-span-1">Time</div>
                      <div className="col-span-1" />
                    </div>
                    <Separator />

                    <ScrollArea className="max-h-[400px]">
                      <div className="space-y-1">
                        {displayDelegations.map((item, idx) => (
                          <div key={`${item?.task_title}-${idx}`}>
                            <button
                              className="w-full text-left grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors items-center"
                              onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                            >
                              {/* Task title */}
                              <div className="sm:col-span-4 flex items-center gap-2">
                                <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${expandedRow === idx ? 'rotate-90' : ''}`} />
                                <span className="text-sm font-medium truncate">{item?.task_title ?? 'Untitled Task'}</span>
                              </div>
                              {/* Assignee */}
                              <div className="sm:col-span-2">
                                <span className="text-sm text-muted-foreground">@{item?.assignee ?? 'unknown'}</span>
                              </div>
                              {/* Priority */}
                              <div className="sm:col-span-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${priorityColor(item?.priority ?? '')}`}>
                                  {item?.priority ?? 'N/A'}
                                </span>
                              </div>
                              {/* Channel */}
                              <div className="sm:col-span-2">
                                <span className="text-sm text-muted-foreground">{item?.channel ?? ''}</span>
                              </div>
                              {/* Status */}
                              <div className="sm:col-span-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(item?.notification_status ?? '')}`}>
                                  {item?.notification_status === 'sent' ? 'Sent' : 'Failed'}
                                </span>
                              </div>
                              {/* Time */}
                              <div className="sm:col-span-1">
                                <span className="text-xs text-muted-foreground">{formatTime(item?.timestamp ?? '')}</span>
                              </div>
                              {/* Expand icon */}
                              <div className="sm:col-span-1 hidden sm:flex justify-end">
                                {expandedRow === idx ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              </div>
                            </button>

                            {/* Expanded detail */}
                            {expandedRow === idx && (
                              <div className="mx-3 mb-2 p-4 rounded-lg bg-muted/40 border border-border/50 space-y-3">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Task Title</p>
                                    <p className="font-medium">{item?.task_title ?? ''}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Assignee</p>
                                    <p className="font-medium">@{item?.assignee ?? ''}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Channel</p>
                                    <p className="font-medium">{item?.channel ?? ''}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">Timestamp</p>
                                    <p className="font-medium">{formatDateTime(item?.timestamp ?? '')}</p>
                                  </div>
                                </div>
                                {item?.notification_status === 'failed' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRetry(item, idx)
                                    }}
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    Retry Notification
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ======== DELEGATION HISTORY ======== */}
            {Array.isArray(history) && history.length > 0 && (
              <Card className="glass-card shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Delegation History</CardTitle>
                  <CardDescription className="text-xs">Previous processing runs</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="max-h-[250px]">
                    <div className="space-y-3">
                      {history.map((entry, idx) => (
                        <div key={`history-${idx}`} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Activity className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs text-muted-foreground">{formatDateTime(entry?.timestamp ?? '')}</p>
                              {entry?.stats && (
                                <Badge variant="secondary" className="text-xs">
                                  {entry.stats.tasks_extracted ?? 0} tasks
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">{entry?.summary ?? ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* ======== AGENT INFO ======== */}
            <Card className="glass-card shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm">Agents Powering This App</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {AGENTS.map(agent => {
                    const isActive = activeAgentId === agent.id
                    return (
                      <div key={agent.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isActive ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-transparent'}`}>
                        <div className="relative flex-shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-primary animate-pulse' : 'bg-emerald-500'}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.role} - {agent.provider}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

          </div>
        </main>
      </div>
    </div>
  )
}
