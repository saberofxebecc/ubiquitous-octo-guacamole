import { ScrollView, View } from 'react-native'
import { Page, TableRowAssetIcon } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import type { PluginApi } from '@valenced/plugins/types'
import { patchChatMessages } from './patches/chatMessages'
import { patchMemberList } from './patches/memberList'
import { patchMentions } from './patches/mentions'
import { patchPollResults } from './patches/pollResults'
import { patchReactorsList } from './patches/reactorsList'
import { patchTypingIndicator } from './patches/typingIndicator'
import { patchVoiceUsers } from './patches/voiceUsers'
import { DEFAULT_SETTINGS, type RoleColorSettings } from './types'
import { setGradientsEnabled } from './utils/colors'
import { initGradientComponents } from './utils/gradient'

const HEADER_SIZE_LABELS = [
    'Ant-Sized',
    'Squintable',
    'Stock',
    'Big',
    'Overcompensating',
] as const

export default plugin<{ jsonStorage: RoleColorSettings }>({
    jsonStorage: {
        load: true,
        default: DEFAULT_SETTINGS,
    },

    start({ cleanup, jsonStorage, logger, plugin }) {
        if (plugin.startedLate) {
            plugin.requireReload()
        }

        const getSettings = (): RoleColorSettings => ({
            ...DEFAULT_SETTINGS,
            ...jsonStorage.cache,
        })

        setGradientsEnabled(getSettings().gradients)
        cleanup(
            jsonStorage.subscribe(() => {
                setGradientsEnabled(getSettings().gradients)
            }),
        )

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
        patchMentions(getSettings, cleanup)
        patchMemberList(getSettings, reportError, cleanup)
        patchTypingIndicator(getSettings, logDebug, cleanup)
        patchVoiceUsers(getSettings, reportError, cleanup)
        patchReactorsList(getSettings, reportError, cleanup)
        patchPollResults(getSettings, logDebug, cleanup, reportError)

        logger.log('Role Color Everywhere v1.0.0 started')
    },

    stop({ plugin }) {
        plugin.requireReload()
    },

    SettingsComponent({ api }: { api: PluginApi<{ jsonStorage: RoleColorSettings }> }) {
        const { TableRowGroup, TableSwitchRow, TableRow, Slider, Text } = Design
        const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }

        const toggle = (key: keyof RoleColorSettings) => (value: boolean) => {
            api.jsonStorage.set({ [key]: value })
        }

        const headerSizeIndex = Math.max(
            0,
            Math.min(HEADER_SIZE_LABELS.length - 1, Math.round(settings.memberListHeaderSize)),
        )

        return (
            <Page>
                <ScrollView showsVerticalScrollIndicator={false}>
                    <TableRowGroup title="Chat">
                        <TableSwitchRow
                            label="Chat Mentions"
                            subLabel="Paints @mentions in messages, replies, and embeds so pings actually look intentional."
                            icon={<TableRowAssetIcon name="ChatIcon" />}
                            value={settings.chatMentions}
                            onValueChange={toggle('chatMentions')}
                        />
                        <TableSwitchRow
                            label="@ Mention Autocomplete"
                            subLabel="Colors user & role suggestions when typing @—because guessing who's a mod shouldn't be a gamble."
                            icon={<TableRowAssetIcon name="AtIcon" />}
                            value={settings.mentionAutocomplete}
                            onValueChange={toggle('mentionAutocomplete')}
                        />
                    </TableRowGroup>

                    <TableRowGroup title="Members & Presence">
                        <TableSwitchRow
                            label="Member List Headers"
                            subLabel="Tints role group titles in the member list instead of leaving them all identically dull."
                            icon={<TableRowAssetIcon name="TrophyIcon" />}
                            value={settings.memberList}
                            onValueChange={toggle('memberList')}
                        />
                        {settings.memberList && (
                            <>
                                <TableRow
                                    label="Role Header Size"
                                    subLabel="How loudly your role headers announce themselves above members."
                                    icon={<TableRowAssetIcon name="LettersIcon" />}
                                    trailing={
                                        <Text variant="text-md/semibold" color="text-muted">
                                            {HEADER_SIZE_LABELS[headerSizeIndex]}
                                        </Text>
                                    }
                                />
                                <View style={{ paddingLeft: 52, paddingRight: 16, paddingBottom: 10 }}>
                                    <Slider
                                        minimumValue={0}
                                        maximumValue={4}
                                        step={1}
                                        value={headerSizeIndex}
                                        onValueChange={(value: number) =>
                                            api.jsonStorage.set({
                                                memberListHeaderSize: Math.round(value),
                                            })
                                        }
                                    />
                                </View>
                                <TableSwitchRow
                                    label="Bold Role Headers"
                                    subLabel="Keep role headers heavy and assertive, or turn off for polite regular weight."
                                    value={settings.memberListBoldHeaders}
                                    onValueChange={toggle('memberListBoldHeaders')}
                                />
                            </>
                        )}
                        <TableSwitchRow
                            label="Voice Users"
                            subLabel="Colors participants in voice channels, Active Now, preview sheets, and active call tiles."
                            icon={<TableRowAssetIcon name="VoiceNormalIcon" />}
                            value={settings.voiceUsers}
                            onValueChange={toggle('voiceUsers')}
                        />
                        <TableSwitchRow
                            label="Typing Indicator"
                            subLabel="Reveals who's currently writing a novel in chat (plays nicely with Better Typing Indicators)."
                            icon={<TableRowAssetIcon name="KeyboardIcon" />}
                            value={settings.typingIndicator}
                            onValueChange={toggle('typingIndicator')}
                        />
                    </TableRowGroup>

                    <TableRowGroup title="Sheets">
                        <TableSwitchRow
                            label="Reactions List"
                            subLabel="Colors everyone who reacted to a message—even in servers big enough to need progressive fetching."
                            icon={<TableRowAssetIcon name="SuperReactionIcon" />}
                            value={settings.reactorsList}
                            onValueChange={toggle('reactorsList')}
                        />
                        <TableSwitchRow
                            label="Poll Results"
                            subLabel="Exposes who voted for what in full role-colored glory."
                            icon={<TableRowAssetIcon name="HammerIcon" />}
                            value={settings.pollResults}
                            onValueChange={toggle('pollResults')}
                        />
                    </TableRowGroup>

                    <TableRowGroup title="Appearance">
                        <TableSwitchRow
                            label="Gradient Role Colors"
                            subLabel="Renders multi-stop Enhanced Role Color gradients instead of settling for flat single colors."
                            icon={<TableRowAssetIcon name="MagicWandIcon" />}
                            value={settings.gradients}
                            onValueChange={toggle('gradients')}
                        />
                        <TableSwitchRow
                            label="Skip Neutral Colors"
                            subLabel="Ignores near-black, near-white, and dreary gray roles."
                            icon={<TableRowAssetIcon name="DenyIcon" />}
                            value={settings.skipNeutralColors}
                            onValueChange={toggle('skipNeutralColors')}
                        />
                    </TableRowGroup>

                    <TableRowGroup title="Advanced">
                        <TableSwitchRow
                            label="Debug Logs"
                            subLabel="Writes diagnostic chatter to Valenced Debug Logs. Leave off unless something actually misbehaves."
                            icon={<TableRowAssetIcon name="SlashBoxIcon" />}
                            value={settings.debugLogs}
                            onValueChange={toggle('debugLogs')}
                        />
                    </TableRowGroup>

                    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                        <Text variant="text-xs/normal" color="text-muted">
                            Role Color Everywhere v1.0.0
                        </Text>
                    </View>
                </ScrollView>
            </Page>
        )
    },
})