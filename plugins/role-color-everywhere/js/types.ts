export interface RoleColorSettings {
    chatMentions: boolean
    mentionAutocomplete: boolean
    memberList: boolean
    memberListHeaderSize: number
    memberListBoldHeaders: boolean
    voiceUsers: boolean
    typingIndicator: boolean
    reactorsList: boolean
    pollResults: boolean
    gradients: boolean
    skipNeutralColors: boolean
    debugLogs: boolean
}

export const DEFAULT_SETTINGS: RoleColorSettings = {
    chatMentions: true,
    mentionAutocomplete: true,
    memberList: true,
    memberListHeaderSize: 3, // 0..4 => Ant-Sized, Squintable, Stock, Big, Overcompensating
    memberListBoldHeaders: true,
    voiceUsers: true,
    typingIndicator: true,
    reactorsList: true,
    pollResults: true,
    gradients: true,
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