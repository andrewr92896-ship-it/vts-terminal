// Single source of truth for the app version and the patch notes shown in the
// help hub. Bump APP_VERSION and prepend a PATCH_NOTES entry on every deploy
// (for example Alpha V 1.0 -> Alpha V 1.1). The top-bar version pill and the
// hub's Patch Notes tab both read from here, so they never drift apart.

export interface PatchNote {
  version: string;
  date: string;
  notes: string[];
}

export const APP_VERSION = 'Alpha V 1.4';

export const PATCH_NOTES: PatchNote[] = [
  {
    version: 'Alpha V 1.4',
    date: 'June 24, 2026',
    notes: [
      'Chat: delete your own messages. Admins can remove any message.',
    ],
  },
  {
    version: 'Alpha V 1.3',
    date: 'June 24, 2026',
    notes: [
      'The corner help and chat button now shows a dot when there are new chat messages or announcements since you last opened it.',
    ],
  },
  {
    version: 'Alpha V 1.2',
    date: 'June 24, 2026',
    notes: [
      'Chat: scrolling up to read older messages is no longer interrupted when new messages arrive.',
      'Chat: message order is now stable, and the message box stops you at the length limit instead of erroring.',
    ],
  },
  {
    version: 'Alpha V 1.1',
    date: 'June 24, 2026',
    notes: [
      'New help and chat hub in the corner: a trading desk chat, a website chat for everyone, patch notes, and announcements.',
      'Install the portal to your phone home screen (PWA), and pick a trade alert sound that plays on a new TradingView alert.',
      'Connect your own broker API from Account Settings, with forex pip math on the Live Wall: pips, money per pip, and risk and reward to your stop and target.',
      'Added a one-click read-only demo with simulated data and a guided tour.',
    ],
  },
  {
    version: 'Alpha V 1.0',
    date: 'Initial release',
    notes: [
      'VTS Portal: Trading, Kia Sales, Wealth Management, Personal Finance, Series 65 Studies, and a shared To-Do list.',
      'The Ask Claude assistant is available on every screen.',
    ],
  },
];
