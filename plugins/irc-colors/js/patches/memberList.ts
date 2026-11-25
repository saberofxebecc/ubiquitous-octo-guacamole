import { Design } from '@valenced/discord/design'
import { React } from '@valenced/react'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { getUserIrcColor } from '../utils/colors'
import { isGuildAllowed } from '../utils/guildFilter'
import {
	onComponentType,
	replaceFirstElement,
	wrapWithRender,
} from '../utils/react'
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

	const renderUserRow = (
		props: UserRowProps,
		callOriginal: (nextProps: UserRowProps) => React.ReactNode,
	): React.ReactNode => {
		try {
			const settings = getSettings()
			if (!settings.memberListColors || !props) return callOriginal(props)

			const userId = props.user?.id
			if (!userId) return callOriginal(props)

			const guildId = props.guildId
			const hasRoleColor = Boolean(
				props.usernameColor || props.roleColors?.primaryColor,
			)

			if (!guildId) {
				if (!settings.applyInDms) return callOriginal(props)
			} else {
				if (!settings.applyInServers) return callOriginal(props)
				if (!isGuildAllowed(guildId, settings)) return callOriginal(props)
				if (settings.serverColorMode === 'no-role-only' && hasRoleColor) {
					return callOriginal(props)
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

			const isGradient = settings.colorStyle === 'gradient'
			const tree = callOriginal({
				...props,
				usernameColor: irc.primaryHex,
				roleColors: isGradient ? irc.colorStrings : undefined,
			})

			if (!isGradient) return tree

			// Ensure gradients also render in DM member lists & servers without ENHANCED_ROLE_COLORS
			return replaceFirstElement(
				tree,
				el => el.type === Design?.Text,
				text =>
					React.cloneElement(text, {
						gradientColors: [
							irc.colorInts.primaryColor,
							irc.colorInts.secondaryColor,
						],
						style: [text.props?.style, { color: irc.primaryHex }],
					}),
			)
		} catch (e) {
			reportError(e)
			return callOriginal(props)
		}
	}

	const stop = onComponentType('UserRow', type => {
		logDebug('Attached UserRow hook')
		unpatchJSX = beforeJSX(
			type as any,
			([elType, props, key]: [any, UserRowProps, any?]) => {
				if (!getSettings().memberListColors) return [elType, props, key]
				const Wrapped = wrapWithRender<UserRowProps>(type, renderUserRow)
				return Wrapped ? [Wrapped, props, key] : [elType, props, key]
			},
		)
	})

	cleanup(() => {
		stop()
		unpatchJSX?.()
	})
}
