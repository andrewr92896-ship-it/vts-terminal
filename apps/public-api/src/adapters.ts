import nodemailer from 'nodemailer';
import type { PublicMailer, PublicMarketProvider } from './types.js';

export class SmtpPublicMailer implements PublicMailer {
  private transport:ReturnType<typeof nodemailer.createTransport>;
  constructor(url:string,private from:string){this.transport=nodemailer.createTransport(url)}
  async sendVerification(to:string,code:string){await this.transport.sendMail({from:this.from,to,subject:'Your VTS Public Terminal verification code',text:`Your verification code is ${code}. It expires in 10 minutes.`})}
  async sendTemporaryPassword(to:string,password:string){await this.transport.sendMail({from:this.from,to,subject:'VTS Public Terminal password recovery',text:`Your temporary password is ${password}. Sign in and change it immediately.`})}
}

export class HttpPublicMarketProvider implements PublicMarketProvider {
  constructor(private baseUrl:string|undefined,private token:string|undefined){}
  private async get(path:string){
    if(!this.baseUrl) throw Object.assign(new Error('Public market data provider is not configured.'),{status:503});
    const response=await fetch(new URL(path,this.baseUrl),{headers:this.token?{Authorization:`Bearer ${this.token}`}:{}});
    if(!response.ok) throw Object.assign(new Error('Public market data provider is unavailable.'),{status:503});
    return response.json();
  }
  marketData(){return this.get('/market-data')}
  marketNews(){return this.get('/market-news')}
}
