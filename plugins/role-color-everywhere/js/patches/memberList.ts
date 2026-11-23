import { React } from '@valenced/react'
import { Design } from '@valenced/discord/design'
import type { RoleColorSettings } from '../types'
import { getColorsFromRole, getGuildRoles } from '../utils/colors'
import { paintFirstDesignText } from '../utils/gradient'
import { replaceElement, transformComponent } from '../utils/react'
import { getSelectedGuildStore } from '../utils/stores'

interface UserSectionProps {
    title?: unknown
    guildId?: string
}

const HEADER_SIZE_STYLES: Record<number, { fontSize: number; lineHeight: number } | undefined> = {
    0: { fontSize: 12, lineHeight: 16 }, // Ant-Sized
    1: { fontSize: 14, lineHeight: 18 }, // Squintable
    2: undefined,                        // Stock
    3: { fontSize: 18, lineHeight: 24 }, // Big (default)
    4: { fontSize: 22, lineHeight: 28 }, // Overcompensating
}

const MEMBER_COUNT_SUFFIX = /\s*[—–-]\s*[\d\s.,\u00a0\u202f]+$/

function findRoleByHeaderTitle(guildId: string, title: string) {
    const label = title.replace(MEMBER_COUNT_SUFFIX, '').trim()
    if (!label) return undefined

    const lower = label.toLowerCase()
    let best: { name: string; colorString?: string } | undefined

    for (const role of getGuildRoles(guildId)) {
        if (!role?.colorString || !role?.name) continue
        if (role.name === label) return role

        const name = String(role.name).toLowerCase()
        if ((lower === name || lower.endsWith(` ${name}`)) && (!best || role.name.length > best.name.length)) {
            best = role
        }
    }
    return best
}

export function patchMemberList(
    getSettings: () => RoleColorSettings,
    reportError: (e: unknown) => void,
    cleanup: (...fns: (() => void)[]) => void,
) {
    cleanup(
        transformComponent<UserSectionProps>(
            'UserSectionInner',
            () => getSettings().memberList,
            (tree, { title, guildId }) => {
                if (typeof title !== 'string') return tree
                const resolvedGuildId = guildId ?? getSelectedGuildStore()?.getGuildId?.()
                if (!resolvedGuildId) return tree

                const settings = getSettings()
                const sizeStyle = HEADER_SIZE_STYLES[settings.memberListHeaderSize]
                const weightStyle = settings.memberListBoldHeaders
                    ? { fontWeight: 'bold' as const }
                    : { fontWeight: 'normal' as const }

                const styledTree = replaceElement(
                    tree,
                    el => el.type === Design?.Text,
                    text =>
                        React.cloneElement(text, {
                            style: [text.props?.style, sizeStyle, weightStyle],
                        }),
                )

                const role = findRoleByHeaderTitle(resolvedGuildId, title)
                const data = getColorsFromRole(resolvedGuildId, role, settings.skipNeutralColors)
                return data ? paintFirstDesignText(styledTree, data) : styledTree
            },
            reportError,
        ),
    )
}