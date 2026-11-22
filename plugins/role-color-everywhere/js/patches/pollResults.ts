import type { ReactNode } from 'react'
import { React, ReactNative } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import type { ColorData, RoleColorSettings } from '../types'
import { getColorsFromMember, getGuildId } from '../utils/colors'
import { canRenderGradients, paintFirstDesignText, renderColoredText } from '../utils/gradient'
import { replaceElement, transformComponent, wrapListRenderItem } from '../utils/react'
import {
    getGuildMemberRequesterStore,
    getGuildMemberStore,
    getSelectedChannelStore,
} from '../utils/stores'

interface VotersListProps {
    channelId?: string
}

const noopSubscribe = () => () => { }

function subscribeToMembers(callback: () => void) {
    const store = getGuildMemberStore()
    store?.addChangeListener?.(callback)
    return () => {
        store?.removeChangeListener?.(callback)
    }
}

function extractUserId(item: any, row: ReactNode): string | undefined {
    if (typeof item === 'string' && /^\d+$/.test(item)) return item
    const fromItem =
        item?.user?.id ??
        item?.id ??
        item?.userId ??
        item?.voter?.id ??
        item?.member?.userId ??
        item?.member?.id
    if (fromItem) return String(fromItem)

    if (React.isValidElement(row)) {
        const icon: any = (row.props as any)?.icon
        const fromIcon = icon?.props?.user?.id ?? icon?.props?.userId
        if (fromIcon) return String(fromIcon)
    }
    return undefined
}

function colorTableRowLabel(label: ReactNode, data: ColorData): ReactNode {
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
    let loggedItem = false

    function ColoredPollVoterRow({
        row,
        userId,
        guildId,
    }: {
        row: ReactNode
        userId: string
        guildId: string
    }) {
        const settings = getSettings()

        const member = React.useSyncExternalStore(
            guildId && userId ? subscribeToMembers : noopSubscribe,
            () => (guildId && userId ? getGuildMemberStore()?.getMember?.(guildId, userId) : undefined),
        )

        React.useEffect(() => {
            if (guildId && userId && !member) {
                getGuildMemberRequesterStore()?.requestMember?.(guildId, userId)
            }
        }, [guildId, userId, member])

        if (!settings.pollResults || !member) return row

        const data = getColorsFromMember(guildId, member, settings.skipNeutralColors)
        return data ? applyColorToVoterRow(row, data) : row
    }

    cleanup(
        transformComponent<VotersListProps>(
            'VotersList',
            () => getSettings().pollResults,
            (tree, { channelId }) => {
                const settings = getSettings()
                const guildId = getGuildId(channelId ?? getSelectedChannelStore()?.getChannelId?.())
                if (!guildId) return tree

                return wrapListRenderItem(
                    tree,
                    (row, info) => {
                        const item = info?.item
                        const uid = extractUserId(item, row)

                        if (settings.debugLogs && !loggedItem && item !== undefined) {
                            loggedItem = true
                            logDebug('VotersList item sample', {
                                itemType: typeof item,
                                itemKeys: item && typeof item === 'object' ? Object.keys(item) : undefined,
                                uid: uid ?? null,
                                labelType: React.isValidElement(row) ? typeof (row.props as any)?.label : typeof row,
                            })
                        }

                        if (!uid) return row

                        return React.createElement(ColoredPollVoterRow, {
                            key: (React.isValidElement(row) && row.key != null ? String(row.key) : undefined) ?? uid,
                            row,
                            userId: uid,
                            guildId,
                        })
                    },
                    12,
                )
            },
            reportError ?? (e => logDebug('PollResults error', String(e))),
        ),
    )
}