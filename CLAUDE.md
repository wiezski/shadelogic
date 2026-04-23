@AGENTS.md

# ZeroRemake — Session Setup

**Before writing any code or making changes, ALWAYS read these files first:**
1. `SESSION-HANDOFF.md` — current build status, what's done, what's next, key gotchas
2. `MASTER-SPEC.md` — full product spec and vision
3. `MVP-BUILD-PLAN.md` — phased build roadmap
4. **`DESIGN.md` — the canonical UI design system. Read it before any UI/component change. Do not deviate.**

These files are the source of truth for this project. If the user says "continue" or "pick up where we left off," read all four before doing anything.

**UI changes must match `DESIGN.md`.** Use the color tokens, typography scale, and component patterns documented there (canvas rows, pill inputs, segmented controls, iOS back chevron, soft tinted active states). Do NOT reintroduce bordered cards, emoji icons, radio buttons, solid saturated status colors, or abbreviations in labels. If a design need isn't covered by `DESIGN.md`, ask the user rather than inventing a new style.

**At the end of every session**, ask the user if they want to update SESSION-HANDOFF.md with what was accomplished.
