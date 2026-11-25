import { instead } from '@valenced/patcher'
import { React, ReactJSXRuntime } from '@valenced/react'
import type {
	ComponentType,
	ElementType,
	FC,
	ReactElement,
	ReactNode,
} from 'react'

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
	const runtime = ReactJSXRuntime as unknown as Record<
		'jsx' | 'jsxs',
		JSXFactory
	>
	const hook = function (
		this: unknown,
		args: Parameters<JSXFactory>,
		original: JSXFactory,
	) {
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
	const unpatches = [
		instead(runtime, 'jsx', hook),
		instead(runtime, 'jsxs', hook),
	]
	return () => {
		for (const u of unpatches) u()
	}
}

export function onComponentType(
	name: string,
	callback: (type: ElementType) => void,
) {
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

const wrappedByRenderer = new WeakMap<
	object,
	WeakMap<object, ComponentType<any>>
>()

export function wrapWithRender<P extends object>(
	type: unknown,
	renderWith: (
		props: P,
		callOriginal: (nextProps: P) => ReactNode,
	) => ReactNode,
): ComponentType<P> | undefined {
	if (typeof type !== 'function' && (typeof type !== 'object' || type === null))
		return undefined

	let cache = wrappedByRenderer.get(renderWith)
	if (!cache) wrappedByRenderer.set(renderWith, (cache = new WeakMap()))

	let Wrapped = cache.get(type as object)
	if (Wrapped) return Wrapped

	if (typeof type === 'function') {
		const Render = (props: P) =>
			renderWith(props, p => (type as FC<P>)(p) as ReactNode)
		Wrapped = Render
	} else {
		const obj = type as { type?: any; render?: any; compare?: any }
		if (typeof obj.type === 'function') {
			const Render = (props: P) =>
				renderWith(props, p => obj.type(p) as ReactNode)
			Wrapped = React.memo(Render, obj.compare)
		} else if (typeof obj.render === 'function') {
			Wrapped = React.forwardRef((props: any, ref: any) =>
				renderWith(props, p => obj.render(p, ref) as ReactNode),
			) as unknown as ComponentType<P>
		} else if (
			typeof obj.type === 'object' &&
			typeof obj.type?.render === 'function'
		) {
			const innerRender = obj.type.render
			const Forwarded = React.forwardRef((props: any, ref: any) =>
				renderWith(props, p => innerRender(p, ref) as ReactNode),
			)
			Wrapped = React.memo(
				Forwarded,
				obj.compare,
			) as unknown as ComponentType<P>
		} else {
			return undefined
		}
	}

	cache.set(type as object, Wrapped)
	return Wrapped
}

function replaceFirstElementInternal(
	node: ReactNode,
	predicate: (el: ReactElement<any>) => boolean,
	replacer: (el: ReactElement<any>) => ReactElement<any>,
): { node: ReactNode; replaced: boolean } {
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const res = replaceFirstElementInternal(node[i], predicate, replacer)
			if (!res.replaced) continue
			const copy = node.slice()
			copy[i] = res.node
			return { node: copy, replaced: true }
		}
		return { node, replaced: false }
	}

	if (!React.isValidElement(node)) return { node, replaced: false }
	const el = node as ReactElement<any>
	if (predicate(el)) return { node: replacer(el), replaced: true }

	const props = (el.props ?? {}) as Record<string, any>
	if (props.label != null) {
		const res = replaceFirstElementInternal(props.label, predicate, replacer)
		if (res.replaced) {
			return {
				node: React.cloneElement(el, { label: res.node }),
				replaced: true,
			}
		}
	}

	if (props.children != null) {
		const res = replaceFirstElementInternal(props.children, predicate, replacer)
		if (res.replaced) {
			return {
				node: Array.isArray(res.node)
					? React.cloneElement(el, undefined, ...res.node)
					: React.cloneElement(el, undefined, res.node),
				replaced: true,
			}
		}
	}

	return { node, replaced: false }
}

export function replaceFirstElement(
	tree: ReactNode,
	predicate: (el: ReactElement<any>) => boolean,
	replacer: (el: ReactElement<any>) => ReactElement<any>,
): ReactNode {
	return replaceFirstElementInternal(tree, predicate, replacer).node
}
