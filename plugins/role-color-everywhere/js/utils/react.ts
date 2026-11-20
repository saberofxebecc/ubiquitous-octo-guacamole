import { type ReactElement, type ReactNode } from 'react'
import { React } from '@valenced/react'
import { instead } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'

export type RenderHook = (result: ReactNode, args: any[], self?: any) => ReactNode

const wrappedFunctions = new WeakMap<(...args: any[]) => any, (props: any) => any>()
const createElementTargets = new WeakMap<(...args: any[]) => any, (props: any) => any>()
let unpatchCreateElement: (() => void) | null = null
let activeTargetCount = 0

function ensureCreateElementHook() {
    if (unpatchCreateElement) return
    unpatchCreateElement = instead(
        React,
        'createElement',
        (args: any[], orig: (...a: any[]) => any) => {
            const type = args[0]
            if (typeof type === 'function') {
                const wrapped = createElementTargets.get(type)
                if (wrapped) {
                    args[0] = wrapped
                }
            }
            return orig(...args)
        },
    )
}

/**
 * Patches React.memo, React.forwardRef, class components, and plain function components.
 * Function components are intercepted across both react/jsx-runtime and React.createElement.
 */
export function patchComponentRender(
    targetOrModule: any,
    keyOrHook: string | RenderHook,
    maybeHook?: RenderHook,
): () => void {
    const target = typeof keyOrHook === 'string' ? targetOrModule?.[keyOrHook] : targetOrModule
    const hook = (typeof keyOrHook === 'string' ? maybeHook : keyOrHook) as RenderHook | undefined
    if (!target || !hook) return () => { }

    // React.memo(...)
    if (typeof target === 'object' && typeof target.type === 'function') {
        return instead(target, 'type', (args: any[], orig: (...a: any[]) => ReactNode) => {
            const result = orig(...args)
            return hook(result, args)
        })
    }

    // React.forwardRef(...)
    if (typeof target === 'object' && typeof target.render === 'function') {
        return instead(target, 'render', (args: any[], orig: (...a: any[]) => ReactNode) => {
            const result = orig(...args)
            return hook(result, args)
        })
    }

    // Class component
    if (typeof target === 'function' && target.prototype?.isReactComponent) {
        return instead(
            target.prototype,
            'render',
            function (this: any, args: any[], orig: (...a: any[]) => ReactNode) {
                const result = orig.apply(this, args)
                return hook(result, [this?.props, ...args], this)
            },
        )
    }

    // Plain function component
    if (typeof target === 'function') {
        let wrapped = wrappedFunctions.get(target)
        if (!wrapped) {
            wrapped = (props: any) => {
                const res = target(props)
                return hook(res, [props])
            }
            Object.defineProperty(wrapped, 'name', {
                value: target.displayName || target.name || 'WrappedComponent',
            })
            wrappedFunctions.set(target, wrapped)
        }

        createElementTargets.set(target, wrapped)
        activeTargetCount++
        ensureCreateElementHook()

        const unpatchJsx = insteadJSX(
            target,
            ([, props, key]: [any, any, any?], jsx: (...a: any[]) => any) =>
                jsx(wrapped, props, key),
        )

        return () => {
            unpatchJsx()
            createElementTargets.delete(target)
            activeTargetCount--
            if (activeTargetCount <= 0 && unpatchCreateElement) {
                unpatchCreateElement()
                unpatchCreateElement = null
                activeTargetCount = 0
            }
        }
    }

    return () => { }
}

/**
 * Shallow, depth-bounded React element mapper to avoid full-tree O(N^2) overhead.
 */
export function mapReactElements(
    node: ReactNode,
    mapper: (el: ReactElement<any>) => ReactElement<any>,
    maxDepth = 8,
    depth = 0,
): ReactNode {
    if (depth > maxDepth) return node

    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const mapped = mapReactElements(child, mapper, maxDepth, depth)
            if (mapped !== child) changed = true
            return mapped
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node

    let current: ReactElement<any> = node
    const mappedSelf = mapper(current)
    current = mappedSelf

    const children = (current.props as any)?.children
    if (children !== undefined) {
        const mappedChildren = mapReactElements(children, mapper, maxDepth, depth + 1)
        if (mappedChildren !== children) {
            current = React.cloneElement(current, undefined, mappedChildren)
        }
    }

    return current
}

export function applyTextColor(el: ReactElement<any>, color: string): ReactElement<any> {
    const props = el.props ?? {}
    const existingStyle = props.style
    return React.cloneElement(el, {
        style: existingStyle ? [existingStyle, { color }] : { color },
    })
}

/**
 * Wraps `renderItem` on FlatList / FlashList / FastList elements within shallow depth.
 */
export function wrapListRenderItem(
    node: ReactNode,
    transformItemResult: (rendered: ReactNode, info: any) => ReactNode,
    maxDepth = 6,
): ReactNode {
    return mapReactElements(
        node,
        el => {
            const renderItem = el.props?.renderItem
            if (typeof renderItem !== 'function' || (renderItem as any).__rceWrapped) {
                return el
            }
            const wrappedRenderItem = (info: any) => {
                const row = renderItem(info)
                return transformItemResult(row, info)
            }
                ; (wrappedRenderItem as any).__rceWrapped = true
            return React.cloneElement(el, { renderItem: wrappedRenderItem })
        },
        maxDepth,
    )
}