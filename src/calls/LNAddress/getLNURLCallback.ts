export default async function getLNURLCallback(LNADDurl: string) {
  const response = await fetch(LNADDurl, {
    method: 'GET',
  });
  if (!response.ok) {
    return Promise.reject(new Error(response.statusText));
  }
  const data = await response.json();
  return data.callback;
}
