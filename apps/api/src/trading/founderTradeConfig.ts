import { getSetting, setSetting } from '../settings/service.js';

// What travels with a Founder trade invitation — set once for EVERYONE, by a
// Founder, rather than per person.
//
// It is a group rule and belongs in a group place: two Founders disagreeing
// about whether a target is copied would mean the same invitation meant
// different things depending on who sent it, which is the fault this feature
// exists to avoid. Stored in `app_settings` like the AI prompts and the site
// wording, so it needs no table of its own and a missing row is the built-in
// default.
//
// **WHAT IS DELIBERATELY NOT CONFIGURABLE HERE.** The instrument and the
// direction are the invitation — without them there is nothing to join. And the
// SIZE is always the recipient's own and can never be made to follow the
// inviter's, which is the one rule this whole feature must not have a switch
// for. Adding either to this object would be a mistake, not a feature.

const KEY = 'founderTrades.share';

export interface FounderShareConfig {
  /** Send the inviter's initial stop with the joined order. */
  copyStopLoss: boolean;
  /** Send the inviter's take profit with the joined order. */
  copyTakeProfit: boolean;
}

// Both on: a joined trade is the same trade, at the joiner's own size. That is
// what the desk was asked for, and it is what an account with no stored row
// gets.
export const DEFAULT_SHARE_CONFIG: FounderShareConfig = {
  copyStopLoss: true,
  copyTakeProfit: true,
};

// A stored value that will not parse falls back to the defaults rather than
// throwing: this is read on the path that places an order, and a malformed
// settings row must never be what stops somebody joining a trade.
export async function getShareConfig(): Promise<FounderShareConfig> {
  const raw = await getSetting(KEY);
  if (!raw) return { ...DEFAULT_SHARE_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<FounderShareConfig>;
    return {
      copyStopLoss: parsed.copyStopLoss !== false,
      copyTakeProfit: parsed.copyTakeProfit !== false,
    };
  } catch {
    return { ...DEFAULT_SHARE_CONFIG };
  }
}

// Merged onto what is stored, so a browser on an old cached bundle posting a
// subset never turns off a level it does not know about.
export async function setShareConfig(patch: Partial<FounderShareConfig>): Promise<FounderShareConfig> {
  const current = await getShareConfig();
  const next: FounderShareConfig = {
    copyStopLoss: patch.copyStopLoss === undefined ? current.copyStopLoss : patch.copyStopLoss,
    copyTakeProfit: patch.copyTakeProfit === undefined ? current.copyTakeProfit : patch.copyTakeProfit,
  };
  await setSetting(KEY, JSON.stringify(next));
  return next;
}
