import { getModules } from '@valenced/modules/finders'
import { withSingleProp } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import type { RoleColorSettings } from '../types'
import { getMemberColorData, getRoleColorData, hexToInt } from '../utils/colors'

function patchMentionNodes(
    nodes: any,
    guildId: string,
    skipNeutral: boolean,
    gradients: boolean,
): void {
    if (!Array.isArray(nodes)) return
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!node || typeof node !== 'object') continue

        if (node.type === 'mention' && node.userId) {
            if (!node.colorString || !node.roleColor) {
                const data = getMemberColorData(node.userId, node.guildId || guildId, skipNeutral)
                if (data) {
                    const bgInt = hexToInt(data.colorString, 0x1a)
                    node.colorString = data.colorString
                    if (bgInt !== undefined) {
                        node.color = node.color ?? bgInt
                        node.roleColor = node.roleColor ?? bgInt
                    }
                    if (gradients) node.roleColors = node.roleColors ?? data.colorInts
                    node.guildId = node.guildId ?? data.guildId
                }
            }
            if (!gradients && node.roleColors) node.roleColors = null
        } else if (node.type === 'roleMention' && node.roleId) {
            if (!node.colorString || !node.roleColor) {
                const data = getRoleColorData(node.guildId || guildId, node.roleId, skipNeutral)
                if (data) {
                    const bgInt = hexToInt(data.colorString, 0x1a)
                    node.colorString = data.colorString
                    if (bgInt !== undefined) {
                        node.color = node.color ?? bgInt
                        node.roleColor = node.roleColor ?? bgInt
                    }
                    if (gradients) node.roleColors = node.roleColors ?? data.colorInts
                }
            }
            if (!gradients && node.roleColors) node.roleColors = null
        }

        if (Array.isArray(node.content)) {
            patchMentionNodes(node.content, guildId, skipNeutral, gradients)
        }
        if (Array.isArray(node.items)) {
            for (const item of node.items) {
                if (Array.isArray(item)) {
                    patchMentionNodes(item, guildId, skipNeutral, gradients)
                } else {
                    patchMentionNodes([item], guildId, skipNeutral, gradients)
                }
            }
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
                    const msg = result?.message
                    const guildId: string | undefined = msg?.guildId
                    if (!msg || !guildId) return result

                    if (!settings.gradients && msg.roleColors) {
                        msg.roleColors = null
                    }
                    if (!settings.chatMentions) return result

                    patchMentionNodes(
                        msg.content,
                        guildId,
                        settings.skipNeutralColors,
                        settings.gradients,
                    )

                    if (Array.isArray(msg.embeds)) {
                        for (const embed of msg.embeds) {
                            patchMentionNodes(
                                embed?.description,
                                guildId,
                                settings.skipNeutralColors,
                                settings.gradients,
                            )
                            if (Array.isArray(embed?.fields)) {
                                for (const field of embed.fields) {
                                    patchMentionNodes(
                                        field?.rawValue ?? field?.value,
                                        guildId,
                                        settings.skipNeutralColors,
                                        settings.gradients,
                                    )
                                }
                            }
                        }
                    }

                    const refMsg = msg.referencedMessage?.message
                    if (refMsg?.guildId) {
                        if (!settings.gradients && refMsg.roleColors) {
                            refMsg.roleColors = null
                        }
                        patchMentionNodes(
                            refMsg.content,
                            refMsg.guildId,
                            settings.skipNeutralColors,
                            settings.gradients,
                        )
                    }

                    return result
                }),
            )
        }),
    )
}