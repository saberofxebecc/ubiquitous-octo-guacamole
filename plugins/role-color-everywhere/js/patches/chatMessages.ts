import { getModules } from '@valenced/modules/finders'
import { withSingleProp } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import type { RoleColorSettings } from '../types'
import { getMemberColorData, getRoleColorData, hexToInt } from '../utils/colors'

function patchMentionNodes(nodes: any, guildId: string, skipNeutral: boolean): void {
    if (!Array.isArray(nodes)) return
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!node || typeof node !== 'object') continue

        if (node.type === 'mention' && node.userId && (!node.colorString || !node.roleColor)) {
            const data = getMemberColorData(node.userId, node.guildId || guildId, skipNeutral)
            if (data) {
                const bgInt = hexToInt(data.colorString, 0x1a)
                node.colorString = data.colorString
                if (bgInt !== undefined) {
                    node.color = node.color ?? bgInt
                    node.roleColor = node.roleColor ?? bgInt
                }
                node.roleColors = node.roleColors ?? data.colorInts
                node.guildId = node.guildId ?? data.guildId
            }
        } else if (node.type === 'roleMention' && node.roleId && (!node.colorString || !node.roleColor)) {
            const data = getRoleColorData(node.guildId || guildId, node.roleId, skipNeutral)
            if (data) {
                const bgInt = hexToInt(data.colorString, 0x1a)
                node.colorString = data.colorString
                if (bgInt !== undefined) {
                    node.color = node.color ?? bgInt
                    node.roleColor = node.roleColor ?? bgInt
                }
                node.roleColors = node.roleColors ?? data.colorInts
            }
        }

        if (Array.isArray(node.content)) {
            patchMentionNodes(node.content, guildId, skipNeutral)
        }
        if (Array.isArray(node.items)) {
            patchMentionNodes(node.items, guildId, skipNeutral)
        }
    }
}

export function patchChatMessages(
    getSettings: () => RoleColorSettings,
    cleanup: (...fns: (() => void)[]) => void,
) {
    cleanup(
        getModules(withSingleProp('generateMessageRowData'), (mod: any) => {
            cleanup(
                after(mod, 'generateMessageRowData', (result: any) => {
                    const settings = getSettings()
                    if (!settings.chatMentions) return result

                    const msg = result?.message
                    const guildId: string | undefined = msg?.guildId
                    if (!msg || !guildId) return result

                    patchMentionNodes(msg.content, guildId, settings.skipNeutralColors)

                    if (Array.isArray(msg.embeds)) {
                        for (const embed of msg.embeds) {
                            patchMentionNodes(embed?.description, guildId, settings.skipNeutralColors)
                            if (Array.isArray(embed?.fields)) {
                                for (const field of embed.fields) {
                                    patchMentionNodes(
                                        field?.rawValue ?? field?.value,
                                        guildId,
                                        settings.skipNeutralColors,
                                    )
                                }
                            }
                        }
                    }

                    const refMsg = msg.referencedMessage?.message
                    if (refMsg?.guildId) {
                        patchMentionNodes(refMsg.content, refMsg.guildId, settings.skipNeutralColors)
                    }

                    return result
                }),
            )
        }),
    )
}