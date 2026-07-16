import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Series65Question, VocabCard } from './series65Meta';

// The Series 65 question bank, explanations, and vocabulary, fetched once from
// the team-gated server endpoint (GET /api/studies/series65/bank). The licensed
// content is never bundled into the web app — only members of the owner's team
// can load it, and the server is the enforcer. A module-level promise caches the
// fetch so the Study Game, Test Mode, and Flashcards share a single request per
// page load.

export interface Series65Bank {
  questions: Series65Question[];
  explanations: Record<number, string>;
  vocab: VocabCard[];
  // id -> question, for the starred / restored-question / subsection lookups
  // that used to index the static array.
  byId: Map<number, Series65Question>;
}

let cache: Promise<Series65Bank> | null = null;

function fetchBank(): Promise<Series65Bank> {
  if (!cache) {
    cache = api
      .series65Bank()
      .then((r) => ({
        questions: r.questions,
        explanations: r.explanations,
        vocab: r.vocab,
        byId: new Map(r.questions.map((q) => [q.id, q])),
      }));
    // Let a failed load be retried on the next mount instead of caching the error.
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export interface Series65BankState {
  bank: Series65Bank | null;
  loading: boolean;
  error: boolean;
}

export function useSeries65Bank(): Series65BankState {
  const [bank, setBank] = useState<Series65Bank | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchBank()
      .then((b) => {
        if (alive) setBank(b);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { bank, loading: bank === null && !error, error };
}
