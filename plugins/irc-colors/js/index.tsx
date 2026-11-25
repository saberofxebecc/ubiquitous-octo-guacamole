import { getAssetIdByName } from '@valenced/assets'
import {
	Checkbox,
	Page,
	SearchInput,
	TableRowAssetIcon,
} from '@valenced/components'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { formatVersion } from '@valenced/plugins/utils'
import { React } from '@valenced/react'
import { Pressable, ScrollView, View } from 'react-native'
import { patchChatMessages } from './patches/chatMessages'
import { patchMemberList } from './patches/memberList'
import { DEFAULT_SETTINGS } from './types'
import { parseGuildIds, toggleGuildInList } from './utils/guildFilter'
import type { JsonStorage } from '@valenced/json-storage'
import type { PluginApi } from '@valenced/plugins/types'
import type {
	ColorStyle,
	IrcColorsSettings,
	ServerColorMode,
	ServerFilterMode,
} from './types'

const SERVER_PICKER_SHEET_KEY = 'irc-colors-server-picker'

interface GuildEntry {
	id: string
	name: string
}

function getSortedGuilds(): GuildEntry[] {
	const store = Stores.GuildStore as any
	const raw: any[] =
		store?.getGuildsArray?.() ?? Object.values(store?.getGuilds?.() ?? {})
	return raw
		.filter((g): g is { id: string; name?: string } => Boolean(g?.id))
		.map(g => ({ id: String(g.id), name: String(g.name ?? g.id) }))
		.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
		)
}

function ServerPickerSheet({
	jsonStorage,
}: {
	jsonStorage: JsonStorage<IrcColorsSettings>
}) {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		Button,
		TableRow,
		TableRowGroup,
	} = Design
	const settings = { ...DEFAULT_SETTINGS, ...jsonStorage.use() }
	const [query, setQuery] = React.useState('')

	const guilds = React.useMemo(() => getSortedGuilds(), [])
	const selectedSet = parseGuildIds(settings.serverFilterList)

	const trimmed = query.trim().toLowerCase()
	const filtered = trimmed
		? guilds.filter(
				g => g.name.toLowerCase().includes(trimmed) || g.id.includes(trimmed),
			)
		: guilds

	return (
		<ActionSheet
			header={
				<BottomSheetTitleHeader
					title="Select Servers"
					subtitle={`${selectedSet.size} selected`}
					trailing={
						<Button
							size="sm"
							variant="secondary"
							text="Done"
							onPress={() =>
								ActionSheetActionCreators.hideActionSheet(
									SERVER_PICKER_SHEET_KEY,
								)
							}
						/>
					}
				/>
			}
		>
			<View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
				<SearchInput
					placeholder="Search servers or IDs..."
					value={query}
					onChange={setQuery}
					isClearable
					onClear={() => setQuery('')}
				/>
				<ScrollView
					style={{ maxHeight: 420 }}
					showsVerticalScrollIndicator={false}
				>
					<TableRowGroup>
						{filtered.map(guild => {
							const checked = selectedSet.has(guild.id)
							const onToggle = () => {
								jsonStorage.set({
									serverFilterList: toggleGuildInList(
										settings.serverFilterList,
										guild.id,
										guild.name,
									),
								})
							}
							return (
								<TableRow
									key={guild.id}
									label={guild.name}
									subLabel={guild.id}
									onPress={onToggle}
									trailing={<Checkbox checked={checked} onToggle={onToggle} />}
								/>
							)
						})}
					</TableRowGroup>
				</ScrollView>
			</View>
		</ActionSheet>
	)
}

