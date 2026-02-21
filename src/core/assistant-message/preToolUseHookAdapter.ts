import { preToolUseHook } from "../../hooks/preToolUse"
import { Task } from "../task/Task"

export async function runPreToolUseHook(cline: Task, block: any): Promise<{ blocked: boolean; error?: string }> {
	if (block.name !== "select_active_intent") {
		const intentId = cline.activeIntentId
		const payload =
			block && typeof block.nativeArgs === "object" && block.nativeArgs
				? block.nativeArgs
				: block && typeof block.params === "object" && block.params
					? block.params
					: {}
		const content = JSON.stringify(payload)
		return await preToolUseHook(intentId, block.name, content, cline.cwd)
	}
	return { blocked: false }
}
