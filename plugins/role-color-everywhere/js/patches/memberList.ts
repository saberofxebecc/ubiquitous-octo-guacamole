import type { RoleColorSettings } from '../types'
import { getColorsFromRole, getGuildRoles } from '../utils/colors'
import { paintFirstDesignText } from '../utils/gradient'
import { transformComponent } from '../utils/react'
import { getSelectedGuildStore } from '../utils/stores'

interface UserSectionProps {
    title?: unknown
    guildId?: string
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

                const role = findRoleByHeaderTitle(resolvedGuildId, title)
                const data = getColorsFromRole(resolvedGuildId, role, getSettings().skipNeutralColors)
                return data ? paintFirstDesignText(tree, data) : tree
            },
            reportError,
        ),
    )
}