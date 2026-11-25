import type { IrcColorsSettings } from '../types'

let cachedRaw = ''
let cachedSet = new Set<string>()

function extractLineGuildId(line: string): string | null {
	const trimmed = line.trim()
	if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#'))
		return null
	const bracketed = trimmed.match(/^<(\d{15,22})>/)
	if (bracketed) return bracketed[1]
	const plain = trimmed.match(/^(\d{15,22})(?:\s|$|\/\/|#)/)
	return plain ? plain[1] : null
}

export function parseGuildIds(raw: string): Set<string> {
	if (raw === cachedRaw) return cachedSet
	const next = new Set<string>()
	const lines = raw.split(/\r?\n/)
	for (let i = 0; i < lines.length; i++) {
		const id = extractLineGuildId(lines[i])
		if (id) next.add(id)
	}
	cachedRaw = raw
	cachedSet = next
	return next
}

export function isGuildAllowed(
	guildId: string,
	settings: IrcColorsSettings,
): boolean {
	if (settings.serverFilterMode === 'all') return true
	const set = parseGuildIds(settings.serverFilterList ?? '')
	return settings.serverFilterMode === 'include'
		? set.has(guildId)
		: !set.has(guildId)
}

export function toggleGuildInList(
	raw: string,
	guildId: string,
	guildName?: string,
): string {
	const lines = raw ? raw.split(/\r?\n/) : []
	let found = false
	const kept: string[] = []

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (extractLineGuildId(line) === guildId) {
			found = true
			continue
		}
		if (line.trim().length > 0) kept.push(line)
	}

	if (!found) {
		const cleanName = guildName?.replace(/[\r\n]+/g, ' ').trim()
		kept.push(cleanName ? `<${guildId}> // ${cleanName}` : `<${guildId}>`)
	}

	return kept.join('\n')
}
