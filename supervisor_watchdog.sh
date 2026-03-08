#!/bin/bash

# Gemini Supervisor Watchdog Script
# This script continuously monitors runtime/state.json.
# When state.json is updated, it triggers Gemini CLI in headless mode
# to evaluate the state and generate runtime/intervention.json.

PROJECT_DIR="/Users/aiden/Documents/Antigravity/ecommerce-ops/automation"
RUNTIME_DIR="${PROJECT_DIR}/runtime"
STATE_FILE="${RUNTIME_DIR}/state.json"
INTERVENTION_FILE="${RUNTIME_DIR}/intervention.json"
INTERVENTION_RAW_FILE="${RUNTIME_DIR}/intervention.raw.json"
PROMPT_FILE="${PROJECT_DIR}/docs/supervisor/gemini-supervisor-agent-template.md"

cd "$PROJECT_DIR" || exit 1

mkdir -p "$RUNTIME_DIR"

echo "👀 Gemini Supervisor Watchdog Started."
echo "Monitoring: $STATE_FILE"
echo "Outputting: $INTERVENTION_FILE"
echo "Raw output: $INTERVENTION_RAW_FILE"

# Extract the recommended prompt from the template to a temporary file
# The prompt is between the ```md and ``` blocks under "Recommended Supervisor Prompt"
awk '/^```md/{flag=1; next} /^```/{flag=0} flag' "$PROMPT_FILE" > /tmp/gemini_supervisor_prompt.txt

# Initial timestamp (or 0 if file doesn't exist)
LAST_MOD=0
if [ -f "$STATE_FILE" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        LAST_MOD=$(stat -f "%m" "$STATE_FILE")
    else
        LAST_MOD=$(stat -c "%Y" "$STATE_FILE")
    fi
fi

while true; do
    if [ -f "$STATE_FILE" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            CUR_MOD=$(stat -f "%m" "$STATE_FILE")
        else
            CUR_MOD=$(stat -c "%Y" "$STATE_FILE")
        fi

        if [ "$CUR_MOD" -gt "$LAST_MOD" ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] state.json changed. Evaluating..."
            
            # Read state and prompt Gemini CLI
            # Note: We use cat and pipe to provide state context, and pass the explicit prompt.
            # Using JSON mode is recommended but we rely on the prompt instructing it to output JSON.
            
            STATE_CONTENT=$(cat "$STATE_FILE")
            SUPERVISOR_PROMPT=$(cat /tmp/gemini_supervisor_prompt.txt)
            
            FULL_PROMPT="${SUPERVISOR_PROMPT}

Here is the current state.json:
\`\`\`json
${STATE_CONTENT}
\`\`\`
Evaluate the state based on your rules and output ONLY a valid intervention JSON object."

            # Execute Gemini headless (assuming 'gemini' is in PATH, or you can adjust path if needed)
            # You can test with a dry run or actual call
            gemini -p "$FULL_PROMPT" --output-format json > /tmp/gemini_raw_output.json 2>/tmp/gemini_supervisor_err.log
            
            if [ $? -eq 0 ]; then
                npx tsx src/normalize-supervisor-output.ts \
                  /tmp/gemini_raw_output.json \
                  "$STATE_FILE" \
                  "$INTERVENTION_FILE" \
                  "$INTERVENTION_RAW_FILE"
                if [ $? -eq 0 ]; then
                    echo "✅ intervention.json updated."
                else
                    echo "❌ Failed to normalize supervisor output."
                fi
            else
                echo "❌ Error running Gemini CLI. Check /tmp/gemini_supervisor_err.log"
                cat /tmp/gemini_supervisor_err.log
            fi

            LAST_MOD=$CUR_MOD
        fi
    fi
    sleep 2
done
