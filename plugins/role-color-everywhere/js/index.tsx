import { Pressable, ScrollView, View } from 'react-native'
import { FormSwitch, Page, TableRowAssetIcon } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import type { PluginApi } from '@valenced/plugins/types'
import { formatVersion } from '@valenced/plugins/utils'
import { React } from '@valenced/react'
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

const STOCK_HEADER_SIZE_INDEX = 2

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

        logger.log(`Role Color Everywhere v${formatVersion(plugin.manifest.version)} started`)
    },

    stop({ plugin }) {
        plugin.requireReload()
    },

    SettingsComponent({ api }: { api: PluginApi<{ jsonStorage: RoleColorSettings }> }) {
        const { TableRowGroup, TableSwitchRow, TableRow, Slider, Stack, Button, Text } = Design
        const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }

        const savedSizeIndex = Math.max(
            0,
            Math.min(HEADER_SIZE_LABELS.length - 1, Math.round(settings.memberListHeaderSize)),
        )
        const [dragSize, setDragSize] = React.useState<number | null>(null)
        const activeSizeIndex = dragSize ?? savedSizeIndex

        const toggle = (key: keyof RoleColorSettings) => (value: boolean) => {
            api.jsonStorage.set({ [key]: value })
        }

        const setHeaderSize = (index: number) => {
            const clamped = Math.max(0, Math.min(HEADER_SIZE_LABELS.length - 1, Math.round(index)))
            setDragSize(null)
            api.jsonStorage.set({ memberListHeaderSize: clamped })
        }

        return (
            <Page>
                <ScrollView showsVerticalScrollIndicator={false}>
                    <Stack spacing={20}>
                        <TableRowGroup title="Chat">
                            <TableSwitchRow
                                label="Chat Mentions"
                                subLabel="Color @mentions in messages, replies, and embeds."
                                icon={<TableRowAssetIcon name="ChatIcon" />}
                                value={settings.chatMentions}
                                onValueChange={toggle('chatMentions')}
                            />
                            <TableSwitchRow
                                label="Mention Autocomplete"
                                subLabel="Color user and role suggestions when typing @."
                                icon={<TableRowAssetIcon name="AtIcon" />}
                                value={settings.mentionAutocomplete}
                                onValueChange={toggle('mentionAutocomplete')}
                            />
                        </TableRowGroup>

                        <TableRowGroup title="Members">
                            <TableSwitchRow
                                label="Member List Headers"
                                subLabel="Color role group headers in the member list."
                                icon={<TableRowAssetIcon name="CrownIcon" />}
                                value={settings.memberList}
                                onValueChange={toggle('memberList')}
                            />
                            {settings.memberList && (
                                <TableRow
                                    label={
                                        <Stack spacing={14}>
                                            <View
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                }}
                                            >
                                                <Text variant="text-md/semibold">Role Header Size</Text>
                                                <Text variant="text-md/medium" color="text-muted">
                                                    {HEADER_SIZE_LABELS[activeSizeIndex]}
                                                </Text>
                                            </View>

                                            <Slider
                                                minimumValue={0}
                                                maximumValue={4}
                                                step={1}
                                                value={activeSizeIndex}
                                                onValueChange={val => setDragSize(Math.round(val))}
                                                onSlidingComplete={setHeaderSize}
                                                startIcon={
                                                    <Pressable onPress={() => setHeaderSize(activeSizeIndex - 1)}>
                                                        <TableRowAssetIcon name="CircleMinusIcon-primary" />
                                                    </Pressable>
                                                }
                                                endIcon={
                                                    <Pressable onPress={() => setHeaderSize(activeSizeIndex + 1)}>
                                                        <TableRowAssetIcon name="CirclePlusIcon-primary" />
                                                    </Pressable>
                                                }
                                            />

                                            <Button
                                                variant="secondary"
                                                size="md"
                                                text="Reset to default"
                                                disabled={activeSizeIndex === STOCK_HEADER_SIZE_INDEX}
                                                onPress={() => setHeaderSize(STOCK_HEADER_SIZE_INDEX)}
                                            />

                                            <View
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    paddingTop: 2,
                                                }}
                                            >
                                                <Text variant="text-md/semibold">Bold Role Headers</Text>
                                                <FormSwitch
                                                    value={settings.memberListBoldHeaders}
                                                    onValueChange={toggle('memberListBoldHeaders')}
                                                />
                                            </View>
                                        </Stack>
                                    }
                                />
                            )}
                        </TableRowGroup>

                        <TableRowGroup title="Presence">
                            <TableSwitchRow
                                label="Voice Users"
                                subLabel="Color participants in voice channels, sheets, and calls."
                                icon={<TableRowAssetIcon name="VoiceNormalIcon" />}
                                value={settings.voiceUsers}
                                onValueChange={toggle('voiceUsers')}
                            />
                            <TableSwitchRow
                                label="Typing Indicator"
                                subLabel="Color users currently typing in chat."
                                icon={<TableRowAssetIcon name="KeyboardIcon" />}
                                value={settings.typingIndicator}
                                onValueChange={toggle('typingIndicator')}
                            />
                        </TableRowGroup>

                        <TableRowGroup title="Sheets">
                            <TableSwitchRow
                                label="Reactions List"
                                subLabel="Color users in the message reactions sheet."
                                icon={<TableRowAssetIcon name="EmojiZanyFaceIcon" />}
                                value={settings.reactorsList}
                                onValueChange={toggle('reactorsList')}
                            />
                            <TableSwitchRow
                                label="Poll Results"
                                subLabel="Color voters in poll results."
                                icon={<TableRowAssetIcon name="PollsIcon" />}
                                value={settings.pollResults}
                                onValueChange={toggle('pollResults')}
                            />
                        </TableRowGroup>

                        <TableRowGroup title="Appearance">
                            <TableSwitchRow
                                label="Gradient Role Colors"
                                subLabel="Render multi-stop gradients for Enhanced Role Colors."
                                icon={<TableRowAssetIcon name="MagicWandIcon" />}
                                value={settings.gradients}
                                onValueChange={toggle('gradients')}
                            />
                            <TableSwitchRow
                                label="Skip Neutral Colors"
                                subLabel="Ignore black, white, and dreary gray roles."
                                icon={<TableRowAssetIcon name="EyeSlashIcon" />}
                                value={settings.skipNeutralColors}
                                onValueChange={toggle('skipNeutralColors')}
                            />
                        </TableRowGroup>

                        <TableRowGroup title="Advanced">
                            <TableSwitchRow
                                label="Debug Logs"
                                subLabel="Write diagnostic logs for troubleshooting."
                                icon={<TableRowAssetIcon name="SlashBoxIcon" />}
                                value={settings.debugLogs}
                                onValueChange={toggle('debugLogs')}
                            />
                        </TableRowGroup>

                        <View style={{ alignItems: 'center', paddingBottom: 16 }}>
                            <Text variant="text-xs/normal" color="text-muted">
                                Role Color Everywhere v{formatVersion(api.plugin.manifest.version)}
                            </Text>
                        </View>
                    </Stack>
                </ScrollView>
            </Page>
        )
    },
})