import type { ReactElement } from 'react'
import { React } from '@valenced/react'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { ColorData } from '../types'
import { withComponentName } from './filters'

let MaskedViewComp: any = null
let LinearGradientComp: any = null

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

/**
 * Colors a <Text> ReactElement. Uses MaskedView + LinearGradient when the role
 * is a gradient, otherwise applies `style.color` directly.
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

    const maskElement = React.cloneElement(textEl, {
        style: [textEl.props?.style, { color: '#ffffff', opacity: 1 }],
    })

    const hiddenSizer = React.cloneElement(textEl, {
        style: [textEl.props?.style, { opacity: 0 }],
    })

    return (
        <MaskedViewComp
            key={key}
            style={{ flexDirection: 'row', alignSelf: 'flex-start' }}
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