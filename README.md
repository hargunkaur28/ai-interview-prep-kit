# Trao AI Interview Prep Kit

A full-stack, autonomous interview preparation system that converts a job description, company URL, and preparation timeframe into a tailored, structured interview preparation kit with verified requirement coverage and an editable study workspace.

Built for the **Trao Software Engineer Take-Home Assessment (FS-AI-INTERVIEW-01)** following the **Karpathy Guidelines** (*Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution*).

---

## 1. Project Overview & Tech Stack

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
  - **Design Philosophy**: Developer-tool aesthetic (Linear, Vercel, Raycast). Restrained palette, dark neutral background, crisp borders, Geist/Inter typography, responsive layouts.
- **Backend**: Node.js + Express + TypeScript
  - Modular pipeline, strict Appendix A validation, and native SSE streaming.
- **Database**: MongoDB (Local `mongodb://localhost:27017` / MongoDB Atlas) with Mongoose.
- **AI / LLM Provider**: **Groq** (`llama-3.3-70b-versatile`)
  - Configurable via `GROQ_MODEL` and `GROQ_API_KEY`.
  - Automatic exponential backoff and jitter on HTTP 429 rate limits.
  - Budgeted prompts minimizing token consumption; deterministic logic uses 0 LLM calls.
- **Web Crawling**: Native `fetch` + `cheerio`
  - SSRF protection (loopback/private IP blocking in production; localhost permitted in dev/evaluation).
  - Polite crawling respecting `robots.txt`, 8s timeouts, and link ranking.
- **Testing**: `vitest`

---

## 2. High-Level Architecture & Pipeline Sequencing

The system strictly avoids "one giant prompt" that generates everything at once. It executes in 10 deliberate stages:

```
[User Input: Job Description, Company URL, Days Available]
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 1. Extract Role & Requirements from JD (Groq LLM)     │
│    - Extracts title, seniority, responsibilities.       │
│    - Assigns stable IDs (r1, r2...) & must/nice tags.  │
│    - Strict: Thin JDs produce honest, thin outputs.    │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 2. Company Site Crawl & Link Ranking (Cheerio + Fetch) │
│    - Fetches homepage, checks robots.txt.              │
│    - Discovers and scores internal links.              │
│    - Crawls top candidate pages (careers, handbook).   │
│    - Unreachable/404 sites recorded as warnings.       │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 3. Public Interview Process Research                  │
│    - Searches public interview discussions.            │
│    - Falls back honestly if unavailable.               │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 4. Company Brief Synthesis (Groq LLM)                  │
│    - Generates summary and what_they_do.               │
│    - Cites verified sources. Never hallucinates.       │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 5. Categorized Question Generation (Groq LLM)         │
│    - Technical, Behavioural, System Design, Company Fit│
│    - Every question tags valid requirement IDs.        │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 6. Deterministic Coverage Check: Pass 1 (Code)         │
│    - Code compares question requirement_ids vs must    │
│    - Identifies uncovered must-have requirement gaps.  │
└────────────────────┬───────────────────────────────────┘
                     │
           [Are must-haves missing?]
              /                  \
            YES                   NO
            /                      \
┌──────────────────────┐            │
│ 7. Pass 2 Gap Gen    │            │
│    Targeted questions│            │
│    for missing reqs. │            │
│    Re-check coverage.│            │
└──────────┬───────────┘            │
           └──────────────┬─────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ 8. Flashcards Generation (Groq LLM)                    │
│    - Front/back concept cards tagged with req IDs.     │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 9. Deterministic Schedule Allocation (Code Arithmetic) │
│    - Exactly N days requested.                         │
│    - Harder (difficulty 3) and must-haves earlier.     │
│    - Integer minutes per day.                          │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ 10. Strict Appendix A Schema Validation (Code)         │
│     - Deterministic validator verifies all contracts.  │
│     - Persists to MongoDB / outputs to batch CLI.      │
└────────────────────────────────────────────────────────┘
```

---

## 3. Deterministic Logic (Kept in Code, Not LLM)

1. **Requirement & Question ID Generation**: Stable, sequential IDs (`r1`, `r2`... `q1`, `q2`... `f1`, `f2`...).
2. **Coverage Checking (`domain/coverage.ts`)**:
   - Evaluates the union of all `requirement_ids` referenced by questions.
   - Partitions uncovered requirements into `must` and `nice`.
   - Triggers Pass 2 gap-closure when must-haves remain uncovered.
3. **Schedule Allocation (`domain/study-planner.ts`)**:
   - Arithmetic distribution across exactly $N$ days (`1` to `60`).
   - Priority scoring ensures difficulty 3 and `must` requirements land on Day 1/early days, while culture/review lands on the final day.
   - All day durations are guaranteed integer minutes (no floats, no approximations).
   - Validates that every scheduled question ID exists in the kit.
4. **Structure Validation (`validator.ts`)**:
   - Strict schema verification conforming to Appendix A before persistence or batch output.

---

