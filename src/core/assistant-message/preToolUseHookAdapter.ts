import { preToolUseHook } from "../../hooks/preToolUse"
import { Task } from "../task/Task"

export async function runPreToolUseHook(cline: Task, block: any): Promise<{ blocked: boolean; error?: string }> {
	const destructiveTools = new Set([
		"write_to_file",
		"apply_diff",
		"edit",
		"search_and_replace",
		"search_replace",
		"edit_file",
		"apply_patch",
		"execute_command",
		"run_slash_command",
		"generate_image",
	])

	if (destructiveTools.has(block.name) && block.name !== "select_active_intent") {
		const intentId = cline.activeIntentId
		let content = ""
		if (block.name === "write_to_file" && block.params?.content) {
			content = block.params.content
		} else if (block.name === "apply_patch" && block.params?.patch) {
			content = block.params.patch
		} else if (block.name === "edit" && block.params?.edit) {
			content = block.params.edit
		} else if (block.name === "execute_command" && block.params?.command) {
			content = block.params.command
		}
		return await preToolUseHook(intentId, block.name, content)
	}
	return { blocked: false }
}
