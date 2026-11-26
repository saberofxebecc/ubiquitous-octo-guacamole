import { getJsonStorage } from '@valenced/json-storage'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { pluginStorageDirFor } from '@valenced/plugins/constants'
import { getChannelStore, getUserStore } from './stores'
import type { JsonStorage } from '@valenced/json-storage'
import type {
	IrcColorsSettings,
	RoleColorInts,
	RoleColorStrings,
	UserIrcColor,
} from '../types'

const P1 = 0x9e3779b185ebca87n
const P2 = 0xc2b2ae3d27d4eb4fn
const P3 = 0x165667b19e3779f9n
const P4 = 0x85ebca77c2b2ae63n
const P5 = 0x27d4eb2f165667c5n
const M64 = 0xffffffffffffffffn

// Maps uniform [0, 360) -> perceptually balanced HSL hue [0, 360)
const HUE_CURVE: readonly [number, number][] = [
	[0, 0],
	[45, 26],
	[90, 48],
	[120, 72],
	[155, 132],
	[195, 175],
	[235, 208],
	[275, 242],
	[315, 285],
	[340, 325],
	[360, 360],
]

interface PoolFileData {
	seed: string
	channels: Record<string, string[]>
}

export interface ColorContext {
	channelId?: string | null
	guildId?: string | null
}

let cachedProcessColorStrings:
	| ((cs: RoleColorStrings) => RoleColorInts)
	| null
	| undefined

let poolStorage: JsonStorage<PoolFileData> | null = null
let poolData: PoolFileData = { seed: '', channels: {} }
let poolSaveTimer: ReturnType<typeof setTimeout> | undefined

// Per-session in-memory active server pools: `${seed}|${guildId}` -> Map<userId, uniformAngle>
const guildPools = new Map<string, Map<string, number>>()

let cachedSig = ''
const colorCache = new Map<string, UserIrcColor>()

export function initColorPools(pluginId: string): () => void {
	const storage = getJsonStorage<PoolFileData>(
		`${pluginStorageDirFor(pluginId)}/pools.json`,
		{
			default: { seed: '', channels: {} },
		},
	)
	poolStorage = storage
	storage.get().then(loaded => {
		if (poolStorage !== storage || !loaded) return
		poolData = {
			seed: typeof loaded.seed === 'string' ? loaded.seed : '',
			channels:
				loaded.channels && typeof loaded.channels === 'object'
					? loaded.channels
					: {},
		}
		colorCache.clear()
	})

	return () => {
		if (poolSaveTimer !== undefined) {
			clearTimeout(poolSaveTimer)
			poolSaveTimer = undefined
		}
		poolStorage = null
		guildPools.clear()
		colorCache.clear()
	}
}

function schedulePoolSave() {
	if (!poolStorage) return
	if (poolSaveTimer !== undefined) clearTimeout(poolSaveTimer)
	poolSaveTimer = setTimeout(() => {
		poolSaveTimer = undefined
		if (!poolStorage) return
		const keys = Object.keys(poolData.channels)
		if (keys.length > 150) {
			const trimmed: Record<string, string[]> = {}
			for (const k of keys.slice(-150)) trimmed[k] = poolData.channels[k]
			poolData.channels = trimmed
		}
		poolStorage.set(poolData, true)
	}, 800)
}

function getProcessColorStrings() {
	if (cachedProcessColorStrings !== undefined) return cachedProcessColorStrings
	const [mod] = lookupModule<any>(
		withProps('processColorStrings', 'processColorStringsArray'),
	)
	cachedProcessColorStrings =
		typeof mod?.processColorStrings === 'function'
			? mod.processColorStrings
			: null
	return cachedProcessColorStrings
}

