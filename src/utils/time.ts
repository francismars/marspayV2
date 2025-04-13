export function dateNow(): string{
    let now = new Date();
    let date = now.toString().split(' ');
    return `[${date[2]}-${date[1]}-${date[3]} ${date[4]}]`
  }