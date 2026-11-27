import { Stores } from '@valenced/discord/flux'

export function getChannelStore() {
	return Stores.ChannelStore as {
		getChannel?(id: string): {
			id?: string
			type?: number
			guild_id?: string | null
			recipients?: string[] | null
		} | null
	}
}

export function getSelectedChannelStore() {
	return Stores.SelectedChannelStore as {
		getChannelId?(): string | undefined
	}
}

export function getThemeStore() {
	return Stores.ThemeStore as {
		theme?: string
	}
}

export function getUserStore() {
	return Stores.UserStore as {
		getCurrentUser?(): { id?: string } | undefined
	}
}