function encodeUtf8(str: string): Uint8Array {
	const bytes: number[] = []
	for (let i = 0; i < str.length; i++) {
		let code = str.charCodeAt(i)
		if (code < 0x80) {
			bytes.push(code)
		} else if (code < 0x800) {
			bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
		} else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
			const next = str.charCodeAt(i + 1)
			if (next >= 0xdc00 && next <= 0xdfff) {
				code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
				i++
				bytes.push(
					0xf0 | (code >> 18),
					0x80 | ((code >> 12) & 0x3f),
					0x80 | ((code >> 6) & 0x3f),
					0x80 | (code & 0x3f),
				)
			} else {
				bytes.push(
					0xe0 | (code >> 12),
					0x80 | ((code >> 6) & 0x3f),
					0x80 | (code & 0x3f),
				)
			}
		} else {
			bytes.push(
				0xe0 | (code >> 12),
				0x80 | ((code >> 6) & 0x3f),
				0x80 | (code & 0x3f),
			)
		}
	}
	return new Uint8Array(bytes)
}

function rotl64(x: bigint, r: bigint): bigint {
	return ((x << r) | (x >> (64n - r))) & M64
}

function readU32LE(b: Uint8Array, i: number): bigint {
	return BigInt(
		(b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0,
	)
}

function readU64LE(b: Uint8Array, i: number): bigint {
	return readU32LE(b, i) | (readU32LE(b, i + 4) << 32n)
}

function xxRound(acc: bigint, input: bigint): bigint {
	return (rotl64((acc + input * P2) & M64, 31n) * P1) & M64
}

function xxMergeRound(acc: bigint, val: bigint): bigint {
	return ((acc ^ xxRound(0n, val)) * P1 + P4) & M64
}

function xxhash64(str: string): bigint {
	const b = encodeUtf8(str)
	const len = b.length
	let i = 0
	let h: bigint

	if (len >= 32) {
		let v1 = (P1 + P2) & M64
		let v2 = P2
		let v3 = 0n
		let v4 = -P1 & M64

		while (i <= len - 32) {
			v1 = xxRound(v1, readU64LE(b, i))
			v2 = xxRound(v2, readU64LE(b, i + 8))
			v3 = xxRound(v3, readU64LE(b, i + 16))
			v4 = xxRound(v4, readU64LE(b, i + 24))
			i += 32
		}

		h =
			(rotl64(v1, 1n) + rotl64(v2, 7n) + rotl64(v3, 12n) + rotl64(v4, 18n)) &
			M64
		h = xxMergeRound(h, v1)
		h = xxMergeRound(h, v2)
		h = xxMergeRound(h, v3)
		h = xxMergeRound(h, v4)
	} else {
		h = P5
	}

	h = (h + BigInt(len)) & M64

	while (i <= len - 8) {
		h = (rotl64(h ^ xxRound(0n, readU64LE(b, i)), 27n) * P1 + P4) & M64
		i += 8
	}

	if (i <= len - 4) {
		h = (rotl64(h ^ ((readU32LE(b, i) * P1) & M64), 23n) * P2 + P3) & M64
		i += 4
	}

	while (i < len) {
		h = (rotl64(h ^ ((BigInt(b[i]) * P5) & M64), 11n) * P1) & M64
		i++
	}

	h ^= h >> 33n
	h = (h * P2) & M64
	h ^= h >> 29n
	h = (h * P3) & M64
	h ^= h >> 32n
	return h
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n))
}

function wrapDeg(deg: number): number {
	return ((deg % 360) + 360) % 360
}

function angularDist(a: number, b: number): number {
	const d = Math.abs(wrapDeg(a) - wrapDeg(b))
	return d > 180 ? 360 - d : d
}

function perceptualHue(uniformDeg: number): number {
	const u = wrapDeg(uniformDeg)
	for (let i = 0; i < HUE_CURVE.length - 1; i++) {
		const [u0, h0] = HUE_CURVE[i]
		const [u1, h1] = HUE_CURVE[i + 1]
		if (u <= u1) {
			const t = (u - u0) / (u1 - u0)
			return h0 + t * (h1 - h0)
		}
	}
	return u
}

function hslToHex(h: number, sPct: number, lPct: number): string {
	const s = clamp(sPct, 0, 100) / 100
	const l = clamp(lPct, 0, 100) / 100
	const a = s * Math.min(l, 1 - l)
	const f = (n: number) => {
		const k = (n + h / 30) % 12
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
		return Math.round(255 * color)
			.toString(16)
			.padStart(2, '0')
			.toUpperCase()
	}
	return `#${f(0)}${f(8)}${f(4)}`
}

