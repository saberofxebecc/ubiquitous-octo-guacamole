import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { withComponentName } from '../utils/filters'
import { applyTextColor, mapReactElements, patchComponentRender, wrapListRenderItem } from '../utils/react'
import { getChannelStore, getSelectedChannelStore } from '../utils/stores'

function colorReactionsSheet(
    label: string,
    result: any,
    props: any,
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    loggedRef: { value: boolean },
) {
    const settings = getSettings()
    if (!settings.reactorsList || !result) return result

    const channelId =
        props?.channelId ??
        props?.message?.channel_id ??
        getSelectedChannelStore()?.getChannelId?.()
    const guildId =
        props?.guildId ??
        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined)

    if (settings.debugLogs && !loggedRef.value) {
        loggedRef.value = true
        logDebug(`${label} props`, {
            keys: props ? Object.keys(props) : [],
            channelId,
            guildId,
        })
    }

    if (!guildId) return result

    let loggedItem = false
    return wrapListRenderItem(result, (row, info) => {
        const item = info?.item
        if (settings.debugLogs && !loggedItem && item) {
            loggedItem = true
            logDebug(`${label} row item`, {
                itemKeys: typeof item === 'object' ? Object.keys(item) : typeof item,
            })
        }

        const uid = item?.user?.id ?? item?.id ?? item?.userId ?? item?.reactor?.id
        const data = getMemberColorData(uid, guildId, settings.skipNeutralColors)
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
                    colorReactionsSheet('MessageReactionsContent', result, props, getSettings, logDebug, loggedRef),
                ),
            )
        }),
    )

    cleanup(
        getModules(withComponentName('MessageReactions'), (mod: any) => {
            const loggedRef = { value: false }
            cleanup(
                patchComponentRender(mod, (result, [props]) =>
                    colorReactionsSheet('MessageReactions', result, props, getSettings, logDebug, loggedRef),
                ),
            )
        }),
    )
}