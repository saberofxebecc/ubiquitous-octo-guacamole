import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before, instead } from '@valenced/patcher'
import type { RoleColorSettings } from '../types'
import { getMemberColorData, getRoleColorData, hexToInt } from '../utils/colors'
import { withComponentName } from '../utils/filters'
import { applyTextColor, mapReactElements, patchComponentRender, wrapListRenderItem } from '../utils/react'
import { getChannelStore, getSelectedChannelStore } from '../utils/stores'

function colorAutocompleteRow(row: any, item: any, guildId: string, skipNeutral: boolean) {
    if (!row) return row
    const uid =
        item?.user?.id ??
        item?.id ??
        item?.userId ??
        item?.record?.id
    const roleId = item?.role?.id ?? item?.roleId
    const data = roleId
        ? getRoleColorData(guildId, roleId, skipNeutral)
        : getMemberColorData(uid, guildId, skipNeutral)
    if (!data) return row

    return mapReactElements(
        row,
        el => {
            if (typeof el.props?.children === 'string' && el.props?.variant) {
                return applyTextColor(el, data.colorString)
            }
            return el
        },
        5,
    )
}

export function patchMentions(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    // 1. Hydrate user & role mention AST nodes (5980)
    cleanup(
        getModules(withProps('hydrateUserMention', 'hydrateRoleMention'), (mod: any) => {
            cleanup(
                after(mod, 'hydrateUserMention', (result: any) => {
                    const settings = getSettings()
                    if (!settings.chatMentions || !result || typeof result !== 'object') return result
                    if (result.colorString && result.roleColors) return result

                    const userId = result.userId ?? result.parsedUserId ?? result.id
                    const channelId = result.channelId
                    const guildOrChannel =
                        result.guildId ??
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined) ??
                        channelId

                    const data = getMemberColorData(userId, guildOrChannel, settings.skipNeutralColors)
                    if (data) {
                        const bgInt = hexToInt(data.colorString, 0x1a)
                        result.colorString = result.colorString ?? data.colorString
                        if (bgInt !== undefined) {
                            result.color = result.color ?? bgInt
                            result.roleColor = result.roleColor ?? bgInt
                        }
                        result.roleColors = result.roleColors ?? data.colorInts
                    }
                    return result
                }),
                after(mod, 'hydrateRoleMention', (result: any) => {
                    const settings = getSettings()
                    if (!settings.chatMentions || !result || typeof result !== 'object') return result
                    if (result.colorString && result.roleColors) return result

                    const roleId = result.roleId ?? result.id
                    const channelId = result.channelId
                    const guildId =
                        result.guildId ??
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined)

                    const data = getRoleColorData(guildId, roleId, settings.skipNeutralColors)
                    if (data) {
                        const bgInt = hexToInt(data.colorString, 0x1a)
                        result.colorString = result.colorString ?? data.colorString
                        if (bgInt !== undefined) {
                            result.color = result.color ?? bgInt
                            result.roleColor = result.roleColor ?? bgInt
                        }
                        result.roleColors = result.roleColors ?? data.colorInts
                    }
                    return result
                }),
            )
        }),
    )

    // 2. Plain mention renderer in MarkupText (5704)
    cleanup(
        getModules(withProps('MarkupText', 'plainMentionRenderer'), (mod: any) => {
            cleanup(
                before(mod, 'plainMentionRenderer', (args: any[]) => {
                    const settings = getSettings()
                    if (!settings.chatMentions) return args
                    const [node, , state] = args
                    if (!node || node.colorString) return args

                    const guildOrChannel = node.guildId ?? state?.guildId ?? node.channelId ?? state?.channelId
                    const data = node.roleId
                        ? getRoleColorData(guildOrChannel, node.roleId, settings.skipNeutralColors)
                        : getMemberColorData(node.userId ?? node.id, guildOrChannel, settings.skipNeutralColors)

                    if (data) {
                        node.colorString = data.colorString
                        node.roleColors = data.colorInts
                    }
                    return args
                }),
            )
        }),
    )

    // 3. Chat Input Box highlight nodes (13048)
    cleanup(
        getModules(withProps('getUsernameHighlightNodes', 'getRoleHighlightNodes'), (mod: any) => {
            let loggedUserHL = false
            let loggedRoleHL = false

            cleanup(
                instead(mod, 'getUsernameHighlightNodes', (args: any[], orig: (...a: any[]) => any) => {
                    const result = orig(...args)
                    const settings = getSettings()
                    if (!settings.chatInputAndAutocomplete || !Array.isArray(result)) return result

                    if (settings.debugLogs && !loggedUserHL && result.length > 0) {
                        loggedUserHL = true
                        logDebug('getUsernameHighlightNodes sample', {
                            argTypes: args.map(a => (a && typeof a === 'object' ? Object.keys(a).slice(0, 8) : typeof a)),
                            firstNode: result[0],
                        })
                    }

                    const channelId = getSelectedChannelStore()?.getChannelId?.()
                    const guildId = channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined
                    if (!guildId) return result

                    for (const node of result) {
                        if (!node || typeof node !== 'object') continue
                        const uid = node.userId ?? node.id ?? node.data?.userId ?? node.data?.id
                        const data = getMemberColorData(uid, guildId, settings.skipNeutralColors)
                        if (data) {
                            if (node.style && typeof node.style === 'object') {
                                node.style.color = data.colorString
                            } else {
                                node.color = data.colorString
                            }
                        }
                    }
                    return result
                }),
                instead(mod, 'getRoleHighlightNodes', (args: any[], orig: (...a: any[]) => any) => {
                    const result = orig(...args)
                    const settings = getSettings()
                    if (!settings.chatInputAndAutocomplete || !Array.isArray(result)) return result

                    if (settings.debugLogs && !loggedRoleHL && result.length > 0) {
                        loggedRoleHL = true
                        logDebug('getRoleHighlightNodes sample', { firstNode: result[0] })
                    }

                    const channelId = getSelectedChannelStore()?.getChannelId?.()
                    const guildId = channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined
                    if (!guildId) return result

                    for (const node of result) {
                        if (!node || typeof node !== 'object') continue
                        const rid = node.roleId ?? node.id ?? node.data?.roleId ?? node.data?.id
                        const data = getRoleColorData(guildId, rid, settings.skipNeutralColors)
                        if (data) {
                            if (node.style && typeof node.style === 'object') {
                                node.style.color = data.colorString
                            } else {
                                node.color = data.colorString
                            }
                        }
                    }
                    return result
                }),
            )
        }),
    )

    // 4. @ Mention Autocomplete Popup (13239)
    cleanup(
        getModules(withComponentName('AutocompleteWrapper', 'ACWrapper'), (mod: any) => {
            let logged = false
            cleanup(
                patchComponentRender(mod, (result, [props]) => {
                    const settings = getSettings()
                    if (!settings.chatInputAndAutocomplete || !result) return result

                    const channelId = props?.channelId ?? getSelectedChannelStore()?.getChannelId?.()
                    const guildId =
                        props?.guildId ??
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined)

                    if (settings.debugLogs && !logged) {
                        logged = true
                        logDebug('AutocompleteWrapper props', {
                            keys: props ? Object.keys(props) : [],
                            guildId,
                        })
                    }

                    if (!guildId) return result

                    let loggedItem = false
                    return wrapListRenderItem(result, (row, info) => {
                        const item = info?.item
                        if (settings.debugLogs && !loggedItem && item) {
                            loggedItem = true
                            logDebug('Autocomplete item sample', {
                                itemKeys: typeof item === 'object' ? Object.keys(item) : typeof item,
                            })
                        }
                        return colorAutocompleteRow(row, item, guildId, settings.skipNeutralColors)
                    })
                }),
            )
        }),
    )
}