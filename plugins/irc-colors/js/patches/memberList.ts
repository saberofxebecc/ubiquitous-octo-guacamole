import { beforeJSX } from '@valenced/react/jsx-runtime'
import { getUserIrcColor } from '../utils/colors'
import { onComponentType } from '../utils/react'
import type { IrcColorsSettings } from '../types'

interface UserRowProps {
	user?: { id?: string }
	guildId?: string
	usernameColor?: string
	roleColors?: {
		primaryColor?: string
		secondaryColor?: string | null
		tertiaryColor?: string | null
	} | null
}

export function patchMemberList(
	getSettings: () => IrcColorsSettings,
	logDebug: (msg: string, data?: unknown) => void,
	reportError: (e: unknown) => void,
	cleanup: (...fns: (() => void)[]) => void,
) {
	let unpatchJSX: (() => unknown) | undefined
	let loggedSample = false

	const stop = onComponentType('UserRow', type => {
		logDebug('Attached UserRow hook')
		unpatchJSX = beforeJSX(
			type as any,
			([elType, props, key]: [any, UserRowProps, any?]) => {
				try {
					const settings = getSettings()
					if (!settings.memberListColors || !props) return [elType, props, key]

					const userId = props.user?.id
					if (!userId) return [elType, props, key]

					const guildId = props.guildId
					const hasRoleColor = Boolean(
						props.usernameColor || props.roleColors?.primaryColor,
					)

					if (!guildId) {
						if (!settings.applyInDms) return [elType, props, key]
					} else {
						if (!settings.applyInServers) return [elType, props, key]
						if (settings.serverColorMode === 'no-role-only' && hasRoleColor) {
							return [elType, props, key]
						}
					}

					const irc = getUserIrcColor(userId, settings)
					if (!loggedSample) {
						loggedSample = true
						logDebug('Sample UserRow colored', {
							guildId: guildId ?? null,
							hadRoleColor: hasRoleColor,
							colorStyle: settings.colorStyle,
						})
					}

					return [
						elType,
						{
							...props,
							usernameColor: irc.primaryHex,
							roleColors:
								settings.colorStyle === 'gradient'
									? irc.colorStrings
									: undefined,
						},
						key,
					]
				} catch (e) {
					reportError(e)
					return [elType, props, key]
				}
			},
		)
	})

	cleanup(() => {
		stop()
		unpatchJSX?.()
	})
}
