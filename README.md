# AI Agent Platform

A full-stack AI knowledge base agent platform built with Next.js, TypeScript, and Tailwind CSS. Upload documents or paste text, then chat with an intelligent agent that answers questions about your content.

**Built by Andrew Arbo** — AI/Automation Engineer

## Features

- **Knowledge Base Management** — Create multiple knowledge bases from pasted text or documents
- **Intelligent Chat Interface** — Ask natural language questions and get relevant answers from your documents
- **Smart Search** — Keyword and semantic matching finds the most relevant content chunks
- **Chat History** — Full conversation history saved per knowledge base
- **Dark Theme UI** — Clean, professional dark interface
- **REST API** — Well-structured API endpoints ready for LLM provider integration
- **No API Keys Required** — Runs entirely locally as a self-contained demo

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Storage:** JSON file-based (no database required)
- **AI:** Local keyword matching (designed for easy swap to OpenAI/Anthropic)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-agent-platform.git
cd ai-agent-platform

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
src/
  app/
    page.tsx                    # Landing page
    app/
      page.tsx                  # Main chat interface with sidebar
      new/page.tsx              # Create new knowledge base
    api/
      knowledge/route.ts        # GET all, POST new knowledge base
      knowledge/[id]/route.ts   # GET single knowledge base
      chat/route.ts             # POST chat message, get AI response
  lib/
    store.ts                    # JSON storage + search/matching engine
  data/
    knowledge.json              # Knowledge base data store
```

## API Endpoints

| Method | Endpoint              | Description                    |
| ------ | --------------------- | ------------------------------ |
| GET    | `/api/knowledge`      | List all knowledge bases       |
| POST   | `/api/knowledge`      | Create a new knowledge base    |
| GET    | `/api/knowledge/[id]` | Get a single knowledge base    |
| POST   | `/api/chat`           | Send a message, get a response |

## How the AI Search Works

The platform uses a smart keyword matching approach:

1. **Chunking** — Knowledge base content is split into paragraphs
2. **Keyword Extraction** — User queries are tokenized with stop word removal
3. **Scoring** — Each chunk is scored by keyword overlap (exact matches weighted higher)
4. **Ranking** — Top matching chunks are returned as the agent's response

This architecture is designed for easy replacement with a real LLM provider (OpenAI, Anthropic, etc.) by updating the `/api/chat` route handler.

## Future Enhancements

- [ ] OpenAI / Anthropic API integration for true AI responses
- [ ] File upload support (PDF, DOCX, TXT)
- [ ] Vector embeddings for semantic search
- [ ] User authentication
- [ ] Multi-user knowledge base sharing
- [ ] Streaming responses

## License

MIT
