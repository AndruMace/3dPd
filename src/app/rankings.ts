// Rankings persistence (PD's rankings.dat): the table lives in storage; records come from the engine.
import { Rankings, type RankingRecord, type RankingsTable } from '../engine/Rankings';
import { Storage } from '../platform/storage';

const KEY = 'rankings';

export async function loadRankings(): Promise<RankingsTable> {
  return (await Storage.get<RankingsTable>(KEY)) ?? Rankings.empty();
}

export async function submitRanking(record: RankingRecord): Promise<void> {
  const table = Rankings.insert(await loadRankings(), record);
  await Storage.set(KEY, table);
}
