import { getModules } from '@valenced/modules/finders'
import { withSingleProp } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import type { RoleColorSettings } from '../types'
import { getMemberColorData, getRoleColorData, hexToInt, mixWithBaseTextColor } from '../utils/colors'

function patchMentionNodes(nodes: any, guildId: string, skipNeutral: boolean): void {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
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

function patchMessageObject(msg: any, settings: RoleColorSettings): void {
    if (!msg || typeof msg !== 'object') return
    const guildId: string | undefined = msg.guildId

    if (settings.chatMentions && guildId) {
        patchMentionNodes(msg.content, guildId, settings.skipNeutralColors)
        if (Array.isArray(msg.embeds)) {
            for (const embed of msg.embeds) {
                patchMentionNodes(embed?.description, guildId, settings.skipNeutralColors)
                if (Array.isArray(embed?.fields)) {
                    for (const field of embed.fields) {
                        patchMentionNodes(field?.rawValue ?? field?.value, guildId, settings.skipNeutralColors)
                    }
                }
            }
        }
    }

    if (msg.authorId && guildId) {
        const data = getMemberColorData(msg.authorId, guildId, settings.skipNeutralColors)
        if (data) {
            if (data.isGradient) {
                msg.roleColors = msg.roleColors ?? data.colorInts
                msg.colorStrings = msg.colorStrings ?? data.colorStrings
                msg.authorHasGradientRole = true
                msg.canShowMessageUsernameGradient = true
            }
            if (settings.colorChatMessages && !msg.isSendFailed && settings.messageSaturation > 0) {
                const mixed = mixWithBaseTextColor(data.colorString, settings.messageSaturation)
                if (mixed !== undefined) {
                    msg.messageTextColor = mixed
                }
            }
        }
    }

    if (msg.referencedMessage?.message) {
        patchMessageObject(msg.referencedMessage.message, settings)
    }
}

export function patchChatMessages(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    cleanup(
        getModules(withSingleProp('generateMessageRowData'), (mod: any) => {
            let logged = false
            cleanup(
                after(mod, 'generateMessageRowData', (result: any) => {
                    const settings = getSettings()
                    if (settings.debugLogs && !logged && result) {
                        logged = true
                        logDebug('generateMessageRowData sample', {
                            resultKeys: typeof result === 'object' ? Object.keys(result).slice(0, 15) : typeof result,
                            msgKeys:
                                result?.message && typeof result.message === 'object'
                                    ? Object.keys(result.message).slice(0, 25)
                                    : undefined,
                        })
                    }

                    if (result?.message) {
                        patchMessageObject(result.message, settings)
                    }
                    return result
                }),
            )
        }),
    )
}