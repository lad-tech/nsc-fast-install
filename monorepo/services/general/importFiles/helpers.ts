export const isValidJPGMimetype = (mimetype: string) => mimetype === 'image/jpeg';
export const isValidHEICMimetype = (mimetype: string) => mimetype === 'image/heic';
export const isValidPNGMimetype = (mimetype: string) => mimetype === 'image/png';

export const checkFileSizeLessMB = (byteLength: number, megabytes: number) => {
  const allowedNumberOfBytes = megabytes * 1024 * 1024;
  return byteLength < allowedNumberOfBytes;
};