## 4. The Builder: State Representation & Edit Preservation

Trao's hardest state challenge is preserving user edits during section regeneration:
> *"Regenerating one section must not discard edits the user has made elsewhere, and a question the user wrote or edited by hand must survive a regeneration of its category."*

### How We Solved It:
Every item maintains state annotations in the database:
```typescript
interface InternalQuestion extends Question {
  origin?: 'generated' | 'user_added';
  is_edited?: boolean; // Set to true on any inline edit
  is_pinned?: boolean; // User toggle to protect from regeneration
}
```

### Server-Side Regeneration Logic (`server/src/routes/kits.ts`):
When the user clicks **Regenerate [Category]**:
1. All questions in other categories remain **completely untouched**.
2. For the target category, questions where:
   - `origin === 'user_added'` OR
   - `is_edited === true` OR
   - `is_pinned === true`
   are **strictly preserved**.
3. Only unmodified generated questions (`origin === 'generated' && !is_edited && !is_pinned`) are replaced with newly generated questions.
4. The schedule is automatically recalculated to maintain reference consistency.
5. In exports and `npm run evaluate`, all internal flags are stripped using `toAppendixAKit()`, guaranteeing 100% strict compliance with Appendix A.

---

## 5. Creative Feature: Weak Spots & Interview Readiness Diagnostic

Extending Practice Mode directly without bloated dependencies:
- **Interactive Flashcards**: Flip cards, reveal answers, and record confidence:
  - `1`: Needs Review (Weak Spot)
  - `2`: Medium
  - `3`: Confident
- **Diagnostic Engine**:
  - Maps flashcard confidence scores back to the role's requirements (`requirement_ids`).
  - Calculates requirement-level mastery: `Ready`, `Moderate`, `Weak Spot`, or `Not Practiced`.
  - Computes an overall Readiness Score (`0% - 100%`).
- **Session Optimization**: One-click **"Prioritize Weak Cards"** button to automatically sort upcoming sessions with low-confidence cards first.

---

## 6. Batch Evaluation Entry Point (Mandatory)

The repository provides the exact evaluation command:
```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

### Key Capabilities:
- **Zero Duplication**: Directly executes `runPipeline()` from the backend service.
- **Resilient**: Continues past individual failures, recording failure details in Appendix B format.
- **Localhost & SSRF**: Supports local mock addresses (e.g. `http://localhost:8099/acme/`) while protecting production environments.
- **Unreachable Sites**: Reports warnings and continues with available information.
- **Tested**: Verified locally with 5 representative test cases in `evaluation/cases.json`.

---

## 7. Setup & Running Locally

### Prerequisites
- Node.js >= 18 (tested on Node v24.9.0)
- MongoDB (running locally on port 27017 or MongoDB Atlas URI)

### Quick Start
1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd ai-interview-prep-kit
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your Groq API key:
   ```env
   GROQ_API_KEY=gsk_your_groq_api_key_here
   GROQ_MODEL=llama-3.3-70b-versatile
   MONGODB_URI=mongodb://localhost:27017/trao_interview_prep
   JWT_SECRET=your-secret-key
   ALLOW_LOCAL_URLS=true
   ```
   *(Note: If `GROQ_API_KEY` is omitted, the application runs with an intelligent rule-based fallback generator for offline evaluation and testing without crashing).*

4. **Run Tests**:
   ```bash
   npm test
   ```
   *Runs all Vitest unit tests verifying scheduler arithmetic, coverage detection, edit preservation, and Appendix A schema validation.*

5. **Run Batch Evaluation**:
   ```bash
   npm run evaluate -- --input evaluation/cases.json --output evaluation/kits.json
   ```

6. **Start Full Development Server**:
   ```bash
   npm run dev
   ```
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:5000](http://localhost:5000)

---

## 8. Automated Test Coverage

The test suite covers the critical invariants evaluated by Trao:
- `scheduler.test.ts`:
  - Exactly $N$ days returned for 1-day, 5-day, and 60-day inputs.
  - All durations are positive integer minutes.
  - Higher-difficulty / must-have requirements scheduled earlier.
  - All scheduled question IDs exist.
- `coverage.test.ts`:
  - Accurately detects uncovered must-have requirements.
  - Verifies Pass 2 gap-closing logic.
- `regeneration.test.ts`:
  - Proves that user-added, edited, and pinned questions survive category regeneration while unedited items are replaced.
- `validator.test.ts`:
  - Validates exact Appendix A schema conformance.
  - Rejects invalid categories, floats in minutes, and dangling references.

---

## 9. Known Limitations & Design Trade-offs
- **Public Discussion Search**: Uses lightweight public search without requiring paid third-party search APIs (SerpAPI, Google Custom Search). When public discussions are unavailable, it records an honest warning rather than hallucinating.
- **Groq Free-Tier Rate Limits**: Free-tier rate limits enforce strict token caps. The pipeline groups category questions into lean prompts and applies exponential backoff with jitter to guarantee completion within rate limits.
