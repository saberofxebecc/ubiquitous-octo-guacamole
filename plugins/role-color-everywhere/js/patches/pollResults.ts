import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { applyTextColor, mapReactElements, patchComponentRender } from '../utils/react'
import { getChannelStore, getSelectedChannelStore } from '../utils/stores'

export function patchPollResults(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    cleanup(
        getModules(withName('PollVotesActionSheet'), (mod: any) => {
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

                    return mapReactElements(result, el => {
                        const rowUser = el.props?.user ?? el.props?.voter ?? el.props?.member
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
                }),
            )
        }),
    )
}