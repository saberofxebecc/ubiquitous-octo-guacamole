import { instead } from '@valenced/patcher'
import { ReactJSXRuntime } from '@valenced/react'
import type { ElementType } from 'react'

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
