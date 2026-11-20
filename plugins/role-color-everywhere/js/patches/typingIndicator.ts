import { type ReactElement, type ReactNode } from 'react'
import { React } from '@valenced/react'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { mapReactElements, patchComponentRender } from '../utils/react'
import {
    getChannelStore,
    getGuildMemberStore,
    getSelectedChannelStore,
    getTypingStore,
    getUserStore,
} from '../utils/stores'

function colorizeStringWithNames(
    text: string,
    nameEntries: [string, string][],
    TextComp: any,
): ReactNode | null {
    // Sort longest name first to avoid partial matches
    const matches: { index: number; len: number; name: string; color: string }[] = []
    for (const [name, color] of nameEntries) {
        if (!name) continue
        let pos = 0
        while (pos < text.length) {
            const idx = text.indexOf(name, pos)
            if (idx === -1) break
            matches.push({ index: idx, len: name.length, name, color })
            pos = idx + name.length
        }
    }
    if (matches.length === 0) return null

    matches.sort((a, b) => a.index - b.index || b.len - a.len)

    const out: ReactNode[] = []
    let cursor = 0
    for (const m of matches) {
        if (m.index < cursor) continue
        if (m.index > cursor) {
            out.push(text.slice(cursor, m.index))
        }
        out.push(
            React.createElement(
                TextComp,
                { key: `rce-t-${m.index}`, style: { color: m.color } },
                m.name,
            ),
        )
        cursor = m.index + m.len
    }
    if (cursor < text.length) {
        out.push(text.slice(cursor))
    }
    return out
}

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

                    const nameMap = new Map<string, string>()
                    for (const uid of userIds) {
                        const data = getMemberColorData(uid, guildId, settings.skipNeutralColors)
                        if (!data) continue
                        const member = getGuildMemberStore()?.getMember?.(guildId, uid)
                        const user = getUserStore()?.getUser?.(uid)
                        for (const candidate of [member?.nick, user?.globalName, user?.username]) {
                            if (candidate) nameMap.set(String(candidate), data.colorString)
                        }
                    }

                    if (nameMap.size === 0) return result

                    const nameEntries = [...nameMap.entries()].sort((a, b) => b[0].length - a[0].length)

                    if (settings.debugLogs && !loggedSample) {
                        loggedSample = true
                        const preview: any[] = []
                        mapReactElements(
                            result,
                            el => {
                                if (typeof el.props?.children === 'string' || Array.isArray(el.props?.children)) {
                                    preview.push({
                                        type: typeof el.type === 'string' ? el.type : (el.type as any)?.name || (el.type as any)?.displayName || typeof el.type,
                                        children: Array.isArray(el.props.children)
                                            ? el.props.children.map((c: any) => (typeof c === 'string' ? c : typeof c))
                                            : el.props.children,
                                    })
                                }
                                return el
                            },
                            6,
                        )
                        logDebug('TypingIndicator tree preview', { preview: preview.slice(0, 6) })
                    }

                    return mapReactElements(
                        result,
                        (el: ReactElement<any>) => {
                            const children = el.props?.children
                            if (typeof children === 'string') {
                                const exact = nameMap.get(children.trim())
                                if (exact) {
                                    return React.cloneElement(el, {
                                        style: el.props.style ? [el.props.style, { color: exact }] : { color: exact },
                                    })
                                }
                                const split = colorizeStringWithNames(children, nameEntries, el.type)
                                if (split) {
                                    return React.cloneElement(el, undefined, split)
                                }
                            } else if (Array.isArray(children)) {
                                let changed = false
                                const nextChildren = children.map((part, idx) => {
                                    if (typeof part !== 'string') return part
                                    const exact = nameMap.get(part.trim())
                                    if (exact) {
                                        changed = true
                                        return React.createElement(
                                            el.type,
                                            { key: `rce-arr-${idx}`, style: { color: exact } },
                                            part,
                                        )
                                    }
                                    const split = colorizeStringWithNames(part, nameEntries, el.type)
                                    if (split) {
                                        changed = true
                                        return split
                                    }
                                    return part
                                })
                                if (changed) {
                                    return React.cloneElement(el, undefined, ...nextChildren)
                                }
                            }
                            return el
                        },
                        6,
                    )
                }),
            )
        }),
    )
}