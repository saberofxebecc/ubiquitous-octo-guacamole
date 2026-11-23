import type { ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before, instead } from '@valenced/patcher'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import type { ColorData, RoleColorSettings } from '../types'
import {
    getColorsFromRole,
    getGuildId,
    getMemberColorData,
    getRoleColorData,
    hexToInt,
} from '../utils/colors'
import { canRenderGradients, paintFirstDesignText, renderColoredText } from '../utils/gradient'
import { replaceElement, wrapComponent } from '../utils/react'
import { getChannelStore, getSelectedChannelStore } from '../utils/stores'
import { getAutocompleteGuildContext } from './reactorsList'

let loggedLabelRender = false
let labelDebugFn: ((msg: string, data?: unknown) => void) | null = null

function paintFirstTextAny(tree: ReactNode, data: ColorData): { node: ReactNode; hit: boolean } {
    let hitDesign = false
    replaceElement(
        tree,
        el => el.type === Design?.Text,
        el => {
            hitDesign = true
            return el
        },
    )
    if (hitDesign) return { node: paintFirstDesignText(tree, data), hit: true }

    const RNText = ReactNative?.Text
    if (!RNText) return { node: tree, hit: false }

    let hitRN = false
    const rnNode = replaceElement(
        tree,
        el => el.type === RNText,
        el => {
            hitRN = true
            return data.isGradient && canRenderGradients()
                ? renderColoredText(el, data, el.key != null ? String(el.key) : undefined, true)
                : React.cloneElement(el, { style: [el.props?.style, { color: data.colorString }] })
        },
    )
    return { node: rnNode, hit: hitRN }
}

const applyRceLabelColor = (rendered: ReactNode, props: any): ReactNode => {
    const colorData: ColorData | undefined = props?.__rceColor
    if (!colorData || !rendered) return rendered

    const { node, hit } = paintFirstTextAny(rendered, colorData)
    if (hit) return node

    const depth = Number(props?.__rceDepth ?? 0)
    if (depth < 3 && React.isValidElement(rendered)) {
        const Wrapped = wrapComponent(rendered.type, applyRceLabelColor)
        if (Wrapped) {
            return React.createElement(Wrapped, {
                ...(rendered.props as object),
                __rceColor: colorData,
                __rceDepth: depth + 1,
                key: rendered.key ?? undefined,
            })
        }
    }

    if (!loggedLabelRender && labelDebugFn) {
        loggedLabelRender = true
        const rType: any = React.isValidElement(rendered) ? rendered.type : undefined
        labelDebugFn('AutocompleteLabel fallback miss', {
            depth,
            renderedType: rType
                ? rType.displayName || rType.name || rType.type?.name || typeof rType
                : typeof rendered,
        })
    }
    return rendered
}

function colorRowLabel(label: ReactNode, data: ColorData): ReactNode {
    if (typeof label === 'string') {
        if (data.isGradient && canRenderGradients() && Design?.Text && ReactNative?.View) {
            const textEl = React.createElement(
                Design.Text,
                { variant: 'text-md/semibold', numberOfLines: 1 },
                label,
            )
            return React.createElement(
                ReactNative.View,
                { style: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 } },
                renderColoredText(textEl, data, undefined, true),
            )
        }
        if (Design?.Text && ReactNative?.Text) {
            return React.createElement(
                Design.Text,
                { variant: 'text-md/semibold', numberOfLines: 1 },
                React.createElement(ReactNative.Text, { style: { color: data.colorString } }, label),
            )
        }
        return label
    }

    if (React.isValidElement(label)) {
        let matched = false
        const painted = replaceElement(
            label,
            el => el.type === Design?.Text,
            () => {
                matched = true
                return label
            },
        )
        if (matched) return paintFirstDesignText(painted, data)

        const Wrapped = wrapComponent(label.type, applyRceLabelColor)
        if (Wrapped) {
            return React.createElement(Wrapped, {
                ...(label.props as object),
                __rceColor: data,
                key: label.key ?? undefined,
            })
        }
        if (labelDebugFn) {
            const lt: any = label.type
            labelDebugFn('AutocompleteLabel unwrap failed', {
                typeofLt: typeof lt,
                keys: lt && typeof lt === 'object' ? Object.keys(lt) : undefined,
            })
        }
    }
    return label
}

function colorAutocompleteTree(tree: ReactNode, data: ColorData): ReactNode {
    let matchedTableRow = false
    const withTableRow = replaceElement(
        tree,
        el => el.props != null && 'label' in el.props,
        el => {
            matchedTableRow = true
            return React.cloneElement(el, {
                label: colorRowLabel(el.props.label, data),
            })
        },
    )
    if (matchedTableRow) return withTableRow
    return paintFirstDesignText(tree, data)
}

