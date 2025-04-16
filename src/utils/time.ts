export function dateNow(): string {
  const now = new Date();
  const date = now.toString().split(' ');
  return `[${date[2]}-${date[1]}-${date[3]} ${date[4]}]`;
}
