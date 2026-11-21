import { type ReactElement, type ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import type { ColorData, RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { canRenderGradients, renderColoredText } from '../utils/gradient'
import { getGuildMemberStore, getUserStore } from '../utils/stores'

function buildNameEntries(
    guildId: string,
    typingUserIds: string[],
    skipNeutral: boolean,
): [string, ColorData][] {
    const map = new Map<string, ColorData>()
    const memberStore = getGuildMemberStore()
    const userStore = getUserStore()

    for (const uid of typingUserIds) {
        const data = getMemberColorData(uid, guildId, skipNeutral)
        if (!data) continue
        const member = memberStore?.getMember?.(guildId, uid)
        const user = userStore?.getUser?.(uid)
        const names = [
            member?.nick,
            member?.nickname,
            member?.displayName,
            user?.globalName,
            user?.username,
        ]
        for (const n of names) {
            if (typeof n === 'string' && n.length > 0 && !map.has(n)) {
                map.set(n, data)
            }
        }
    }

    return [...map.entries()].sort((a, b) => b[0].length - a[0].length)
}

function splitStringWithColoredNames(
    text: string,
    entries: [string, ColorData][],
    TextComp: any,
    baseStyle: any,
    baseVariant: any,
): { nodes: ReactNode[]; hasGradient: boolean } | null {
    const matches: { index: number; len: number; name: string; data: ColorData }[] = []
    for (const [name, data] of entries) {
        let pos = 0
        while (pos < text.length) {
            const idx = text.indexOf(name, pos)
            if (idx === -1) break
            matches.push({ index: idx, len: name.length, name, data })
            pos = idx + name.length
        }
    }
    if (matches.length === 0) return null

    matches.sort((a, b) => a.index - b.index || b.len - a.len)

    const out: ReactNode[] = []
    let cursor = 0
    let hasGradient = false

    for (const m of matches) {
        if (m.index < cursor) continue
        if (m.index > cursor) {
            out.push(text.slice(cursor, m.index))
        }
        const nameEl = React.createElement(
            TextComp,
            { key: `rce-n-${m.index}`, variant: baseVariant, style: baseStyle },
            m.name,
        )
        if (m.data.isGradient && canRenderGradients()) hasGradient = true
        out.push(renderColoredText(nameEl, m.data, `rce-cn-${m.index}`))
        cursor = m.index + m.len
    }
    if (cursor < text.length) {
        out.push(text.slice(cursor))
    }

    return { nodes: out, hasGradient }
}

function liftGradientRowIfNeeded(
    node: ReactElement<any>,
    children: any[],
    hasGradient: boolean,
): ReactNode {
    if (!hasGradient || !ReactNative?.View) {
        return React.cloneElement(node, { children })
    }

    const baseStyle = node.props?.style
    const baseVariant = node.props?.variant
    const rowChildren = children.map((child: any, idx: number) => {
        if (typeof child === 'string' || typeof child === 'number') {
            return React.createElement(
                Design?.Text ?? node.type,
                { key: `rce-ts-${idx}`, variant: baseVariant, style: baseStyle },
                child,
            )
        }
        return child
    })

    return React.createElement(
        ReactNative.View,
        {
            style: {
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                flexShrink: 1,
            },
        },
        ...rowChildren,
    )
}

function colorTypingTextTree(
    node: any,
    guildId: string,
    typingUserIds: string[],
    skipNeutral: boolean,
    depth = 0,
): any {
    if (depth > 16 || node == null) return node

    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const patched = colorTypingTextTree(child, guildId, typingUserIds, skipNeutral, depth + 1)
            if (patched !== child) changed = true
            return patched
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node
    const props: any = node.props

    // Strictly match Discord's Design.Text (never hijack outer layout containers)
    if (node.type === Design?.Text) {
        if (Array.isArray(props?.children)) {
            const hasElementChild = props.children.some((c: any) => React.isValidElement(c))

            if (hasElementChild) {
                let userIndex = 0
                let changed = false
                let hasGradient = false

                const mappedChildren = props.children.map((child: any) => {
                    if (!React.isValidElement(child)) return child

                    const userId = typingUserIds[userIndex++]
                    if (!userId) return child

                    const data = getMemberColorData(userId, guildId, skipNeutral)
                    if (!data) return child

                    changed = true
                    if (data.isGradient && canRenderGradients()) hasGradient = true
                    return renderColoredText(child as ReactElement<any>, data)
                })

                if (changed) {
                    return liftGradientRowIfNeeded(
                        node as ReactElement<any>,
                        mappedChildren,
                        hasGradient,
                    )
                }
            } else {
                const entries = buildNameEntries(guildId, typingUserIds, skipNeutral)
                if (entries.length > 0) {
                    let changed = false
                    let hasGradient = false
                    const out: any[] = []
                    for (const part of props.children) {
                        if (typeof part === 'string') {
                            const split = splitStringWithColoredNames(
                                part,
                                entries,
                                Design.Text,
                                props.style,
                                props.variant,
                            )
                            if (split) {
                                changed = true
                                if (split.hasGradient) hasGradient = true
                                out.push(...split.nodes)
                                continue
                            }
                        }
                        out.push(part)
                    }
                    if (changed) {
                        return liftGradientRowIfNeeded(node as ReactElement<any>, out, hasGradient)
                    }
                }
            }
        } else if (typeof props?.children === 'string') {
            const entries = buildNameEntries(guildId, typingUserIds, skipNeutral)
            const split =
                entries.length > 0
                    ? splitStringWithColoredNames(
                        props.children,
                        entries,
                        Design.Text,
                        props.style,
                        props.variant,
                    )
                    : null
            if (split) {
                return liftGradientRowIfNeeded(
                    node as ReactElement<any>,
                    split.nodes,
                    split.hasGradient,
                )
            }
        }
    }

    const oldChildren = props?.children
    const newChildren = colorTypingTextTree(oldChildren, guildId, typingUserIds, skipNeutral, depth + 1)
    return newChildren === oldChildren
        ? node
        : React.cloneElement(node as ReactElement<any>, { children: newChildren })
}

function colorDesignTextNodes(node: any, data: ColorData, depth = 0): any {
    if (depth > 16 || node == null) return node

    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const patched = colorDesignTextNodes(child, data, depth + 1)
            if (patched !== child) changed = true
            return patched
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node

    const props: any = node.props
    if (node.type === Design?.Text && typeof props?.children === 'string') {
        return renderColoredText(node as ReactElement<any>, data)
    }

    const oldChildren = props?.children
    const newChildren = colorDesignTextNodes(oldChildren, data, depth + 1)
    return newChildren === oldChildren
        ? node
        : React.cloneElement(node as ReactElement<any>, { children: newChildren })
}

function findBtiUserId(guildId: string, username: string, typingUserIds: string[]): string | undefined {
    const expected = username.trim().toLocaleLowerCase()
    const memberStore = getGuildMemberStore()
    for (const userId of typingUserIds) {
        const member = memberStore?.getMember?.(guildId, userId)
        const names = [
            member?.nick,
            member?.nickname,
            member?.displayName,
            member?.username,
            member?.user?.globalName,
            member?.user?.displayName,
            member?.user?.username,
        ]
        if (names.some(n => typeof n === 'string' && n.trim().toLocaleLowerCase() === expected)) {
            return userId
        }
    }
    return typingUserIds.length === 1 ? typingUserIds[0] : undefined
}

function colorCustomTypingTextTree(
    node: any,
    guildId: string,
    username: string,
    typingUserIds: string[],
    skipNeutral: boolean,
    depth = 0,
): any {
    if (depth > 16 || node == null) return node

    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const patched = colorCustomTypingTextTree(child, guildId, username, typingUserIds, skipNeutral, depth + 1)
            if (patched !== child) changed = true
            return patched
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node
    const props: any = node.props

    if (node.type === Design?.Text && typeof props?.children === 'string') {
        const idx = props.children.indexOf(username)
        if (idx >= 0) {
            const uid = findBtiUserId(guildId, username, typingUserIds)
            const data = uid ? getMemberColorData(uid, guildId, skipNeutral) : null
            if (data) {
                const split = splitStringWithColoredNames(
                    props.children,
                    [[username, data]],
                    Design.Text,
                    props.style,
                    props.variant,
                )
                if (split) {
                    return liftGradientRowIfNeeded(
                        node as ReactElement<any>,
                        split.nodes,
                        split.hasGradient,
                    )
                }
            }
        }
    }

    const nextChildren = colorCustomTypingTextTree(
        props?.children,
        guildId,
        username,
        typingUserIds,
        skipNeutral,
        depth + 1,
    )
    return nextChildren === props?.children
        ? node
        : React.cloneElement(node as ReactElement<any>, { children: nextChildren })
}

const btiWrappers = new WeakMap<object, Map<string, any>>()
const BTI_CTX_PROP = '__rceTypingCtx'

function wrapBetterTypingTree(
    node: any,
    skipNeutral: boolean,
    depth = 0,
    typingCtx?: { channel: any; typingUserIds: string[] },
): any {
    if (depth > 16 || node == null) return node

    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const patched = wrapBetterTypingTree(child, skipNeutral, depth + 1, typingCtx)
            if (patched !== child) changed = true
            return patched
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node
    const props: any = node.props ?? {}

    if (typeof node.type !== 'function') {
        const oldChildren = props.children
        const newChildren = wrapBetterTypingTree(oldChildren, skipNeutral, depth + 1, typingCtx)
        return newChildren === oldChildren
            ? node
            : React.cloneElement(node as ReactElement<any>, { children: newChildren })
    }

    const isBtiUser =
        props.user?.id != null &&
        props.channel &&
        typeof props.renderName === 'function' &&
        props.settings

    const isCustomTyping = 'config' in props && typeof props.username === 'string'

    if (isBtiUser || isCustomTyping) {
        const Original = node.type as (...a: any[]) => any
        const kind = isBtiUser ? 'user' : 'custom'
        let map = btiWrappers.get(Original)
        if (!map) {
            map = new Map()
            btiWrappers.set(Original, map)
        }
        let Wrapped = map.get(kind)
        if (!Wrapped) {
            if (kind === 'user') {
                Wrapped = function RceBtiUserWrapper(origProps: any) {
                    const res = Original(origProps)
                    const guildId = origProps?.channel?.guild_id ?? origProps?.channel?.guildId
                    const uid = origProps?.user?.id
                    if (!guildId || !uid) return res
                    const data = getMemberColorData(String(uid), String(guildId), skipNeutral)
                    return data ? colorDesignTextNodes(res, data) : res
                }
            } else {
                Wrapped = function RceCustomTypingWrapper(origProps: any) {
                    const ctx = origProps?.[BTI_CTX_PROP]
                    const cleanProps = { ...origProps }
                    delete cleanProps[BTI_CTX_PROP]
                    const res = Original(cleanProps)
                    const channel = cleanProps?.channel ?? ctx?.channel
                    const guildId = channel?.guild_id ?? channel?.guildId
                    const ids: string[] = (cleanProps?.typingUserIds ?? ctx?.typingUserIds ?? []).map(String)
                    if (!guildId || typeof cleanProps?.username !== 'string' || ids.length === 0) return res
                    return colorCustomTypingTextTree(res, String(guildId), cleanProps.username, ids, skipNeutral)
                }
            }
            map.set(kind, Wrapped)
        }

        const extraProps =
            kind === 'custom'
                ? {
                    [BTI_CTX_PROP]: {
                        channel: props.channel ?? typingCtx?.channel,
                        typingUserIds: props.typingUserIds ?? typingCtx?.typingUserIds ?? [],
                    },
                }
                : {}

        return React.createElement(Wrapped, { ...props, ...extraProps, key: node.key ?? undefined })
    }

    const oldChildren = props.children
    const newChildren = wrapBetterTypingTree(oldChildren, skipNeutral, depth + 1, typingCtx)
    return newChildren === oldChildren
        ? node
        : React.cloneElement(node as ReactElement<any>, { children: newChildren })
}

function summarizeTree(node: any, depth = 0, out: any[] = []): any[] {
    if (depth > 8 || node == null || out.length >= 12) return out
    if (Array.isArray(node)) {
        for (const c of node) summarizeTree(c, depth, out)
        return out
    }
    if (!React.isValidElement(node)) return out
    const props: any = node.props ?? {}
    const t: any = node.type
    out.push({
        depth,
        isDesignText: t === Design?.Text,
        type: typeof t === 'string' ? t : t?.displayName || t?.name || typeof t,
        variant: props.variant,
        childType: Array.isArray(props.children)
            ? props.children.map((c: any) => (React.isValidElement(c) ? 'el' : typeof c))
            : typeof props.children,
    })
    summarizeTree(props.children, depth + 1, out)
    return out
}

export function patchTypingIndicator(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    let loggedOnce = false

    function TypingRowWrapper({
        original,
        originalProps,
    }: {
        original: (p: any) => ReactNode
        originalProps: any
    }) {
        const result = original(originalProps)
        const settings = getSettings()
        if (!settings.typingIndicator || !result) return result

        const channel = originalProps?.channel
        const guildId = channel?.guild_id ?? channel?.guildId ?? channel?.getGuildId?.()
        const rawIds = originalProps?.typingUserIds
        if (!guildId || !Array.isArray(rawIds) || rawIds.length === 0) return result

        const typingUserIds = rawIds.map((id: any) => String(id))

        if (settings.debugLogs && !loggedOnce) {
            loggedOnce = true
            const firstColor = getMemberColorData(typingUserIds[0], String(guildId), settings.skipNeutralColors)
            logDebug('TypingIndicator detail', {
                guildId: String(guildId),
                typingUserIds,
                firstColor: firstColor ? { hex: firstColor.colorString, isGradient: firstColor.isGradient } : null,
                tree: summarizeTree(result),
            })
        }

        const btiWrapped = wrapBetterTypingTree(result, settings.skipNeutralColors, 0, {
            channel,
            typingUserIds,
        })

        return colorTypingTextTree(
            btiWrapped,
            String(guildId),
            typingUserIds,
            settings.skipNeutralColors,
        )
    }

    cleanup(
        getModules(
            withProps('hasTypingIndicatorContent', 'useTypingUserIdsForDisplay'),
            (mod: any) => {
                const component = mod?.default
                const target =
                    typeof component?.type === 'function'
                        ? { parent: component, key: 'type' }
                        : typeof component?.render === 'function'
                            ? { parent: component, key: 'render' }
                            : typeof component === 'function'
                                ? { parent: mod, key: 'default' }
                                : null
                if (!target) return

                cleanup(
                    after(target.parent, target.key, (tree: any) => {
                        const renderItem = tree?.props?.renderItem
                        if (typeof renderItem !== 'function') return tree

                        return React.cloneElement(tree, {
                            renderItem: (...args: any[]) => {
                                const item = renderItem(...args)
                                if (!React.isValidElement(item) || typeof item.type !== 'function') {
                                    return item
                                }
                                return React.createElement(TypingRowWrapper, {
                                    key: item.key ?? undefined,
                                    original: item.type as (p: any) => ReactNode,
                                    originalProps: item.props ?? {},
                                })
                            },
                        })
                    }),
                )
            },
            { max: 1 },
        ),
    )
}