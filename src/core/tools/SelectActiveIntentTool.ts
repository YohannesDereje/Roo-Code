import * as vscode from "vscode"
import path from "path"
import * as yaml from "yaml"
import * as fs from "fs"

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

interface SelectActiveIntentParams {
	intent_id: string
}

function findLedgerPath(): { path?: string; searched: string[] } {
	const searched: string[] = []
	let currentDir = process.cwd()

	for (let depth = 0; depth <= 5; depth += 1) {
		const candidate = path.join(currentDir, ".orchestration", "active_intents.yaml")
		searched.push(candidate)
		if (fs.existsSync(candidate)) {
			return { path: candidate, searched }
		}

		const parentDir = path.dirname(currentDir)
		if (parentDir === currentDir) {
			break
		}
		currentDir = parentDir
	}

	return { searched }
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError } = callbacks

		try {
			if (!params.intent_id) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("select_active_intent", "intent_id"))
				return
			}

			const ledgerPath =
				"C:/Users/Yohannes/Desktop/tenx education/Weeks/week 1/Roo-Code/.orchestration/active_intents.yaml"

			const ledgerUri = vscode.Uri.file(ledgerPath)
			let ledgerBytes: Uint8Array
			try {
				ledgerBytes = await vscode.workspace.fs.readFile(ledgerUri)
			} catch (err) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						"Orchestration ledger not found at .orchestration/active_intents.yaml. Please create the file before selecting an intent.",
					),
				)
				return
			}
			const ledgerRaw = new TextDecoder("utf-8").decode(ledgerBytes)
			const ledger = yaml.parse(ledgerRaw) as Record<string, any> | undefined
			const intentLedger = ledger?.intent_ledger ?? ledger

			if (!intentLedger || typeof intentLedger !== "object") {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError("Invalid orchestration ledger: missing intent_ledger object."))
				return
			}

			const matchesIntentId = (entry: Record<string, any>): boolean => {
				const entryId =
					entry.intent_id ?? entry.id ?? entry.intentId ?? entry.IntentId ?? entry.IntentID ?? entry.Intent_ID
				return typeof entryId === "string" && entryId === params.intent_id
			}

			let matchedEntry: Record<string, any> | undefined
			const intentsArray = intentLedger?.intents
			const entriesArray = intentLedger?.entries
			const intentsMap = intentLedger?.intents

			if (Array.isArray(intentsArray)) {
				matchedEntry = intentsArray.find(
					(entry) => entry && typeof entry === "object" && matchesIntentId(entry),
				)
			} else if (Array.isArray(entriesArray)) {
				matchedEntry = entriesArray.find(
					(entry) => entry && typeof entry === "object" && matchesIntentId(entry),
				)
			} else if (intentsMap && typeof intentsMap === "object") {
				const directMatch = intentsMap[params.intent_id]
				if (directMatch && typeof directMatch === "object") {
					matchedEntry = directMatch
				} else {
					const values = Object.values(intentsMap)
					matchedEntry = values.find(
						(entry) => entry && typeof entry === "object" && matchesIntentId(entry as Record<string, any>),
					) as Record<string, any> | undefined
				}
			}

			if (!matchedEntry) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						"Intent ID not recognized in the orchestration ledger. Please check the ledger or create a new intent first.",
					),
				)
				return
			}

			task.consecutiveMistakeCount = 0
			task.activeIntentId = params.intent_id
			;(task as any).isHandshakeComplete = true
			const entryText = yaml.stringify(matchedEntry).trim() || "(empty entry)"
			pushToolResult(
				formatResponse.toolResult(
					`Loaded Intent ID '${params.intent_id}' from orchestration ledger.\n\n${entryText}`,
				),
			)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			const stack = error instanceof Error ? error.stack : undefined
			console.error("select_active_intent execute error:", error)
			pushToolResult(`TOOL_ERROR: ${message}${stack ? `\n${stack}` : ""}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"select_active_intent">): Promise<void> {
		const partialMessage = JSON.stringify({
			tool: "selectActiveIntent",
			intentId: block.params.intent_id,
		})
		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
