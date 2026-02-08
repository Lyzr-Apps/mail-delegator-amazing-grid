import { NextRequest, NextResponse } from 'next/server'

const LYZR_RAG_BASE_URL = 'https://rag-prod.studio.lyzr.ai/v3'
const LYZR_API_KEY = process.env.LYZR_API_KEY || ''

const FILE_TYPE_MAP: Record<string, 'pdf' | 'docx' | 'txt'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
}

// GET - List documents in a knowledge base
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const ragId = searchParams.get('ragId')

    if (!ragId) {
      return NextResponse.json(
        {
          success: false,
          error: 'ragId is required',
        },
        { status: 400 }
      )
    }

    if (!LYZR_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'LYZR_API_KEY not configured on server',
        },
        { status: 500 }
      )
    }

    const response = await fetch(`${LYZR_RAG_BASE_URL}/rag/documents/${encodeURIComponent(ragId)}/`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
    })

    if (response.ok) {
      const data = await response.json()
      // Response is array of file paths like ["storage/voicestream-dev-guide.pdf"]
      const filePaths = Array.isArray(data) ? data : (data.documents || data.data || [])

      const documents = filePaths.map((filePath: string) => {
        const fileName = filePath.split('/').pop() || filePath
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        const fileType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'txt' ? 'txt' : 'unknown'

        return {
          fileName,
          fileType,
          status: 'active',
        }
      })

      return NextResponse.json({
        success: true,
        documents,
        ragId,
        timestamp: new Date().toISOString(),
      })
    } else {
      const errorText = await response.text()
      return NextResponse.json(
        {
          success: false,
          error: `Failed to get documents: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 }
    )
  }
}

// POST - Upload and train a document
export async function POST(request: NextRequest) {
  try {
    if (!LYZR_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'LYZR_API_KEY not configured on server',
        },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const ragId = formData.get('ragId') as string
    const file = formData.get('file') as File

    if (!ragId || !file) {
      return NextResponse.json(
        {
          success: false,
          error: 'ragId and file are required',
        },
        { status: 400 }
      )
    }

    const fileType = FILE_TYPE_MAP[file.type]
    if (!fileType) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: ${file.type}. Supported: PDF, DOCX, TXT`,
        },
        { status: 400 }
      )
    }

    // Direct upload and train in one step
    const trainFormData = new FormData()
    trainFormData.append('file', file, file.name)
    trainFormData.append('data_parser', 'llmsherpa')
    trainFormData.append('chunk_size', '1000')
    trainFormData.append('chunk_overlap', '100')
    trainFormData.append('extra_info', '{}')

    const trainResponse = await fetch(
      `${LYZR_RAG_BASE_URL}/train/${fileType}/?rag_id=${encodeURIComponent(ragId)}`,
      {
        method: 'POST',
        headers: {
          'x-api-key': LYZR_API_KEY,
          'accept': 'application/json',
        },
        body: trainFormData,
      }
    )

    if (!trainResponse.ok) {
      const errorText = await trainResponse.text()
      return NextResponse.json(
        {
          success: false,
          error: `Failed to train document: ${trainResponse.status}`,
          details: errorText,
        },
        { status: trainResponse.status }
      )
    }

    const trainData = await trainResponse.json()

    return NextResponse.json({
      success: true,
      message: 'Document uploaded and trained successfully',
      fileName: file.name,
      fileType,
      documentCount: trainData.document_count || trainData.chunks || 1,
      ragId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 }
    )
  }
}

// DELETE - Remove documents from knowledge base
export async function DELETE(request: NextRequest) {
  try {
    if (!LYZR_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'LYZR_API_KEY not configured on server',
        },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { ragId, documentNames } = body

    if (!ragId || !documentNames || !Array.isArray(documentNames)) {
      return NextResponse.json(
        {
          success: false,
          error: 'ragId and documentNames array are required',
        },
        { status: 400 }
      )
    }

    const response = await fetch(`${LYZR_RAG_BASE_URL}/rag/${encodeURIComponent(ragId)}/docs/`, {
      method: 'DELETE',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
      body: JSON.stringify(documentNames),
    })

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Documents deleted successfully',
        deletedCount: documentNames.length,
        ragId,
        timestamp: new Date().toISOString(),
      })
    } else {
      const errorText = await response.text()
      return NextResponse.json(
        {
          success: false,
          error: `Failed to delete documents: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 }
    )
  }
}
