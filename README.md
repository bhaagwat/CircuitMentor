# CircuitMentor

> **Socratic AI-Mentored Circuit Simulation & Electrical Rules Engine**  
> Built for TIET 5th Sem Software Engineering.  
> *Philosophy: "AI guides. Student builds. Student learns."*

---

## ⚡ Overview

CircuitMentor is an interactive electronics learning web platform combining:
1. **Deterministic Electrical Rules Check (ERC)**: Pure TypeScript union-find netlist solver running client-side in microseconds (zero hallucinations, 100% deterministic).
2. **Socratic AI Mentor**: Streams pedagogical hints via OpenRouter / Anthropic using Server-Sent Events (SSE). The AI mentor has **no write path** to the circuit canvas—it guides students through a 3-tier hint ladder without giving away answers.
3. **Google OAuth & Cloud Persistence**: Native PKCE authorization code flow with session JWTs in `httpOnly` cookies, storing versioned circuit state in PostgreSQL.

---

## 🏗️ Architecture & Stack

- **Frontend (`apps/web`)**: React 19, TypeScript strict mode, Vite, Tailwind CSS + CSS Design Tokens (Apple HIG dark palette), Radix UI primitives, `cmdk` palette, Vitest.
- **Backend (`apps/api`)**: FastAPI, SQLAlchemy 2.0 (async), Pydantic v2, PostgreSQL (AsyncPG / Supabase), Alembic migrations.
- **AI Gateway**: OpenRouter OpenAI-compatible streaming SSE (supports Claude 3.5 Haiku, Gemini 2.0 Flash, GPT-4o-mini).

```
┌────────────────────────────────────────────────────────┐
│  Browser Client (http://localhost:5173)                │
│  React 19 · SVG Canvas · Union-Find ERC · Mentor Dock  │
└──────────────────────────┬─────────────────────────────┘
                           │ Vite Proxy (/v1 -> :8000)
┌──────────────────────────▼─────────────────────────────┐
│  FastAPI Backend (http://localhost:8000)               │
│  OAuth PKCE · Projects CRUD · Socratic Prompt Engine   │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
┌──────────────▼─────────────┐ ┌──────────▼──────────────┐
│  PostgreSQL (Local / Supa) │ │  OpenRouter SSE Stream  │
│  Users · JSONB Circuits    │ │  Claude 3.5 Haiku       │
└────────────────────────────┘ └─────────────────────────┘
```

---

## 🚀 5-Minute Quick Start

### Prerequisites
- **Node.js**: v20+ and **pnpm** v9+ (`npm i -g pnpm`)
- **Python**: 3.12+
- **Docker**: For local PostgreSQL (or use a free Supabase Postgres URL)

---

### Step 1: Clone & Install Dependencies

```bash
git clone https://github.com/your-username/CircuitMentor.git
cd CircuitMentor

# Install frontend dependencies
pnpm install

# Install backend dependencies
cd apps/api
pip install -r requirements.txt
cd ../..
```

---

### Step 2: Configure Environment Variables

Create `.env` in the root directory (or in `apps/api/.env`):

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Database
DATABASE_URL=postgresql+asyncpg://circuitmentor:circuitmentor@localhost:5432/circuitmentor

# Auth
JWT_SECRET=super-secret-random-key-at-least-32-chars-long
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080

# Google OAuth (see section below)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173/v1/auth/google/callback
WEB_URL=http://localhost:5173
COOKIE_SECURE=false

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# AI Mentor (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key-here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
MENTOR_MODEL=anthropic/claude-3.5-haiku
```

---

### Step 3: Start PostgreSQL & Run Migrations

#### Option A: Docker (Recommended)
```bash
docker compose up -d postgres
```

#### Option B: Supabase
Use your Supabase connection string in `DATABASE_URL` (direct port 5432 or transaction pooler port 6543).

Run the Alembic migration to create tables:
```bash
cd apps/api
alembic upgrade head
cd ../..
```

---

### Step 4: Start Development Servers

In Terminal 1 (Backend API):
```bash
cd apps/api
uvicorn app.main:app --reload --port 8000
```
*API docs available at: `http://localhost:8000/docs`*

