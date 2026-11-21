import { ScrollView } from 'react-native'
import { Page, TableRowAssetIcon } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import type { PluginApi } from '@valenced/plugins/types'
import { patchChatMessages } from './patches/chatMessages'
import { patchMentions } from './patches/mentions'
import { patchReactorsList } from './patches/reactorsList'
import { patchTypingIndicator } from './patches/typingIndicator'
import { patchVoiceUsers } from './patches/voiceUsers'
import { DEFAULT_SETTINGS, type RoleColorSettings } from './types'
import { initGradientComponents } from './utils/gradient'

export default plugin<{ jsonStorage: RoleColorSettings }>({
    jsonStorage: {
        load: true,
        default: DEFAULT_SETTINGS,
    },

    start({ cleanup, jsonStorage, logger, plugin }) {
        const getSettings = (): RoleColorSettings => ({
            ...DEFAULT_SETTINGS,
            ...jsonStorage.cache,
        })

        const logDebug = (msg: string, data?: unknown) => {
            if (getSettings().debugLogs) {
                logger.log(msg, data !== undefined ? JSON.stringify(data) : '')
            }
        }

        const reportError = (e: unknown) => {
            plugin.reportError(e)
            if (getSettings().debugLogs) {
                logger.error('Patch error', String(e))
            }
        }

        initGradientComponents(cleanup)
        patchChatMessages(getSettings, cleanup)
        patchMentions(getSettings, logDebug, cleanup)
        patchTypingIndicator(getSettings, logDebug, cleanup)
        patchVoiceUsers(getSettings, reportError, cleanup)
        patchReactorsList(getSettings, reportError, cleanup)

        logger.log('Role Color Everywhere v0.4.0 started')
    },

    SettingsComponent({ api }: { api: PluginApi<{ jsonStorage: RoleColorSettings }> }) {
        const { TableRowGroup, TableSwitchRow, Stack } = Design
        const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }

        const toggle = (key: keyof RoleColorSettings) => (value: boolean) => {
            api.jsonStorage.set({ [key]: value })
        }

        return (
            <Page>
                <ScrollView showsVerticalScrollIndicator={false}>
                    <Stack spacing={16}>
                        <TableRowGroup title="Chat & Search">
                            <TableSwitchRow
                                label="Chat Mentions"
                                subLabel="Show role colors on @mentions in chat, replies, and embeds"
                                icon={<TableRowAssetIcon name="TagsIcon" />}
                                value={settings.chatMentions}
                                onValueChange={toggle('chatMentions')}
                            />
                            <TableSwitchRow
                                label="Chat Input & @ Autocomplete"
                                subLabel="Show role colors while typing @mentions and in the mention picker"
                                icon={<TableRowAssetIcon name="PencilSparkleIcon" />}
                                value={settings.chatInputAndAutocomplete}
                                onValueChange={toggle('chatInputAndAutocomplete')}
                            />
                            <TableSwitchRow
                                label="Search User Filters"
                                subLabel="Show role colors in the search 'from:' user suggestions"
                                icon={<TableRowAssetIcon name="SparklesIcon" />}
                                value={settings.searchFilters}
                                onValueChange={toggle('searchFilters')}
                            />
                        </TableRowGroup>

                        <TableRowGroup title="Presence & Sheets">
                            <TableSwitchRow
                                label="Voice Users"
                                subLabel="Show role colors in voice channel participant lists"
                                icon={<TableRowAssetIcon name="MicrophoneIcon" />}
                                value={settings.voiceUsers}
                                onValueChange={toggle('voiceUsers')}
                            />
                            <TableSwitchRow
                                label="Typing Indicator"
                                subLabel="Show role colors on typing users"
                                icon={<TableRowAssetIcon name="MagicWandIcon" />}
                                value={settings.typingIndicator}
                                onValueChange={toggle('typingIndicator')}
                            />
                            <TableSwitchRow
                                label="Reactors List"
                                subLabel="Show role colors in the message reactions sheet"
                                icon={<TableRowAssetIcon name="SuperReactionIcon" />}
                                value={settings.reactorsList}
                                onValueChange={toggle('reactorsList')}
                            />
                            <TableSwitchRow
                                label="Poll Results"
                                subLabel="Show role colors on poll voter rows"
                                icon={<TableRowAssetIcon name="ic_polls" />}
                                value={settings.pollResults}
                                onValueChange={toggle('pollResults')}
                            />
                        </TableRowGroup>

                        <TableRowGroup title="Appearance & Diagnostics">
                            <TableSwitchRow
                                label="Skip Neutral Colors"
                                subLabel="Ignore near-black, near-white, or gray role colors"
                                icon={<TableRowAssetIcon name="PaintbrushThinIcon" />}
                                value={settings.skipNeutralColors}
                                onValueChange={toggle('skipNeutralColors')}
                            />
                            <TableSwitchRow
                                label="Debug Logs"
                                subLabel="Log component props to Valenced Debug Logs (disable when not testing)"
                                icon={<TableRowAssetIcon name="WrenchIcon" />}
                                value={settings.debugLogs}
                                onValueChange={toggle('debugLogs')}
                            />
                        </TableRowGroup>
                    </Stack>
                </ScrollView>
            </Page>
        )
    },
})