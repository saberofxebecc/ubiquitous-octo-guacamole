import type { ComponentType, ElementType, FC, ReactElement, ReactNode } from 'react'
import { React, ReactJSXRuntime } from '@valenced/react'
import { instead } from '@valenced/patcher'
import { beforeJSX, insteadJSX } from '@valenced/react/jsx-runtime'

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
                if (wrapped) args[0] = wrapped
            }
            return orig(...args)
        },
    )
}

export function patchComponentRender(
    targetOrModule: any,
    keyOrHook: string | RenderHook,
    maybeHook?: RenderHook,
): () => void {
    const target = typeof keyOrHook === 'string' ? targetOrModule?.[keyOrHook] : targetOrModule
    const hook = (typeof keyOrHook === 'string' ? maybeHook : keyOrHook) as RenderHook | undefined
    if (!target || !hook) return () => { }

    if (typeof target === 'object' && typeof target.type === 'function') {
        return instead(target, 'type', (args: any[], orig: (...a: any[]) => ReactNode) => {
            const result = orig(...args)
            return hook(result, args)
        })
    }

    if (typeof target === 'object' && typeof target.render === 'function') {
        return instead(target, 'render', (args: any[], orig: (...a: any[]) => ReactNode) => {
            const result = orig(...args)
            return hook(result, args)
        })
    }

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

    if (typeof target === 'function') {
        let wrapped = wrappedFunctions.get(target)
        if (!wrapped) {
            wrapped = (props: any) => hook(target(props), [props])
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

export function componentName(type: unknown): string | undefined {
    if (typeof type === 'function') {
        return (type as any).displayName || type.name || undefined
    }
    if (typeof type !== 'object' || type === null) return undefined

    const obj = type as { displayName?: string; type?: unknown; render?: unknown }
    if (typeof obj.displayName === 'string' && obj.displayName.length > 0) {
        return obj.displayName
    }
    const inner = obj.type ?? obj.render
    return typeof inner === 'function'
        ? (inner as any).displayName || inner.name || undefined
        : componentName(inner)
}

type JSXFactory = (type: unknown, props: unknown, key?: unknown) => unknown

const waiting = new Map<string, Set<(type: ElementType) => void>>()
let unpatchJSXWaiter: (() => void) | undefined

function stopJSXWaiter() {
    if (waiting.size) return
    unpatchJSXWaiter?.()
    unpatchJSXWaiter = undefined
}

function startJSXWaiter() {
    const runtime = ReactJSXRuntime as unknown as Record<'jsx' | 'jsxs', JSXFactory>
    const hook = function (this: unknown, args: Parameters<JSXFactory>, original: JSXFactory) {
        const [type] = args
        if (typeof type !== 'string') {
            const name = componentName(type)
            const callbacks = name !== undefined ? waiting.get(name) : undefined
            if (callbacks) {
                waiting.delete(name!)
                if (!waiting.size) setTimeout(stopJSXWaiter)
                for (const cb of callbacks) cb(type as ElementType)
            }
        }
        return Reflect.apply(original, this, args)
    }
    const unpatches = [instead(runtime, 'jsx', hook), instead(runtime, 'jsxs', hook)]
    return () => {
        for (const u of unpatches) u()
    }
}

/**
 * Fires once when a component with `name` is first rendered via JSX, then unhooks jsx/jsxs.
 */
export function onComponentType(name: string, callback: (type: ElementType) => void) {
    let callbacks = waiting.get(name)
    if (!callbacks) waiting.set(name, (callbacks = new Set()))
    callbacks.add(callback)
    unpatchJSXWaiter ??= startJSXWaiter()

    return () => {
        callbacks.delete(callback)
        if (!callbacks.size) waiting.delete(name)
        if (!waiting.size) stopJSXWaiter()
    }
}

const wrappedByTransform = new WeakMap<object, WeakMap<object, ComponentType<any>>>()

export function wrapComponent<P extends object>(
    type: unknown,
    transform: (tree: ReactNode, props: P) => ReactNode,
): ComponentType<P> | undefined {
    if (typeof type !== 'function' && (typeof type !== 'object' || type === null)) return undefined

    const memoized = typeof type === 'object'
    const render = memoized ? (type as { type?: unknown }).type : type
    if (typeof render !== 'function') return undefined

    let cache = wrappedByTransform.get(transform)
    if (!cache) wrappedByTransform.set(transform, (cache = new WeakMap()))

    let Wrapped = cache.get(type as object)
    if (!Wrapped) {
        const Render = (props: P) => transform((render as FC<P>)(props) as ReactNode, props)
        Wrapped = memoized
            ? React.memo(Render, (type as { compare?: any }).compare)
            : Render
        cache.set(type as object, Wrapped)
    }
    return Wrapped
}

/**
 * Intercepts JSX elements for component `name` (even unexported internal components)
 * and transforms their rendered tree with `transform(tree, props)`.
 */
export function transformComponent<P extends object>(
    name: string,
    enabled: () => boolean,
    transform: (tree: ReactNode, props: P) => ReactNode,
    reportError: (e: unknown) => void,
) {
    let unpatch: (() => unknown) | undefined

    const safeTransform = (tree: ReactNode, props: P) => {
        try {
            return transform(tree, props)
        } catch (e) {
            reportError(e)
            return tree
        }
    }

    const stop = onComponentType(name, type => {
        unpatch = beforeJSX(
            type as any,
            ([elType, props, key]: [any, any, any?]) => {
                if (!enabled()) return [elType, props, key]
                const Wrapped = wrapComponent<P>(type, safeTransform)
                return Wrapped ? [Wrapped, props, key] : [elType, props, key]
            },
        )
    })

    return () => {
        stop()
        unpatch?.()
    }
}

export function replaceElement(
    tree: ReactNode,
    predicate: (element: ReactElement<any>) => boolean,
    replacer: (element: ReactElement<any>) => ReactNode,
): ReactNode {
    if (Array.isArray(tree)) {
        for (let i = 0; i < tree.length; i++) {
            const result = replaceElement(tree[i], predicate, replacer)
            if (result === tree[i]) continue
            const copy = tree.slice()
            copy[i] = result
            return copy
        }
        return tree
    }

    if (!React.isValidElement<{ children?: ReactNode }>(tree)) return tree
    if (predicate(tree)) return replacer(tree)

    const { children } = tree.props
    if (children == null) return tree

    const result = replaceElement(children, predicate, replacer)
    if (result === children) return tree

    return Array.isArray(result)
        ? React.cloneElement(tree, undefined, ...result)
        : React.cloneElement(tree, undefined, result)
}

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

    const current = mapper(node as ReactElement<any>)
    const children = (current.props as any)?.children
    if (children !== undefined) {
        const mappedChildren = mapReactElements(children, mapper, maxDepth, depth + 1)
        if (mappedChildren !== children) {
            return React.cloneElement(current, undefined, mappedChildren)
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