# Essential Pharma — Material Review & Approval Platform

A full-stack material review, annotation, and certification workflow built with **Next.js 14**, **Supabase**, and **Anthropic Claude**.

---

## Architecture

```
Browser (React)
    ↕ fetch()
Next.js API Routes      ← your server — Anthropic key stays here
    ↕ Supabase SDK
Supabase (Postgres + Storage)
```

All sensitive keys live **server-side only**. The browser never sees them.

---

## Option 2 — Vercel + Supabase (Cloud, ~30 minutes)

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and **anon key** (Settings → API)
3. Also copy the **service_role key** (keep this secret)

### Step 2 — Run the database schema

1. In Supabase Dashboard → **SQL Editor** → New query
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run**

### Step 3 — Create the Storage bucket

1. Supabase Dashboard → **Storage** → New bucket
2. Name: `materials`
3. Public: **OFF** (we use signed URLs)
4. Click **Create bucket**

### Step 4 — Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys
2. Create a new key — you only need it once

### Step 5 — Deploy to Vercel

```bash
# Option A: Vercel CLI
npm i -g vercel
vercel

# Option B: Push to GitHub, then import at vercel.com/new
```

When Vercel asks for environment variables, add these:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

### Step 6 — Done ✅

Visit your Vercel URL. Switch roles in the top bar and submit a material.

---

## Option 3 — Self-Hosted / Internal (Docker)

Use this when the app must live inside your corporate network.

### Prerequisites

- Docker & Docker Compose installed on your server
- A Supabase project (cloud is fine, or self-host Supabase — see below)
- An Anthropic API key

### Quick start

```bash
# 1. Clone / copy the project onto your server
git clone <your-repo> ep-platform
cd ep-platform

# 2. Create your env file
cp .env.example .env.local
# Edit .env.local with your real values

# 3. Set standalone output for Docker
echo "NEXT_OUTPUT=standalone" >> .env.local

# 4. Build and run
docker compose up -d --build

# App is now available at http://your-server:3000
```

### Reverse proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name materials.yourdomain.internal;

    ssl_certificate     /etc/ssl/certs/internal.crt;
    ssl_certificate_key /etc/ssl/private/internal.key;

    # Optional: HTTP Basic Auth for quick team protection
    # auth_basic "Essential Pharma Platform";
    # auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;

        # Increase timeout + body size for file uploads
        client_max_body_size 100M;
        proxy_read_timeout   300s;
    }
}
```

### Fully on-premise (no cloud services)

If you cannot use Supabase cloud or the Anthropic API over the internet, see the commented-out sections in `docker-compose.yml`:

- **Database**: swap Supabase for a local **PostgreSQL** container
- **File storage**: swap Supabase Storage for **MinIO** (S3-compatible, self-hosted)
- **AI cert generation**: swap Anthropic for a local **Ollama** instance (the prompt in `app/api/anthropic/route.js` is straightforward to adapt)

Contact your infrastructure team to update connection strings in `lib/supabase.js`.

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Fill in your Supabase + Anthropic keys

# 3. Run the dev server
npm run dev

# Open http://localhost:3000
```

---

## Project structure

```
essential-pharma-platform/
├── app/
│   ├── api/
│   │   ├── anthropic/route.js      ← AI cert generation proxy
│   │   ├── materials/
│   │   │   ├── route.js            ← GET list, POST create
│   │   │   └── [id]/
│   │   │       ├── route.js        ← GET detail, PATCH status/verdict
│   │   │       ├── versions/route.js   ← POST new version (resubmit)
│   │   │       └── annotations/route.js← POST add, PATCH resolve
│   │   └── upload/route.js         ← File upload to Supabase Storage
│   ├── globals.css
│   ├── layout.js
│   └── page.jsx                    ← Entry point
├── components/
│   └── Platform.jsx                ← Full UI (single component file)
├── lib/
│   └── supabase.js                 ← Server-side Supabase client
├── supabase/
│   └── schema.sql                  ← Copy-paste into Supabase SQL editor
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── next.config.js
└── package.json
```

---

## Roles (configurable in `components/Platform.jsx`)

| Role | Can do |
|---|---|
| **Business Owner** | Submit materials, resubmit revisions, initiate UK certification, view comments |
| **Reviewer / Compliance** | View documents (PDF inline, audio/video players, download for Word/PPTX/Excel), annotate, approve / revise & resubmit / not approve / cancel |
| **Medical Signatory** | UK certification review, certify or request resubmission, trigger printable certificate |

> **Note:** In production you'll want to replace the role switcher with real authentication. Supabase Auth integrates cleanly — see `Adding authentication` below.

---

## Workflow overview

```
Business Owner submits
        ↓
  Under Review ──── Reviewer annotates
        ↓
   [Verdict]
   ├── Approve → Approved
   │       └── (UK cert flagged?) → Owner initiates cert
   │               ↓
   │        Under Certification ── Medical Signatory annotates
   │               ↓
   │          [Cert verdict]
   │          ├── Certify → CERTIFIED → Certificate issued 📜
   │          └── Resubmit → back to Revise & Resubmit
   │                  ↓ (owner resubmits)
   │            Under Review (cert cycle) → Reviewer approves
   │                  → auto-back to Under Certification
   ├── Revise & Resubmit → owner amends → new version submitted
   ├── Not Approved → terminal
   └── Cancelled → terminal

Material ID stays the same across all versions.
```

---

## File upload limits

- Default: 50 MB per file (set in `next.config.js`)
- Nginx: set `client_max_body_size 100M;` if using a reverse proxy
- Supabase Storage free tier: 1 GB total — upgrade for more

---

## Adding authentication (optional but recommended for production)

Supabase Auth is the easiest path. Once added:

1. Users log in with email/password or SSO (SAML, Azure AD, Okta)
2. Their role (owner / reviewer / signatory) is stored in a `profiles` table
3. The role switcher in `Platform.jsx` is replaced by reading their real role
4. Row Level Security (RLS) in `schema.sql` is enabled and policies enforce access

Ask if you'd like help adding this layer.

---

## Environment variable reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-only, bypasses RLS) |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Claude API key (server-only) |
| `NEXT_OUTPUT` | Docker only | Set to `standalone` for Docker builds |

---

## Upgrading / updating

```bash
# Pull latest code, then:
npm install          # update dependencies
npm run build        # rebuild
# For Docker: docker compose up -d --build
```
