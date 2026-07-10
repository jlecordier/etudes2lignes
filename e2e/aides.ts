/** PNG transparent de 1×1 pixel : suffisant pour tester l'import sans fixture lourde. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

export function fichierPng(nom: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name: nom, mimeType: 'image/png', buffer: PNG_1X1 };
}
