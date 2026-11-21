import type { ReactNode } from 'react'
import { React } from '@valenced/react'
import type { RoleColorSettings } from '../types'
import { getColorsFromMember, getMemberColorData } from '../utils/colors'
import { paintFirstDesignText } from '../utils/gradient'
import { transformComponent } from '../utils/react'
import { getChannelStore, getSelectedChannelStore } from '../utils/stores'

interface VoiceUserNameProps {
    guildId?: string | null
    member?: any
    user?: { id?: string } | null
}

interface MemberRowProps {
    guildId?: string | null
    user?: { id?: string } | null
    member?: any
}

interface ParticipantLabelProps {
    participant?: { user?: { id?: string } | null } | null
}

function getCurrentVoiceGuildId(): string | undefined {
    const voiceChannelId = getSelectedChannelStore()?.getVoiceChannelId?.()
    if (!voiceChannelId) return undefined
    return getChannelStore()?.getChannel?.(voiceChannelId)?.guild_id
}

export function patchVoiceUsers(
    getSettings: () => RoleColorSettings,
    reportError: (e: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    const enabled = () => getSettings().voiceUsers

    cleanup(
        // 1. Channel list & Active Now voice items
        transformComponent<VoiceUserNameProps>(
            'VoiceUserNameItem',
            enabled,
            (tree, { guildId, member, user }) => {
                const skipNeutral = getSettings().skipNeutralColors
                const data =
                    getColorsFromMember(guildId, member, skipNeutral) ??
                    getMemberColorData(user?.id, guildId ?? undefined, skipNeutral)
                return data ? paintFirstDesignText(tree, data) : tree
            },
            reportError,
        ),
        // 2. Voice channel preview sheet rows
        transformComponent<MemberRowProps>(
            'MemberRowItem',
            enabled,
            (tree, { guildId, user, member }) => {
                if (
                    !React.isValidElement<{ label?: ReactNode }>(tree) ||
                    tree.props.label == null
                ) {
                    return tree
                }
                const skipNeutral = getSettings().skipNeutralColors
                const data =
                    getMemberColorData(user?.id, guildId ?? undefined, skipNeutral, member) ??
                    getColorsFromMember(guildId, member, skipNeutral)
                return data
                    ? React.cloneElement(tree, { label: paintFirstDesignText(tree.props.label, data) })
                    : tree
            },
            reportError,
        ),
        // 3. Inside active voice call participant tiles
        transformComponent<ParticipantLabelProps>(
            'FloatingParticipantLabel',
            enabled,
            (tree, { participant }) => {
                const guildId = getCurrentVoiceGuildId()
                if (!guildId) return tree
                const data = getMemberColorData(
                    participant?.user?.id,
                    guildId,
                    getSettings().skipNeutralColors,
                )
                return data ? paintFirstDesignText(tree, data) : tree
            },
            reportError,
        ),
    )
}