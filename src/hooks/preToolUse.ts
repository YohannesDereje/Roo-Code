import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { generateContentHash } from "../utils/hashing"
import { minimatch } from "glob"

const DESTRUCTIVE_TOOLS = [
	"write_to_file",
	"apply_diff",
	"execute_command",
	"run_slash_command",
	"search_and_replace",
	"insert_content",
]

const SCOPE_VIOLATION_ERROR = "Scope Violation: Action is outside the authorized project scope."
const FORCED_LEDGER_PATH =
	"C:/Users/Yohannes/Desktop/tenx education/Weeks/week 1/Roo-Code/.orchestration/agent_trace.jsonl"

function readIntentIgnorePatterns(workspaceRoot: string): string[] {
	const intentIgnorePath = path.resolve(workspaceRoot, ".intentignore")
	if (!fs.existsSync(intentIgnorePath)) {
		return []
	}

	try {
		const raw = fs.readFileSync(intentIgnorePath, "utf-8")
		return raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => !!line && !line.startsWith("#"))
	} catch {
		return []
	}
}

function normalizePathForMatch(value: string): string {
	return path.normalize(value).replace(/\\/g, "/").toLowerCase()
}

function findAncestorRoot(start: string): { root?: string; score: number } {
	let current = path.resolve(start)
	for (let depth = 0; depth <= 10; depth++) {
		const hasOrchestration = fs.existsSync(path.resolve(current, ".orchestration"))
		if (hasOrchestration) {
			return { root: current, score: 2 }
		}
		const hasPackageJson = fs.existsSync(path.resolve(current, "package.json"))
		if (hasPackageJson) {
			return { root: current, score: 1 }
		}
		const parent = path.dirname(current)
		if (parent === current) {
			break
		}
		current = parent
	}
	return { score: 0 }
}

function resolveProjectRoot(preferredRoot: string, projectRootHint?: string): string {
	const candidateRoots = new Set<string>()

	if (projectRootHint) {
		candidateRoots.add(path.resolve(projectRootHint))
	}
	candidateRoots.add(path.resolve(preferredRoot))

	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		candidateRoots.add(path.resolve(folder.uri.fsPath))
	}

	const activeEditorPath = vscode.window.activeTextEditor?.document?.uri?.fsPath
	if (activeEditorPath) {
		candidateRoots.add(path.resolve(path.dirname(activeEditorPath)))
	}

	candidateRoots.add(path.resolve(process.cwd()))

	let bestRoot: string | undefined
	let bestScore = -1
	for (const candidate of candidateRoots) {
		const { root, score } = findAncestorRoot(candidate)
		if (root && score > bestScore) {
			bestRoot = root
			bestScore = score
			if (score === 2) {
				break
			}
		}
	}

	return bestRoot ?? path.resolve(preferredRoot)
}

function writeToLedger(workspaceRoot: string, entry: any): void {
	const ledgerPath = FORCED_LEDGER_PATH
	const orchestrationDir = path.dirname(ledgerPath)
	try {
		console.error("AUDIT_LOG_DEBUG: ledgerPath= " + ledgerPath)
		console.error("AUDIT_LOG_DEBUG: entry= " + JSON.stringify(entry))
		fs.mkdirSync(orchestrationDir, { recursive: true })

		let prefix = ""
		if (fs.existsSync(ledgerPath)) {
			const existingContent = fs.readFileSync(ledgerPath, "utf-8")
			if (existingContent.length > 0 && !existingContent.endsWith("\n")) {
				prefix = "\n"
			}
		}

		fs.appendFileSync(ledgerPath, `${prefix}${JSON.stringify(entry)}\n`, "utf-8")
	} catch (ledgerError) {
		console.error("AUDIT_LOG_ERROR:", ledgerError)
	}
}

