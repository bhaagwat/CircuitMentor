# CircuitMentor — Minimal System Design & Plan

**Principle:** AI guides, student builds. Ship a small thing that works end to end: **sign in → build circuit → get deterministic error checks → ask a Socratic AI mentor → come back tomorrow and your project is saved.**

Built on the existing repo (React 19 + Vite + TS / FastAPI + SQLAlchemy async). No stack changes.

---

## 1. Scope

| Keep (the product) | Cut (document as future work) |
|---|---|
| Google sign-in (native OAuth, PKCE) | Yjs / CRDT / offline-first |
| Project CRUD + autosave (`circuit_data` JSON) | MNA / ngspice simulation |
| ERC engine: union-find nets + 5 rules, unit-tested | avr8js / firmware compile |
| Mentor: one SSE endpoint, 3-level hint ladder | pgvector RAG, embeddings |
| Part notes injected into the prompt (small JSON) | Redis, extra monorepo packages |
| Postgres on Supabase (just a connection string) | Password login, CI beyond one job |

Stretch (only if time remains): "Simulate" = if ERC is clean and a battery→resistor→LED loop is closed, the LED glows. No solver.

---

## 2. Architecture

```
React (Vite)                                   FastAPI                    Postgres (Supabase)
┌────────────────────────┐  /v1/* (Vite proxy) ┌──────────────────────┐   ┌────────────────┐
│ Canvas · Inspector     │ ──────────────────► │ /auth/google/*       │   │ users          │
│ lib/erc  (pure TS)     │                     │ /projects  (CRUD)    │──►│ projects       │
│ MentorDock (fetch+SSE) │ ◄── SSE stream ──── │ /mentor/stream       │   └────────────────┘
└────────────────────────┘                     └──────────┬───────────┘
                                                          ▼
                                                 Anthropic API (Claude)
```

- **ERC runs client-side** (pure TS, instant, testable). Its findings are sent to the mentor as ground truth, so the LLM never has to "judge" the circuit itself.
- **Vite dev proxy** forwards `/v1` to the API, so cookies are same-origin: no CORS/credentials headaches.
- **The mentor has no write path.** It receives circuit JSON, returns text. Human-in-the-loop is structural, not a prompt promise.

---

## 3. Data model (2 changes, 1 migration)

```python
# apps/api/app/models.py
from sqlalchemy.dialects.postgresql import JSONB

class User(Base):
    ...
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String)
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)  # now optional

class Project(Base):
    ...
    circuit_data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
```

`circuit_data` shape (version it so you can change it later):

```json
{ "v": 1,
  "components": [{ "id": "c1", "partId": "led", "x": 240, "y": 120, "rot": 0, "params": {} }],
  "wires": [{ "id": "w1", "from": { "c": "c1", "pin": "anode" }, "to": { "c": "c2", "pin": "plus" } }] }
```

Run `alembic revision --autogenerate -m "google auth + circuit_data"` then `alembic upgrade head`; drop the `create_all` on startup.

**Supabase:** use it purely as hosted Postgres. `DATABASE_URL=postgresql+asyncpg://...` using the **direct or session-pooler connection (port 5432)**. If you use the transaction pooler (6543), asyncpg needs `connect_args={"statement_cache_size": 0}` or you get prepared-statement errors. Local dev can keep the docker-compose Postgres; drop Redis.

---

## 4. Native Google OAuth (Authorization Code + PKCE, FastAPI)

Google Cloud Console → OAuth client (Web). Authorized redirect URI: `http://localhost:5173/v1/auth/google/callback` (goes through the Vite proxy; add the prod URL later). Add `google-auth` and `httpx` to `requirements.txt`.

