import type { Context, ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import type { ColorData, RoleColorSettings } from '../types'
import { getColorsFromMember, getGuildId } from '../utils/colors'
import { canRenderGradients, paintFirstDesignText, renderColoredText } from '../utils/gradient'
import { replaceElement, transformComponent, wrapComponent, wrapListRenderItem } from '../utils/react'
import {
    getGuildMemberRequesterStore,
    getGuildMemberStore,
    getSelectedChannelStore,
} from '../utils/stores'

interface VotersListProps {
    channelId?: string
}

let VotersGuildContext: Context<string | undefined> | null = null

function getVotersGuildContext() {
    return (VotersGuildContext ??= React.createContext<string | undefined>(undefined))
}

const noopSubscribe = () => () => { }

function subscribeToMembers(callback: () => void) {
    const store = getGuildMemberStore()
    store?.addChangeListener?.(callback)
    return () => {
        store?.removeChangeListener?.(callback)
    }
}

function colorTableRowLabel(label: ReactNode, data: ColorData): ReactNode {
    if (typeof label === 'string') {
        if (data.isGradient && canRenderGradients() && Design?.Text) {
            const textEl = React.createElement(
                Design.Text,
                { variant: 'text-md/semibold', numberOfLines: 1 },
                label,
            )
            return renderColoredText(textEl, data, undefined, true)
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

function applyColorToVoterRow(row: ReactNode, data: ColorData): ReactNode {
    let matchedTableRow = false
    const withTableRow = replaceElement(
        row,
        el => el.props != null && 'label' in el.props,
        el => {
            matchedTableRow = true
            return React.cloneElement(el, {
                label: colorTableRowLabel(el.props.label, data),
            })
        },
    )
    if (matchedTableRow) return withTableRow

    return paintFirstDesignText(row, data)
}

export function patchPollResults(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
    reportError?: (e: unknown) => void,
) {
    let loggedList = false
    let loggedRow = false

    function transformVoterRow(renderedTree: ReactNode, rowProps: any): ReactNode {
        const ctxGuildId = React.useContext(getVotersGuildContext())
        const settings = getSettings()
        const guildId: string | undefined = rowProps?.guild?.id ?? ctxGuildId
        const userId: string | undefined =
            rowProps?.user?.id ?? rowProps?.voter?.id ?? rowProps?.id ?? rowProps?.userId

        const member = React.useSyncExternalStore(
            guildId && userId ? subscribeToMembers : noopSubscribe,
            () => (guildId && userId ? getGuildMemberStore()?.getMember?.(guildId, userId) : undefined),
        )

        React.useEffect(() => {
            if (guildId && userId && !member) {
                getGuildMemberRequesterStore()?.requestMember?.(guildId, userId)
            }
        }, [guildId, userId, member])

        if (settings.debugLogs && !loggedRow) {
            loggedRow = true
            logDebug('VotersList row rendered', {
                rowPropKeys: rowProps ? Object.keys(rowProps) : [],
                guildId,
                userId,
                hasMember: Boolean(member),
            })
        }

        if (!settings.pollResults || !guildId || !userId || !member) {
            return renderedTree
        }

        const data = getColorsFromMember(guildId, member, settings.skipNeutralColors)
        return data ? applyColorToVoterRow(renderedTree, data) : renderedTree
    }

    cleanup(
        transformComponent<VotersListProps>(
            'VotersList',
            () => getSettings().pollResults,
            (tree, { channelId }) => {
                const settings = getSettings()
                const guildId = getGuildId(channelId ?? getSelectedChannelStore()?.getChannelId?.())
                if (!guildId) return tree

                let foundList = false
                const wrappedTree = wrapListRenderItem(
                    tree,
                    row => {
                        foundList = true
                        if (!React.isValidElement(row)) return row
                        const WrappedRow = wrapComponent(row.type, transformVoterRow)
                        if (!WrappedRow) return row
                        return React.createElement(WrappedRow, {
                            ...(row.props as object),
                            key: row.key ?? undefined,
                        })
                    },
                    12,
                )

                if (settings.debugLogs && !loggedList) {
                    loggedList = true
                    logDebug('VotersList render', { guildId, foundList })
                }

                return React.createElement(
                    getVotersGuildContext().Provider as any,
                    { value: guildId },
                    wrappedTree,
                )
            },
            reportError ?? (e => logDebug('PollResults error', String(e))),
        ),
    )
}