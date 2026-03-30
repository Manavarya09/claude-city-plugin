---
name: city
description: "Visualize your current project as a 3D city in the browser. Files become buildings, folders become districts, bugs become fires. Use when user says 'city', 'visualize', '3d', 'show my code', or '/city'."
allowed-tools: Bash
---

# Code City

Launch a 3D visualization of the current codebase.

## Commands

### `/city` (default)
Analyze the repo and launch the 3D city:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/analyze.js" . "${CLAUDE_SKILL_DIR}/../../app/city-data.json" && node "${CLAUDE_SKILL_DIR}/../../scripts/server.js"
```

Tell the user their city is live at http://localhost:3333

### `/city analyze`
Only generate data without launching:
```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/analyze.js" . "${CLAUDE_SKILL_DIR}/../../app/city-data.json"
```
