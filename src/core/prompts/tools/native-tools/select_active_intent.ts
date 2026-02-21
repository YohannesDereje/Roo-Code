import type OpenAI from "openai"

const SELECT_ACTIVE_INTENT_DESCRIPTION =
	"This tool must be called before any code modification. It loads the specific architectural constraints and scope for the given Intent ID from the orchestration ledger."

const INTENT_ID_PARAMETER_DESCRIPTION = "Intent ID to load from the orchestration ledger (for example: INT-001)"

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description: SELECT_ACTIVE_INTENT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: INTENT_ID_PARAMETER_DESCRIPTION,
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
