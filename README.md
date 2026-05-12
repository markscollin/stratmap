# StratMap

A collaborative org chart and people planning tool. Build, visualize, and manage your organization structure in real-time.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Features

- **Org Chart Canvas** — Drag nodes, create edges, zoom/pan, undo/redo
- **Chart Library** — Create charts from templates (Blank, Startup, Scale-up, Hiring plan)
- **JD Panel** — View role details and employment info
- **Theme Toggle** — Dark/light mode
- **Responsive Design** — Works on desktop (mobile support in progress)

## Project Structure

```
src/
├── components/       # UI components (Sidebar, TopNav, etc.)
├── features/         # Feature modules (canvas, nodes, panel)
├── pages/           # Page components (Dashboard, ChartView, CanvasView, etc.)
├── store/           # Zustand state management
├── styles/          # Global CSS (dark/light themes)
├── types/           # TypeScript definitions
└── data/            # Mock data
```

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** (build tool)
- **React Router v6** (navigation)
- **Zustand** (state management)
- **Tailwind CSS** (styling)
- **Lucide React** (icons)

## Development

```bash
npm run dev          # Start dev server
npx tsc --noEmit   # Type check
npm run build       # Production build
```

## Git & Deployment

- **GitHub:** https://github.com/markscollin/stratmap
- **SSH configured** — git operations work automatically
- **Vercel** — Connected for CI/CD from main branch

## Next Steps

See [CLAUDE.md](./CLAUDE.md) for detailed project context, file structure, and implementation notes for future development sessions.

## License

Internal project — Anthropic/StratMap team only.
