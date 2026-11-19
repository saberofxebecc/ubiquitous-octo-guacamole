export interface RoleColorSettings {
    chatMentions: boolean
    voiceUsers: boolean
    typingIndicator: boolean
    reactorsList: boolean
    pollResults: boolean
    colorChatMessages: boolean
    messageSaturation: number
    skipNeutralColors: boolean
    debugLogs: boolean
}

export const DEFAULT_SETTINGS: RoleColorSettings = {
    chatMentions: true,
    voiceUsers: true,
    typingIndicator: true,
    reactorsList: true,
    pollResults: true,
    colorChatMessages: false,
    messageSaturation: 30,
    skipNeutralColors: false,
    debugLogs: false,
}

export interface RoleColorStrings {
    primaryColor?: string | null
    secondaryColor?: string | null
    tertiaryColor?: string | null
}

export interface RoleColorInts {
    primaryColor: number | null
    secondaryColor: number | null
    tertiaryColor: number | null
}

export interface ColorData {
    guildId: string
    colorString: string
    colorInt: number
    colorStrings?: RoleColorStrings
    colorInts?: RoleColorInts
    isGradient: boolean
}