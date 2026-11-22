export interface RoleColorSettings {
    chatMentions: boolean
    chatInputAndAutocomplete: boolean
    searchFilters: boolean
    memberList: boolean
    voiceUsers: boolean
    typingIndicator: boolean
    reactorsList: boolean
    pollResults: boolean
    skipNeutralColors: boolean
    debugLogs: boolean
}

export const DEFAULT_SETTINGS: RoleColorSettings = {
    chatMentions: true,
    chatInputAndAutocomplete: true,
    searchFilters: true,
    memberList: true,
    voiceUsers: true,
    typingIndicator: true,
    reactorsList: true,
    pollResults: true,
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
    colorStrings: RoleColorStrings
    colorInts: RoleColorInts
    isGradient: boolean
}