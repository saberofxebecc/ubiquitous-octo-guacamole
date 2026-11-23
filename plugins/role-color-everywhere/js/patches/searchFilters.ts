import type { Context, ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import type { ColorData, RoleColorSettings } from '../types'
import { getColorsFromMember, getGuildId } from '../utils/colors'
import { canRenderGradients, paintFirstDesignText, renderColoredText } from '../utils/gradient'
import { componentName, replaceElement, transformComponent, wrapComponent } from '../utils/react'
import {
    getGuildMemberRequesterStore,
    getGuildMemberStore,
    getSelectedGuildStore,
} from '../utils/stores'

interface AutocompleteScreenProps {
    guildId?: string
    channelId?: string
    searchContext?: {
        type?: string
        guildId?: string
        channelId?: string
    }
}

interface GuildChannelMemberRowProps {
    user?: { id?: string } | null
    userId?: string
    id?: string
    guildId?: string
    member?: any
}

let SearchGuildContext: Context<string | undefined> | null = null

function getSearchGuildContext() {
    return (SearchGuildContext ??= React.createContext<string | undefined>(undefined))
}

const noopSubscribe = () => () => { }

function subscribeToMembers(callback: () => void) {
    const store = getGuildMemberStore()
    store?.addChangeListener?.(callback)
    return () => {
        store?.removeChangeListener?.(callback)
    }
}

function colorSearchLabel(label: ReactNode, data: ColorData): ReactNode {
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
        return paintFirstDesignText(label, data)
    }

    return label
}

function paintSearchUserTree(tree: ReactNode, data: ColorData): { node: ReactNode; hit: boolean } {
    let matchedTableRow = false
    const withTableRow = replaceElement(
        tree,
        el => el.props != null && 'label' in el.props,
        el => {
            matchedTableRow = true
            return React.cloneElement(el, {
                label: colorSearchLabel(el.props.label, data),
            })
        },
    )
    if (matchedTableRow) return { node: withTableRow, hit: true }

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

let searchDebugFn: ((msg: string, data?: unknown) => void) | null = null
let loggedUserRowRender = false

const applySearchUserColor = (rendered: ReactNode, props: any): ReactNode => {
    const colorData: ColorData | undefined = props?.__rceColor
    if (!colorData || !rendered) return rendered

    const { node, hit } = paintSearchUserTree(rendered, colorData)
    if (!hit && !loggedUserRowRender && searchDebugFn) {
        loggedUserRowRender = true
        const rt: any = React.isValidElement(rendered) ? rendered.type : undefined
        searchDebugFn('Search UserRow miss', {
            renderedType: rt
                ? rt.displayName || rt.name || rt.type?.name || typeof rt
                : typeof rendered,
            renderedProps: React.isValidElement(rendered)
                ? Object.keys((rendered.props as any) ?? {})
                : undefined,
        })
    }
    return node
}

export function patchSearchFilters(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
    reportError?: (e: unknown) => void,
) {
    searchDebugFn = (msg, data) => {
        if (getSettings().debugLogs) logDebug(msg, data)
    }

    const enabled = () => getSettings().searchFilters
    const onError = reportError ?? (e => logDebug('SearchFilters error', String(e)))
    let loggedRow = false

    cleanup(
        transformComponent<AutocompleteScreenProps>(
            'AutocompleteScreen',
            enabled,
            (tree, props) => {
                const sc = props?.searchContext
                const guildId =
                    props?.guildId ??
                    sc?.guildId ??
                    getGuildId(props?.channelId ?? sc?.channelId) ??
                    (sc?.type === 'GUILD' ? getSelectedGuildStore()?.getGuildId?.() ?? undefined : undefined)

                if (!guildId) return tree

                return React.createElement(
                    getSearchGuildContext().Provider as any,
                    { value: guildId },
                    tree,
                )
            },
            onError,
        ),
        transformComponent<GuildChannelMemberRowProps>(
            'GuildChannelMemberRow',
            enabled,
            (tree, props) => {
                const ctxGuildId = React.useContext(getSearchGuildContext())
                const guildId = props?.guildId ?? ctxGuildId
                const userId = props?.user?.id ?? props?.userId ?? props?.id

                const member = React.useSyncExternalStore(
                    guildId && userId ? subscribeToMembers : noopSubscribe,
                    () =>
                        guildId && userId
                            ? getGuildMemberStore()?.getMember?.(guildId, userId)
                            : undefined,
                )

                React.useEffect(() => {
                    if (guildId && userId && !member) {
                        getGuildMemberRequesterStore()?.requestMember?.(guildId, userId)
                    }
                }, [guildId, userId, member])

                if (!guildId || !userId) return tree

                const resolvedMember = member ?? props?.member
                const data = getColorsFromMember(
                    guildId,
                    resolvedMember,
                    getSettings().skipNeutralColors,
                )

                if (!loggedRow && searchDebugFn) {
                    loggedRow = true
                    const tt: any = React.isValidElement(tree) ? tree.type : undefined
                    searchDebugFn('GuildChannelMemberRow sample', {
                        guildId,
                        userId,
                        hasMember: Boolean(resolvedMember),
                        hasColor: Boolean(data),
                        childType: tt ? componentName(tt) ?? typeof tt : typeof tree,
                    })
                }

                if (!data) return tree

                let wrappedUserRow = false
                const withUserRow = replaceElement(
                    tree,
                    el => componentName(el.type) === 'UserRow',
                    el => {
                        const Wrapped = wrapComponent(el.type, applySearchUserColor)
                        if (!Wrapped) return el
                        wrappedUserRow = true
                        return React.createElement(Wrapped, {
                            ...(el.props as object),
                            __rceColor: data,
                            key: el.key ?? undefined,
                        })
                    },
                )
                if (wrappedUserRow) return withUserRow

                return paintSearchUserTree(tree, data).node
            },
            onError,
        ),
    )
}