export async function preToolUseHook(
	intentId: string | undefined,
	toolName: string,
	content: string,
	projectRootHint?: string,
): Promise<{ blocked: boolean; error?: string }> {
	console.error("AUDIT_LOG_DEBUG: preToolUseHook invoked for", toolName)
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
	const projectRoot = resolveProjectRoot(workspaceRoot, projectRootHint)
	const normalizedProjectRoot = normalizePathForMatch(projectRoot)
	console.error("AUDIT_LOG_DEBUG: projectRoot= " + projectRoot)
	const isDestructive = DESTRUCTIVE_TOOLS.includes(toolName)
	let normalizedTargetPath: string | null = null
	let mutationClass: string | undefined
	let contentHash: string | undefined
	let toolIntentId: string | undefined
	const activeIntentId = intentId
	let statusOverride: "ALLOWED_BYPASS" | undefined

	const allowScopeBypass = (targetPathValue: string, reason: string): { blocked: boolean; error?: string } => {
		console.warn(
			"GOVERNANCE_BYPASS: Allowing out-of-scope path for Phase 3 testing: " + targetPathValue + " | " + reason,
		)
		statusOverride = "ALLOWED_BYPASS"
		return finalize(false)
	}

	const parseToolArgs = (): Record<string, unknown> => {
		try {
			return JSON.parse(content) as Record<string, unknown>
		} catch {
			return {}
		}
	}

	const parsedArgs = parseToolArgs()
	const intentIdFromArgs = parsedArgs.intent_id
	if (typeof intentIdFromArgs === "string" && intentIdFromArgs.length > 0) {
		toolIntentId = intentIdFromArgs
	}
	const mutationClassFromArgs = parsedArgs.mutation_class
	if (typeof mutationClassFromArgs === "string" && mutationClassFromArgs.length > 0) {
		mutationClass = mutationClassFromArgs
	}
	if (toolName === "write_to_file") {
		const nextContent = parsedArgs.content
		if (typeof nextContent === "string") {
			contentHash = generateContentHash(nextContent)
		}
	}

	const finalize = (blocked: boolean, error?: string): { blocked: boolean; error?: string } => {
		const bypassed = statusOverride === "ALLOWED_BYPASS"
		const finalBlocked = blocked && !bypassed
		const status = finalBlocked ? "BLOCKED" : (statusOverride ?? "ALLOWED")
		const ledgerEntry = {
			timestamp: new Date().toISOString(),
			intentId: toolIntentId ?? intentId,
			intent_id: toolIntentId ?? intentId,
			tool: toolName,
			path: normalizedTargetPath,
			status,
			reason: finalBlocked
				? (error ?? "Blocked")
				: status === "ALLOWED_BYPASS"
					? "Bypassed scope for Phase 3 testing"
					: "Authorized",
			mutation_class: mutationClass,
			content_hash: contentHash,
			related_requirements: activeIntentId ? [activeIntentId] : [],
		}
		writeToLedger(projectRoot, ledgerEntry)
		console.log("AUDIT_LOG: Transaction recorded in .orchestration/agent_trace.jsonl")
		return finalBlocked ? { blocked: true, error } : { blocked: false }
	}

	const matchesPathPattern = (relativePath: string, scopePattern: string): boolean => {
		const normalizedPath = normalizePathForMatch(relativePath)
		const normalizedPattern = normalizePathForMatch(scopePattern)
		const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		const regexPattern = `^${escaped.replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*")}$`
		return new RegExp(regexPattern).test(normalizedPath)
	}

	const getTargetPathFromParams = (): string | undefined => {
		const parsed = parsedArgs as {
			path?: string
			relative_path?: string
			targetPath?: string
			file_path?: string
		}
		console.error("DEBUG_PARAMS: " + JSON.stringify(parsed))
		const targetPath = parsed?.path || parsed?.relative_path || parsed?.targetPath || parsed?.file_path
		return typeof targetPath === "string" ? targetPath : undefined
	}

	const targetPath = getTargetPathFromParams()
	if (targetPath) {
		const resolvedTarget = path.resolve(process.cwd(), targetPath)
		const normalizedTarget = normalizePathForMatch(resolvedTarget)
		normalizedTargetPath = normalizedTarget
		const relativeTarget = normalizePathForMatch(path.relative(projectRoot, resolvedTarget))
		console.error("VERIFY_IGNORE: Checking " + targetPath)
		const ignorePatterns = readIntentIgnorePatterns(projectRoot)
		const isIgnoredByEnv = normalizedTarget.endsWith("/.env") || normalizedTarget.endsWith(".env")
		const isIgnoredByPattern = ignorePatterns.some((pattern) => {
			const normalizedPattern = normalizePathForMatch(pattern)
			if (!normalizedPattern) {
				return false
			}
			if (normalizedPattern.includes("*")) {
				return matchesPathPattern(relativeTarget, normalizedPattern)
			}
			return (
				relativeTarget === normalizedPattern ||
				relativeTarget.startsWith(`${normalizedPattern}/`) ||
				normalizedTarget.endsWith(`/${normalizedPattern}`) ||
				normalizedTarget.includes(`/${normalizedPattern}/`)
			)
		})
		const isIgnored = isIgnoredByEnv || isIgnoredByPattern
		if (isIgnored) {
			console.error("CRITICAL_SECURITY_VIOLATION: Blocked access to " + targetPath)
			return finalize(
				true,
				`GOVERNANCE_ERROR: Global Safety Violation: ${targetPath} is blacklisted in .intentignore.`,
			)
		}
	}

	const orchestrationDir = path.resolve(projectRoot, ".orchestration")
	const tracePath = path.resolve(orchestrationDir, "agent_trace.jsonl")
	console.error("VERIFY_CLASSIFICATION: " + toolName + " | Destructive: " + isDestructive)

	try {
		// Ensure .orchestration directory exists
		fs.mkdirSync(orchestrationDir, { recursive: true })
		// Ensure agent_trace.jsonl exists (touch if not)
		if (!fs.existsSync(tracePath)) {
			fs.writeFileSync(tracePath, "")
		}
	} catch (error) {
		return finalize(true, `Failed to prepare trace file: ${error}`)
	}

	if (!intentId && isDestructive) {
		return finalize(
			true,
			"Governance Error: You have not established a handshake. You must call select_active_intent(intent_id) to verify your architectural scope before you can modify this codebase.",
		)
	}

	let classification = "unknown"
	let ownedScope: string[] = []
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
			if (matched?.owned_scope) {
				ownedScope = Array.isArray(matched.owned_scope) ? matched.owned_scope : [String(matched.owned_scope)]
			} else if (matched?.metadata?.scope?.files) {
				const files = matched.metadata.scope.files
				ownedScope = Array.isArray(files) ? files.map(String) : [String(files)]
			}
		} else if (intentId && intents && typeof intents === "object") {
			const matched = (intents as Record<string, any>)[intentId]
			if (matched?.classification) {
				classification = String(matched.classification)
			}
			if (matched?.owned_scope) {
				ownedScope = Array.isArray(matched.owned_scope) ? matched.owned_scope : [String(matched.owned_scope)]
			} else if (matched?.metadata?.scope?.files) {
				const files = matched.metadata.scope.files
				ownedScope = Array.isArray(files) ? files.map(String) : [String(files)]
			}
		}
	} catch {}

	const normalizeScopePattern = (pattern: string): { relative: string; normalized: string } | null => {
		const trimmed = String(pattern ?? "").trim()
		if (!trimmed) {
			return null
		}
		const resolved = path.resolve(process.cwd(), trimmed)
		const relative = normalizePathForMatch(path.relative(projectRoot, resolved))
		const normalized = normalizePathForMatch(trimmed)
		return { relative, normalized }
	}

	const isPathWithinRoot = (targetPath: string): boolean => {
		const resolvedTarget = normalizePathForMatch(path.resolve(process.cwd(), targetPath))
		const relative = path.relative(normalizedProjectRoot, resolvedTarget)
		return !relative.startsWith("..") && !path.isAbsolute(relative)
	}
	if (toolName === "write_to_file") {
		if (!targetPath) {
			return finalize(true, "Scope Violation: Missing target path.")
		}

		const isAbsolute = path.isAbsolute(targetPath)
		const isInsideRoot = isPathWithinRoot(targetPath)

		if (isAbsolute && !isInsideRoot) {
			return allowScopeBypass(targetPath, SCOPE_VIOLATION_ERROR)
		}

		if (!isAbsolute && !isInsideRoot) {
			return allowScopeBypass(targetPath, SCOPE_VIOLATION_ERROR)
		}

		const absoluteResolvedTarget = path.resolve(process.cwd(), targetPath)
		const relativeTarget = normalizePathForMatch(path.relative(projectRoot, absoluteResolvedTarget))
		const absoluteTarget = normalizePathForMatch(absoluteResolvedTarget)
		if (!ownedScope.length) {
			return allowScopeBypass(targetPath, SCOPE_VIOLATION_ERROR)
		}
		console.log("BOUNCER_DEBUG: Checking path: " + absoluteTarget + " against scope: " + JSON.stringify(ownedScope))
		const inScope = ownedScope.some((pattern) => {
			const normalizedPattern = normalizeScopePattern(pattern)
			if (!normalizedPattern) {
				return false
			}
			const patternRelative = normalizedPattern.relative
			const patternNormalized = normalizedPattern.normalized
			const isOrchestrationScope =
				patternRelative === ".orchestration" ||
				patternRelative.startsWith(".orchestration/") ||
				patternRelative.startsWith(".orchestration/**") ||
				patternNormalized.startsWith(".orchestration")
			if (isOrchestrationScope) {
				return relativeTarget === ".orchestration" || relativeTarget.startsWith(".orchestration/")
			}
			if (patternRelative.includes("*") || patternNormalized.includes("*")) {
				const matchPattern = patternRelative.includes("*") ? patternRelative : patternNormalized
				return matchesPathPattern(relativeTarget, matchPattern)
			}
			return relativeTarget === patternRelative || relativeTarget.startsWith(`${patternRelative}/`)
		})
		if (!inScope) {
			return allowScopeBypass(targetPath, SCOPE_VIOLATION_ERROR)
		}
	}

	console.error("VERIFY_HASH_OUTPUT: " + (contentHash ?? ""))
	console.error("VERIFY_INTENT_ID: " + (toolIntentId ?? intentId))
	return finalize(false)
}
