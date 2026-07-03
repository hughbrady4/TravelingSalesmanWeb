# AGENTS

## Scope
These instructions apply to the whole repository.

## Fast Start
- Install dependencies at repository root: npm install
- Install Cloud Functions dependencies: npm install --prefix functions
- Build frontend bundles into public: npm run build
- Lint Cloud Functions before deploy: npm run lint --prefix functions

## Deploy And Emulators
- Deploy hosting + functions from root: firebase deploy
- Deploy only functions: npm run deploy --prefix functions
- Run local Functions emulator: npm run serve --prefix functions

## Source Of Truth
- Frontend source pages: [src](src)
- Built frontend assets served by Firebase Hosting: [public](public)
- Frontend bundling entries/output: [webpack.config.js](webpack.config.js)
- Hosting + Functions deploy config: [firebase.json](firebase.json)
- Cloud Functions implementation: [functions/index.js](functions/index.js)
- Cloud Functions scripts/runtime: [functions/package.json](functions/package.json)
- Firestore security rules: [firestore.rules](firestore.rules)
- Firestore indexes: [firestore.indexes.json](firestore.indexes.json)
- Data Connect config: [dataconnect/dataconnect.yaml](dataconnect/dataconnect.yaml)
- Data Connect connector ops: [dataconnect/connector](dataconnect/connector)

## Project Conventions
- Keep browser page logic in [src](src), then rebuild so bundles in [public](public) stay in sync.
- Treat [public](public) JavaScript bundles as generated artifacts from webpack, not hand-edited source.
- Frontend analytics commonly use a safe wrapper pattern (try/catch around event logging), for example in [src/index.js](src/index.js).
- Cloud Functions use Firebase v2 APIs and ESM imports in [functions/index.js](functions/index.js).
- Cloud Functions deploy runs lint as a predeploy step (configured in [firebase.json](firebase.json)); warnings fail deploy because lint uses max-warnings=0 in [functions/package.json](functions/package.json).

## Guardrails For Agents
- Do not change generated bundle files unless explicitly asked; prefer editing source in [src](src).
- If a change affects hosting behavior, verify [firebase.json](firebase.json) implications.
- If a change affects backend auth/data access, verify and update [firestore.rules](firestore.rules) and [firestore.indexes.json](firestore.indexes.json) when needed.
- Keep Node.js 22 compatibility for Cloud Functions (see [functions/package.json](functions/package.json)).

## Known Gaps And Risks
- Root test script is a placeholder in [package.json](package.json); do not assume automated test coverage exists.
- Repository contains legacy/old variants (for example files with old in names under [src](src) and [public](public)); confirm target files before editing.
- Firebase web config values are present in client-side files by design; if security concerns arise, validate API key and domain restrictions in Firebase Console instead of removing config from client code.

## Suggested Workflow For Typical Changes
1. Locate source of truth file under [src](src) or [functions](functions).
2. Implement minimal change.
3. Build frontend when relevant: npm run build.
4. Lint functions when relevant: npm run lint --prefix functions.
5. Summarize impact and note any deployment follow-up.
