import { Stores } from '@valenced/discord/flux'

export const getChannelStore = () =>
    Stores.ChannelStore as {
        getChannel?: (id: string) => any
    }

export const getGuildStore = () =>
    Stores.GuildStore as {
        getGuild?: (id: string) => any
        getGuilds?: () => Record<string, any>
    }

export const getGuildMemberStore = () =>
    Stores.GuildMemberStore as {
        getMember?: (guildId: string, userId: string) => any
        addChangeListener?: (cb: () => void) => void
        removeChangeListener?: (cb: () => void) => void
    }

export const getGuildMemberRequesterStore = () =>
    Stores.GuildMemberRequesterStore as
    | {
        requestMember?: (guildId: string, userId: string) => void
    }
    | undefined

export const getGuildRoleStore = () =>
    Stores.GuildRoleStore as {
        getRole?: (guildId: string, roleId: string) => any
        getSortedRoles?: (guildId: string) => any[]
        getRolesSnapshot?: (guildId: string) => Record<string, any>
        getRoles?: (guildId: string) => Record<string, any>
    }

export const getSelectedGuildStore = () =>
    Stores.SelectedGuildStore as {
        getGuildId?: () => string | null | undefined
    }

export const getUserStore = () =>
    Stores.UserStore as {
        getUser?: (id: string) => any
        getCurrentUser?: () => any
    }

export const getTypingStore = () =>
    Stores.TypingStore as {
        getTypingUsers?: (channelId: string) => Record<string, number>
    }

export const getSelectedChannelStore = () =>
    Stores.SelectedChannelStore as {
        getChannelId?: () => string | undefined
        getVoiceChannelId?: () => string | undefined
    }

export const getThemeStore = () =>
    Stores.ThemeStore as {
        theme?: string
    }