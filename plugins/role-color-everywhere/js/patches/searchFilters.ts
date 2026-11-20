import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { withComponentName } from '../utils/filters'
import { applyTextColor, mapReactElements, patchComponentRender, wrapListRenderItem } from '../utils/react'
import { getChannelStore, getSelectedChannelStore } from '../utils/stores'

export function patchSearchFilters(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    // 1. AutocompleteScreen in Search (18145)
    cleanup(
        getModules(withComponentName('AutocompleteScreen'), (mod: any) => {
            let logged = false
            cleanup(
                patchComponentRender(mod, (result, [props]) => {
                    const settings = getSettings()
                    if (!settings.searchFilters || !result) return result

                    const channelId = props?.channelId ?? getSelectedChannelStore()?.getChannelId?.()
                    const guildId =
                        props?.guildId ??
                        props?.searchContext?.guildId ??
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined)

                    if (settings.debugLogs && !logged) {
                        logged = true
                        logDebug('AutocompleteScreen props', {
                            keys: props ? Object.keys(props) : [],
                            guildId,
                        })
                    }

                    if (!guildId) return result

                    let loggedItem = false
                    return wrapListRenderItem(result, (row, info) => {
                        const item = info?.item
                        if (settings.debugLogs && !loggedItem && item) {
                            loggedItem = true
                            logDebug('Search Autocomplete item', {
                                itemKeys: typeof item === 'object' ? Object.keys(item) : typeof item,
                            })
                        }

                        const uid =
                            item?.user?.id ??
                            item?.id ??
                            item?.userId ??
                            item?.data?.id
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

    // 2. Diagnostic / color hint on getUserAutocompletions (13189)
    cleanup(
        getModules(withProps('getUserAutocompletions', 'isValidUserAutocomplete'), (mod: any) => {
            let logged = false
            cleanup(
                after(mod, 'getUserAutocompletions', (result: any) => {
                    const settings = getSettings()
                    if (settings.debugLogs && !logged && Array.isArray(result) && result.length > 0) {
                        logged = true
                        logDebug('getUserAutocompletions sample', {
                            len: result.length,
                            firstKeys: result[0] && typeof result[0] === 'object' ? Object.keys(result[0]) : typeof result[0],
                        })
                    }
                    return result
                }),
            )
        }),
    )
}