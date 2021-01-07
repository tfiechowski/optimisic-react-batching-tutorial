export const DEFAULT_PHOTOS = new Array(9).fill(0).map((_, index) => ({
  id: String(index + 1),
  src: `${process.env.PUBLIC_URL}/images/${index + 1}.jpeg`,
  liked: false,
}));
