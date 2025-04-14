export interface LNURLP {
  id: string;
  lnurlp: string;
  description: string;
  min: number;
  mode?: string;
  payments?: [Payment]
}

export interface Payment {
  amount:number, 
  note:string | null
}