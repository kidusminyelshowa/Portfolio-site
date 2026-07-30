# Portfolio converted to Node + React

Quick start:

1. Install dependencies (root will install dev tool `concurrently`):

```bash
npm install
cd server && npm install
cd ../client && npm install
```

2. Run in development (runs server and client concurrently):

```bash
npm run dev
```

3. Build and start production:

```bash
npm run build
npm start
```

Server serves the built client from `client/dist` and exposes `GET /api/hello`.
