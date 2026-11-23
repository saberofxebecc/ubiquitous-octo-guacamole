import type { ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
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
    cleanup: (...fns: (() => void)[]) => void,
) {
    // 1. Hydrate user & role mention AST nodes (5980)
    cleanup(
        getModules(withProps('hydrateUserMention', 'hydrateRoleMention'), (mod: any) => {
            cleanup(
                after(mod, 'hydrateUserMention', (result: any) => {
                    const settings = getSettings()
                    if (!settings.chatMentions || !result || typeof result !== 'object') return result
                    if (!settings.gradients && result.roleColors) result.roleColors = null
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
                        if (settings.gradients) {
                            result.roleColors = result.roleColors ?? data.colorInts
                        }
                    }
                    return result
                }),
                after(mod, 'hydrateRoleMention', (result: any) => {
                    const settings = getSettings()
                    if (!settings.chatMentions || !result || typeof result !== 'object') return result
                    if (!settings.gradients && result.roleColors) result.roleColors = null
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
                        if (settings.gradients) {
                            result.roleColors = result.roleColors ?? data.colorInts
                        }
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

                    const guildOrChannel =
                        node.guildId ?? state?.guildId ?? node.channelId ?? state?.channelId
                    const data = node.roleId
                        ? getRoleColorData(guildOrChannel, node.roleId, settings.skipNeutralColors)
                        : getMemberColorData(
                            node.userId ?? node.id,
                            guildOrChannel,
                            settings.skipNeutralColors,
                        )

                    if (data) {
                        node.colorString = data.colorString
                        if (settings.gradients) node.roleColors = data.colorInts
                    }
                    return args
                }),
            )
        }),
    )

    // 3. @ Mention Autocomplete Popup rows (13240.default.User & .Role)
    cleanup(
        getModules(
            withProps('AUTOCOMPLETE_STICKER_NODE_SIZE', 'AUTOCOMPLETE_STICKER_NODE_MARGIN'),
            (mod: any) => {
                const renderers = mod?.default
                if (!renderers || typeof renderers !== 'object') return

                const transformUserRow = (tree: ReactNode, props: any): ReactNode => {
                    const settings = getSettings()
                    if (!settings.mentionAutocomplete || !tree) return tree

                    const guildId =
                        props?.guildId ??
                        props?.channel?.guild_id ??
                        getGuildId(props?.channelId ?? getSelectedChannelStore()?.getChannelId?.())
                    const userId = props?.user?.id ?? props?.id ?? props?.userId
                    const data = guildId
                        ? getMemberColorData(userId, guildId, settings.skipNeutralColors, props?.member)
                        : null

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
                    if (!settings.mentionAutocomplete || !tree) return tree

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

                    return data ? colorAutocompleteTree(tree, data) : tree
                }

                if (typeof renderers.User === 'function') {
                    const origUser = renderers.User
                    cleanup(
                        beforeJSX(origUser, ([elType, props, key]: [any, any, any?]) => {
                            if (!getSettings().mentionAutocomplete) return [elType, props, key]
                            const Wrapped = wrapComponent(origUser, transformUserRow)
                            return Wrapped ? [Wrapped, props, key] : [elType, props, key]
                        }),
                    )
                }

                if (typeof renderers.Role === 'function') {
                    const origRole = renderers.Role
                    cleanup(
                        beforeJSX(origRole, ([elType, props, key]: [any, any, any?]) => {
                            if (!getSettings().mentionAutocomplete) return [elType, props, key]
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