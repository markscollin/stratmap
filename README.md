# StratMap

A collaborative org chart and people planning tool. Build, visualize, and manage your organization structure in real-time.

---

## 📖 Documentation Entry Point

**If you're a Claude AI session:**
1. Read **[CLAUDE.md](./CLAUDE.md)** first — this tells you what's been built, current status, how to manage the repo, and what's next
2. Then read **[DESIGN.md](./DESIGN.md)** for product spec and design system context
3. Reference this README for quick start commands

**If you're a human developer:**
1. Read this README (quick start + tech overview)
2. Read **[DESIGN.md](./DESIGN.md)** for the product specification and design system
3. Use **[CLAUDE.md](./CLAUDE.md)** as a reference for implementation notes

---

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


## License

Internal project — Anthropic/StratMap team only.
