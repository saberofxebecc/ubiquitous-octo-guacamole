import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
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

let cachedProcessColorStrings:
	| ((cs: RoleColorStrings) => RoleColorInts)
	| null
	| undefined

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

let cachedSig = ''
const colorCache = new Map<string, UserIrcColor>()

export function getUserIrcColor(
	userId: string,
	settings: IrcColorsSettings,
): UserIrcColor {
	const sat = clamp(Math.round(settings.saturation), 0, 100)
	const light = clamp(Math.round(settings.lightness), 0, 100)
	const seed = settings.seed ?? ''
	const sig = `${seed}|${sat}|${light}`

	if (sig !== cachedSig) {
		colorCache.clear()
		cachedSig = sig
	}

	const cached = colorCache.get(userId)
	if (cached) return cached

	const hash = xxhash64(`${userId}${seed}`)
	const h1 = Number(hash % 360n)
	const shift = 35 + Number((hash >> 16n) % 55n)
	const dir = ((hash >> 24n) & 1n) === 0n ? 1 : -1
	const h2 = (h1 + dir * shift + 360) % 360

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
	colorCache.set(userId, entry)
	return entry
}
