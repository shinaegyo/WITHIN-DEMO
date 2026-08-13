/**
 * Archivo Black for the wordmark, Archivo for everything else.
 *
 * With custom fonts, weight comes from the font family itself — set
 * `fontFamily` and leave `fontWeight` off, otherwise Android may
 * synthesise a faux-bold on top of an already-bold face.
 */
export const fonts = {
  logo: 'ArchivoBlack_400Regular',
  extraBold: 'Archivo_800ExtraBold',
  bold: 'Archivo_700Bold',
  semiBold: 'Archivo_600SemiBold',
  medium: 'Archivo_500Medium',
} as const;
