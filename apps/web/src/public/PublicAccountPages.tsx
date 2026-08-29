import type { Theme } from '../theme/themes';
import { Icon } from '../components/Icon';

const card=(theme:Theme)=>({background:'rgba(11,26,58,.5)',border:`1px solid ${theme.navBorder}`,borderRadius:12,padding:'18px 20px'} as const);
function Header({title,subtitle}:{title:string;subtitle:string}){return <header style={{marginBottom:18}}><h2 style={{margin:0,fontSize:22,color:'#eef3ff'}}>{title}</h2><p style={{margin:'7px 0 0',color:'#9fb0d6',fontSize:12.5,lineHeight:1.55}}>{subtitle}</p></header>;}
export function PublicPlans({theme}:{theme:Theme}){
 // NOTHING IS OFFERED ON THIS SCREEN (owner instruction, 2026-08). It carried no tier
 // ladder — nothing is for sale, so naming Free/Premium/Max would price a product with
 // no billing behind it — and then went one step further and promised what Early Access
 // "gets you". A promise of future value is an offer whether or not money is named, so
 // that went too. The screen is a plain inventory: what the terminal does, and what it
 // does not. Do not put a plan, a tier, a perk or a promise back on it.
 const included=[
  ['line-chart','Market data & news','Rates, prints and prices across policy, inflation, labour, yields, FX, commodities, crypto and indices, with the economic calendar and the wire-service feeds beside them.'],
  ['candlestick-chart','Trade records & metrics','Your own trade log, scored the way a desk scores it — win rate, profit factor, held time, and breakdowns by strategy and instrument.'],
  ['notebook-pen','Trading notes','Write down what you think the market does next, before it does it, and settle it against what happened.'],
  ['layout-dashboard','Live Wall','One board you arrange yourself. Every part of the terminal can be put on it.'],
  ['piggy-bank','Finances','Budget and net worth, kept in one place and tracked over time.'],
  ['landmark','Investments','A long-term portfolio tracker — accounts, holdings, allocation, performance, dividends, contributions and projections.'],
  ['graduation-cap','Studies','Study games, flashcards, practice tests and presentations, with your progress kept as you go.'],
 ] as const;
 return <div style={{maxWidth:900,margin:'0 auto'}}>
  <Header title="What's Included" subtitle="Everything the public terminal does, and what it deliberately does not."/>
  <section style={{...card(theme),borderColor:theme.accent,marginBottom:16}}>
   <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
    <Icon name="gem" size={20} color={theme.accent}/>
    <div>
     <h3 style={{color:'#eef3ff',margin:'0 0 7px',fontSize:16}}>Nothing here is sold</h3>
     <p style={{color:'#9fb0d6',fontSize:12.5,lineHeight:1.55,margin:0}}>The terminal is in pre-release. There are no plans, no tiers and no payments anywhere in it, and no payment details are collected. Everything listed below is simply what it does.</p>
    </div>
   </div>
  </section>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>
   {included.map(([icon,name,copy])=><section key={name} style={card(theme)}><Icon name={icon} size={18} color={theme.accent}/><h3 style={{color:'#eef3ff',margin:'12px 0 7px',fontSize:14}}>{name}</h3><p style={{color:'#9fb0d6',fontSize:12.5,lineHeight:1.55,margin:0}}>{copy}</p></section>)}
  </div>
  <p style={{color:'#7f90b6',fontSize:12,lineHeight:1.6,margin:'16px 0 0'}}>Order placement, broker connections, live balances and group features are not part of the public terminal. Everything here is informational only and is not investment advice.</p>
 </div>;
}
export function PublicSettings({theme}:{theme:Theme}){return <div style={{maxWidth:820,margin:'0 auto'}}><Header title="Settings" subtitle="Public-terminal account, privacy and display settings. Private portal roles, credentials, connections and notification services are intentionally absent."/><section style={card(theme)}><div style={{display:'grid',gap:14}}><label style={{display:'flex',justifyContent:'space-between',gap:18,color:'#dfe7fa',fontSize:13}}>Public account security <span style={{color:theme.accent}}>Password + email verification</span></label><label style={{display:'flex',justifyContent:'space-between',gap:18,color:'#dfe7fa',fontSize:13}}>Remembered device <span style={{color:'#9fb0d6'}}>Up to 30 days</span></label><label style={{display:'flex',justifyContent:'space-between',gap:18,color:'#dfe7fa',fontSize:13}}>Data boundary <span style={{color:'#9fb0d6'}}>Public records only</span></label></div></section></div>;}
