import { type ReactElement, type ReactNode } from 'react'
import { React } from '@valenced/react'
import { instead } from '@valenced/patcher'
import { insteadJSX } from '@valenced/react/jsx-runtime'

const wrappedFunctions = new WeakMap<(...args: any[]) => any, (props: any) => any>()

export type RenderHook = (result: ReactNode, args: any[], self?: any) => ReactNode

/**
 * Patches a React component exported either as:
 * - a direct function/memo/class export (`targetOrModule` is the component itself)
 * - or a named property on a module object (`keyOrHook` is the property name).
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

    // Direct function component (e.g. module.exports = function Foo(props) {})
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
        return insteadJSX(
            target,
            ([, props, key]: [any, any, any?], jsx: (...a: any[]) => any) =>
                jsx(wrapped, props, key),
        )
    }

    return () => { }
}

export function mapReactElements(
    node: ReactNode,
    mapper: (el: ReactElement<any>) => ReactElement<any>,
): ReactNode {
    if (Array.isArray(node)) {
        let changed = false
        const next = node.map(child => {
            const mapped = mapReactElements(child, mapper)
            if (mapped !== child) changed = true
            return mapped
        })
        return changed ? next : node
    }

    if (!React.isValidElement(node)) return node

    let current: ReactElement<any> = node
    const children = (current.props as any)?.children
    if (children !== undefined) {
        const mappedChildren = mapReactElements(children, mapper)
        if (mappedChildren !== children) {
            current = React.cloneElement(current, undefined, mappedChildren)
        }
    }

    return mapper(current)
}

export function applyTextColor(el: ReactElement<any>, color: string): ReactElement<any> {
    const props = el.props ?? {}
    const existingStyle = props.style
    return React.cloneElement(el, {
        style: existingStyle ? [existingStyle, { color }] : { color },
    })
}