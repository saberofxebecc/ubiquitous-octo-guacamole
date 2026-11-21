import { type ReactElement, type ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import type { ColorData, RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { canRenderGradients, renderColoredText } from '../utils/gradient'
import { getGuildMemberStore } from '../utils/stores'

function isTypingTextContainer(node: any): boolean {
    if (!React.isValidElement(node)) return false
    const props: any = node.props
    if (!Array.isArray(props?.children)) return false
    return node.type === Design?.Text || typeof props?.variant === 'string'
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
    if (isTypingTextContainer(node)) {
        let userIndex = 0
        let changed = false
        let hasGradient = false

        const mappedChildren = props.children.map((child: any, idx: number) => {
            if (!React.isValidElement(child)) return child

            const userId = typingUserIds[userIndex++]
            if (!userId) return child

            const data = getMemberColorData(userId, guildId, skipNeutral)
            if (!data) return child

            changed = true
            if (data.isGradient && canRenderGradients()) {
                hasGradient = true
            }
            return renderColoredText(child as ReactElement<any>, data, `rce-ti-${idx}`)
        })

        if (!changed) return node

        // Gradient MaskedView cannot live inside React Native <Text> on Android;
        // lift the line into a horizontal row <View> so gradients render cleanly.
        if (hasGradient && ReactNative?.View) {
            const baseStyle = props.style
            const baseVariant = props.variant
            const rowChildren = mappedChildren.map((child: any, idx: number) => {
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

        return React.cloneElement(node as ReactElement<any>, { children: mappedChildren })
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

const btiWrappers = new WeakMap<object, Map<string, any>>()
const BTI_CTX_PROP = '__rceTypingCtx'

function wrapBetterTypingTree(
    node: any,
    skipNeutral: boolean,
    depth = 0,
    typingCtx?: { channel: any; typingUserIds: string[]; username?: string },
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
        return newChildren === oldChildren ? node : React.cloneElement(node as ReactElement<any>, { children: newChildren })
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
                    const uid = findBtiUserId(String(guildId), cleanProps.username, ids)
                    const data = uid ? getMemberColorData(uid, String(guildId), skipNeutral) : null
                    return data ? colorDesignTextNodes(res, data) : res
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
    return newChildren === oldChildren ? node : React.cloneElement(node as ReactElement<any>, { children: newChildren })
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
            logDebug('TypingIndicator row rendered', {
                guildId: String(guildId),
                typingUserIds,
                canGradient: canRenderGradients(),
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