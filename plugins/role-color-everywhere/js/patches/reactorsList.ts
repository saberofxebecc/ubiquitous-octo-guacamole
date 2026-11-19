import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { applyTextColor, mapReactElements, patchComponentRender } from '../utils/react'
import { ChannelStore, SelectedChannelStore } from '../utils/stores'

function colorReactionTree(
    result: any,
    props: any,
    label: string,
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    loggedRef: { value: boolean },
) {
    const settings = getSettings()
    if (!settings.reactorsList || !result) return result

    const channelId =
        props?.channelId ??
        props?.message?.channel_id ??
        SelectedChannelStore?.getChannelId?.()
    const guildId = props?.guildId ?? (channelId ? ChannelStore?.getChannel?.(channelId)?.guild_id : undefined)

    if (settings.debugLogs && !loggedRef.value) {
        loggedRef.value = true
        logDebug(`${label} props`, {
            keys: props ? Object.keys(props) : [],
            channelId,
            guildId,
        })
    }

    if (!guildId) return result

    return mapReactElements(result, el => {
        const rowUser = el.props?.user ?? el.props?.reactor ?? el.props?.member
        const uid = rowUser?.id ?? el.props?.userId
        if (uid) {
            const data = getMemberColorData(uid, guildId, settings.skipNeutralColors)
            if (data) {
                return mapReactElements(el, child => {
                    if (typeof child.props?.children === 'string' && child.props?.variant) {
                        return applyTextColor(child, data.colorString)
                    }
                    return child
                }) as typeof el
            }
        }
        return el
    })
}

export function patchReactorsList(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    cleanup(
        getModules(withProps('useReactors', 'MessageReactionsContent'), (mod: any) => {
            const loggedRef = { value: false }
            cleanup(
                patchComponentRender(mod, 'MessageReactionsContent', (result, [props]) =>
                    colorReactionTree(result, props, 'MessageReactionsContent', getSettings, logDebug, loggedRef),
                ),
            )
        }),
    )

    cleanup(
        getModules(withName('MessageReactions'), (mod: any) => {
            const loggedRef = { value: false }
            cleanup(
                patchComponentRender(mod, (result, [props]) =>
                    colorReactionTree(result, props, 'MessageReactions', getSettings, logDebug, loggedRef),
                ),
            )
        }),
    )
}