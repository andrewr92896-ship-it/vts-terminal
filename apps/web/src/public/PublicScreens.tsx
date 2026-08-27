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
import type { PublicScreenKey,PublicWorkspaceKey } from './publicNav';

export function PublicScreen({screen,workspace,onNavigate}:{screen:PublicScreenKey;workspace:PublicWorkspaceKey;onNavigate:(screen:PublicScreenKey)=>void}){
 const theme=THEMES[workspace];const {user}=useAuth();const go=(next:string)=>onNavigate(next as PublicScreenKey);
 switch(screen){
  case'live':return <PublicLiveWall/>;case'data':return <MarketData/>;case'desk':return <TradeLog/>;
  case'funded':return <FundedScreen/>;case'deleted':return <DeletedTrades/>;case'td_trading':return <TradingTodo/>;
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
