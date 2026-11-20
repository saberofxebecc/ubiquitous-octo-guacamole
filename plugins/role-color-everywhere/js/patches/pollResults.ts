import { getModules } from '@valenced/modules/finders'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { withComponentName } from '../utils/filters'
import { applyTextColor, mapReactElements, patchComponentRender, wrapListRenderItem } from '../utils/react'
import { getChannelStore, getSelectedChannelStore } from '../utils/stores'

export function patchPollResults(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    cleanup(
        getModules(withComponentName('PollVotesActionSheet'), (mod: any) => {
            let logged = false
            cleanup(
                patchComponentRender(mod, (result, [props]) => {
                    const settings = getSettings()
                    if (!settings.pollResults || !result) return result

                    const channelId =
                        props?.channelId ??
                        props?.message?.channel_id ??
                        getSelectedChannelStore()?.getChannelId?.()
                    const guildId =
                        props?.guildId ??
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined)

                    if (settings.debugLogs && !logged) {
                        logged = true
                        logDebug('PollVotesActionSheet props', {
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
                            logDebug('PollVotesActionSheet row item', {
                                itemKeys: typeof item === 'object' ? Object.keys(item) : typeof item,
                            })
                        }

                        const uid = item?.user?.id ?? item?.id ?? item?.userId ?? item?.voter?.id
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
                }),
            )
        }),
    )
}