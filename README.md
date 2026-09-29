# Kanban Board

![CI/CD](https://github.com/PjnSai/kanban-board/actions/workflows/ci-cd.yml/badge.svg)

A real-time collaborative Kanban board. Create boards, lists, and cards, drag them around, share a board with other users, and see their changes appear live.

**Live demo:** https://kanban-board-topaz-nine.vercel.app

> The backend runs on a free hosting tier that sleeps when idle, so the first request after a quiet period can take 30-60 seconds while it wakes up.

<!-- Add a screenshot or short GIF here -->

## Features

- Boards, lists, and cards with create, rename, and delete
- Drag-and-drop for cards (within and across lists), lists, and boards, with order persisted
- Real-time sync over WebSockets: card and list moves appear instantly for everyone on the board
- Board sharing: owners add and remove collaborators, collaborators can leave, and only owners can delete a board
- JWT authentication with refresh-token rotation and server-side logout (token blacklist)
- Account deletion

## Tech stack

| Layer          | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| Frontend       | React, TypeScript, Vite, Tailwind CSS, dnd-kit               |
| Backend        | Django, Django REST Framework, Django Channels (Daphne/ASGI) |
| Database       | PostgreSQL (Neon)                                            |
| Real-time      | Redis pub/sub (Upstash)                                      |
| Infrastructure | Docker, Render (API), Vercel (frontend)                      |
| CI/CD          | GitHub Actions, Dependabot                                   |

## Architecture

```text
Browser (React SPA on Vercel)
   |-- HTTPS + JWT --> Django REST API (Render) --> PostgreSQL (Neon)
   |-- WSS ----------> Django Channels (Render) <--> Redis pub/sub (Upstash)
```

Each browser tab tags its changes with a client ID, so it ignores the WebSocket echo of its own moves and only applies changes made by other users.

## Design decisions

- **Split hosting:** the static SPA is served from Vercel's CDN, while the long-lived WebSocket server runs on Render. Vercel's serverless model doesn't suit a persistent Channels/Daphne process.
- **Redis channel layer:** real-time updates work across multiple server instances, not just a single process.
- **Ownership on delete:** deleting an account also deletes the boards it owns. Ownership transfer isn't implemented.
- **Sharing:** collaborators are added directly by username, with no invite/accept step.

## Security

- Ownership is validated on every create and move, so users can't write into boards they don't belong to (covered by tests)
- Rate limiting on anonymous endpoints, including login and registration
- Secrets loaded from environment variables; in production `DEBUG` is off, cookies are HTTPS-only, and HSTS is enabled
- CSP and clickjacking protection on the Django side

## CI/CD

- Every push and pull request runs the Django system check, the pytest suite (against a throwaway Postgres container), ESLint, the Vitest suite, and a production build
- On `main`, deployment to Render and Vercel only happens after every check passes
- Branch protection blocks merging a PR until the checks pass
- Dependabot opens weekly update PRs for pip, npm, Docker, and GitHub Actions

## Testing

- Backend: pytest + pytest-django (auth, per-user data isolation, permission rules)
- Frontend: Vitest + React Testing Library

## Running locally

1. Create a free Postgres database (Neon) and Redis instance (Upstash).
2. Create a `.env` in the project root:

```
   SECRET_KEY=...
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1
   DATABASE_URL=...
   REDIS_URL=...
   CORS_ALLOWED_ORIGINS=http://localhost:5173
```

3. Run `docker-compose up --build`, then open http://localhost:5173.
