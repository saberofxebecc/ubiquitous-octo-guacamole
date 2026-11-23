import type { ComponentType, ElementType, FC, ReactElement, ReactNode } from 'react'
import { React, ReactJSXRuntime } from '@valenced/react'
import { instead } from '@valenced/patcher'
import { beforeJSX } from '@valenced/react/jsx-runtime'

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

    let cache = wrappedByTransform.get(transform)
    if (!cache) wrappedByTransform.set(transform, (cache = new WeakMap()))

    let Wrapped = cache.get(type as object)
    if (Wrapped) return Wrapped

    if (typeof type === 'function') {
        const Render = (props: P) => transform((type as FC<P>)(props) as ReactNode, props)
        Wrapped = Render
    } else {
        const obj = type as { type?: any; render?: any; compare?: any }
        if (typeof obj.type === 'function') {
            const Render = (props: P) => transform(obj.type(props) as ReactNode, props)
            Wrapped = React.memo(Render, obj.compare)
        } else if (typeof obj.render === 'function') {
            Wrapped = React.forwardRef((props: any, ref: any) =>
                transform(obj.render(props, ref) as ReactNode, props),
            ) as unknown as ComponentType<P>
        } else if (typeof obj.type === 'object' && typeof obj.type?.render === 'function') {
            const innerRender = obj.type.render
            const Forwarded = React.forwardRef((props: any, ref: any) =>
                transform(innerRender(props, ref) as ReactNode, props),
            )
            Wrapped = React.memo(Forwarded, obj.compare) as unknown as ComponentType<P>
        } else {
            return undefined
        }
    }

    cache.set(type as object, Wrapped)
    return Wrapped
}

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