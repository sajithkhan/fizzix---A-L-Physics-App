/**
 * Definition of Done: both themes. The language screen follows the phone's light/dark
 * setting and uses the design's colours for each.
 */
import * as ReactNative from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { palettes } from '@/theme/tokens';

function backgroundOf(testId: string): unknown {
  const style = ReactNative.StyleSheet.flatten(screen.getByTestId(testId).props.style);
  return style?.backgroundColor;
}

afterEach(() => jest.restoreAllMocks());

describe('language screen theme', () => {
  it('uses the light palette when the phone is in light mode', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    await renderRouter('src/app', { initialUrl: '/language' });
    await screen.findByTestId('language-screen');
    expect(backgroundOf('language-screen')).toBe(palettes.light.background);
  });

  it('uses the dark palette when the phone is in dark mode', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    await renderRouter('src/app', { initialUrl: '/language' });
    await screen.findByTestId('language-screen');
    expect(backgroundOf('language-screen')).toBe(palettes.dark.background);
  });

  it('dark and light palettes define the same tokens', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });
});
