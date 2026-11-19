import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { applyTextColor, mapReactElements, patchComponentRender } from '../utils/react'
import { getChannelStore, getGuildMemberStore, getSelectedChannelStore, getTypingStore, getUserStore } from '../utils/stores'

export function patchTypingIndicator(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    cleanup(
        getModules(withProps('hasTypingIndicatorContent', 'useTypingUserIdsForDisplay'), (mod: any) => {
            let loggedSample = false

            cleanup(
                patchComponentRender(mod, 'default', (result, [props]) => {
                    const settings = getSettings()
                    if (!settings.typingIndicator || !result) return result

                    const channelId: string | undefined =
                        props?.channel?.id ?? props?.channelId ?? getSelectedChannelStore()?.getChannelId?.()
                    if (!channelId) return result

                    const typingIds = getTypingStore()?.getTypingUsers?.(channelId) ?? {}
                    const userIds = Object.keys(typingIds)
                    if (userIds.length === 0) return result

                    const guildId = getChannelStore()?.getChannel?.(channelId)?.guild_id
                    if (!guildId) return result

                    const nameToColor = new Map<string, string>()
                    for (const uid of userIds) {
                        const data = getMemberColorData(uid, guildId, settings.skipNeutralColors)
                        if (!data) continue
                        const member = getGuildMemberStore()?.getMember?.(guildId, uid)
                        const user = getUserStore()?.getUser?.(uid)
                        const candidates = [member?.nick, user?.globalName, user?.username].filter(Boolean)
                        for (const name of candidates) {
                            nameToColor.set(String(name), data.colorString)
                        }
                    }

                    if (settings.debugLogs && !loggedSample) {
                        loggedSample = true
                        logDebug('TypingIndicator render', {
                            channelId,
                            userIds,
                            names: [...nameToColor.entries()],
                        })
                    }

                    if (nameToColor.size === 0) return result

                    return mapReactElements(result, el => {
                        const children = el.props?.children
                        if (typeof children === 'string') {
                            const color = nameToColor.get(children.trim())
                            if (color) return applyTextColor(el, color)
                        }
                        return el
                    })
                }),
            )
        }),
    )
}