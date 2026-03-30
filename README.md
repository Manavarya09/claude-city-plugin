# Claude City Plugin

**Claude Code plugin that visualizes your current project as a 3D city.**

Run `/city` in Claude Code → your codebase appears as a navigable 3D city in your browser.

## Install

```bash
git clone https://github.com/Manavarya09/claude-city-plugin.git ~/.claude/plugins/code-city-plugin
```

## Usage

In any project with Claude Code:

```
/city          # Analyze + launch 3D city
/city analyze  # Just generate data
```

## How It Works

1. Scans your local git repo (file tree, git log, dependencies)
2. Generates `city-data.json` with metrics per file
3. Opens a Three.js 3D city in your browser at `localhost:3333`

## What You See

- **Buildings** = Files (height = LOC, color = language)
- **Districts** = Folders
- **Fires** = Files with bug-fix commits
- **Characters** = Contributors walking around
- **Roads** = Import dependencies

## Also See

- **[Code City](https://github.com/Manavarya09/code-city)** — Web app version (paste any GitHub repo)
- **[Cost Guardian](https://github.com/Manavarya09/cost-guardian)** — Cost tracking for Claude Code
- **[Team Brain](https://github.com/Manavarya09/team-brain)** — Shared AI memory for teams

## License

MIT
