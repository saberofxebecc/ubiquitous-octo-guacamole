import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { ColorData, RoleColorInts, RoleColorStrings } from '../types'
import {
    ChannelStore,
    GuildMemberStore,
    GuildRoleStore,
    GuildStore,
    ThemeStore,
} from './stores'

let cachedProcessColorStrings: ((cs: RoleColorStrings) => RoleColorInts) | null | undefined

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
    return max - min < 24 || max < 36 || min > 225
}

export function mixWithBaseTextColor(roleHex: string, saturationPct: number): number | undefined {
    const rgb = parseHexRgb(roleHex)
    if (!rgb) return undefined

    const theme = ThemeStore?.theme ?? 'dark'
    const isLight = theme === 'light'
    const base: [number, number, number] = isLight ? [49, 51, 56] : [219, 222, 225]

    const t = Math.max(0, Math.min(100, saturationPct)) / 100
    const r = Math.round(base[0] + (rgb[0] - base[0]) * t)
    const g = Math.round(base[1] + (rgb[1] - base[1]) * t)
    const b = Math.round(base[2] + (rgb[2] - base[2]) * t)

    return ((0xff << 24) | (r << 16) | (g << 8) | b) | 0
}

export function getGuildId(channelOrGuildId?: string): string | undefined {
    if (!channelOrGuildId) return undefined
    const channel = ChannelStore?.getChannel?.(channelOrGuildId)
    if (channel?.guild_id) return channel.guild_id
    const guild = GuildStore?.getGuild?.(channelOrGuildId)
    return guild?.id
}

export function hasEnhancedRoleColors(guildId: string): boolean {
    const guild = GuildStore?.getGuild?.(guildId)
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
    if (!colorString) return null
    if (skipNeutral && isNeutralColor(colorString)) return null

    const colorInt = hexToInt(colorString)
    if (colorInt === undefined) return null

    const isGradient = Boolean(
        hasEnhancedRoleColors(guildId) && rawColorStrings?.secondaryColor,
    )

    const colorStrings: RoleColorStrings = isGradient && rawColorStrings
        ? {
            primaryColor: rawColorStrings.primaryColor ?? colorString,
            secondaryColor: rawColorStrings.secondaryColor ?? null,
            tertiaryColor: rawColorStrings.tertiaryColor ?? null,
        }
        : {
            primaryColor: colorString,
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
        colorString,
        colorInt,
        colorStrings,
        colorInts,
        isGradient,
    }
}

export function getMemberColorData(
    userId?: string,
    channelOrGuildId?: string,
    skipNeutral = false,
): ColorData | null {
    if (!userId || !channelOrGuildId) return null
    const guildId = getGuildId(channelOrGuildId)
    if (!guildId) return null

    const member = GuildMemberStore?.getMember?.(guildId, userId)
    if (!member) return null

    return buildColorData(guildId, member.colorString, member.colorStrings, skipNeutral)
}

export function getRoleColorData(
    guildId?: string,
    roleId?: string,
    skipNeutral = false,
): ColorData | null {
    if (!guildId || !roleId) return null
    const role = GuildRoleStore?.getRole?.(guildId, roleId)
    if (!role) return null

    return buildColorData(guildId, role.colorString, role.colorStrings, skipNeutral)
}