In Terminal 2 (Web Client):
```bash
pnpm dev
```
*Open your browser at: `http://localhost:5173`*

---

## 🔑 Service Configuration Guides

### 1. OpenRouter Setup (AI Mentor)
1. Visit [OpenRouter](https://openrouter.ai/) and sign in.
2. Go to [OpenRouter Keys](https://openrouter.ai/keys) and generate an API key.
3. Paste it in `.env`:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-...
   MENTOR_MODEL=anthropic/claude-3.5-haiku
   ```
   *(You can also use `google/gemini-2.0-flash-001` or `meta-llama/llama-3.3-70b-instruct`).*

---

### 2. Google Cloud OAuth Setup
1. Open the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a project named **CircuitMentor**.
3. Configure the **OAuth consent screen**:
   - User Type: **External**
   - Scopes: `openid`, `email`, `profile`
   - Test users: add your own Google email.
4. Go to **Credentials** $\to$ **Create Credentials** $\to$ **OAuth Client ID**:
   - Application type: **Web application**
   - Name: **CircuitMentor Web**
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173/v1/auth/google/callback`
5. Copy the **Client ID** and **Client Secret** into your `.env`.

---

## 🧪 Testing & Verification

Run the test suite and verify strict TypeScript compilation:

```bash
# Run Electrical Rule Check (ERC) Vitest suite (10/10 passing)
pnpm test

# Verify TypeScript strict check & production bundle
pnpm build
```

---

## 🎬 3-Minute Evaluation Demo Script

Follow this script to demonstrate all core capabilities during evaluations or presentations:

1. **Sign In**:
   - Navigate to `http://localhost:5173/login`.
   - Click **"Continue with Google"** $\to$ complete OAuth PKCE flow $\to$ redirects to `/dashboard`.
2. **Open Seeded Demo Project**:
   - Open **"Demo: Direct LED (Overcurrent Hazard)"**.
   - Notice the initial circuit: A 9V battery wired directly to an LED without a series resistor.
3. **Inspect Deterministic ERC Diagnostics**:
   - Look at the right dock under the **ERC** tab.
   - Finding is flagged: **`LED_NO_RESISTOR`** (*"LED D1 has no series resistor..."*).
   - Click the finding: the canvas pans and highlights LED `D1`, switching directly to the **Mentor** tab.
4. **Interact with the Socratic AI Mentor**:
   - The mentor displays derived context chips: `3 parts`, `3 wires`, `1 finding`, `Selected: D1`.
   - Ask: *"Why is my LED smoking?"*
   - The mentor streams a Socratic response at **Hint Level 1** (asks an orienting question about what controls current between the 9V rail and ground, never giving the answer).
5. **Escalate Hint Level**:
   - Click the button: **"Need more help? (Hint level 2: Underlying principle)"**.
   - The mentor explains Ohm's Law ($V = IR$) and why an LED's internal dynamic resistance drops near zero once forward voltage is exceeded.
   - Click again for **Hint Level 3**: The mentor instructs the student to inspect the anode branch and place a current-limiting resistor.
6. **Fix the Circuit & Watch ERC Clear**:
   - Drag a **Resistor** (`R1`, 220 $\Omega$) from the component library onto the canvas.
   - Re-route the wire so that the resistor is in series with the LED.
   - Instantly, the ERC findings dock updates to: **"No issues found. Your circuit passes all checks."**
7. **Verify Persistence**:
   - Press `Ctrl+S` / `Cmd+S` (or wait 1 second for autosave).
   - Hard refresh the page (`Ctrl+Shift+R` / `Cmd+R`).
   - The restored circuit, wires, and state persist seamlessly from PostgreSQL.

---

## 📄 License
MIT License. Developed for Academic Coursework at Thapar Institute of Engineering and Technology (TIET).
