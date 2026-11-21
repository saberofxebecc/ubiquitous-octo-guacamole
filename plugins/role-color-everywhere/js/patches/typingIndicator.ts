import { type ReactElement, type ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, HookPriority } from '@valenced/patcher'
import type { RoleColorSettings } from '../types'
import { getMemberColorData } from '../utils/colors'
import { canRenderGradients, renderColoredText } from '../utils/gradient'

function extractFlatText(
    node: ReactElement<any>,
    outerVariant?: any,
    outerStyle?: any,
): ReactElement<any> {
    const props = node.props ?? {}
    const inner = props.children

    if (React.isValidElement(inner)) {
        const innerProps: any = inner.props ?? {}
        if (
            typeof innerProps.children === 'string' ||
            (Array.isArray(innerProps.children) &&
                innerProps.children.every((c: any) => typeof c === 'string'))
        ) {
            return React.createElement(
                Design?.Text ?? node.type,
                {
                    ...props,
                    variant: innerProps.variant ?? props.variant ?? outerVariant,
                    style: [outerStyle, props.style, innerProps.style],
                },
                innerProps.children,
            )
        }
    }

    return React.cloneElement(node, {
        variant: props.variant ?? outerVariant,
        style: outerStyle ? [outerStyle, props.style] : props.style,
    })
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

function colorNativeTypingTree(
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
            const patched = colorNativeTypingTree(child, guildId, typingUserIds, skipNeutral, depth + 1)
            if (patched !== child) changed = true
            return patched
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node
    const props: any = node.props

    if (node.type === Design?.Text && Array.isArray(props?.children)) {
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
                const flat = extractFlatText(child as ReactElement<any>, props.variant, props.style)
                return renderColoredText(flat, data, `rce-ti-${idx}`)
            }

            return React.cloneElement(child as ReactElement<any>, {
                style: [(child as ReactElement<any>).props?.style, { color: data.colorString }],
            })
        })

        if (changed) {
            return liftGradientRowIfNeeded(node as ReactElement<any>, mappedChildren, hasGradient)
        }
    }

    const oldChildren = props?.children
    const newChildren = colorNativeTypingTree(oldChildren, guildId, typingUserIds, skipNeutral, depth + 1)
    return newChildren === oldChildren
        ? node
        : React.cloneElement(node as ReactElement<any>, { children: newChildren })
}

function isBtiTypingUserElement(node: any): boolean {
    if (!React.isValidElement(node)) return false
    const props: any = node.props ?? {}
    return (
        props.user?.id != null &&
        props.channel != null &&
        typeof props.renderName === 'function' &&
        props.settings != null
    )
}

function patchBtiRenderedParts(
    node: any,
    skipNeutral: boolean,
    depth = 0,
): any {
    if (depth > 8 || node == null) return node

    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const patched = patchBtiRenderedParts(child, skipNeutral, depth + 1)
            if (patched !== child) changed = true
            return patched
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node

    if (isBtiTypingUserElement(node)) {
        const props: any = node.props
        const guildId = props.channel?.guild_id ?? props.channel?.guildId
        const userId = props.user?.id
        const origRenderName = props.renderName as (name: string | undefined) => ReactNode

        if (!guildId || !userId || (origRenderName as any).__rceWrapped) return node

        const data = getMemberColorData(String(userId), String(guildId), skipNeutral)
        if (!data) return node

        const wrappedRenderName = (name: string | undefined) => {
            const rendered = origRenderName(name)
            if (!React.isValidElement(rendered)) return rendered

            const flat = extractFlatText(rendered as ReactElement<any>)
            return renderColoredText(flat, data, rendered.key != null ? String(rendered.key) : undefined)
        }
            ; (wrappedRenderName as any).__rceWrapped = true

        return React.cloneElement(node as ReactElement<any>, { renderName: wrappedRenderName })
    }

    const oldChildren = (node.props as any)?.children
    const newChildren = patchBtiRenderedParts(oldChildren, skipNeutral, depth + 1)
    return newChildren === oldChildren
        ? node
        : React.cloneElement(node as ReactElement<any>, { children: newChildren })
}

const btiTypingTextWrappers = new WeakMap<(...args: any[]) => any, (props: any) => any>()
const btiCustomWrappers = new WeakMap<(...args: any[]) => any, (props: any) => any>()

function wrapBetterTypingElements(
    node: any,
    getSettings: () => RoleColorSettings,
    depth = 0,
): any {
    if (depth > 16 || node == null) return node

    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const patched = wrapBetterTypingElements(child, getSettings, depth + 1)
            if (patched !== child) changed = true
            return patched
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node
    const props: any = node.props ?? {}

    // BTI's <TypingText text={...} channel={...} typingUserIds={...} />
    if (
        typeof node.type === 'function' &&
        React.isValidElement(props.text) &&
        Array.isArray(props.typingUserIds) &&
        props.channel
    ) {
        const OriginalTypingText = node.type as (...a: any[]) => any
        let Wrapped = btiTypingTextWrappers.get(OriginalTypingText)
        if (!Wrapped) {
            Wrapped = function RceBtiTypingTextWrapper(ttProps: any) {
                const res = OriginalTypingText(ttProps)
                const settings = getSettings()
                if (!settings.typingIndicator || !res) return res
                return patchBtiRenderedParts(res, settings.skipNeutralColors)
            }
            btiTypingTextWrappers.set(OriginalTypingText, Wrapped)
        }
        return React.createElement(Wrapped, { ...props, key: node.key ?? undefined })
    }

    // BTI's wrapped <CustomTypingIndicator config={...} username="..." />
    if (typeof node.type === 'function' && 'config' in props && typeof props.username === 'string') {
        const OriginalCustom = node.type as (...a: any[]) => any
        let Wrapped = btiCustomWrappers.get(OriginalCustom)
        if (!Wrapped) {
            Wrapped = function RceCustomTypingWrapper(cProps: any) {
                const res = OriginalCustom(cProps)
                const settings = getSettings()
                if (!settings.typingIndicator || !res) return res
                return wrapBetterTypingElements(res, getSettings, 0)
            }
            btiCustomWrappers.set(OriginalCustom, Wrapped)
        }
        return React.createElement(Wrapped, { ...props, key: node.key ?? undefined })
    }

    const oldChildren = props.children
    const newChildren = wrapBetterTypingElements(oldChildren, getSettings, depth + 1)
    return newChildren === oldChildren
        ? node
        : React.cloneElement(node as ReactElement<any>, { children: newChildren })
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

        // First wrap BTI's <TypingText> / <CustomTypingIndicator> if BTI is active,
        // then handle Discord's native <Design.Text> tree when BTI is disabled.
        const btiPatched = wrapBetterTypingElements(result, getSettings)
        return colorNativeTypingTree(
            btiPatched,
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
                    after(
                        target.parent,
                        target.key,
                        (tree: any) => {
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
                        },
                        { priority: HookPriority.LOWEST },
                    ),
                )
            },
            { max: 1 },
        ),
    )
}