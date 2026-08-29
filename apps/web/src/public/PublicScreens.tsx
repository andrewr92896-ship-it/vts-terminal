import { MarketData } from '../workspaces/trading/MarketData';
import { TradeLog } from '../workspaces/trading/TradeLog';
import { FundedScreen } from '../workspaces/trading/FundedScreen';
import { DeletedTrades } from '../workspaces/trading/DeletedTrades';
import { TradingTodo } from '../workspaces/trading/TradingTodo';
import { MarketNews } from '../workspaces/trading/MarketNews';
import { GeneralNews } from '../workspaces/news/GeneralNews';
import { StudyCreation } from '../workspaces/studies/StudyCreation';
import { StudyLibrary } from '../workspaces/studies/StudyLibrary';
import { StudyGameHub } from '../workspaces/studies/StudyGameHub';
import { FlashcardsHub } from '../workspaces/studies/FlashcardsHub';
import { StudyGuidesLibrary } from '../workspaces/studies/StudyGuides';
import { HelpHowTo,HelpAnnouncements,HelpPatchNotes,HelpBugReport,HelpSuggestion } from '../workspaces/help/HelpScreens';
import { HelpRules,HelpTerms,HelpPrivacy } from '../workspaces/help/LegalScreens';
import { Preferences } from '../workspaces/myportal/Preferences';
import { NetWorthScreen } from '../workspaces/myportal/NetWorth';
import { BudgetScreen } from '../workspaces/finances/Budget';
import { InvestmentsWorkspace } from '../workspaces/investments';
import { THEMES } from '../theme/themes';
import { useAuth } from '../auth/AuthContext';
import { PublicLiveWall } from './PublicLiveWall';
import { PublicPlans,PublicSettings } from './PublicAccountPages';
import { PublicPredictions } from './PublicPredictions';
import type { PublicScreenKey,PublicWorkspaceKey } from './publicNav';

// Compliance notes for the screens whose own component does not already carry one.
// Market Data, Market News, Trading Notes and every Investments screen state their own
// (grep "not investment advice"), so they are deliberately absent here — a second copy
// under the first reads as boilerplate and gets skipped, which is how a disclaimer stops
// working. What IS here is the results-bearing set: a win rate and a profit factor on a
// public showcase read as a track record unless something says otherwise.
const SCREEN_NOTE:Partial<Record<PublicScreenKey,string>>={
 live:'Figures are calculated from records kept in this terminal — sample records in the demo. They are not verified against any broker, are not a track record, and are not proof of past or future performance. Informational only, not investment advice.',
 desk:'Figures are calculated from records kept in this terminal — sample records in the demo. They are not verified against any broker, are not a track record, and are not proof of past or future performance. Informational only, not investment advice.',
 funded:'Hand-kept records, entered by their owner and not verified against any broker or funding firm. Not a track record and not proof of performance. Informational only, not investment advice.',
 deleted:'Removed records, kept so they can be restored. Not a track record and not proof of performance. Informational only, not investment advice.',
 fin_networth:'A record of figures you enter yourself. Informational only — not financial, investment, tax or legal advice.',
 fin_budget:'A record of figures you enter yourself. Informational only — not financial, investment, tax or legal advice.',
 news_world:'Headlines are reproduced from wire services for information only. No read-through to any market or instrument is stated or implied.',
 news_politics:'Headlines are reproduced from wire services for information only. No read-through to any market or instrument is stated or implied.',
};
function ScreenNote({screen}:{screen:PublicScreenKey}){
 const note=SCREEN_NOTE[screen];if(!note)return null;
 return <p style={{margin:'18px auto 0',maxWidth:1180,fontSize:11.5,lineHeight:1.6,color:'#8fa0c9',fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace'}}>{note}</p>;
}

export function PublicScreen({screen,workspace,onNavigate}:{screen:PublicScreenKey;workspace:PublicWorkspaceKey;onNavigate:(screen:PublicScreenKey)=>void}){
 return <>{renderPublicScreen({screen,workspace,onNavigate})}<ScreenNote screen={screen}/></>;
}

function renderPublicScreen({screen,workspace,onNavigate}:{screen:PublicScreenKey;workspace:PublicWorkspaceKey;onNavigate:(screen:PublicScreenKey)=>void}){
 const theme=THEMES[workspace];const {user}=useAuth();const go=(next:string)=>onNavigate(next as PublicScreenKey);
 switch(screen){
  case'live':return <PublicLiveWall/>;case'data':return <MarketData/>;case'desk':return <TradeLog/>;
  case'funded':return <FundedScreen/>;case'deleted':return <DeletedTrades/>;case'notes':return <PublicPredictions theme={theme}/>;case'td_trading':return <TradingTodo/>;
  case'my_access':return <PublicPlans theme={theme}/>;case'my_rules':case'hp_rules':return <HelpRules theme={theme}/>;
  case'my_prefs':return <Preferences theme={theme}/>;case'my_settings':return <PublicSettings theme={theme}/>;
  case'fin_networth':return <NetWorthScreen onNavigate={go}/>;case'fin_budget':return <BudgetScreen onNavigate={go}/>;
  case'news':return <MarketNews/>;case'news_world':return <GeneralNews topic="world"/>;case'news_politics':return <GeneralNews topic="politics"/>;
  case'st_decks':return <StudyCreation theme={theme} onNavigate={go}/>;case'st_packages':return <StudyLibrary theme={theme} onNavigate={go}/>;
  case'st_game':return <StudyGameHub theme={theme} target="play" onNavigate={go}/>;case'st_cards':return <FlashcardsHub theme={theme} onNavigate={go}/>;
  case'st_test':return <StudyGameHub theme={theme} target="test" onNavigate={go}/>;case'st_guides':return <StudyGuidesLibrary theme={theme} onNavigate={go}/>;
  case'st_progress':return <StudyGameHub theme={theme} target="progress" onNavigate={go}/>;
  case'hp_howto':return <HelpHowTo theme={theme}/>;case'hp_news':return <HelpAnnouncements theme={theme} user={user!}/>;
  case'hp_notes':return <HelpPatchNotes theme={theme}/>;case'hp_bug':return <HelpBugReport theme={theme} user={user!}/>;
  case'hp_suggest':return <HelpSuggestion theme={theme} user={user!}/>;case'hp_terms':return <HelpTerms theme={theme}/>;
  case'hp_privacy':return <HelpPrivacy theme={theme}/>;
  default:if(screen.startsWith('inv_'))return <InvestmentsWorkspace screen={screen} onNavigate={go}/>;return <PublicLiveWall/>;
 }
}
