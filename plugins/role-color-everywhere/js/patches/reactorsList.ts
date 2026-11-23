import type { Context, ReactNode } from 'react'
import { React } from '@valenced/react'
import type { RoleColorSettings } from '../types'
import { getColorsFromMember, getGuildId } from '../utils/colors'
import { Design } from '@valenced/discord/design'
import { paintFirstDesignText } from '../utils/gradient'
import { replaceElement, transformComponent } from '../utils/react'
import { getGuildMemberRequesterStore, getGuildMemberStore } from '../utils/stores'

interface ReactionsContentProps {
    channelId?: string
}

interface DiscordTagProps {
    user?: { id?: string } | null
}

let ReactionsGuildContext: Context<string | undefined> | null = null
let PollGuildContext: Context<string | undefined> | null = null
let AutocompleteGuildContext: Context<string | undefined> | null = null

export function getReactionsGuildContext() {
    return (ReactionsGuildContext ??= React.createContext<string | undefined>(undefined))
}

export function getPollGuildContext() {
    return (PollGuildContext ??= React.createContext<string | undefined>(undefined))
}

export function getAutocompleteGuildContext() {
    return (AutocompleteGuildContext ??= React.createContext<string | undefined>(undefined))
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
    function useColoredTag(tree: ReactNode, { user }: DiscordTagProps) {
        const reactionsGuildId = React.useContext(getReactionsGuildContext())
        const pollGuildId = React.useContext(getPollGuildContext())
        const autocompleteGuildId = React.useContext(getAutocompleteGuildContext())
        const settings = getSettings()

        const guildId =
            (reactionsGuildId && settings.reactorsList ? reactionsGuildId : undefined) ??
            (pollGuildId && settings.pollResults ? pollGuildId : undefined) ??
            (autocompleteGuildId && settings.mentionAutocomplete ? autocompleteGuildId : undefined)
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

        const isAutocomplete = Boolean(
            autocompleteGuildId &&
            settings.mentionAutocomplete &&
            !(reactionsGuildId && settings.reactorsList) &&
            !(pollGuildId && settings.pollResults),
        )

        const sizedTree = isAutocomplete
            ? replaceElement(
                tree,
                el => el.type === Design?.Text,
                text =>
                    React.cloneElement(text, {
                        style: [text.props?.style, { fontSize: 12, lineHeight: 16 }],
                    }),
            )
            : tree

        if (!guildId || !userId || !member) return sizedTree

        const data = getColorsFromMember(guildId, member, settings.skipNeutralColors)
        return data ? paintFirstDesignText(sizedTree, data) : sizedTree
    }

    cleanup(
        transformComponent<ReactionsContentProps>(
            'MessageReactionsContent',
            () => getSettings().reactorsList,
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
            () =>
                getSettings().reactorsList ||
                getSettings().pollResults ||
                getSettings().mentionAutocomplete,
            useColoredTag,
            reportError,
        ),
    )
}