export function hexToInt(hex: string, alpha = 0xff): number {
	const clean = hex.startsWith('#') ? hex.slice(1) : hex
	const rgb = Number.parseInt(clean.slice(-6), 16)
	return ((alpha & 0xff) << 24) | rgb | 0
}

function placeInLargestGap(placed: number[], hash: bigint): number {
	if (placed.length === 0) return Number(hash % 360n)

	const sorted = placed.slice().sort((a, b) => a - b)
	let bestStart = sorted[0]
	let bestGap = 0

	for (let i = 0; i < sorted.length; i++) {
		const cur = sorted[i]
		const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360
		const gap = next - cur
		if (gap > bestGap) {
			bestGap = gap
			bestStart = cur
		}
	}

	// Small organic jitter within ±10% of the gap so positions aren't rigid
	const jitterNorm = (Number((hash >> 12n) % 21n) - 10) / 100
	return wrapDeg(bestStart + bestGap * (0.5 + jitterNorm))
}

function getDmPoolAngle(
	channelId: string,
	userId: string,
	seed: string,
): { angle: number; peerAngles: number[] } {
	if (poolData.seed !== seed) {
		poolData = { seed, channels: {} }
		schedulePoolSave()
	}

	let order = poolData.channels[channelId]
	let changed = false

	if (!Array.isArray(order)) {
		const ch = getChannelStore()?.getChannel?.(channelId)
		const meId = getUserStore()?.getCurrentUser?.()?.id
		const initial = new Set<string>()
		if (Array.isArray(ch?.recipients)) {
			for (const rid of ch.recipients) {
				if (typeof rid === 'string' && rid.length > 0) initial.add(rid)
			}
		}
		if (meId) initial.add(meId)
		initial.add(userId)

		// Sort initial members deterministically by channel+user+seed hash
		order = Array.from(initial).sort((a, b) => {
			const ha = xxhash64(`${channelId}|${a}|${seed}`)
			const hb = xxhash64(`${channelId}|${b}|${seed}`)
			return ha < hb ? -1 : ha > hb ? 1 : a.localeCompare(b)
		})
		poolData.channels[channelId] = order
		changed = true
	} else if (!order.includes(userId)) {
		// Newcomer joins: append without changing existing participants' indices/colors
		order = [...order, userId]
		poolData.channels[channelId] = order
		changed = true
	}

	if (changed) schedulePoolSave()

	const baseAngle = Number(xxhash64(`base|${channelId}|${seed}`) % 360n)
	const placed: number[] = [baseAngle]

	for (let idx = 1; idx < order.length; idx++) {
		const h = xxhash64(`${channelId}|${order[idx]}|${seed}`)
		placed.push(placeInLargestGap(placed, h))
	}

	const userIdx = order.indexOf(userId)
	const angle = placed[Math.max(userIdx, 0)]
	const peerAngles = placed.filter((_, idx) => idx !== userIdx)
	return { angle, peerAngles }
}

function getGuildPoolAngle(
	guildId: string,
	userId: string,
	seed: string,
): { angle: number; peerAngles: number[] } {
	const key = `${seed}|${guildId}`
	let pool = guildPools.get(key)
	if (!pool) {
		if (guildPools.size >= 40) {
			const oldest = guildPools.keys().next().value
			if (oldest !== undefined) guildPools.delete(oldest)
		}
		pool = new Map()
		guildPools.set(key, pool)
	}

	const existing = pool.get(userId)
	if (existing !== undefined) {
		const peerAngles: number[] = []
		for (const [uid, ang] of pool) {
			if (uid !== userId) peerAngles.push(ang)
		}
		return { angle: existing, peerAngles }
	}

	const activeAngles = Array.from(pool.values()).slice(-28)
	const baseHash = xxhash64(`${guildId}|${userId}|${seed}`)

	let chosen = Number(baseHash % 360n)
	if (activeAngles.length > 0) {
		let bestMinDist = -1
		for (let c = 0; c < 6; c++) {
			const candidate = Number(
				((baseHash >> BigInt(c * 9)) ^ BigInt(c * 97)) % 360n,
			)
			let minDist = 180
			for (let i = 0; i < activeAngles.length; i++) {
				const d = angularDist(candidate, activeAngles[i])
				if (d < minDist) minDist = d
			}
			if (minDist > bestMinDist) {
				bestMinDist = minDist
				chosen = candidate
			}
		}
	}

	if (pool.size >= 120) {
		const firstKey = pool.keys().next().value
		if (firstKey !== undefined) pool.delete(firstKey)
	}
	pool.set(userId, chosen)

	return { angle: chosen, peerAngles: activeAngles }
}

