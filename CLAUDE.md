# Next.js React Frontend

## Import Rules

**Icons:** `lucide-react` ONLY (never react-icons)
```tsx
import { Loader2, Send, X } from 'lucide-react'
```

**Components:** `@/components/ui/*` (shadcn only)
```tsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
```

**Agent Calls:** `@/lib/aiAgent` (client-side, calls server API)
```tsx
import { callAIAgent } from '@/lib/aiAgent'
```

---

## callAIAgent Response (GUARANTEED)

```tsx
const result = await callAIAgent(message, AGENT_ID)

// Structure is ALWAYS:
result.success          // boolean - API call succeeded?
result.response.status  // "success" | "error" - agent status
result.response.result  // { ...agent data } - YOUR FIELDS HERE
result.response.message // string | undefined - optional message
```

### Complete Usage Example
```tsx
'use client'
import { useState } from 'react'
import { callAIAgent } from '@/lib/aiAgent'

export default function MyPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    const result = await callAIAgent(userMessage, AGENT_ID)

    if (result.success && result.response.status === 'success') {
      setData(result.response.result)
    } else {
      setError(result.response.message || 'Request failed')
    }

    setLoading(false)
  }

  // ... rest of component
}
```

---

## API Routes (Server-Side)

All API keys are kept secure on the server. Client utilities call these routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agent` | POST | Call AI agent |
| `/api/upload` | POST | Upload files for AI analysis |
| `/api/rag` | GET/POST/DELETE | RAG knowledge base operations |

---

## UI Code Location

**CRITICAL:**
- ALL UI code goes in `app/page.tsx`
- Define components inline or import from `@/components/ui/`
- NEVER create files in `components/` (reserved for shadcn/ui)

```tsx
// app/page.tsx

// Define inline components
const ChatMessage = ({ message }: { message: string }) => (
  <div className="p-4 bg-muted rounded-lg">{message}</div>
)

// Main page component
export default function Home() {
  return (
    <div>
      <ChatMessage message="Hello" />
    </div>
  )
}
```

---

## File Upload with AI Analysis

```tsx
'use client'
import { uploadFiles, callAIAgent } from '@/lib/aiAgent'

const handleFileUpload = async (file: File) => {
  // 1. Upload file
  const uploadResult = await uploadFiles(file)

  if (uploadResult.success) {
    // 2. Call agent with asset IDs
    const result = await callAIAgent('Analyze this document', AGENT_ID, {
      assets: uploadResult.asset_ids
    })
  }
}
```

---

## RAG Knowledge Base

```tsx
'use client'
import {
  getDocuments,
  uploadAndTrainDocument,
  deleteDocuments,
  useRAGKnowledgeBase
} from '@/lib/ragKnowledgeBase'

// Using hook
const { documents, loading, fetchDocuments, uploadDocument, removeDocuments } = useRAGKnowledgeBase()

// Or direct functions
const docs = await getDocuments('rag-id')
await uploadAndTrainDocument('rag-id', file)
await deleteDocuments('rag-id', ['doc.pdf'])
```

---

## Environment Variables

**Server-side (in `.env.local`):**
```
LYZR_API_KEY=your-api-key
```

**Client-side access (if needed):**
```tsx
// Only NEXT_PUBLIC_ prefixed vars are exposed to client
const publicVar = process.env.NEXT_PUBLIC_SOME_VAR
```

---

## Fast Development

The project is configured for fast dev with Turbopack:
```bash
npm run dev  # Uses --turbo flag
```

---

## Available shadcn/ui Components (All Prebuilt)

All these components are prebuilt in `@/components/ui/` — import directly, no installation needed:

```
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb,
button, button-group, calendar, card, carousel, chart, checkbox, collapsible,
command, context-menu, dialog, drawer, dropdown-menu, empty, field, form,
hover-card, input, input-group, input-otp, item, kbd, label, menubar,
navigation-menu, pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner,
spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip
```

---

## IFRAME-BLOCKED APIs (CRITICAL!)

This app runs in an iframe. These browser APIs are BLOCKED and will throw errors:

### Clipboard - USE UTILITY!
```tsx
// BANNED - Will throw NotAllowedError:
navigator.clipboard.writeText(text)  // BLOCKED!

// CORRECT - Use safe utility:
import { copyToClipboard } from '@/lib/clipboard'

const handleCopy = async () => {
  const success = await copyToClipboard(text)
  if (success) setCopied(true)
}
```

### Other Blocked APIs
- `navigator.geolocation` - blocked
- `navigator.share()` - blocked
- `window.open()` - may be blocked

---

## Anti-Hallucination Checklist

Before writing UI code:
- [ ] Read workflow.json for agent_ids?
- [ ] Read response_schemas/*.json for field names?
- [ ] Interfaces match schema exactly?
- [ ] Using optional chaining (?.)?
- [ ] Loading/error states handled?
- [ ] Only lucide-react icons?
- [ ] Only shadcn/ui components?
- [ ] 'use client' directive for client components?
- [ ] No navigator.clipboard? (use @/lib/clipboard)
