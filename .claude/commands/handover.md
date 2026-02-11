Generate a HANDOVER.md file in the project root that captures the full context
of this session for a fresh Claude instance that has never seen this conversation.

Write it as if you're briefing a colleague who's taking over mid-project.
They're smart but have zero context about what we've been doing.

## Required Sections (in this order)

### 1. Current State & Immediate Next Steps
- What is the project's current state RIGHT NOW?
- What was I actively working on when this handover was generated?
- What are the concrete next steps, in priority order?
- Are there any operations in progress (builds, long-running processes, etc.)?

### 2. Environment & Configuration
- Working directory and key file paths
- Any environment variables, PATH modifications, or tool versions that matter
- Hardware/GPU considerations if relevant
- Dependencies that were installed or configured during this session
- Any credentials, API keys, or connection details referenced (names only, not values)

### 3. Architecture & Design Decisions
- Key architectural choices made and WHY they were made
- Alternatives that were considered and rejected (and why)
- Design patterns or conventions being followed
- Any constraints or requirements driving decisions

### 4. Problems Solved & Gotchas
- Bugs encountered and how they were fixed
- Workarounds currently in place (and whether they're temporary)
- Error messages that were misleading and what the actual fix was
- Things that looked like they should work but didn't
- Known issues that haven't been addressed yet

### 5. File Map
- List the key files that were created or modified this session
- For each, a one-line description of what it does / what changed
- Note any files that are generated vs hand-written

## Formatting Rules
- Use concrete file paths, not vague references
- Include actual command lines that worked, not paraphrased versions
- Quote specific error messages when relevant
- Keep it dense — no filler, no pleasantries
- Aim for 150-300 lines depending on session complexity
- Use code blocks for any commands, paths, or config snippets

## Important
- Do NOT include information from before this session unless it's critical context
- Do NOT pad with generic project descriptions — focus on what THIS session accomplished
- If something is uncertain or half-finished, say so explicitly
