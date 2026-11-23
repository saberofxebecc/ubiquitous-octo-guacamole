import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { ColorData, RoleColorInts, RoleColorStrings } from '../types'
import {
    getChannelStore,
    getGuildMemberStore,
    getGuildRoleStore,
    getGuildStore,
} from './stores'

let cachedProcessColorStrings: ((cs: RoleColorStrings) => RoleColorInts) | null | undefined
let gradientsEnabled = true

export function setGradientsEnabled(enabled: boolean) {
    gradientsEnabled = enabled
}

function getProcessColorStrings() {
    if (cachedProcessColorStrings !== undefined) return cachedProcessColorStrings
    const [mod] = lookupModule<any>(
        withProps('processColorStrings', 'processColorStringsArray'),
    )
    cachedProcessColorStrings =
        typeof mod?.processColorStrings === 'function' ? mod.processColorStrings : null
    return cachedProcessColorStrings
}

export function hexToInt(hex?: string | null, alpha = 0xff): number | undefined {
    if (!hex || typeof hex !== 'string') return undefined
    const clean = hex.startsWith('#') ? hex.slice(1) : hex
    if (clean.length !== 6 && clean.length !== 8) return undefined
    const rgb = Number.parseInt(clean.slice(-6), 16)
    if (Number.isNaN(rgb)) return undefined
    return (((alpha & 0xff) << 24) | rgb) | 0
}

function normalizeHex(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 0xffffff) {
        return `#${Math.trunc(value).toString(16).padStart(6, '0').toUpperCase()}`
    }
    if (typeof value !== 'string') return undefined
    const hex = value.trim().replace(/^#/, '')
    return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : undefined
}

function parseHexRgb(hex: string): [number, number, number] | null {
    const clean = hex.startsWith('#') ? hex.slice(1) : hex
    if (clean.length !== 6 && clean.length !== 8) return null
    const num = Number.parseInt(clean.slice(-6), 16)
    if (Number.isNaN(num)) return null
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

export function isNeutralColor(hex?: string | null): boolean {
    if (!hex) return false
    const rgb = parseHexRgb(hex)
    if (!rgb) return false
    const [r, g, b] = rgb
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max
    const lightness = (max + min) / 510
    return saturation < 0.16 || lightness <= 0.075 || lightness >= 0.93
}

export function getGuildId(channelOrGuildId?: string): string | undefined {
    if (!channelOrGuildId) return undefined
    const channel = getChannelStore()?.getChannel?.(channelOrGuildId)
    if (channel?.guild_id) return channel.guild_id
    const guild = getGuildStore()?.getGuild?.(channelOrGuildId)
    return guild?.id
}

export function hasEnhancedRoleColors(guildId: string): boolean {
    const guild = getGuildStore()?.getGuild?.(guildId)
    const features = guild?.features
    if (!features) return false
    return typeof features.has === 'function'
        ? features.has('ENHANCED_ROLE_COLORS')
        : Array.isArray(features) && features.includes('ENHANCED_ROLE_COLORS')
}

function buildColorData(
    guildId: string,
    colorString?: string | null,
    rawColorStrings?: RoleColorStrings | null,
    skipNeutral = false,
): ColorData | null {
    const hex = normalizeHex(colorString) ?? normalizeHex(rawColorStrings?.primaryColor)
    if (!hex) return null
    if (skipNeutral && isNeutralColor(hex)) return null

    const colorInt = hexToInt(hex)
    if (colorInt === undefined) return null

    const isGradient = Boolean(
        gradientsEnabled && hasEnhancedRoleColors(guildId) && rawColorStrings?.secondaryColor,
    )

    const colorStrings: RoleColorStrings =
        isGradient && rawColorStrings
            ? {
                primaryColor: normalizeHex(rawColorStrings.primaryColor) ?? hex,
                secondaryColor: normalizeHex(rawColorStrings.secondaryColor) ?? null,
                tertiaryColor: normalizeHex(rawColorStrings.tertiaryColor) ?? null,
            }
            : {
                primaryColor: hex,
                secondaryColor: null,
                tertiaryColor: null,
            }

    const processor = getProcessColorStrings()
    const colorInts: RoleColorInts = processor
        ? processor(colorStrings)
        : {
            primaryColor: hexToInt(colorStrings.primaryColor) ?? colorInt,
            secondaryColor: hexToInt(colorStrings.secondaryColor) ?? null,
            tertiaryColor: hexToInt(colorStrings.tertiaryColor) ?? null,
        }

    return {
        guildId,
        colorString: hex,
        colorInt,
        colorStrings,
        colorInts,
        isGradient,
    }
}

function findAssignedRoleColor(
    guildId: string,
    member: any,
    skipNeutral: boolean,
): ColorData | null {
    const roleStore = getGuildRoleStore() as any
    const rawRoles = Array.isArray(member?.roles)
        ? member.roles
        : Array.isArray(member?.roleIds)
            ? member.roleIds
            : []
    const roleIds: string[] = rawRoles
        .map((r: any) => (typeof r === 'string' ? r : r?.id))
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
    if (roleIds.length === 0) return null

    const roles: any[] = []
    for (const rid of roleIds) {
        const r = roleStore?.getRole?.(guildId, rid)
        if (r) roles.push(r)
    }
    roles.sort((a, b) => Number(b?.position ?? 0) - Number(a?.position ?? 0))

    for (const role of roles) {
        const data = buildColorData(
            guildId,
            role?.colorString ?? normalizeHex(role?.color),
            role?.colorStrings,
            skipNeutral,
        )
        if (data) return data
    }
    return null
}

export function getColorsFromMember(
    guildId?: string | null,
    member?: any,
    skipNeutral = false,
): ColorData | null {
    if (!guildId || !member) return null
    const direct = buildColorData(guildId, member.colorString, member.colorStrings, skipNeutral)
    if (direct) return direct
    return findAssignedRoleColor(guildId, member, skipNeutral)
}

export function getMemberColorData(
    userId?: string,
    channelOrGuildId?: string,
    skipNeutral = false,
    fallbackMember?: any,
): ColorData | null {
    if (!channelOrGuildId) return null
    const guildId = getGuildId(channelOrGuildId)
    if (!guildId) return null

    const cached = userId ? getGuildMemberStore()?.getMember?.(guildId, userId) : undefined
    const member = cached ?? fallbackMember
    if (!member) return null

    return getColorsFromMember(guildId, member, skipNeutral)
}

export function getGuildRoles(guildId: string): any[] {
    const store = getGuildRoleStore()
    return (
        store?.getSortedRoles?.(guildId) ??
        Object.values(store?.getRolesSnapshot?.(guildId) ?? store?.getRoles?.(guildId) ?? {})
    )
}

export function getColorsFromRole(
    guildId?: string | null,
    role?: any,
    skipNeutral = false,
): ColorData | null {
    if (!guildId || !role) return null
    return buildColorData(
        guildId,
        role.colorString ?? normalizeHex(role.color),
        role.colorStrings,
        skipNeutral,
    )
}

export function getRoleColorData(
    guildId?: string,
    roleId?: string,
    skipNeutral = false,
): ColorData | null {
    if (!guildId || !roleId) return null
    const role = getGuildRoleStore()?.getRole?.(guildId, roleId)
    return getColorsFromRole(guildId, role, skipNeutral)
}