export default plugin<{ jsonStorage: IrcColorsSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULT_SETTINGS,
	},

	start({ cleanup, jsonStorage, logger, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
		}

		const getSettings = (): IrcColorsSettings => ({
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
				logger.error('IRC Colors patch error', String(e))
			}
		}

		patchChatMessages(getSettings, logDebug, cleanup)
		patchMemberList(getSettings, logDebug, reportError, cleanup)

		logger.log(`IRC Colors v${formatVersion(plugin.manifest.version)} started`)
	},

	stop({ plugin }) {
		plugin.requireReload()
	},

	SettingsComponent({
		api,
	}: {
		api: PluginApi<{ jsonStorage: IrcColorsSettings }>
	}) {
		const {
			TableRowGroup,
			TableSwitchRow,
			TableRadioGroup,
			TableRadioRow,
			TableRow,
			Slider,
			Stack,
			Button,
			TextArea,
			TextInput,
			Text,
		} = Design

		const settings = { ...DEFAULT_SETTINGS, ...api.jsonStorage.use() }

		const [dragSat, setDragSat] = React.useState<number | null>(null)
		const [dragLight, setDragLight] = React.useState<number | null>(null)
		const [seedDraft, setSeedDraft] = React.useState<string>(settings.seed)
		const [filterDraft, setFilterDraft] = React.useState<string>(
			settings.serverFilterList,
		)

		React.useEffect(() => {
			setSeedDraft(settings.seed)
		}, [settings.seed])

		React.useEffect(() => {
			setFilterDraft(settings.serverFilterList)
		}, [settings.serverFilterList])

		const diceIconId = getAssetIdByName('DiceIcon')
		const magicDoorIconId = getAssetIdByName('MagicDoorIcon')

		const activeSat = Math.round(dragSat ?? settings.saturation)
		const activeLight = Math.round(dragLight ?? settings.lightness)
		const parsedServerCount = parseGuildIds(filterDraft).size

		const setSat = (val: number) => {
			const clamped = Math.max(0, Math.min(100, Math.round(val)))
			setDragSat(null)
			api.jsonStorage.set({ saturation: clamped })
		}

		const setLight = (val: number) => {
			const clamped = Math.max(0, Math.min(100, Math.round(val)))
			setDragLight(null)
			api.jsonStorage.set({ lightness: clamped })
		}

		const updateSeed = (value: string) => {
			setSeedDraft(value)
			api.jsonStorage.set({ seed: value })
		}

		const shuffleSeed = () => {
			const next = String(Math.floor(100000 + Math.random() * 900000))
			updateSeed(next)
		}

		const updateFilterList = (value: string) => {
			setFilterDraft(value)
			api.jsonStorage.set({ serverFilterList: value })
		}

		const openServerPicker = () => {
			ActionSheetActionCreators.openLazy(
				Promise.resolve({ default: ServerPickerSheet }),
				SERVER_PICKER_SHEET_KEY,
				{ jsonStorage: api.jsonStorage },
			)
		}

		return (
			<Page>
				<ScrollView showsVerticalScrollIndicator={false}>
					<Stack spacing={20}>
						<TableRowGroup title="Where to Apply">
							<TableSwitchRow
								label="Color users in DMs"
								subLabel="Give every participant a unique color in DMs and group chats."
								icon={<TableRowAssetIcon name="ForumIcon" />}
								value={settings.applyInDms}
								onValueChange={applyInDms =>
									api.jsonStorage.set({ applyInDms })
								}
							/>
							<TableSwitchRow
								label="Color users in Servers"
								subLabel="Apply unique IRC colors to usernames in server chats."
								icon={<TableRowAssetIcon name="HashmarkIcon" />}
								value={settings.applyInServers}
								onValueChange={applyInServers =>
									api.jsonStorage.set({ applyInServers })
								}
							/>
							<TableSwitchRow
								label="Member List"
								subLabel="Apply IRC colors to usernames in the member list."
								icon={<TableRowAssetIcon name="TopicsIcon" />}
								value={settings.memberListColors}
								onValueChange={memberListColors =>
									api.jsonStorage.set({ memberListColors })
								}
							/>
						</TableRowGroup>

						{settings.applyInServers && (
							<TableRadioGroup<ServerColorMode>
								title="Server Mode"
								value={settings.serverColorMode}
								onChange={serverColorMode =>
									api.jsonStorage.set({ serverColorMode })
								}
							>
								<TableRadioRow
									label="Only users without role colors"
									subLabel="Keep existing role colors and color everyone else."
									value="no-role-only"
								/>
								<TableRadioRow
									label="Color everyone in servers"
									subLabel="Override existing server role colors with IRC colors."
									value="everyone"
								/>
							</TableRadioGroup>
						)}

						{settings.applyInServers && (
							<TableRadioGroup<ServerFilterMode>
								title="Server Filter"
								value={settings.serverFilterMode}
								onChange={serverFilterMode =>
									api.jsonStorage.set({ serverFilterMode })
								}
							>
								<TableRadioRow
									label="All Servers"
									subLabel="Apply across every server you are in."
									icon={<TableRowAssetIcon name="HashmarkIcon" />}
									value="all"
								/>
								<TableRadioRow
									label="Only Included Servers"
									subLabel="Whitelist — only color servers listed below."
									icon={<TableRowAssetIcon name="PlusMediumIcon" />}
									value="include"
								/>
								<TableRadioRow
									label="Exclude Listed Servers"
									subLabel="Blacklist — skip servers listed below."
									icon={<TableRowAssetIcon name="DenyIcon" />}
									value="exclude"
								/>
							</TableRadioGroup>
						)}

						{settings.applyInServers && settings.serverFilterMode !== 'all' && (
							<TableRowGroup
								title={
									settings.serverFilterMode === 'include'
										? `Included Servers (${parsedServerCount})`
										: `Excluded Servers (${parsedServerCount})`
								}
							>
								<TableRow
									label={
										<Stack spacing={12}>
											<TextArea
												label="Server IDs (one per line)"
												description="Paste <guildId> or plain IDs, one per line. Trailing // comments are ignored."
												value={filterDraft}
												placeholder={
													'<1006631131665399858> // Cool Z0ne\n<718433475828645928>'
												}
												style={{ height: 120 }}
												onChange={updateFilterList}
											/>
											<View style={{ flexDirection: 'row', gap: 10 }}>
												<View style={{ flex: 1 }}>
													<Button
														variant="primary"
														size="md"
														icon={magicDoorIconId}
														text="Add from my Servers"
														onPress={openServerPicker}
													/>
												</View>
												<View style={{ flex: 0.45 }}>
													<Button
														variant="secondary"
														size="md"
														text="Clear"
														disabled={!filterDraft}
														onPress={() => updateFilterList('')}
													/>
												</View>
											</View>
										</Stack>
									}
								/>
							</TableRowGroup>
						)}

						<TableRadioGroup<ColorStyle>
							title="Color Style"
							value={settings.colorStyle}
							onChange={colorStyle => api.jsonStorage.set({ colorStyle })}
						>
							<TableRadioRow
								label="Normal Single Colors"
								subLabel="Classic solid IRC color per user."
								value="solid"
							/>
							<TableRadioRow
								label="Gradients"
								subLabel="Smooth multi-stop gradient derived from each user's hash."
								value="gradient"
							/>
						</TableRadioGroup>

						<TableRowGroup title="Color Tuning">
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
											<Text variant="text-md/semibold">Saturation</Text>
											<Text variant="text-md/medium" color="text-muted">
												{activeSat}%
											</Text>
										</View>
										<Slider
											minimumValue={0}
											maximumValue={100}
											step={1}
											value={activeSat}
											onValueChange={val => setDragSat(Math.round(val))}
											onSlidingComplete={setSat}
											startIcon={
												<Pressable onPress={() => setSat(activeSat - 5)}>
													<TableRowAssetIcon name="CircleMinusIcon-primary" />
												</Pressable>
											}
											endIcon={
												<Pressable onPress={() => setSat(activeSat + 5)}>
													<TableRowAssetIcon name="CirclePlusIcon-primary" />
												</Pressable>
											}
										/>

										<View
											style={{
												flexDirection: 'row',
												alignItems: 'center',
												justifyContent: 'space-between',
												paddingTop: 4,
											}}
										>
											<Text variant="text-md/semibold">Lightness</Text>
											<Text variant="text-md/medium" color="text-muted">
												{activeLight}%
											</Text>
										</View>
										<Slider
											minimumValue={0}
											maximumValue={100}
											step={1}
											value={activeLight}
											onValueChange={val => setDragLight(Math.round(val))}
											onSlidingComplete={setLight}
											startIcon={
												<Pressable onPress={() => setLight(activeLight - 5)}>
													<TableRowAssetIcon name="CircleMinusIcon-primary" />
												</Pressable>
											}
											endIcon={
												<Pressable onPress={() => setLight(activeLight + 5)}>
													<TableRowAssetIcon name="CirclePlusIcon-primary" />
												</Pressable>
											}
										/>

										<Button
											variant="secondary"
											size="md"
											text="Reset colors to default"
											disabled={
												activeSat === DEFAULT_SETTINGS.saturation &&
												activeLight === DEFAULT_SETTINGS.lightness
											}
											onPress={() => {
												setDragSat(null)
												setDragLight(null)
												api.jsonStorage.set({
													saturation: DEFAULT_SETTINGS.saturation,
													lightness: DEFAULT_SETTINGS.lightness,
												})
											}}
										/>
									</Stack>
								}
							/>
						</TableRowGroup>

						<TableRowGroup title="Seed & Shuffle">
							<TableRow
								label={
									<Stack spacing={12}>
										<TextInput
											label="Color Seed"
											description="Type literally anything — numbers, gibberish, emojis, existential dread."
											value={seedDraft}
											placeholder="Default (empty)"
											isClearable
											onClear={() => updateSeed('')}
											onChange={updateSeed}
										/>
										<View style={{ flexDirection: 'row', gap: 10 }}>
											<View style={{ flex: 1 }}>
												<Button
													variant="primary"
													size="md"
													icon={diceIconId}
													text="Shuffle Seed"
													onPress={shuffleSeed}
												/>
											</View>
											<View style={{ flex: 1 }}>
												<Button
													variant="secondary"
													size="md"
													text="Reset"
													disabled={!seedDraft}
													onPress={() => updateSeed('')}
												/>
											</View>
										</View>
									</Stack>
								}
							/>
						</TableRowGroup>

						<TableRowGroup title="Advanced">
							<TableSwitchRow
								label="Debug Logs"
								subLabel="Write diagnostic logs for troubleshooting."
								icon={<TableRowAssetIcon name="SlashBoxIcon" />}
								value={settings.debugLogs}
								onValueChange={debugLogs => api.jsonStorage.set({ debugLogs })}
							/>
						</TableRowGroup>

						<View style={{ alignItems: 'center', paddingBottom: 16 }}>
							<Text variant="text-xs/normal" color="text-muted">
								IRC Colors v{formatVersion(api.plugin.manifest.version)}
							</Text>
						</View>
					</Stack>
				</ScrollView>
			</Page>
		)
	},
})
