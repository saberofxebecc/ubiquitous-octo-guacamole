export type ServerColorMode = 'no-role-only' | 'everyone'
export type ColorStyle = 'solid' | 'gradient'

export interface IrcColorsSettings {
	applyInDms: boolean
	applyInServers: boolean
	serverColorMode: ServerColorMode
	memberListColors: boolean
	colorStyle: ColorStyle
	saturation: number
	lightness: number
	seed: string
	debugLogs: boolean
}

export const DEFAULT_SETTINGS: IrcColorsSettings = {
	applyInDms: true,
	applyInServers: true,
	serverColorMode: 'no-role-only',
	memberListColors: true,
	colorStyle: 'solid',
	saturation: 100,
	lightness: 70,
	seed: '',
	debugLogs: false,
}

export interface RoleColorStrings {
	primaryColor: string
	secondaryColor: string | null
	tertiaryColor: string | null
}

export interface RoleColorInts {
	primaryColor: number
	secondaryColor: number | null
	tertiaryColor: number | null
}

export interface UserIrcColor {
	primaryHex: string
	secondaryHex: string
	primaryInt: number
	colorStrings: RoleColorStrings
	colorInts: RoleColorInts
}
