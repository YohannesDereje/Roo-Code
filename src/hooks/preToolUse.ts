import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { sha256 } from "../utils/hashing"

export async function preToolUseHook(
	intentId: string | undefined,
	toolName: string,
	content: string,
): Promise<{ blocked: boolean; error?: string }> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()

	const orchestrationDir = path.resolve(workspaceRoot, ".orchestration")
	const tracePath = path.resolve(orchestrationDir, "agent_trace.jsonl")
	console.log("FDE_DEBUG: Attempting to write trace to: ", tracePath)

	try {
		// Ensure .orchestration directory exists
		fs.mkdirSync(orchestrationDir, { recursive: true })
		// Ensure agent_trace.jsonl exists (touch if not)
		if (!fs.existsSync(tracePath)) {
			fs.writeFileSync(tracePath, "")
		}
	} catch (error) {
		return { blocked: true, error: `Failed to prepare trace file: ${error}` }
	}

	if (!intentId) {
		return {
			blocked: true,
			error: "Governance Error: You have not established a handshake. You must call select_active_intent(intent_id) to verify your architectural scope before you can modify this codebase.",
		}
	}

	let classification = "unknown"
	try {
		const ledgerPath = path.join(orchestrationDir, "active_intents.yaml")
		const ledgerRaw = fs.readFileSync(ledgerPath, "utf-8")
		const ledger = JSON.parse(JSON.stringify(require("yaml").parse(ledgerRaw)))
		const intentLedger = ledger?.intent_ledger ?? ledger
		const intents = intentLedger?.intents
		if (Array.isArray(intents)) {
			const matched = intents.find((entry: any) => entry && entry.id === intentId)
			if (matched?.classification) {
				classification = String(matched.classification)
			}
		} else if (intents && typeof intents === "object") {
			const matched = intents[intentId]
			if (matched?.classification) {
				classification = String(matched.classification)
			}
		}
	} catch {}

	const hash = sha256(content)
	console.error("VERIFY_HASH_OUTPUT: " + hash)
	console.error("VERIFY_INTENT_ID: " + intentId)
	const traceEntry = {
		timestamp: new Date().toISOString(),
		intentId,
		toolName,
		hash,
		classification,
	}
	try {
		fs.appendFileSync(tracePath, `${JSON.stringify(traceEntry)}\n`, "utf-8")
	} catch (error) {
		return { blocked: false, error: `Failed to append trace: ${error}` }
	}

	return { blocked: false }
}