export function patchMentions(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    labelDebugFn = (msg, data) => {
        if (getSettings().debugLogs) logDebug(msg, data)
    }
    // 1. Hydrate user & role mention AST nodes (5980)
    cleanup(
        getModules(withProps('hydrateUserMention', 'hydrateRoleMention'), (mod: any) => {
            cleanup(
                after(mod, 'hydrateUserMention', (result: any) => {
                    const settings = getSettings()
                    if (!settings.chatMentions || !result || typeof result !== 'object') return result
                    if (result.colorString && result.roleColors) return result

                    const userId = result.userId ?? result.parsedUserId ?? result.id
                    const channelId = result.channelId
                    const guildOrChannel =
                        result.guildId ??
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined) ??
                        channelId

                    const data = getMemberColorData(userId, guildOrChannel, settings.skipNeutralColors)
                    if (data) {
                        const bgInt = hexToInt(data.colorString, 0x1a)
                        result.colorString = result.colorString ?? data.colorString
                        if (bgInt !== undefined) {
                            result.color = result.color ?? bgInt
                            result.roleColor = result.roleColor ?? bgInt
                        }
                        result.roleColors = result.roleColors ?? data.colorInts
                    }
                    return result
                }),
                after(mod, 'hydrateRoleMention', (result: any) => {
                    const settings = getSettings()
                    if (!settings.chatMentions || !result || typeof result !== 'object') return result
                    if (result.colorString && result.roleColors) return result

                    const roleId = result.roleId ?? result.id
                    const channelId = result.channelId
                    const guildId =
                        result.guildId ??
                        (channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined)

                    const data = getRoleColorData(guildId, roleId, settings.skipNeutralColors)
                    if (data) {
                        const bgInt = hexToInt(data.colorString, 0x1a)
                        result.colorString = result.colorString ?? data.colorString
                        if (bgInt !== undefined) {
                            result.color = result.color ?? bgInt
                            result.roleColor = result.roleColor ?? bgInt
                        }
                        result.roleColors = result.roleColors ?? data.colorInts
                    }
                    return result
                }),
            )
        }),
    )

    // 2. Plain mention renderer in MarkupText (5704)
    cleanup(
        getModules(withProps('MarkupText', 'plainMentionRenderer'), (mod: any) => {
            cleanup(
                before(mod, 'plainMentionRenderer', (args: any[]) => {
                    const settings = getSettings()
                    if (!settings.chatMentions) return args
                    const [node, , state] = args
                    if (!node || node.colorString) return args

                    const guildOrChannel = node.guildId ?? state?.guildId ?? node.channelId ?? state?.channelId
                    const data = node.roleId
                        ? getRoleColorData(guildOrChannel, node.roleId, settings.skipNeutralColors)
                        : getMemberColorData(node.userId ?? node.id, guildOrChannel, settings.skipNeutralColors)

                    if (data) {
                        node.colorString = data.colorString
                        node.roleColors = data.colorInts
                    }
                    return args
                }),
            )
        }),
    )

    // 3. Chat Input Box highlight nodes (13048)
    cleanup(
        getModules(withProps('getUsernameHighlightNodes', 'getRoleHighlightNodes'), (mod: any) => {
            let loggedUserHL = false
            let loggedRoleHL = false

            cleanup(
                instead(mod, 'getUsernameHighlightNodes', (args: any[], orig: (...a: any[]) => any) => {
                    const result = orig(...args)
                    const settings = getSettings()
                    if (!settings.chatInputAndAutocomplete || !Array.isArray(result)) return result

                    if (settings.debugLogs && !loggedUserHL && result.length > 0) {
                        loggedUserHL = true
                        logDebug('getUsernameHighlightNodes sample', {
                            argTypes: args.map(a => (a && typeof a === 'object' ? Object.keys(a).slice(0, 8) : typeof a)),
                            firstNode: result[0],
                        })
                    }

                    const channelId = getSelectedChannelStore()?.getChannelId?.()
                    const guildId = channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined
                    if (!guildId) return result

                    for (const node of result) {
                        if (!node || typeof node !== 'object') continue
                        const uid = node.userId ?? node.id ?? node.data?.userId ?? node.data?.id
                        const data = getMemberColorData(uid, guildId, settings.skipNeutralColors)
                        if (data) {
                            if (node.style && typeof node.style === 'object') {
                                node.style.color = data.colorString
                            } else {
                                node.color = data.colorString
                            }
                        }
                    }
                    return result
                }),
                instead(mod, 'getRoleHighlightNodes', (args: any[], orig: (...a: any[]) => any) => {
                    const result = orig(...args)
                    const settings = getSettings()
                    if (!settings.chatInputAndAutocomplete || !Array.isArray(result)) return result

                    if (settings.debugLogs && !loggedRoleHL && result.length > 0) {
                        loggedRoleHL = true
                        logDebug('getRoleHighlightNodes sample', { firstNode: result[0] })
                    }

                    const channelId = getSelectedChannelStore()?.getChannelId?.()
                    const guildId = channelId ? getChannelStore()?.getChannel?.(channelId)?.guild_id : undefined
                    if (!guildId) return result

                    for (const node of result) {
                        if (!node || typeof node !== 'object') continue
                        const rid = node.roleId ?? node.id ?? node.data?.roleId ?? node.data?.id
                        const data = getRoleColorData(guildId, rid, settings.skipNeutralColors)
                        if (data) {
                            if (node.style && typeof node.style === 'object') {
                                node.style.color = data.colorString
                            } else {
                                node.color = data.colorString
                            }
                        }
                    }
                    return result
                }),
            )
        }),
    )

    // 4. @ Mention Autocomplete Popup rows (13240.default.User & .Role)
    cleanup(
        getModules(
            withProps('AUTOCOMPLETE_STICKER_NODE_SIZE', 'AUTOCOMPLETE_STICKER_NODE_MARGIN'),
            (mod: any) => {
                const renderers = mod?.default
                if (!renderers || typeof renderers !== 'object') return

                let loggedUser = false
                let loggedRole = false

                const transformUserRow = (tree: ReactNode, props: any): ReactNode => {
                    const settings = getSettings()
                    if (!settings.chatInputAndAutocomplete || !tree) return tree

                    const guildId =
                        props?.guildId ??
                        props?.channel?.guild_id ??
                        getGuildId(props?.channelId ?? getSelectedChannelStore()?.getChannelId?.())
                    const userId = props?.user?.id ?? props?.id ?? props?.userId
                    const data = guildId
                        ? getMemberColorData(userId, guildId, settings.skipNeutralColors, props?.member)
                        : null

                    if (settings.debugLogs && !loggedUser) {
                        loggedUser = true
                        const label = React.isValidElement(tree) ? (tree.props as any)?.label : undefined
                        const lt: any = React.isValidElement(label) ? label.type : undefined
                        logDebug('Autocomplete User row', {
                            guildId,
                            userId,
                            hasColor: Boolean(data),
                            labelType: lt ? (lt.displayName || lt.name || lt.type?.name || typeof lt) : typeof label,
                            labelProps: React.isValidElement(label) ? Object.keys((label.props as any) ?? {}) : undefined,
                        })
                    }

                    const colored = data ? colorAutocompleteTree(tree, data) : tree
                    return guildId
                        ? React.createElement(
                            getAutocompleteGuildContext().Provider as any,
                            { value: guildId },
                            colored,
                        )
                        : colored
                }

                const transformRoleRow = (tree: ReactNode, props: any): ReactNode => {
                    const settings = getSettings()
                    if (!settings.chatInputAndAutocomplete || !tree) return tree

                    const guildId =
                        props?.guildId ??
                        props?.channel?.guild_id ??
                        getGuildId(props?.channelId ?? getSelectedChannelStore()?.getChannelId?.())
                    const roleObj = props?.role ?? props
                    const data =
                        getColorsFromRole(guildId, roleObj, settings.skipNeutralColors) ??
                        (guildId && roleObj?.id
                            ? getRoleColorData(guildId, roleObj.id, settings.skipNeutralColors)
                            : null)

                    if (settings.debugLogs && !loggedRole) {
                        loggedRole = true
                        logDebug('Autocomplete Role row', {
                            propKeys: props ? Object.keys(props) : [],
                            guildId,
                            hasColor: Boolean(data),
                        })
                    }

                    return data ? colorAutocompleteTree(tree, data) : tree
                }

                if (typeof renderers.User === 'function') {
                    const origUser = renderers.User
                    cleanup(
                        beforeJSX(origUser, ([elType, props, key]: [any, any, any?]) => {
                            if (!getSettings().chatInputAndAutocomplete) return [elType, props, key]
                            const Wrapped = wrapComponent(origUser, transformUserRow)
                            return Wrapped ? [Wrapped, props, key] : [elType, props, key]
                        }),
                    )
                }

                if (typeof renderers.Role === 'function') {
                    const origRole = renderers.Role
                    cleanup(
                        beforeJSX(origRole, ([elType, props, key]: [any, any, any?]) => {
                            if (!getSettings().chatInputAndAutocomplete) return [elType, props, key]
                            const Wrapped = wrapComponent(origRole, transformRoleRow)
                            return Wrapped ? [Wrapped, props, key] : [elType, props, key]
                        }),
                    )
                }
            },
            { max: 1 },
        ),
    )
}