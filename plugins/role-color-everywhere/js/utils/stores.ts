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
    }

export const getGuildRoleStore = () =>
    Stores.GuildRoleStore as {
        getRole?: (guildId: string, roleId: string) => any
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
    }

export const getThemeStore = () =>
    Stores.ThemeStore as {
        theme?: string
    }