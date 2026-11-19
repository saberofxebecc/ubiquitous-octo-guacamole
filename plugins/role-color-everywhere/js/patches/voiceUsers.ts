import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { applyTextColor, mapReactElements, patchComponentRender } from '../utils/react'

function resolveVoiceIds(props: any) {
    const user = props?.user ?? props?.participant?.user ?? props?.member
    const userId: string | undefined = user?.id ?? props?.userId ?? props?.participant?.userId
    const guildOrChannel: string | undefined =
        props?.guildId ??
        props?.channelId ??
        props?.channel?.id ??
        props?.channel?.guild_id ??
        props?.participant?.guildId ??
        props?.participant?.channelId
    return { userId, guildOrChannel }
}

export function patchVoiceUsers(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    const targets = ['VoiceUserNameItem', 'VoiceUsersItem']

    for (const name of targets) {
        cleanup(
            getModules(withName(name), (mod: any) => {
                let logged = false
                cleanup(
                    patchComponentRender(mod, (result, [props]) => {
                        const settings = getSettings()
                        if (!settings.voiceUsers || !result) return result

                        const { userId, guildOrChannel } = resolveVoiceIds(props)

                        if (settings.debugLogs && !logged) {
                            logged = true
                            logDebug(`${name} props`, {
                                keys: props ? Object.keys(props) : [],
                                userId,
                                guildOrChannel,
                            })
                        }

                        const data = getMemberColorData(userId, guildOrChannel, settings.skipNeutralColors)
                        if (!data) return result

                        return mapReactElements(result, el => {
                            const text = el.props?.children
                            if (typeof text === 'string' && text.trim().length > 0 && el.props?.variant) {
                                return applyTextColor(el, data.colorString)
                            }
                            return el
                        })
                    }),
                )
            }),
        )
    }
}