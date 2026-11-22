import { React } from '@valenced/react'
import { getModules } from '@valenced/modules/finders'
import type { RoleColorSettings } from '../types'
import { getGuildId } from '../utils/colors'
import { withComponentName } from '../utils/filters'
import { patchComponentRender } from '../utils/react'
import { getSelectedChannelStore } from '../utils/stores'
import { getPollGuildContext } from './reactorsList'

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
                    const guildId = props?.guildId ?? getGuildId(channelId)

                    if (settings.debugLogs && !logged) {
                        logged = true
                        logDebug('PollVotesActionSheet ctx', { channelId, guildId })
                    }

                    if (!guildId) return result

                    return React.createElement(
                        getPollGuildContext().Provider as any,
                        { value: guildId },
                        result,
                    )
                }),
            )
        }),
    )
}