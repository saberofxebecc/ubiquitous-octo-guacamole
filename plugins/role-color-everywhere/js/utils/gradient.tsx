import type { ReactElement } from 'react'
import { React, ReactNative } from '@valenced/react'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { ColorData } from '../types'
import { withComponentName } from './filters'

let MaskedViewComp: any = null
let LinearGradientComp: any = null

// Explicit surrogate-pair + symbol ranges (Hermes-safe without \p{} property escapes)
const EMOJI_UNIT =
    '(?:[\\uD83C-\\uD83E][\\uDC00-\\uDFFF]|[\\u2600-\\u27BF])(?:\\uFE0F|\\uD83C[\\uDFFB-\\uDFFF])?'
const EMOJI_REGEX = new RegExp(`(${EMOJI_UNIT}(?:\\u200D${EMOJI_UNIT})*)`, 'g')

export function initGradientComponents(cleanup: (...fns: (() => void)[]) => void) {
    cleanup(
        getModules(
            withComponentName('MaskedView'),
            (mod: any) => {
                MaskedViewComp = mod?.default ?? mod
            },
            { max: 1 },
        ),
        getModules(
            withProps('LinearGradient', 'LinearGradientNativeComponent'),
            (mod: any) => {
                LinearGradientComp = mod?.LinearGradient ?? mod?.default ?? mod
            },
            { max: 1 },
        ),
    )
}

export function canRenderGradients(): boolean {
    return Boolean(MaskedViewComp && LinearGradientComp)
}

export function getGradientColorsArray(data: ColorData): string[] {
    return [
        data.colorStrings.primaryColor,
        data.colorStrings.secondaryColor,
        data.colorStrings.tertiaryColor,
    ].filter((c): c is string => typeof c === 'string' && c.length > 0)
}

function splitTextAndEmojis(text: string): { text: string; isEmoji: boolean }[] {
    const segments: { text: string; isEmoji: boolean }[] = []
    let lastIndex = 0
    EMOJI_REGEX.lastIndex = 0

    let match: RegExpExecArray | null = EMOJI_REGEX.exec(text)
    while (match !== null) {
        if (match.index > lastIndex) {
            segments.push({ text: text.slice(lastIndex, match.index), isEmoji: false })
        }
        segments.push({ text: match[0], isEmoji: true })
        lastIndex = match.index + match[0].length
        match = EMOJI_REGEX.exec(text)
    }

    if (lastIndex < text.length) {
        segments.push({ text: text.slice(lastIndex), isEmoji: false })
    }
    return segments
}

function renderMaskedGradientText(
    textEl: ReactElement<any>,
    colors: string[],
    key?: string,
    onLayout?: any,
): ReactElement<any> {
    const cleanProps = { ...(textEl.props ?? {}) }
    delete cleanProps.onLayout

    const maskElement = React.createElement(textEl.type, {
        ...cleanProps,
        style: [cleanProps.style, { color: '#ffffff', opacity: 1 }],
    })

    const hiddenSizer = React.createElement(textEl.type, {
        ...cleanProps,
        style: [cleanProps.style, { opacity: 0 }],
    })

    return (
        <MaskedViewComp
            key={key}
            onLayout={onLayout}
            style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center' }}
            maskElement={maskElement}
        >
            <LinearGradientComp
                colors={colors}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
            >
                {hiddenSizer}
            </LinearGradientComp>
        </MaskedViewComp>
    )
}

/**
 * Colors a <Text> ReactElement. Uses MaskedView + LinearGradient when the role
 * is a gradient (keeping Unicode emojis outside the mask), or applies `style.color` for solid roles.
 */
export function renderColoredText(
    textEl: ReactElement<any>,
    data: ColorData,
    key?: string,
): ReactElement<any> {
    const colors = data.isGradient ? getGradientColorsArray(data) : []

    if (colors.length < 2 || !MaskedViewComp || !LinearGradientComp) {
        return React.cloneElement(textEl, {
            ...(key !== undefined ? { key } : {}),
            style: [textEl.props?.style, { color: data.colorString }],
        })
    }

    const onLayout = textEl.props?.onLayout
    const rawChildren = textEl.props?.children
    const plainText =
        typeof rawChildren === 'string'
            ? rawChildren
            : Array.isArray(rawChildren) && rawChildren.every((c: any) => typeof c === 'string')
                ? rawChildren.join('')
                : null

    if (plainText) {
        const segments = splitTextAndEmojis(plainText)
        const hasEmoji = segments.some(s => s.isEmoji)
        const hasNonEmoji = segments.some(s => !s.isEmoji)

        // All emojis (no text to gradient) -> render unmodified
        if (hasEmoji && !hasNonEmoji) {
            return key !== undefined ? React.cloneElement(textEl, { key }) : textEl
        }

        if (hasEmoji && ReactNative?.View) {
            const cleanProps = { ...(textEl.props ?? {}) }
            delete cleanProps.onLayout

            return (
                <ReactNative.View
                    key={key}
                    onLayout={onLayout}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                    {segments.map((seg, idx) => {
                        const segEl = React.createElement(
                            textEl.type,
                            { ...cleanProps, key: `rce-s-${idx}` },
                            seg.text,
                        )
                        return seg.isEmoji
                            ? segEl
                            : renderMaskedGradientText(segEl, colors, `rce-m-${idx}`)
                    })}
                </ReactNative.View>
            )
        }
    }

    return renderMaskedGradientText(textEl, colors, key, onLayout)
}