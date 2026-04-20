# CLAUDE.md

Guide Claude Code.

## Commands

```bash
npm run dev      # dev (network)
npm run build    # prod
npm run lint     # lint
npm run preview  # preview
```

No tests.

## Architecture

React 19 + Vite SPA. State = Zustand (useStore.js). Router = react-router-dom v7. Flow: /step1 → /step2 → /step3. Wrapper = WizardLayout.

### Workflow

Make Hot 100 (Colombia) from 2 files.

Step1: Upload Luminate + Colombia Radio. Radio file → detect cols → confirm. Generate Excel:

Sheet Luminate: +7 cols (Radio Impact Col, Radio Weighted, Played Radio Col, Top Radio Col, Consumption, Tot w/ Radio, Radio %) at col 16 (Q) with VLOOKUP → Colombia Radio
Sheet Colombia Radio: normalized cols
Output: Hot 100.xlsx

Step2: Open Excel → calc → save → re-upload. App find top 100 rows where Radio Impact Col = 0 → fuzzy match UI → user fix. Apply: formulas → numbers, sort by Tot w/ Radio desc, table style. Output: Hot 100 Final.xlsx

Step3: Show report (totals, found vs not found).

### utilitis

generateExcel.js → build workbook, insertAt = 16 (Q), VLOOKUP, colLetter(). resolveZeros.js → fuzzy match, find zeros, apply fixes, sort + style, I/O. detectColumns.js → map cols (CANCION, ARTISTA, IMPACTOS, SONADAS, TOP) via score + normalize. parseFile.js → CSV (PapaParse), XLSX (xlsx).

### Important

VLOOKUP use fixed ranges (97118 / 69000). insertAt = 16 → Q–W. Change offset = break formulas + indices.
