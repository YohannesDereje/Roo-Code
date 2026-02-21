import crypto from "crypto"

export function sha256(value: string): string {
	return crypto.createHash("sha256").update(value, "utf-8").digest("hex")
}

export function generateContentHash(content: string): string {
	return sha256(content)
}
