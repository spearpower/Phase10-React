// The avatar pool players can choose from (files in public/avatars). Browser-safe.
export const FACE_AVATARS = Array.from({ length: 24 }, (_, i) => `f${String(i + 1).padStart(2, '0')}.svg`);
export const BADGE_AVATARS = Array.from({ length: 10 }, (_, i) => `${i + 1}.png`);
export const AVATARS = [...FACE_AVATARS, ...BADGE_AVATARS];

export const isAvatar = (photo: string) => AVATARS.includes(photo) || photo === 'na.png';
export const avatarUrl = (photo: string) => `/avatars/${isAvatar(photo) ? photo : 'na.png'}`;