function pickGradientStop2(
	u1: number,
	peerAngles: number[],
	hash: bigint,
): number {
	const baseShift = 95 + Number((hash >> 16n) % 55n) // 95..149° contrasting stop
	const baseDir = ((hash >> 24n) & 1n) === 0n ? 1 : -1

	if (peerAngles.length === 0) {
		return wrapDeg(u1 + baseDir * baseShift)
	}

	const candidates = [
		wrapDeg(u1 + baseDir * baseShift),
		wrapDeg(u1 - baseDir * baseShift),
		wrapDeg(u1 + baseDir * (baseShift - 30)),
		wrapDeg(u1 - baseDir * (baseShift - 30)),
	]

	let best = candidates[0]
	let bestScore = -1
	for (let i = 0; i < candidates.length; i++) {
		let minDist = 180
		for (let j = 0; j < peerAngles.length; j++) {
			const d = angularDist(candidates[i], peerAngles[j])
			if (d < minDist) minDist = d
		}
		if (minDist > bestScore) {
			bestScore = minDist
			best = candidates[i]
		}
	}
	return best
}

export function getUserIrcColor(
	userId: string,
	context: ColorContext,
	settings: IrcColorsSettings,
): UserIrcColor {
	const sat = clamp(Math.round(settings.saturation), 0, 100)
	const light = clamp(Math.round(settings.lightness), 0, 100)
	const seed = settings.seed ?? ''
	const mode = settings.colorAssignment ?? 'per-context'
	const guildId = context.guildId ?? null
	const channelId = context.channelId ?? null

	const sig = `${seed}|${sat}|${light}|${mode}`
	if (sig !== cachedSig) {
		colorCache.clear()
		cachedSig = sig
	}

	const scopeKey =
		mode === 'global'
			? `g:${userId}`
			: guildId
				? mode === 'dm-context-guild-global'
					? `g:${userId}`
					: `s:${guildId}:${userId}`
				: channelId
					? `d:${channelId}:${userId}`
					: `g:${userId}`

	const cached = colorCache.get(scopeKey)
	if (cached) return cached

	const hash = xxhash64(`${userId}${seed}`)
	let u1 = Number(hash % 360n)
	let peerAngles: number[] = []

	if (mode !== 'global') {
		if (!guildId && channelId) {
			const dmRes = getDmPoolAngle(channelId, userId, seed)
			u1 = dmRes.angle
			peerAngles = dmRes.peerAngles
		} else if (guildId && mode === 'per-context') {
			const guildRes = getGuildPoolAngle(guildId, userId, seed)
			u1 = guildRes.angle
			peerAngles = guildRes.peerAngles
		}
	}

	const u2 = pickGradientStop2(u1, peerAngles, hash)
	const h1 = perceptualHue(u1)
	const h2 = perceptualHue(u2)

	const primaryHex = hslToHex(h1, sat, light)
	const secondaryHex = hslToHex(h2, sat, light)
	const primaryInt = hexToInt(primaryHex)

	const colorStrings: RoleColorStrings = {
		primaryColor: primaryHex,
		secondaryColor: secondaryHex,
		tertiaryColor: null,
	}

	const processor = getProcessColorStrings()
	const colorInts: RoleColorInts = processor
		? processor(colorStrings)
		: {
				primaryColor: primaryInt,
				secondaryColor: hexToInt(secondaryHex),
				tertiaryColor: null,
			}

	const entry: UserIrcColor = {
		primaryHex,
		secondaryHex,
		primaryInt,
		colorStrings,
		colorInts,
	}

	if (colorCache.size >= 4096) colorCache.clear()
	colorCache.set(scopeKey, entry)
	return entry
}
