import { getAssetIdByName } from '@valenced/assets'
import {
	Checkbox,
	Page,
	SearchInput,
	TableRowAssetIcon,
} from '@valenced/components'
import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { BottomSheet } from '@valenced/externals/gorhom'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { JsonStorageUpdateMode } from '@valenced/json-storage'
import { reloadApp } from '@valenced/modules/native/app'
import { formatVersion } from '@valenced/plugins/utils'
import { React } from '@valenced/react'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { Image, Pressable, ScrollView, View } from 'react-native'
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
const SEED_CHARS =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*-_+=?'

let bootSignature: string | null = null
let reloadToastTimer: ReturnType<typeof setTimeout> | undefined

function getReloadSignature(s: IrcColorsSettings): string {
	return JSON.stringify([
		s.applyInDms,
		s.applyInServers,
		s.serverColorMode,
		s.serverFilterMode,
		s.serverFilterList,
		s.memberListColors,
		s.colorStyle,
		Math.round(s.saturation),
		Math.round(s.lightness),
		s.seed,
	])
}

function generateRandomSeed(): string {
	const len = 6 + Math.floor(Math.random() * 8)
	let out = ''
	for (let i = 0; i < len; i++) {
		out += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)]
	}
	return out
}

function clearReloadToastTimer() {
	if (reloadToastTimer !== undefined) {
		clearTimeout(reloadToastTimer)
		reloadToastTimer = undefined
	}
}

function CopySeedButton({ seed }: { seed: string }) {
	const { useTooltip } = Design
	const anchorRef = React.useRef<View>(null)
	const [visible, setVisible] = React.useState(false)

	React.useEffect(() => {
		if (!visible) return
		const t = setTimeout(() => setVisible(false), 1500)
		return () => clearTimeout(t)
	}, [visible])

	useTooltip(anchorRef, {
		label: 'Copied!',
		position: 'top',
		visible,
	})

	return (
		<View ref={anchorRef} collapsable={false}>
			<Pressable
				onPress={() => {
					Clipboard.setString(seed)
					setVisible(true)
				}}
			>
				<TableRowAssetIcon name="CopyIcon" />
			</Pressable>
		</View>
	)
}

function showApplyToasts() {
	clearReloadToastTimer()

	ToastActionCreators.open('irc-colors-saved-toast', {
		text: 'Saved',
		variant: 'success',
	})

	reloadToastTimer = setTimeout(() => {
		reloadToastTimer = undefined
		const InfoIcon = lookupGeneratedIconComponent(
			'CircleInformationIcon',
			'CircleInformationIcon-secondary',
			'CircleInformationIcon-primary',
		)
		ToastActionCreators.open('irc-colors-reload-hint', {
			text: 'Reload Required',
			...(InfoIcon ? { icon: InfoIcon } : {}),
			variant: 'default',
		})
	}, 2500)
}

interface GuildEntry {
	id: string
	name: string
	iconUrl: string | null
}

function getSortedGuilds(): GuildEntry[] {
	const store = Stores.GuildStore as any
	const raw: any[] =
		store?.getGuildsArray?.() ?? Object.values(store?.getGuilds?.() ?? {})
	return raw
		.filter((g): g is { id: string; name?: string; icon?: string | null } =>
			Boolean(g?.id),
		)
		.map(g => ({
			id: String(g.id),
			name: String(g.name ?? g.id),
			iconUrl: g.icon
				? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
				: null,
		}))
		.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
		)
}

function ServerPickerSheet({
	jsonStorage,
}: {
	jsonStorage: JsonStorage<IrcColorsSettings>
}) {
	const { ActionSheet, BottomSheetTitleHeader, TableRow } = Design
	const { BottomSheetFlatList } = BottomSheet
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
			startExpanded
			scrollable
			contentHeight={540}
			header={
				<BottomSheetTitleHeader
					title="Select Servers"
					subtitle={`${selectedSet.size} selected`}
				/>
			}
		>
			<View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
				<SearchInput
					placeholder="Search servers or IDs..."
					value={query}
					onChange={setQuery}
					isClearable
					onClear={() => setQuery('')}
				/>
			</View>
			<BottomSheetFlatList
				data={filtered}
				keyExtractor={(item: GuildEntry) => item.id}
				style={{ height: 420 }}
				keyboardShouldPersistTaps="handled"
				renderItem={({ item: guild }: { item: GuildEntry }) => {
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
							label={guild.name}
							subLabel={guild.id}
							icon={
								guild.iconUrl ? (
									<Image
										source={{ uri: guild.iconUrl }}
										style={{ width: 32, height: 32, borderRadius: 16 }}
									/>
								) : (
									<TableRowAssetIcon name="HashmarkIcon" />
								)
							}
							onPress={onToggle}
							trailing={<Checkbox checked={checked} onToggle={onToggle} />}
						/>
					)
				}}
			/>
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

		bootSignature = null
		const syncBootSignature = () => {
			bootSignature = getReloadSignature(getSettings())
		}

		if (jsonStorage.loaded) {
			syncBootSignature()
		} else {
			jsonStorage.get().then(() => {
				if (bootSignature === null) syncBootSignature()
			})
		}

		cleanup(
			clearReloadToastTimer,
			jsonStorage.subscribe((_update, mode) => {
				if (mode === JsonStorageUpdateMode.Load) {
					syncBootSignature()
				}
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
				logger.error('IRC Colors patch error', String(e))
			}
		}

		patchChatMessages(getSettings, logDebug, cleanup)
		patchMemberList(jsonStorage, getSettings, logDebug, reportError, cleanup)

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
		const refreshIconId = getAssetIdByName('RefreshIcon')
		const applyIconId = getAssetIdByName('CircleCheckIcon')

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

		const needsReload =
			bootSignature !== null && getReloadSignature(settings) !== bootSignature
		const isSeedDirty = seedDraft !== settings.seed

		const applySeed = () => {
			api.jsonStorage.set({ seed: seedDraft })
			showApplyToasts()
		}

		const shuffleSeed = () => {
			setSeedDraft(generateRandomSeed())
		}

		const resetSeedDraft = () => {
			setSeedDraft('')
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
						{needsReload && (
							<TableRowGroup title="Reload Recommended">
								<TableRow
									label={
										<Stack spacing={10}>
											<Text variant="text-md/semibold">
												Reload Discord to apply to open chats
											</Text>
											<Text variant="text-sm/normal" color="text-muted">
												Already-loaded messages keep cached colors until reload.
												Your saved settings are preserved.
											</Text>
											<Button
												variant={'experimental_premium-primary' as any}
												size="md"
												icon={refreshIconId}
												text="Reload Discord"
												onPress={reloadApp}
											/>
										</Stack>
									}
								/>
							</TableRowGroup>
						)}

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
											trailingIcon={
												settings.seed
													? () => <CopySeedButton seed={settings.seed} />
													: undefined
											}
											onClear={() => setSeedDraft('')}
											onChange={setSeedDraft}
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
													onPress={resetSeedDraft}
												/>
											</View>
										</View>
										<Button
											variant="expressive"
											size="md"
											icon={applyIconId}
											text="Apply Seed"
											disabled={!isSeedDirty}
											onPress={applySeed}
										/>
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
