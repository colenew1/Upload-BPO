## Upload Pipeline Overview

This doc explains how Excel files move through the new ingestion flow before landing in Supabase.

### 1. Environment + dependencies

1. Copy `.env.local.example` to `.env.local` and set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `UPLOAD_MAX_MB` (defaults to 10 MB)
   - `PREVIEW_TTL_SECONDS` (defaults to 900 seconds)
2. Install dependencies: `npm install`
3. Run locally: `npm run dev`

The Supabase client lives in `src/lib/supabase/server.ts`, backed by the service role key so we can upsert data from API routes.

### 2. Parsing + normalization

Code: `src/lib/excel/parseWorkbook.ts`

- Accepts a workbook buffer + file name + optional sheet hints.
- Looks for sheets named `*_Effectiveness` (behaviors) and `*_Goal` (metrics); falls back to best-effort matches.
- Converts Excel serial dates or string formats like `Jan-25` into `{ month: 'Jan', year: 2025 }`.
- Skips data unless it is at least 9 days past the month end (protects against incomplete months).
- Converts `Coaching Count`, `Actual`, `Goal`, and `PTG` columns into numbers after stripping `%` and commas.
- Splits metric rows into `monthlyMetrics` vs `activityMetrics` based on the `Program` column (`ACTIVITY METRICS` gets its own table).
- Normalizes organizations + metrics using `src/lib/excel/amplifaiMappings.ts` so downstream comparisons use canonical values (`UHC`, `NPS`, etc.).
- Returns dataset stats (total rows vs. filtered) and the `issues` array for anything we could not parse.

Unit tests for the tricky parsing logic live in `src/lib/excel/parseWorkbook.test.ts`.

### 3. Preview caching

Code: `src/lib/upload/previewCache.ts`

- Each preview request stores the full `ParseWorkbookResult` plus metadata (file hash, size, TTL).
- Cache is in-memory for now, but the abstraction is ready to swap for Redis later.
- Cache entries expire after `PREVIEW_TTL_SECONDS`. Once the commit endpoint succeeds we delete the preview to prevent double inserts.

### 4. API contract

#### `/api/upload/preview` (POST, multipart/form-data)

| Field           | Required | Notes                                      |
|-----------------|----------|--------------------------------------------|
| `file`          | ✅        | `.xlsx` file                               |
| `client`        | ❌        | Overrides client name inferred from file   |
| `behaviorSheet` | ❌        | Explicit sheet name for coaching data      |
| `metricSheet`   | ❌        | Explicit sheet name for metrics            |

Response (`200 OK`):

```jsonc
{
  "previewId": "cHZ9hH...",
  "checksum": "sha256...",
  "expiresAt": 1733263384000,
  "ttlSeconds": 897,
  "meta": { /* ParseWorkbookMeta */ },
  "issues": [],
  "file": { "name": "TTEC_Data.xlsx", "size": 394000, "sizeMb": 0.38 },
  "data": {
    "behaviors": [ /* rows without raw payload */ ],
    "monthlyMetrics": [...],
    "activityMetrics": [...]
  }
}
```

#### `/api/upload/commit` (POST, JSON)

```jsonc
{
  "previewId": "cHZ9hH...",
  "checksum": "sha256...",
  "include": {
    "behaviors": ["row-id-1", "row-id-2"],
    "monthlyMetrics": ["..."],
    "activityMetrics": []
  }
}
```

- If a dataset array is omitted or empty we default to “all rows selected”.
- The server validates the checksum against the cached preview to prevent stale commits.
- Inserts use Supabase `upsert` with the following conflict targets:
  - `behavioral_coaching`: `client,organization,program,behavior,sub_behavior,month,year`
  - `monthly_metrics`: `client,organization,program,metric_name,month,year`
  - `activity_metrics`: same as monthly

### 5. Admin UI (`/upload`)

Components:
- `SelectionSummary`: stats, warnings, download button, commit action.
- `PreviewTable`: data grid with include/exclude toggles per dataset.
- `previewStore` (Zustand): tracks preview payload, selection `Set`s, async state, and last commit summary.

Flow:
1. User uploads a workbook, optionally adds sheet/client hints.
2. We render parsed data + dataset stats immediately.
3. User deselects any rows they do not want inserted.
4. Commit button calls `/api/upload/commit` with the current selection; on success we clear the preview but keep a “last commit” summary for reference.

### 6. Extending mappings / rules

- Organization + metric mappings live in `src/lib/excel/amplifaiMappings.ts`. Add new canonical names there (each entry supports regex or literal substring matches).
- To change filtering rules (e.g., require 14 days instead of 9) update helpers in `parseWorkbook.ts`.
- If you later introduce Redis, wrap the current in-memory cache with the same `savePreview/getPreview/deletePreview` API so the rest of the app stays untouched.

