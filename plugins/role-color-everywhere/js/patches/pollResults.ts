import type { ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import type { ColorData, RoleColorSettings } from '../types'
import { getColorsFromMember, getGuildId } from '../utils/colors'
import { withComponentName } from '../utils/filters'
import { canRenderGradients, paintFirstDesignText, renderColoredText } from '../utils/gradient'
import {
    patchComponentRender,
    replaceElement,
    wrapComponent,
    wrapListRenderItem,
} from '../utils/react'
import {
    getGuildMemberRequesterStore,
    getGuildMemberStore,
    getSelectedChannelStore,
} from '../utils/stores'
import { getPollGuildContext } from './reactorsList'

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

function summarizePollTree(node: any, depth = 0, out: any[] = []): any[] {
    if (depth > 8 || node == null || out.length >= 16) return out
    if (Array.isArray(node)) {
        for (const c of node) summarizePollTree(c, depth, out)
        return out
    }
    if (!React.isValidElement(node)) return out
    const props: any = node.props ?? {}
    const t: any = node.type
    out.push({
        depth,
        type: typeof t === 'string' ? t : t?.displayName || t?.name || t?.type?.name || typeof t,
        hasRenderItem: typeof props.renderItem === 'function',
        propKeys: Object.keys(props).slice(0, 8),
    })
    summarizePollTree(props.children, depth + 1, out)
    return out
}

export function patchPollResults(
    getSettings: () => RoleColorSettings,
    logDebug: (msg: string, data?: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    let loggedRow = false

    function transformVoterRow(renderedTree: ReactNode, rowProps: any): ReactNode {
        const ctxGuildId = React.useContext(getPollGuildContext())
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
            logDebug('PollVotes voter row rendered', {
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
        getModules(withComponentName('PollVotesActionSheet'), (mod: any) => {
            let lastTreeJson = ''
            let treeLogs = 0
            let loggedItem = false

            cleanup(
                patchComponentRender(mod, (result, [props]) => {
                    const settings = getSettings()
                    if (!settings.pollResults || !result) return result

                    const channelId =
                        props?.channelId ??
                        props?.message?.channel_id ??
                        getSelectedChannelStore()?.getChannelId?.()
                    const guildId = props?.guildId ?? getGuildId(channelId)

                    if (!guildId) return result

                    let foundList = false
                    const wrappedTree = wrapListRenderItem(
                        result,
                        (row, info) => {
                            foundList = true
                            if (settings.debugLogs && !loggedItem && info?.item) {
                                loggedItem = true
                                logDebug('PollVotes item sample', {
                                    itemKeys: typeof info.item === 'object' ? Object.keys(info.item) : typeof info.item,
                                    rowType: React.isValidElement(row)
                                        ? (row.type as any)?.displayName || (row.type as any)?.name || (row.type as any)?.type?.name || typeof row.type
                                        : typeof row,
                                    rowProps: React.isValidElement(row) ? Object.keys(row.props ?? {}) : [],
                                })
                            }

                            if (!React.isValidElement(row)) return row
                            const WrappedRow = wrapComponent(row.type, transformVoterRow)
                            if (!WrappedRow) return row
                            return React.createElement(WrappedRow, {
                                ...(row.props as object),
                                key: row.key ?? undefined,
                            })
                        },
                        16,
                    )

                    if (settings.debugLogs && !foundList && treeLogs < 4) {
                        const summary = summarizePollTree(result)
                        const json = JSON.stringify(summary)
                        if (json !== lastTreeJson) {
                            lastTreeJson = json
                            treeLogs++
                            logDebug(`PollVotesActionSheet tree #${treeLogs}`, summary)
                        }
                    }

                    return React.createElement(
                        getPollGuildContext().Provider as any,
                        { value: guildId },
                        wrappedTree,
                    )
                }),
            )
        }),
    )
}