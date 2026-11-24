import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, HookPriority } from '@valenced/patcher'
import { getUserIrcColor } from '../utils/colors'
import type { IrcColorsSettings } from '../types'

function applyToMessage(
	msg: any,
	fallbackGuildId: string | null | undefined,
	settings: IrcColorsSettings,
): boolean {
	if (!msg || typeof msg !== 'object') return false
	const authorId: string | undefined = msg.authorId
	if (!authorId) return false

	// Skip Discord's role settings preview message
	if (msg.channelId === '1337' && authorId === '313337') return false

	const guildId: string | null = msg.guildId ?? fallbackGuildId ?? null
	if (!guildId) {
		if (!settings.applyInDms) return false
	} else {
		if (!settings.applyInServers) return false
		if (settings.serverColorMode === 'no-role-only') {
			const hasRoleColor = msg.roleColor != null || msg.roleColors != null
			if (hasRoleColor) return false
		}
	}

	const irc = getUserIrcColor(authorId, settings)
	msg.usernameColor = irc.primaryInt
	msg.colorString = irc.primaryInt
	msg.roleColors = settings.colorStyle === 'gradient' ? irc.colorInts : null
	return true
}

export function patchChatMessages(
	getSettings: () => IrcColorsSettings,
	logDebug: (msg: string, data?: unknown) => void,
	cleanup: (...fns: (() => void)[]) => void,
) {
	let loggedAttach = false
	let loggedSample = false

	cleanup(
		getModules(
			withProps('generateMessageRowData'),
			(mod: any) => {
				if (typeof mod?.generateMessageRowData !== 'function') return
				if (!loggedAttach) {
					loggedAttach = true
					logDebug('Attached generateMessageRowData hook')
				}
				cleanup(
					after(
						mod,
						'generateMessageRowData',
						(result: any) => {
							const msg = result?.message
							if (!msg) return result

							const settings = getSettings()
							const hadRoleColor =
								msg.roleColor != null || msg.roleColors != null
							const applied = applyToMessage(msg, null, settings)

							if (!loggedSample) {
								loggedSample = true
								logDebug('Sample chat message row', {
									guildId: msg.guildId ?? null,
									hadRoleColor,
									applied,
									colorStyle: settings.colorStyle,
									serverColorMode: settings.serverColorMode,
								})
							}

							const refMsg = msg.referencedMessage?.message
							if (refMsg) {
								applyToMessage(refMsg, msg.guildId, settings)
							}

							return result
						},
						{ priority: HookPriority.LOWEST },
					),
				)
			},
			{ max: 5 },
		),
	)
}
