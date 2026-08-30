import nodemailer from 'nodemailer';
import type { PublicMailer, PublicMarketProvider } from './types.js';

export class SmtpPublicMailer implements PublicMailer {
  private transport:ReturnType<typeof nodemailer.createTransport>;
  constructor(url:string,private from:string){this.transport=nodemailer.createTransport(url)}
  async sendVerification(to:string,code:string){await this.transport.sendMail({from:this.from,to,subject:'Your VTS Public Terminal verification code',text:`Your verification code is ${code}. It expires in 10 minutes.`})}
  async sendTemporaryPassword(to:string,password:string){await this.transport.sendMail({from:this.from,to,subject:'VTS Public Terminal password recovery',text:`Your temporary password is ${password}. Sign in and change it immediately.`})}

  // WHAT THE LINK SAYS MATTERS MORE HERE THAN ANYWHERE ELSE. Somebody who did
  // not ask for this must be able to tell at a glance that it is about deleting
  // their account, and must be told that ignoring it is enough — there is no
  // "cancel" to click, because the request simply expires.
  async sendDeletionLink(to:string,url:string){await this.transport.sendMail({from:this.from,to,subject:'Confirm deletion of your VTS Public Terminal account',text:`Someone asked to permanently delete the VTS Public Terminal account for this address.\n\nTo go ahead, open this link within one hour:\n${url}\n\nThis deletes your account and everything in it. It cannot be undone.\n\nIf this was not you, ignore this email. Nothing happens unless the link is opened, and the link stops working after an hour.`})}
  // Sent AFTER the account is gone, which is why it carries no link and asks
  // for nothing: there is no longer an account to act on. It exists so the
  // person has evidence the thing they asked for actually happened.
  async sendDeletionComplete(to:string){await this.transport.sendMail({from:this.from,to,subject:'Your VTS Public Terminal account has been deleted',text:'Your VTS Public Terminal account and the information in it have been deleted.\n\nThis address is no longer held in the account system. Nothing further is needed from you, and there is nothing left to undo.\n\nIf you want an account again in future, you are welcome to ask.'})}
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
