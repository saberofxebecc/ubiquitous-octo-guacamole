import { createFilterGenerator, FilterScopes } from '@valenced/modules/finders/filters'

/**
 * Matches components by displayName, function name, or React.memo inner type name.
 */
export const withComponentName = createFilterGenerator<string[]>(
    (names, _id, exports: any) => {
        if (!exports || (typeof exports !== 'object' && typeof exports !== 'function')) return false
        const candidate =
            exports.displayName ||
            exports.name ||
            exports.type?.displayName ||
            exports.type?.name
        return typeof candidate === 'string' && names.includes(candidate)
    },
    names => `rce.component(${names.join(',')})`,
    FilterScopes.Initialized,
)