```python
# apps/api/app/auth/google.py
import base64, hashlib, secrets
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as grequests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db                      # use your existing session dependency
from app.models import User
from app.auth.security import create_access_token  # reuse your existing JWT helper

router = APIRouter(prefix="/v1/auth/google", tags=["auth"])
AUTH_URL, TOKEN_URL = "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token"
COOKIE = dict(httponly=True, samesite="lax", secure=settings.cookie_secure, path="/")

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

@router.get("/login")
async def login():
    state, verifier = _b64(secrets.token_bytes(32)), _b64(secrets.token_bytes(32))
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": _b64(hashlib.sha256(verifier.encode()).digest()),
        "code_challenge_method": "S256",
    }
    resp = RedirectResponse(f"{AUTH_URL}?{urlencode(params)}")
    resp.set_cookie("oauth_state", state, max_age=600, **COOKIE)
    resp.set_cookie("oauth_verifier", verifier, max_age=600, **COOKIE)
    return resp

@router.get("/callback")
async def callback(request: Request, code: str | None = None, state: str | None = None,
                   error: str | None = None, db: AsyncSession = Depends(get_db)):
    if error or not code:
        return RedirectResponse(f"{settings.web_url}/login?error=cancelled")
    if not state or state != request.cookies.get("oauth_state"):
        raise HTTPException(400, "Invalid OAuth state")

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "code_verifier": request.cookies.get("oauth_verifier", ""),
            "grant_type": "authorization_code",
            "redirect_uri": settings.google_redirect_uri,
        })
    if r.status_code != 200:
        raise HTTPException(401, "Google token exchange failed")

    # verifies signature, issuer, audience and expiry
    claims = await run_in_threadpool(
        id_token.verify_oauth2_token, r.json()["id_token"], grequests.Request(), settings.google_client_id)

    user = (await db.execute(select(User).where(User.google_sub == claims["sub"]))).scalar_one_or_none()
    if not user:
        user = User(google_sub=claims["sub"], email=claims["email"],
                    display_name=claims.get("name"), avatar_url=claims.get("picture"))
        db.add(user)
    else:
        user.avatar_url = claims.get("picture")
    await db.commit(); await db.refresh(user)

    resp = RedirectResponse(f"{settings.web_url}/dashboard")
    resp.set_cookie("cm_token", create_access_token(str(user.id)), max_age=7 * 86400, **COOKIE)
    resp.delete_cookie("oauth_state"); resp.delete_cookie("oauth_verifier")
    return resp

@router.post("/logout")
async def logout():
    resp = RedirectResponse(settings.web_url, status_code=303)
    resp.delete_cookie("cm_token", path="/")
    return resp
```

Wiring:
1. `get_current_user`: read the JWT from the `cm_token` cookie (fall back to `Authorization` header so existing routes still work).
2. Settings: `google_client_id`, `google_client_secret`, `google_redirect_uri`, `web_url`, `cookie_secure` (False on localhost, True in prod).
3. Frontend: `LoginPage` button becomes `window.location.href = "/v1/auth/google/login"`. Replace the `sessionStorage` fake with `GET /v1/auth/me` on app load (401 → show login). Delete the fake `cm_auth` logic.

**Why this is enough:** `state` stops CSRF on the callback, PKCE binds the code to your browser, the ID token is verified by Google's library, and the session token is an httpOnly cookie that JS can't read. Skipping refresh tokens/server-side sessions is fine at this scale (7-day JWT; logout clears the cookie).

---

## 5. ERC engine (`apps/web/src/lib/erc/`)

Pure functions, no React. Pins need a `role` in `parts.tsx`: `"vcc" | "gnd" | "anode" | "cathode" | "io" | "passive"`.

```ts
// nets.ts — union-find over pin keys "compId.pinId"
export function buildNets(components: PlacedComponent[], wires: Wire[]): Net[] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    const p = parent.get(k)!;
    if (p === k) return k;
    const root = find(p); parent.set(k, root); return root;
  };
  components.forEach(c => getPartMeta(c.partId).pins.forEach(p => find(`${c.id}.${p.id}`)));
  wires.forEach(w => parent.set(find(`${w.from.c}.${w.from.pin}`), find(`${w.to.c}.${w.to.pin}`)));

  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) { const r = find(k); groups.set(r, [...(groups.get(r) ?? []), k]); }
  return [...groups.values()].map(pins => ({ pins }));
}

// rules.ts
export type Finding = { id: string; severity: "error" | "warning" | "info"; componentIds: string[]; message: string };
export type Rule = (ctx: { components: PlacedComponent[]; nets: Net[] }) => Finding[];
export const evaluateErc = (components, wires) => {
  const ctx = { components, nets: buildNets(components, wires) };
  return RULES.flatMap(rule => rule(ctx));
};
```

| Rule ID | Severity | Fires when |
|---|---|---|
| `VCC_GND_SHORT` | error | one net contains both a `vcc` and a `gnd` pin |
| `LED_NO_RESISTOR` | warning | neither net on an LED's terminals contains a resistor pin |
| `LED_REVERSED` | error | LED anode net holds a `gnd` pin and cathode net holds a `vcc` pin |
| `NO_GROUND_PATH` | warning | a power source exists but its `gnd` pin is in a net with no other pin |
| `UNCONNECTED_PIN` | info | a required pin (flag in part meta) is alone in its net |

Delete the 30-line heuristic in `App.tsx`. Add **vitest** with one fixture circuit per rule (5–8 tests, 1 file). That single test file covers the "testing" rubric item cheaply.

---

## 6. AI Mentor

`POST /v1/mentor/stream` → `text/event-stream`. (`EventSource` is GET-only, so the frontend uses `fetch` + `ReadableStream`.)

