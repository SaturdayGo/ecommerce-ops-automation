#!/bin/bash
# Direct runner for a single evaluation.

cd /Users/aiden/Documents/Antigravity/ecommerce-ops/automation
if [ ! -f "runtime/state.json" ]; then
  echo "Error: runtime/state.json not found."
  exit 1
fi

PROMPT_FILE="docs/supervisor/gemini-supervisor-agent-template.md"
awk '/^```md/{flag=1; next} /^```/{flag=0} flag' "$PROMPT_FILE" > /tmp/gemini_supervisor_prompt.txt

STATE_CONTENT=$(cat runtime/state.json)
SUPERVISOR_PROMPT=$(cat /tmp/gemini_supervisor_prompt.txt)

FULL_PROMPT="${SUPERVISOR_PROMPT}

Here is the current state.json:
\`\`\`json
${STATE_CONTENT}
\`\`\`
Evaluate the state based on your rules and output ONLY a valid intervention JSON object. Do not include markdown formatting like \`\`\`json."

echo "Calling Gemini CLI headless..."
gemini -p "$FULL_PROMPT" --output-format json > /tmp/gemini_raw_output.json
npx tsx src/normalize-supervisor-output.ts \
  /tmp/gemini_raw_output.json \
  runtime/state.json \
  runtime/intervention.json \
  runtime/intervention.raw.json

echo "Done. See runtime/intervention.json"
