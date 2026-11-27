export type ServerColorMode = 'no-role-only' | 'everyone'
export type ServerFilterMode = 'all' | 'include' | 'exclude'
export type ColorStyle = 'solid' | 'gradient'
export type ColorAssignmentMode =
	| 'per-context'
	| 'dm-context-guild-global'
	| 'global'

export interface IrcColorsSettings {
	applyInDms: boolean
	applyInServers: boolean
	serverColorMode: ServerColorMode
	serverFilterMode: ServerFilterMode
	serverFilterList: string
	memberListColors: boolean
	colorAssignment: ColorAssignmentMode
	colorStyle: ColorStyle
	saturation: number
	lightness: number
	lightSaturation: number
	lightLightness: number
	dynamicToneVariety: boolean
	seed: string
	debugLogs: boolean
}

export const DEFAULT_SETTINGS: IrcColorsSettings = {
	applyInDms: true,
	applyInServers: true,
	serverColorMode: 'no-role-only',
	serverFilterMode: 'all',
	serverFilterList: '',
	memberListColors: true,
	colorAssignment: 'per-context',
	colorStyle: 'solid',
	saturation: 100,
	lightness: 70,
	lightSaturation: 95,
	lightLightness: 42,
	dynamicToneVariety: true,
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
