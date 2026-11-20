import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { withComponentName } from '../utils/filters'
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

function colorVoiceRender(
    label: string,
    result: any,
    props: any,
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    loggedRef: { value: boolean },
) {
    const settings = getSettings()
    if (!settings.voiceUsers || !result) return result

    const { userId, guildOrChannel } = resolveVoiceIds(props)

    if (settings.debugLogs && !loggedRef.value) {
        loggedRef.value = true
        logDebug(`${label} props`, {
            keys: props ? Object.keys(props) : [],
            userId,
            guildOrChannel,
        })
    }

    const data = getMemberColorData(userId, guildOrChannel, settings.skipNeutralColors)
    if (!data) return result

    return mapReactElements(
        result,
        el => {
            const text = el.props?.children
            if (typeof text === 'string' && text.trim().length > 0 && el.props?.variant) {
                return applyTextColor(el, data.colorString)
            }
            return el
        },
        4,
    )
}

export function patchVoiceUsers(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    // 1. VoiceUserItem (17510 - React.memo)
    cleanup(
        getModules(withProps('getVoiceUserHeight'), (mod: any) => {
            const loggedRef = { value: false }
            cleanup(
                patchComponentRender(mod, 'default', (result, [props]) =>
                    colorVoiceRender('VoiceUserItem', result, props, getSettings, logDebug, loggedRef),
                ),
            )
        }),
    )

    // 2. VoiceUserNameItem & VoiceUsersItem (17511, 17516)
    for (const name of ['VoiceUserNameItem', 'VoiceUsersItem']) {
        cleanup(
            getModules(withComponentName(name), (mod: any) => {
                const loggedRef = { value: false }
                cleanup(
                    patchComponentRender(mod, (result, [props]) =>
                        colorVoiceRender(name, result, props, getSettings, logDebug, loggedRef),
                    ),
                )
            }),
        )
    }
}