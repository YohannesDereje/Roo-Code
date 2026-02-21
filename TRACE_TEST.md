# Trace Test Documentation

This document describes the trace functionality implemented by the pre-hook logic for INT-001.

## Overview

The pre-hook tracing system tracks tool usage and intent governance through the `preToolUseHook` function, which creates trace entries in `.orchestration/agent_trace.jsonl`.

## Trace Implementation Details

### Pre-Hook Location

The pre-tool use hook is implemented in:

- **Hook Function**: [`preToolUseHook`](src/hooks/preToolUse.ts:6)
- **Hook Adapter**: [`runPreToolUseHook`](src/core/assistant-message/preToolUseHookAdapter.ts:4)
- **Execution Point**: Called at line 705 in [`presentAssistantMessage.ts`](src/core/assistant-message/presentAssistantMessage.ts:705)

### Trace File Location

Traces are stored in: `.orchestration/agent_trace.jsonl`

### Trace Entry Format

Each trace entry contains:

```json
{
	"timestamp": "ISO 8601 timestamp",
	"intentId": "INT-001",
	"toolName": "tool_name",
	"hash": "SHA256 hash of tool content",
	"classification": "feature|bugfix|refactor"
}
```

## Testing Procedure

### 1. Verify Intent Handshake

```bash
# Ensure INT-001 is properly selected
curl -X POST http://localhost/api/intent -d '{"intent_id":"INT-001"}'
```

### 2. Execute Destructive Tools

The tracing currently applies to these destructive tools:

- `write_to_file`
- `apply_diff`
- `edit`
- `search_and_replace`
- `search_replace`
- `edit_file`
- `apply_patch`
- `execute_command`
- `run_slash_command`
- `generate_image`

### 3. Check Trace File

```bash
# View trace entries
cat .orchestration/agent_trace.jsonl | jq .
```

### 4. Verify Governance Errors

Attempt to use destructive tools without handshake should trigger:

```
GOVERNANCE_ERROR: Handshake not established. You must call select_active_intent("INT-001") before using any other tools.
```

## Test Scenarios

### Scenario 1: Successful Handshake

1. Call `select_active_intent("INT-001")`
2. Execute `write_to_file` tool
3. Verify trace entry created
4. Check file modification succeeded

### Scenario 2: Missing Handshake

1. Attempt to use `execute_command` without handshake
2. Verify governance error returned
3. Confirm no execution occurred
4. Verify no trace entry created

### Scenario 3: Intent Validation

1. Select invalid intent ID
2. Attempt tool execution
3. Verify appropriate error handling

## Expected Results

✅ **Trace File Creation**: `.orchestration/agent_trace.jsonl` should contain entries
✅ **Proper Governance**: Tools blocked without handshake
✅ **Error Handling**: String-based governance errors returned
✅ **Classification Tracking**: Intent classification captured

## Troubleshooting

### Missing Trace File

- Ensure `.orchestration` directory exists
- Check write permissions
- Verify VSCode workspace is properly configured

### Governance Errors

- Confirm intent selection was successful
- Check `activeIntentId` property on task object
- Verify handshake complete flag is set

### Trace Content Issues

- Verify SHA256 hash calculation
- Check timestamp formatting
- Confirm classification parsing from YAML ledger

## Integration Points

This tracing system integrates with:

- **Intent Selection**: [`SelectActiveIntentTool`](src/core/tools/SelectActiveIntentTool.ts:39)
- **Tool Execution Flow**: [`presentAssistantMessage`](src/core/assistant-message/presentAssistantMessage.ts:65)
- **Error Reporting**: Governance error handling
- **Telemetry**: Tool usage tracking

## Conclusion

The trace functionality successfully implements the governance requirements for INT-001, providing audit trails for destructive operations while enforcing the intent-driven architecture pattern.

Verified by FDE on 2026-02-21.
