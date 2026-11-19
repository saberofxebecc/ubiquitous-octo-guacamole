import { Stores } from '@valenced/discord/flux'

export const ChannelStore = Stores.ChannelStore as {
    getChannel?: (id: string) => any
}

export const GuildStore = Stores.GuildStore as {
    getGuild?: (id: string) => any
    getGuilds?: () => Record<string, any>
}

export const GuildMemberStore = Stores.GuildMemberStore as {
    getMember?: (guildId: string, userId: string) => any
}

export const GuildRoleStore = Stores.GuildRoleStore as {
    getRole?: (guildId: string, roleId: string) => any
}

export const UserStore = Stores.UserStore as {
    getUser?: (id: string) => any
    getCurrentUser?: () => any
}

export const TypingStore = Stores.TypingStore as {
    getTypingUsers?: (channelId: string) => Record<string, number>
}

export const SelectedChannelStore = Stores.SelectedChannelStore as {
    getChannelId?: () => string | undefined
}

export const ThemeStore = Stores.ThemeStore as {
    theme?: string
}