```python
# apps/api/app/routers/mentor.py
import json, anthropic
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/mentor", tags=["mentor"])
client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

class MentorRequest(BaseModel):
    message: str = Field(max_length=2000)
    hint_level: int = Field(1, ge=1, le=3)
    circuit: dict                      # circuit_data
    findings: list[dict] = []          # ERC output (ground truth)

SYSTEM = """You are CircuitMentor, a Socratic electronics tutor for students.
Rules:
- The ERC findings are ground truth. Never contradict them or invent faults.
- You cannot edit the circuit. Never say you changed it; the student makes every change.
- Hint level 1: one guiding question, no answer. Level 2: name the principle involved.
  Level 3: say which part/connection to inspect, still without the exact fix.
- Under 120 words. Plain language. Reference parts by their labels."""

def build_prompt(b: MentorRequest) -> str:
    notes = part_notes_for(b.circuit)  # lookup in knowledge/parts.json by partId
    return (f"Hint level: {b.hint_level}\nERC findings: {json.dumps(b.findings)}\n"
            f"Circuit: {json.dumps(b.circuit)}\nPart notes: {notes}\n\nStudent: {b.message}")

@router.post("/stream")
async def stream(body: MentorRequest, user=Depends(get_current_user)):
    async def gen():
        try:
            async with client.messages.stream(
                model=settings.mentor_model, max_tokens=500, system=SYSTEM,
                messages=[{"role": "user", "content": build_prompt(body)}],
            ) as s:
                async for text in s.text_stream:
                    yield f"data: {json.dumps({'t': text})}\n\n"
            yield "data: [DONE]\n\n"
        except anthropic.APIError:
            yield 'event: error\ndata: {"message": "Mentor is unavailable, try again."}\n\n'
    return StreamingResponse(gen(), media_type="text/event-stream")
```

- `settings.mentor_model` defaults to a small, cheap model (e.g. `claude-haiku-5-5`); one env var to change.
- **Part notes instead of RAG:** `knowledge/parts.json` holds a few lines per part (pinout, typical values, common mistakes). `part_notes_for` includes only the parts on the canvas. In the report, call this "context retrieval by part ID", not vector RAG, so you don't overclaim.
- Frontend: `MentorDock` posts `{message, hint_level, circuit, findings}`, appends `t` chunks to the latest bubble, and a "Need more help" button bumps `hint_level` (max 3). On `error` event show an inline retry.

---

## 7. Plan (≈ 8–10 working days)

| Phase | Time | Tasks | Done when |
|---|---|---|---|
| **A. Unblock** | 0.5 d | Fix 12 TS errors (`type ButtonProps = ... & VariantProps<...>`, `Omit<..., 'onSelect'>`, align `params` types, delete unused imports/vars) | `pnpm build` passes |
| **B. Auth + persistence** | 3 d | Model changes + Alembic migration · Google OAuth (§4) · `lib/api.ts` (`fetch` wrapper, `credentials` default) · Dashboard loads real projects · autosave (debounced 1 s) + ⌘S writes `circuit_data` · parts still static (drop `/parts` wiring) | Sign in, build, refresh, circuit is still there |
| **C. ERC** | 2 d | `lib/erc` (§5) · replace heuristic · findings dock uses real output · vitest fixtures | Each rule has a passing test; hover/click behavior unchanged |
| **D. Mentor** | 2 d | `/mentor/stream` (§6) · `parts.json` notes · wire `MentorDock` · hint ladder button | Ask "why is my LED dim?" on a bad circuit → streamed, finding-aware answer |
| **E. Finish** | 1–2 d | Seed a demo project (LED w/o resistor) · README quick-start + env vars · screenshots · optional deploy (Vercel + Render/Fly + Supabase) | Fresh clone runs in < 5 min |

**Order matters:** C before D. The mentor is only impressive because it's grounded in real ERC findings.

**Demo script (use it for the evaluation):** log in with Google → new LED project → place battery + LED, wire them directly → ERC flags `LED_NO_RESISTOR` → ask the mentor, get a level-1 question → press "more help" → level 3 → add the resistor → findings clear → refresh the page, project persists.

---

## 8. Env vars

```
# api
DATABASE_URL=postgresql+asyncpg://...        # Supabase direct/session pooler
JWT_SECRET=...
GOOGLE_CLIENT_ID=...  GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5173/v1/auth/google/callback
WEB_URL=http://localhost:5173   COOKIE_SECURE=false
ANTHROPIC_API_KEY=...  MENTOR_MODEL=claude-haiku-5-5
```
```ts
// apps/web/vite.config.ts
server: { proxy: { "/v1": "http://localhost:8000" } }
```

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Part pin roles missing in `parts.tsx` | Add `role` to the ~10 parts used by the demo first, others later |
| Google consent screen in "Testing" mode only allows listed users | Add teammates + evaluator as test users, or publish the app (basic scopes need no review) |
| LLM leaks the exact fix at level 1 | Prompt rules + low `max_tokens`; spot-check 5 prompts before demo |
| API key exposure | Key lives only in the API env; never ship it to the web app |
