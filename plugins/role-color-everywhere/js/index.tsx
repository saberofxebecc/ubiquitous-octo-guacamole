import { Design } from '@valenced/discord/design'
import type { PluginApi } from '@valenced/plugins/types'
import { patchChatMessages } from './patches/chatMessages'
import { patchMentions } from './patches/mentions'
import { patchPollResults } from './patches/pollResults'
import { patchReactorsList } from './patches/reactorsList'
import { patchTypingIndicator } from './patches/typingIndicator'
import { patchVoiceUsers } from './patches/voiceUsers'
import { DEFAULT_SETTINGS, type RoleColorSettings } from './types'

export default plugin<{ jsonStorage: RoleColorSettings }>({
    jsonStorage: {
        load: true,
        default: DEFAULT_SETTINGS,
    },

    start({ cleanup, jsonStorage, logger }) {
        const getSettings = (): RoleColorSettings => ({
            ...DEFAULT_SETTINGS,
            ...jsonStorage.cache,
        })

        const logDebug = (msg: string, data?: unknown) => {
            if (getSettings().debugLogs) {
                logger.log(msg, data !== undefined ? JSON.stringify(data) : '')
            }
        }

        patchChatMessages(getSettings, logDebug, cleanup)
        patchMentions(getSettings, cleanup)
        patchTypingIndicator(getSettings, logDebug, cleanup)
        patchVoiceUsers(getSettings, logDebug, cleanup)
        patchReactorsList(getSettings, logDebug, cleanup)
        patchPollResults(getSettings, logDebug, cleanup)

        logger.log('Role Color Everywhere started')
    },

    SettingsComponent({ api }: { api: PluginApi<{ jsonStorage: RoleColorSettings }> }) {
        const { TableRowGroup, TableSwitchRow, TableRow, Stack, Button } = Design
        const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }

        const toggle = (key: keyof RoleColorSettings) => (value: boolean) => {
            api.jsonStorage.set({ [key]: value })
        }

        const stepSaturation = (delta: number) => {
            const next = Math.max(0, Math.min(100, settings.messageSaturation + delta))
            api.jsonStorage.set({ messageSaturation: next })
        }

        return (
            <Stack spacing={16}>
                <TableRowGroup title="Where to show role colors">
                    <TableSwitchRow
                        label="Chat Mentions"
                        subLabel="Show role colors on @mentions in chat, embeds, and input"
                        value={settings.chatMentions}
                        onValueChange={toggle('chatMentions')}
                    />
                    <TableSwitchRow
                        label="Voice Users"
                        subLabel="Show role colors in voice channel participant lists"
                        value={settings.voiceUsers}
                        onValueChange={toggle('voiceUsers')}
                    />
                    <TableSwitchRow
                        label="Typing Indicator"
                        subLabel="Show role colors on typing users"
                        value={settings.typingIndicator}
                        onValueChange={toggle('typingIndicator')}
                    />
                    <TableSwitchRow
                        label="Reactors List"
                        subLabel="Show role colors in the message reactions sheet"
                        value={settings.reactorsList}
                        onValueChange={toggle('reactorsList')}
                    />
                    <TableSwitchRow
                        label="Poll Results"
                        subLabel="Show role colors on poll voter rows"
                        value={settings.pollResults}
                        onValueChange={toggle('pollResults')}
                    />
                </TableRowGroup>

                <TableRowGroup title="Message Coloring & Gradients">
                    <TableSwitchRow
                        label="Color Chat Messages"
                        subLabel="Tint chat message text using the author's role color (requires chat scroll/reload)"
                        value={settings.colorChatMessages}
                        onValueChange={toggle('colorChatMessages')}
                    />
                    <TableRow
                        label={`Message Saturation: ${settings.messageSaturation}%`}
                        subLabel="Controls how strongly role color tints message text"
                        trailing={
                            <Stack direction="horizontal" spacing={8} style={{ width: 'auto' }}>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    text="-10%"
                                    onPress={() => stepSaturation(-10)}
                                />
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    text="+10%"
                                    onPress={() => stepSaturation(10)}
                                />
                            </Stack>
                        }
                    />
                    <TableSwitchRow
                        label="Skip Neutral Colors"
                        subLabel="Ignore near-black, near-white, or gray role colors"
                        value={settings.skipNeutralColors}
                        onValueChange={toggle('skipNeutralColors')}
                    />
                </TableRowGroup>

                <TableRowGroup title="Diagnostics">
                    <TableSwitchRow
                        label="Debug Logs"
                        subLabel="Write component prop diagnostics to Valenced Debug Logs"
                        value={settings.debugLogs}
                        onValueChange={toggle('debugLogs')}
                    />
                </TableRowGroup>
            </Stack>
        )
    },
})