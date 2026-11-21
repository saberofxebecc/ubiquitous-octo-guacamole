import type { Context, ReactNode } from 'react'
import { React } from '@valenced/react'
import type { RoleColorSettings } from '../types'
import { getColorsFromMember, getGuildId } from '../utils/colors'
import { paintFirstDesignText } from '../utils/gradient'
import { transformComponent } from '../utils/react'
import { getGuildMemberRequesterStore, getGuildMemberStore } from '../utils/stores'

interface ReactionsContentProps {
    channelId?: string
}

interface DiscordTagProps {
    user?: { id?: string } | null
}

let ReactionsGuildContext: Context<string | undefined> | null = null

function getReactionsGuildContext() {
    return (ReactionsGuildContext ??= React.createContext<string | undefined>(undefined))
}

const noopSubscribe = () => () => { }

function subscribeToMembers(callback: () => void) {
    const store = getGuildMemberStore()
    store?.addChangeListener?.(callback)
    return () => {
        store?.removeChangeListener?.(callback)
    }
}

export function patchReactorsList(
    getSettings: () => RoleColorSettings,
    reportError: (e: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    const enabled = () => getSettings().reactorsList

    function useColoredTag(tree: ReactNode, { user }: DiscordTagProps) {
        const guildId = React.useContext(getReactionsGuildContext())
        const userId = user?.id

        const member = React.useSyncExternalStore(
            guildId && userId ? subscribeToMembers : noopSubscribe,
            () => (guildId && userId ? getGuildMemberStore()?.getMember?.(guildId, userId) : undefined),
        )

        React.useEffect(() => {
            if (guildId && userId && !member) {
                getGuildMemberRequesterStore()?.requestMember?.(guildId, userId)
            }
        }, [guildId, userId, member])

        if (!guildId || !userId || !member) return tree

        const data = getColorsFromMember(guildId, member, getSettings().skipNeutralColors)
        return data ? paintFirstDesignText(tree, data) : tree
    }

    cleanup(
        transformComponent<ReactionsContentProps>(
            'MessageReactionsContent',
            enabled,
            (tree, { channelId }) =>
                React.createElement(
                    getReactionsGuildContext().Provider as any,
                    { value: getGuildId(channelId) },
                    tree,
                ),
            reportError,
        ),
        transformComponent<DiscordTagProps>(
            'DiscordTag',
            enabled,
            useColoredTag,
            reportError,
        ),
    )
}