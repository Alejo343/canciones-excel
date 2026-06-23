# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # levanta backend + frontend a la vez (concurrently)

# Por separado:
npm run dev      # frontend dev server (--host, network accessible)
npm run server   # backend Express en puerto 3005
npm run build    # production build
npm run lint     # ESLint
npm run preview  # preview production build
```

No tests.

### Backup / restore de BD para pruebas

```bash
# Guardar estado actual
PGPASSWORD=root pg_dump -U postgres -h localhost generos > backup.sql

# Restaurar
PGPASSWORD=root psql -U postgres -h localhost -c "DROP DATABASE generos;"
PGPASSWORD=root psql -U postgres -h localhost -c "CREATE DATABASE generos;"
PGPASSWORD=root psql -U postgres -h localhost generos < backup.sql
```

## Architecture

React 19 + Vite SPA. State = Zustand (`src/store/useStore.js`). Router = react-router-dom v7. All wizard steps share state through the store; navigating back doesn't clear data (must call `reset()` explicitly).

The wizard flow is `/step1` → `/step2` → `/step3` → `/step4`, all wrapped in `WizardLayout`. There are also `/admin` and `/admin/login` routes outside the wizard.

### 4-Step Workflow

**Step1** (`/step1`): Upload Luminate file + Colombia Radio file. Colombia Radio triggers column auto-detection (`detectColumns.js`) and user confirmation (`ColumnMapper`). On export, `generateExcel()` creates `Hot 100.xlsx` with two sheets:
- **Luminate sheet**: original columns + 7 new cols inserted at col index 16 (column Q) — Q=Radio Impact Col, R=Radio Weighted, S=Played Radio Col, T=Top Radio Col, U=Consumption, V=Tot w/ Radio, W=Radio %
- **Colombia Radio sheet**: normalized columns in COLOMBIA_ORDER

**Step2** (`/step2`): Re-upload the `Hot 100.xlsx` after opening in Excel (forces formula recalculation). Finds rows in the first 100 where `Radio Impact Col = 0` and runs fuzzy matching against Colombia Radio. User reviews matches one-by-one, selects the right row or enters values manually. Also has an override panel for correcting any top-100 row regardless of zero status. On finish: applies resolutions, sorts by `Tot w/ Radio` descending, downloads `Hot 100 Final.xlsx`.

**Step3** (`/step3`): Displays match report (totals, found vs not found).

**Step4** (`/step4`): Reads `finalBuffer` from store, extracts top 100 songs, calls backend Spotify search API (SSE stream), displays results with cover art. On `onDone`:
1. Guarda la semana en `songs` + `weekly_tops` vía `POST /api/weekly-ranking`
2. Exporta `Hot 100 Spotify Names.xlsx`
3. Permite descargar `Hot 100 Comparacion YYYY-MM-DD.xlsx` comparando con la semana anterior

### Backend (`/server`)

Express server on port **3005**. PostgreSQL via `pg` pool (database: `generos`). Configure via `server/.env`.

### Database Schema

**`songs`** — catálogo maestro de canciones
- `song_id` VARCHAR(40) PK — ID de Luminate (ej. `SG51BA54E803A44FE9A0885ACA6F0C3D76`)
- `title`, `artist`, `genre`
- `debut_chart_date` DATE — primera semana que apareció en el chart
- `peak_chart_date` DATE — semana en que alcanzó su mejor posición
- `spotify_title`, `spotify_artist`, `spotify_url`, `cover_url` — datos de Spotify (caché)

**`weekly_tops`** — ranking semanal histórico (~34 semanas, ~3400 registros)
- `week_start` DATE, `position` SMALLINT, `song_id` FK → songs
- `tot_with_radio`, `radio_impact`, `consumption`, `radio_pct` NUMERIC — puntajes de Luminate
- `isrc` VARCHAR — de Colombia Radio (si disponible)
- `spotify_id` VARCHAR — ID del track en Spotify
- UNIQUE en `(week_start, position)` y `(week_start, song_id)`

**`song_map`** — mapeo persistente Luminate ↔ Colombia Radio
- `(luminate_title, luminate_artist)` PK compuesto
- `isrc`, `codigo` — identificadores de Colombia Radio
- Se carga al inicio de Step2 para pre-llenar matches conocidos

### Identificadores estables

El archivo Luminate trae una columna `SONG_ID` que es el identificador primario de cada canción. Se usa como `song_id` en `songs` y `weekly_tops`. Colombia Radio trae una columna `Isrc`. Spotify provee un ID extraíble de la URL (`open.spotify.com/track/<spotify_id>`).

Al guardar una semana (`POST /api/weekly-ranking`), el wizard:
1. Upsert en `songs` con `song_id` de Luminate
2. Lookup de `isrc` en `song_map` si no viene directo
3. Upsert en `weekly_tops` con posición, puntajes e IDs
4. Actualiza `debut_chart_date` y `peak_chart_date` en `songs`

### API routes

- `GET/POST /api/song-map` — public read/write de mappings Luminate↔Colombia Radio
- `POST /api/spotify-search` — SSE stream; acepta `[{song_id, title, artist}]`, usa `songs` como caché por `song_id`
- `GET /api/spotify-names` — devuelve canciones con `spotify_url` (lee de `songs`)
- `POST /api/weekly-ranking` — guarda semana en `songs` + `weekly_tops`
- `GET /api/weekly-ranking/compare` — compara las 2 semanas más recientes de `weekly_tops`; usa `song_id` como identificador estable
- `/api/admin/*` — JWT-protected CRUD para panel admin (songs, weekly_tops, song_map, clear spotify cache)

Auth: `POST /api/auth/login` returns a JWT (8h). Password stored as bcrypt hash in env.

### Key Utilities

- **`generateExcel.js`** — builds the initial workbook. `insertAt = 16` is a hard constant; the 7 new columns land at Q–W. VLOOKUP formulas use fixed ranges `$C$2:$E$97118` and `$C$2:$E$69000` for the Colombia Radio sheet. **Changing `insertAt` or the VLOOKUP ranges breaks all downstream column offsets and indices.**
- **`resolveZeros.js`** — contains `findBestMatch` (Jaccard + containment fuzzy match), `extractZeroRows`, `applyResolutions`, `sortByTotWithRadio`, `applyTableStyle`. Also exports `readWorkbook` and `downloadResolved`.
- **`detectColumns.js`** — scores Colombia Radio columns against known candidates to map them to `CANCION`, `ARTISTA`, `IMPACTOS`, `SONADAS`, `TOP`.
- **`parseFile.js`** — CSV via PapaParse, XLSX via `xlsx`.
- **`api.js`** — `fetchSongMap`, `saveSongMap`, `startSpotifySearch` (SSE reader).

### Column Index Reference (Luminate sheet, 0-based)

Indices 9 (J), 13 (N), 15 (P) are used directly by `applyResolutions` and `sortByTotWithRadio` to read WEIGHTED_AUDIO, WEIGHTED_VIDEO, WEIGHTED_SONG_SALES. These are hardcoded offsets into the Luminate file's original columns — they break if Luminate changes its column order.

### Comparison Excel format

El archivo `Hot 100 Comparacion YYYY-MM-DD.xlsx` sigue el mismo formato que el archivo de referencia `3junio.xlsx`:
- Columnas: `THIS_WEEK`, `LAST_WEEK`, `SONG`, `Artists`, `Posicion` (peak), `Youtube`, `Spotify`, `Apple Music`, `Semana` (ISO week ej. "2026-W25"), `Cover`, `WeekNum` (semanas en chart), `Album Cover URL`, `Reentry`
- Hoja nombrada `Sheet1`
- `LAST_WEEK` vacío si es debut, `Reentry=1` si volvió después de ausencia
