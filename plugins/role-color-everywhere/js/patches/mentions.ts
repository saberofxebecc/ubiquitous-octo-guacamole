import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import type { RoleColorSettings } from '../types'
import { getMemberColorData, getRoleColorData, hexToInt } from '../utils/colors'
import { getChannelStore } from '../utils/stores'

export function patchMentions(
    getSettings: () => RoleColorSettings,
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
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined)
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
}